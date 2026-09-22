"use strict";

const express = require("express");
const waiverRepository = require("../repositories/waiverRepository");

const router = express.Router();

function sendError(res, err) {
  res.status(err.statusCode || 500).json({ error: err.message });
}

router.get("/", (_req, res) => {
  try {
    res.json(waiverRepository.listWaivers());
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/", (req, res) => {
  try {
    const waiver = waiverRepository.createWaiver(req.body || {});
    res.status(201).json(waiver);
  } catch (err) {
    sendError(res, err);
  }
});

router.put("/:waiverId", (req, res) => {
  try {
    const waiver = waiverRepository.updateWaiverMonths(req.params.waiverId, req.body?.months);
    res.json(waiver);
  } catch (err) {
    sendError(res, err);
  }
});

router.delete("/:waiverId", (req, res) => {
  try {
    waiverRepository.deleteWaiver(req.params.waiverId);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
