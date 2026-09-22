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

  const estateId = db.prepare("SELECT estate_id FROM estates LIMIT 1").get().estate_id;
  const depositUnitId = db.prepare(`
    INSERT INTO units (estate_id, unit_number, listed_monthly_rent)
    VALUES (?, 'A02', 400000)
  `).run(estateId).lastInsertRowid;
  const depositTenantRowId = db.prepare(`
    INSERT INTO tenants (first_name, last_name, phone_number)
    VALUES ('Deposit', 'Tenant', '+256700000002')
  `).run().lastInsertRowid;
  const depositTenancyId = db.prepare(`
    INSERT INTO tenancy_assignments (tenant_id, unit_id, start_date, agreed_monthly_rent)
    VALUES (?, ?, '2026-01-01', 400000)
  `).run(depositTenantRowId, depositUnitId).lastInsertRowid;
  const depositId = db.prepare(`
    INSERT INTO security_deposits (tenancy_id, expected_amount, received_amount, status)
    VALUES (?, 400000, 100000, 'PARTIAL')
  `).run(depositTenancyId).lastInsertRowid;
  const depositTenantId = `T${String(depositTenantRowId).padStart(3, "0")}`;

  const partialDeposit = paymentService.createPayment({
    tenantId: depositTenantId,
    date: "2026-08-01",
    amount: 100000,
    method: "bank",
    bankRef: "DEP-001",
    kind: "security_deposit",
  });
  assert.equal(partialDeposit.receipt.purpose, "Security deposit");
  assert.equal(partialDeposit.allocation.monthsCovered, "Security deposit");
  assert.equal(Number(partialDeposit.receipt.balance), 200000);
  let depositRow = db.prepare(`
    SELECT received_amount, status
    FROM security_deposits
    WHERE security_deposit_id = ?
  `).get(depositId);
  assert.equal(depositRow.received_amount, 200000);
  assert.equal(depositRow.status, "PARTIAL");

  assert.throws(
    () => paymentService.createPayment({
      tenantId: depositTenantId,
      date: "2026-08-02",
      amount: 250000,
      method: "bank",
      bankRef: "DEP-TOO-MUCH",
      kind: "security_deposit",
    }),
    /or less/
  );

  const paidDeposit = paymentService.createPayment({
    tenantId: depositTenantId,
    date: "2026-08-03",
    amount: 200000,
    method: "mobile",
    bankRef: "DEP-002",
    kind: "security_deposit",
  });
  depositRow = db.prepare(`
    SELECT received_amount, status
    FROM security_deposits
    WHERE security_deposit_id = ?
  `).get(depositId);
  assert.equal(depositRow.received_amount, 400000);
  assert.equal(depositRow.status, "PAID");
  assert.equal(Number(paidDeposit.receipt.balance), 0);
  assert.equal(
    db.prepare("SELECT payment_type FROM payments WHERE payment_reference = 'DEP-002'").get().payment_type,
    "SECURITY_DEPOSIT"
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS total FROM rent_obligations WHERE tenancy_id = ?").get(depositTenancyId).total,
    0
  );
  const depositReceipt = ledgerRepository.getAllReceipts().find((row) => row.paymentRef === "DEP-002");
  assert.equal(depositReceipt.purpose, "Security deposit");
  assert.equal(depositReceipt.monthsCovered, "Security deposit");
  assert.throws(
    () => paymentService.deletePayment(paidDeposit.payment.paymentId),
    /Only rent payments/
  );

  console.log("Payment edit/delete correction test passed.");
} finally {
  close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
