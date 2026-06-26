"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveReceiptPdf: (html, filename) => ipcRenderer.invoke("save-receipt-pdf", { html, filename }),
});
