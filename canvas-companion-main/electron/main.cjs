const {
  app, BrowserWindow, Tray, Menu, nativeImage, screen, shell,
  Notification, ipcMain,
} = require("electron");
const path = require("path");
const fs = require("fs");

let tray = null;
let win = null;

// ---------- Notification scheduler ----------
const STATE_DIR = path.join(app.getPath("userData"));
const STATE_FILE = path.join(STATE_DIR, "notification-state.json");

// Fire at: 4h before, 1h before, 30m before, and at due time
const THRESHOLDS_MIN = [240, 60, 30, 0];

let assignments = []; // [{ id, title, course, due (ISO string) }]
let completed = new Set();
let notified = loadNotified(); // Map<assignmentId, Set<thresholdMin>>
let notificationsEnabled = true;
let scheduleTimer = null;

function loadNotified() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const obj = JSON.parse(raw);
    const map = new Map();
    for (const [k, v] of Object.entries(obj.notified || {})) {
      map.set(k, new Set(v));
    }
    if (typeof obj.notificationsEnabled === "boolean") {
      notificationsEnabled = obj.notificationsEnabled;
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveState() {
  try {
    const notifiedObj = {};
    for (const [k, v] of notified.entries()) notifiedObj[k] = [...v];
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ notified: notifiedObj, notificationsEnabled })
    );
  } catch (e) {
    console.error("Failed to save notification state", e);
  }
}

function thresholdLabel(min) {
  if (min === 0) return "is due now";
  if (min === 30) return "is due in 30 minutes";
  if (min === 60) return "is due in 1 hour";
  if (min === 240) return "is due in 4 hours";
  return `is due in ${min} minutes`;
}

function fire(assignment, thresholdMin) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: assignment.course || "Canvas",
    body: `${assignment.title} ${thresholdLabel(thresholdMin)}`,
    silent: false,
  });
  n.on("click", () => {
    if (win) {
      const { x, y } = getWindowPosition();
      win.setPosition(x, y, false);
      win.show();
      win.focus();
    }
  });
  n.show();
}

function tick() {
  if (!notificationsEnabled) return;
  const now = Date.now();
  let dirty = false;

  for (const a of assignments) {
    if (completed.has(a.id)) continue;
    if (!a.due) continue;
    const dueMs = new Date(a.due).getTime();
    if (isNaN(dueMs)) continue;
    const minsUntil = (dueMs - now) / 60000;

    // Skip already-overdue (more than 5 min past) — no nag
    if (minsUntil < -5) continue;

    let set = notified.get(a.id);
    for (const threshold of THRESHOLDS_MIN) {
      // Fire when we cross the threshold from above (within a 1-min window)
      if (minsUntil <= threshold && minsUntil > threshold - 2) {
        if (!set) { set = new Set(); notified.set(a.id, set); }
        if (!set.has(threshold)) {
          fire(a, threshold);
          set.add(threshold);
          dirty = true;
        }
      }
    }
  }

  // Garbage-collect notified entries for assignments we no longer have or that are completed
  const liveIds = new Set(assignments.filter((a) => !completed.has(a.id)).map((a) => a.id));
  for (const id of notified.keys()) {
    if (!liveIds.has(id)) { notified.delete(id); dirty = true; }
  }

  if (dirty) saveState();
}

function startScheduler() {
  if (scheduleTimer) return;
  // Tick every 60 seconds
  scheduleTimer = setInterval(tick, 60 * 1000);
  // Run once immediately
  setTimeout(tick, 2000);
}

// ---------- Window / Tray ----------
function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 620,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    fullscreenable: false,
    hasShadow: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  win.on("blur", () => {
    if (!win.webContents.isDevToolsOpened()) win.hide();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function getWindowPosition() {
  const winBounds = win.getBounds();
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  const min = display.workArea.x + 8;
  const max = display.workArea.x + display.workArea.width - winBounds.width - 8;
  x = Math.max(min, Math.min(x, max));
  return { x, y };
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    const { x, y } = getWindowPosition();
    win.setPosition(x, y, false);
    win.show();
    win.focus();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "iconTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("Canvas Assignments");

  tray.on("click", toggleWindow);
  tray.on("right-click", () => {
    const menu = Menu.buildFromTemplate([
      { label: "Open", click: toggleWindow },
      {
        label: "Notifications",
        type: "checkbox",
        checked: notificationsEnabled,
        click: (item) => {
          notificationsEnabled = item.checked;
          saveState();
        },
      },
      { type: "separator" },
      { label: "Quit", accelerator: "Command+Q", click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ---------- IPC ----------
ipcMain.on("assignments:sync", (_e, payload) => {
  if (!payload || !Array.isArray(payload.assignments)) return;
  assignments = payload.assignments;
  completed = new Set(payload.completed || []);
  // Trigger an immediate check (in case something newly crossed a threshold)
  setTimeout(tick, 100);
});

ipcMain.on("notifications:set-enabled", (_e, enabled) => {
  notificationsEnabled = !!enabled;
  saveState();
});

ipcMain.on("open-external", (_e, url) => {
  if (typeof url === "string") shell.openExternal(url);
});

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.hide();
  createWindow();
  createTray();
  startScheduler();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
