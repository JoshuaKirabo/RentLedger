"use strict";

const { open } = require("../db/connection");

function getSetting(key) {
  const row = open().prepare(`
    SELECT setting_value
    FROM app_settings
    WHERE setting_key = ?
  `).get(key);
  return String(row?.setting_value || "").trim();
}

function getAppSettings() {
  return {
    waiverApprovedBy: getSetting("waiver_approved_by"),
  };
}

module.exports = { getAppSettings };
