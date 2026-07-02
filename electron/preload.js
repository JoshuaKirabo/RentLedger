"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function markElectronPlatform() {
  document.documentElement.classList.add("is-electron", `platform-${process.platform}`);
}

markElectronPlatform();
window.addEventListener("DOMContentLoaded", markElectronPlatform);

contextBridge.exposeInMainWorld("electronAPI", {
  saveReceiptPdf: (html, filename) => ipcRenderer.invoke("save-receipt-pdf", { html, filename }),
  platform: process.platform,
});
