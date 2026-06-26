(function () {
  "use strict";

  const API_PORT = 3000;

  function resolveApiBase() {
    const { protocol, hostname, port } = window.location;

    if (protocol === "file:") {
      return `http://127.0.0.1:${API_PORT}`;
    }

    if (
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      port === String(API_PORT)
    ) {
      return "";
    }

    return `http://127.0.0.1:${API_PORT}`;
  }

  const API_BASE = resolveApiBase();

  async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

    const text = await res.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }

    if (!res.ok) {
      throw new Error(body?.error || body?.message || `Request failed (${res.status})`);
    }
    return body;
  }

  window.RentLedgerApi = {
    baseUrl: API_BASE,
    get(path) { return request(path); },
    post(path, data) { return request(path, { method: "POST", body: JSON.stringify(data) }); },
    put(path, data) { return request(path, { method: "PUT", body: JSON.stringify(data) }); },
  };
})();
