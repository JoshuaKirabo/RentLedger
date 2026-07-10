"use strict";

const express = require("express");
const ledgerRepository = require("../repositories/ledgerRepository");
const paymentService = require("../services/paymentService");
const { toApiPayments } = require("../lib/formatters");

const router = express.Router();

const MAX_PAYMENT_AMOUNT = 999_999_999_999;
const PAYMENT_AMOUNT_ERROR = "Whole shillings only. Maximum UGX 999,999,999,999 per payment.";

function parsePaymentAmount(rawAmount) {
  const paymentAmount = Number(rawAmount);
  if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0 || paymentAmount > MAX_PAYMENT_AMOUNT) {
    const err = new Error(PAYMENT_AMOUNT_ERROR);
    err.statusCode = 400;
    throw err;
  }
  return paymentAmount;
}

function parsePaymentDate(rawDate) {
  const date = String(rawDate || "").trim();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    const err = new Error("Payment date must be a valid date");
    err.statusCode = 400;
    throw err;
  }
  return date;
}

function parsePaymentMethod(rawMethod) {
  const method = String(rawMethod || "agb");
  if (!["bank", "mobile", "agb"].includes(method)) {
    const err = new Error("Choose a valid deposit channel");
    err.statusCode = 400;
    throw err;
  }
  return method;
}

function parsePaymentInput(body = {}) {
  const { tenantId, date, amount, method, bankRef, notes, monthsCovered, purpose } = body;
  if (!tenantId || !date || amount === undefined || amount === null || amount === "") {
    const err = new Error("tenantId, date, and amount are required");
    err.statusCode = 400;
    throw err;
  }

  const bankReference = String(bankRef || "").trim();
  if (!bankReference) {
    const err = new Error("Bank reference is required");
    err.statusCode = 400;
    throw err;
  }

  return {
    tenantId,
    date: parsePaymentDate(date),
    amount: parsePaymentAmount(amount),
    method: parsePaymentMethod(method),
    bankRef: bankReference,
    notes,
    monthsCovered,
    purpose,
  };
}

function sendPaymentError(res, err) {
  if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return res.status(409).json({ error: "That bank reference is already used by another payment" });
  }
  return res.status(500).json({ error: err.message });
}

router.get("/preview", (req, res) => {
  try {
    const { tenantId, amount } = req.query;
    if (!tenantId || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ error: "tenantId and amount are required" });
    }

    const preview = paymentService.previewPayment({
      tenantId,
      amount: parsePaymentAmount(amount),
    });
    res.json(preview);
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get("/", (_req, res) => {
  try {
    const payments = ledgerRepository.getAllPayments();
    res.json(toApiPayments(payments));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/raw", (_req, res) => {
  try {
    res.json(ledgerRepository.getAllPayments());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const result = paymentService.createPayment(parsePaymentInput(req.body));

    res.status(201).json(result);
  } catch (err) {
    return sendPaymentError(res, err);
  }
});

router.post("/batch", (req, res) => {
  try {
    const rawPayments = req.body?.payments;
    if (!Array.isArray(rawPayments) || !rawPayments.length) {
      return res.status(400).json({ error: "payments array is required" });
    }

    const payments = rawPayments.map((item, index) => {
      try {
        return parsePaymentInput(item);
      } catch (err) {
        if (!/^\s*Row\s+\d+:/i.test(err.message || "")) {
          err.message = `Row ${index + 1}: ${err.message}`;
        }
        throw err;
      }
    });

    const result = paymentService.createPayments(payments);
    return res.status(201).json(result);
  } catch (err) {
    return sendPaymentError(res, err);
  }
});

router.put("/:paymentId", (req, res) => {
  try {
    const result = paymentService.updatePayment(
      req.params.paymentId,
      parsePaymentInput(req.body)
    );
    return res.json(result);
  } catch (err) {
    return sendPaymentError(res, err);
  }
});

router.delete("/:paymentId", (req, res) => {
  try {
    return res.json(paymentService.deletePayment(req.params.paymentId));
  } catch (err) {
    return sendPaymentError(res, err);
  }
});

module.exports = router;
