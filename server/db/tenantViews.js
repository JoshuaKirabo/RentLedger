"use strict";

const { OUTSTANDING_START_MONTH } = require("../lib/rentMonths");

function recreateTenantDirectoryViews(db) {
  db.exec("DROP VIEW IF EXISTS v_tenant_account_status");
  db.exec("DROP VIEW IF EXISTS v_current_tenant_directory");

  db.exec(`
    CREATE VIEW v_current_tenant_directory AS
    SELECT
        t.tenant_id,
        t.tenant_type,
        t.business_name,
        t.first_name,
        t.middle_name,
        t.last_name,
        CASE
            WHEN t.tenant_type = 'BUSINESS' AND trim(t.business_name) <> ''
                THEN trim(t.business_name)
            ELSE trim(t.first_name || ' ' || COALESCE(t.middle_name || ' ', '') || t.last_name)
        END AS tenant_name,
        t.phone_number,
        t.alt_phone_number,
        t.notes,
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
    JOIN tenancy_assignments ta
        ON ta.tenant_id = t.tenant_id
       AND ta.end_date IS NULL
    JOIN units u
        ON u.unit_id = ta.unit_id
    JOIN estates e
        ON e.estate_id = u.estate_id
    JOIN security_deposits sd
        ON sd.tenancy_id = ta.tenancy_id;
  `);

  db.exec(`
    CREATE VIEW v_tenant_account_status AS
    SELECT
        d.*,
        COALESCE((
            SELECT COUNT(*)
            FROM rent_obligations ro
            JOIN tenancy_assignments ta ON ta.tenancy_id = ro.tenancy_id
            WHERE ta.tenant_id = d.tenant_id
              AND ta.end_date IS NULL
              AND ro.rent_month >= '${OUTSTANDING_START_MONTH}'
              AND ro.rent_month <= strftime('%Y-%m', 'now')
              AND ro.status <> 'PAID'
        ), 0) AS pending_months_owed,
        COALESCE((
            SELECT SUM(ro.amount_due - ro.allocated_amount)
            FROM rent_obligations ro
            JOIN tenancy_assignments ta ON ta.tenancy_id = ro.tenancy_id
            WHERE ta.tenant_id = d.tenant_id
              AND ta.end_date IS NULL
              AND ro.rent_month >= '${OUTSTANDING_START_MONTH}'
              AND ro.rent_month <= strftime('%Y-%m', 'now')
        ), 0) AS rent_outstanding_balance,
        d.security_deposit_expected - d.security_deposit_received AS security_deposit_balance,
        CASE
            WHEN d.security_deposit_status <> 'PAID'
                 AND COALESCE((
                     SELECT COUNT(*)
                     FROM rent_obligations ro
                     JOIN tenancy_assignments ta ON ta.tenancy_id = ro.tenancy_id
                     WHERE ta.tenant_id = d.tenant_id
                       AND ta.end_date IS NULL
                       AND ro.rent_month >= '${OUTSTANDING_START_MONTH}'
                       AND ro.rent_month <= strftime('%Y-%m', 'now')
                       AND ro.status <> 'PAID'
                 ), 0) = 0
            THEN 'MISSING_SECURITY_DEPOSIT'

            WHEN COALESCE((
                SELECT COUNT(*)
                FROM rent_obligations ro
                JOIN tenancy_assignments ta ON ta.tenancy_id = ro.tenancy_id
                WHERE ta.tenant_id = d.tenant_id
                  AND ta.end_date IS NULL
                  AND ro.rent_month >= '${OUTSTANDING_START_MONTH}'
                  AND ro.rent_month <= strftime('%Y-%m', 'now')
                  AND ro.status <> 'PAID'
            ), 0) > 0
            THEN 'IN_ARREARS'

            WHEN d.start_date >= date('now', '-90 days')
            THEN 'NEW_MOVE_IN_CLEAN'

            ELSE 'FULLY_PAID_UP'
        END AS account_category
    FROM v_current_tenant_directory d;
  `);
}

function migrateTenantTypes(db) {
  const columns = db.prepare("PRAGMA table_info(tenants)").all();
  const hasTenantType = columns.some((column) => column.name === "tenant_type");

  if (!hasTenantType) {
    db.exec(`
      ALTER TABLE tenants ADD COLUMN tenant_type TEXT NOT NULL DEFAULT 'INDIVIDUAL'
        CHECK (tenant_type IN ('INDIVIDUAL', 'BUSINESS'));
      ALTER TABLE tenants ADD COLUMN business_name TEXT;
    `);
  }

  recreateTenantDirectoryViews(db);

  db.prepare(`
    UPDATE tenants
    SET tenant_type = 'BUSINESS', business_name = 'Opportunity Bank'
    WHERE tenant_id = 71
      AND tenant_type <> 'BUSINESS'
  `).run();
  db.prepare(`
    UPDATE tenants
    SET tenant_type = 'BUSINESS', business_name = 'Ugachick'
    WHERE tenant_id = 72
      AND tenant_type <> 'BUSINESS'
  `).run();
  db.prepare(`
    UPDATE tenants
    SET tenant_type = 'BUSINESS', business_name = 'God''s Love Records'
    WHERE tenant_id = 78
      AND tenant_type <> 'BUSINESS'
  `).run();
  db.prepare(`
    UPDATE tenants
    SET tenant_type = 'BUSINESS', business_name = 'Tweba Co Ltd'
    WHERE tenant_id = 95
      AND tenant_type <> 'BUSINESS'
  `).run();
  db.prepare(`
    UPDATE tenants
    SET tenant_type = 'BUSINESS', business_name = 'Medora Pharma'
    WHERE tenant_id = 86
      AND tenant_type <> 'BUSINESS'
  `).run();
}

module.exports = { migrateTenantTypes, recreateTenantDirectoryViews };
