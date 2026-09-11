const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs/promises");

const DATA_FOLDER = "OriBarakahStoreData";

function localDataDirectory() {
  return path.join(app.getPath("userData"), DATA_FOLDER);
}

ipcMain.handle("ori:save-local-snapshot", async (_event, snapshot) => {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid local backup data");
  const json = JSON.stringify(snapshot, null, 2);
  if (Buffer.byteLength(json, "utf8") > 100 * 1024 * 1024) throw new Error("Local backup is larger than 100 MB");
  const directory = localDataDirectory();
  await fs.mkdir(directory, { recursive: true });
  const latest = path.join(directory, "latest.json");
  const temporary = path.join(directory, "latest.tmp");
  await fs.writeFile(temporary, json, "utf8");
  await fs.rename(temporary, latest);
  const date = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(directory, `backup-${date}.json`), json, "utf8");
  return { path: latest, savedAt: new Date().toISOString(), sizeBytes: Buffer.byteLength(json, "utf8") };
});
ipcMain.handle("ori:get-local-data-path", () => localDataDirectory());
ipcMain.handle("ori:open-local-data-folder", async () => shell.openPath(localDataDirectory()));

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Ori Barakah Store",
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
