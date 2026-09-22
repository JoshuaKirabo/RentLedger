"use strict";

const express = require("express");
const settingsRepository = require("../repositories/settingsRepository");

const router = express.Router();

router.get("/", (_req, res) => {
  try {
    res.json(settingsRepository.getAppSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
