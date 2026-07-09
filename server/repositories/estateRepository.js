"use strict";

const { open, applyScheduledMoveOuts } = require("../db/connection");
const { TENANT_DISPLAY_NAME_SQL } = require("../db/tenantSql");
const { getTenantById } = require("./tenantRepository");

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

function requireText(value, label, { required = true, maxLength = 120 } = {}) {
  const text = String(value || "").trim();
  if (!text && required) throw createError(`${label} is required`, 400);
  if (text.length > maxLength) throw createError(`${label} is too long`, 400);
  return text || null;
}

function validatePhoneNumber(value) {
  const phone = String(value || "").trim().replace(/[\s().-]/g, "");
  const normalized = phone.startsWith("00") ? `+${phone.slice(2)}`
    : /^0\d{9}$/.test(phone) ? `+256${phone.slice(1)}`
      : /^7\d{8}$/.test(phone) ? `+256${phone}`
        : /^256\d{9}$/.test(phone) ? `+${phone}`
          : phone;

  if (!/^\+2567\d{8}$/.test(normalized)) {
    throw createError("Enter a valid phone number in +256 format", 400);
  }
  return normalized;
}

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s)([a-z])/g, (_match, space, letter) => `${space}${letter.toUpperCase()}`);
}

function parseCaretakerName(value) {
  const text = String(value || "").trim().replace(/\s+caretaker\s*$/i, "").trim();
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) throw createError("Caretaker name is required", 400);

  if (parts.length === 1) {
    return { firstName: titleCaseName(parts[0]), lastName: "Caretaker" };
  }

  return {
    firstName: titleCaseName(parts[0]),
    lastName: titleCaseName(parts.slice(1).join(" ")),
  };
}

function caretakerUnitNumber(estateName) {
  const shortName = String(estateName || "").trim().split(/\s+/)[0] || "ESTATE";
  return `${shortName.toUpperCase()} CARETAKER`;
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findCaretakerForEstate(db, estateId) {
  return db.prepare(
    `SELECT
       t.tenant_id AS tenantId,
       t.first_name AS firstName,
       t.middle_name AS middleName,
       t.last_name AS lastName,
       t.phone_number AS phoneNumber,
       t.notes,
       u.unit_id AS unitId,
       u.unit_number AS unitNumber
     FROM tenants t
     JOIN tenancy_assignments ta
       ON ta.tenant_id = t.tenant_id
      AND ta.end_date IS NULL
     JOIN units u ON u.unit_id = ta.unit_id
     WHERE u.estate_id = ?
       AND (
         LOWER(u.unit_number) LIKE '%caretaker%'
         OR LOWER(COALESCE(t.notes, '')) LIKE '%caretaker%'
         OR LOWER(TRIM(COALESCE(t.first_name, '') || ' ' || COALESCE(t.middle_name, '') || ' ' || COALESCE(t.last_name, ''))) LIKE '%caretaker%'
       )
     LIMIT 1`
  ).get(estateId);
}

function findOrCreateCaretakerUnit(db, estateId, estateName) {
  const existing = db.prepare(
    `SELECT unit_id AS unitId, unit_number AS unitNumber
     FROM units
     WHERE estate_id = ?
       AND LOWER(unit_number) LIKE '%caretaker%'
     ORDER BY unit_id
     LIMIT 1`
  ).get(estateId);
  if (existing) return existing;

  const unitNumber = caretakerUnitNumber(estateName);
  const result = db.prepare(
    `INSERT INTO units (estate_id, unit_number, listed_monthly_rent)
     VALUES (?, ?, ?)`
  ).run(estateId, unitNumber, MIN_MONTHLY_RENT);

  return {
    unitId: result.lastInsertRowid,
    unitNumber,
  };
}

function upsertEstateCaretaker(estateId, data) {
  const id = parsePositiveId(estateId, "Estate");
  const name = requireText(data.name, "Caretaker name");
  const phoneNumber = validatePhoneNumber(data.phoneNumber);
  const { firstName, lastName } = parseCaretakerName(name);

  const db = open();
  applyScheduledMoveOuts(db);

  const estate = getEstateById(id);
  if (!estate || estate.isActive !== 1) throw createError("Estate not found", 404);

  const current = findCaretakerForEstate(db, id);
  const notes = `Caretaker for ${estate.estateName}.`;

  if (current) {
    try {
      db.prepare(
        `UPDATE tenants
         SET first_name = ?,
             middle_name = NULL,
             last_name = ?,
             phone_number = ?,
             notes = ?
         WHERE tenant_id = ?`
      ).run(firstName, lastName, phoneNumber, notes, current.tenantId);
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenants\.phone_number/i.test(err.message)) {
        throw createError("A tenant with this phone number already exists", 409);
      }
      throw err;
    }
    return getTenantById(current.tenantId);
  }

  const unit = findOrCreateCaretakerUnit(db, id, estate.estateName);
  const occupied = db.prepare(
    `SELECT 1
     FROM tenancy_assignments
     WHERE unit_id = ?
       AND end_date IS NULL`
  ).get(unit.unitId);
  if (occupied) {
    throw createError("The caretaker house for this estate is already occupied", 409);
  }

  const transaction = db.transaction(() => {
    const tenantResult = db.prepare(
      `INSERT INTO tenants (
         tenant_type,
         first_name,
         middle_name,
         last_name,
         phone_number,
         national_id_number,
         alt_phone_number,
         notes
       ) VALUES ('INDIVIDUAL', ?, NULL, ?, ?, NULL, NULL, ?)`
    ).run(firstName, lastName, phoneNumber, notes);

    const tenancyResult = db.prepare(
      `INSERT INTO tenancy_assignments (tenant_id, unit_id, start_date, agreed_monthly_rent)
       VALUES (?, ?, ?, ?)`
    ).run(tenantResult.lastInsertRowid, unit.unitId, todayIso(), MIN_MONTHLY_RENT);

    db.prepare(
      `INSERT INTO security_deposits (tenancy_id, expected_amount)
       VALUES (?, ?)`
    ).run(tenancyResult.lastInsertRowid, MIN_MONTHLY_RENT);

    return getTenantById(tenantResult.lastInsertRowid);
  });

  try {
    return transaction.immediate();
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenants\.phone_number/i.test(err.message)) {
      throw createError("A tenant with this phone number already exists", 409);
    }
    throw err;
  }
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
  upsertEstateCaretaker,
};
