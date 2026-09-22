(function () {
  "use strict";

  /* Each <div data-screen="name"> in index.html is replaced with screens/name.html.
     dashboard.js looks up screen elements when it first runs, so it loads only
     after every screen is in place. */

  const DASHBOARD_SRC = "js/dashboard.js?v=20260923a";

  function loadScreen(slot) {
    const name = slot.dataset.screen;
    return fetch(`screens/${name}.html`)
      .then((res) => {
        if (!res.ok) throw new Error(`${name}.html: ${res.status}`);
        return res.text();
      })
      .then((html) => {
        slot.outerHTML = html;
      });
  }

  function loadDashboard() {
    const script = document.createElement("script");
    script.src = DASHBOARD_SRC;
    document.body.appendChild(script);
  }

  Promise.all(Array.from(document.querySelectorAll("[data-screen]"), loadScreen))
    .catch((err) => console.error("[screens] failed to load", err))
    .finally(loadDashboard);
})();
