"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const CLIENT_ROOT = path.join(PROJECT_ROOT, "client");
const SHARED_ROOT = path.join(PROJECT_ROOT, "shared");

function getDataDir() {
  if (process.env.RENTLEDGER_DATA_DIR) {
    return process.env.RENTLEDGER_DATA_DIR;
  }
  return path.join(PROJECT_ROOT, "data");
}

const DB_FILENAME = "kimujjo_holdings_database.db";

function getDbPath() {
  return path.join(getDataDir(), DB_FILENAME);
}

function ensureDataDir() {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  PROJECT_ROOT,
  CLIENT_ROOT,
  SHARED_ROOT,
  DB_FILENAME,
  getDataDir,
  getDbPath,
  ensureDataDir,
};
