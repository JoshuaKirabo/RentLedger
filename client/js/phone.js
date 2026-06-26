"use strict";

(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.PhoneNumbers = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
  const UGANDA_COUNTRY_CODE = "256";

  const COUNTRY_DIAL_CODES = [
    { code: "256", label: "+256", name: "Uganda", iso: "UG" },
    { code: "254", label: "+254", name: "Kenya", iso: "KE" },
    { code: "255", label: "+255", name: "Tanzania", iso: "TZ" },
    { code: "250", label: "+250", name: "Rwanda", iso: "RW" },
    { code: "211", label: "+211", name: "South Sudan", iso: "SS" },
    { code: "243", label: "+243", name: "DR Congo", iso: "CD" },
    { code: "257", label: "+257", name: "Burundi", iso: "BI" },
    { code: "251", label: "+251", name: "Ethiopia", iso: "ET" },
  ];

  function countryFlag(iso) {
    if (!iso || iso.length !== 2) return "";
    return iso.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
  }

  function formatCountryTrigger(country) {
    const flag = countryFlag(country.iso);
    return flag ? `${flag} ${country.label}` : country.label;
  }

  function formatCountryOption(country) {
    const flag = countryFlag(country.iso);
    return flag ? `${flag} ${country.name} (${country.label})` : `${country.name} (${country.label})`;
  }

  function stripLocalNumber(value) {
    let local = String(value || "").trim().replace(/[\s().-]/g, "");
    if (!local) return "";

    if (local.startsWith("00")) local = local.slice(2);
    if (local.startsWith("+")) local = local.slice(1);
    return local.replace(/\D/g, "");
  }

  function combineE164(dialCode, localValue) {
    const dial = String(dialCode || "").replace(/\D/g, "");
    let local = stripLocalNumber(localValue);
    if (!dial || !local) return "";

    if (local.startsWith(dial)) local = local.slice(dial.length);
    if (local.startsWith("0")) local = local.slice(1);

    const phone = `+${dial}${local}`;
    return E164_PATTERN.test(phone) ? phone : "";
  }

  /**
   * Converts common Ugandan local-number input to canonical E.164.
   * International numbers must already include their country code.
   */
  function normalizeE164(value) {
    if (value === null || value === undefined) return "";

    let phone = String(value).trim();
    if (!phone) return "";

    // Accept visually formatted input, but never preserve that formatting.
    phone = phone.replace(/[\s().-]/g, "");

    if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
    if (/^0\d{9}$/.test(phone)) phone = `+${UGANDA_COUNTRY_CODE}${phone.slice(1)}`;
    if (/^7\d{8}$/.test(phone)) phone = `+${UGANDA_COUNTRY_CODE}${phone}`;
    if (new RegExp(`^${UGANDA_COUNTRY_CODE}\\d{9}$`).test(phone)) phone = `+${phone}`;

    return E164_PATTERN.test(phone) ? phone : "";
  }

  function formatE164(value) {
    const normalized = normalizeE164(value);
    if (!normalized) return "—";

    const ugandaMatch = normalized.match(/^\+256(\d{3})(\d{3})(\d{3})$/);
    if (ugandaMatch) {
      return `+256 ${ugandaMatch[1]} ${ugandaMatch[2]} ${ugandaMatch[3]}`;
    }

    return normalized;
  }

  return { COUNTRY_DIAL_CODES, combineE164, countryFlag, formatCountryOption, formatCountryTrigger, normalizeE164, formatE164 };
});
