"use strict";

const { open, applyScheduledMoveOuts } = require("../db/connection");
const { TENANT_DISPLAY_NAME_SQL } = require("../db/tenantSql");

function syncScheduledMoveOuts() {
  applyScheduledMoveOuts(open());
}

// Current-month expected/collected rent, plus outstanding rent due through the
// current month. Expected rent is the sum of active tenants' monthly rent for
// this rent month; outstanding remains cumulative arrears through this month.
function getRentTotals(rentMonth) {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN ro.rent_month = ? THEN ro.amount_due ELSE 0 END), 0) AS expected,
      COALESCE(SUM(CASE WHEN ro.rent_month = ? THEN ro.allocated_amount ELSE 0 END), 0) AS collected,
      COALESCE(SUM(CASE WHEN ro.rent_month <= ? THEN ro.amount_due - ro.allocated_amount ELSE 0 END), 0) AS outstanding
    FROM rent_obligations ro
    JOIN tenancy_assignments ta
      ON ta.tenancy_id = ro.tenancy_id
     AND ta.end_date IS NULL
    WHERE ro.rent_month <= ?
  `).get(rentMonth, rentMonth, rentMonth, rentMonth);
}

// Rent collected (posted payments) within a calendar year.
function getRentCollectedForYear(year) {
  syncScheduledMoveOuts();
  const row = open().prepare(`
    SELECT COALESCE(SUM(p.amount), 0) AS total
    FROM payments p
    WHERE p.payment_status = 'POSTED'
      AND p.payment_type IN ('RENT', 'MIXED')
      AND substr(p.payment_date, 1, 4) = ?
  `).get(String(year));
  return row?.total || 0;
}

// Expected rent due for a calendar year through the current rent month (YTD).
function getRentExpectedForYear(year, upToMonth) {
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const endMonth = String(year) === upToMonth.slice(0, 4) ? upToMonth : yearEnd;

  const row = open().prepare(`
    SELECT COALESCE(SUM(ro.amount_due), 0) AS total
    FROM rent_obligations ro
    JOIN tenancy_assignments ta
      ON ta.tenancy_id = ro.tenancy_id
     AND ta.end_date IS NULL
    WHERE ro.rent_month >= ?
      AND ro.rent_month <= ?
  `).get(yearStart, endMonth);
  return row?.total || 0;
}

// Active-tenant counts derived from the account-status reporting view.
function getTenantCounts() {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      COUNT(*) AS totalActive,
      COALESCE(SUM(CASE WHEN pending_months_owed = 0 THEN 1 ELSE 0 END), 0) AS paid,
      COALESCE(SUM(CASE WHEN pending_months_owed > 0 THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN security_deposit_status <> 'PAID' THEN 1 ELSE 0 END), 0) AS depositsPending
    FROM v_tenant_account_status
  `).get();
}

// Count of individual unpaid rent periods across active tenancies.
function getPendingRentMonthsCount(upToMonth) {
  syncScheduledMoveOuts();
  const row = open().prepare(`
    SELECT COUNT(*) AS total
    FROM rent_obligations ro
    JOIN tenancy_assignments ta
      ON ta.tenancy_id = ro.tenancy_id
     AND ta.end_date IS NULL
    WHERE ro.rent_month <= ?
      AND ro.allocated_amount < ro.amount_due
  `).get(upToMonth);
  return row?.total || 0;
}

// Expected vs collected rent grouped by month, most recent months first,
// capped at the given month so future obligations don't skew the view.
function getMonthlyCollection(upToMonth, limit = 6) {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      ro.rent_month AS month,
      COALESCE(SUM(ro.amount_due), 0) AS expected,
      COALESCE(SUM(ro.allocated_amount), 0) AS collected
    FROM rent_obligations ro
    JOIN tenancy_assignments ta
      ON ta.tenancy_id = ro.tenancy_id
     AND ta.end_date IS NULL
    WHERE ro.rent_month <= ?
    GROUP BY ro.rent_month
    ORDER BY ro.rent_month DESC
    LIMIT ?
  `).all(upToMonth, limit);
}

// Active tenants with unpaid rent, largest balance first.
function getTenantsInArrears(limit = 4) {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      tenant_name AS name,
      house_number AS unit,
      estate_name AS estate,
      pending_months_owed AS months,
      rent_outstanding_balance AS outstanding
    FROM v_tenant_account_status
    WHERE pending_months_owed > 0
    ORDER BY rent_outstanding_balance DESC, pending_months_owed DESC
    LIMIT ?
  `).all(limit);
}

// One row per unpaid or partially-paid obligation for an active tenancy. Keeping
// the rows separate lets the service preserve the actual pending-month order
// while it builds the tenant-level arrears register returned to the client.
function getOutstandingRentObligations(upToMonth) {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      t.tenant_id,
      ${TENANT_DISPLAY_NAME_SQL} AS tenant_name,
      t.phone_number,
      e.estate_name,
      u.unit_number AS house_number,
      ro.rent_month,
      (ro.amount_due - ro.allocated_amount) AS outstanding
    FROM rent_obligations ro
    JOIN tenancy_assignments ta
      ON ta.tenancy_id = ro.tenancy_id
     AND ta.end_date IS NULL
    JOIN tenants t ON t.tenant_id = ta.tenant_id
    JOIN units u ON u.unit_id = ta.unit_id
    JOIN estates e ON e.estate_id = u.estate_id
    WHERE ro.rent_month <= ?
      AND ro.allocated_amount < ro.amount_due
    ORDER BY t.tenant_id, ro.rent_month
  `).all(upToMonth);
}

module.exports = {
  getRentTotals,
  getRentCollectedForYear,
  getRentExpectedForYear,
  getTenantCounts,
  getPendingRentMonthsCount,
  getMonthlyCollection,
  getTenantsInArrears,
  getOutstandingRentObligations,
};
