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
    const { tenantId, date, amount, method, bankRef, notes, monthsCovered, purpose } = req.body;

    if (!tenantId || !date || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ error: "tenantId, date, and amount are required" });
    }

    const bankReference = String(bankRef || "").trim();
    if (!bankReference) {
      return res.status(400).json({ error: "Bank reference is required" });
    }

    const paymentAmount = parsePaymentAmount(amount);

    const result = paymentService.createPayment({
      tenantId,
      date,
      amount: paymentAmount,
      method,
      bankRef: bankReference,
      notes,
      monthsCovered,
      purpose,
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
