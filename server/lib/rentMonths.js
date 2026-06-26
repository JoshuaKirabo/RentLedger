"use strict";

function formatRentMonthLabel(rentMonth) {
  const d = new Date(`${rentMonth}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return rentMonth;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
  return `${rentMonth}-05`;
}

function monthFromDate(isoDate) {
  return String(isoDate).slice(0, 7);
}

module.exports = {
  formatRentMonthLabel,
  nextRentMonth,
  currentRentMonth,
  dueDateForMonth,
  monthFromDate,
};
