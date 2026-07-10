"use strict";

const OUTSTANDING_START_MONTH = "2025-12";

function formatRentMonthLabel(rentMonth) {
  const d = new Date(`${rentMonth}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return rentMonth;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatRentMonthLabelLong(rentMonth) {
  const d = new Date(`${rentMonth}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return rentMonth;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function parseRentMonths(value) {
  if (!value || value === "—") return [];
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return [...new Set(
    parts
      .map((part) => String(part).trim())
      .filter((part) => /^\d{4}-\d{2}$/.test(part))
  )].sort();
}

function formatRentPaymentPurpose(rentMonths) {
  const months = parseRentMonths(rentMonths);
  if (months.length === 0) return "Rent payment";
  if (months.length === 1) {
    return `Rent payment for ${formatRentMonthLabelLong(months[0])}`;
  }
  return `Rent payment for ${formatRentMonthLabelLong(months[0])} - ${formatRentMonthLabelLong(months[months.length - 1])}`;
}

function nextRentMonth(rentMonth) {
  const [year, month] = rentMonth.split("-").map(Number);
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function currentRentMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dueDateForMonth(rentMonth) {
  return `${rentMonth}-01`;
}

function monthFromDate(isoDate) {
  return String(isoDate).slice(0, 7);
}

module.exports = {
  OUTSTANDING_START_MONTH,
  formatRentMonthLabel,
  formatRentMonthLabelLong,
  formatRentPaymentPurpose,
  parseRentMonths,
  nextRentMonth,
  currentRentMonth,
  dueDateForMonth,
  monthFromDate,
};
