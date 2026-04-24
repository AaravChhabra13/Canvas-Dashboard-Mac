import { app, BrowserWindow, Tray, nativeImage, nativeTheme, screen, powerMonitor } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setupIPC, isOnboarded } from './ipc'

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
let onboardingWin: BrowserWindow | null = null
let lastBlurTime = 0
let currentOverdue = 0
let currentToday = 0

// ── Tray icon ─────────────────────────────────────────────────────────────────

function makeTrayIcon(overdue = 0, today = 0): Electron.NativeImage {
  const size = 16
  const total = overdue + today
  const buf = Buffer.alloc(size * size * 4, 0)

  if (total === 0) {
    // Plain template image: all-black pixels, auto-inverts for dark menu bar
    for (let i = 0; i < size * size; i++) buf[i * 4 + 3] = 255
    const img = nativeImage.createFromBitmap(buf, { width: size, height: size })
    img.setTemplateImage(true)
    return img
  }

  // Base icon: black or white depending on menu bar appearance
  const luma = nativeTheme.shouldUseDarkColors ? 255 : 0
  for (let y = 3; y < size; y++) {
    for (let x = 0; x < 11; x++) {
      const idx = (y * size + x) * 4
      // BGRA
      buf[idx] = luma; buf[idx + 1] = luma; buf[idx + 2] = luma; buf[idx + 3] = 220
    }
  }

  // Colored badge circle in top-right corner
  // #ef4444 (red) BGRA: 68,68,239,255 — #f97316 (orange) BGRA: 22,115,249,255
  const [bv, gv, rv] = overdue > 0 ? [68, 68, 239] : [22, 115, 249]
  const cx = 12, cy = 4, r = 3.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r) {
        const idx = (y * size + x) * 4
        buf[idx] = bv; buf[idx + 1] = gv; buf[idx + 2] = rv; buf[idx + 3] = 255
      }
    }
  }

  const img = nativeImage.createFromBitmap(buf, { width: size, height: size })
  img.setTemplateImage(false)
  return img
}

function updateTrayIcon(): void {
  if (tray) tray.setImage(makeTrayIcon(currentOverdue, currentToday))
}

// ── Windows ───────────────────────────────────────────────────────────────────

function createPanel(): void {
  panel = new BrowserWindow({
    width: 340,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    panel.loadURL(VITE_DEV_SERVER_URL)
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

  panel.webContents.on('before-input-event', (_ev, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') panel?.hide()
  })
}

function createOnboardingWindow(): void {
  onboardingWin = new BrowserWindow({
    width: 560,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    onboardingWin.loadURL(VITE_DEV_SERVER_URL + '#onboarding')
    onboardingWin.once('ready-to-show', () => {
      onboardingWin?.show()
      onboardingWin?.center()
    })
  } else {
    onboardingWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'onboarding' })
    onboardingWin.once('ready-to-show', () => {
      onboardingWin?.show()
      onboardingWin?.center()
    })
  }

  onboardingWin.on('closed', () => { onboardingWin = null })
}

// ── Panel positioning ─────────────────────────────────────────────────────────

function showPanel(): void {
  if (!panel || !tray) return

  const trayBounds = tray.getBounds()
  const { width: pw } = panel.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const db = display.bounds

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - pw / 2)
  const y = trayBounds.y + trayBounds.height + 4

  if (x + pw > db.x + db.width) x = db.x + db.width - pw
  if (x < db.x) x = db.x

  panel.setPosition(x, y, false)
  panel.show()
  panel.focus()
  panel.webContents.send('panel:shown')
}

function togglePanel(): void {
  if (!panel) return
  if (Date.now() - lastBlurTime < 200) return
  panel.isVisible() ? panel.hide() : showPanel()
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()

  tray = new Tray(makeTrayIcon())
  tray.setToolTip('Canvas Dashboard')
  tray.on('click', togglePanel)

  // Regenerate icon when menu bar appearance changes
  nativeTheme.on('updated', updateTrayIcon)

  createPanel()

  const { triggerSync, isOnboardingComplete } = setupIPC(panel!, {
    showPanel: () => showPanel(),
    closeOnboarding: () => { onboardingWin?.close(); onboardingWin = null },
    onBadgeUpdate: (overdue, today) => {
      currentOverdue = overdue
      currentToday = today
      updateTrayIcon()
    },
  })

  if (!isOnboardingComplete) {
    createOnboardingWindow()
  }

  powerMonitor.on('resume', () => {
    if (isOnboarded()) triggerSync()
    panel?.webContents.send('panel:shown')
  })

  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })
})

app.on('window-all-closed', () => { /* intentionally empty — keep alive in menu bar */ })
