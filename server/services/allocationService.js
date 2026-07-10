"use strict";

const ledgerRepository = require("../repositories/ledgerRepository");
const {
  currentRentMonth,
  formatRentMonthLabel,
  nextRentMonth,
  monthFromDate,
} = require("../lib/rentMonths");

const MAX_ADVANCE_MONTHS = 120;

function resolveAdvanceStartMonth(tenancyId, tenancyStartDate) {
  const lastMonth = ledgerRepository.getLastRentMonth(tenancyId);
  if (lastMonth) return nextRentMonth(lastMonth);
  if (tenancyStartDate) return monthFromDate(tenancyStartDate);
  return monthFromDate(new Date().toISOString());
}

function computeAllocation(tenantId, amount, options = {}) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    const err = new Error("Amount must be a positive whole number of shillings");
    err.statusCode = 400;
    throw err;
  }

  const tenancy = options.tenancyId
    ? ledgerRepository.getTenancyByIdForTenant(options.tenancyId, tenantId)
    : ledgerRepository.getActiveTenancy(tenantId);
  if (!tenancy) {
    const err = new Error("Tenant has no active tenancy");
    err.statusCode = 404;
    throw err;
  }

  const monthlyRent = tenancy.agreed_monthly_rent;
  if (!monthlyRent || monthlyRent <= 0) {
    const err = new Error("Tenant has no monthly rent configured");
    err.statusCode = 400;
    throw err;
  }
  ledgerRepository.ensureRentObligationsThroughMonth(currentRentMonth());

  let remaining = amount;
  const rows = [];

  const openObligations = ledgerRepository.getOpenRentObligations(tenancy.tenancy_id);
  for (const obligation of openObligations) {
    if (remaining <= 0) break;

    const opening = obligation.balance;
    const applied = Math.min(remaining, opening);
    remaining -= applied;

    rows.push({
      rentMonth: obligation.rent_month,
      month: formatRentMonthLabel(obligation.rent_month),
      rentObligationId: obligation.rent_obligation_id,
      opening,
      applied,
      balanceRemaining: opening - applied,
      isAdvance: false,
    });
  }

  if (remaining > 0) {
    let cursor = resolveAdvanceStartMonth(tenancy.tenancy_id, tenancy.start_date);
    let advanceCount = 0;

    while (remaining > 0 && advanceCount < MAX_ADVANCE_MONTHS) {
      const opening = monthlyRent;
      const applied = Math.min(remaining, opening);
      remaining -= applied;

      rows.push({
        rentMonth: cursor,
        month: formatRentMonthLabel(cursor),
        rentObligationId: null,
        opening,
        applied,
        balanceRemaining: opening - applied,
        isAdvance: true,
      });

      cursor = nextRentMonth(cursor);
      advanceCount += 1;
    }
  }

  const allocatedTotal = rows.reduce((sum, row) => sum + row.applied, 0);
  const outstandingBeforePayment = openObligations.reduce(
    (sum, obligation) => sum + obligation.balance,
    0
  );
  const allocatedToOutstanding = rows
    .filter((row) => !row.isAdvance)
    .reduce((sum, row) => sum + row.applied, 0);
  const outstandingBalance = Math.max(
    0,
    outstandingBeforePayment - allocatedToOutstanding
  );
  const monthsCovered = rows
    .filter((row) => row.applied > 0)
    .map((row) => row.month)
    .join(", ");

  return {
    tenantId,
    tenancyId: tenancy.tenancy_id,
    monthlyRent,
    totalAmount: amount,
    allocatedTotal,
    unallocated: remaining,
    outstandingBalance,
    rows,
    monthsCovered,
    purpose: monthsCovered ? `Rent for ${monthsCovered}` : "Rent payment",
  };
}

module.exports = {
  computeAllocation,
};
