"use strict";

const express = require("express");
const ledgerRepository = require("../repositories/ledgerRepository");
const { toApiReceipts } = require("../lib/formatters");

const router = express.Router();

router.get("/", (_req, res) => {
  try {
    const receipts = ledgerRepository.getAllReceipts();
    res.json(toApiReceipts(receipts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/raw", (_req, res) => {
  try {
    res.json(ledgerRepository.getAllReceipts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
