import { app, BrowserWindow, Tray, nativeImage, screen, powerMonitor } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setupIPC } from './ipc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let tray: Tray | null = null
let panel: BrowserWindow | null = null
// Timestamp of last blur-close; avoids re-opening on the same tray click that closes
let lastBlurTime = 0

function makeTrayIcon(): Electron.NativeImage {
  // 16×16 BGRA bitmap — all-black pixels, full alpha → macOS inverts for dark bar
  const size = 16
  const buf = Buffer.alloc(size * size * 4, 0)
  for (let i = 0; i < size * size; i++) buf[i * 4 + 3] = 255
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size })
  img.setTemplateImage(true)
  return img
}

function createPanel(): void {
  panel = new BrowserWindow({
    width: 340,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    panel.loadURL(VITE_DEV_SERVER_URL)
    // Show panel immediately in dev mode for easy iteration
    panel.once('ready-to-show', () => {
      panel?.show()
      panel?.webContents.openDevTools({ mode: 'detach' })
    })
  } else {
    panel.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  panel.on('blur', () => {
    lastBlurTime = Date.now()
    panel?.hide()
  })

  // ESC closes panel
  panel.webContents.on('before-input-event', (_ev, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') panel?.hide()
  })
}

function showPanel(): void {
  if (!panel || !tray) return

  const trayBounds = tray.getBounds()
  const { width: pw } = panel.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const db = display.bounds

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - pw / 2)
  const y = trayBounds.y + trayBounds.height + 4

  // Clamp to display
  if (x + pw > db.x + db.width) x = db.x + db.width - pw
  if (x < db.x) x = db.x

  panel.setPosition(x, y, false)
  panel.show()
  panel.focus()

  // Let renderer know it just became visible so it can re-fetch
  panel.webContents.send('panel:shown')
}

function togglePanel(): void {
  if (!panel) return
  // If we hid via blur in the last 200 ms the click was on the tray icon that
  // caused the blur — don't reopen immediately.
  if (Date.now() - lastBlurTime < 200) return
  panel.isVisible() ? panel.hide() : showPanel()
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()

  tray = new Tray(makeTrayIcon())
  tray.setToolTip('Canvas Dashboard')
  tray.on('click', togglePanel)

  createPanel()

  if (panel) setupIPC(panel)

  // Re-sync on wake from sleep
  powerMonitor.on('resume', () => {
    panel?.webContents.send('sync:trigger-from-main')
    panel?.webContents.send('panel:shown')
  })

  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })
})

// Keep alive in menu bar — do not quit when all windows are closed
app.on('window-all-closed', () => { /* intentionally empty */ })
