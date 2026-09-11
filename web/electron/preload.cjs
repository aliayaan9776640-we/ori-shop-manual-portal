const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oriDesktop", {
  isDesktop: true,
  saveLocalSnapshot: (snapshot) => ipcRenderer.invoke("ori:save-local-snapshot", snapshot),
  getLocalDataPath: () => ipcRenderer.invoke("ori:get-local-data-path"),
  openLocalDataFolder: () => ipcRenderer.invoke("ori:open-local-data-folder"),
});
