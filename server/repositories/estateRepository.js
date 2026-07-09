"use strict";

const { open, applyScheduledMoveOuts } = require("../db/connection");
const { TENANT_DISPLAY_NAME_SQL } = require("../db/tenantSql");

const MIN_MONTHLY_RENT = 100000;
const MAX_MONTHLY_RENT = 15000000;

function createError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parsePositiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError(`${label} is required`, 400);
  }
  return id;
}

function parseWholeAmount(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = typeof value === "string" ? value.replace(/[\s,]/g, "") : value;
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount < minimum || amount > maximum) {
    throw createError(
      `${label} must be a whole-number amount between UGX ${minimum.toLocaleString("en-UG")} and UGX ${maximum.toLocaleString("en-UG")}`,
      400
    );
  }
  return amount;
}

function normalizeUnitNumber(value) {
  const text = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (text.length < 2) {
    throw createError("House number must be at least 2 characters", 400);
  }
  if (text.length > 30) {
    throw createError("House number is too long", 400);
  }
  return text;
}

function getEstateById(estateId) {
  return open()
    .prepare(
      `SELECT estate_id AS estateId, estate_name AS estateName, is_active AS isActive
       FROM estates
       WHERE estate_id = ?`
    )
    .get(estateId);
}

function mapUnitRow(row) {
  const occupied = Boolean(row.tenantId);
  return {
    unitId: row.unitId,
    unitNumber: row.unitNumber,
    listedMonthlyRent: row.listedMonthlyRent,
    isActive: row.isActive === 1,
    occupied,
    tenantId: occupied ? `T${String(row.tenantId).padStart(3, "0")}` : null,
    tenantName: occupied ? row.tenantName : null,
  };
}

function getEstateUnits(estateId) {
  const id = parsePositiveId(estateId, "Estate");
  const db = open();
  applyScheduledMoveOuts(db);

  const estate = getEstateById(id);
  if (!estate) throw createError("Estate not found", 404);

  const rows = db
    .prepare(
      `SELECT
         u.unit_id AS unitId,
         u.unit_number AS unitNumber,
         u.listed_monthly_rent AS listedMonthlyRent,
         u.is_active AS isActive,
         ta.tenant_id AS tenantId,
         ${TENANT_DISPLAY_NAME_SQL} AS tenantName
       FROM units u
       LEFT JOIN tenancy_assignments ta
         ON ta.unit_id = u.unit_id
        AND ta.end_date IS NULL
       LEFT JOIN tenants t ON t.tenant_id = ta.tenant_id
       WHERE u.estate_id = ?
       ORDER BY u.unit_number COLLATE NOCASE`
    )
    .all(id);

  return {
    estate: { estateId: estate.estateId, estateName: estate.estateName },
    units: rows.map(mapUnitRow),
  };
}

function getUnitDetail(unitId) {
  return open()
    .prepare(
      `SELECT
         u.unit_id AS unitId,
         u.estate_id AS estateId,
         u.unit_number AS unitNumber,
         u.listed_monthly_rent AS listedMonthlyRent,
         u.is_active AS isActive,
         ta.tenant_id AS tenantId,
         ${TENANT_DISPLAY_NAME_SQL} AS tenantName
       FROM units u
       LEFT JOIN tenancy_assignments ta
         ON ta.unit_id = u.unit_id
        AND ta.end_date IS NULL
       LEFT JOIN tenants t ON t.tenant_id = ta.tenant_id
       WHERE u.unit_id = ?`
    )
    .get(unitId);
}

function createUnit(estateId, data) {
  const id = parsePositiveId(estateId, "Estate");
  const unitNumber = normalizeUnitNumber(data.unitNumber);
  const listedMonthlyRent = parseWholeAmount(
    data.listedMonthlyRent,
    "Listed monthly rent",
    MIN_MONTHLY_RENT,
    MAX_MONTHLY_RENT
  );

  const db = open();
  const estate = db
    .prepare(`SELECT estate_id FROM estates WHERE estate_id = ? AND is_active = 1`)
    .get(id);
  if (!estate) throw createError("Estate not found", 404);

  try {
    const result = db
      .prepare(
        `INSERT INTO units (estate_id, unit_number, listed_monthly_rent)
         VALUES (?, ?, ?)`
      )
      .run(id, unitNumber, listedMonthlyRent);
    return mapUnitRow(getUnitDetail(result.lastInsertRowid));
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createError("A house with this number already exists in this estate", 409);
    }
    throw err;
  }
}

function updateUnit(unitId, data) {
  const id = parsePositiveId(unitId, "House");
  const db = open();
  applyScheduledMoveOuts(db);

  const current = getUnitDetail(id);
  if (!current) throw createError("House not found", 404);

  const unitNumber = normalizeUnitNumber(data.unitNumber ?? current.unitNumber);
  const listedMonthlyRent = parseWholeAmount(
    data.listedMonthlyRent ?? current.listedMonthlyRent,
    "Listed monthly rent",
    MIN_MONTHLY_RENT,
    MAX_MONTHLY_RENT
  );

  let isActive = current.isActive;
  if (data.isActive !== undefined) {
    isActive = data.isActive === true || data.isActive === 1 || data.isActive === "1" ? 1 : 0;
  }

  if (!isActive && current.tenantId) {
    throw createError("This house is occupied and cannot be marked unavailable. Move the tenant out first.", 409);
  }

  try {
    db.prepare(
      `UPDATE units
       SET unit_number = ?,
           listed_monthly_rent = ?,
           is_active = ?
       WHERE unit_id = ?`
    ).run(unitNumber, listedMonthlyRent, isActive, id);
    return mapUnitRow(getUnitDetail(id));
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createError("A house with this number already exists in this estate", 409);
    }
    throw err;
  }
}

function deleteUnit(unitId) {
  const id = parsePositiveId(unitId, "House");
  const db = open();
  applyScheduledMoveOuts(db);

  const current = getUnitDetail(id);
  if (!current) throw createError("House not found", 404);
  if (current.tenantId) {
    throw createError("This house is occupied and cannot be removed. Move the tenant out first.", 409);
  }

  const history = db
    .prepare(`SELECT 1 FROM tenancy_assignments WHERE unit_id = ? LIMIT 1`)
    .get(id);
  if (history) {
    throw createError(
      "This house has tenancy history and cannot be removed. Mark it unavailable instead.",
      409
    );
  }

  try {
    db.prepare(`DELETE FROM units WHERE unit_id = ?`).run(id);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      throw createError(
        "This house has tenancy history and cannot be removed. Mark it unavailable instead.",
        409
      );
    }
    throw err;
  }

  return { unitId: id, deleted: true };
}

module.exports = {
  getEstateUnits,
  createUnit,
  updateUnit,
  deleteUnit,
};
