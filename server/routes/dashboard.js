"use strict";

const express = require("express");
const dashboardService = require("../services/dashboardService");

const router = express.Router();

router.get("/", (_req, res) => {
  try {
    res.json(dashboardService.getSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/outstanding-balances", (_req, res) => {
  try {
    res.json(dashboardService.getOutstandingBalances());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
