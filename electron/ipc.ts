import { ipcMain, BrowserWindow, shell } from 'electron'
import Store from 'electron-store'
import { syncAll } from './sync'
import { saveToken, deleteToken, hasToken, validateToken } from './canvasApi'
import { checkAndFireNotifications, requestNotificationPermission } from './notifications'
import type { Assignment, Course, Settings, SyncState } from '../src/shared/types'

interface StoreSchema {
  settings: Settings
  courses: Course[]
}

const SETTINGS_DEFAULTS: Settings = {
  canvasBaseUrl: 'https://canvas.uw.edu',
  canvasIcalUrl: '',
  syncIntervalMinutes: 30,
  lookaheadDays: 14,
  notificationLeadTimes: [1440, 120, 30],  // 24 h, 2 h, 30 min
  onboardingComplete: false,
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: SETTINGS_DEFAULTS,
    courses: [],
  },
})

let assignments: Assignment[] = []
let syncState: SyncState = { status: 'idle', lastSyncAt: null }
let syncTimer: ReturnType<typeof setInterval> | null = null

// Spread over defaults so Phase-1 stores missing the new fields get them filled in
function getSettings(): Settings {
  return { ...SETTINGS_DEFAULTS, ...store.get('settings') }
}

export function isOnboarded(): boolean {
  return getSettings().onboardingComplete
}

async function runSync(win: BrowserWindow): Promise<void> {
  const settings = getSettings()
  if (!hasToken() && !settings.canvasIcalUrl) return

  const prevLastSync = syncState.lastSyncAt

  syncState = { status: 'syncing', lastSyncAt: syncState.lastSyncAt }
  win.webContents.send('sync:status', syncState)

  try {
    const storedCourses = store.get('courses') as Course[]
    const result = await syncAll(
      settings.canvasBaseUrl,
      settings.canvasIcalUrl,
      settings.lookaheadDays,
      storedCourses,
    )

    assignments = result.assignments
    // Persist updated course list (colors, hidden flags may have been merged in)
    if (result.courses.length > 0) store.set('courses', result.courses)

    syncState = { status: 'idle', lastSyncAt: new Date().toISOString() }
    win.webContents.send('assignments:data', assignments)
    win.webContents.send('sync:status', syncState)
    win.webContents.send('courses:data', store.get('courses'))

    checkAndFireNotifications(assignments, settings.notificationLeadTimes, prevLastSync)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    syncState = { status: 'error', lastSyncAt: syncState.lastSyncAt, error: msg }
    win.webContents.send('sync:status', syncState)
  }
}

function startSyncTimer(win: BrowserWindow): void {
  if (syncTimer) clearInterval(syncTimer)
  const intervalMs = getSettings().syncIntervalMinutes * 60_000
  syncTimer = setInterval(() => runSync(win), intervalMs)
}

export interface SetupIPCResult {
  triggerSync: () => void
  isOnboardingComplete: boolean
}

export function setupIPC(
  win: BrowserWindow,
  callbacks: { showPanel: () => void; closeOnboarding: () => void },
): SetupIPCResult {
  // ── Assignments & sync ────────────────────────────────────────────────────
  ipcMain.handle('assignments:get', () => assignments)
  ipcMain.handle('sync:status:get', () => syncState)
  ipcMain.on('sync:trigger', () => runSync(win))

  // sync:run-and-wait — used by onboarding step 5 to block until sync finishes
  ipcMain.handle('sync:run-and-wait', async () => {
    await runSync(win)
    return { count: assignments.length, error: syncState.error }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:set', async (_event, patch: Partial<Settings>) => {
    const current = getSettings()
    const updated: Settings = { ...current, ...patch }
    store.set('settings', updated)
    if (patch.syncIntervalMinutes !== undefined) startSyncTimer(win)
    const urlChanged =
      (patch.canvasIcalUrl !== undefined && patch.canvasIcalUrl !== current.canvasIcalUrl) ||
      (patch.canvasBaseUrl !== undefined && patch.canvasBaseUrl !== current.canvasBaseUrl)
    if (urlChanged) await runSync(win)
    return updated
  })

  ipcMain.on('open-external', (_event, url: string) => {
    if (url.startsWith('https://')) shell.openExternal(url)
  })

  // ── Token management (safeStorage-backed) ────────────────────────────────
  ipcMain.handle('token:save', (_event, token: string) => {
    saveToken(token)
    return true
  })

  ipcMain.handle('token:check', () => hasToken())

  ipcMain.handle('token:delete', () => {
    deleteToken()
    return true
  })

  // Validates a token against the Canvas API without saving it yet
  ipcMain.handle('token:validate', (_event, baseUrl: string, token: string) =>
    validateToken(baseUrl, token),
  )

  // ── Courses ───────────────────────────────────────────────────────────────
  ipcMain.handle('courses:get', () => store.get('courses') as Course[])

  ipcMain.handle('courses:save', (_event, courses: Course[]) => {
    store.set('courses', courses)
    return courses
  })

  // ── Notifications ─────────────────────────────────────────────────────────
  ipcMain.handle('notifications:request', () => {
    requestNotificationPermission()
    return true
  })

  // ── Onboarding ────────────────────────────────────────────────────────────
  ipcMain.handle('onboarding:complete', async () => {
    const current = getSettings()
    store.set('settings', { ...current, onboardingComplete: true })
    callbacks.closeOnboarding()
    callbacks.showPanel()
    await runSync(win)
    startSyncTimer(win)
    return true
  })

  const isOnboardingComplete = getSettings().onboardingComplete

  // If already onboarded from a previous run, kick off sync immediately
  if (isOnboardingComplete) {
    runSync(win)
    startSyncTimer(win)
  }

  return {
    triggerSync: () => runSync(win),
    isOnboardingComplete,
  }
}
