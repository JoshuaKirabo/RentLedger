"use strict";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { resolveDataDir, seedDatabaseIfMissing } = require("./database-bootstrap");

const IS_DEV = process.env.ELECTRON_DEV === "1";
const PORT = process.env.PORT || 3000;
const DB_FILENAME = "kimujjo_holdings_database.db";
const IS_MAC = process.platform === "darwin";

let mainWindow = null;

function setDataDir() {
  process.env.RENTLEDGER_DATA_DIR = resolveDataDir({
    currentUserDataDir: app.getPath("userData"),
    appDataDir: app.getPath("appData"),
    dbFilename: DB_FILENAME,
  });
}

function bundledDatabasePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "data", DB_FILENAME)
    : path.join(__dirname, "..", "data", DB_FILENAME);
}

function installDatabaseIfMissing() {
  const dataDir = process.env.RENTLEDGER_DATA_DIR;
  return seedDatabaseIfMissing({
    dataDir,
    bundledDb: bundledDatabasePath(),
    dbFilename: DB_FILENAME,
  });
}

async function createWindow() {
  setDataDir();
  installDatabaseIfMissing();

  if (!IS_DEV) {
    const { startServer } = require("../server/index");
    await startServer({ port: PORT, host: "127.0.0.1" });
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "RentLedger",
    autoHideMenuBar: true,
    backgroundColor: "#FAF9F6",
    ...(IS_MAC
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle("save-receipt-pdf", async (_event, { html, filename }) => {
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    try {
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: "default" },
      });

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Receipt PDF",
        defaultPath: filename,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (canceled || !filePath) return { ok: false, canceled: true };
      fs.writeFileSync(filePath, pdfBuffer);
      return { ok: true, path: filePath };
    } finally {
      pdfWindow.destroy();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    const { close } = require("../server/index");
    close();
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
