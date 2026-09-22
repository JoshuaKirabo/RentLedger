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

function previewSecurityDeposit(tenantId, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    const err = new Error("Amount must be a positive whole number of shillings");
    err.statusCode = 400;
    throw err;
  }

  const deposit = ledgerRepository.getSecurityDepositForActiveTenant(tenantId);
  if (!deposit) {
    const err = new Error("This tenant has no security deposit to pay");
    err.statusCode = 400;
    throw err;
  }

  const position = ledgerRepository.securityDepositPosition(deposit);
  const outstanding = position.outstanding;
  if (outstanding <= 0) {
    const err = new Error("This security deposit is already paid");
    err.statusCode = 400;
    throw err;
  }
  if (amount > outstanding) {
    const err = new Error(`Enter UGX ${outstanding.toLocaleString("en-UG")} or less.`);
    err.statusCode = 400;
    throw err;
  }

  const remaining = outstanding - amount;
  return {
    kind: "security_deposit",
    tenancyId: deposit.tenancy_id,
    outstandingBalance: remaining,
    purpose: "Security deposit",
    monthsCovered: "Security deposit",
    rows: [{
      month: "Security deposit",
      opening: outstanding,
      applied: amount,
      balanceRemaining: remaining,
      isAdvance: false,
    }],
  };
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
    tenant: tenant.name,
    receivedFrom: tenant.name,
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

function createSecurityDepositInTransaction(data) {
  const tenant = requireTenant(data.tenantId);
  const allocation = previewSecurityDeposit(data.tenantId, data.amount);
  const inserted = ledgerRepository.insertSecurityDepositPayment({
    tenantId: data.tenantId,
    date: data.date,
    amount: data.amount,
    method: data.method,
    bankRef: data.bankRef,
  });
  return buildPaymentResult(data, tenant, allocation, inserted);
}

function createPaymentInTransaction(data) {
  if (data.kind === "security_deposit") {
    return createSecurityDepositInTransaction(data);
  }

  const tenant = requireTenant(data.tenantId);
  const allocation = allocationService.computeAllocation(data.tenantId, data.amount);
  const inserted = insertAllocatedPayment(data, allocation);
  ledgerRepository.refreshReceiptBalancesForTenant(data.tenantId);
  return buildPaymentResult(data, tenant, allocation, inserted);
}

function createPayment(data) {
  return ledgerRepository.runInTransaction(() => createPaymentInTransaction(data));
}

const MAX_BATCH_PAYMENTS = 100;

function createPayments(items) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("At least one payment is required");
    err.statusCode = 400;
    throw err;
  }
  if (items.length > MAX_BATCH_PAYMENTS) {
    const err = new Error(`Maximum ${MAX_BATCH_PAYMENTS} payments per batch`);
    err.statusCode = 400;
    throw err;
  }

  const seenRefs = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const ref = String(items[i].bankRef || "").trim().toLowerCase();
    if (seenRefs.has(ref)) {
      const err = new Error(`Row ${i + 1}: Duplicate bank reference in this batch`);
      err.statusCode = 400;
      throw err;
    }
    seenRefs.add(ref);
  }

  return ledgerRepository.runInTransaction(() => {
    const results = [];
    for (let i = 0; i < items.length; i += 1) {
      try {
        results.push(createPaymentInTransaction(items[i]));
      } catch (err) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          const conflict = new Error(`Row ${i + 1}: That bank reference is already used by another payment`);
          conflict.statusCode = 409;
          throw conflict;
        }
        if (!/^\s*Row\s+\d+:/i.test(err.message || "")) {
          err.message = `Row ${i + 1}: ${err.message}`;
        }
        throw err;
      }
    }
    return {
      count: results.length,
      payments: results,
    };
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

module.exports = {
  previewPayment,
  previewSecurityDeposit,
  createPayment,
  createPayments,
  updatePayment,
  deletePayment,
};
