"use strict";

const { open } = require("../db/connection");
const { TENANT_DISPLAY_NAME_SQL } = require("../db/tenantSql");
const settingsRepository = require("./settingsRepository");
const ledgerRepository = require("./ledgerRepository");
const {
  currentRentMonth,
  formatRentMonthLabel,
  parseRentMonthLabel,
} = require("../lib/rentMonths");

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function todayIsoDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatWaiverDate(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function stillOwed(obligation, waivedAmount = 0) {
  const due = Number(obligation?.amount_due) || 0;
  const allocated = Number(obligation?.allocated_amount) || 0;
  return Math.max(0, due - allocated - waivedAmount);
}

function waivedAmountForObligation(obligationId) {
  const row = open().prepare(`
    SELECT amount
    FROM waiver_lines
    WHERE rent_obligation_id = ?
  `).get(obligationId);
  return Number(row?.amount) || 0;
}

function mapWaiver(row, lines) {
  const kind = row.kind === "DEPOSIT" ? "deposit" : "rent";
  const mappedLines = kind === "deposit"
    ? [{ label: "Security deposit", amount: Number(row.deposit_amount) || 0 }]
    : lines.map((line) => ({
      label: formatRentMonthLabel(line.rent_month),
      amount: Number(line.amount) || 0,
    }));
  const amount = mappedLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  return {
    id: String(row.waiver_id),
    kind,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    estate: row.estate_name,
    house: row.house_number,
    date: formatWaiverDate(row.waived_on),
    reason: row.reason,
    approvedBy: row.approved_by,
    lines: mappedLines,
    amount,
  };
}

function loadWaiverRow(waiverId) {
  return open().prepare(`
    SELECT
      w.waiver_id,
      w.kind,
      w.reason,
      w.approved_by,
      w.waived_on,
      w.deposit_amount,
      w.tenancy_id,
      printf('T%03d', w.tenant_id) AS tenant_id,
      ${TENANT_DISPLAY_NAME_SQL} AS tenant_name,
      e.estate_name,
      u.unit_number AS house_number
    FROM waivers w
    JOIN tenants t ON t.tenant_id = w.tenant_id
    JOIN tenancy_assignments ta ON ta.tenancy_id = w.tenancy_id
    JOIN units u ON u.unit_id = ta.unit_id
    JOIN estates e ON e.estate_id = u.estate_id
    WHERE w.waiver_id = ?
  `).get(waiverId);
}

function loadLines(waiverId) {
  return open().prepare(`
    SELECT wl.waiver_line_id, wl.waiver_id, wl.amount, wl.rent_obligation_id, ro.rent_month
    FROM waiver_lines wl
    JOIN rent_obligations ro ON ro.rent_obligation_id = wl.rent_obligation_id
    WHERE wl.waiver_id = ?
    ORDER BY ro.rent_month
  `).all(waiverId);
}

function getWaiver(waiverId) {
  const numericId = Number(waiverId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const row = loadWaiverRow(numericId);
  if (!row) return null;
  const lines = row.kind === "RENT" ? loadLines(numericId) : [];
  return mapWaiver(row, lines);
}

function listWaivers() {
  const rows = open().prepare(`
    SELECT
      w.waiver_id,
      w.kind,
      w.reason,
      w.approved_by,
      w.waived_on,
      w.deposit_amount,
      printf('T%03d', w.tenant_id) AS tenant_id,
      ${TENANT_DISPLAY_NAME_SQL} AS tenant_name,
      e.estate_name,
      u.unit_number AS house_number
    FROM waivers w
    JOIN tenants t ON t.tenant_id = w.tenant_id
    JOIN tenancy_assignments ta ON ta.tenancy_id = w.tenancy_id
    JOIN units u ON u.unit_id = ta.unit_id
    JOIN estates e ON e.estate_id = u.estate_id
    ORDER BY w.waived_on DESC, w.waiver_id DESC
  `).all();

  const lines = open().prepare(`
    SELECT wl.waiver_id, wl.amount, ro.rent_month
    FROM waiver_lines wl
    JOIN rent_obligations ro ON ro.rent_obligation_id = wl.rent_obligation_id
    ORDER BY ro.rent_month
  `).all();
  const linesByWaiver = new Map();
  lines.forEach((line) => {
    const group = linesByWaiver.get(line.waiver_id) || [];
    group.push(line);
    linesByWaiver.set(line.waiver_id, group);
  });

  return rows.map((row) => mapWaiver(row, linesByWaiver.get(row.waiver_id) || []));
}

function depositWaivedByTenantId() {
  const rows = open().prepare(`
    SELECT tenant_id, deposit_amount
    FROM waivers
    WHERE kind = 'DEPOSIT'
  `).all();
  return new Map(rows.map((row) => [row.tenant_id, Number(row.deposit_amount) || 0]));
}

function requireReason(reason) {
  const text = String(reason || "").trim();
  if (!text) throw httpError("Enter a reason for this waiver.");
  return text;
}

function requireApprover() {
  const approvedBy = settingsRepository.getAppSettings().waiverApprovedBy;
  if (!approvedBy) throw httpError("Waiver approver is not configured.", 500);
  return approvedBy;
}

function createWaiver({ tenantId, kind, reason, months }) {
  const waiverKind = String(kind || "rent").trim().toLowerCase();
  if (waiverKind !== "rent" && waiverKind !== "deposit") {
    throw httpError("Choose rent or a security deposit.");
  }

  const tenancy = ledgerRepository.getActiveTenancy(tenantId);
  if (!tenancy) throw httpError("Tenant has no active tenancy.", 404);

  const reasonText = requireReason(reason);
  const approvedBy = requireApprover();
  const db = open();

  const create = db.transaction(() => {
    if (waiverKind === "deposit") {
      const existing = db.prepare(`
        SELECT waiver_id
        FROM waivers
        WHERE tenancy_id = ? AND kind = 'DEPOSIT'
      `).get(tenancy.tenancy_id);
      if (existing) throw httpError("This security deposit is already waived.");

      const deposit = ledgerRepository.getSecurityDepositForActiveTenant(tenantId);
      const position = ledgerRepository.securityDepositPosition(deposit);
      if (!position.outstanding) throw httpError("This security deposit has nothing left to waive.");

      const inserted = db.prepare(`
        INSERT INTO waivers (
          tenant_id, tenancy_id, kind, reason, approved_by, waived_on, deposit_amount
        ) VALUES (?, ?, 'DEPOSIT', ?, ?, ?, ?)
      `).run(
        tenancy.tenant_id,
        tenancy.tenancy_id,
        reasonText,
        approvedBy,
        todayIsoDate(),
        position.outstanding
      );
      return inserted.lastInsertRowid;
    }

    ledgerRepository.ensureRentObligationsThroughMonth(currentRentMonth());
    const requested = [...new Set((Array.isArray(months) ? months : []).map((month) => String(month || "").trim()).filter(Boolean))];
    if (!requested.length) throw httpError("Select at least one rent month to waive.");

    const lineRows = requested.map((label) => {
      const rentMonth = parseRentMonthLabel(label);
      if (!rentMonth) throw httpError(`"${label}" is not a rent month.`);
      const obligation = ledgerRepository.getRentObligationByTenancyAndMonth(tenancy.tenancy_id, rentMonth);
      if (!obligation) throw httpError(`${label} is not outstanding.`);
      const owed = stillOwed(obligation, waivedAmountForObligation(obligation.rent_obligation_id));
      if (owed <= 0) throw httpError(`${label} is not outstanding.`);
      return { obligationId: obligation.rent_obligation_id, amount: owed };
    });

    const inserted = db.prepare(`
      INSERT INTO waivers (
        tenant_id, tenancy_id, kind, reason, approved_by, waived_on, deposit_amount
      ) VALUES (?, ?, 'RENT', ?, ?, ?, NULL)
    `).run(
      tenancy.tenant_id,
      tenancy.tenancy_id,
      reasonText,
      approvedBy,
      todayIsoDate()
    );
    const insertLine = db.prepare(`
      INSERT INTO waiver_lines (waiver_id, rent_obligation_id, amount)
      VALUES (?, ?, ?)
    `);
    lineRows.forEach((line) => {
      insertLine.run(inserted.lastInsertRowid, line.obligationId, line.amount);
    });
    return inserted.lastInsertRowid;
  });

  return getWaiver(create());
}

function updateWaiverMonths(waiverId, months) {
  const numericId = Number(waiverId);
  const current = Number.isInteger(numericId) ? loadWaiverRow(numericId) : null;
  if (!current) throw httpError("Waiver not found.", 404);
  if (current.kind !== "RENT") throw httpError("Only rent months can be taken off a waiver.");

  const requested = [...new Set((Array.isArray(months) ? months : []).map((month) => String(month || "").trim()).filter(Boolean))];
  if (!requested.length) throw httpError("Choose the months to keep, or remove the waiver.");

  const keepMonths = new Set();
  requested.forEach((label) => {
    const rentMonth = parseRentMonthLabel(label);
    if (!rentMonth) throw httpError(`"${label}" is not a rent month.`);
    keepMonths.add(rentMonth);
  });

  const lines = loadLines(numericId);
  const currentMonths = new Set(lines.map((line) => line.rent_month));
  keepMonths.forEach((rentMonth) => {
    if (!currentMonths.has(rentMonth)) {
      throw httpError("A month can be taken off this waiver, not added.");
    }
  });

  const db = open();
  db.transaction(() => {
    const remove = db.prepare(`
      DELETE FROM waiver_lines
      WHERE waiver_line_id = ?
    `);
    lines.forEach((line) => {
      if (!keepMonths.has(line.rent_month)) remove.run(line.waiver_line_id);
    });
  })();

  return getWaiver(numericId);
}

function deleteWaiver(waiverId) {
  const numericId = Number(waiverId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw httpError("Waiver not found.", 404);
  }
  const result = open().prepare(`
    DELETE FROM waivers
    WHERE waiver_id = ?
  `).run(numericId);
  if (!result.changes) throw httpError("Waiver not found.", 404);
}

module.exports = {
  listWaivers,
  getWaiver,
  createWaiver,
  updateWaiverMonths,
  deleteWaiver,
  depositWaivedByTenantId,
};
