"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rentledger-batch-payments-"));
process.env.RENTLEDGER_DATA_DIR = testDataDir;

const { open, close } = require("../server/db/connection");
const paymentService = require("../server/services/paymentService");
const ledgerRepository = require("../server/repositories/ledgerRepository");

function seedTenant(db, { firstName, lastName, phone, unitNumber, rent, estateCode }) {
  let estate = db.prepare(`SELECT estate_id FROM estates WHERE estate_code = ?`).get(estateCode);
  let estateId = estate?.estate_id;
  if (!estateId) {
    estateId = db.prepare(`
      INSERT INTO estates (estate_code, estate_name)
      VALUES (?, ?)
    `).run(estateCode, `${estateCode} Estate`).lastInsertRowid;
  }
  const unitId = db.prepare(`
    INSERT INTO units (estate_id, unit_number, listed_monthly_rent)
    VALUES (?, ?, ?)
  `).run(estateId, unitNumber, rent).lastInsertRowid;
  const tenantId = db.prepare(`
    INSERT INTO tenants (first_name, last_name, phone_number)
    VALUES (?, ?, ?)
  `).run(firstName, lastName, phone).lastInsertRowid;
  const tenancyId = db.prepare(`
    INSERT INTO tenancy_assignments (tenant_id, unit_id, start_date, agreed_monthly_rent)
    VALUES (?, ?, '2025-12-01', ?)
  `).run(tenantId, unitId, rent).lastInsertRowid;
  db.prepare(`
    INSERT INTO security_deposits (tenancy_id, expected_amount)
    VALUES (?, ?)
  `).run(tenancyId, rent);
  return `T${String(tenantId).padStart(3, "0")}`;
}

try {
  const db = open();
  const tenantA = seedTenant(db, {
    firstName: "Ada",
    lastName: "Okello",
    phone: "+256700000001",
    unitNumber: "A01",
    rent: 500000,
    estateCode: "TESTA",
  });
  const tenantB = seedTenant(db, {
    firstName: "Ben",
    lastName: "Mugisha",
    phone: "+256700000002",
    unitNumber: "B02",
    rent: 400000,
    estateCode: "TESTA",
  });

  const batch = paymentService.createPayments([
    {
      tenantId: tenantA,
      date: "2026-07-10",
      amount: 500000,
      method: "bank",
      bankRef: "BATCH-001",
    },
    {
      tenantId: tenantB,
      date: "2026-07-10",
      amount: 400000,
      method: "mobile",
      bankRef: "BATCH-002",
    },
    {
      tenantId: tenantA,
      date: "2026-07-11",
      amount: 500000,
      method: "agb",
      bankRef: "BATCH-003",
    },
  ]);

  assert.equal(batch.count, 3);
  assert.equal(batch.payments.length, 3);
  assert.equal(ledgerRepository.getAllPayments().length, 3);
  assert.equal(ledgerRepository.getAllReceipts().length, 3);
  assert.ok(batch.payments.every((item) => item.payment?.receiptNo));
  assert.ok(batch.payments.every((item) => item.allocation?.monthsCovered));

  // Same-tenant sequential allocations should advance months.
  assert.notEqual(
    batch.payments[0].allocation.monthsCovered,
    batch.payments[2].allocation.monthsCovered
  );

  let duplicateBatchError = null;
  try {
    paymentService.createPayments([
      {
        tenantId: tenantA,
        date: "2026-07-12",
        amount: 100000,
        method: "bank",
        bankRef: "BATCH-DUP",
      },
      {
        tenantId: tenantB,
        date: "2026-07-12",
        amount: 100000,
        method: "bank",
        bankRef: "BATCH-DUP",
      },
    ]);
  } catch (err) {
    duplicateBatchError = err;
  }
  assert.ok(duplicateBatchError);
  assert.equal(duplicateBatchError.statusCode, 400);
  assert.match(duplicateBatchError.message, /Row 2:.*Duplicate bank reference/i);
  assert.equal(ledgerRepository.getAllPayments().length, 3);

  let existingRefError = null;
  try {
    paymentService.createPayments([
      {
        tenantId: tenantB,
        date: "2026-07-12",
        amount: 100000,
        method: "bank",
        bankRef: "BATCH-001",
      },
    ]);
  } catch (err) {
    existingRefError = err;
  }
  assert.ok(existingRefError);
  assert.equal(existingRefError.statusCode, 409);
  assert.match(existingRefError.message, /Row 1:.*already used/i);
  assert.equal(ledgerRepository.getAllPayments().length, 3);

  console.log("test-batch-payments: ok");
} finally {
  close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
