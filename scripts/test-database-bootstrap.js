#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  resolveDataDir,
  seedDatabaseIfMissing,
} = require("../electron/database-bootstrap");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "rentledger-db-bootstrap-"));
const dataDir = path.join(root, "user-data", "data");
const bundledDb = path.join(root, "installer", "starter.db");
const dbFilename = "ledger.db";
const targetDb = path.join(dataDir, dbFilename);

try {
  fs.mkdirSync(path.dirname(bundledDb), { recursive: true });
  fs.writeFileSync(bundledDb, "database bundled with installer");

  const firstRun = seedDatabaseIfMissing({ dataDir, bundledDb, dbFilename });
  assert.strictEqual(firstRun.action, "seeded");
  assert.strictEqual(fs.readFileSync(targetDb, "utf8"), "database bundled with installer");

  fs.writeFileSync(targetDb, "user payments added after installation");
  fs.writeFileSync(bundledDb, "database bundled with newer installer");

  const updateRun = seedDatabaseIfMissing({ dataDir, bundledDb, dbFilename });
  assert.strictEqual(updateRun.action, "preserved");
  assert.strictEqual(
    fs.readFileSync(targetDb, "utf8"),
    "user payments added after installation",
    "an update must not overwrite the user's live database"
  );

  const appDataDir = path.join(root, "app-data");
  const currentUserDataDir = path.join(appDataDir, "RentLedger");
  const legacyDataDir = path.join(appDataDir, "Rent Ledger", "data");
  fs.mkdirSync(legacyDataDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDataDir, dbFilename), "older installed app's live database");

  assert.strictEqual(
    resolveDataDir({ currentUserDataDir, appDataDir, dbFilename }),
    legacyDataDir,
    "an update must find data stored under the previous product name"
  );

  const currentDataDir = path.join(currentUserDataDir, "data");
  fs.mkdirSync(currentDataDir, { recursive: true });
  fs.writeFileSync(path.join(currentDataDir, dbFilename), "current live database");
  assert.strictEqual(
    resolveDataDir({ currentUserDataDir, appDataDir, dbFilename }),
    currentDataDir,
    "the current data location must win once it contains a database"
  );

  console.log("Database bootstrap test passed: existing and legacy user data were preserved.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
