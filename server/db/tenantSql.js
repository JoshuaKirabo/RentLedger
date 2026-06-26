"use strict";

const TENANT_DISPLAY_NAME_SQL = `
  CASE
    WHEN t.tenant_type = 'BUSINESS' AND trim(t.business_name) <> ''
      THEN trim(t.business_name)
    ELSE trim(t.first_name || ' ' || COALESCE(t.middle_name || ' ', '') || t.last_name)
  END
`;

module.exports = { TENANT_DISPLAY_NAME_SQL };
