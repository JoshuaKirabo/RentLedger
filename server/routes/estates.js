"use strict";

const express = require("express");
const estateRepository = require("../repositories/estateRepository");
const { toApiTenants } = require("../lib/formatters");

const router = express.Router();

function handleError(res, err) {
  if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(500).json({ error: err.message });
}

router.put("/:estateId/caretaker", (req, res) => {
  try {
    const caretaker = estateRepository.upsertEstateCaretaker(req.params.estateId, req.body || {});
    return res.json({ caretaker: toApiTenants([caretaker])[0] });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/:estateId/units", (req, res) => {
  try {
    return res.json(estateRepository.getEstateUnits(req.params.estateId));
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/:estateId/units", (req, res) => {
  try {
    const unit = estateRepository.createUnit(req.params.estateId, req.body || {});
    return res.status(201).json(unit);
  } catch (err) {
    return handleError(res, err);
  }
});

router.put("/units/:unitId", (req, res) => {
  try {
    const unit = estateRepository.updateUnit(req.params.unitId, req.body || {});
    return res.json(unit);
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/units/:unitId", (req, res) => {
  try {
    return res.json(estateRepository.deleteUnit(req.params.unitId));
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
