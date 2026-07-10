"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rentledger-payment-corrections-"));
process.env.RENTLEDGER_DATA_DIR = testDataDir;

const { open, close } = require("../server/db/connection");
const paymentService = require("../server/services/paymentService");
const ledgerRepository = require("../server/repositories/ledgerRepository");

function seedTenant(db) {
  const estateId = db.prepare(`
    INSERT INTO estates (estate_code, estate_name)
    VALUES ('TEST', 'Test Estate')
  `).run().lastInsertRowid;
  const unitId = db.prepare(`
    INSERT INTO units (estate_id, unit_number, listed_monthly_rent)
    VALUES (?, 'A01', 500000)
  `).run(estateId).lastInsertRowid;
  const tenantId = db.prepare(`
    INSERT INTO tenants (first_name, last_name, phone_number)
    VALUES ('Test', 'Tenant', '+256700000001')
  `).run().lastInsertRowid;
  const tenancyId = db.prepare(`
    INSERT INTO tenancy_assignments (tenant_id, unit_id, start_date, agreed_monthly_rent)
    VALUES (?, ?, '2025-12-01', 500000)
  `).run(tenantId, unitId).lastInsertRowid;
  db.prepare(`
    INSERT INTO security_deposits (tenancy_id, expected_amount)
    VALUES (?, 500000)
  `).run(tenancyId);
  return `T${String(tenantId).padStart(3, "0")}`;
}

try {
  const db = open();
  const tenantId = seedTenant(db);

  const first = paymentService.createPayment({
    tenantId,
    date: "2026-07-10",
    amount: 500000,
    method: "bank",
    bankRef: "TEST-001",
  });
  const duplicate = paymentService.createPayment({
    tenantId,
    date: "2026-07-10",
    amount: 500000,
    method: "bank",
    bankRef: "TEST-002",
  });

  paymentService.deletePayment(duplicate.payment.paymentId);
  assert.equal(ledgerRepository.getAllPayments().length, 1);
  assert.equal(ledgerRepository.getAllReceipts().length, 1);
  assert.equal(
    db.prepare("SELECT payment_status FROM payments WHERE payment_id = 2").get().payment_status,
    "VOIDED"
  );

  // Historical payments must remain correctable after the tenant moves out.
  db.prepare("UPDATE tenancy_assignments SET end_date = '2026-07-10'").run();
  db.prepare("UPDATE tenants SET is_active = 0").run();

  const corrected = paymentService.updatePayment(first.payment.paymentId, {
    tenantId,
    date: "2026-07-09",
    amount: 300000,
    method: "mobile",
    bankRef: "TEST-001-CORRECTED",
  });

  const activePayments = ledgerRepository.getAllPayments();
  const activeReceipts = ledgerRepository.getAllReceipts();
  assert.equal(activePayments.length, 1);
  assert.equal(activePayments[0].amount, 300000);
  assert.equal(activePayments[0].bankRef, "TEST-001-CORRECTED");
  assert.equal(activePayments[0].methodCode, "mobile");
  assert.equal(activeReceipts.length, 1);
  assert.equal(activeReceipts[0].receiptNo, first.receipt.receiptNo);
  assert.equal(activeReceipts[0].amount, 300000);
  assert.equal(corrected.receipt.receiptNo, first.receipt.receiptNo);
  assert.equal(Number(corrected.receipt.balance), 3700000);
  assert.equal(
    db.prepare("SELECT payment_status FROM payments WHERE payment_id = 1").get().payment_status,
    "REVERSED"
  );
  assert.equal(
    db.prepare("SELECT SUM(allocated_amount) AS total FROM rent_obligations").get().total,
    300000
  );

  const historicalPaymentId = db.prepare(`
    INSERT INTO payments (
      tenant_id,
      payment_reference,
      payment_type,
      amount,
      payment_date,
      payment_method,
      payment_status
    ) VALUES (1, 'HISTORICAL-001', 'RENT', 500000, '2025-11-30', 'CASH', 'POSTED')
  `).run().lastInsertRowid;
  assert.throws(
    () => paymentService.deletePayment(historicalPaymentId),
    /opening history/
  );
  assert.equal(
    db.prepare("SELECT payment_status FROM payments WHERE payment_id = ?").get(historicalPaymentId).payment_status,
    "POSTED"
  );

  console.log("Payment edit/delete correction test passed.");
} finally {
  close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
