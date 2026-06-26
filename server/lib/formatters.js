"use strict";

const PhoneNumbers = require("../../shared/phone");
const { formatRentMonthLabel } = require("../lib/rentMonths");
const { amountInWords } = require("./amountInWords");

function formatDisplayDate(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatAmount(n) {
  return Number(n).toLocaleString("en-UG");
}

function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function formatReceiptDate(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  return `${d.getDate()} / ${d.getMonth() + 1} / ${d.getFullYear()}`;
}

function receiptNumber(value) {
  return String(value || "")
    .replace(/^RCP-/i, "")
    .replace(/^#/, "");
}

function toApiPayments(payments) {
  return payments.map((p) => ({
    date: formatDisplayDate(p.date),
    tenant: p.tenantName,
    unit: p.unit,
    estate: p.estate,
    amount: formatAmount(p.amount),
    method: p.method,
    receipt: p.receiptNo ? `#${receiptNumber(p.receiptNo)}` : "—",
    status: p.status,
  }));
}

function formatMonthsCovered(value) {
  if (!value || value === "—") return "—";
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/^\d{4}-\d{2}$/.test(part) ? formatRentMonthLabel(part) : part))
    .join(", ");
}

function toApiReceipts(receipts) {
  return receipts.map((r) => {
    const receiptNo = receiptNumber(r.receiptNo);
    return {
      no: receiptNo,
      tenant: r.tenantName,
      unit: r.unit || "—",
      estate: r.estate || "—",
      method: r.method || "—",
      phone: PhoneNumbers.formatE164(r.phone),
      initials: getInitials(r.tenantName),
      amount: formatAmount(r.amount),
      months: formatMonthsCovered(r.monthsCovered),
      date: formatDisplayDate(r.date),
      receipt: `#${receiptNo}`,
      email: String(r.emailStatus).toLowerCase(),
      sms: String(r.smsStatus).toLowerCase(),
      receiptDate: formatReceiptDate(r.date),
      receivedFrom: r.tenantName,
      amountWords: amountInWords(r.amount),
      purpose: r.purpose,
      paymentRef: r.paymentRef,
      balance: r.balance || "NIL",
    };
  });
}

function formatTenantId(id) {
  return `T${String(id).padStart(3, "0")}`;
}

function ordinalDay(day) {
  const value = Number(day) || 5;
  const suffix = value % 100 >= 11 && value % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" }[value % 10] || "th");
  return `${value}${suffix}`;
}

function depositStatusLabel(status) {
  if (!status) return "Not Required";
  return { UNPAID: "Pending", PARTIAL: "Partial", PAID: "Paid" }[status] || status;
}

function isFutureIsoDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return date > today;
}

function tenantStatusLabel(isActive, hasAssignment, scheduledMoveOutDate) {
  if (!isActive) return "Inactive";
  if (isFutureIsoDate(scheduledMoveOutDate)) return "Notice";
  if (hasAssignment) return "Active";
  return "Unassigned";
}

function hasTenantAssignment(row) {
  return Boolean(row.estate_name) && !row.end_date;
}

function isCaretakerRow(row) {
  const unit = String(row.house_number || "").trim().toLowerCase();
  const notes = String(row.notes || "").trim().toLowerCase();
  const name = String(row.tenant_name || tenantDisplayName(row) || "").trim().toLowerCase();
  return unit.includes("caretaker") || notes.includes("caretaker") || name.includes("caretaker");
}

function isOperationallyActiveRow(row) {
  const status = tenantStatusLabel(
    row.is_active,
    hasTenantAssignment(row),
    row.scheduled_move_out_date
  );
  return status === "Active" || status === "Notice";
}

function summarizeTenantDirectory(rows) {
  const directory = Array.isArray(rows) ? rows : [];
  let activeTenants = 0;
  let securityDepositsPending = 0;

  directory.forEach((row) => {
    if (isCaretakerRow(row)) return;
    if (!isOperationallyActiveRow(row)) return;
    activeTenants += 1;
    const depositStatus = row.security_deposit_status;
    if (!depositStatus || depositStatus !== "PAID") {
      securityDepositsPending += 1;
    }
  });

  return {
    totalTenants: directory.filter((row) => !isCaretakerRow(row)).length,
    activeTenants,
    securityDepositsPending,
  };
}

function isPlaceholderNamePart(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || text === "unknown" || text === "business" || text === "tenant";
}

function individualDisplayName(row) {
  if (row.tenant_type === "BUSINESS") return "";

  const assembled = [row.first_name, row.middle_name, row.last_name]
    .filter((part) => !isPlaceholderNamePart(part))
    .join(" ")
    .trim();

  return assembled.replace(/\s+Unknown$/, "").trim();
}

function businessDisplayName(row) {
  if (row.tenant_type !== "BUSINESS") return "";
  return String(row.business_name || "").trim();
}

function tenantDisplayName(row) {
  const businessName = businessDisplayName(row);
  if (businessName) return businessName;

  const individualName = individualDisplayName(row);
  if (individualName) return individualName;

  if (row.tenant_name) {
    return String(row.tenant_name).replace(/\s+Unknown$/, "").trim();
  }

  return "—";
}

function tenantFirstName(row) {
  if (row.tenant_type === "BUSINESS" || isPlaceholderNamePart(row.first_name)) return null;
  return row.first_name;
}

function tenantLastName(row) {
  if (row.tenant_type === "BUSINESS" || isPlaceholderNamePart(row.last_name)) return null;
  return row.last_name;
}

function tenantMiddleName(row) {
  if (row.tenant_type === "BUSINESS" || isPlaceholderNamePart(row.middle_name)) return null;
  return row.middle_name || null;
}

function tenantBusinessName(row) {
  if (row.tenant_type !== "BUSINESS") return null;
  const name = String(row.business_name || "").trim();
  return name || null;
}

function toApiTenants(rows) {
  return rows.map((row) => {
    const id = formatTenantId(row.tenant_id);
    const monthlyRent = row.expected_monthly_rent || 0;
    const depositExpected = row.security_deposit_expected || 0;
    const depositReceived = row.security_deposit_received || 0;
    const rentDueDay = Number(row.rent_due_day) || 5;
    const gracePeriodDays = Number(row.grace_period_days) || 5;
    const moveOutIso = row.end_date || row.scheduled_move_out_date || null;
    const house = row.house_number || "—";

    const displayName = tenantDisplayName(row);

    return {
      id,
      tenantId: id,
      name: displayName,
      displayName,
      tenantType: row.tenant_type || "INDIVIDUAL",
      firstName: tenantFirstName(row),
      middleName: tenantMiddleName(row),
      lastName: tenantLastName(row),
      businessName: tenantBusinessName(row),
      individualName: individualDisplayName(row) || null,
      phone: row.phone_number,
      nationalIdNumber: row.national_id_number || null,
      altPhone: row.alt_phone_number || "—",
      estateId: row.estate_id || null,
      estate: row.estate_name || "—",
      unitId: row.unit_id || null,
      house,
      unit: house,
      monthlyRent,
      securityDeposit: depositStatusLabel(row.security_deposit_status),
      dateBecame: row.start_date ? formatDisplayDate(row.start_date) : "—",
      dateBecameIso: row.start_date || null,
      moveOutDate: moveOutIso ? formatDisplayDate(moveOutIso) : "—",
      moveOutDateIso: moveOutIso,
      scheduledMoveOutDateIso: row.scheduled_move_out_date || null,
      status: tenantStatusLabel(row.is_active, hasTenantAssignment(row), row.scheduled_move_out_date),
      moveInDate: row.start_date ? formatDisplayDate(row.start_date) : "—",
      moveInDateIso: row.start_date || null,
      depositRequiredAmount: depositExpected,
      depositRequired: depositExpected ? `UGX ${formatAmount(depositExpected)}` : "—",
      depositPaidAmount: depositReceived,
      depositPaid: `UGX ${formatAmount(depositReceived)}`,
      rentDueDay,
      gracePeriodDays,
      dueDay: `${ordinalDay(rentDueDay)} of every month`,
      gracePeriod: `${gracePeriodDays} day${gracePeriodDays === 1 ? "" : "s"}`,
      notes: row.notes || "No notes.",
      isCaretaker: isCaretakerRow(row),
    };
  });
}

module.exports = {
  toApiPayments,
  toApiReceipts,
  toApiTenants,
  summarizeTenantDirectory,
};
