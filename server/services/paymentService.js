"use strict";

const tenantRepository = require("../repositories/tenantRepository");
const ledgerRepository = require("../repositories/ledgerRepository");
const allocationService = require("./allocationService");
const { toApiTenants } = require("../lib/formatters");
const { amountInWords } = require("../lib/amountInWords");

function previewPayment(data) {
  return allocationService.computeAllocation(data.tenantId, data.amount);
}

function createPayment(data) {
  const tenantRow = tenantRepository.getTenantById(data.tenantId);
  const tenant = tenantRow ? toApiTenants([tenantRow])[0] : null;
  if (!tenant) {
    const err = new Error("Tenant not found");
    err.statusCode = 404;
    throw err;
  }

  const allocation = allocationService.computeAllocation(data.tenantId, data.amount);
  const { paymentId, receiptNumber } = ledgerRepository.insertPaymentWithReceipt(
    {
      tenantId: data.tenantId,
      tenancyId: allocation.tenancyId,
      date: data.date,
      amount: data.amount,
      method: data.method,
      bankRef: data.bankRef,
      receiptBalance: allocation.outstandingBalance,
    },
    allocation.rows
  );

  const payment = {
    paymentId: `P${String(paymentId).padStart(3, "0")}`,
    date: data.date,
    tenantId: tenant.tenantId,
    tenantName: tenant.name,
    unit: tenant.unit || tenant.house,
    estate: tenant.estate,
    amount: data.amount,
    method: ledgerRepository.METHOD_LABELS[data.method] || data.method,
    bankRef: data.bankRef || "",
    notes: data.notes || "",
    receiptNo: receiptNumber,
    status: "Paid",
  };

  const receipt = {
    receiptNo: receiptNumber,
    tenantId: tenant.tenantId,
    tenantName: tenant.name,
    phone: tenant.phone,
    amount: data.amount,
    monthsCovered: allocation.monthsCovered || "—",
    date: data.date,
    emailStatus: "Pending",
    smsStatus: "Pending",
    amountWords: amountInWords(data.amount),
    purpose: data.purpose || allocation.purpose,
    paymentRef: data.bankRef || "",
    balance: String(allocation.outstandingBalance),
  };

  return { payment, receipt, allocation };
}

module.exports = { previewPayment, createPayment };
