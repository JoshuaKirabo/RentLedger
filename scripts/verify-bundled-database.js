#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dbPath = path.join(__dirname, "..", "data", "kimujjo_holdings_database.db");
const minimumRowsByTable = {
  estates: 5,
  units: 50,
  tenants: 50,
  tenancy_assignments: 50,
  rent_obligations: 100,
  payments: 100,
  receipts: 100,
};

const sqliteCheckScript = String.raw`
import json
import sqlite3
import sys

db_path = sys.argv[1]
minimums = json.loads(sys.argv[2])
conn = None

try:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.execute("PRAGMA query_only = ON")

    quick_check = conn.execute("PRAGMA quick_check(1)").fetchone()[0]
    if quick_check != "ok":
        raise RuntimeError(f"SQLite quick_check failed: {quick_check}")

    missing_tables = []
    short_tables = []
    counts = {}

    for table, minimum_rows in minimums.items():
        table_exists = conn.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table'
              AND name = ?
            """,
            (table,),
        ).fetchone()

        if table_exists is None:
            missing_tables.append(table)
            continue

        row_count = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        counts[table] = row_count
        if row_count < minimum_rows:
            short_tables.append(f"{table}: {row_count} rows, expected at least {minimum_rows}")

    problems = []
    if missing_tables:
        problems.append(f"Missing tables: {', '.join(missing_tables)}")
    if short_tables:
        problems.append(f"Unexpectedly small tables: {'; '.join(short_tables)}")
    if problems:
        raise RuntimeError("\n".join(problems))

    print(json.dumps({"counts": counts}, sort_keys=True))
except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
finally:
    if conn is not None:
        conn.close()
`;

const pythonCandidates = process.platform === "win32"
  ? [
      { command: "py", args: ["-3"] },
      { command: "python", args: [] },
      { command: "python3", args: [] },
    ]
  : [
      { command: "python3", args: [] },
      { command: "python", args: [] },
    ];

function verifyWithPythonSqlite() {
  for (const { command, args } of pythonCandidates) {
    const result = spawnSync(
      command,
      [...args, "-c", sqliteCheckScript, dbPath, JSON.stringify(minimumRowsByTable)],
      { encoding: "utf8" }
    );

    if (result.error?.code === "ENOENT") {
      continue;
    }
    if (result.error) {
      throw new Error(`${command}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `${command} exited with ${result.status}`).trim());
    }

    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`${command} returned unreadable SQLite check output: ${error.message}`);
    }
  }

  throw new Error("Python 3 with the built-in sqlite3 module is required to verify the bundled database.");
}

if (!fs.existsSync(dbPath)) {
  console.error(
    "Cannot build the desktop app: data/kimujjo_holdings_database.db is missing.\n"
    + "This file is your real tenant database and must exist before packaging."
  );
  process.exit(1);
}

try {
  const { counts } = verifyWithPythonSqlite();
  const summary = Object.entries(counts)
    .map(([table, count]) => `${table}=${count}`)
    .join(", ");
  console.log("Bundled database row counts:", summary);
} catch (error) {
  console.error(
    "Cannot build the desktop app: data/kimujjo_holdings_database.db does not look like the imported Kimujo ledger.\n"
    + `${error.message}\n`
    + "Import your real Kimujo data first, then rebuild."
  );
  process.exit(1);
}

console.log("Bundled database check passed:", dbPath);
