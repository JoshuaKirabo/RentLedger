"use strict";

const express = require("express");
const healthRoutes = require("./health");
const tenantsRoutes = require("./tenants");
const paymentsRoutes = require("./payments");
const receiptsRoutes = require("./receipts");
const dashboardRoutes = require("./dashboard");

const router = express.Router();

router.use(healthRoutes);
router.use("/tenants", tenantsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/receipts", receiptsRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
