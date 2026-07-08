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
    throw createError(`${label} must be a whole-number amount between UGX ${minimum.toLocaleString("en-UG")} and UGX ${maximum.toLocaleString("en-UG")}`, 400);
  }
  return amount;
}

function requireText(value, label, { required = true, maxLength = 80 } = {}) {
  const text = String(value || "").trim();
  if (!text && required) throw createError(`${label} is required`, 400);
  if (text.length > maxLength) throw createError(`${label} is too long`, 400);
  return text || null;
}

function validateDate(value, label = "Move-in date") {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError(`${label} must be a valid date`, 400);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw createError(`${label} must be a valid date`, 400);
  }
  return date;
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

function validateOptionalPhoneNumber(value) {
  const text = String(value || "").trim();
  if (!text || text === "—") return null;
  return validatePhoneNumber(text);
}

function validateNationalIdNumber(value, { required = true } = {}) {
  const text = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!text && !required) return null;
  if (!text && required) throw createError("National ID number is required", 400);
  if (!/^[A-Z0-9]{8,20}$/.test(text)) {
    throw createError("Enter a valid national ID number", 400);
  }
  return text;
}

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s)([a-z])/g, (_match, space, letter) => `${space}${letter.toUpperCase()}`);
}

function parseSmallInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw createError(`${label} must be between ${minimum} and ${maximum}`, 400);
  }
  return number;
}

function parseTenantId(value) {
  return parseInt(String(value).replace(/\D/g, ""), 10) || null;
}

function securityDepositStatus(receivedAmount, expectedAmount) {
  if (receivedAmount <= 0) return "UNPAID";
  if (receivedAmount >= expectedAmount) return "PAID";
  return "PARTIAL";
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function syncScheduledMoveOuts() {
  applyScheduledMoveOuts(open());
}

function getTenantDirectory() {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      t.tenant_id,
      t.tenant_type,
      t.business_name,
      t.first_name,
      t.middle_name,
      t.last_name,
      t.phone_number,
      t.national_id_number,
      t.alt_phone_number,
      t.notes,
      t.is_active,
      ${TENANT_DISPLAY_NAME_SQL} AS tenant_name,
      e.estate_id,
      e.estate_name,
      u.unit_id,
      u.unit_number AS house_number,
      ta.tenancy_id,
      ta.agreed_monthly_rent AS expected_monthly_rent,
      ta.rent_due_day,
      ta.grace_period_days,
      ta.start_date,
      ta.end_date,
      ta.scheduled_move_out_date,
      sd.security_deposit_id,
      sd.status AS security_deposit_status,
      sd.expected_amount AS security_deposit_expected,
      sd.received_amount AS security_deposit_received
    FROM tenants t
    LEFT JOIN tenancy_assignments ta
      ON ta.tenancy_id = (
        SELECT ta2.tenancy_id
        FROM tenancy_assignments ta2
        WHERE ta2.tenant_id = t.tenant_id
        ORDER BY
          CASE WHEN ta2.end_date IS NULL THEN 0 ELSE 1 END,
          COALESCE(ta2.end_date, '9999-12-31') DESC,
          ta2.start_date DESC,
          ta2.tenancy_id DESC
        LIMIT 1
      )
    LEFT JOIN units u ON u.unit_id = ta.unit_id
    LEFT JOIN estates e ON e.estate_id = u.estate_id
    LEFT JOIN security_deposits sd ON sd.tenancy_id = ta.tenancy_id
    ORDER BY tenant_name
  `).all();
}

function getActiveTenants() {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      t.tenant_id,
      t.first_name,
      t.middle_name,
      t.last_name,
      t.phone_number,
      t.national_id_number,
      t.alt_phone_number,
      t.notes,
      t.is_active,
      d.tenant_name,
      d.estate_id,
      d.estate_name,
      d.unit_id,
      d.house_number,
      d.tenancy_id,
      d.expected_monthly_rent,
      d.rent_due_day,
      d.grace_period_days,
      d.start_date,
      d.end_date,
      d.scheduled_move_out_date,
      d.security_deposit_id,
      d.security_deposit_status,
      d.security_deposit_expected,
      d.security_deposit_received
    FROM tenants t
    JOIN v_current_tenant_directory d ON d.tenant_id = t.tenant_id
    WHERE t.is_active = 1
    ORDER BY d.tenant_name
  `).all();
}

function getTenantById(tenantId) {
  syncScheduledMoveOuts();
  const numericId = parseInt(String(tenantId).replace(/\D/g, ""), 10);
  if (!numericId) return null;

  return open().prepare(`
    SELECT
      t.tenant_id,
      t.tenant_type,
      t.business_name,
      t.first_name,
      t.middle_name,
      t.last_name,
      t.phone_number,
      t.national_id_number,
      t.alt_phone_number,
      t.notes,
      t.is_active,
      ${TENANT_DISPLAY_NAME_SQL} AS tenant_name,
      e.estate_id,
      e.estate_name,
      u.unit_id,
      u.unit_number AS house_number,
      ta.tenancy_id,
      ta.agreed_monthly_rent AS expected_monthly_rent,
      ta.rent_due_day,
      ta.grace_period_days,
      ta.start_date,
      ta.end_date,
      ta.scheduled_move_out_date,
      sd.security_deposit_id,
      sd.status AS security_deposit_status,
      sd.expected_amount AS security_deposit_expected,
      sd.received_amount AS security_deposit_received
    FROM tenants t
    LEFT JOIN tenancy_assignments ta
      ON ta.tenancy_id = (
        SELECT ta2.tenancy_id
        FROM tenancy_assignments ta2
        WHERE ta2.tenant_id = t.tenant_id
        ORDER BY
          CASE WHEN ta2.end_date IS NULL THEN 0 ELSE 1 END,
          COALESCE(ta2.end_date, '9999-12-31') DESC,
          ta2.start_date DESC,
          ta2.tenancy_id DESC
        LIMIT 1
      )
    LEFT JOIN units u ON u.unit_id = ta.unit_id
    LEFT JOIN estates e ON e.estate_id = u.estate_id
    LEFT JOIN security_deposits sd ON sd.tenancy_id = ta.tenancy_id
    WHERE t.tenant_id = ?
  `).get(numericId);
}

function getActiveEstatesWithAvailability() {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT
      e.estate_id AS estateId,
      e.estate_name AS estateName,
      COUNT(u.unit_id) AS totalRooms,
      SUM(CASE WHEN u.unit_id IS NOT NULL AND ta.tenancy_id IS NULL THEN 1 ELSE 0 END) AS availableRooms
    FROM estates e
    LEFT JOIN units u
      ON u.estate_id = e.estate_id
     AND u.is_active = 1
    LEFT JOIN tenancy_assignments ta
      ON ta.unit_id = u.unit_id
     AND ta.end_date IS NULL
    WHERE e.is_active = 1
    GROUP BY e.estate_id, e.estate_name
    ORDER BY e.estate_name COLLATE NOCASE
  `).all();
}

function getActiveEstateById(estateId) {
  syncScheduledMoveOuts();
  return open().prepare(`
    SELECT estate_id AS estateId, estate_name AS estateName
    FROM estates
    WHERE estate_id = ?
      AND is_active = 1
  `).get(estateId);
}

function getAvailableUnitsForEstate(estateId, includeTenantId = null) {
  syncScheduledMoveOuts();
  const tenantId = includeTenantId ? parseTenantId(includeTenantId) : null;
  return open().prepare(`
    SELECT
      u.unit_id AS unitId,
      u.unit_number AS unitNumber,
      u.listed_monthly_rent AS listedMonthlyRent
    FROM units u
    JOIN estates e ON e.estate_id = u.estate_id
    LEFT JOIN tenancy_assignments ta
      ON ta.unit_id = u.unit_id
     AND ta.end_date IS NULL
    WHERE u.estate_id = ?
      AND u.is_active = 1
      AND e.is_active = 1
      AND (ta.tenancy_id IS NULL OR ta.tenant_id = ?)
    ORDER BY u.unit_number COLLATE NOCASE
  `).all(estateId, tenantId);
}

function createTenantWithTenancy(data) {
  const tenantType = String(data.tenantType || "INDIVIDUAL").trim().toUpperCase() === "BUSINESS"
    ? "BUSINESS"
    : "INDIVIDUAL";

  const tenancy = {
    phoneNumber: validatePhoneNumber(data.phoneNumber),
    estateId: parsePositiveId(data.estateId, "Estate"),
    unitId: parsePositiveId(data.unitId, "Room"),
    moveInDate: validateDate(data.moveInDate),
    monthlyRent: parseWholeAmount(data.monthlyRent, "Monthly rent", MIN_MONTHLY_RENT, MAX_MONTHLY_RENT),
    securityDeposit: parseWholeAmount(data.securityDeposit, "Security deposit", 1),
  };

  let tenant;
  if (tenantType === "BUSINESS") {
    tenant = {
      tenantType,
      businessName: requireText(data.businessName, "Business name", { maxLength: 120 }),
      ...tenancy,
    };
  } else {
    tenant = {
      tenantType,
      firstName: requireText(data.firstName, "First name"),
      middleName: requireText(data.middleName, "Middle name", { required: false }),
      lastName: requireText(data.lastName, "Last name"),
      nationalIdNumber: validateNationalIdNumber(data.nationalIdNumber),
      ...tenancy,
    };
  }

  const db = open();
  const getUnit = db.prepare(`
    SELECT u.unit_id, u.listed_monthly_rent
    FROM units u
    JOIN estates e ON e.estate_id = u.estate_id
    WHERE u.unit_id = ?
      AND u.estate_id = ?
      AND u.is_active = 1
      AND e.is_active = 1
  `);
  const hasActiveTenancy = db.prepare(`
    SELECT 1
    FROM tenancy_assignments
    WHERE unit_id = ?
      AND end_date IS NULL
  `);
  const insertIndividualTenant = db.prepare(`
      INSERT INTO v_tenant_input (first_name, middle_name, last_name, phone_number, national_id_number, alt_phone_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBusinessTenant = db.prepare(`
    INSERT INTO tenants (
      tenant_type,
      business_name,
      first_name,
      middle_name,
      last_name,
      phone_number,
      alt_phone_number,
      notes
    ) VALUES ('BUSINESS', ?, 'Business', NULL, 'Tenant', ?, ?, ?)
  `);
  const getInsertedTenant = db.prepare(`
    SELECT tenant_id
    FROM tenants
    WHERE phone_number = ?
  `);
  const insertTenancy = db.prepare(`
    INSERT INTO tenancy_assignments (tenant_id, unit_id, start_date, agreed_monthly_rent)
    VALUES (?, ?, ?, ?)
  `);
  const insertSecurityDeposit = db.prepare(`
    INSERT INTO security_deposits (tenancy_id, expected_amount)
    VALUES (?, ?)
  `);

  const transaction = db.transaction(() => {
    const unit = getUnit.get(tenant.unitId, tenant.estateId);
    if (!unit) {
      throw createError("That room is no longer available in the selected estate", 409);
    }
    if (hasActiveTenancy.get(tenant.unitId)) {
      throw createError("That room is already occupied. Choose another available room.", 409);
    }

    if (tenant.tenantType === "BUSINESS") {
      insertBusinessTenant.run(tenant.businessName, tenant.phoneNumber, null, "No notes.");
    } else {
      insertIndividualTenant.run(
        tenant.firstName,
        tenant.middleName,
        tenant.lastName,
        tenant.phoneNumber,
        tenant.nationalIdNumber,
        null,
        "No notes."
      );
    }
    const insertedTenant = getInsertedTenant.get(tenant.phoneNumber);
    const tenancyResult = insertTenancy.run(
      insertedTenant.tenant_id,
      tenant.unitId,
      tenant.moveInDate,
      tenant.monthlyRent
    );
    insertSecurityDeposit.run(tenancyResult.lastInsertRowid, tenant.securityDeposit);

    return getTenantById(insertedTenant.tenant_id);
  });

  try {
    return transaction.immediate();
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenancy_assignments\.unit_id/i.test(err.message)) {
      throw createError("That room was just assigned to another tenant. Choose another available room.", 409);
    }
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenants\.phone_number/i.test(err.message)) {
      throw createError("A tenant with this phone number already exists", 409);
    }
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenants\.national_id_number/i.test(err.message)) {
      throw createError("A tenant with this national ID number already exists", 409);
    }
    throw err;
  }
}

function updateTenantProfile(tenantId, data) {
  const numericTenantId = parseTenantId(tenantId);
  if (!numericTenantId) throw createError("Invalid tenant ID", 400);

  const current = getTenantById(numericTenantId);
  if (!current) throw createError("Tenant not found", 404);
  if (!current.tenancy_id) throw createError("Tenant has no active assignment to edit", 400);

  const tenantType = String(data.tenantType || current.tenant_type || "INDIVIDUAL").trim().toUpperCase() === "BUSINESS"
    ? "BUSINESS"
    : "INDIVIDUAL";
  const phoneNumber = validatePhoneNumber(data.phoneNumber || current.phone_number);
  const altPhoneNumber = validateOptionalPhoneNumber(data.altPhoneNumber);
  if (altPhoneNumber && altPhoneNumber === phoneNumber) {
    throw createError("Alternative phone must be different from the primary phone", 400);
  }

  const notes = requireText(data.notes, "Notes", { required: false, maxLength: 1000 }) || "No notes.";
  const unitId = parsePositiveId(data.unitId || current.unit_id, "Room");
  const monthlyRent = parseWholeAmount(
    data.monthlyRent ?? current.expected_monthly_rent,
    "Monthly rent",
    MIN_MONTHLY_RENT,
    MAX_MONTHLY_RENT
  );
  const securityDepositExpected = parseWholeAmount(
    data.securityDepositRequired ?? current.security_deposit_expected,
    "Security deposit required",
    1
  );
  const securityDepositReceived = parseWholeAmount(
    data.securityDepositPaid ?? current.security_deposit_received,
    "Security deposit paid",
    0,
    securityDepositExpected
  );
  const rentDueDay = parseSmallInteger(data.rentDueDay ?? current.rent_due_day ?? 1, "Rent due day", 1, 31);
  const gracePeriodDays = parseSmallInteger(data.gracePeriodDays ?? current.grace_period_days ?? 5, "Grace period", 0, 31);
  const requestedStatus = String(data.status || (current.is_active ? "Active" : "Inactive")).trim().toUpperCase();
  if (!["ACTIVE", "INACTIVE"].includes(requestedStatus)) {
    throw createError("Status must be Active or Inactive", 400);
  }

  let isActive = 1;
  let endDate = null;
  let scheduledMoveOutDate = null;
  if (requestedStatus === "INACTIVE") {
    const moveOutDate = validateDate(
      data.moveOutDate || current.scheduled_move_out_date || current.end_date,
      "Move-out date"
    );
    if (current.start_date && moveOutDate < current.start_date) {
      throw createError("Move-out date cannot be before move-in date", 400);
    }

    if (moveOutDate <= todayIso()) {
      isActive = 0;
      endDate = moveOutDate;
    } else {
      isActive = 1;
      scheduledMoveOutDate = moveOutDate;
    }
  }

  let tenantNames;
  if (tenantType === "BUSINESS") {
    tenantNames = {
      businessName: requireText(data.businessName || current.business_name, "Business name", { maxLength: 120 }),
      firstName: "Business",
      middleName: null,
      lastName: "Tenant",
    };
  } else {
    tenantNames = {
      businessName: null,
      firstName: titleCaseName(requireText(data.firstName || current.first_name, "First name")),
      middleName: titleCaseName(requireText(data.middleName, "Middle name", { required: false })) || null,
      lastName: titleCaseName(requireText(data.lastName || current.last_name, "Last name")),
    };
  }

  const currentNationalId = current.national_id_number
    ? String(current.national_id_number).trim().toUpperCase()
    : null;
  let nationalIdNumber = currentNationalId;
  if (tenantType === "INDIVIDUAL") {
    if (currentNationalId) {
      const requestedNationalId = data.nationalIdNumber !== undefined
        ? validateNationalIdNumber(data.nationalIdNumber, { required: false })
        : null;
      if (requestedNationalId && requestedNationalId !== currentNationalId) {
        throw createError("National ID number cannot be changed once saved", 400);
      }
    } else if (data.nationalIdNumber !== undefined) {
      nationalIdNumber = validateNationalIdNumber(data.nationalIdNumber, { required: false });
    }
  }

  const db = open();
  const getUnit = db.prepare(`
    SELECT u.unit_id
    FROM units u
    JOIN estates e ON e.estate_id = u.estate_id
    WHERE u.unit_id = ?
      AND u.is_active = 1
      AND e.is_active = 1
  `);
  const occupiedByOtherTenant = db.prepare(`
    SELECT 1
    FROM tenancy_assignments
    WHERE unit_id = ?
      AND end_date IS NULL
      AND tenant_id <> ?
  `);
  const updateTenant = db.prepare(`
    UPDATE tenants
    SET tenant_type = ?,
        business_name = ?,
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        phone_number = ?,
        national_id_number = ?,
        alt_phone_number = ?,
        notes = ?,
        is_active = ?
    WHERE tenant_id = ?
  `);
  const updateTenancy = db.prepare(`
    UPDATE tenancy_assignments
    SET unit_id = ?,
        agreed_monthly_rent = ?,
        rent_due_day = ?,
        grace_period_days = ?,
        end_date = ?,
        scheduled_move_out_date = ?
    WHERE tenancy_id = ?
  `);
  const updateSecurityDeposit = db.prepare(`
    UPDATE security_deposits
    SET expected_amount = ?,
        received_amount = ?,
        status = ?
    WHERE security_deposit_id = ?
  `);

  const transaction = db.transaction(() => {
    if (!getUnit.get(unitId)) {
      throw createError("That room is no longer available in the selected estate", 409);
    }
    if (isActive && occupiedByOtherTenant.get(unitId, numericTenantId)) {
      throw createError("That room is already occupied. Choose another available room.", 409);
    }

    updateTenant.run(
      tenantType,
      tenantNames.businessName,
      tenantNames.firstName,
      tenantNames.middleName,
      tenantNames.lastName,
      phoneNumber,
      nationalIdNumber,
      altPhoneNumber,
      notes,
      isActive,
      numericTenantId
    );
    updateTenancy.run(
      unitId,
      monthlyRent,
      rentDueDay,
      gracePeriodDays,
      endDate,
      scheduledMoveOutDate,
      current.tenancy_id
    );
    updateSecurityDeposit.run(
      securityDepositExpected,
      securityDepositReceived,
      securityDepositStatus(securityDepositReceived, securityDepositExpected),
      current.security_deposit_id
    );

    return getTenantById(numericTenantId);
  });

  try {
    return transaction.immediate();
  } catch (err) {
    if (err.statusCode) throw err;
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenancy_assignments\.unit_id/i.test(err.message)) {
      throw createError("That room was just assigned to another tenant. Choose another available room.", 409);
    }
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenants\.phone_number/i.test(err.message)) {
      throw createError("A tenant with this phone number already exists", 409);
    }
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" && /tenants\.national_id_number/i.test(err.message)) {
      throw createError("A tenant with this national ID number already exists", 409);
    }
    throw err;
  }
}

module.exports = {
  getTenantDirectory,
  getActiveTenants,
  getTenantById,
  getActiveEstatesWithAvailability,
  getActiveEstateById,
  getAvailableUnitsForEstate,
  createTenantWithTenancy,
  updateTenantProfile,
};
