#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "kimujjo_holdings_database.db");

if (!fs.existsSync(dbPath)) {
  console.error(
    "Cannot build the desktop app: data/kimujjo_holdings_database.db is missing.\n"
    + "This file is your real tenant database and must exist before packaging."
  );
  process.exit(1);
}

const sample = fs.readFileSync(dbPath).subarray(0, 512 * 1024).toString("latin1");
if (
  sample.includes("Kibby")
  || sample.includes("Nancy")
  || sample.includes("+256700555001")
) {
  console.error(
    "Cannot build the desktop app: data/kimujjo_holdings_database.db still looks like seed data.\n"
    + "Import your real Kimujo data first, then rebuild."
  );
  process.exit(1);
}

console.log("Bundled database check passed:", dbPath);
