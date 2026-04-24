const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  syncAssignments: (payload) => ipcRenderer.send("assignments:sync", payload),
  setNotificationsEnabled: (enabled) =>
    ipcRenderer.send("notifications:set-enabled", !!enabled),
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
