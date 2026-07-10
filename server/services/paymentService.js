"use strict";

const tenantRepository = require("../repositories/tenantRepository");
const ledgerRepository = require("../repositories/ledgerRepository");
const allocationService = require("./allocationService");
const { toApiTenants } = require("../lib/formatters");
const { amountInWords } = require("../lib/amountInWords");
const { OUTSTANDING_START_MONTH } = require("../lib/rentMonths");

const CORRECTION_START_DATE = `${OUTSTANDING_START_MONTH}-01`;

function previewPayment(data) {
  return allocationService.computeAllocation(data.tenantId, data.amount);
}

function requireTenant(tenantId) {
  const tenantRow = tenantRepository.getTenantById(tenantId);
  const tenant = tenantRow ? toApiTenants([tenantRow])[0] : null;
  if (!tenant) {
    const err = new Error("Tenant not found");
    err.statusCode = 404;
    throw err;
  }
  return tenant;
}

function assertCorrectableRentPayment(payment, action) {
  if (payment.payment_type !== "RENT") {
    const err = new Error(`Only rent payments can be ${action} from this screen`);
    err.statusCode = 400;
    throw err;
  }
  if (payment.payment_date < CORRECTION_START_DATE) {
    const err = new Error("Payments before December 2025 are part of the opening history and cannot be changed");
    err.statusCode = 400;
    throw err;
  }
}

function buildPaymentResult(data, tenant, allocation, inserted) {
  const receiptBalance = ledgerRepository.getReceiptBalanceForPayment(inserted.paymentId);

  const payment = {
    paymentId: `P${String(inserted.paymentId).padStart(3, "0")}`,
    date: data.date,
    tenantId: tenant.tenantId,
    tenantName: tenant.name,
    unit: tenant.unit || tenant.house,
    estate: tenant.estate,
    amount: data.amount,
    method: ledgerRepository.METHOD_LABELS[data.method] || data.method,
    bankRef: data.bankRef || "",
    notes: data.notes || "",
    receiptNo: inserted.receiptNumber,
    status: "Paid",
  };

  const receipt = {
    receiptNo: inserted.receiptNumber,
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
    balance: String(receiptBalance),
  };

  return { payment, receipt, allocation };
}

function insertAllocatedPayment(data, allocation, receiptOptions = {}) {
  return ledgerRepository.insertPaymentWithReceipt(
    {
      tenantId: data.tenantId,
      tenancyId: allocation.tenancyId,
      date: data.date,
      amount: data.amount,
      method: data.method,
      bankRef: data.bankRef,
      receiptBalance: allocation.outstandingBalance,
    },
    allocation.rows,
    receiptOptions
  );
}

function createPayment(data) {
  return ledgerRepository.runInTransaction(() => {
    const tenant = requireTenant(data.tenantId);
    const allocation = allocationService.computeAllocation(data.tenantId, data.amount);
    const inserted = insertAllocatedPayment(data, allocation);
    ledgerRepository.refreshReceiptBalancesForTenant(data.tenantId);
    return buildPaymentResult(data, tenant, allocation, inserted);
  });
}

function updatePayment(paymentId, data) {
  return ledgerRepository.runInTransaction(() => {
    const original = ledgerRepository.getPostedPaymentById(paymentId);
    if (!original) {
      const err = new Error("Payment not found");
      err.statusCode = 404;
      throw err;
    }
    assertCorrectableRentPayment(original, "edited");

    const tenant = requireTenant(data.tenantId);
    ledgerRepository.reversePaymentForEdit(original.payment_id);

    const sameTenant = Number(original.tenant_id) === Number(String(data.tenantId).replace(/\D/g, ""));
    const allocation = allocationService.computeAllocation(
      data.tenantId,
      data.amount,
      sameTenant && original.tenancy_id ? { tenancyId: original.tenancy_id } : {}
    );
    const inserted = insertAllocatedPayment(data, allocation, {
      receiptId: original.receipt_id,
      receiptNumber: original.receipt_number,
    });

    ledgerRepository.refreshReceiptBalancesForTenant(original.tenant_id);
    if (!sameTenant) {
      ledgerRepository.refreshReceiptBalancesForTenant(data.tenantId);
    }

    return buildPaymentResult(data, tenant, allocation, inserted);
  });
}

function deletePayment(paymentId) {
  return ledgerRepository.runInTransaction(() => {
    const payment = ledgerRepository.getPostedPaymentById(paymentId);
    if (!payment) {
      const err = new Error("Payment not found");
      err.statusCode = 404;
      throw err;
    }
    assertCorrectableRentPayment(payment, "deleted");

    ledgerRepository.voidPayment(payment.payment_id);

    ledgerRepository.refreshReceiptBalancesForTenant(payment.tenant_id);
    return {
      paymentId: `P${String(payment.payment_id).padStart(3, "0")}`,
      receiptNo: payment.receipt_number || "",
      deleted: true,
    };
  });
}

module.exports = { previewPayment, createPayment, updatePayment, deletePayment };
