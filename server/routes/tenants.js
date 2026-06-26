"use strict";

const express = require("express");
const tenantRepository = require("../repositories/tenantRepository");
const { toApiTenants } = require("../lib/formatters");

const router = express.Router();

router.get("/available-units", (req, res) => {
  try {
    const { estateId, tenantId } = req.query;
    if (estateId === undefined) {
      return res.json({ estates: tenantRepository.getActiveEstatesWithAvailability() });
    }

    const numericEstateId = Number(estateId);
    if (!Number.isSafeInteger(numericEstateId) || numericEstateId <= 0) {
      return res.status(400).json({ error: "A valid estate is required" });
    }

    const estate = tenantRepository.getActiveEstateById(numericEstateId);
    if (!estate) return res.status(404).json({ error: "Estate not found" });

    return res.json({
      estate,
      units: tenantRepository.getAvailableUnitsForEstate(numericEstateId, tenantId),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/", (_req, res) => {
  try {
    const rows = tenantRepository.getTenantDirectory();
    res.json(toApiTenants(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const tenant = tenantRepository.createTenantWithTenancy(req.body || {});
    return res.status(201).json(toApiTenants([tenant])[0]);
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 409) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

router.put("/:tenantId", (req, res) => {
  try {
    const tenant = tenantRepository.updateTenantProfile(req.params.tenantId, req.body || {});
    return res.json(toApiTenants([tenant])[0]);
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
