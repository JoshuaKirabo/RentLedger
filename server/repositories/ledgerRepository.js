"use strict";

const { open, applyScheduledMoveOuts } = require("../db/connection");
const { TENANT_DISPLAY_NAME_SQL } = require("../db/tenantSql");
const { dueDateForMonth, monthFromDate, nextRentMonth } = require("../lib/rentMonths");

const METHOD_LABELS = {
  bank: "Bank Transfer",
  mobile: "Mobile Money",
  agb: "Agency Banking",
};

const METHOD_TO_DB = {
  bank: "BANK_TRANSFER",
  mobile: "MOBILE_MONEY",
  agb: "CASH",
};

function parseTenantId(tenantId) {
  return parseInt(String(tenantId).replace(/\D/g, ""), 10) || null;
}

function syncScheduledMoveOuts() {
  applyScheduledMoveOuts(open());
}

function getAllPayments() {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      printf('P%03d', p.payment_id) AS paymentId,
      p.payment_date AS date,
      p.amount,
      CASE p.payment_method
        WHEN 'MOBILE_MONEY' THEN 'Mobile Money'
        WHEN 'BANK_TRANSFER' THEN 'Bank Transfer'
        WHEN 'CASH' THEN 'Cash'
        ELSE p.payment_method
      END AS method,
      p.payment_reference AS bankRef,
      '' AS notes,
      COALESCE(r.receipt_number, '') AS receiptNo,
      COALESCE(
        (
          SELECT GROUP_CONCAT(ro.rent_month, ', ')
          FROM payment_allocations pa
          JOIN rent_obligations ro ON ro.rent_obligation_id = pa.rent_obligation_id
          WHERE pa.payment_id = p.payment_id
        ),
        '—'
      ) AS monthsCovered,
      'Paid' AS status,
      printf('T%03d', t.tenant_id) AS tenantId,
      ${TENANT_DISPLAY_NAME_SQL} AS tenantName,
      u.unit_number AS unit,
      e.estate_name AS estate
    FROM payments p
    JOIN tenants t ON t.tenant_id = p.tenant_id
    LEFT JOIN tenancy_assignments ta
      ON ta.tenancy_id = (
        SELECT ta2.tenancy_id
        FROM tenancy_assignments ta2
        WHERE ta2.tenant_id = t.tenant_id
        ORDER BY
          CASE WHEN ta2.end_date IS NULL THEN 0 ELSE 1 END,
          COALESCE(ta2.end_date, '9999-12-31') DESC,
          ta2.start_date DESC,
          ta2.tenancy_id DESC
        LIMIT 1
      )
    LEFT JOIN units u ON u.unit_id = ta.unit_id
    LEFT JOIN estates e ON e.estate_id = u.estate_id
    LEFT JOIN receipts r ON r.payment_id = p.payment_id
    WHERE p.payment_status = 'POSTED'
    ORDER BY p.payment_date DESC
  `).all();
}

function getAllReceipts() {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      r.receipt_number AS receiptNo,
      printf('T%03d', t.tenant_id) AS tenantId,
      ${TENANT_DISPLAY_NAME_SQL} AS tenantName,
      t.phone_number AS phone,
      u.unit_number AS unit,
      e.estate_name AS estate,
      p.amount,
      p.payment_date AS date,
      CASE p.payment_method
        WHEN 'MOBILE_MONEY' THEN 'Mobile Money'
        WHEN 'BANK_TRANSFER' THEN 'Bank Transfer'
        WHEN 'CASH' THEN 'Cash'
        ELSE p.payment_method
      END AS method,
      p.payment_reference AS paymentRef,
      'Rent payment' AS purpose,
      COALESCE(
        (
          SELECT GROUP_CONCAT(ro.rent_month, ', ')
          FROM payment_allocations pa
          JOIN rent_obligations ro ON ro.rent_obligation_id = pa.rent_obligation_id
          WHERE pa.payment_id = p.payment_id
        ),
        '—'
      ) AS monthsCovered,
      'NIL' AS balance,
      'Pending' AS emailStatus,
      'Pending' AS smsStatus
    FROM receipts r
    JOIN payments p ON p.payment_id = r.payment_id
    JOIN tenants t ON t.tenant_id = p.tenant_id
    LEFT JOIN tenancy_assignments ta
      ON ta.tenancy_id = (
        SELECT ta2.tenancy_id
        FROM tenancy_assignments ta2
        WHERE ta2.tenant_id = t.tenant_id
        ORDER BY
          CASE WHEN ta2.end_date IS NULL THEN 0 ELSE 1 END,
          COALESCE(ta2.end_date, '9999-12-31') DESC,
          ta2.start_date DESC,
          ta2.tenancy_id DESC
        LIMIT 1
      )
    LEFT JOIN units u ON u.unit_id = ta.unit_id
    LEFT JOIN estates e ON e.estate_id = u.estate_id
    ORDER BY p.payment_date DESC
  `).all();
}

function getActiveTenancy(tenantId) {
  syncScheduledMoveOuts();
  const numericId = parseTenantId(tenantId);
  if (!numericId) return null;

  return open().prepare(`
    SELECT
      ta.tenancy_id,
      ta.tenant_id,
      ta.start_date,
      ta.agreed_monthly_rent
    FROM tenancy_assignments ta
    WHERE ta.tenant_id = ?
      AND ta.end_date IS NULL
  `).get(numericId);
}

function rentStatus(allocatedAmount, amountDue) {
  if (allocatedAmount <= 0) return "UNPAID";
  if (allocatedAmount < amountDue) return "PARTIAL";
  return "PAID";
}

function assertRentMonth(rentMonth) {
  const month = String(rentMonth || "").slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Rent month must use YYYY-MM format");
  }
  return month;
}

function ensureRentObligationsThroughMonth(upToMonth) {
  const throughMonth = assertRentMonth(upToMonth);
  syncScheduledMoveOuts();
  const db = open();

  const tenancies = db.prepare(`
    SELECT tenancy_id, start_date, agreed_monthly_rent
    FROM tenancy_assignments
    WHERE end_date IS NULL
      AND substr(start_date, 1, 7) <= ?
    ORDER BY tenancy_id
  `).all(throughMonth);

  const getExisting = db.prepare(`
    SELECT rent_obligation_id, amount_due, allocated_amount, status, due_date
    FROM rent_obligations
    WHERE tenancy_id = ?
      AND rent_month = ?
  `);

  const insertObligation = db.prepare(`
    INSERT INTO rent_obligations (tenancy_id, rent_month, due_date, amount_due)
    VALUES (?, ?, ?, ?)
  `);

  const updateObligation = db.prepare(`
    UPDATE rent_obligations
    SET amount_due = ?,
        due_date = ?,
        status = ?
    WHERE rent_obligation_id = ?
  `);

  let inserted = 0;
  let updated = 0;

  const transaction = db.transaction(() => {
    for (const tenancy of tenancies) {
      let cursor = monthFromDate(tenancy.start_date);
      while (cursor <= throughMonth) {
        const dueDate = dueDateForMonth(cursor);
        const existing = getExisting.get(tenancy.tenancy_id, cursor);

        if (existing) {
          const amountDue = Math.max(
            Number(tenancy.agreed_monthly_rent) || 0,
            Number(existing.allocated_amount) || 0,
            Number(existing.amount_due) || 0
          );
          const status = rentStatus(Number(existing.allocated_amount) || 0, amountDue);

          if (
            Number(existing.amount_due) !== amountDue ||
            existing.due_date !== dueDate ||
            existing.status !== status
          ) {
            updateObligation.run(amountDue, dueDate, status, existing.rent_obligation_id);
            updated += 1;
          }
        } else {
          insertObligation.run(
            tenancy.tenancy_id,
            cursor,
            dueDate,
            tenancy.agreed_monthly_rent
          );
          inserted += 1;
        }

        cursor = nextRentMonth(cursor);
      }
    }
  });

  transaction.immediate();
  return { inserted, updated };
}

function getOpenRentObligations(tenancyId) {
  return open().prepare(`
    SELECT
      ro.rent_obligation_id,
      ro.rent_month,
      ro.amount_due,
      ro.allocated_amount,
      (ro.amount_due - ro.allocated_amount) AS balance
    FROM rent_obligations ro
    WHERE ro.tenancy_id = ?
      AND ro.status IN ('UNPAID', 'PARTIAL')
    ORDER BY ro.rent_month ASC
  `).all(tenancyId);
}

function getLastRentMonth(tenancyId) {
  const row = open().prepare(`
    SELECT MAX(rent_month) AS last_month
    FROM rent_obligations
    WHERE tenancy_id = ?
  `).get(tenancyId);
  return row?.last_month || null;
}

function getRentObligationByTenancyAndMonth(tenancyId, rentMonth) {
  return open().prepare(`
    SELECT rent_obligation_id, amount_due, allocated_amount, status
    FROM rent_obligations
    WHERE tenancy_id = ?
      AND rent_month = ?
  `).get(tenancyId, rentMonth);
}

function createRentObligation(tenancyId, rentMonth, amountDue) {
  const result = open().prepare(`
    INSERT INTO rent_obligations (tenancy_id, rent_month, due_date, amount_due)
    VALUES (?, ?, ?, ?)
  `).run(tenancyId, rentMonth, dueDateForMonth(rentMonth), amountDue);

  return result.lastInsertRowid;
}

function getNextReceiptNumber() {
  const row = open().prepare(`
    SELECT COALESCE(
      MAX(CAST(receipt_number AS INTEGER)),
      0
    ) AS max_no
    FROM receipts
    WHERE receipt_number NOT GLOB '*[^0-9]*'
  `).get();
  return (row?.max_no || 0) + 1;
}

function buildPaymentReference(bankRef) {
  const trimmed = String(bankRef || "").trim();
  if (!trimmed) {
    throw new Error("Bank reference is required");
  }
  return trimmed;
}

function insertPaymentWithReceipt(paymentData, allocationRows) {
  const db = open();
  const numericTenantId = parseTenantId(paymentData.tenantId);
  if (!numericTenantId) {
    throw new Error("Invalid tenant ID");
  }

  const paymentReference = buildPaymentReference(paymentData.bankRef);
  const paymentMethod = METHOD_TO_DB[paymentData.method] || "CASH";
  const receiptNumber = String(getNextReceiptNumber()).padStart(6, "0");

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      tenant_id,
      payment_reference,
      payment_type,
      amount,
      payment_date,
      payment_method,
      payment_status
    ) VALUES (?, ?, 'RENT', ?, ?, ?, 'POSTED')
  `);

  const insertAllocation = db.prepare(`
    INSERT INTO payment_allocations (payment_id, rent_obligation_id, allocated_amount)
    VALUES (?, ?, ?)
  `);

  const insertReceipt = db.prepare(`
    INSERT INTO receipts (payment_id, receipt_number, issued_at, issued_by)
    VALUES (?, ?, ?, 'SYSTEM')
  `);

  const transaction = db.transaction(() => {
    const paymentResult = insertPayment.run(
      numericTenantId,
      paymentReference,
      paymentData.amount,
      paymentData.date,
      paymentMethod
    );
    const paymentId = paymentResult.lastInsertRowid;

    for (const row of allocationRows) {
      if (row.applied <= 0) continue;

      let obligationId = row.rentObligationId;
      if (!obligationId) {
        const existing = getRentObligationByTenancyAndMonth(paymentData.tenancyId, row.rentMonth);
        if (existing) {
          obligationId = existing.rent_obligation_id;
        } else {
          obligationId = createRentObligation(
            paymentData.tenancyId,
            row.rentMonth,
            row.opening
          );
        }
      }

      insertAllocation.run(paymentId, obligationId, row.applied);
    }

    insertReceipt.run(paymentId, receiptNumber, `${paymentData.date}T09:00:00`);

    return { paymentId, receiptNumber, paymentReference };
  });

  return transaction();
}

function getSetting(_key) {
  return null;
}

function getSettings() {
  return {};
}

function nextId(prefix, current, pad = 3) {
  const num = parseInt(String(current).replace(/\D/g, ""), 10) || 0;
  return `${prefix}${String(num + 1).padStart(pad, "0")}`;
}

module.exports = {
  getAllPayments,
  getAllReceipts,
  getActiveTenancy,
  ensureRentObligationsThroughMonth,
  getOpenRentObligations,
  getLastRentMonth,
  getRentObligationByTenancyAndMonth,
  createRentObligation,
  getNextReceiptNumber,
  getSetting,
  getSettings,
  nextId,
  METHOD_LABELS,
  METHOD_TO_DB,
  insertPaymentWithReceipt,
};
