import { ipcMain, BrowserWindow, shell, app } from 'electron'
import Store from 'electron-store'
import { syncAll } from './sync'
import { saveToken, deleteToken, hasToken, validateToken } from './canvasApi'
import { checkAndFireNotifications, requestNotificationPermission } from './notifications'
import type { Assignment, Course, PersonalTask, Settings, SyncState } from '../src/shared/types'

interface StoreSchema {
  settings: Settings
  courses: Course[]
  completedIds: string[]
  personalTasks: PersonalTask[]
}

const SETTINGS_DEFAULTS: Settings = {
  canvasBaseUrl: 'https://canvas.uw.edu',
  canvasIcalUrl: '',
  canvasSessionCookie: '',
  syncIntervalMinutes: 30,
  lookaheadDays: 14,
  notificationLeadTimes: [1440, 120, 30],  // 24 h, 2 h, 30 min
  onboardingComplete: false,
}

// Initialized inside setupIPC (after app.ready) so app.getPath() is available
let store: Store<StoreSchema>

let assignments: Assignment[] = []
let syncState: SyncState = { status: 'idle', lastSyncAt: null }
let syncTimer: ReturnType<typeof setInterval> | null = null

function getSettings(): Settings {
  return { ...SETTINGS_DEFAULTS, ...store.get('settings') }
}

export function isOnboarded(): boolean {
  return getSettings().onboardingComplete
}

export interface SetupIPCCallbacks {
  showPanel: () => void
  closeOnboarding: () => void
  onBadgeUpdate: (overdue: number, today: number) => void
}

async function runSync(win: BrowserWindow, callbacks: SetupIPCCallbacks): Promise<void> {
  const settings = getSettings()
  if (!hasToken() && !settings.canvasSessionCookie && !settings.canvasIcalUrl) return

  const prevLastSync = syncState.lastSyncAt

  syncState = { status: 'syncing', lastSyncAt: syncState.lastSyncAt }
  win.webContents.send('sync:status', syncState)

  try {
    const storedCourses = store.get('courses') as Course[]
    const result = await syncAll(
      settings.canvasBaseUrl,
      settings.canvasIcalUrl,
      settings.canvasSessionCookie,
      settings.lookaheadDays,
      storedCourses,
    )

    assignments = result.assignments
    if (result.courses.length > 0) store.set('courses', result.courses)

    syncState = { status: 'idle', lastSyncAt: new Date().toISOString() }
    win.webContents.send('assignments:data', assignments)
    win.webContents.send('sync:status', syncState)
    win.webContents.send('courses:data', store.get('courses'))

    checkAndFireNotifications(assignments, settings.notificationLeadTimes, prevLastSync)

    // Compute badge counts for tray icon
    const now = new Date()
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    const overdueCount = assignments.filter(a => a.isOverdue).length
    const todayCount = assignments.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d >= now && d <= todayEnd
    }).length
    callbacks.onBadgeUpdate(overdueCount, todayCount)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    syncState = { status: 'error', lastSyncAt: syncState.lastSyncAt, error: msg }
    win.webContents.send('sync:status', syncState)
  }
}

function startSyncTimer(win: BrowserWindow, callbacks: SetupIPCCallbacks): void {
  if (syncTimer) clearInterval(syncTimer)
  const intervalMs = getSettings().syncIntervalMinutes * 60_000
  syncTimer = setInterval(() => runSync(win, callbacks), intervalMs)
}

export interface SetupIPCResult {
  triggerSync: () => void
  isOnboardingComplete: boolean
}

export function setupIPC(
  win: BrowserWindow,
  callbacks: SetupIPCCallbacks,
): SetupIPCResult {
  // Store is created here (not at module level) so app.getPath() is available
  store = new Store<StoreSchema>({ name: "app-store", 
    cwd: app.getPath('userData'),
    defaults: {
      settings: SETTINGS_DEFAULTS,
      courses: [],
      completedIds: [],
      personalTasks: [],
    },
  })

  // ── Assignments & sync ────────────────────────────────────────────────────
  ipcMain.handle('assignments:get', () => assignments)
  ipcMain.handle('sync:status:get', () => syncState)
  ipcMain.on('sync:trigger', () => runSync(win, callbacks))

  ipcMain.handle('sync:run-and-wait', async () => {
    await runSync(win, callbacks)
    return { count: assignments.length, error: syncState.error }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:set', async (_event, patch: Partial<Settings>) => {
    const current = getSettings()
    const updated: Settings = { ...current, ...patch }
    store.set('settings', updated)
    if (patch.syncIntervalMinutes !== undefined) startSyncTimer(win, callbacks)
    const urlChanged =
      (patch.canvasIcalUrl !== undefined && patch.canvasIcalUrl !== current.canvasIcalUrl) ||
      (patch.canvasBaseUrl !== undefined && patch.canvasBaseUrl !== current.canvasBaseUrl) ||
      (patch.canvasSessionCookie !== undefined && patch.canvasSessionCookie !== current.canvasSessionCookie)
    if (urlChanged) await runSync(win, callbacks)
    return updated
  })

  ipcMain.on('open-external', (_event, url: string) => {
    if (url.startsWith('https://')) shell.openExternal(url)
  })

  // ── Token management ──────────────────────────────────────────────────────
  ipcMain.handle('token:save', (_event, token: string) => { saveToken(token); return true })
  ipcMain.handle('token:check', () => hasToken())
  ipcMain.handle('token:delete', () => { deleteToken(); return true })
  ipcMain.handle('token:validate', (_event, baseUrl: string, token: string) =>
    validateToken(baseUrl, token),
  )

  // ── Courses ───────────────────────────────────────────────────────────────
  ipcMain.handle('courses:get', () => store.get('courses') as Course[])
  ipcMain.handle('courses:save', (_event, courses: Course[]) => {
    store.set('courses', courses)
    return courses
  })

  // ── Completed IDs ─────────────────────────────────────────────────────────
  ipcMain.handle('completed:get', () => store.get('completedIds') as string[])
  ipcMain.handle('completed:toggle', (_event, id: string) => {
    const ids = store.get('completedIds') as string[]
    const updated = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    store.set('completedIds', updated)
    return updated
  })

  // ── Personal tasks ────────────────────────────────────────────────────────
  ipcMain.handle('tasks:get', () => store.get('personalTasks') as PersonalTask[])
  ipcMain.handle('tasks:save', (_event, tasks: PersonalTask[]) => {
    store.set('personalTasks', tasks)
    return tasks
  })

  // ── Notifications ─────────────────────────────────────────────────────────
  ipcMain.handle('notifications:request', () => { requestNotificationPermission(); return true })

  // ── Onboarding ────────────────────────────────────────────────────────────
  ipcMain.handle('onboarding:complete', async () => {
    const current = getSettings()
    store.set('settings', { ...current, onboardingComplete: true })
    callbacks.closeOnboarding()
    callbacks.showPanel()
    await runSync(win, callbacks)
    startSyncTimer(win, callbacks)
    return true
  })

  const isOnboardingComplete = getSettings().onboardingComplete

  if (isOnboardingComplete) {
    runSync(win, callbacks)
    startSyncTimer(win, callbacks)
  }

  return {
    triggerSync: () => runSync(win, callbacks),
    isOnboardingComplete,
  }
}
