"use strict";

const dashboardRepository = require("../repositories/dashboardRepository");
const ledgerRepository = require("../repositories/ledgerRepository");
const tenantRepository = require("../repositories/tenantRepository");
const { summarizeTenantDirectory } = require("../lib/formatters");
const { currentRentMonth, formatRentMonthLabel } = require("../lib/rentMonths");

function formatUgxFull(n) {
  return `UGX ${Number(n || 0).toLocaleString("en-UG")}`;
}

function monthLabel(rentMonth, includeYear) {
  const d = new Date(`${rentMonth}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return rentMonth;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return includeYear ? `${month} ${d.getFullYear()}` : month;
}

function buildChart() {
  const rows = dashboardRepository.getMonthlyCollection(currentRentMonth(), 6).slice().reverse();
  const years = new Set(rows.map((r) => r.month.slice(0, 4)));
  const includeYear = years.size > 1;

  return {
    labels: rows.map((r) => monthLabel(r.month, includeYear)),
    expected: rows.map((r) => Number(r.expected) || 0),
    collected: rows.map((r) => Number(r.collected) || 0),
  };
}

function buildAttention() {
  return dashboardRepository.getTenantsInArrears(4).map((row) => ({
    name: row.name,
    unit: row.unit || "—",
    estate: row.estate || "—",
    months: Number(row.months) || 0,
    amount: formatUgxFull(row.outstanding),
    amountDisplay: formatUgxFull(row.outstanding),
  }));
}

function getSummary() {
  const year = new Date().getFullYear();
  const currentMonth = currentRentMonth();
  ledgerRepository.ensureRentObligationsThroughMonth(currentMonth);
  const totals = dashboardRepository.getRentTotals(currentMonth);
  const pendingRentMonths = dashboardRepository.getPendingRentMonthsCount(currentMonth);
  const tenantSummary = summarizeTenantDirectory(tenantRepository.getTenantDirectory());

  const totalExpected = Number(totals.expected) || 0;
  const totalCollected = Number(totals.collected) || 0;
  const totalOutstanding = Number(totals.outstanding) || 0;
  const yearCollected = dashboardRepository.getRentCollectedForYear(year);
  const yearExpected = dashboardRepository.getRentExpectedForYear(year, currentMonth);
  const yearCollectionRate = yearExpected > 0
    ? Math.round((yearCollected / yearExpected) * 100)
    : 0;
  const collectionRate = totalExpected > 0
    ? Math.round((totalCollected / totalExpected) * 100)
    : 0;

  return {
    year,
    yearCollected,
    yearCollectedDisplay: formatUgxFull(yearCollected),
    yearExpected,
    yearExpectedDisplay: formatUgxFull(yearExpected),
    yearCollectionRate,
    totalCollected,
    totalCollectedDisplay: formatUgxFull(totalCollected),
    totalExpected,
    totalExpectedDisplay: formatUgxFull(totalExpected),
    collectionRate,
    totalOutstanding,
    totalOutstandingDisplay: formatUgxFull(totalOutstanding),
    activeTenants: tenantSummary.activeTenants,
    totalTenants: tenantSummary.totalTenants,
    pendingRentMonths,
    securityDepositsPending: tenantSummary.securityDepositsPending,
    chart: buildChart(),
    attention: buildAttention(),
  };
}

function getOutstandingBalances() {
  const balancesByTenant = new Map();
  const currentMonth = currentRentMonth();
  ledgerRepository.ensureRentObligationsThroughMonth(currentMonth);

  dashboardRepository
    .getOutstandingRentObligations(currentMonth)
    .forEach((row) => {
      const tenantId = Number(row.tenant_id);
      let balance = balancesByTenant.get(tenantId);

      if (!balance) {
        balance = {
          id: `T${String(tenantId).padStart(3, "0")}`,
          name: row.tenant_name,
          estate: row.estate_name,
          house: row.house_number,
          phone: row.phone_number,
          pendingMonths: [],
          outstanding: 0,
        };
        balancesByTenant.set(tenantId, balance);
      }

      balance.pendingMonths.push(formatRentMonthLabel(row.rent_month));
      balance.outstanding += Number(row.outstanding) || 0;
    });

  return [...balancesByTenant.values()].sort(
    (a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name, "en")
  );
}

module.exports = { getSummary, getOutstandingBalances };
