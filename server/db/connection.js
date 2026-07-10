"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { PROJECT_ROOT, getDbPath, ensureDataDir } = require("../config/paths");
const { migrateTenantTypes, recreateTenantDirectoryViews } = require("./tenantViews");
const { OUTSTANDING_START_MONTH } = require("../lib/rentMonths");

let _db = null;

function receiptNumberIsNumeric(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function migrateReceiptNumberFormat(db) {
  const receiptTable = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'receipts'
  `).get();

  const schemaIsCurrent = /receipt_number\s+NOT\s+GLOB\s+'\*\[\^0-9\]\*'/i.test(receiptTable?.sql || "");
  if (schemaIsCurrent) return;

  const receipts = db.prepare(`
    SELECT receipt_id, payment_id, receipt_number, issued_at, issued_by
    FROM receipts
    ORDER BY receipt_id
  `).all().map((receipt) => {
    const receiptNumber = String(receipt.receipt_number || "")
      .trim()
      .replace(/^RCP-/i, "")
      .replace(/^#/, "");

    if (!receiptNumberIsNumeric(receiptNumber)) {
      throw new Error(`Cannot migrate invalid receipt number: ${receipt.receipt_number}`);
    }

    return { ...receipt, receiptNumber };
  });

  const transaction = db.transaction(() => {
    db.exec("DROP INDEX IF EXISTS idx_receipts_receipt_number");
    db.exec(`
      CREATE TABLE receipts_numeric (
        receipt_id              INTEGER PRIMARY KEY,
        payment_id              INTEGER NOT NULL UNIQUE,
        receipt_number          TEXT NOT NULL UNIQUE,
        issued_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        issued_by               TEXT NOT NULL DEFAULT 'SYSTEM',

        FOREIGN KEY (payment_id)
          REFERENCES payments(payment_id)
          ON UPDATE CASCADE
          ON DELETE RESTRICT,

        CHECK (
          length(receipt_number) > 0
          AND receipt_number NOT GLOB '*[^0-9]*'
        )
      );
    `);

    const insertReceipt = db.prepare(`
      INSERT INTO receipts_numeric (
        receipt_id,
        payment_id,
        receipt_number,
        issued_at,
        issued_by
      ) VALUES (?, ?, ?, ?, ?)
    `);

    receipts.forEach((receipt) => {
      insertReceipt.run(
        receipt.receipt_id,
        receipt.payment_id,
        receipt.receiptNumber,
        receipt.issued_at,
        receipt.issued_by
      );
    });

    db.exec("DROP TABLE receipts");
    db.exec("ALTER TABLE receipts_numeric RENAME TO receipts");
    db.exec("CREATE INDEX idx_receipts_receipt_number ON receipts(receipt_number)");
  });

  transaction.immediate();
}

function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function migrateTenantProfileFields(db) {
  addColumnIfMissing(db, "tenants", "alt_phone_number", "alt_phone_number TEXT");
  addColumnIfMissing(db, "tenants", "national_id_number", "national_id_number TEXT");
  addColumnIfMissing(db, "tenants", "notes", "notes TEXT NOT NULL DEFAULT 'No notes.'");
  addColumnIfMissing(db, "tenancy_assignments", "rent_due_day", "rent_due_day INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(db, "tenancy_assignments", "grace_period_days", "grace_period_days INTEGER NOT NULL DEFAULT 5");
  addColumnIfMissing(db, "tenancy_assignments", "scheduled_move_out_date", "scheduled_move_out_date TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_national_id_number
      ON tenants(national_id_number)
      WHERE national_id_number IS NOT NULL;
  `);
}

function migrateReceiptBalance(db) {
  addColumnIfMissing(
    db,
    "receipts",
    "balance_after",
    "balance_after INTEGER NOT NULL DEFAULT 0 CHECK (balance_after >= 0)"
  );

  // Imported receipts pre-date the stored balance field. Reconstruct their
  // balance at the time of payment from the immutable allocation ledger.
  db.prepare(`
    UPDATE receipts
    SET balance_after = COALESCE(
      (
        SELECT SUM(
          ro.amount_due - COALESCE(
            (
              SELECT SUM(pa2.allocated_amount)
              FROM payment_allocations pa2
              JOIN payments p2 ON p2.payment_id = pa2.payment_id
              WHERE pa2.rent_obligation_id = ro.rent_obligation_id
                AND p2.payment_status = 'POSTED'
                AND (
                  p2.payment_date < receipt_payment.payment_date
                  OR (
                    p2.payment_date = receipt_payment.payment_date
                    AND p2.payment_id <= receipt_payment.payment_id
                  )
                )
            ),
            0
          )
        )
        FROM rent_obligations ro
        JOIN tenancy_assignments ta ON ta.tenancy_id = ro.tenancy_id
        WHERE ta.tenant_id = receipt_payment.tenant_id
          AND ro.rent_month >= ?
          AND ro.rent_month <= substr(receipt_payment.payment_date, 1, 7)
      ),
      0
    )
    FROM payments AS receipt_payment
    WHERE receipts.payment_id = receipt_payment.payment_id
      AND receipts.issued_by = 'IMPORT'
      AND receipts.balance_after = 0
      AND receipt_payment.payment_type IN ('RENT', 'MIXED')
  `).run(OUTSTANDING_START_MONTH);
}

function applyScheduledMoveOuts(db) {
  db.prepare(`
    UPDATE tenancy_assignments
    SET end_date = scheduled_move_out_date,
        scheduled_move_out_date = NULL
    WHERE end_date IS NULL
      AND scheduled_move_out_date IS NOT NULL
      AND scheduled_move_out_date <= date('now', 'localtime')
  `).run();

  db.prepare(`
    UPDATE tenants
    SET is_active = 0
    WHERE tenant_id IN (
      SELECT ta.tenant_id
      FROM tenancy_assignments ta
      WHERE ta.end_date IS NOT NULL
        AND ta.end_date <= date('now', 'localtime')
        AND NOT EXISTS (
          SELECT 1
          FROM tenancy_assignments active_ta
          WHERE active_ta.tenant_id = ta.tenant_id
            AND active_ta.end_date IS NULL
        )
    )
  `).run();
}

function recreateTenantInputView(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS tr_v_tenant_input_normalize_insert;
    DROP VIEW IF EXISTS v_tenant_input;

    CREATE VIEW v_tenant_input AS
    SELECT
      first_name,
      middle_name,
      last_name,
      phone_number,
      national_id_number,
      alt_phone_number,
      notes
    FROM tenants;

    CREATE TRIGGER tr_v_tenant_input_normalize_insert
    INSTEAD OF INSERT ON v_tenant_input
    BEGIN
      INSERT INTO tenants (
        first_name,
        middle_name,
        last_name,
        phone_number,
        national_id_number,
        alt_phone_number,
        notes
      )
      VALUES (
        upper(substr(trim(NEW.first_name), 1, 1)) || lower(substr(trim(NEW.first_name), 2)),
        CASE
          WHEN NULLIF(trim(NEW.middle_name), '') IS NULL THEN NULL
          ELSE upper(substr(trim(NEW.middle_name), 1, 1)) || lower(substr(trim(NEW.middle_name), 2))
        END,
        upper(substr(trim(NEW.last_name), 1, 1)) || lower(substr(trim(NEW.last_name), 2)),
        trim(NEW.phone_number),
        NULLIF(upper(trim(NEW.national_id_number)), ''),
        NULLIF(trim(NEW.alt_phone_number), ''),
        COALESCE(NULLIF(trim(NEW.notes), ''), 'No notes.')
      );
    END;
  `);
}

function waiveArrearsBeforeOutstandingStart(db) {
  db.prepare(`
    UPDATE rent_obligations
    SET allocated_amount = amount_due,
        status = 'PAID'
    WHERE rent_month < ?
      AND status <> 'PAID'
  `).run(OUTSTANDING_START_MONTH);
}

function migrate(db) {
  const hasSchema = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tenants'"
  ).get();

  if (!hasSchema) {
    const sqlPath = path.join(PROJECT_ROOT, "sql", "kimujo_property_management.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    db.exec(sql);
    console.warn(
      "Initialized an empty database schema. Import real data or install the bundled database before use."
    );
  }

  // Older application databases may pre-date this constraint. Keep the
  // database itself as the final guard against assigning a room twice.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_active_tenancy_per_unit
      ON tenancy_assignments(unit_id)
      WHERE end_date IS NULL;
  `);
  migrateReceiptNumberFormat(db);
  migrateReceiptBalance(db);
  migrateTenantProfileFields(db);
  recreateTenantInputView(db);
  waiveArrearsBeforeOutstandingStart(db);
  migrateTenantTypes(db);
  applyScheduledMoveOuts(db);
}

function open() {
  if (_db) return _db;
  ensureDataDir();
  _db = new Database(getDbPath());
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { open, close, applyScheduledMoveOuts };
