"use strict";

const fs = require("fs");
const path = require("path");

const LEGACY_USER_DATA_DIRNAMES = ["Rent Ledger", "rent-ledger"];

/**
 * Keep using a database created by an older build whose product name produced
 * a different Electron userData folder. The database is used in place so that
 * resolving an old location never risks damaging the only live copy.
 */
function resolveDataDir({ currentUserDataDir, appDataDir, dbFilename }) {
  const currentDataDir = path.join(currentUserDataDir, "data");
  const candidates = [
    currentDataDir,
    ...LEGACY_USER_DATA_DIRNAMES.map((name) => path.join(appDataDir, name, "data")),
  ];
  const seen = new Set();

  for (const candidate of candidates) {
    const key = path.resolve(candidate).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (fs.existsSync(path.join(candidate, dbFilename))) {
      return candidate;
    }
  }

  return currentDataDir;
}

/**
 * Copy the database shipped with the installer only for a brand-new user.
 *
 * The database in dataDir is the user's live ledger. An application update
 * must never replace it, even if it is empty, old, or smaller than expected.
 */
function seedDatabaseIfMissing({ dataDir, bundledDb, dbFilename, logger = console }) {
  const targetDb = path.join(dataDir, dbFilename);

  if (fs.existsSync(targetDb)) {
    return { action: "preserved", targetDb };
  }

  if (!fs.existsSync(bundledDb)) {
    logger.warn(`Bundled database not found at ${bundledDb}`);
    return { action: "missing-bundle", targetDb };
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(bundledDb, targetDb, fs.constants.COPYFILE_EXCL);
  return { action: "seeded", targetDb };
}

module.exports = { resolveDataDir, seedDatabaseIfMissing };
