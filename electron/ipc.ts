import { ipcMain, BrowserWindow, shell } from 'electron'
import Store from 'electron-store'
import { fetchAssignments } from './sync'
import type { Assignment, Settings, SyncState } from '../src/shared/types'

const store = new Store<{ settings: Settings }>({
  defaults: {
    settings: {
      canvasIcalUrl: '',
      syncIntervalMinutes: 30,
      lookaheadDays: 14,
    },
  },
})

let assignments: Assignment[] = []
let syncState: SyncState = { status: 'idle', lastSyncAt: null }
let syncTimer: ReturnType<typeof setInterval> | null = null

function getSettings(): Settings {
  return store.get('settings')
}

async function runSync(win: BrowserWindow): Promise<void> {
  const settings = getSettings()
  if (!settings.canvasIcalUrl) return

  syncState = { status: 'syncing', lastSyncAt: syncState.lastSyncAt }
  win.webContents.send('sync:status', syncState)

  try {
    assignments = await fetchAssignments(settings.canvasIcalUrl)
    syncState = { status: 'idle', lastSyncAt: new Date().toISOString() }
    win.webContents.send('assignments:data', assignments)
    win.webContents.send('sync:status', syncState)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    syncState = { status: 'error', lastSyncAt: syncState.lastSyncAt, error: msg }
    win.webContents.send('sync:status', syncState)
  }
}

function startSyncTimer(win: BrowserWindow): void {
  if (syncTimer) clearInterval(syncTimer)
  const intervalMs = getSettings().syncIntervalMinutes * 60 * 1000
  syncTimer = setInterval(() => runSync(win), intervalMs)
}

export function setupIPC(win: BrowserWindow): void {
  ipcMain.handle('assignments:get', () => assignments)
  ipcMain.handle('sync:status:get', () => syncState)

  ipcMain.on('sync:trigger', () => runSync(win))

  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:set', async (_event, patch: Partial<Settings>) => {
    const current = getSettings()
    const updated: Settings = { ...current, ...patch }
    store.set('settings', updated)
    // Restart timer if interval changed; re-sync if URL changed
    if (patch.syncIntervalMinutes !== undefined) startSyncTimer(win)
    if (patch.canvasIcalUrl !== undefined && patch.canvasIcalUrl !== current.canvasIcalUrl) {
      await runSync(win)
    }
    return updated
  })

  ipcMain.on('open-external', (_event, url: string) => {
    if (url.startsWith('https://')) shell.openExternal(url)
  })

  // Initial sync + periodic timer
  runSync(win)
  startSyncTimer(win)
}
