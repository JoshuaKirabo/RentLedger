(function () {
  "use strict";

  /* ── Navigation ── */

  const views = {
    dashboard: document.getElementById("view-dashboard"),
    "payment-entry": document.getElementById("view-payment-entry"),
    "outstanding-balances": document.getElementById("view-outstanding-balances"),
    "waive-balance": document.getElementById("view-waive-balance"),
    "waived-payments": document.getElementById("view-waived-payments"),
    "pending-deposits": document.getElementById("view-pending-deposits"),
    receipts: document.getElementById("view-receipts"),
    tenants: document.getElementById("view-tenants"),
    estates: document.getElementById("view-estates"),
    "estate-detail": document.getElementById("view-estate-detail"),
    "monthly-collection": document.getElementById("view-monthly-collection"),
    "bank-statement-review": document.getElementById("view-bank-statement-review"),
    "custom-reports": document.getElementById("view-custom-reports"),
  };

  const APP_TITLE = "RentLedger";

  const navLinks = document.querySelectorAll(".sidebar__nav .sidebar__link[data-view]");
  const paymentsNavGroup = document.getElementById("paymentsNavGroup");
  const paymentsNavToggle = document.getElementById("paymentsNavToggle");
  const paymentNavViews = new Set(["receipts", "payment-entry"]);
  const outstandingNavGroup = document.getElementById("outstandingNavGroup");
  const outstandingNavToggle = document.getElementById("outstandingNavToggle");
  const outstandingNavViews = new Set(["outstanding-balances", "waived-payments", "waive-balance"]);
  let chartInitialized = false;
  let collectionChart = null;

  const ACTIVE_VIEW_KEY = "rentledger:activeView";

  function showView(viewId) {
    try {
      localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
    } catch (_) {}

    Object.entries(views).forEach(([id, el]) => {
      if (!el) return;
      el.classList.toggle("view--active", id === viewId);
    });

    navLinks.forEach((link) => {
      link.classList.toggle("sidebar__link--active", link.dataset.view === viewId);
    });

    const paymentViewActive = paymentNavViews.has(viewId);
    paymentsNavToggle?.classList.toggle("sidebar__link--active", paymentViewActive);
    if (paymentViewActive) setPaymentsNavOpen(true);

    const outstandingViewActive = outstandingNavViews.has(viewId);
    outstandingNavToggle?.classList.toggle("sidebar__link--active", outstandingViewActive);
    if (outstandingViewActive) setOutstandingNavOpen(true);

    document.title = APP_TITLE;

    if (viewId === "dashboard" && !chartInitialized) {
      initChart();
    }

    if (viewId === "outstanding-balances") {
      renderOutstandingReport();
    }

    if (viewId === "waive-balance") {
      resetWaiveBalanceForm();
      renderWaiveBalancesList();
    }

    if (viewId === "waived-payments") {
      renderWaivedPaymentsScreen();
    }

    if (viewId === "pending-deposits") {
      renderPendingDepositsReport();
    }

    if (viewId === "tenants") {
      renderTenantsDirectory();
    }

    if (viewId === "estates") {
      renderEstatesDirectory();
    }

    if (viewId === "estate-detail") {
      if (!currentEstateDetailName) {
        showView("estates");
        return;
      }
      renderEstateDetail(currentEstateDetailName);
    }

    if (viewId === "bank-statement-review") {
      initStatementReviewOnce();
    }

    if (viewId === "custom-reports") {
      initCustomReportsOnce();
    }

    if (viewId === "monthly-collection") {
      initMonthlyCollectionOnce();
      renderMonthlyCollection();
    }
  }

  /* ── Sidebar (collapse + mobile drawer) ── */

  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebarMenuBtn = document.getElementById("sidebarMenuBtn");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const SIDEBAR_KEY = "rentledger:sidebarCollapsed";
  const mobileSidebarQuery = window.matchMedia("(max-width: 992px)");

  // #region agent log
  const __dbgBuf = [];
  let __dbgFlushTimer = null;
  let __dbgToggleSeq = 0;
  let __dbgArmed = false;
  function __dbgPush(location, message, data, hypothesisId) {
    if (!__dbgArmed) return;
    __dbgBuf.push({ location, message, data, hypothesisId, t: Date.now() });
    if (__dbgFlushTimer) clearTimeout(__dbgFlushTimer);
    __dbgFlushTimer = setTimeout(__dbgFlush, 1500);
  }
  function __dbgFlush() {
    if (!__dbgBuf.length) return;
    const entries = __dbgBuf.splice(0, __dbgBuf.length);
    fetch("http://127.0.0.1:7638/ingest/bdd6bfae-56f7-4158-a526-f9ea9a30faa6", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4b2051" },
      body: JSON.stringify({
        sessionId: "4b2051",
        location: "dashboard.js:batch",
        message: "buffered sidebar/chart samples",
        data: { count: entries.length, entries },
        timestamp: Date.now(),
        runId: "post-fix",
      }),
    }).catch(() => {});
  }
  function __dbgSampleDuringToggle(seq, collapsedTarget) {
    const start = performance.now();
    const canvas = document.getElementById("collectionChart");
    const chartCard = document.querySelector(".chart-card");
    const attentionCard = document.querySelector(".attention-card");
    function step() {
      const dpr = window.devicePixelRatio || 1;
      const c = canvas;
      const chartH = chartCard ? Math.round(chartCard.getBoundingClientRect().height) : null;
      const attnH = attentionCard ? Math.round(attentionCard.getBoundingClientRect().height) : null;
      __dbgPush("dashboard.js:toggleSample", "frame", {
        seq,
        collapsedTarget,
        elapsed: Math.round(performance.now() - start),
        sidebarW: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
        canvasClientW: c ? c.clientWidth : null,
        canvasAttrW: c ? c.width : null,
        stretchRatio: c && c.clientWidth ? +((c.width / dpr) / c.clientWidth).toFixed(3) : null,
        chartCardH: chartH,
        attentionCardH: attnH,
        heightDelta: chartH != null && attnH != null ? Math.abs(chartH - attnH) : null,
      }, "A,EQ");
      if (performance.now() - start < 700) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  // #endregion

  function isMobileSidebar() {
    return mobileSidebarQuery.matches;
  }

  function setSidebarOpen(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("sidebar--open", open);
    if (sidebarOverlay) {
      sidebarOverlay.classList.toggle("sidebar-overlay--visible", open);
      sidebarOverlay.setAttribute("aria-hidden", String(!open));
    }
    if (sidebarMenuBtn) {
      sidebarMenuBtn.setAttribute("aria-expanded", String(open));
      sidebarMenuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    document.body.classList.toggle("sidebar-open", open);
  }

  function closeMobileSidebar() {
    if (isMobileSidebar()) setSidebarOpen(false);
  }

  function setSidebarCollapsed(collapsed) {
    if (!sidebar || !sidebarToggle) return;
    sidebar.classList.toggle("sidebar--collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch (_) {}
  }

  function navigateToView(viewId) {
    if (viewId && views[viewId]) showView(viewId);
  }

  function setPaymentsNavOpen(open) {
    if (!paymentsNavGroup || !paymentsNavToggle) return;
    paymentsNavGroup.classList.toggle("sidebar__group--open", open);
    paymentsNavToggle.setAttribute("aria-expanded", String(open));
  }

  function setOutstandingNavOpen(open) {
    if (!outstandingNavGroup || !outstandingNavToggle) return;
    outstandingNavGroup.classList.toggle("sidebar__group--open", open);
    outstandingNavToggle.setAttribute("aria-expanded", String(open));
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToView(link.dataset.view);
      closeMobileSidebar();
    });
  });

  paymentsNavToggle?.addEventListener("click", () => {
    setPaymentsNavOpen(!paymentsNavGroup?.classList.contains("sidebar__group--open"));
  });

  outstandingNavToggle?.addEventListener("click", () => {
    setOutstandingNavOpen(!outstandingNavGroup?.classList.contains("sidebar__group--open"));
  });

  document.querySelector(".attention-card .card__link[data-view]")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigateToView(e.currentTarget.dataset.view);
  });

  document.getElementById("waivedPaymentsBack")?.addEventListener("click", () => {
    navigateToView("outstanding-balances");
  });

  document.getElementById("waiveBalanceBack")?.addEventListener("click", () => {
    navigateToView("outstanding-balances");
  });

  document.getElementById("waiveBalanceCancel")?.addEventListener("click", () => {
    navigateToView("outstanding-balances");
  });

  document.getElementById("viewWaivedPaymentsLink")?.addEventListener("click", () => {
    navigateToView("waived-payments");
  });

  document.getElementById("waiveBalanceLink")?.addEventListener("click", () => {
    navigateToView("waive-balance");
  });

  initOutstandingBalanceActionMenu();

  const dashDepositsPendingCard = document.getElementById("dashDepositsPendingCard");
  dashDepositsPendingCard?.addEventListener("click", () => {
    navigateToView("pending-deposits");
  });
  dashDepositsPendingCard?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    navigateToView("pending-deposits");
  });

  if (sidebar && sidebarToggle) {
    let startCollapsed = false;
    try {
      startCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch (_) {}
    setSidebarCollapsed(startCollapsed);

    sidebarToggle.addEventListener("click", () => {
      const willCollapse = !sidebar.classList.contains("sidebar--collapsed");
      setSidebarCollapsed(willCollapse);
      // #region agent log
      __dbgArmed = true;
      __dbgToggleSeq += 1;
      __dbgSampleDuringToggle(__dbgToggleSeq, willCollapse);
      // #endregion
    });
  }

  if (sidebarMenuBtn) {
    sidebarMenuBtn.addEventListener("click", () => {
      setSidebarOpen(!sidebar.classList.contains("sidebar--open"));
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => setSidebarOpen(false));
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar?.classList.contains("sidebar--open")) {
      setSidebarOpen(false);
    }
  });

  mobileSidebarQuery.addEventListener("change", (e) => {
    if (!e.matches) setSidebarOpen(false);
  });

  /* ── Data (loaded from API) ── */

  let tenants = [];
  let payments = [];
  let receipts = [];
  let receiptsLoadState = "loading";
  const RECEIPT_UNAVAILABLE_MESSAGE = "Unable to generate receipt";
  const RECEIPT_SIGNATURE_SRC = "assets/signature.png";
  let selectedTenant = null;
  let apiLoaded = false;
  let tenantsLoadState = "loading";

  function formatPhone(value) {
    return window.PhoneNumbers.formatE164(value);
  }

  function formatReceiptNumber(value) {
    const number = String(value || "")
      .replace(/^RCP-/i, "")
      .replace(/^#/, "");
    return number ? `#${number}` : "—";
  }

  // Dashboard summary is computed entirely by the backend (/api/dashboard).
  let dashboardSummary = null;

  const methodIcons = {
    "Bank Transfer": '<span class="material-symbols-outlined icon icon--method">account_balance</span>',
    "Bank Deposit": '<span class="material-symbols-outlined icon icon--method">account_balance</span>',
    "Mobile Money": '<span class="material-symbols-outlined icon icon--method">smartphone</span>',
    "Agency Banking": '<span class="material-symbols-outlined icon icon--method">storefront</span>',
    Cash: '<span class="material-symbols-outlined icon icon--method">payments</span>',
  };

  /* ── Outstanding balances ── */

  let outstandingBalances = [];
  let outstandingBalancesLoadState = "loading";

  let outstandingSortKey = "outstanding";
  let outstandingSortDirection = "desc";
  let outstandingFiltersInitialized = false;
  const waivedPayments = [];

  function formatOutstandingAmount(amount) {
    return `UGX ${Number(amount).toLocaleString("en-UG")}`;
  }

  function renderWaivedPaymentsScreen() {
    const total = waivedPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const tenantCount = new Set(waivedPayments.map((row) => row.tenantId || row.tenantName).filter(Boolean)).size;
    const table = document.getElementById("waivedPaymentsTable");
    const countEl = document.getElementById("waivedPaymentsTableCount");

    const totalEl = document.getElementById("waivedPaymentsTotal");
    const recordsEl = document.getElementById("waivedPaymentsCount");
    const tenantsEl = document.getElementById("waivedPaymentsTenants");
    if (totalEl) totalEl.textContent = formatOutstandingAmount(total);
    if (recordsEl) recordsEl.textContent = String(waivedPayments.length);
    if (tenantsEl) tenantsEl.textContent = String(tenantCount);
    if (countEl) countEl.textContent = `Showing ${waivedPayments.length} waived payment${waivedPayments.length === 1 ? "" : "s"}`;

    if (!table) return;
    if (!waivedPayments.length) {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="8"><span class="material-symbols-outlined">money_off</span>No waived payments recorded yet.</td>
        </tr>`;
      return;
    }

    table.innerHTML = waivedPayments
      .map((row) => `
        <tr>
          <td>${escapeHtml(row.date || "—")}</td>
          <td>
            <span class="outstanding-tenant__name">${escapeHtml(row.tenantName || "—")}</span>
            <span class="outstanding-tenant__id">${escapeHtml(row.tenantId || "")}</span>
          </td>
          <td><span class="estate-name">${escapeHtml(estateShortName(row.estate || "—"))}</span></td>
          <td><span class="house-number">${escapeHtml(row.house || "—")}</span></td>
          <td>${escapeHtml(row.rentMonth || "—")}</td>
          <td class="text-right"><span class="waived-payment-amount">${formatOutstandingAmount(row.amount || 0)}</span></td>
          <td>${escapeHtml(row.reason || "—")}</td>
          <td>${escapeHtml(row.approvedBy || "—")}</td>
        </tr>`)
      .join("");
  }

  function outstandingSortValue(tenant, key) {
    if (key === "pendingMonths") return new Date(`1 ${tenant.pendingMonths[0]}`).getTime();
    if (key === "phone") return tenant.phone.replace(/\D/g, "");
    return tenant[key];
  }

  function compareOutstandingBalances(a, b) {
    const aValue = outstandingSortValue(a, outstandingSortKey);
    const bValue = outstandingSortValue(b, outstandingSortKey);
    const comparison = typeof aValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), "en", { numeric: true });
    const directionalComparison = outstandingSortDirection === "desc" ? -comparison : comparison;
    return directionalComparison || a.name.localeCompare(b.name, "en");
  }

  function addOutstandingFilterOption(menu, value, label) {
    const option = document.createElement("li");
    option.className = "custom-select__option";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.dataset.value = value;
    option.dataset.label = label;
    option.textContent = label;
    menu?.appendChild(option);
  }

  function getFilteredOutstandingBalances() {
    const search = document.getElementById("outstandingSearch")?.value.trim().toLowerCase() || "";
    const estate = document.getElementById("outstandingEstateFilter")?.value || "";
    const month = document.getElementById("outstandingMonthFilter")?.value || "";

    return outstandingBalances
      .filter((tenant) => {
        const matchesSearch = !search || [tenant.name, tenant.house, tenant.phone, tenant.estate]
          .join(" ")
          .toLowerCase()
          .includes(search);
        const matchesEstate = !estate || tenant.estate === estate;
        const matchesMonth = !month || tenant.pendingMonths.includes(month);
        return matchesSearch && matchesEstate && matchesMonth;
      })
      .sort(compareOutstandingBalances);
  }

  function initOutstandingBalanceActionMenu() {
    const control = document.getElementById("outstandingBalanceActionMenuControl");
    const trigger = document.getElementById("outstandingBalanceActionTrigger");
    const menu = document.getElementById("outstandingBalanceActionMenu");
    const hidden = document.getElementById("outstandingBalanceAction");
    if (!control || !trigger || !menu || !hidden || control.dataset.initialized === "true") return;

    let isOpen = false;

    function close() {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      isOpen = false;
    }

    function open() {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      isOpen = true;
    }

    trigger.addEventListener("click", () => {
      isOpen ? close() : open();
    });

    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-balance-action]");
      if (!item) return;
      hidden.value = item.dataset.balanceAction || "";
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      if (hidden.value === "waive") navigateToView("waive-balance");
      if (hidden.value === "view-waived") navigateToView("waived-payments");
    });

    document.addEventListener("click", (event) => {
      if (isOpen && !control.contains(event.target)) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) close();
    });

    control.dataset.initialized = "true";
  }

  function initialiseOutstandingFilters() {
    if (outstandingFiltersInitialized) return;

    const estateSelect = document.getElementById("outstandingEstateFilter");
    const monthSelect = document.getElementById("outstandingMonthFilter");
    const estateMenu = document.getElementById("outstandingEstateMenu");
    const monthMenu = document.getElementById("outstandingMonthMenu");
    const searchInput = document.getElementById("outstandingSearch");
    const clearButton = document.getElementById("clearOutstandingFilters");
    const columnSortButtons = document.querySelectorAll(".outstanding-table:not(.cr-table) .outstanding-column-sort");

    if (!estateSelect || !monthSelect || !estateMenu || !monthMenu) return;

    [...new Set(outstandingBalances.map((tenant) => tenant.estate))]
      .sort()
      .forEach((estate) => addOutstandingFilterOption(estateMenu, estate, estateShortName(estate)));

    [...new Set(outstandingBalances.flatMap((tenant) => tenant.pendingMonths))]
      .sort((a, b) => new Date(`${a} 01`) - new Date(`${b} 01`))
      .forEach((month) => addOutstandingFilterOption(monthMenu, month, month));

    const estateFilterControl = initCustomSelect({
      container: document.getElementById("outstandingEstateSelect"),
      trigger: document.getElementById("outstandingEstateTrigger"),
      menu: estateMenu,
      display: document.getElementById("outstandingEstateDisplay"),
      hidden: estateSelect,
    });

    const monthFilterControl = initCustomSelect({
      container: document.getElementById("outstandingMonthSelect"),
      trigger: document.getElementById("outstandingMonthTrigger"),
      menu: monthMenu,
      display: document.getElementById("outstandingMonthDisplay"),
      hidden: monthSelect,
    });

    [searchInput, estateSelect, monthSelect].forEach((element) => {
      element?.addEventListener(element === searchInput ? "input" : "change", renderOutstandingReport);
    });

    clearButton?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      estateFilterControl?.setValue("");
      monthFilterControl?.setValue("");
      renderOutstandingReport();
    });

    columnSortButtons.forEach((button) => button.addEventListener("click", () => {
      const nextSortKey = button.dataset.sortKey;
      if (nextSortKey === outstandingSortKey) {
        outstandingSortDirection = outstandingSortDirection === "asc" ? "desc" : "asc";
      } else {
        outstandingSortKey = nextSortKey;
        outstandingSortDirection = nextSortKey === "outstanding" ? "desc" : "asc";
      }
      renderOutstandingReport();
    }));

    outstandingFiltersInitialized = true;
  }

  function renderOutstandingReport() {
    if (outstandingBalancesLoadState === "ready") initialiseOutstandingFilters();

    const table = document.getElementById("outstandingTable");
    const total = outstandingBalances.reduce((sum, tenant) => sum + tenant.outstanding, 0);
    const pendingMonths = outstandingBalances.reduce((sum, tenant) => sum + tenant.pendingMonths.length, 0);
    const filteredTenants = getFilteredOutstandingBalances();
    const totalEl = document.getElementById("outstandingTotal");
    const tenantsEl = document.getElementById("outstandingTenants");
    const monthsEl = document.getElementById("outstandingMonths");
    const countEl = document.getElementById("outstandingTableCount");
    const clearButton = document.getElementById("clearOutstandingFilters");
    const search = document.getElementById("outstandingSearch")?.value.trim() || "";
    const estate = document.getElementById("outstandingEstateFilter")?.value || "";
    const month = document.getElementById("outstandingMonthFilter")?.value || "";

    if (totalEl) totalEl.textContent = formatOutstandingAmount(total);
    if (tenantsEl) tenantsEl.textContent = outstandingBalances.length;
    if (monthsEl) monthsEl.textContent = pendingMonths;
    if (countEl) countEl.textContent = `Showing ${filteredTenants.length} of ${outstandingBalances.length} tenants`;
    if (clearButton) clearButton.disabled = !(search || estate || month);

    document.querySelectorAll(".outstanding-table:not(.cr-table) .outstanding-column-sort").forEach((button) => {
      const isActive = button.dataset.sortKey === outstandingSortKey;
      const direction = outstandingSortDirection === "asc" ? "ascending" : "descending";
      const icon = button.querySelector(".material-symbols-outlined");
      const header = button.closest("th");
      if (icon) icon.textContent = isActive ? (outstandingSortDirection === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";
      button.setAttribute("aria-label", `Sort by ${button.dataset.sortKey === "pendingMonths" ? "pending months" : button.dataset.sortKey} ${isActive ? direction : "ascending"}`);
      button.setAttribute("aria-pressed", String(isActive));
      header?.setAttribute("aria-sort", isActive ? direction : "none");
    });

    if (!table) return;
    if (outstandingBalancesLoadState === "loading") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="6">
            <span class="loading-spinner" role="status" aria-label="Loading">
              <img src="assets/spinner.svg" alt="">
              Loading outstanding balances...
            </span>
          </td>
        </tr>`;
      if (countEl) countEl.textContent = "Loading outstanding balances...";
      return;
    }
    if (outstandingBalancesLoadState === "error") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="6"><span class="material-symbols-outlined">cloud_off</span>Could not load outstanding balances.</td>
        </tr>`;
      if (countEl) countEl.textContent = "Could not load outstanding balances.";
      return;
    }
    if (!filteredTenants.length) {
      const emptyMessage = outstandingBalances.length
        ? "No tenants match these filters."
        : "No tenants currently have outstanding rent.";
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="6"><span class="material-symbols-outlined">person_search</span>${emptyMessage}</td>
        </tr>`;
      return;
    }

    table.innerHTML = filteredTenants
      .map((tenant) => `
        <tr>
          <td>
            <span class="outstanding-tenant__name">${tenant.name}</span>
            <span class="outstanding-tenant__id">${tenant.id}</span>
          </td>
          <td><span class="estate-name">${escapeHtml(estateShortName(tenant.estate))}</span></td>
          <td><span class="house-number">${tenant.house}</span></td>
          <td><span class="phone-number">${formatPhone(tenant.phone)}</span></td>
          <td><div class="month-list">${tenant.pendingMonths.map((pendingMonth) => `<span class="month-chip">${pendingMonth}</span>`).join("")}</div></td>
          <td class="text-right"><span class="outstanding-amount">${formatOutstandingAmount(tenant.outstanding)}</span></td>
        </tr>`)
      .join("");
  }

  /* ── Pending security deposits ── */

  let pendingDepositsSortKey = "balance";
  let pendingDepositsSortDirection = "desc";
  let pendingDepositsFiltersInitialized = false;
  let pendingDepositsInitialized = false;

  function getDepositBalance(tenant) {
    const required = Number(tenant.depositRequiredAmount) || 0;
    const paid = Number(tenant.depositPaidAmount) || 0;
    return Math.max(0, required - paid);
  }

  function isPendingDepositTenant(tenant) {
    if (isCaretakerTenant(tenant)) return false;
    if (!isTenantOperationallyActive(tenant)) return false;
    return tenant.securityDeposit !== "Paid";
  }

  function getPendingDepositTenants() {
    return tenantsDirectory.filter(isPendingDepositTenant);
  }

  function pendingDepositsSortValue(tenant, key) {
    if (key === "balance") return getDepositBalance(tenant);
    if (key === "depositRequired") return Number(tenant.depositRequiredAmount) || 0;
    if (key === "depositPaid") return Number(tenant.depositPaidAmount) || 0;
    if (key === "dateBecame") return parseTenantDate(tenant);
    if (key === "phone") return tenant.phone.replace(/\D/g, "");
    return tenant[key];
  }

  function comparePendingDeposits(a, b) {
    const aValue = pendingDepositsSortValue(a, pendingDepositsSortKey);
    const bValue = pendingDepositsSortValue(b, pendingDepositsSortKey);
    const comparison = typeof aValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), "en", { numeric: true });
    const directionalComparison = pendingDepositsSortDirection === "desc" ? -comparison : comparison;
    return directionalComparison || a.name.localeCompare(b.name, "en");
  }

  function getFilteredPendingDeposits() {
    const search = document.getElementById("pendingDepositsSearch")?.value.trim().toLowerCase() || "";
    const estate = document.getElementById("pendingDepositsEstateFilter")?.value || "";
    const status = document.getElementById("pendingDepositsStatusFilter")?.value || "";

    return getPendingDepositTenants()
      .filter((tenant) => {
        const matchesSearch = !search || [tenant.name, tenant.house, tenant.phone, tenant.estate]
          .join(" ")
          .toLowerCase()
          .includes(search);
        const matchesEstate = !estate || tenant.estate === estate;
        const matchesStatus = !status || tenant.securityDeposit === status;
        return matchesSearch && matchesEstate && matchesStatus;
      })
      .sort(comparePendingDeposits);
  }

  function initialisePendingDepositsFilters() {
    if (pendingDepositsFiltersInitialized) return;

    const estateSelect = document.getElementById("pendingDepositsEstateFilter");
    const estateMenu = document.getElementById("pendingDepositsEstateMenu");
    const searchInput = document.getElementById("pendingDepositsSearch");
    const statusSelect = document.getElementById("pendingDepositsStatusFilter");
    const clearButton = document.getElementById("clearPendingDepositsFilters");
    const columnSortButtons = document.querySelectorAll(".pending-deposits-table .outstanding-column-sort");

    if (!estateSelect || !estateMenu || !statusSelect) return;

    [...new Set(getPendingDepositTenants().map((tenant) => tenant.estate))]
      .sort()
      .forEach((estate) => addOutstandingFilterOption(estateMenu, estate, estateShortName(estate)));

    const estateFilterControl = initCustomSelect({
      container: document.getElementById("pendingDepositsEstateSelect"),
      trigger: document.getElementById("pendingDepositsEstateTrigger"),
      menu: estateMenu,
      display: document.getElementById("pendingDepositsEstateDisplay"),
      hidden: estateSelect,
    });

    const statusFilterControl = initCustomSelect({
      container: document.getElementById("pendingDepositsStatusSelect"),
      trigger: document.getElementById("pendingDepositsStatusTrigger"),
      menu: document.getElementById("pendingDepositsStatusMenu"),
      display: document.getElementById("pendingDepositsStatusDisplay"),
      hidden: statusSelect,
    });

    [searchInput, estateSelect, statusSelect].forEach((element) => {
      element?.addEventListener(element === searchInput ? "input" : "change", renderPendingDepositsReport);
    });

    clearButton?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      estateFilterControl?.setValue("");
      statusFilterControl?.setValue("");
      renderPendingDepositsReport();
    });

    columnSortButtons.forEach((button) => button.addEventListener("click", () => {
      const nextSortKey = button.dataset.sortKey;
      if (nextSortKey === pendingDepositsSortKey) {
        pendingDepositsSortDirection = pendingDepositsSortDirection === "asc" ? "desc" : "asc";
      } else {
        pendingDepositsSortKey = nextSortKey;
        pendingDepositsSortDirection = nextSortKey === "balance" || nextSortKey === "depositRequired" || nextSortKey === "depositPaid" || nextSortKey === "dateBecame"
          ? "desc"
          : "asc";
      }
      renderPendingDepositsReport();
    }));

    pendingDepositsFiltersInitialized = true;
  }

  function initPendingDepositsOnce() {
    if (pendingDepositsInitialized) return;

    const table = document.getElementById("pendingDepositsTable");
    table?.addEventListener("click", (event) => {
      const row = event.target.closest(".pending-deposits-table__row");
      if (!row) return;
      const filtered = getFilteredPendingDeposits();
      const index = parseInt(row.dataset.tenantIndex, 10);
      openTenantProfile(filtered[index]);
    });

    table?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest(".pending-deposits-table__row");
      if (!row) return;
      event.preventDefault();
      const filtered = getFilteredPendingDeposits();
      const index = parseInt(row.dataset.tenantIndex, 10);
      openTenantProfile(filtered[index]);
    });

    pendingDepositsInitialized = true;
  }

  function renderPendingDepositsReport() {
    initPendingDepositsOnce();
    if (tenantsLoadState === "ready") initialisePendingDepositsFilters();

    const table = document.getElementById("pendingDepositsTable");
    const pendingTenants = getPendingDepositTenants();
    const filteredTenants = getFilteredPendingDeposits();
    const totalBalance = pendingTenants.reduce((sum, tenant) => sum + getDepositBalance(tenant), 0);
    const partialCount = pendingTenants.filter((tenant) => tenant.securityDeposit === "Partial").length;
    const totalEl = document.getElementById("pendingDepositsTotal");
    const tenantsEl = document.getElementById("pendingDepositsTenants");
    const partialEl = document.getElementById("pendingDepositsPartial");
    const countEl = document.getElementById("pendingDepositsTableCount");
    const clearButton = document.getElementById("clearPendingDepositsFilters");
    const search = document.getElementById("pendingDepositsSearch")?.value.trim() || "";
    const estate = document.getElementById("pendingDepositsEstateFilter")?.value || "";
    const status = document.getElementById("pendingDepositsStatusFilter")?.value || "";

    if (totalEl) totalEl.textContent = formatOutstandingAmount(totalBalance);
    if (tenantsEl) tenantsEl.textContent = pendingTenants.length;
    if (partialEl) partialEl.textContent = partialCount;
    if (countEl) countEl.textContent = `Showing ${filteredTenants.length} of ${pendingTenants.length} tenants`;
    if (clearButton) clearButton.disabled = !(search || estate || status);

    document.querySelectorAll(".pending-deposits-table .outstanding-column-sort").forEach((button) => {
      const isActive = button.dataset.sortKey === pendingDepositsSortKey;
      const direction = pendingDepositsSortDirection === "asc" ? "ascending" : "descending";
      const icon = button.querySelector(".material-symbols-outlined");
      const header = button.closest("th");
      if (icon) icon.textContent = isActive ? (pendingDepositsSortDirection === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";
      button.setAttribute("aria-label", `Sort by ${button.dataset.sortKey} ${isActive ? direction : "ascending"}`);
      button.setAttribute("aria-pressed", String(isActive));
      header?.setAttribute("aria-sort", isActive ? direction : "none");
    });

    if (!table) return;
    if (tenantsLoadState === "loading") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="9">
            <span class="loading-spinner" role="status" aria-label="Loading">
              <img src="assets/spinner.svg" alt="">
              Loading pending security deposits...
            </span>
          </td>
        </tr>`;
      if (countEl) countEl.textContent = "Loading pending security deposits...";
      return;
    }
    if (tenantsLoadState === "error") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="9"><span class="material-symbols-outlined">cloud_off</span>Could not load tenant data.</td>
        </tr>`;
      if (countEl) countEl.textContent = "Could not load tenant data.";
      return;
    }
    if (!filteredTenants.length) {
      const emptyMessage = pendingTenants.length
        ? "No tenants match these filters."
        : "All active tenants have paid their security deposits.";
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="9"><span class="material-symbols-outlined">verified_user</span>${emptyMessage}</td>
        </tr>`;
      return;
    }

    table.innerHTML = filteredTenants
      .map((tenant, index) => {
        const balance = getDepositBalance(tenant);
        return `
        <tr class="pending-deposits-table__row" data-tenant-index="${index}" tabindex="0" role="button" aria-label="View profile for ${escapeHtml(tenant.name)}">
          <td>
            <span class="outstanding-tenant__name">${escapeHtml(tenant.name)}</span>
            <span class="outstanding-tenant__id">${escapeHtml(tenant.id)}</span>
          </td>
          <td><span class="estate-name">${escapeHtml(estateShortName(tenant.estate))}</span></td>
          <td><span class="house-number">${escapeHtml(tenant.house)}</span></td>
          <td><span class="phone-number">${formatPhone(tenant.phone)}</span></td>
          <td><span class="badge ${depositBadgeClass[tenant.securityDeposit] || "badge--pending"}">${escapeHtml(tenant.securityDeposit)}</span></td>
          <td class="text-right">${formatOutstandingAmount(tenant.depositRequiredAmount || 0)}</td>
          <td class="text-right">${formatOutstandingAmount(tenant.depositPaidAmount || 0)}</td>
          <td class="text-right"><span class="outstanding-amount">${formatOutstandingAmount(balance)}</span></td>
          <td>${escapeHtml(tenant.dateBecame || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  /* ── Tenants directory ── */

  let tenantsDirectory = [];

  let tenantsDirectoryInitialized = false;
  let tenantSortKey = "name";
  let tenantSortDirection = "asc";
  let tenantSortInitialized = false;
  let tenantFiltersInitialized = false;
  const TENANTS_DEFAULT_STATUS = "Active";

  const tenantSortLabels = {
    name: "tenant name",
    nationalIdNumber: "National ID No.",
    phone: "phone number",
    estate: "estate",
    house: "house number",
    monthlyRent: "monthly rent",
    securityDeposit: "security deposit",
    dateBecame: "date became tenant",
    status: "status",
  };

  function tenantNationalIdDisplay(tenant) {
    if (tenant?.tenantType === "BUSINESS") return "—";
    return tenant?.nationalIdNumber || "—";
  }

  function parseTenantDate(tenant) {
    const isoDate = String(tenant.dateBecameIso || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return new Date(`${isoDate}T12:00:00`).getTime();
    }

    const displayDate = String(tenant.dateBecame || "").trim();
    const match = displayDate.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!match) return 0;

    const monthIndexes = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = monthIndexes[match[2].toLowerCase()];
    return month === undefined ? 0 : new Date(Number(match[3]), month, Number(match[1]), 12).getTime();
  }

  function tenantSortValue(tenant, key) {
    if (key === "monthlyRent") return Number(tenant.monthlyRent) || 0;
    if (key === "dateBecame") return parseTenantDate(tenant);
    if (key === "phone") return String(tenant.phone || "").replace(/\D/g, "");
    if (key === "nationalIdNumber") return tenantNationalIdDisplay(tenant);
    return tenant[key] ?? "";
  }

  function compareTenants(a, b) {
    const aValue = tenantSortValue(a, tenantSortKey);
    const bValue = tenantSortValue(b, tenantSortKey);
    const comparison = typeof aValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), "en", { numeric: true });
    const directionalComparison = tenantSortDirection === "desc" ? -comparison : comparison;
    return directionalComparison || String(a.name).localeCompare(String(b.name), "en");
  }

  function updateTenantSortUI() {
    document.querySelectorAll(".tenants-table .outstanding-column-sort").forEach((button) => {
      const isActive = button.dataset.sortKey === tenantSortKey;
      const direction = tenantSortDirection === "asc" ? "ascending" : "descending";
      const icon = button.querySelector(".material-symbols-outlined");
      const header = button.closest("th");
      if (icon) icon.textContent = isActive ? (tenantSortDirection === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";
      button.setAttribute("aria-label", `Sort by ${tenantSortLabels[button.dataset.sortKey] || button.dataset.sortKey} ${isActive ? direction : "ascending"}`);
      button.setAttribute("aria-pressed", String(isActive));
      header?.setAttribute("aria-sort", isActive ? direction : "none");
    });
  }

  function initTenantSortOnce() {
    if (tenantSortInitialized) return;
    const buttons = document.querySelectorAll(".tenants-table .outstanding-column-sort");
    if (!buttons.length) return;
    tenantSortInitialized = true;
    buttons.forEach((button) => button.addEventListener("click", () => {
      const nextSortKey = button.dataset.sortKey;
      if (nextSortKey === tenantSortKey) {
        tenantSortDirection = tenantSortDirection === "asc" ? "desc" : "asc";
      } else {
        tenantSortKey = nextSortKey;
        tenantSortDirection = nextSortKey === "monthlyRent" || nextSortKey === "dateBecame" ? "desc" : "asc";
      }
      renderTenantsDirectory();
    }));
  }

  function formatUgx(amount) {
    return `UGX ${Number(amount).toLocaleString("en-UG")}`;
  }

  function tenantInitials(name) {
    return name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join("").toUpperCase();
  }

  const depositBadgeClass = {
    Paid: "badge--paid",
    Pending: "badge--pending",
    Partial: "badge--partial",
    "Not Required": "badge--not-required",
  };

  const statusBadgeClass = {
    Active: "badge--active",
    Notice: "badge--notice",
    Inactive: "badge--inactive",
    Unassigned: "badge--unassigned",
  };

  function isTenantOperationallyActive(tenant) {
    return tenant?.status === "Active" || tenant?.status === "Notice";
  }

  function tenantMatchesStatusFilter(tenant, status) {
    if (!status) return true;
    if (status === "Active") return isTenantOperationallyActive(tenant);
    return tenant?.status === status;
  }

  function isCaretakerTenant(tenant) {
    return Boolean(tenant?.isCaretaker);
  }

  function getEstateRentTenants(estateName) {
    return tenantsDirectory.filter((tenant) => tenant.estate === estateName && !isCaretakerTenant(tenant));
  }

  function getEstateCaretaker(estateName) {
    return tenantsDirectory.find((tenant) => tenant.estate === estateName && isCaretakerTenant(tenant)) || null;
  }

  function renderEstateCaretaker(estateName) {
    const row = document.getElementById("estateDetailCaretaker");
    const nameEl = document.getElementById("estateDetailCaretakerName");
    const phoneLink = document.getElementById("estateDetailCaretakerPhone");
    const phoneText = document.getElementById("estateDetailCaretakerPhoneText");
    if (!row || !nameEl || !phoneLink || !phoneText) return;

    const caretaker = getEstateCaretaker(estateName);
    const name = String(caretaker?.name || "").trim();
    if (!caretaker || !name || name === "—") {
      row.hidden = true;
      phoneLink.hidden = true;
      phoneLink.removeAttribute("href");
      return;
    }

    row.hidden = false;
    nameEl.textContent = name;

    const phone = formatPhone(caretaker.phone);
    if (phone && phone !== "—") {
      phoneLink.hidden = false;
      phoneLink.href = `tel:${phone.replace(/\s+/g, "")}`;
      phoneText.textContent = phone;
    } else {
      phoneLink.hidden = true;
      phoneLink.removeAttribute("href");
      phoneText.textContent = "";
    }
  }

  function initialiseTenantFilters() {
    if (tenantFiltersInitialized) return;

    const searchInput = document.getElementById("tenantsSearch");
    const estateSelect = document.getElementById("tenantsEstateFilter");
    const typeSelect = document.getElementById("tenantsTypeFilter");
    const statusSelect = document.getElementById("tenantsStatusFilter");
    const estateMenu = document.getElementById("tenantsEstateMenu");
    const typeMenu = document.getElementById("tenantsTypeMenu");
    const statusMenu = document.getElementById("tenantsStatusMenu");
    const clearButton = document.getElementById("clearTenantFilters");

    if (!estateSelect || !typeSelect || !statusSelect || !estateMenu || !typeMenu || !statusMenu) return;

    [...new Set(tenantsDirectory.map((tenant) => tenant.estate))]
      .sort()
      .forEach((estate) => addOutstandingFilterOption(estateMenu, estate, estateShortName(estate)));

    const statuses = new Set(tenantsDirectory.map((tenant) => tenant.status));
    statuses.add(TENANTS_DEFAULT_STATUS);
    [...statuses]
      .sort()
      .forEach((status) => addOutstandingFilterOption(statusMenu, status, status));

    const estateFilterControl = initCustomSelect({
      container: document.getElementById("tenantsEstateSelect"),
      trigger: document.getElementById("tenantsEstateTrigger"),
      menu: estateMenu,
      display: document.getElementById("tenantsEstateDisplay"),
      hidden: estateSelect,
    });

    const statusFilterControl = initCustomSelect({
      container: document.getElementById("tenantsStatusSelect"),
      trigger: document.getElementById("tenantsStatusTrigger"),
      menu: statusMenu,
      display: document.getElementById("tenantsStatusDisplay"),
      hidden: statusSelect,
    });

    const typeFilterControl = initCustomSelect({
      container: document.getElementById("tenantsTypeSelect"),
      trigger: document.getElementById("tenantsTypeTrigger"),
      menu: typeMenu,
      display: document.getElementById("tenantsTypeDisplay"),
      hidden: typeSelect,
    });

    statusFilterControl?.setValue(TENANTS_DEFAULT_STATUS);

    [searchInput, estateSelect, typeSelect, statusSelect].forEach((element) => {
      element?.addEventListener(element === searchInput ? "input" : "change", renderTenantsDirectory);
    });

    clearButton?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      estateFilterControl?.setValue("");
      typeFilterControl?.setValue("");
      statusFilterControl?.setValue(TENANTS_DEFAULT_STATUS);
      renderTenantsDirectory();
    });

    tenantFiltersInitialized = true;
  }

  function getFilteredTenants() {
    const search = document.getElementById("tenantsSearch")?.value.trim().toLowerCase() || "";
    const estate = document.getElementById("tenantsEstateFilter")?.value || "";
    const tenantType = document.getElementById("tenantsTypeFilter")?.value || "";
    const status = document.getElementById("tenantsStatusFilter")?.value || "";
    return tenantsDirectory.filter((t) => {
      if (estate && t.estate !== estate) return false;
      if (tenantType && (t.tenantType || "INDIVIDUAL") !== tenantType) return false;
      if (!tenantMatchesStatusFilter(t, status)) return false;
      if (!search) return true;
      return [t.id, t.name, t.phone, formatPhone(t.phone), t.estate, t.house, t.dateBecame, t.dateBecameIso]
        .join(" ")
        .toLowerCase()
        .includes(search);
    }).sort(compareTenants);
  }

  function renderTenantsDirectory() {
    initTenantsDirectoryOnce();
    initTenantSortOnce();
    if (tenantsLoadState === "ready") initialiseTenantFilters();

    const table = document.getElementById("tenantsTable");
    const countEl = document.getElementById("tenantsTableCount");
    const clearButton = document.getElementById("clearTenantFilters");
    const search = document.getElementById("tenantsSearch")?.value.trim() || "";
    const estate = document.getElementById("tenantsEstateFilter")?.value || "";
    const tenantType = document.getElementById("tenantsTypeFilter")?.value || "";
    const status = document.getElementById("tenantsStatusFilter")?.value || "";

    const filtered = getFilteredTenants();
    if (countEl) {
      countEl.textContent = `Showing ${filtered.length} tenant${filtered.length === 1 ? "" : "s"}`;
    }
    if (clearButton) clearButton.disabled = !(search || estate || tenantType || (status && status !== TENANTS_DEFAULT_STATUS));
    updateTenantSortUI();

    if (!table) return;
    if (tenantsLoadState === "loading") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="9">
            <span class="loading-spinner" role="status" aria-label="Loading">
              <img src="assets/spinner.svg" alt="">
              Loading...
            </span>
          </td>
        </tr>`;
      return;
    }
    if (tenantsLoadState === "error") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="9"><span class="material-symbols-outlined">cloud_off</span>Could not load tenants.</td>
        </tr>`;
      return;
    }
    if (!filtered.length) {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="9"><span class="material-symbols-outlined">person_search</span>No tenants match your search.</td>
        </tr>`;
      return;
    }

    table.innerHTML = filtered
      .map((t, i) => `
        <tr class="tenants-table__row" data-tenant-index="${i}" tabindex="0" role="button" aria-label="View profile for ${t.name}">
          <td>
            <span class="outstanding-tenant__name">${t.name}</span>
            <span class="outstanding-tenant__id">${t.id}</span>
          </td>
          <td><span class="tenants-national-id">${escapeHtml(tenantNationalIdDisplay(t))}</span></td>
          <td><span class="phone-number">${formatPhone(t.phone)}</span></td>
          <td><span class="estate-name">${escapeHtml(estateShortName(t.estate))}</span></td>
          <td><span class="house-number">${t.house}</span></td>
          <td class="text-right"><span class="tenants-rent-amount">${formatUgx(t.monthlyRent)}</span></td>
          <td><span class="badge ${depositBadgeClass[t.securityDeposit] || "badge--paid"}">${t.securityDeposit}</span></td>
          <td>
            <span class="tenants-date">${t.dateBecame}</span>
            ${(t.status === "Inactive" || t.status === "Notice") && t.moveOutDate && t.moveOutDate !== "—"
              ? `<span class="tenants-date tenants-date--move-out">Out: ${t.moveOutDate}</span>`
              : ""}
          </td>
          <td><span class="badge ${statusBadgeClass[t.status] || "badge--active"}">${t.status}</span></td>
        </tr>`)
      .join("");
  }

  /* ── Estates directory ── */

  let estatesDirectoryInitialized = false;

  function parseEstateDisplay(fullName) {
    const trimmed = String(fullName || "").trim();
    if (!trimmed) return { name: "", location: "" };

    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) return { name: trimmed, location: "" };

    const location = parts[parts.length - 1];
    return {
      name: parts.slice(0, -1).join(" "),
      location: location.charAt(0).toUpperCase() + location.slice(1).toLowerCase(),
    };
  }

  function estateShortName(fullName) {
    return parseEstateDisplay(fullName).name || String(fullName || "").trim();
  }

  const ESTATE_IMAGES = {
    "Moriah Kikaya": "assets/estate-moriah.png",
    "Ebenezer Kawempe": "assets/estate-ebenezer.png",
    "Horeb Ntinda": "assets/estate-ntinda.png",
    Kibuli: "assets/estate-property.png",
    Nansana: "assets/estate-nancy.png",
    "Goshen Kawempe": "assets/estate-gashy.png",
    "Salem Maganjo": "assets/estate-chibi.png",
  };

  function getEstateImage(estateName) {
    const { name } = parseEstateDisplay(estateName);
    return ESTATE_IMAGES[estateName] || ESTATE_IMAGES[name] || "assets/estate-property.png";
  }

  function getEstateDirectory() {
    const estates = new Map();

    tenantsDirectory.forEach((tenant) => {
      const name = String(tenant.estate || "").trim();
      if (!name || name === "—" || isCaretakerTenant(tenant)) return;

      if (!estates.has(name)) {
        estates.set(name, { name, tenants: 0, activeTenants: 0 });
      }

      const estate = estates.get(name);
      estate.tenants += 1;
      if (isTenantOperationallyActive(tenant)) estate.activeTenants += 1;
    });

    return [...estates.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderEstatesDirectory() {
    initEstatesDirectoryOnce();

    const grid = document.getElementById("estatesGrid");
    if (!grid) return;

    if (tenantsLoadState === "loading") {
      grid.innerHTML = `
        <div class="estates-empty">
          <span class="loading-spinner" role="status" aria-label="Loading estates">
            <img src="assets/spinner.svg" alt="">
            Loading estates...
          </span>
        </div>`;
      return;
    }

    if (tenantsLoadState === "error") {
      grid.innerHTML = `
        <div class="estates-empty">
          <span class="material-symbols-outlined" aria-hidden="true">error</span>
          Estates could not be loaded. Please try again.
        </div>`;
      return;
    }

    const estates = getEstateDirectory();

    if (!estates.length) {
      grid.innerHTML = `
        <div class="estates-empty">
          <span class="material-symbols-outlined" aria-hidden="true">location_city</span>
          No estates have tenants assigned yet.
        </div>`;
      return;
    }

    grid.innerHTML = estates
      .map((estate) => {
        const display = parseEstateDisplay(estate.name);
        const ariaLabel = display.location
          ? `Open ${display.name}, ${display.location}`
          : `Open ${display.name}`;

        return `
        <button type="button" class="estate-card" data-estate-name="${escapeHtml(estate.name)}" aria-label="${escapeHtml(ariaLabel)}">
          <span class="estate-card__image">
            <img src="${getEstateImage(estate.name)}" alt="">
          </span>
          <span class="estate-card__content">
            <span class="estate-card__info">
              <span class="estate-card__name">${escapeHtml(display.name)}</span>
              <span class="estate-card__address">
                <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                <span>${escapeHtml(display.location || "—")}</span>
              </span>
            </span>
            <span class="estate-card__stat">
              <span class="material-symbols-outlined" aria-hidden="true">groups</span>
              <strong>${estate.activeTenants}</strong>
              <span class="estate-card__stat-label">
                <span>Active</span>
                <span>tenants</span>
              </span>
            </span>
          </span>
        </button>`;
      })
      .join("");
  }

  function setTenantDirectorySelectValue(inputId, displayId, menuId, value, fallbackLabel) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    const menu = document.getElementById(menuId);
    if (!input || !display || !menu) return;

    const option = [...menu.querySelectorAll(".custom-select__option")]
      .find((item) => item.dataset.value === value);
    input.value = value;
    display.textContent = option?.dataset.label || fallbackLabel;
    menu.querySelectorAll(".custom-select__option").forEach((item) => {
      const selected = item === option;
      item.classList.toggle("custom-select__option--selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
  }

  function openEstateTenantDirectory(estateName) {
    navigateToView("tenants");

    const search = document.getElementById("tenantsSearch");
    if (search) search.value = "";
    setTenantDirectorySelectValue(
      "tenantsEstateFilter",
      "tenantsEstateDisplay",
      "tenantsEstateMenu",
      estateName,
      estateShortName(estateName)
    );
    setTenantDirectorySelectValue("tenantsStatusFilter", "tenantsStatusDisplay", "tenantsStatusMenu", TENANTS_DEFAULT_STATUS, TENANTS_DEFAULT_STATUS);
    renderTenantsDirectory();
  }

  function initEstatesDirectoryOnce() {
    if (estatesDirectoryInitialized) return;

    document.getElementById("estatesGrid")?.addEventListener("click", (event) => {
      const card = event.target.closest(".estate-card");
      if (card) openEstateDetail(card.dataset.estateName);
    });

    estatesDirectoryInitialized = true;
  }

  /* ── Estate detail ── */

  let currentEstateDetailName = null;
  let estateDetailInitialized = false;
  let estateDetailChart = null;
  let estateTenantTypeFilterControl = null;
  let estateTenantStatusFilterControl = null;

  const ESTATE_DETAIL_KEY = "rentledger:estateDetailName";

  try {
    currentEstateDetailName = localStorage.getItem(ESTATE_DETAIL_KEY) || null;
  } catch (_) {}

  function initEstateDetailOnce() {
    if (estateDetailInitialized) return;

    document.getElementById("estateDetailBack")?.addEventListener("click", () => {
      navigateToView("estates");
    });

    document.getElementById("estateDetailViewTenants")?.addEventListener("click", () => {
      if (currentEstateDetailName) openEstateTenantDirectory(currentEstateDetailName);
    });

    document.getElementById("estateDetailRecordPayment")?.addEventListener("click", () => {
      navigateToView("payment-entry");
    });

    const openTenantFromRow = (row) => {
      if (!row) return;
      const tenant = tenantsDirectory.find((t) => t.id === row.dataset.tenantId);
      if (tenant) openTenantProfile(tenant);
    };

    const estateTenantsTable = document.getElementById("estateTenantsTable");
    estateTenantsTable?.addEventListener("click", (event) => {
      openTenantFromRow(event.target.closest(".estate-tenants-table__row"));
    });
    estateTenantsTable?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTenantFromRow(event.target.closest(".estate-tenants-table__row"));
    });

    const estateTenantSearch = document.getElementById("estateTenantsSearch");
    const estateTenantType = document.getElementById("estateTenantsTypeFilter");
    const estateTenantStatus = document.getElementById("estateTenantsStatusFilter");
    const clearEstateTenantFilters = document.getElementById("clearEstateTenantsFilters");

    estateTenantTypeFilterControl = initCustomSelect({
      container: document.getElementById("estateTenantsTypeSelect"),
      trigger: document.getElementById("estateTenantsTypeTrigger"),
      menu: document.getElementById("estateTenantsTypeMenu"),
      display: document.getElementById("estateTenantsTypeDisplay"),
      hidden: estateTenantType,
    });

    estateTenantStatusFilterControl = initCustomSelect({
      container: document.getElementById("estateTenantsStatusSelect"),
      trigger: document.getElementById("estateTenantsStatusTrigger"),
      menu: document.getElementById("estateTenantsStatusMenu"),
      display: document.getElementById("estateTenantsStatusDisplay"),
      hidden: estateTenantStatus,
    });

    estateTenantStatusFilterControl?.setValue(TENANTS_DEFAULT_STATUS);

    [estateTenantSearch, estateTenantType, estateTenantStatus].forEach((element) => {
      element?.addEventListener(element === estateTenantSearch ? "input" : "change", () => {
        if (currentEstateDetailName) renderEstateDetail(currentEstateDetailName);
      });
    });

    clearEstateTenantFilters?.addEventListener("click", () => {
      if (estateTenantSearch) estateTenantSearch.value = "";
      estateTenantTypeFilterControl?.setValue("");
      estateTenantStatusFilterControl?.setValue(TENANTS_DEFAULT_STATUS);
      if (currentEstateDetailName) renderEstateDetail(currentEstateDetailName);
    });

    initTenantModalOnce();
    estateDetailInitialized = true;
  }

  function openEstateDetail(estateName) {
    currentEstateDetailName = estateName;
    try {
      localStorage.setItem(ESTATE_DETAIL_KEY, estateName);
    } catch (_) {}
    navigateToView("estate-detail");
    renderEstateDetail(estateName);
  }

  function buildEstateMonthlyCollection(estateName) {
    const year = new Date().getFullYear();
    const monthTotals = new Array(12).fill(0);

    getCollectionPayments()
      .filter((payment) => payment.estate === estateName && payment.year === year)
      .forEach((payment) => {
        if (payment.month >= 0 && payment.month < 12) monthTotals[payment.month] += payment.amount;
      });

    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return { year, labels, collected: monthTotals };
  }

  function renderEstateCollectionChart(estateName) {
    const canvas = document.getElementById("estateCollectionChart");
    if (!canvas || typeof Chart === "undefined") return;

    const { year, labels, collected } = buildEstateMonthlyCollection(estateName);
    const yearLabel = document.getElementById("estateCollectionYear");
    if (yearLabel) yearLabel.textContent = String(year);
    const data = collected.slice();

    if (estateDetailChart) {
      estateDetailChart.data.labels = labels;
      estateDetailChart.data.datasets[0].data = data;
      estateDetailChart.update();
      return;
    }

    estateDetailChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Collected",
            data,
            backgroundColor: "#2d5a43",
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 0,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1b1b1c",
            titleFont: { family: "Plus Jakarta Sans", size: 13 },
            bodyFont: { family: "Plus Jakarta Sans", size: 12 },
            padding: 12,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.raw) || 0;
                return ` Collected: ${formatUgx(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: "Plus Jakarta Sans", size: 12 }, color: "#737785" },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#f0eded", drawBorder: false },
            border: { display: false, dash: [4, 4] },
            ticks: {
              font: { family: "Plus Jakarta Sans", size: 11 },
              color: "#737785",
              callback: (v) => Number(v).toLocaleString("en-UG"),
            },
          },
        },
      },
    });
  }

  function getEstateTenantFilterState() {
    const statusInput = document.getElementById("estateTenantsStatusFilter");
    return {
      search: document.getElementById("estateTenantsSearch")?.value.trim().toLowerCase() || "",
      tenantType: document.getElementById("estateTenantsTypeFilter")?.value || "",
      status: statusInput ? statusInput.value : TENANTS_DEFAULT_STATUS,
    };
  }

  function getFilteredEstateTenants(estateTenants) {
    const { search, tenantType, status } = getEstateTenantFilterState();
    return estateTenants.filter((tenant) => {
      if (tenantType && (tenant.tenantType || "INDIVIDUAL") !== tenantType) return false;
      if (!tenantMatchesStatusFilter(tenant, status)) return false;
      if (!search) return true;
      return [
        tenant.id,
        tenant.name,
        tenant.phone,
        formatPhone(tenant.phone),
        tenant.house,
        tenant.dateBecame,
        tenant.dateBecameIso,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }

  function renderEstateDetail(estateName) {
    initEstateDetailOnce();
    if (!estateName) return;

    const estateTenants = getEstateRentTenants(estateName);
    const activeTenants = estateTenants.filter(isTenantOperationallyActive);
    const filteredTenants = getFilteredEstateTenants(estateTenants)
      .sort((a, b) => String(a.house).localeCompare(String(b.house), "en", { numeric: true }));
    const estateTenantFilterState = getEstateTenantFilterState();
    const arrears = outstandingBalances.filter((balance) => balance.estate === estateName);
    const outstanding = arrears.reduce((sum, balance) => sum + (Number(balance.outstanding) || 0), 0);
    const expectedRent = activeTenants.reduce((sum, tenant) => sum + (Number(tenant.monthlyRent) || 0), 0);
    const depositsPending = estateTenants.filter(
      (tenant) => tenant.securityDeposit === "Pending" || tenant.securityDeposit === "Partial"
    ).length;

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    const display = parseEstateDisplay(estateName);

    setText("estateDetailCrumb", display.name);
    setText("estateDetailTitle", display.name);

    const locationRow = document.getElementById("estateDetailSubtitle");
    if (locationRow) {
      if (display.location) {
        locationRow.hidden = false;
        setText("estateDetailLocation", display.location);
      } else {
        locationRow.hidden = true;
      }
    }

    renderEstateCaretaker(estateName);

    const detailImage = document.getElementById("estateDetailImage");
    if (detailImage) detailImage.src = getEstateImage(estateName);

    setText("estateStatTotal", estateTenants.length);
    setText("estateStatActive", activeTenants.length);
    setText("estateStatArrears", arrears.length);

    setText("estateInfoExpected", formatUgx(expectedRent));
    setText("estateInfoOutstanding", formatUgx(outstanding));
    setText("estateInfoArrears", arrears.length);
    setText("estateInfoDeposits", depositsPending);

    setText("estateTenantsCount", `Showing ${filteredTenants.length} of ${estateTenants.length}`);
    const clearButton = document.getElementById("clearEstateTenantsFilters");
    if (clearButton) {
      clearButton.disabled = !(
        estateTenantFilterState.search ||
        estateTenantFilterState.tenantType ||
        estateTenantFilterState.status !== TENANTS_DEFAULT_STATUS
      );
    }

    const tableBody = document.getElementById("estateTenantsTable");
    if (tableBody) {
      if (tenantsLoadState === "loading") {
        tableBody.innerHTML = `
          <tr><td colspan="5" class="estate-tenants-table__empty">
            <span class="loading-spinner" role="status" aria-label="Loading">
              <img src="assets/spinner.svg" alt="">Loading...
            </span>
          </td></tr>`;
      } else if (!estateTenants.length) {
        tableBody.innerHTML = `
          <tr><td colspan="5" class="estate-tenants-table__empty">No tenants assigned to this estate yet.</td></tr>`;
      } else if (!filteredTenants.length) {
        tableBody.innerHTML = `
          <tr><td colspan="5" class="estate-tenants-table__empty">No tenants match these filters.</td></tr>`;
      } else {
        tableBody.innerHTML = filteredTenants
          .map(
            (tenant) => `
            <tr class="estate-tenants-table__row" data-tenant-id="${escapeHtml(tenant.id)}" tabindex="0" role="button" aria-label="View profile for ${escapeHtml(tenant.name)}">
              <td>${escapeHtml(tenant.house)}</td>
              <td>${escapeHtml(tenant.name)}</td>
              <td class="text-right">${formatUgx(tenant.monthlyRent)}</td>
              <td><span class="badge ${statusBadgeClass[tenant.status] || "badge--active"}">${escapeHtml(tenant.status)}</span></td>
              <td><span class="badge ${depositBadgeClass[tenant.securityDeposit] || "badge--paid"}">${escapeHtml(tenant.securityDeposit)}</span></td>
            </tr>`
          )
          .join("");
      }
    }

    renderEstateCollectionChart(estateName);
  }

  function initTenantsDirectoryOnce() {
    if (tenantsDirectoryInitialized) return;

    const exportButton = document.getElementById("exportTenantsBtn");
    const tenantsTableBody = document.getElementById("tenantsTable");

    exportButton?.addEventListener("click", openExportTenantsModal);

    tenantsTableBody?.addEventListener("click", (e) => {
      const row = e.target.closest(".tenants-table__row");
      if (!row) return;
      const filtered = getFilteredTenants();
      const index = parseInt(row.dataset.tenantIndex, 10);
      openTenantProfile(filtered[index]);
    });

    tenantsTableBody?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest(".tenants-table__row");
      if (!row) return;
      e.preventDefault();
      const filtered = getFilteredTenants();
      const index = parseInt(row.dataset.tenantIndex, 10);
      openTenantProfile(filtered[index]);
    });

    initTenantModalOnce();
    tenantsDirectoryInitialized = true;
  }

  let tenantModalInitialized = false;
  let activeTenantProfile = null;
  let tenantProfileMode = "view";
  let tenantEditUnits = [];
  let tenantEditRequestSequence = 0;

  function initTenantModalOnce() {
    const modal = document.getElementById("tenantModal");
    const backdrop = document.getElementById("tenantModalBackdrop");
    const closeBtn = document.getElementById("tenantModalClose");
    const actions = document.getElementById("tenantProfileActions");

    if (!modal || tenantModalInitialized) return;
    tenantModalInitialized = true;

    function closeTenantProfile() {
      tenantProfileMode = "view";
      activeTenantProfile = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    closeBtn?.addEventListener("click", closeTenantProfile);
    backdrop?.addEventListener("click", closeTenantProfile);
    actions?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.id === "tenantEditBtn" && activeTenantProfile) {
        renderTenantProfileEdit(activeTenantProfile);
      } else if (button.id === "tenantCancelEditBtn" && activeTenantProfile) {
        renderTenantProfileView(activeTenantProfile);
      } else if (button.id === "tenantSaveBtn") {
        saveTenantProfileEdit();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeTenantProfile();
    });
  }

  function tenantDisplayName(tenant) {
    if (!tenant) return "—";
    if (tenant.tenantType === "BUSINESS" && tenant.businessName) return tenant.businessName;
    if (tenant.individualName) return tenant.individualName;
    if (tenant.displayName) return tenant.displayName;
    return tenant.name || "—";
  }

  function tenantIndividualName(tenant) {
    if (!tenant) return "—";
    const parts = [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean);
    if (parts.length) return parts.join(" ");
    return tenant.individualName || "—";
  }

  function setTenantProfileActions(mode) {
    const isEdit = mode === "edit";
    const actions = document.getElementById("tenantProfileActions");
    if (!actions) return;
    actions.innerHTML = isEdit
      ? `
        <button type="button" class="btn btn--outline" id="tenantCancelEditBtn">Cancel</button>
        <button type="button" class="btn btn--primary btn--icon" id="tenantSaveBtn">
          <span class="material-symbols-outlined icon icon--btn">save</span>
          Save changes
        </button>`
      : `
        <button type="button" class="btn btn--primary btn--icon" id="tenantEditBtn">
          <span class="material-symbols-outlined icon icon--btn">edit</span>
          Edit Tenant
        </button>`;
  }

  function setTenantProfileValue(id, value, locked = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value || "—";
    if (el.classList.contains("tenant-profile__value")) {
      el.classList.toggle("tenant-profile__value--locked", locked);
      el.classList.remove("tenant-profile__edit-stack");
    }
  }

  function setTenantProfileHtml(id, html) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    if (el.classList.contains("tenant-profile__value")) {
      el.classList.remove("tenant-profile__value--locked");
      el.classList.remove("tenant-profile__edit-stack");
    }
  }

  function tenantProfileSelectMarkup(id, options, selectedValue, placeholder, disabled = false) {
    const selected = options.find((option) => String(option.value) === String(selectedValue));
    const display = selected?.label || placeholder || "Select";
    const optionItems = options.length
      ? options.map((option) => {
        const selectedOption = String(option.value) === String(selectedValue);
        return `
          <li class="custom-select__option${selectedOption ? " custom-select__option--selected" : ""}" role="option" data-value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}" aria-selected="${selectedOption ? "true" : "false"}">${escapeHtml(option.label)}</li>`;
      }).join("")
      : `<li class="custom-select__option custom-select__option--selected" role="option" data-value="" data-label="${escapeHtml(placeholder || "No options")}" aria-selected="true">${escapeHtml(placeholder || "No options")}</li>`;

    return `
      <div class="custom-select tenant-profile__custom-select" id="${id}Select">
        <button type="button" class="custom-select__trigger" id="${id}Trigger" aria-haspopup="listbox" aria-expanded="false"${disabled ? " disabled" : ""}>
          <span class="custom-select__value" id="${id}Display">${escapeHtml(display)}</span>
          <span class="material-symbols-outlined icon icon--select" aria-hidden="true">expand_more</span>
        </button>
        <input type="hidden" id="${id}" value="${escapeHtml(selected ? selected.value : "")}">
        <ul class="custom-select__menu" id="${id}Menu" role="listbox" hidden>${optionItems}</ul>
      </div>`;
  }

  function initTenantProfileSelect(id, onChange) {
    const control = initCustomSelect({
      container: document.getElementById(`${id}Select`),
      trigger: document.getElementById(`${id}Trigger`),
      menu: document.getElementById(`${id}Menu`),
      display: document.getElementById(`${id}Display`),
      hidden: document.getElementById(id),
    });
    if (onChange) document.getElementById(id)?.addEventListener("change", onChange);
    return control;
  }

  function tenantProfileLockedDate(value) {
    return `
      <button type="button" class="datepicker__trigger tenant-profile__locked-date" disabled aria-disabled="true">
        <span class="material-symbols-outlined icon icon--input" aria-hidden="true">calendar_today</span>
        <span class="datepicker__value">${escapeHtml(value || "—")}</span>
      </button>`;
  }

  function tenantProfileLockedText(value) {
    return `<input class="tenant-profile__input tenant-profile__input--locked" value="${escapeHtml(value || "—")}" disabled readonly aria-readonly="true">`;
  }

  function normalizeNationalIdInput(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function isValidNationalIdNumber(value) {
    return /^[A-Z0-9]{8,20}$/.test(normalizeNationalIdInput(value));
  }

  function tenantProfileDatePickerMarkup(prefix, isoValue = "") {
    return `
      <div class="datepicker tenant-profile__datepicker" id="${prefix}Picker">
        <button type="button" class="datepicker__trigger" id="${prefix}Trigger" aria-haspopup="dialog" aria-expanded="false">
          <span class="material-symbols-outlined icon icon--input" aria-hidden="true">calendar_today</span>
          <span class="datepicker__value" id="${prefix}Display">Select date</span>
        </button>
        <input type="hidden" id="${prefix}Input" value="${escapeHtml(isoValue || "")}">
        <div class="datepicker__popover" id="${prefix}Popover" role="dialog" aria-label="Choose move-out date" hidden>
          <div class="datepicker__header">
            <button type="button" class="datepicker__nav-btn" id="${prefix}Prev" aria-label="Previous month"><span class="material-symbols-outlined">chevron_left</span></button>
            <span class="datepicker__month-label" id="${prefix}MonthLabel"></span>
            <button type="button" class="datepicker__nav-btn" id="${prefix}Next" aria-label="Next month"><span class="material-symbols-outlined">chevron_right</span></button>
          </div>
          <div class="datepicker__toolbar">
            <input type="text" class="datepicker__field" id="${prefix}Field" readonly>
            <button type="button" class="datepicker__today-btn" id="${prefix}Today">Today</button>
          </div>
          <div class="datepicker__weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
          <div class="datepicker__grid" id="${prefix}Grid"></div>
          <div class="datepicker__footer">
            <button type="button" class="datepicker__btn datepicker__btn--cancel" id="${prefix}Cancel">Cancel</button>
            <button type="button" class="datepicker__btn datepicker__btn--apply" id="${prefix}Apply">Apply</button>
          </div>
        </div>
      </div>`;
  }

  function initTenantProfileDatePicker(prefix) {
    return initDatePicker({
      picker: document.getElementById(`${prefix}Picker`),
      trigger: document.getElementById(`${prefix}Trigger`),
      popover: document.getElementById(`${prefix}Popover`),
      display: document.getElementById(`${prefix}Display`),
      hidden: document.getElementById(`${prefix}Input`),
      field: document.getElementById(`${prefix}Field`),
      monthLabel: document.getElementById(`${prefix}MonthLabel`),
      grid: document.getElementById(`${prefix}Grid`),
      prevBtn: document.getElementById(`${prefix}Prev`),
      nextBtn: document.getElementById(`${prefix}Next`),
      todayBtn: document.getElementById(`${prefix}Today`),
      cancelBtn: document.getElementById(`${prefix}Cancel`),
      applyBtn: document.getElementById(`${prefix}Apply`),
      emptyLabel: "Select move-out date",
    });
  }

  function tenantProfileInput(id, value, options = {}) {
    const type = options.type || "text";
    const attrs = options.attrs || "";
    return `<input class="tenant-profile__input${options.className ? ` ${options.className}` : ""}" id="${id}" type="${type}" value="${escapeHtml(value || "")}" ${attrs}>`;
  }

  function tenantProfileNumberInput(id, value, min, max) {
    return tenantProfileInput(id, value, {
      type: "number",
      attrs: `min="${min}" max="${max}" step="1" inputmode="numeric"`,
    });
  }

  function tenantProfileAmountInput(id, value, allowZero = false) {
    return tenantProfileInput(id, String(Number(value) || 0), {
      type: "text",
      attrs: `inputmode="numeric" data-allow-zero="${allowZero ? "true" : "false"}"`,
    });
  }

  function renderTenantProfileHeader(tenant) {
    if (!tenant) return;
    const displayName = tenantDisplayName(tenant);

    document.getElementById("tenantProfileAvatar").textContent = tenantInitials(displayName);
    document.getElementById("tenantModalName").textContent = displayName;

    const statusEl = document.getElementById("tenantProfileStatus");
    statusEl.textContent = tenant.status;
    statusEl.className = `badge ${statusBadgeClass[tenant.status] || "badge--active"}`;
  }

  function renderTenantProfileView(tenant) {
    if (!tenant) return;
    activeTenantProfile = tenant;
    tenantProfileMode = "view";
    tenantEditRequestSequence += 1;
    tenantEditUnits = [];
    setTenantProfileActions("view");

    const isBusiness = tenant.tenantType === "BUSINESS";
    renderTenantProfileHeader(tenant);

    setTenantProfileValue("tpTenantId", tenant.id || "—", true);
    setTenantProfileValue("tpTenantType", isBusiness ? "Business" : "Individual");

    const businessField = document.getElementById("tpBusinessNameField");
    const individualField = document.getElementById("tpIndividualNameField");
    const nationalIdField = document.getElementById("tpNationalIdField");
    const statusField = document.getElementById("tpStatusField");
    if (businessField) businessField.hidden = !isBusiness;
    if (individualField) individualField.hidden = isBusiness;
    if (nationalIdField) nationalIdField.hidden = isBusiness;
    if (statusField) statusField.hidden = true;

    setTenantProfileValue("tpBusinessName", tenant.businessName || "—");
    setTenantProfileValue("tpIndividualName", tenantIndividualName(tenant));
    setTenantProfileValue("tpNationalId", tenant.nationalIdNumber || "—", Boolean(tenant.nationalIdNumber));
    setTenantProfileValue("tpPhone", formatPhone(tenant.phone));
    setTenantProfileValue("tpAltPhone", tenant.altPhone && tenant.altPhone !== "—"
      ? formatPhone(tenant.altPhone)
      : "—");
    setTenantProfileValue("tpDateBecame", tenant.dateBecame, true);
    setTenantProfileValue("tpEstate", estateShortName(tenant.estate));
    setTenantProfileValue("tpHouse", tenant.house);
    setTenantProfileValue("tpMoveIn", tenant.moveInDate || tenant.dateBecame, true);
    const moveOutField = document.getElementById("tpMoveOutField");
    const showMoveOut = tenant.status === "Inactive" || tenant.status === "Notice";
    if (moveOutField) moveOutField.hidden = !showMoveOut;
    setTenantProfileValue("tpMoveOut", showMoveOut
      ? (tenant.moveOutDate && tenant.moveOutDate !== "—" ? tenant.moveOutDate : "Not recorded")
      : "—");
    setTenantProfileValue("tpRent", formatUgx(tenant.monthlyRent));
    setTenantProfileValue("tpDepositRequired", tenant.depositRequired || "—");
    setTenantProfileValue("tpDepositPaid", tenant.depositPaid || "—");
    setTenantProfileValue("tpDueDay", tenant.dueDay || "—");
    setTenantProfileValue("tpGrace", tenant.gracePeriod || "—");
    setTenantProfileValue("tpNotes", tenant.notes || "No notes.");
  }

  function syncTenantProfileTypeFields() {
    const type = document.getElementById("tpTenantTypeInput")?.value || "INDIVIDUAL";
    const businessField = document.getElementById("tpBusinessNameField");
    const individualField = document.getElementById("tpIndividualNameField");
    const nationalIdField = document.getElementById("tpNationalIdField");
    if (businessField) businessField.hidden = type !== "BUSINESS";
    if (individualField) individualField.hidden = type === "BUSINESS";
    if (nationalIdField) nationalIdField.hidden = type === "BUSINESS";
  }

  function syncTenantProfileStatusFields() {
    const status = document.getElementById("tpStatusInput")?.value || "Active";
    const moveOutField = document.getElementById("tpMoveOutField");
    if (moveOutField) moveOutField.hidden = status !== "Inactive";
  }

  async function loadTenantProfileRooms(estateId, selectedUnitId) {
    if (!estateId || !activeTenantProfile) {
      setTenantProfileHtml("tpHouse", tenantProfileSelectMarkup("tpHouseInput", [], "", "Choose an estate first", true));
      return;
    }
    const requestId = ++tenantEditRequestSequence;
    setTenantProfileHtml("tpHouse", tenantProfileSelectMarkup("tpHouseInput", [], "", "Loading house numbers...", true));

    try {
      const params = new URLSearchParams({ estateId: String(estateId), tenantId: activeTenantProfile.id });
      const response = await RentLedgerApi.get(`/api/tenants/available-units?${params.toString()}`);
      if (requestId !== tenantEditRequestSequence || tenantProfileMode !== "edit") return;
      tenantEditUnits = Array.isArray(response?.units) ? response.units : [];
      const options = tenantEditUnits.map((unit) => ({
        value: String(unit.unitId),
        label: String(unit.unitNumber),
      }));
      setTenantProfileHtml(
        "tpHouse",
        tenantProfileSelectMarkup("tpHouseInput", options, selectedUnitId || activeTenantProfile.unitId || "", tenantEditUnits.length ? "Select house number" : "No house numbers available", tenantEditUnits.length === 0)
      );
      initTenantProfileSelect("tpHouseInput", (event) => {
        const unit = tenantEditUnits.find((item) => String(item.unitId) === event.target.value);
        if (!unit || String(unit.unitId) === String(activeTenantProfile?.unitId)) return;
        const rentInput = document.getElementById("tpMonthlyRentInput");
        if (rentInput) rentInput.value = String(unit.listedMonthlyRent || "");
      });
    } catch {
      if (requestId !== tenantEditRequestSequence || tenantProfileMode !== "edit") return;
      setTenantProfileHtml("tpHouse", tenantProfileSelectMarkup("tpHouseInput", [], "", "Could not load house numbers", true));
    }
  }

  async function loadTenantProfileEstates(tenant) {
    const requestId = ++tenantEditRequestSequence;
    setTenantProfileHtml("tpEstate", tenantProfileSelectMarkup("tpEstateInput", [], "", "Loading estates...", true));

    try {
      const response = await RentLedgerApi.get("/api/tenants/available-units");
      if (requestId !== tenantEditRequestSequence || tenantProfileMode !== "edit") return;
      const estates = Array.isArray(response?.estates) ? response.estates : [];
      const options = estates.map((estate) => ({
        value: String(estate.estateId),
        label: estateShortName(estate.estateName),
      }));
      setTenantProfileHtml(
        "tpEstate",
        tenantProfileSelectMarkup("tpEstateInput", options, tenant.estateId || "", estates.length ? "Select an estate" : "No active estates", estates.length === 0)
      );
      initTenantProfileSelect("tpEstateInput", (event) => loadTenantProfileRooms(event.target.value, ""));
      await loadTenantProfileRooms(document.getElementById("tpEstateInput")?.value || "", tenant.unitId);
    } catch {
      if (requestId !== tenantEditRequestSequence || tenantProfileMode !== "edit") return;
      setTenantProfileHtml("tpEstate", tenantProfileSelectMarkup("tpEstateInput", [], "", "Could not load estates", true));
    }
  }

  function renderTenantProfileEdit(tenant) {
    if (!tenant) return;
    activeTenantProfile = tenant;
    tenantProfileMode = "edit";
    tenantEditUnits = [];
    setTenantProfileActions("edit");
    renderTenantProfileHeader(tenant);

    setTenantProfileValue("tpTenantId", tenant.id || "—", true);
    document.getElementById("tpStatusField")?.removeAttribute("hidden");
    const isBusiness = tenant.tenantType === "BUSINESS";
    const nationalIdField = document.getElementById("tpNationalIdField");
    if (nationalIdField) nationalIdField.hidden = isBusiness;
    setTenantProfileHtml("tpTenantType", tenantProfileSelectMarkup("tpTenantTypeInput", [
      { value: "INDIVIDUAL", label: "Individual" },
      { value: "BUSINESS", label: "Business" },
    ], tenant.tenantType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL", "Select tenant type"));
    setTenantProfileHtml("tpStatus", tenantProfileSelectMarkup("tpStatusInput", [
      { value: "Active", label: "Active" },
      { value: "Inactive", label: "Inactive" },
    ], tenant.status === "Inactive" || tenant.status === "Notice" ? "Inactive" : "Active", "Select status"));
    setTenantProfileHtml("tpBusinessName", tenantProfileInput("tpBusinessNameInput", tenant.businessName || tenantDisplayName(tenant)));
    setTenantProfileHtml("tpIndividualName", `
      <span class="tenant-profile__edit-stack">
        ${tenantProfileInput("tpFirstNameInput", tenant.firstName || "")}
        ${tenantProfileInput("tpMiddleNameInput", tenant.middleName || "", { attrs: 'placeholder="Middle name (optional)"' })}
        ${tenantProfileInput("tpLastNameInput", tenant.lastName || "")}
      </span>`);
    document.getElementById("tpIndividualName")?.classList.add("tenant-profile__edit-stack");
    if (tenant.nationalIdNumber) {
      setTenantProfileHtml("tpNationalId", tenantProfileLockedText(tenant.nationalIdNumber));
    } else {
      setTenantProfileHtml("tpNationalId", tenantProfileInput("tpNationalIdInput", "", {
        attrs: 'placeholder="Enter National ID No." maxlength="20" autocapitalize="characters" spellcheck="false"',
      }));
    }
    setTenantProfileHtml("tpPhone", tenantProfileInput("tpPhoneInput", tenant.phone || "", { attrs: 'inputmode="tel"' }));
    setTenantProfileHtml("tpAltPhone", tenantProfileInput("tpAltPhoneInput", tenant.altPhone && tenant.altPhone !== "—" ? tenant.altPhone : "", { attrs: 'inputmode="tel" placeholder="Optional"' }));
    setTenantProfileHtml("tpDateBecame", tenantProfileLockedDate(tenant.dateBecame));
    setTenantProfileHtml("tpEstate", tenantProfileSelectMarkup("tpEstateInput", [], "", "Loading estates...", true));
    setTenantProfileHtml("tpHouse", tenantProfileSelectMarkup("tpHouseInput", [], "", "Choose an estate first", true));
    setTenantProfileHtml("tpMoveIn", tenantProfileLockedDate(tenant.moveInDate || tenant.dateBecame));
    const moveOutField = document.getElementById("tpMoveOutField");
    if (moveOutField) moveOutField.hidden = false;
    setTenantProfileHtml("tpMoveOut", tenantProfileDatePickerMarkup("tpMoveOutDate", tenant.moveOutDateIso || ""));
    setTenantProfileHtml("tpRent", tenantProfileAmountInput("tpMonthlyRentInput", tenant.monthlyRent));
    setTenantProfileHtml("tpDepositRequired", tenantProfileAmountInput("tpDepositRequiredInput", tenant.depositRequiredAmount || tenant.monthlyRent));
    setTenantProfileHtml("tpDepositPaid", tenantProfileAmountInput("tpDepositPaidInput", tenant.depositPaidAmount || 0, true));
    setTenantProfileHtml("tpDueDay", tenantProfileNumberInput("tpRentDueDayInput", tenant.rentDueDay || 1, 1, 31));
    setTenantProfileHtml("tpGrace", tenantProfileNumberInput("tpGracePeriodInput", tenant.gracePeriodDays || 5, 0, 31));
    setTenantProfileHtml("tpNotes", `<textarea class="tenant-profile__textarea" id="tpNotesInput">${escapeHtml(tenant.notes || "")}</textarea>`);

    initTenantProfileSelect("tpTenantTypeInput", syncTenantProfileTypeFields);
    initTenantProfileSelect("tpStatusInput", syncTenantProfileStatusFields);
    initTenantProfileDatePicker("tpMoveOutDate");
    syncTenantProfileTypeFields();
    syncTenantProfileStatusFields();
    loadTenantProfileEstates(tenant);
    document.getElementById("tpTenantTypeInputTrigger")?.focus();
  }

  function parseTenantProfileAmountInput(id, label, { allowZero = false, max = Number.MAX_SAFE_INTEGER } = {}) {
    const input = document.getElementById(id);
    const raw = String(input?.value || "").replace(/[^\d]/g, "");
    const amount = raw ? Number(raw) : 0;
    if (!Number.isSafeInteger(amount) || amount > max || (!allowZero && amount <= 0)) {
      input?.focus();
      throw new Error(`${label} must be a whole UGX amount.`);
    }
    return amount;
  }

  function parseTenantProfileIntegerInput(id, label, min, max) {
    const input = document.getElementById(id);
    const value = Number(input?.value);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      input?.focus();
      throw new Error(`${label} must be between ${min} and ${max}.`);
    }
    return value;
  }

  function getTenantProfileEditPayload() {
    const tenantType = document.getElementById("tpTenantTypeInput")?.value || "INDIVIDUAL";
    const status = document.getElementById("tpStatusInput")?.value || "Active";
    const moveOutDate = document.getElementById("tpMoveOutDateInput")?.value || "";
    const phoneNumber = window.PhoneNumbers.normalizeE164(document.getElementById("tpPhoneInput")?.value || "");
    const altPhoneRaw = document.getElementById("tpAltPhoneInput")?.value || "";
    const altPhoneNumber = altPhoneRaw.trim() ? window.PhoneNumbers.normalizeE164(altPhoneRaw) : "";
    const unitId = document.getElementById("tpHouseInput")?.value || "";
    const monthlyRent = parseTenantProfileAmountInput("tpMonthlyRentInput", "Monthly rent", { max: 15000000 });
    const securityDepositRequired = parseTenantProfileAmountInput("tpDepositRequiredInput", "Security deposit required");
    const securityDepositPaid = parseTenantProfileAmountInput("tpDepositPaidInput", "Security deposit paid", {
      allowZero: true,
      max: securityDepositRequired,
    });

    if (!/^\+2567\d{8}$/.test(phoneNumber)) throw new Error("Enter a valid primary phone number in +256 format.");
    if (altPhoneRaw.trim() && !/^\+2567\d{8}$/.test(altPhoneNumber)) throw new Error("Enter a valid alternative phone number in +256 format.");
    if (altPhoneNumber && altPhoneNumber === phoneNumber) throw new Error("Alternative phone must be different from the primary phone.");
    if (!unitId) throw new Error("Choose a house number for this tenant.");
    if (status === "Inactive" && !moveOutDate) throw new Error("Move-out date is required when setting a tenant to inactive.");

    const payload = {
      tenantType,
      status,
      moveOutDate,
      phoneNumber,
      altPhoneNumber,
      unitId,
      monthlyRent,
      securityDepositRequired,
      securityDepositPaid,
      rentDueDay: parseTenantProfileIntegerInput("tpRentDueDayInput", "Rent due day", 1, 31),
      gracePeriodDays: parseTenantProfileIntegerInput("tpGracePeriodInput", "Grace period (days)", 0, 31),
      notes: document.getElementById("tpNotesInput")?.value || "",
    };

    if (tenantType === "BUSINESS") {
      payload.businessName = document.getElementById("tpBusinessNameInput")?.value || "";
      if (!payload.businessName.trim()) throw new Error("Business name is required.");
    } else {
      payload.firstName = document.getElementById("tpFirstNameInput")?.value || "";
      payload.middleName = document.getElementById("tpMiddleNameInput")?.value || "";
      payload.lastName = document.getElementById("tpLastNameInput")?.value || "";
      if (!payload.firstName.trim() || !payload.lastName.trim()) {
        throw new Error("First name and last name are required.");
      }
      if (!activeTenantProfile?.nationalIdNumber) {
        const nationalIdNumber = normalizeNationalIdInput(document.getElementById("tpNationalIdInput")?.value || "");
        if (nationalIdNumber) {
          if (!isValidNationalIdNumber(nationalIdNumber)) {
            document.getElementById("tpNationalIdInput")?.focus();
            throw new Error("Enter a valid national ID number.");
          }
          payload.nationalIdNumber = nationalIdNumber;
        }
      }
    }

    return payload;
  }

  async function saveTenantProfileEdit() {
    if (!activeTenantProfile) return;
    const saveBtn = document.getElementById("tenantSaveBtn");
    const originalHtml = saveBtn?.innerHTML;
    let payload;
    try {
      payload = getTenantProfileEditPayload();
    } catch (err) {
      alert(err.message);
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="material-symbols-outlined icon icon--btn">progress_activity</span>Saving...';
    }

    try {
      const updated = await RentLedgerApi.put(`/api/tenants/${encodeURIComponent(activeTenantProfile.id)}`, payload);
      await refreshFromApi();
      const fresh = tenantsDirectory.find((tenant) => tenant.id === updated.id) || updated;
      renderTenantProfileView(fresh);
    } catch (err) {
      alert(formatAddTenantErrorMessage(err?.message, "Could not save tenant. Please try again."));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml || '<span class="material-symbols-outlined icon icon--btn">save</span>Save changes';
      }
    }
  }

  function openTenantProfile(tenant) {
    if (!tenant) return;
    initTenantModalOnce();
    const modal = document.getElementById("tenantModal");
    renderTenantProfileView(tenant);

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("tenantModalClose").focus();
  }

  let addTenantModalInitialized = false;
  let addTenantRequestSequence = 0;
  let addTenantUnits = [];
  let addTenantEstateControl = null;
  let addTenantRoomControl = null;
  let addTenantMoveInDateControl = null;
  let addTenantPhoneCountryControl = null;
  let lastAddTenantTrigger = null;

  function localTodayIso() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setAddTenantMessage(message = "") {
    const messageEl = document.getElementById("addTenantFormMessage");
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.hidden = !message;
  }

  function formatAddTenantErrorMessage(message, fallback) {
    let text = String(message || "").trim();
    text = text.replace(/\s*Request failed \(\d{3}\)\.?/gi, "").trim();
    text = text.replace(/:\s*$/, "").trim();
    return text || fallback;
  }

  function getAddTenantSaveErrorMessage(error) {
    return formatAddTenantErrorMessage(error?.message, "Could not add tenant. Please try again.");
  }

  function setAddTenantCustomSelectOptions(control, options, placeholder, disabled = false) {
    control?.setOptions(
      [{ value: "", label: placeholder }].concat(options),
      { value: "", disabled }
    );
  }

  function setAddTenantCustomSelectPlaceholder(control, text, disabled = true) {
    setAddTenantCustomSelectOptions(control, [], text, disabled);
  }

  function setAddTenantRoomHint(message) {
    const hint = document.getElementById("addTenantRoomHint");
    if (hint) hint.textContent = message;
  }

  function buildAddTenantPhoneCountryOptions() {
    const menu = document.getElementById("addTenantPhoneCountryMenu");
    const display = document.getElementById("addTenantPhoneCountryDisplay");
    const hidden = document.getElementById("addTenantPhoneCountry");
    const countries = window.PhoneNumbers?.COUNTRY_DIAL_CODES || [];
    if (!menu) return;

    menu.replaceChildren();
    countries.forEach((country, index) => {
      const label = window.PhoneNumbers.formatCountryOption(country);
      const triggerLabel = window.PhoneNumbers.formatCountryTrigger(country);
      const flag = window.PhoneNumbers.countryFlag(country.iso);
      const option = document.createElement("li");
      option.className = `custom-select__option${index === 0 ? " custom-select__option--selected" : ""}`;
      option.role = "option";
      option.dataset.value = country.code;
      option.dataset.label = label;
      option.dataset.triggerLabel = triggerLabel;
      option.setAttribute("aria-selected", index === 0 ? "true" : "false");
      option.innerHTML = `
        <span class="phone-field__country-main">
          <span class="phone-field__flag" aria-hidden="true">${flag}</span>
          <span class="phone-field__country-name">${country.name}</span>
        </span>
        <span class="phone-field__dial-code">${country.label}</span>`;
      menu.append(option);
    });

    if (countries[0]) {
      const defaultLabel = window.PhoneNumbers.formatCountryTrigger(countries[0]);
      if (display) display.textContent = defaultLabel;
      if (hidden) hidden.value = countries[0].code;
    }
  }

  function setAddTenantType(tenantType) {
    const type = tenantType === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL";
    const typeInput = document.getElementById("addTenantType");
    const individualBtn = document.getElementById("addTenantTypeIndividual");
    const businessBtn = document.getElementById("addTenantTypeBusiness");
    const individualFields = document.getElementById("addTenantIndividualFields");
    const businessFields = document.getElementById("addTenantBusinessFields");
    const firstName = document.getElementById("addTenantFirstName");
    const lastName = document.getElementById("addTenantLastName");
    const nationalId = document.getElementById("addTenantNationalId");
    const businessName = document.getElementById("addTenantBusinessName");
    const modalIcon = document.querySelector(".tenant-create-card__icon");
    const modalTitle = document.getElementById("addTenantModalTitle");

    if (typeInput) typeInput.value = type;

    individualBtn?.classList.toggle("tenant-type-toggle__btn--active", type === "INDIVIDUAL");
    businessBtn?.classList.toggle("tenant-type-toggle__btn--active", type === "BUSINESS");
    individualBtn?.setAttribute("aria-pressed", String(type === "INDIVIDUAL"));
    businessBtn?.setAttribute("aria-pressed", String(type === "BUSINESS"));

    if (individualFields) individualFields.hidden = type !== "INDIVIDUAL";
    if (businessFields) businessFields.hidden = type !== "BUSINESS";

    if (firstName) firstName.required = type === "INDIVIDUAL";
    if (lastName) lastName.required = type === "INDIVIDUAL";
    if (nationalId) nationalId.required = type === "INDIVIDUAL";
    if (businessName) businessName.required = type === "BUSINESS";

    if (modalIcon) {
      modalIcon.textContent = type === "BUSINESS" ? "storefront" : "person_add";
    }
    if (modalTitle) {
      modalTitle.textContent = type === "BUSINESS" ? "Add business tenant" : "Add tenant";
    }
  }

  function resetAddTenantForm() {
    const form = document.getElementById("addTenantForm");
    form?.reset();
    addTenantRequestSequence += 1;
    addTenantUnits = [];
    setAddTenantMessage("");
    setAddTenantType("INDIVIDUAL");

    addTenantMoveInDateControl?.setDate(localTodayIso());
    addTenantPhoneCountryControl?.setValue("256");
    setAddTenantCustomSelectPlaceholder(addTenantEstateControl, "Loading estates...");
    setAddTenantCustomSelectPlaceholder(addTenantRoomControl, "Choose an estate first");
    setAddTenantRoomHint("Rooms refresh whenever the estate changes.");
  }

  function getAddTenantPhoneNumber() {
    const countrySelect = document.getElementById("addTenantPhoneCountry");
    const phoneInput = document.getElementById("addTenantPhone");
    const dialCode = countrySelect?.value || "256";
    const localValue = phoneInput?.value || "";
    return window.PhoneNumbers.combineE164(dialCode, localValue)
      || window.PhoneNumbers.normalizeE164(localValue);
  }

  async function loadAddTenantEstates() {
    if (!addTenantEstateControl) return;

    try {
      const response = await RentLedgerApi.get("/api/tenants/available-units");
      const estates = Array.isArray(response?.estates) ? response.estates : [];

      const estateOptions = estates.map((estate) => {
        const availableRooms = Number(estate.availableRooms) || 0;
        return {
          value: String(estate.estateId),
          label: `${estateShortName(estate.estateName)} - ${availableRooms} room${availableRooms === 1 ? "" : "s"} available`,
        };
      });

      setAddTenantCustomSelectOptions(
        addTenantEstateControl,
        estateOptions,
        estates.length ? "Select an estate" : "No active estates available",
        estates.length === 0
      );

      if (!estates.length) {
        setAddTenantRoomHint("There are no active estates to choose from.");
      }
    } catch (err) {
      setAddTenantCustomSelectPlaceholder(addTenantEstateControl, "Could not load estates");
      setAddTenantRoomHint("Room availability could not be loaded.");
      setAddTenantMessage(formatAddTenantErrorMessage(
        `Could not load availability: ${err.message}`,
        "Could not load availability. Please try again."
      ));
    }
  }

  async function loadAddTenantRooms(estateId) {
    const rentInput = document.getElementById("addTenantMonthlyRent");
    const depositInput = document.getElementById("addTenantSecurityDeposit");
    const requestId = ++addTenantRequestSequence;

    addTenantUnits = [];
    if (rentInput) rentInput.value = "";
    if (depositInput) depositInput.value = "";

    if (!estateId) {
      setAddTenantCustomSelectPlaceholder(addTenantRoomControl, "Choose an estate first");
      setAddTenantRoomHint("Rooms refresh whenever the estate changes.");
      return;
    }

    setAddTenantCustomSelectPlaceholder(addTenantRoomControl, "Loading available rooms...");
    setAddTenantRoomHint("Checking the latest room availability…");

    try {
      const response = await RentLedgerApi.get(`/api/tenants/available-units?estateId=${encodeURIComponent(estateId)}`);
      if (requestId !== addTenantRequestSequence) return;

      addTenantUnits = Array.isArray(response?.units) ? response.units : [];
      const roomOptions = addTenantUnits.map((unit) => ({
        value: String(unit.unitId),
        label: `${unit.unitNumber} - UGX ${Number(unit.listedMonthlyRent).toLocaleString("en-UG")}`,
      }));

      setAddTenantCustomSelectOptions(
        addTenantRoomControl,
        roomOptions,
        addTenantUnits.length ? "Select an available room" : "No rooms currently available",
        addTenantUnits.length === 0
      );

      setAddTenantRoomHint(addTenantUnits.length
        ? `${addTenantUnits.length} available room${addTenantUnits.length === 1 ? "" : "s"}. The list is checked again when you save.`
        : "This estate has no rooms currently available.");
    } catch (err) {
      if (requestId !== addTenantRequestSequence) return;
      setAddTenantCustomSelectPlaceholder(addTenantRoomControl, "Could not load rooms");
      setAddTenantRoomHint("Room availability could not be loaded. Try selecting the estate again.");
      setAddTenantMessage(formatAddTenantErrorMessage(
        `Could not load rooms: ${err.message}`,
        "Could not load rooms. Please try again."
      ));
    }
  }

  function applySelectedRoomRent() {
    const roomSelect = document.getElementById("addTenantRoom");
    const rentInput = document.getElementById("addTenantMonthlyRent");
    const depositInput = document.getElementById("addTenantSecurityDeposit");
    const unit = addTenantUnits.find((item) => String(item.unitId) === roomSelect?.value);
    if (!unit) return;

    const amount = String(unit.listedMonthlyRent);
    if (rentInput) rentInput.value = amount;
    if (depositInput) depositInput.value = amount;
  }

  function parseAddTenantAmount(value) {
    const amount = Number(String(value || "").replace(/[\s,]/g, ""));
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  function closeAddTenantModal() {
    const modal = document.getElementById("addTenantModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lastAddTenantTrigger?.focus();
  }

  async function openAddTenantModal() {
    const modal = document.getElementById("addTenantModal");
    if (!modal) return;

    lastAddTenantTrigger = document.activeElement;
    resetAddTenantForm();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (document.getElementById("addTenantType")?.value === "BUSINESS") {
      document.getElementById("addTenantBusinessName")?.focus();
    } else {
      document.getElementById("addTenantFirstName")?.focus();
    }
    await loadAddTenantEstates();
  }

  function initAddTenantModalOnce() {
    const modal = document.getElementById("addTenantModal");
    const backdrop = document.getElementById("addTenantModalBackdrop");
    const closeBtn = document.getElementById("addTenantModalClose");
    const cancelBtn = document.getElementById("addTenantCancel");
    const addTenantButton = document.getElementById("addTenantBtn");
    const form = document.getElementById("addTenantForm");
    const estateSelect = document.getElementById("addTenantEstate");
    const roomSelect = document.getElementById("addTenantRoom");
    const saveBtn = document.getElementById("addTenantSave");

    if (!modal || addTenantModalInitialized) return;
    addTenantModalInitialized = true;

    buildAddTenantPhoneCountryOptions();
    addTenantPhoneCountryControl = initCustomSelect({
      container: document.getElementById("addTenantPhoneCountrySelect"),
      trigger: document.getElementById("addTenantPhoneCountryTrigger"),
      menu: document.getElementById("addTenantPhoneCountryMenu"),
      display: document.getElementById("addTenantPhoneCountryDisplay"),
      hidden: document.getElementById("addTenantPhoneCountry"),
    });
    addTenantEstateControl = initCustomSelect({
      container: document.getElementById("addTenantEstateSelect"),
      trigger: document.getElementById("addTenantEstateTrigger"),
      menu: document.getElementById("addTenantEstateMenu"),
      display: document.getElementById("addTenantEstateDisplay"),
      hidden: document.getElementById("addTenantEstate"),
    });
    addTenantRoomControl = initCustomSelect({
      container: document.getElementById("addTenantRoomSelect"),
      trigger: document.getElementById("addTenantRoomTrigger"),
      menu: document.getElementById("addTenantRoomMenu"),
      display: document.getElementById("addTenantRoomDisplay"),
      hidden: document.getElementById("addTenantRoom"),
    });
    addTenantMoveInDateControl = initDatePicker({
      picker: document.getElementById("addTenantMoveInDatePicker"),
      trigger: document.getElementById("addTenantMoveInDateTrigger"),
      popover: document.getElementById("addTenantMoveInDatePopover"),
      display: document.getElementById("addTenantMoveInDateDisplay"),
      hidden: document.getElementById("addTenantMoveInDate"),
      field: document.getElementById("addTenantMoveInDateField"),
      monthLabel: document.getElementById("addTenantMoveInDateMonthLabel"),
      grid: document.getElementById("addTenantMoveInDateGrid"),
      prevBtn: document.getElementById("addTenantMoveInDatePrev"),
      nextBtn: document.getElementById("addTenantMoveInDateNext"),
      todayBtn: document.getElementById("addTenantMoveInDateToday"),
      cancelBtn: document.getElementById("addTenantMoveInDateCancel"),
      applyBtn: document.getElementById("addTenantMoveInDateApply"),
      initialDate: new Date(),
    });

    addTenantButton?.addEventListener("click", openAddTenantModal);
    document.getElementById("addTenantTypeIndividual")?.addEventListener("click", () => {
      setAddTenantType("INDIVIDUAL");
      document.getElementById("addTenantFirstName")?.focus();
    });
    document.getElementById("addTenantTypeBusiness")?.addEventListener("click", () => {
      setAddTenantType("BUSINESS");
      document.getElementById("addTenantBusinessName")?.focus();
    });
    closeBtn?.addEventListener("click", closeAddTenantModal);
    cancelBtn?.addEventListener("click", closeAddTenantModal);
    backdrop?.addEventListener("click", closeAddTenantModal);
    estateSelect?.addEventListener("change", () => {
      setAddTenantMessage("");
      loadAddTenantRooms(estateSelect.value);
    });
    roomSelect?.addEventListener("change", applySelectedRoomRent);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeAddTenantModal();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setAddTenantMessage("");
      if (!form.reportValidity()) return;

      const phoneInput = document.getElementById("addTenantPhone");
      const phoneCountry = document.getElementById("addTenantPhoneCountry");
      const dialCode = phoneCountry?.value || "256";

      if (dialCode !== "256") {
        setAddTenantMessage("Only Ugandan (+256) phone numbers are supported.");
        phoneInput?.focus();
        return;
      }

      const normalizedPhone = getAddTenantPhoneNumber();
      if (!/^\+2567\d{8}$/.test(normalizedPhone)) {
        setAddTenantMessage("Enter a valid phone number in +256 format.");
        phoneInput?.focus();
        return;
      }

      if (!estateSelect?.value) {
        setAddTenantMessage("Choose an estate before adding the tenant.");
        document.getElementById("addTenantEstateTrigger")?.focus();
        return;
      }

      if (!roomSelect?.value) {
        setAddTenantMessage("Choose an available room before adding the tenant.");
        document.getElementById("addTenantRoomTrigger")?.focus();
        return;
      }

      const moveInDate = document.getElementById("addTenantMoveInDate")?.value || "";
      if (!moveInDate) {
        setAddTenantMessage("Choose a move-in date before adding the tenant.");
        document.getElementById("addTenantMoveInDateTrigger")?.focus();
        return;
      }

      const monthlyRent = parseAddTenantAmount(document.getElementById("addTenantMonthlyRent")?.value);
      const securityDeposit = parseAddTenantAmount(document.getElementById("addTenantSecurityDeposit")?.value);
      if (!monthlyRent || !securityDeposit) {
        setAddTenantMessage("Monthly rent and security deposit must be whole UGX amounts.");
        return;
      }

      const tenantType = document.getElementById("addTenantType")?.value || "INDIVIDUAL";
      const payload = {
        tenantType,
        phoneNumber: normalizedPhone,
        estateId: estateSelect?.value,
        unitId: roomSelect?.value,
        moveInDate,
        monthlyRent,
        securityDeposit,
      };

      if (tenantType === "BUSINESS") {
        payload.businessName = document.getElementById("addTenantBusinessName")?.value;
      } else {
        payload.firstName = document.getElementById("addTenantFirstName")?.value;
        payload.middleName = document.getElementById("addTenantMiddleName")?.value;
        payload.lastName = document.getElementById("addTenantLastName")?.value;
        const nationalIdNumber = normalizeNationalIdInput(document.getElementById("addTenantNationalId")?.value || "");
        if (!isValidNationalIdNumber(nationalIdNumber)) {
          setAddTenantMessage("Enter a valid national ID number.");
          document.getElementById("addTenantNationalId")?.focus();
          return;
        }
        payload.nationalIdNumber = nationalIdNumber;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="material-symbols-outlined icon icon--btn">progress_activity</span>Adding tenant…';
      try {
        await RentLedgerApi.post("/api/tenants", payload);
        await refreshFromApi();
        closeAddTenantModal();
      } catch (err) {
        setAddTenantMessage(getAddTenantSaveErrorMessage(err));
        if (/room|occupied|available|assigned/i.test(err.message || "")) {
          loadAddTenantRooms(estateSelect?.value);
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="material-symbols-outlined icon icon--btn">person_add</span>Add tenant';
      }
    });
  }

  let exportTenantsModalInitialized = false;
  let lastExportTenantsTrigger = null;

  function getTenantsExportData() {
    const rows = getFilteredTenants();
    const headers = [
      "Tenant ID",
      "Tenant Name",
      "National ID No.",
      "Phone Number",
      "Estate",
      "House Number",
      "Monthly Rent (UGX)",
      "Security Deposit",
      "Date Became Tenant",
      "Move-out Date",
      "Status",
    ];
    const values = rows.map((t) => [
      t.id,
      t.name,
      tenantNationalIdDisplay(t),
      formatPhone(t.phone),
      estateShortName(t.estate),
      t.house,
      t.monthlyRent,
      t.securityDeposit,
      t.dateBecame,
      (t.status === "Inactive" || t.status === "Notice") ? (t.moveOutDate || "—") : "—",
      t.status,
    ]);
    return { headers, values, count: rows.length };
  }

  function downloadExportBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = filename;
    document.body.appendChild(download);
    download.click();
    download.remove();
    URL.revokeObjectURL(url);
  }

  function exportTenantsDirectory(format) {
    const { headers, values } = getTenantsExportData();
    if (!values.length) return;

    if (format === "csv") {
      const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
      const csv = [headers, ...values]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\n");
      downloadExportBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "tenants.csv");
      return;
    }

    if (format === "excel") {
      const escapeHtml = (value) => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
      const headerCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
      const bodyRows = values
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
      downloadExportBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }), "tenants.xls");
      return;
    }

    if (format === "pdf") {
      const escapeHtml = (value) => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
      const dateLabel = new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const headerCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
      const bodyRows = values
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("");
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tenants Report</title>
  <style>
    body { font-family: "Plus Jakarta Sans", system-ui, sans-serif; color: #1b1b1c; margin: 32px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p { margin: 0 0 20px; color: #737785; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e2e1; padding: 8px 10px; text-align: left; }
    th { background: #f0faf4; color: #2d5a43; font-weight: 700; }
    tr:nth-child(even) td { background: #faf9f6; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>Tenants Report</h1>
  <p>${escapeHtml(dateLabel)} · ${values.length} tenant${values.length === 1 ? "" : "s"}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.onload = () => printWindow.print();
    }
  }

  function initExportTenantsModalOnce() {
    const modal = document.getElementById("exportTenantsModal");
    const backdrop = document.getElementById("exportTenantsModalBackdrop");
    const closeBtn = document.getElementById("exportTenantsModalClose");
    const cancelBtn = document.getElementById("exportTenantsCancel");
    const confirmBtn = document.getElementById("exportTenantsConfirm");
    if (!modal || exportTenantsModalInitialized) return;
    exportTenantsModalInitialized = true;

    function closeExportTenantsModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastExportTenantsTrigger) {
        lastExportTenantsTrigger.focus();
        lastExportTenantsTrigger = null;
      }
    }

    function confirmExportTenants() {
      const selected = modal.querySelector('input[name="tenantsExportFormat"]:checked');
      const format = selected?.value || "csv";
      exportTenantsDirectory(format);
      closeExportTenantsModal();
    }

    backdrop?.addEventListener("click", closeExportTenantsModal);
    closeBtn?.addEventListener("click", closeExportTenantsModal);
    cancelBtn?.addEventListener("click", closeExportTenantsModal);
    confirmBtn?.addEventListener("click", confirmExportTenants);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeExportTenantsModal();
    });
  }

  function openExportTenantsModal() {
    initExportTenantsModalOnce();

    const modal = document.getElementById("exportTenantsModal");
    const subtitle = document.getElementById("exportTenantsModalSubtitle");
    const confirmBtn = document.getElementById("exportTenantsConfirm");
    if (!modal) return;

    const { count } = getTenantsExportData();
    if (subtitle) {
      subtitle.textContent = count
        ? `${count} tenant${count === 1 ? "" : "s"}`
        : "No tenants to export.";
    }
    if (confirmBtn) confirmBtn.disabled = count === 0;

    const csvOption = modal.querySelector('input[name="tenantsExportFormat"][value="csv"]');
    if (csvOption) csvOption.checked = true;

    lastExportTenantsTrigger = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("exportTenantsModalClose")?.focus();
  }

  const statusLabels = {
    sent: "Sent",
    pending: "Pending",
    failed: "Failed",
  };

  /* ── Data from API ── */

  async function refreshFromApi() {
    tenantsLoadState = "loading";
    outstandingBalancesLoadState = "loading";
    if (document.getElementById("view-tenants")?.classList.contains("view--active")) {
      renderTenantsDirectory();
    }
    if (document.getElementById("view-estates")?.classList.contains("view--active")) {
      renderEstatesDirectory();
    }
    if (document.getElementById("view-estate-detail")?.classList.contains("view--active") && currentEstateDetailName) {
      renderEstateDetail(currentEstateDetailName);
    }
    if (document.getElementById("view-outstanding-balances")?.classList.contains("view--active")) {
      renderOutstandingReport();
    }
    if (document.getElementById("view-waive-balance")?.classList.contains("view--active")) {
      renderWaiveBalancesList();
    }
    if (document.getElementById("view-pending-deposits")?.classList.contains("view--active")) {
      renderPendingDepositsReport();
    }

    try {
      tenants = await RentLedgerApi.get("/api/tenants");
      tenantsDirectory = tenants;
      tenantsLoadState = "ready";
      apiLoaded = true;
    } catch {
      tenants = [];
      tenantsDirectory = [];
      tenantsLoadState = "error";
      apiLoaded = false;
    }

    try {
      outstandingBalances = await RentLedgerApi.get("/api/dashboard/outstanding-balances");
      outstandingBalancesLoadState = "ready";
    } catch {
      outstandingBalances = [];
      outstandingBalancesLoadState = "error";
    }

    try {
      payments = await RentLedgerApi.get("/api/payments");
    } catch {
      payments = [];
    }

    receiptsLoadState = "loading";
    try {
      receipts = await RentLedgerApi.get("/api/receipts");
      receiptsLoadState = "ready";
    } catch {
      receipts = [];
      receiptsLoadState = "error";
    }

    await fetchRawPayments();
    await fetchRawReceipts();
    refreshCustomReportData();

    try {
      const summary = await RentLedgerApi.get("/api/dashboard");
      renderDashboard(summary);
    } catch {
      renderAttentionList([]);
    }

    if (document.getElementById("view-tenants")?.classList.contains("view--active")) {
      renderTenantsDirectory();
    }
    if (document.getElementById("view-estates")?.classList.contains("view--active")) {
      renderEstatesDirectory();
    }
    if (document.getElementById("view-estate-detail")?.classList.contains("view--active") && currentEstateDetailName) {
      renderEstateDetail(currentEstateDetailName);
    }
    if (document.getElementById("view-outstanding-balances")?.classList.contains("view--active")) {
      renderOutstandingReport();
    }
    if (document.getElementById("view-waive-balance")?.classList.contains("view--active")) {
      renderWaiveBalancesList();
    }
    if (document.getElementById("view-pending-deposits")?.classList.contains("view--active")) {
      renderPendingDepositsReport();
    }
    renderReceiptsTable();
    refreshMonthlyCollection();
    if (document.getElementById("view-custom-reports")?.classList.contains("view--active")) {
      initCustomReportsOnce();
    }
    if (typeof syncRecordBtnState === "function") syncRecordBtnState();
  }

  function refreshMonthlyCollection() {
    renderDashYearCollected(getCollectionPayments());
    if (document.getElementById("view-monthly-collection")?.classList.contains("view--active")) {
      renderMonthlyCollection();
    }
  }

  async function initApi() {
    await refreshFromApi();
  }

  function clearTenantInfo() {
    selectedTenant = null;
    const search = document.getElementById("tenantSearch");
    const estateEl = document.getElementById("tenantEstate");
    const unitEl = document.getElementById("tenantUnit");
    const rentEl = document.getElementById("tenantRent");

    if (search) search.value = "";
    if (estateEl) estateEl.textContent = "-";
    if (unitEl) unitEl.textContent = "-";
    if (rentEl) rentEl.textContent = "-";
  }

  function findTenantBySearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return tenants.find(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tenantId.toLowerCase() === q ||
        t.unit.toLowerCase() === q
    );
  }

  async function fetchPaymentPreview(tenantId, amount) {
    const params = new URLSearchParams({
      tenantId,
      amount: String(amount),
    });
    return RentLedgerApi.get(`/api/payments/preview?${params.toString()}`);
  }

  /* ── Render attention list ── */

  const attentionList = document.getElementById("attentionList");

  function renderAttentionList(items) {
    if (!attentionList) return;

    if (!items || !items.length) {
      attentionList.innerHTML =
        '<li class="attention-item attention-item--empty">No tenants currently in arrears.</li>';
      return;
    }

    attentionList.innerHTML = items
      .map(
        (item) => `
        <li class="attention-item">
          <div class="attention-item__info">
            <p class="attention-item__name">${item.name}</p>
            <p class="attention-item__meta">
              ${item.unit}<span class="dot">·</span>${escapeHtml(estateShortName(item.estate))}
              <span class="dot">·</span>
              <span class="attention-item__pending">${item.months} Month${item.months > 1 ? "s" : ""} Pending</span>
            </p>
          </div>
          <span class="attention-item__amount">${item.amountDisplay || `UGX ${item.amount}`}</span>
        </li>`
      )
      .join("");
  }

  function setDashText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderDashboard(summary) {
    if (!summary) return;
    dashboardSummary = summary;

    setDashText("dashYearCollectedLabel", `Total Collected in ${summary.year}`);
    setDashText("dashYearCollected", summary.yearCollectedDisplay);
    setDashText(
      "dashYearCollectedSub",
      `${summary.yearCollectionRate ?? 0}% of ${summary.yearExpectedDisplay ?? "UGX 0"} expected total`
    );
    setDashText("dashTotalCollected", summary.totalCollectedDisplay);
    setDashText(
      "dashMonthCollectedSub",
      `${summary.collectionRate ?? 0}% of ${summary.totalExpectedDisplay ?? "UGX 0"} expected total`
    );
    setDashText("dashTotalOutstanding", summary.totalOutstandingDisplay);
    setDashText("dashActiveTenants", String(summary.activeTenants ?? 0));
    setDashText("dashPendingRentMonths", String(summary.pendingRentMonths ?? 0));
    setDashText("dashDepositsPending", String(summary.securityDepositsPending));

    const progress = document.getElementById("dashCollectionProgress");
    if (progress) {
      progress.style.width = `${Math.min(100, Math.max(0, summary.collectionRate))}%`;
    }

    const yearProgress = document.getElementById("dashYearCollectionProgress");
    if (yearProgress) {
      yearProgress.style.width = `${Math.min(100, Math.max(0, summary.yearCollectionRate ?? 0))}%`;
    }

    renderAttentionList(summary.attention);
    updateCollectionChart(summary.chart);
  }

  /* ── Render receipts table ── */

  const receiptsTable = document.getElementById("receiptsTable");

  function parseReceiptAmount(receipt) {
    return Number(String(receipt.amount).replace(/,/g, "")) || 0;
  }

  function parseReceiptDate(receipt) {
    return new Date(receipt.date);
  }

  function receiptInMonth(receipt, year, month) {
    const d = parseReceiptDate(receipt);
    return d.getFullYear() === year && d.getMonth() === month;
  }

  function toISODate(d) {
    if (!d || isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const receiptFilters = {
    search: "",
    dateFrom: "",
    dateTo: "",
    estates: [],
    methods: [],
    amountMin: "",
    amountMax: "",
  };

  let receiptsView = [];
  let receiptSortKey = "date";
  let receiptSortDirection = "desc";
  let receiptSortInitialized = false;

  const receiptSortLabels = {
    date: "date",
    tenant: "tenant name",
    unit: "unit",
    estate: "estate",
    amount: "amount",
    method: "method",
    receipt: "receipt number",
  };

  function receiptSortValue(receipt, key) {
    if (key === "date") return parseReceiptDate(receipt).getTime() || 0;
    if (key === "amount") return parseReceiptAmount(receipt);
    if (key === "receipt") return receipt.receipt || receipt.no || "";
    return receipt[key] ?? "";
  }

  function compareReceipts(a, b) {
    const aValue = receiptSortValue(a, receiptSortKey);
    const bValue = receiptSortValue(b, receiptSortKey);
    const comparison = typeof aValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), "en", { numeric: true });
    const directionalComparison = receiptSortDirection === "desc" ? -comparison : comparison;
    return directionalComparison || String(a.tenant).localeCompare(String(b.tenant), "en");
  }

  function updateReceiptSortUI() {
    document.querySelectorAll(".receipts-table .outstanding-column-sort").forEach((button) => {
      const isActive = button.dataset.sortKey === receiptSortKey;
      const direction = receiptSortDirection === "asc" ? "ascending" : "descending";
      const icon = button.querySelector(".material-symbols-outlined");
      const header = button.closest("th");
      if (icon) icon.textContent = isActive ? (receiptSortDirection === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";
      button.setAttribute("aria-label", `Sort by ${receiptSortLabels[button.dataset.sortKey] || button.dataset.sortKey} ${isActive ? direction : "ascending"}`);
      button.setAttribute("aria-pressed", String(isActive));
      header?.setAttribute("aria-sort", isActive ? direction : "none");
    });
  }

  function initReceiptSortOnce() {
    if (receiptSortInitialized) return;
    const buttons = document.querySelectorAll(".receipts-table .outstanding-column-sort");
    if (!buttons.length) return;
    receiptSortInitialized = true;
    buttons.forEach((button) => button.addEventListener("click", () => {
      const nextSortKey = button.dataset.sortKey;
      if (nextSortKey === receiptSortKey) {
        receiptSortDirection = receiptSortDirection === "asc" ? "desc" : "asc";
      } else {
        receiptSortKey = nextSortKey;
        receiptSortDirection = nextSortKey === "date" || nextSortKey === "amount" ? "desc" : "asc";
      }
      renderReceiptsTable();
    }));
  }

  function getFilteredReceipts() {
    return receipts.filter((r) => {
      if (receiptFilters.search) {
        const q = receiptFilters.search.toLowerCase();
        const haystack = `${r.tenant} ${r.receipt || r.no} ${r.unit}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (receiptFilters.dateFrom || receiptFilters.dateTo) {
        const iso = toISODate(parseReceiptDate(r));
        if (receiptFilters.dateFrom && iso < receiptFilters.dateFrom) return false;
        if (receiptFilters.dateTo && iso > receiptFilters.dateTo) return false;
      }
      if (receiptFilters.estate) {
        if (r.estate !== receiptFilters.estate) return false;
      }
      if (receiptFilters.method) {
        if (r.method !== receiptFilters.method) return false;
      }
      if (receiptFilters.amountMin) {
        if (parseReceiptAmount(r) < Number(receiptFilters.amountMin)) return false;
      }
      if (receiptFilters.amountMax) {
        if (parseReceiptAmount(r) > Number(receiptFilters.amountMax)) return false;
      }
      return true;
    }).sort(compareReceipts);
  }

  function hasActiveFilters() {
    return !!(
      receiptFilters.search ||
      receiptFilters.dateFrom ||
      receiptFilters.dateTo ||
      receiptFilters.estate ||
      receiptFilters.method ||
      receiptFilters.amountMin ||
      receiptFilters.amountMax
    );
  }

  function isReceiptDisplayable(receipt) {
    return Boolean(
      receipt &&
      String(receipt.amountWords || "").trim() &&
      String(receipt.receivedFrom || receipt.tenant || "").trim() &&
      String(receipt.amount || "").trim()
    );
  }

  function receiptDisplayValue(value) {
    return value && String(value).trim() ? String(value).trim() : "\u00a0";
  }

  function receiptPdfFilename(receipt) {
    const number = String(receipt.no || receipt.receipt || "receipt")
      .replace(/^#/, "")
      .replace(/\s+/g, "");
    return `receipt-${number}.pdf`;
  }

  function buildReceiptDocumentHtml(receipt) {
    const esc = (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

    const no = esc(receiptDisplayValue(receipt.no));
    const date = esc(receiptDisplayValue(receipt.receiptDate));
    const from = esc(receiptDisplayValue(receipt.receivedFrom || receipt.tenant));
    const words = esc(receiptDisplayValue(receipt.amountWords));
    const purpose = esc(receiptDisplayValue(receipt.purpose));
    const ref = esc(receiptDisplayValue(receipt.paymentRef));
    const amount = esc(receiptDisplayValue(receipt.amount));
    const balance = esc(receiptDisplayValue(receipt.balance || "NIL"));
    const baseHref = window.location?.origin && window.location.origin !== "null"
      ? `${window.location.origin}/`
      : "";
    const baseTag = baseHref ? `<base href="${esc(baseHref)}">` : "";
    const signatureSrc = esc(RECEIPT_SIGNATURE_SRC);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${baseTag}
  <title>Receipt ${no}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      font-family: "Plus Jakarta Sans", system-ui, sans-serif;
      color: #2a2a2a;
      background: #fff;
    }
    .receipt-paper {
      width: 100%;
      max-width: 560px;
      margin: 0 auto;
      background: #fdf0f4;
      border: 1px solid #e8c4d0;
      border-radius: 4px;
    }
    .receipt-paper__body {
      padding: 28px 32px 24px;
      font-size: 13px;
      line-height: 1.5;
    }
    .receipt-paper__top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .receipt-paper__company-name {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin: 0 0 4px;
    }
    .receipt-paper__company-address {
      font-size: 12px;
      color: #444;
      margin: 0;
    }
    .receipt-paper__meta { text-align: right; flex-shrink: 0; }
    .receipt-paper__stamp {
      display: inline-block;
      padding: 4px 14px;
      border: 2px solid #333;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }
    .receipt-paper__date-row { font-size: 13px; font-weight: 600; }
    .receipt-paper__date-label { margin-right: 6px; }
    .receipt-paper__number {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 4px;
    }
    .receipt-paper__number span { color: #c0392b; font-weight: 800; }
    .receipt-paper__field { margin-bottom: 14px; }
    .receipt-paper__label {
      display: block;
      font-size: 12px;
      color: #555;
      margin-bottom: 2px;
    }
    .receipt-paper__line {
      display: block;
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px dotted #888;
      padding-bottom: 2px;
      min-height: 20px;
    }
    .receipt-paper__amount-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin: 20px 0 24px;
    }
    .receipt-paper__amount-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .receipt-paper__thanks {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #555;
      line-height: 1.4;
      margin: 0;
      text-align: center;
    }
    .receipt-paper__amount-box {
      border: 2px solid #333;
      padding: 8px 14px;
      font-size: 14px;
      font-weight: 800;
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.35);
    }
    .receipt-paper__signed {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      font-size: 12px;
      flex: 1;
      min-width: 200px;
      max-width: 280px;
      padding-top: 2px;
    }
    .receipt-paper__signed-row {
      display: grid;
      grid-template-columns: 3.75rem 1fr;
      align-items: baseline;
      gap: 8px;
    }
    .receipt-paper__signed-label { text-align: left; }
    .receipt-paper__signed-for {
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.02em;
      text-align: right;
      margin-top: 2px;
    }
    .receipt-paper__line--signature {
      position: relative;
      min-height: 64px;
      overflow: visible;
    }
    .receipt-paper__signature {
      position: absolute;
      left: 8px;
      bottom: -8px;
      width: auto;
      height: 76px;
      max-width: 128px;
      object-fit: contain;
      object-position: left bottom;
      pointer-events: none;
      user-select: none;
    }
    @media print {
      body { padding: 16px; }
      .receipt-paper { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="receipt-paper">
    <div class="receipt-paper__body">
      <div class="receipt-paper__top">
        <div class="receipt-paper__company">
          <h2 class="receipt-paper__company-name">KIMUJO HOLDINGS LIMITED</h2>
          <p class="receipt-paper__company-address">P.O. Box 27917, Kampala (U)</p>
        </div>
        <div class="receipt-paper__meta">
          <div class="receipt-paper__stamp">RECEIPT</div>
          <div class="receipt-paper__date-row">
            <span class="receipt-paper__date-label">Date</span>
            <span>${date}</span>
          </div>
        </div>
      </div>

      <p class="receipt-paper__number">No. <span>${no}</span></p>

      <div class="receipt-paper__field">
        <span class="receipt-paper__label">Received with thanks from</span>
        <span class="receipt-paper__line">${from}</span>
      </div>

      <div class="receipt-paper__field">
        <span class="receipt-paper__label">The sum of shillings</span>
        <span class="receipt-paper__line">${words}</span>
      </div>

      <div class="receipt-paper__field">
        <span class="receipt-paper__label">Being payment for</span>
        <span class="receipt-paper__line">${purpose}</span>
      </div>

      <div class="receipt-paper__field">
        <span class="receipt-paper__label">Cash / Cheque No.</span>
        <span class="receipt-paper__line">${ref}</span>
      </div>

      <div class="receipt-paper__amount-row">
        <div class="receipt-paper__amount-col">
          <div class="receipt-paper__amount-box">Shs. = ${amount} /=</div>
          <p class="receipt-paper__thanks">WITH THANKS</p>
        </div>
        <div class="receipt-paper__signed">
          <div class="receipt-paper__signed-row">
            <span class="receipt-paper__signed-label">Balance</span>
            <span class="receipt-paper__line">${balance}</span>
          </div>
          <div class="receipt-paper__signed-row">
            <span class="receipt-paper__signed-label">Signed:</span>
            <span class="receipt-paper__line receipt-paper__line--signature">
              <img class="receipt-paper__signature" src="${signatureSrc}" alt="">
            </span>
          </div>
          <span class="receipt-paper__signed-for">For: KIMUJO HOLDINGS LIMITED</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  function printReceiptDocument(html) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => printWindow.print();
  }

  function waitForImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    return Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      })
    );
  }

  // Capture the receipt exactly as it appears on screen and save it as a PDF.
  async function downloadElementAsPdf(element, filename) {
    if (typeof html2pdf !== "function") {
      throw new Error("PDF download is unavailable in this browser.");
    }

    await waitForImages(element);

    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .save();
  }

  async function downloadReceiptPdf(receipt) {
    if (!isReceiptDisplayable(receipt)) return;

    const filename = receiptPdfFilename(receipt);

    if (window.electronAPI?.saveReceiptPdf) {
      await window.electronAPI.saveReceiptPdf(buildReceiptDocumentHtml(receipt), filename);
      return;
    }

    const element = document.querySelector("#receiptModal .receipt-paper");
    if (!element) {
      throw new Error("Open the receipt before downloading the PDF.");
    }

    await downloadElementAsPdf(element, filename);
  }

  function printReceipt(receipt) {
    if (!isReceiptDisplayable(receipt)) return;
    printReceiptDocument(buildReceiptDocumentHtml(receipt));
  }

  let receiptModalInitialized = false;
  let activeReceipt = null;

  function renderReceiptsTable() {
    if (!receiptsTable) return;
    initReceiptSortOnce();

    const countEl = document.getElementById("receiptsCount");

    if (receiptsLoadState === "loading") {
      receiptsTable.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="7">
            <span class="loading-spinner" role="status" aria-label="Loading">
              <img src="assets/spinner.svg" alt="">
              Loading...
            </span>
          </td>
        </tr>`;
      if (countEl) countEl.textContent = "Loading receipts…";
      initReceiptModalOnce();
      initReceiptFiltersOnce();
      syncReceiptClearButton();
      return;
    }

    if (receiptsLoadState === "error") {
      receiptsTable.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="7"><span class="material-symbols-outlined">error</span>${RECEIPT_UNAVAILABLE_MESSAGE}</td>
        </tr>`;
      if (countEl) countEl.textContent = RECEIPT_UNAVAILABLE_MESSAGE;
      initReceiptModalOnce();
      initReceiptFiltersOnce();
      syncReceiptClearButton();
      return;
    }

    receiptsView = getFilteredReceipts();
    updateReceiptSortUI();
    if (!receiptsView.length) {
      const emptyMessage = hasActiveFilters()
        ? "No receipts match your filters."
        : "No receipts recorded yet.";
      receiptsTable.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="7"><span class="material-symbols-outlined">receipt_long</span>${emptyMessage}</td>
        </tr>`;
      if (countEl) {
        countEl.textContent = hasActiveFilters()
          ? `0 of ${receipts.length} receipts`
          : "0 receipts";
      }
      initReceiptModalOnce();
      initReceiptFiltersOnce();
      syncReceiptClearButton();
      return;
    }

    receiptsTable.innerHTML = receiptsView
      .map(
        (r, i) => `
        <tr class="receipts-table__row" data-receipt-index="${i}" tabindex="0" role="button" aria-label="View receipt ${r.receipt || r.no} for ${r.tenant}">
          <td>${r.date}</td>
          <td>${r.tenant}</td>
          <td>${r.unit}</td>
          <td>${escapeHtml(estateShortName(r.estate))}</td>
          <td class="text-right amount">${r.amount}</td>
          <td>
            <span class="method-cell">
              ${methodIcons[r.method] || ""}
              ${r.method}
            </span>
          </td>
          <td><span class="receipt-no">${r.receipt || r.no}</span></td>
        </tr>`
      )
      .join("");

    if (countEl) {
      const filtered = hasActiveFilters();
      countEl.textContent = filtered
        ? `${receiptsView.length} of ${receipts.length} receipts`
        : `${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`;
    }

    initReceiptModalOnce();
    initReceiptFiltersOnce();
    syncReceiptClearButton();
  }

  function initReceiptModalOnce() {
    const modal = document.getElementById("receiptModal");
    const backdrop = document.getElementById("receiptModalBackdrop");
    const closeBtn = document.getElementById("receiptModalClose");
    const downloadBtn = document.getElementById("receiptDownloadPdfBtn");
    const printBtn = document.getElementById("receiptPrintBtn");
    const fields = {
      date: document.getElementById("receiptModalDate"),
      no: document.getElementById("receiptModalNo"),
      from: document.getElementById("receiptModalFrom"),
      words: document.getElementById("receiptModalWords"),
      purpose: document.getElementById("receiptModalPurpose"),
      ref: document.getElementById("receiptModalRef"),
      amount: document.getElementById("receiptModalAmount"),
      balance: document.getElementById("receiptModalBalance"),
    };

    if (!modal || receiptModalInitialized) return;
    receiptModalInitialized = true;

    function setLine(el, value) {
      if (!el) return;
      el.textContent = value && value.trim() ? value : "\u00a0";
    }

    function syncReceiptActionButtons(receipt) {
      const enabled = isReceiptDisplayable(receipt);
      if (downloadBtn) downloadBtn.disabled = !enabled;
      if (printBtn) printBtn.disabled = !enabled;
    }

    function showReceiptUnavailable() {
      activeReceipt = null;
      fields.date.textContent = "—";
      fields.no.textContent = "—";
      fields.from.textContent = "—";
      fields.words.textContent = RECEIPT_UNAVAILABLE_MESSAGE;
      fields.purpose.textContent = "—";
      setLine(fields.ref, "");
      fields.amount.textContent = "—";
      fields.balance.textContent = "—";
      syncReceiptActionButtons(null);

      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }

    function openReceipt(receipt) {
      if (!isReceiptDisplayable(receipt)) {
        showReceiptUnavailable();
        return;
      }
      activeReceipt = receipt;
      fields.date.textContent = receipt.receiptDate;
      fields.no.textContent = receipt.no;
      fields.from.textContent = receipt.receivedFrom;
      fields.words.textContent = receipt.amountWords;
      fields.purpose.textContent = receipt.purpose;
      setLine(fields.ref, receipt.paymentRef);
      fields.amount.textContent = receipt.amount;
      fields.balance.textContent = receipt.balance || "NIL";
      syncReceiptActionButtons(receipt);

      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }

    function closeReceipt() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      activeReceipt = null;
    }

    receiptsTable?.addEventListener("click", (e) => {
      const row = e.target.closest(".receipts-table__row");
      if (!row) return;
      const index = parseInt(row.dataset.receiptIndex, 10);
      openReceipt(receiptsView[index]);
    });

    receiptsTable?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest(".receipts-table__row");
      if (!row) return;
      e.preventDefault();
      const index = parseInt(row.dataset.receiptIndex, 10);
      openReceipt(receiptsView[index]);
    });

    downloadBtn?.addEventListener("click", async () => {
      if (!activeReceipt || downloadBtn.disabled) return;
      downloadBtn.disabled = true;
      try {
        await downloadReceiptPdf(activeReceipt);
      } catch (error) {
        window.alert(error?.message || "Could not download receipt PDF.");
      } finally {
        syncReceiptActionButtons(activeReceipt);
      }
    });

    printBtn?.addEventListener("click", () => {
      if (activeReceipt) printReceipt(activeReceipt);
    });

    closeBtn.addEventListener("click", closeReceipt);
    backdrop.addEventListener("click", closeReceipt);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeReceipt();
    });
  }

  /* ── Receipt filter toolbar ── */

  let receiptFiltersInitialized = false;
  let receiptEstateFilterControl = null;
  let receiptMethodFilterControl = null;
  let receiptDateFromPicker = null;
  let receiptDateToPicker = null;

  function syncReceiptFilterState() {
    receiptFilters.estate = document.getElementById("receiptEstateFilter")?.value || "";
    receiptFilters.method = document.getElementById("receiptMethodFilter")?.value || "";
    receiptFilters.dateFrom = document.getElementById("receiptDateFrom")?.value || "";
    receiptFilters.dateTo = document.getElementById("receiptDateTo")?.value || "";
  }

  function syncReceiptClearButton() {
    const clearBtn = document.getElementById("receiptClearFilters");
    if (clearBtn) clearBtn.disabled = !hasActiveFilters();
  }

  function initReceiptFiltersOnce() {
    if (receiptFiltersInitialized || receiptsLoadState !== "ready") return;

    const searchEl = document.getElementById("receiptSearch");
    const clearBtn = document.getElementById("receiptClearFilters");
    const estateSelect = document.getElementById("receiptEstateFilter");
    const methodSelect = document.getElementById("receiptMethodFilter");
    const estateMenu = document.getElementById("receiptEstateMenu");
    const methodMenu = document.getElementById("receiptMethodMenu");
    const amountMinEl = document.getElementById("receiptAmountMin");
    const amountMaxEl = document.getElementById("receiptAmountMax");

    if (!searchEl || !estateSelect || !methodSelect || !estateMenu || !methodMenu) return;

    function applyAndRender() {
      syncReceiptFilterState();
      renderReceiptsTable();
    }

    [...new Set(receipts.map((receipt) => receipt.estate).filter(Boolean))]
      .sort()
      .forEach((estate) => addOutstandingFilterOption(estateMenu, estate, estateShortName(estate)));

    [...new Set(receipts.map((receipt) => receipt.method).filter(Boolean))]
      .sort()
      .forEach((method) => addOutstandingFilterOption(methodMenu, method, method));

    receiptEstateFilterControl = initCustomSelect({
      container: document.getElementById("receiptEstateSelect"),
      trigger: document.getElementById("receiptEstateTrigger"),
      menu: estateMenu,
      display: document.getElementById("receiptEstateDisplay"),
      hidden: estateSelect,
    });

    receiptMethodFilterControl = initCustomSelect({
      container: document.getElementById("receiptMethodSelect"),
      trigger: document.getElementById("receiptMethodTrigger"),
      menu: methodMenu,
      display: document.getElementById("receiptMethodDisplay"),
      hidden: methodSelect,
    });

    receiptDateFromPicker = initDatePicker({
      picker: document.getElementById("receiptDateFromPicker"),
      trigger: document.getElementById("receiptDateFromTrigger"),
      popover: document.getElementById("receiptDateFromPopover"),
      display: document.getElementById("receiptDateFromDisplay"),
      hidden: document.getElementById("receiptDateFrom"),
      field: document.getElementById("receiptDateFromField"),
      monthLabel: document.getElementById("receiptDateFromMonthLabel"),
      grid: document.getElementById("receiptDateFromGrid"),
      prevBtn: document.getElementById("receiptDateFromPrev"),
      nextBtn: document.getElementById("receiptDateFromNext"),
      todayBtn: document.getElementById("receiptDateFromToday"),
      cancelBtn: document.getElementById("receiptDateFromCancel"),
      applyBtn: document.getElementById("receiptDateFromApply"),
      emptyLabel: "Select date",
      onChange: applyAndRender,
    });

    receiptDateToPicker = initDatePicker({
      picker: document.getElementById("receiptDateToPicker"),
      trigger: document.getElementById("receiptDateToTrigger"),
      popover: document.getElementById("receiptDateToPopover"),
      display: document.getElementById("receiptDateToDisplay"),
      hidden: document.getElementById("receiptDateTo"),
      field: document.getElementById("receiptDateToField"),
      monthLabel: document.getElementById("receiptDateToMonthLabel"),
      grid: document.getElementById("receiptDateToGrid"),
      prevBtn: document.getElementById("receiptDateToPrev"),
      nextBtn: document.getElementById("receiptDateToNext"),
      todayBtn: document.getElementById("receiptDateToToday"),
      cancelBtn: document.getElementById("receiptDateToCancel"),
      applyBtn: document.getElementById("receiptDateToApply"),
      emptyLabel: "Select date",
      onChange: applyAndRender,
    });

    searchEl.addEventListener("input", () => {
      receiptFilters.search = searchEl.value.trim();
      applyAndRender();
    });

    [estateSelect, methodSelect].forEach((element) => {
      element?.addEventListener("change", applyAndRender);
    });

    function syncAmountFilters() {
      receiptFilters.amountMin = amountMinEl?.value.replace(/[^\d]/g, "") || "";
      receiptFilters.amountMax = amountMaxEl?.value.replace(/[^\d]/g, "") || "";
      applyAndRender();
    }

    let amountDebounce;
    [amountMinEl, amountMaxEl].forEach((element) => {
      element?.addEventListener("input", () => {
        clearTimeout(amountDebounce);
        amountDebounce = setTimeout(syncAmountFilters, 200);
      });
    });

    clearBtn?.addEventListener("click", () => {
      receiptFilters.search = "";
      receiptFilters.dateFrom = "";
      receiptFilters.dateTo = "";
      receiptFilters.estate = "";
      receiptFilters.method = "";
      receiptFilters.amountMin = "";
      receiptFilters.amountMax = "";
      searchEl.value = "";
      amountMinEl.value = "";
      amountMaxEl.value = "";
      receiptEstateFilterControl?.setValue("");
      receiptMethodFilterControl?.setValue("");
      receiptDateFromPicker?.setDate("");
      receiptDateToPicker?.setDate("");
      applyAndRender();
    });

    receiptFiltersInitialized = true;
  }

  /* ── Collection overview chart ── */

  function initChart() {
    const chartCanvas = document.getElementById("collectionChart");
    if (!chartCanvas || typeof Chart === "undefined" || chartInitialized) return;

    chartInitialized = true;
    const ctx = chartCanvas.getContext("2d");

    const initial = dashboardSummary?.chart || { labels: [], expected: [], collected: [] };

    collectionChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: initial.labels,
        datasets: [
          {
            label: "Expected",
            data: (initial.expected || []).slice(),
            backgroundColor: "#c8d4e8",
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.6,
          },
          {
            label: "Collected",
            data: (initial.collected || []).slice(),
            backgroundColor: "#2d5a43",
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 0,
        animation: { duration: 400 },
        animations: { resize: { duration: 0 } },
        layout: {
          padding: { left: 4, right: 8, top: 4, bottom: 4 },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1b1b1c",
            titleFont: { family: "Plus Jakarta Sans", size: 13 },
            bodyFont: { family: "Plus Jakarta Sans", size: 12 },
            padding: 12,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.raw) || 0;
                return ` ${ctx.dataset.label}: ${formatUgx(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            title: {
              display: true,
              text: "Month",
              font: { family: "Plus Jakarta Sans", size: 12, weight: 600 },
              color: "#737785",
              padding: { top: 10 },
            },
            ticks: {
              font: { family: "Plus Jakarta Sans", size: 12 },
              color: "#737785",
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#f0eded", drawBorder: false },
            border: { display: false, dash: [4, 4] },
            title: {
              display: true,
              text: "Amount (UGX)",
              font: { family: "Plus Jakarta Sans", size: 12, weight: 600 },
              color: "#737785",
              padding: { bottom: 8 },
            },
            ticks: {
              font: { family: "Plus Jakarta Sans", size: 11 },
              color: "#737785",
              callback: (v) => Number(v).toLocaleString("en-UG"),
            },
          },
        },
      },
    });
  }

  function updateCollectionChart(chartData) {
    if (!chartData) return;
    if (!chartInitialized) {
      initChart();
      if (!collectionChart) return;
    }
    collectionChart.data.labels = chartData.labels || [];
    collectionChart.data.datasets[0].data = (chartData.expected || []).slice();
    collectionChart.data.datasets[1].data = (chartData.collected || []).slice();
    collectionChart.update();
  }

  initChart();

  /* ── Animate progress bar on load ── */

  const progressFill = document.querySelector(".metric-card__progress-fill");
  if (progressFill) {
    const target = progressFill.style.width;
    progressFill.style.width = "0%";
    requestAnimationFrame(() => {
      setTimeout(() => {
        progressFill.style.width = target;
      }, 200);
    });
  }

  /* ── Record a Payment ── */

  const amountInput = document.getElementById("amountPaid");
  const amountHint = document.getElementById("amountPaidHint");
  const bankRefInput = document.getElementById("bankRef");
  const bankRefHint = document.getElementById("bankRefHint");
  const previewBtn = document.getElementById("previewBtn");
  const recordBtn = document.getElementById("recordBtn");
  const totalEl = document.getElementById("totalToDistribute");
  const previewBody = document.getElementById("previewTableBody");
  const paymentForm = document.getElementById("paymentForm");

  const MAX_PAYMENT_AMOUNT = 999_999_999_999n;
  const AMOUNT_VALIDATION_MESSAGE = "Whole shillings only. Maximum UGX 999,999,999,999 per payment.";
  let lastValidAmountDisplay = amountInput?.value || "0";

  function formatDigitsWithCommas(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatUgxAmount(amount) {
    const digits = typeof amount === "bigint" ? amount.toString() : String(amount);
    return "UGX " + formatDigitsWithCommas(digits);
  }

  function formatNumber(n) {
    return n.toLocaleString("en-UG");
  }

  function getAmountValidation(rawValue) {
    const raw = String(rawValue).trim();

    if (!raw) return { amount: 0n, invalid: false, exceedsMaximum: false };

    // Keep decimals and other non-whole-number input visible so the user can correct it.
    if (!/^\d[\d,]*$/.test(raw)) {
      return { amount: 0n, invalid: true, exceedsMaximum: false };
    }

    const digits = raw.replace(/,/g, "").replace(/^0+/, "") || "0";
    const amount = BigInt(digits);
    return { amount, invalid: false, exceedsMaximum: amount > MAX_PAYMENT_AMOUNT };
  }

  function setAmountValidationState(invalid) {
    amountInput?.classList.toggle("form-input--invalid", invalid);
    amountInput?.setAttribute("aria-invalid", String(invalid));
    totalEl?.classList.toggle("preview-total__value--invalid", invalid);

    if (!amountHint) return;
    amountHint.hidden = !invalid;
    amountHint.textContent = invalid ? AMOUNT_VALIDATION_MESSAGE : "";
  }

  function syncAmountInput(rawValue) {
    const validation = getAmountValidation(rawValue);
    const invalid = validation.invalid || validation.exceedsMaximum;

    if (amountInput && !invalid) {
      const digits = validation.amount.toString();
      amountInput.value = digits === "0" ? "0" : formatDigitsWithCommas(digits);
    }

    setAmountValidationState(invalid);

    if (totalEl) {
      totalEl.textContent = invalid ? "UGX —" : formatUgxAmount(validation.amount);
    }

    return { ...validation, invalid };
  }

  function getPaymentEntryTenant() {
    return selectedTenant || findTenantBySearch(tenantSearchInput?.value || "");
  }

  function canRecordPayment() {
    if (!apiLoaded) return false;
    if (!getPaymentEntryTenant()) return false;

    const { amount, invalid } = getAmountValidation(amountInput?.value ?? "0");
    if (invalid || amount <= 0n) return false;
    if (!getBankRefValue()) return false;
    if (!document.getElementById("paymentDate")?.value) return false;

    return true;
  }

  function syncRecordBtnState() {
    if (recordBtn) recordBtn.disabled = !canRecordPayment();
  }

  async function renderPreview() {
    const { amount, invalid } = syncAmountInput(amountInput?.value ?? "0");

    if (amount <= 0n || invalid) {
      previewBody.innerHTML = `
        <tr class="preview-empty">
          <td colspan="4">
            <span class="material-symbols-outlined icon icon--empty">touch_app</span>
            Enter amount and click "Preview" to see allocation
          </td>
        </tr>`;
      return;
    }

    const tenant = getPaymentEntryTenant();
    if (apiLoaded && !tenant) {
      previewBody.innerHTML = `
        <tr class="preview-empty">
          <td colspan="4">
            <span class="material-symbols-outlined icon icon--empty">person_search</span>
            Select a tenant to preview how this payment will be allocated
          </td>
        </tr>`;
      return;
    }

    if (!apiLoaded) {
      previewBody.innerHTML = `
        <tr class="preview-empty">
          <td colspan="4">
            <span class="material-symbols-outlined icon icon--empty">cloud_off</span>
            Connect to the database to preview payment allocation
          </td>
        </tr>`;
      return;
    }

    previewBtn.disabled = true;
    previewBody.innerHTML = `
      <tr class="preview-empty">
        <td colspan="4">
          <span class="material-symbols-outlined icon icon--empty">hourglass_top</span>
          Calculating allocation…
        </td>
      </tr>`;

    try {
      const preview = await fetchPaymentPreview(tenant.tenantId, Number(amount));
      const rows = preview.rows || [];

      if (!rows.length) {
        previewBody.innerHTML = `
          <tr class="preview-empty">
            <td colspan="4">
              <span class="material-symbols-outlined icon icon--empty">info</span>
              No rent months to allocate for this tenant
            </td>
          </tr>`;
        return;
      }

      previewBody.innerHTML = rows
        .map(
          (row) => `
        <tr${row.isAdvance ? ' class="preview-row--advance"' : ""}>
          <td>${row.month}${row.isAdvance ? ' <span class="preview-advance-tag">Advance</span>' : ""}</td>
          <td class="text-right">${formatNumber(row.opening)}</td>
          <td class="text-right applied">${formatNumber(row.applied)}</td>
          <td class="text-right remaining ${row.balanceRemaining === 0 ? "remaining--zero" : ""}">${formatNumber(row.balanceRemaining)}</td>
        </tr>`
        )
        .join("");
    } catch (err) {
      previewBody.innerHTML = `
        <tr class="preview-empty">
          <td colspan="4">
            <span class="material-symbols-outlined icon icon--empty">error</span>
            ${escapeHtml(err.message || "Could not load preview")}
          </td>
        </tr>`;
    } finally {
      previewBtn.disabled = false;
    }
  }

  function setBankRefValidationState(invalid) {
    bankRefInput?.classList.toggle("form-input--invalid", invalid);
    bankRefInput?.setAttribute("aria-invalid", String(invalid));
    if (bankRefHint) bankRefHint.hidden = !invalid;
  }

  function getBankRefValue() {
    return String(bankRefInput?.value || "").trim();
  }

  function validateBankRef() {
    const invalid = !getBankRefValue();
    setBankRefValidationState(invalid);
    return !invalid;
  }

  bankRefInput?.addEventListener("input", () => {
    if (getBankRefValue()) setBankRefValidationState(false);
    syncRecordBtnState();
  });

  let paymentSuccessModalInitialized = false;
  let paymentDatePickerControl = null;
  let lastPaymentSuccessTrigger = null;

  function initPaymentSuccessModalOnce() {
    const modal = document.getElementById("paymentSuccessModal");
    const backdrop = document.getElementById("paymentSuccessBackdrop");
    const closeBtn = document.getElementById("paymentSuccessClose");
    const doneBtn = document.getElementById("paymentSuccessDone");
    if (!modal || paymentSuccessModalInitialized) return;

    function closePaymentSuccessModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastPaymentSuccessTrigger) {
        lastPaymentSuccessTrigger.focus();
        lastPaymentSuccessTrigger = null;
      }
    }

    backdrop?.addEventListener("click", closePaymentSuccessModal);
    closeBtn?.addEventListener("click", closePaymentSuccessModal);
    doneBtn?.addEventListener("click", closePaymentSuccessModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closePaymentSuccessModal();
    });

    paymentSuccessModalInitialized = true;
  }

  function showPaymentSuccessModal(result, tenant) {
    initPaymentSuccessModalOnce();

    const modal = document.getElementById("paymentSuccessModal");
    const receiptEl = document.getElementById("paymentSuccessReceiptNo");
    const tenantEl = document.getElementById("paymentSuccessTenant");
    const amountEl = document.getElementById("paymentSuccessAmount");
    const bankRefEl = document.getElementById("paymentSuccessBankRef");
    const monthsEl = document.getElementById("paymentSuccessMonths");
    if (!modal) return;

    const receiptNo = result.payment?.receiptNo || result.receipt?.receiptNo;
    const hasReceipt = Boolean(receiptNo && isReceiptDisplayable(result.receipt));
    const displayReceipt = hasReceipt ? formatReceiptNumber(receiptNo) : RECEIPT_UNAVAILABLE_MESSAGE;

    if (receiptEl) receiptEl.textContent = displayReceipt;
    if (tenantEl) tenantEl.textContent = tenant?.name || result.payment?.tenantName || "—";
    if (amountEl) {
      amountEl.textContent = formatUgxAmount(result.payment?.amount || result.receipt?.amount || 0);
    }
    if (bankRefEl) bankRefEl.textContent = result.payment?.bankRef || getBankRefValue() || "—";
    if (monthsEl) {
      monthsEl.textContent = result.receipt?.monthsCovered || result.allocation?.monthsCovered || "—";
    }

    lastPaymentSuccessTrigger = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("paymentSuccessDone")?.focus();
  }

  previewBtn?.addEventListener("click", renderPreview);

  function resetPaymentDateToToday() {
    if (!paymentDatePickerControl?.setDate) return;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    paymentDatePickerControl.setDate(iso);
  }

  function handleAmountInput() {
    const validation = getAmountValidation(amountInput?.value ?? "0");

    if (validation.exceedsMaximum && amountInput) {
      amountInput.value = lastValidAmountDisplay;
      syncAmountInput(lastValidAmountDisplay);
      syncRecordBtnState();
      return;
    }

    const result = syncAmountInput(amountInput?.value ?? "0");
    if (!result.invalid && amountInput) {
      lastValidAmountDisplay = amountInput.value;
    }
    syncRecordBtnState();
  }

  amountInput?.addEventListener("input", handleAmountInput);

  amountInput?.addEventListener("blur", () => {
    handleAmountInput();
  });

  /* ── Tenant search autocomplete (live, DB-backed) ── */

  const tenantSearchInput = document.getElementById("tenantSearch");
  const tenantSearchResults = document.getElementById("tenantSearchResults");
  const MAX_TENANT_SUGGESTIONS = 8;
  let tenantSuggestions = [];
  let tenantActiveIndex = -1;

  function fillTenantInfo(tenant) {
    const estateEl = document.getElementById("tenantEstate");
    const unitEl = document.getElementById("tenantUnit");
    const rentEl = document.getElementById("tenantRent");
    if (estateEl) estateEl.textContent = estateShortName(tenant.estate) || "—";
    if (unitEl) unitEl.textContent = tenant.unit || tenant.house || "—";
    if (rentEl) {
      rentEl.textContent = tenant.monthlyRent
        ? `UGX ${formatNumber(Number(tenant.monthlyRent))}`
        : "—";
    }
  }

  function highlightMatch(text, query) {
    const safe = escapeHtml(text || "");
    const q = query.trim();
    if (!q) return safe;
    const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(`(${pattern})`, "ig"), "<mark>$1</mark>");
  }

  function getTenantMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const t of tenants) {
      const name = (t.name || "").toLowerCase();
      const id = (t.tenantId || "").toLowerCase();
      const unit = (t.unit || "").toLowerCase();
      if (name.startsWith(q) || id.startsWith(q) || unit.startsWith(q)) {
        starts.push(t);
      } else if (name.includes(q) || id.includes(q) || unit.includes(q)) {
        contains.push(t);
      }
    }
    return [...starts, ...contains].slice(0, MAX_TENANT_SUGGESTIONS);
  }

  function openTenantSuggestions() {
    if (!tenantSearchResults) return;
    tenantSearchResults.hidden = false;
    tenantSearchInput?.setAttribute("aria-expanded", "true");
  }

  function closeTenantSuggestions() {
    if (!tenantSearchResults) return;
    tenantSearchResults.hidden = true;
    tenantSearchResults.innerHTML = "";
    tenantSuggestions = [];
    tenantActiveIndex = -1;
    tenantSearchInput?.setAttribute("aria-expanded", "false");
    tenantSearchInput?.removeAttribute("aria-activedescendant");
  }

  function renderTenantSuggestions(query) {
    if (!tenantSearchResults) return;
    tenantActiveIndex = -1;

    if (!query.trim()) {
      closeTenantSuggestions();
      return;
    }

    tenantSuggestions = getTenantMatches(query);

    if (!tenantSuggestions.length) {
      tenantSearchResults.innerHTML = `<li class="tenant-suggest__empty">No tenants match "${escapeHtml(query.trim())}"</li>`;
      openTenantSuggestions();
      return;
    }

    tenantSearchResults.innerHTML = tenantSuggestions
      .map((t, i) => {
        const meta = [t.unit, estateShortName(t.estate)]
          .filter((v) => v && v !== "—")
          .join(" · ");
        return `
        <li class="tenant-suggest__option" role="option" id="tenant-suggest-${i}" data-index="${i}" aria-selected="false">
          <span class="tenant-suggest__main">
            <span class="tenant-suggest__name">${highlightMatch(t.name, query)}</span>
            ${meta ? `<span class="tenant-suggest__meta">${escapeHtml(meta)}</span>` : ""}
          </span>
          <span class="tenant-suggest__id">${escapeHtml(t.tenantId || "")}</span>
        </li>`;
      })
      .join("");
    openTenantSuggestions();
  }

  function setActiveSuggestion(index) {
    const options = tenantSearchResults?.querySelectorAll(".tenant-suggest__option") || [];
    if (!options.length) return;
    tenantActiveIndex = (index + options.length) % options.length;
    options.forEach((el, i) => {
      const active = i === tenantActiveIndex;
      el.classList.toggle("tenant-suggest__option--active", active);
      el.setAttribute("aria-selected", String(active));
      if (active) {
        el.scrollIntoView({ block: "nearest" });
        tenantSearchInput?.setAttribute("aria-activedescendant", el.id);
      }
    });
  }

  function chooseTenant(tenant) {
    if (!tenant) return;
    selectedTenant = tenant;
    if (tenantSearchInput) tenantSearchInput.value = tenant.name;
    fillTenantInfo(tenant);
    closeTenantSuggestions();
    syncRecordBtnState();
  }

  tenantSearchInput?.addEventListener("input", () => {
    selectedTenant = null;
    renderTenantSuggestions(tenantSearchInput.value);
    syncRecordBtnState();
  });

  tenantSearchInput?.addEventListener("focus", () => {
    if (tenantSearchInput.value.trim() && !selectedTenant) {
      renderTenantSuggestions(tenantSearchInput.value);
    }
  });

  tenantSearchInput?.addEventListener("keydown", (e) => {
    if (tenantSearchResults?.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion(tenantActiveIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion(tenantActiveIndex - 1);
    } else if (e.key === "Enter") {
      if (tenantActiveIndex >= 0 && tenantSuggestions[tenantActiveIndex]) {
        e.preventDefault();
        chooseTenant(tenantSuggestions[tenantActiveIndex]);
      }
    } else if (e.key === "Escape") {
      closeTenantSuggestions();
    }
  });

  tenantSearchResults?.addEventListener("mousedown", (e) => {
    const option = e.target.closest(".tenant-suggest__option");
    if (!option) return;
    e.preventDefault();
    chooseTenant(tenantSuggestions[Number(option.dataset.index)]);
  });

  document.addEventListener("click", (e) => {
    if (!tenantSearchResults || tenantSearchResults.hidden) return;
    if (e.target.closest(".tenant-search")) return;
    closeTenantSuggestions();
  });

  /* ── Waive a Balance ── */

  const waiveBalanceForm = document.getElementById("waiveBalanceForm");
  const waiveBalanceFormEmpty = document.getElementById("waiveBalanceFormEmpty");
  const waiveBalancesSearchInput = document.getElementById("waiveBalancesSearch");
  const waiveAmountInput = document.getElementById("waiveAmount");
  const waiveReasonInput = document.getElementById("waiveReason");
  const waiveApprovedByInput = document.getElementById("waiveApprovedBy");
  const waiveBalanceSubmit = document.getElementById("waiveBalanceSubmit");
  const waiveBalanceSummary = document.getElementById("waiveBalanceSummary");
  const waiveRentMonthMenu = document.getElementById("waiveRentMonthMenu");
  const waiveRentMonthHidden = document.getElementById("waiveRentMonth");
  const waiveRentMonthTrigger = document.getElementById("waiveRentMonthTrigger");
  let waiveSelectedTenant = null;
  let waiveSelectedBalanceId = null;
  let waiveRentMonthMultiSelect = null;
  let waiveBalanceInitialized = false;

  function getSelectedWaiveMonths() {
    if (waiveRentMonthMultiSelect) return waiveRentMonthMultiSelect.getSelected();
    return waiveRentMonthHidden?.value
      ? waiveRentMonthHidden.value.split(",").map((month) => month.trim()).filter(Boolean)
      : [];
  }

  function findTenantForBalance(balance) {
    if (!balance) return null;
    return tenants.find((t) => (t.tenantId || t.id) === balance.id) || {
      tenantId: balance.id,
      id: balance.id,
      name: balance.name,
      estate: balance.estate,
      unit: balance.house,
      house: balance.house,
    };
  }

  function getFilteredWaiveBalances() {
    const search = waiveBalancesSearchInput?.value.trim().toLowerCase() || "";
    return outstandingBalances
      .filter((balance) => {
        if (!search) return true;
        return [balance.name, balance.house, balance.phone, balance.estate, balance.id]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name, "en"));
  }

  function renderWaiveBalancesList() {
    const table = document.getElementById("waiveBalancesTable");
    const countEl = document.getElementById("waiveBalancesTableCount");
    const filteredBalances = getFilteredWaiveBalances();

    if (countEl) {
      countEl.textContent = outstandingBalancesLoadState === "loading"
        ? "Loading outstanding balances..."
        : `Showing ${filteredBalances.length} of ${outstandingBalances.length} balance${outstandingBalances.length === 1 ? "" : "s"}`;
    }

    if (!table) return;

    if (outstandingBalancesLoadState === "loading") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="6">
            <span class="loading-spinner" role="status" aria-label="Loading">
              <img src="assets/spinner.svg" alt="">
              Loading outstanding balances...
            </span>
          </td>
        </tr>`;
      return;
    }

    if (outstandingBalancesLoadState === "error") {
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="6"><span class="material-symbols-outlined">cloud_off</span>Could not load outstanding balances.</td>
        </tr>`;
      return;
    }

    if (!filteredBalances.length) {
      const emptyMessage = outstandingBalances.length
        ? "No balances match your search."
        : "No outstanding balances to waive.";
      table.innerHTML = `
        <tr class="outstanding-empty">
          <td colspan="6"><span class="material-symbols-outlined">person_search</span>${emptyMessage}</td>
        </tr>`;
      return;
    }

    table.innerHTML = filteredBalances
      .map((balance) => {
        const selected = balance.id === waiveSelectedBalanceId;
        return `
        <tr class="waive-balance-row${selected ? " waive-balance-row--selected" : ""}" data-balance-id="${escapeHtml(balance.id)}" tabindex="0" role="button" aria-pressed="${selected}">
          <td>
            <span class="outstanding-tenant__name">${escapeHtml(balance.name)}</span>
            <span class="outstanding-tenant__id">${escapeHtml(balance.id)}</span>
          </td>
          <td><span class="estate-name">${escapeHtml(estateShortName(balance.estate))}</span></td>
          <td><span class="house-number">${escapeHtml(balance.house)}</span></td>
          <td><span class="phone-number">${formatPhone(balance.phone)}</span></td>
          <td><div class="month-list">${balance.pendingMonths.map((pendingMonth) => `<span class="month-chip">${escapeHtml(pendingMonth)}</span>`).join("")}</div></td>
          <td class="text-right"><span class="outstanding-amount">${formatOutstandingAmount(balance.outstanding)}</span></td>
        </tr>`;
      })
      .join("");
  }

  function syncWaiveSelectionUI() {
    const hasSelection = !!waiveSelectedTenant;
    waiveBalanceFormEmpty?.toggleAttribute("hidden", hasSelection);
    waiveBalanceForm?.toggleAttribute("hidden", !hasSelection);
  }

  function getOutstandingBalanceForTenant(tenant) {
    if (!tenant) return null;
    const tenantKey = tenant.tenantId || tenant.id;
    return outstandingBalances.find((balance) => balance.id === tenantKey) || null;
  }

  function computeWaiveAmountFromSelection() {
    const balance = getOutstandingBalanceForTenant(waiveSelectedTenant);
    if (!balance) return 0;

    const selectedMonths = getSelectedWaiveMonths();
    if (!selectedMonths.length) return 0;

    const monthAmounts = balance.monthAmounts || {};
    return selectedMonths.reduce((sum, month) => sum + (Number(monthAmounts[month]) || 0), 0);
  }

  function syncWaiveAmountFromSelection() {
    const amount = computeWaiveAmountFromSelection();
    if (waiveAmountInput) {
      waiveAmountInput.value = amount ? formatDigitsWithCommas(String(amount)) : "0";
    }
  }

  function fillWaiveTenantInfo(tenant, balance) {
    const nameEl = document.getElementById("waiveTenantName");
    const estateEl = document.getElementById("waiveTenantEstate");
    const unitEl = document.getElementById("waiveTenantUnit");
    const outstandingEl = document.getElementById("waiveTenantOutstanding");
    if (nameEl) nameEl.textContent = tenant?.name || "—";
    if (estateEl) estateEl.textContent = estateShortName(tenant?.estate) || "—";
    if (unitEl) unitEl.textContent = tenant?.unit || tenant?.house || "—";
    if (outstandingEl) {
      outstandingEl.textContent = balance
        ? formatOutstandingAmount(balance.outstanding)
        : "UGX 0";
    }
  }

  function populateWaiveRentMonthOptions(months) {
    if (!waiveRentMonthMultiSelect) return;

    const items = months.map((month) => ({ value: month, label: month }));
    waiveRentMonthMultiSelect.setItems(items);
    waiveRentMonthMultiSelect.setDisabled(!months.length);
    if (months.length) waiveRentMonthMultiSelect.setValues(months);
  }

  function renderWaiveBalanceSummary() {
    if (!waiveBalanceSummary) return;

    if (!waiveSelectedTenant) {
      waiveBalanceSummary.innerHTML = `
        <p class="waive-balance-summary__empty">
          <span class="material-symbols-outlined icon icon--empty">touch_app</span>
          Select a balance to waive
        </p>`;
      return;
    }

    const balance = getOutstandingBalanceForTenant(waiveSelectedTenant);
    const rentMonths = getSelectedWaiveMonths();
    const rentMonthsDisplay = rentMonths.length
      ? `<div class="month-list month-list--summary">${rentMonths.map((month) => `<span class="month-chip">${escapeHtml(month)}</span>`).join("")}</div>`
      : "—";
    const reason = waiveReasonInput?.value.trim() || "";
    const approvedBy = waiveApprovedByInput?.value.trim() || "—";
    const waiveAmount = computeWaiveAmountFromSelection();
    const amountDisplay = waiveAmount > 0 ? formatOutstandingAmount(waiveAmount) : "—";

    waiveBalanceSummary.innerHTML = `
      <div class="waive-balance-summary__row">
        <span class="waive-balance-summary__label">Tenant</span>
        <span class="waive-balance-summary__value">${escapeHtml(waiveSelectedTenant.name)}</span>
      </div>
      <div class="waive-balance-summary__row">
        <span class="waive-balance-summary__label">Pending months</span>
        <span class="waive-balance-summary__value">${balance?.pendingMonths?.length || 0}</span>
      </div>
      <div class="waive-balance-summary__row">
        <span class="waive-balance-summary__label">Total outstanding</span>
        <span class="waive-balance-summary__value">${formatOutstandingAmount(balance?.outstanding || 0)}</span>
      </div>
      <div class="waive-balance-summary__row">
        <span class="waive-balance-summary__label">Rent months</span>
        <span class="waive-balance-summary__value">${rentMonthsDisplay}</span>
      </div>
      <div class="waive-balance-summary__row">
        <span class="waive-balance-summary__label">Amount to waive</span>
        <span class="waive-balance-summary__value waive-balance-summary__value--amount">${amountDisplay}</span>
      </div>
      <div class="waive-balance-summary__row">
        <span class="waive-balance-summary__label">Approved by</span>
        <span class="waive-balance-summary__value">${escapeHtml(approvedBy)}</span>
      </div>
      ${reason ? `<p class="waive-balance-summary__note">${escapeHtml(reason)}</p>` : ""}`;
  }

  function canSubmitWaiveBalance() {
    if (!waiveSelectedTenant) return false;
    if (!getSelectedWaiveMonths().length) return false;
    if (!waiveReasonInput?.value.trim()) return false;
    return computeWaiveAmountFromSelection() > 0;
  }

  function syncWaiveSubmitState() {
    if (waiveBalanceSubmit) waiveBalanceSubmit.disabled = !canSubmitWaiveBalance();
    renderWaiveBalanceSummary();
  }

  function resetWaiveBalanceForm() {
    waiveSelectedTenant = null;
    waiveSelectedBalanceId = null;
    fillWaiveTenantInfo(null, null);
    populateWaiveRentMonthOptions([]);
    if (waiveAmountInput) waiveAmountInput.value = "0";
    if (waiveReasonInput) waiveReasonInput.value = "";
    if (waiveApprovedByInput) waiveApprovedByInput.value = "";
    syncWaiveSelectionUI();
    renderWaiveBalancesList();
    syncWaiveSubmitState();
  }

  function chooseWaiveBalance(balance) {
    if (!balance) return;
    const tenant = findTenantForBalance(balance);
    waiveSelectedTenant = tenant;
    waiveSelectedBalanceId = balance.id;
    fillWaiveTenantInfo(tenant, balance);
    populateWaiveRentMonthOptions(balance.pendingMonths || []);
    syncWaiveAmountFromSelection();
    syncWaiveSelectionUI();
    renderWaiveBalancesList();
    syncWaiveSubmitState();
  }

  function initWaiveBalanceForm() {
    if (waiveBalanceInitialized) return;

    waiveRentMonthMultiSelect = initMultiSelect(
      {
        container: document.getElementById("waiveRentMonthSelect"),
        trigger: waiveRentMonthTrigger,
        menu: waiveRentMonthMenu,
        display: document.getElementById("waiveRentMonthDisplay"),
        hidden: waiveRentMonthHidden,
      },
      [],
      "All pending months",
      "Select rent months"
    );
    waiveRentMonthMultiSelect.setDisabled(true);

    waiveBalancesSearchInput?.addEventListener("input", renderWaiveBalancesList);

    document.getElementById("waiveBalancesTable")?.addEventListener("click", (e) => {
      const row = e.target.closest(".waive-balance-row");
      if (!row) return;
      const balance = outstandingBalances.find((item) => item.id === row.dataset.balanceId);
      if (balance) chooseWaiveBalance(balance);
    });

    document.getElementById("waiveBalancesTable")?.addEventListener("keydown", (e) => {
      const row = e.target.closest(".waive-balance-row");
      if (!row) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const balance = outstandingBalances.find((item) => item.id === row.dataset.balanceId);
        if (balance) chooseWaiveBalance(balance);
      }
    });

    waiveRentMonthHidden?.addEventListener("change", () => {
      syncWaiveAmountFromSelection();
      syncWaiveSubmitState();
    });
    waiveReasonInput?.addEventListener("input", syncWaiveSubmitState);
    waiveApprovedByInput?.addEventListener("input", syncWaiveSubmitState);

    waiveBalanceForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!canSubmitWaiveBalance()) {
        syncWaiveSubmitState();
        return;
      }

      const balance = getOutstandingBalanceForTenant(waiveSelectedTenant);
      const selectedMonths = getSelectedWaiveMonths();
      const waiveAmount = computeWaiveAmountFromSelection();
      if (waiveAmount <= 0) {
        alert("Please select at least one rent month with an outstanding balance.");
        return;
      }

      if (!selectedMonths.length) {
        alert("Please select at least one rent month to waive.");
        return;
      }

      if (!waiveReasonInput?.value.trim()) {
        alert("Please enter a reason for this waiver.");
        waiveReasonInput?.focus();
        return;
      }

      const monthAmounts = balance?.monthAmounts || {};
      const waiveBase = {
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        tenantId: waiveSelectedTenant.tenantId || waiveSelectedTenant.id || "",
        tenantName: waiveSelectedTenant.name,
        estate: waiveSelectedTenant.estate || balance?.estate || "",
        house: waiveSelectedTenant.unit || waiveSelectedTenant.house || balance?.house || "",
        reason: waiveReasonInput.value.trim(),
        approvedBy: waiveApprovedByInput?.value.trim() || "—",
      };

      // Each waived month is its own payment — one payment per month, never
      // stacked into a single combined record.
      const newWaivers = selectedMonths.map((month) => ({
        ...waiveBase,
        rentMonth: month,
        amount: Number(monthAmounts[month]) || 0,
      }));
      waivedPayments.unshift(...newWaivers);

      navigateToView("waived-payments");
    });

    syncWaiveSelectionUI();
    waiveBalanceInitialized = true;
  }

  initWaiveBalanceForm();

  paymentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canRecordPayment()) {
      syncRecordBtnState();
      return;
    }

    const tenant = getPaymentEntryTenant();
    if (apiLoaded && !tenant) {
      alert("Please select a valid tenant from the list.");
      return;
    }
    selectedTenant = tenant;

    if (!validateBankRef()) {
      bankRefInput?.focus();
      return;
    }

    const { amount, invalid } = syncAmountInput(amountInput?.value ?? "0");
    if (invalid || amount <= 0n) {
      alert("Please enter a valid payment amount.");
      amountInput?.focus();
      return;
    }
    const payload = {
      tenantId: tenant?.tenantId || "T001",
      date: document.getElementById("paymentDate")?.value,
      amount: Number(amount),
      method: document.getElementById("paymentMethod")?.value,
      bankRef: getBankRefValue(),
      notes: document.getElementById("paymentNotes")?.value || "",
    };

    if (apiLoaded) {
      try {
        recordBtn.disabled = true;
        const result = await RentLedgerApi.post("/api/payments", payload);
        await refreshFromApi();
        showPaymentSuccessModal(result, tenant);
      } catch (err) {
        alert(`Could not save payment: ${err.message}`);
        syncRecordBtnState();
        return;
      }
    } else {
      alert("Database not connected.");
      return;
    }

    paymentForm.reset();
    clearTenantInfo();
    setBankRefValidationState(false);
    lastValidAmountDisplay = "0";
    syncAmountInput("0");
    resetPaymentDateToToday();
    renderPreview();
    syncRecordBtnState();
  });

  /* ── Bank Statement Review ── */

  let statementReviewInitialized = false;
  let draftRows = [];
  let currentStatementFile = "";
  let batchRecorded = false;

  const draftStatusClass = {
    "Ready to Approve": "draft-pill--ready",
    "Needs Edit": "draft-pill--edit",
    Rejected: "draft-pill--rejected",
    Approved: "draft-pill--approved",
  };

  const statementMethods = ["Bank Deposit", "Mobile Money", "Agency Banking"];

  let statementHistory = [];

  function getStatementTenantOptions() {
    if (Array.isArray(tenants) && tenants.length) {
      return tenants.map((t) => ({ name: t.name, unit: t.unit, estate: t.estate }));
    }
    return tenantsDirectory.map((t) => ({ name: t.name, unit: t.house, estate: t.estate }));
  }

  function formatStatementDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderDraftActions(row, index) {
    if (row.editing) {
      return `
        <button type="button" class="draft-action draft-action--save" data-action="save" data-index="${index}">Save</button>
        <button type="button" class="draft-action draft-action--cancel" data-action="cancel" data-index="${index}">Cancel</button>`;
    }
    if (row.status === "Approved" || row.status === "Rejected") {
      return `<span class="draft-action draft-action--muted">${row.status}</span>`;
    }
    const approve = row.status === "Ready to Approve"
      ? `<button type="button" class="draft-action draft-action--approve" data-action="approve" data-index="${index}">Approve</button>`
      : "";
    return `
      ${approve}
      <button type="button" class="draft-action draft-action--edit" data-action="edit" data-index="${index}">Edit</button>
      <button type="button" class="draft-action draft-action--reject" data-action="reject" data-index="${index}">Reject</button>`;
  }

  function renderDraftSelect(prefix, field, options, selectedValue, placeholder = "") {
    const normalizedOptions = options.map((option) => {
      if (typeof option === "string") return { value: option, label: option };
      return {
        value: String(option.value ?? ""),
        label: String(option.label ?? option.value ?? ""),
      };
    });
    const selected = normalizedOptions.find((option) => option.value === String(selectedValue ?? "")) ||
      (placeholder ? null : normalizedOptions[0]);
    const display = selected?.label || placeholder || "Select";
    const value = selected?.value || "";
    const optionItems = (placeholder ? [{ value: "", label: placeholder }].concat(normalizedOptions) : normalizedOptions)
      .map((option) => {
        const optionSelected = option.value === value;
        return `<li class="custom-select__option${optionSelected ? " custom-select__option--selected" : ""}" role="option" data-value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}" aria-selected="${optionSelected ? "true" : "false"}">${escapeHtml(option.label)}</li>`;
      })
      .join("");

    return `
      <div class="custom-select draft-select" id="${prefix}Select">
        <button type="button" class="custom-select__trigger" id="${prefix}Trigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="custom-select__value" id="${prefix}Display">${escapeHtml(display)}</span>
          <span class="material-symbols-outlined icon icon--select" aria-hidden="true">expand_more</span>
        </button>
        <input type="hidden" id="${prefix}Input" data-field="${escapeHtml(field)}" value="${escapeHtml(value)}">
        <ul class="custom-select__menu" id="${prefix}Menu" role="listbox" hidden>${optionItems}</ul>
      </div>`;
  }

  function renderDraftDatePicker(prefix, isoValue) {
    return `
      <div class="datepicker draft-datepicker" id="${prefix}Picker">
        <button type="button" class="datepicker__trigger" id="${prefix}Trigger" aria-haspopup="dialog" aria-expanded="false">
          <span class="material-symbols-outlined icon icon--input" aria-hidden="true">calendar_today</span>
          <span class="datepicker__value" id="${prefix}Display">Select date</span>
        </button>
        <input type="hidden" id="${prefix}Input" data-field="date" value="${escapeHtml(isoValue || "")}">
        <div class="datepicker__popover" id="${prefix}Popover" role="dialog" aria-label="Choose transaction date" hidden>
          <div class="datepicker__header">
            <button type="button" class="datepicker__nav-btn" id="${prefix}Prev" aria-label="Previous month"><span class="material-symbols-outlined">chevron_left</span></button>
            <span class="datepicker__month-label" id="${prefix}MonthLabel"></span>
            <button type="button" class="datepicker__nav-btn" id="${prefix}Next" aria-label="Next month"><span class="material-symbols-outlined">chevron_right</span></button>
          </div>
          <div class="datepicker__toolbar">
            <input type="text" class="datepicker__field" id="${prefix}Field" readonly>
            <button type="button" class="datepicker__today-btn" id="${prefix}Today">Today</button>
          </div>
          <div class="datepicker__weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
          <div class="datepicker__grid" id="${prefix}Grid"></div>
          <div class="datepicker__footer">
            <button type="button" class="datepicker__btn datepicker__btn--cancel" id="${prefix}Cancel">Cancel</button>
            <button type="button" class="datepicker__btn datepicker__btn--apply" id="${prefix}Apply">Apply</button>
          </div>
        </div>
      </div>`;
  }

  function initDraftEditingControls() {
    document.querySelectorAll(".statement-draft-row--editing").forEach((row) => {
      const index = row.dataset.index;
      if (index == null) return;
      const datePrefix = `draftDate${index}`;
      const tenantPrefix = `draftTenant${index}`;
      const methodPrefix = `draftMethod${index}`;

      initDatePicker({
        picker: document.getElementById(`${datePrefix}Picker`),
        trigger: document.getElementById(`${datePrefix}Trigger`),
        popover: document.getElementById(`${datePrefix}Popover`),
        display: document.getElementById(`${datePrefix}Display`),
        hidden: document.getElementById(`${datePrefix}Input`),
        field: document.getElementById(`${datePrefix}Field`),
        monthLabel: document.getElementById(`${datePrefix}MonthLabel`),
        grid: document.getElementById(`${datePrefix}Grid`),
        prevBtn: document.getElementById(`${datePrefix}Prev`),
        nextBtn: document.getElementById(`${datePrefix}Next`),
        todayBtn: document.getElementById(`${datePrefix}Today`),
        cancelBtn: document.getElementById(`${datePrefix}Cancel`),
        applyBtn: document.getElementById(`${datePrefix}Apply`),
        placement: "below",
      });

      initCustomSelect({
        container: document.getElementById(`${tenantPrefix}Select`),
        trigger: document.getElementById(`${tenantPrefix}Trigger`),
        menu: document.getElementById(`${tenantPrefix}Menu`),
        display: document.getElementById(`${tenantPrefix}Display`),
        hidden: document.getElementById(`${tenantPrefix}Input`),
      });

      initCustomSelect({
        container: document.getElementById(`${methodPrefix}Select`),
        trigger: document.getElementById(`${methodPrefix}Trigger`),
        menu: document.getElementById(`${methodPrefix}Menu`),
        display: document.getElementById(`${methodPrefix}Display`),
        hidden: document.getElementById(`${methodPrefix}Input`),
      });
    });
  }

  function renderDraftRow(row, index) {
    if (row.editing) {
      const tenantOptions = getStatementTenantOptions().map((opt) => ({ value: opt.name, label: opt.name }));
      const methodOptions = statementMethods.map((method) => ({ value: method, label: method }));
      return `
        <tr class="statement-draft-row statement-draft-row--editing" data-index="${index}">
          <td>${renderDraftDatePicker(`draftDate${index}`, row.date)}</td>
          <td>${renderDraftSelect(`draftTenant${index}`, "tenant", tenantOptions, row.tenantName, "- Select tenant -")}</td>
          <td class="draft-cell-unit">${escapeHtml(row.unit) || "—"}</td>
          <td class="draft-cell-estate">${escapeHtml(estateShortName(row.estate)) || "—"}</td>
          <td class="text-right"><input type="text" class="draft-input draft-input--amount text-right" data-field="amount" inputmode="numeric" value="${escapeHtml(row.amount)}"></td>
          <td>
            ${renderDraftSelect(`draftMethod${index}`, "method", methodOptions, row.method)}
          </td>
          <td>Pending</td>
          <td><span class="draft-pill ${draftStatusClass[row.status] || ""}">${row.status}</span></td>
          <td class="statement-draft-actions">${renderDraftActions(row, index)}</td>
        </tr>`;
    }

    const tenantCell = row.tenantName
      ? escapeHtml(row.tenantName)
      : `<span class="draft-cell-empty">Unmatched</span>${row.rawText ? `<span class="draft-cell-raw">${escapeHtml(row.rawText)}</span>` : ""}`;

    return `
      <tr class="statement-draft-row" data-index="${index}">
        <td>${formatStatementDate(row.date)}</td>
        <td>${tenantCell}</td>
        <td>${escapeHtml(row.unit) || "—"}</td>
        <td>${escapeHtml(estateShortName(row.estate)) || "—"}</td>
        <td class="text-right amount">${formatNumber(Number(row.amount) || 0)}</td>
        <td>
          <span class="method-cell">${methodIcons[row.method] || ""}${escapeHtml(row.method)}</span>
        </td>
        <td>${row.receiptNo ? escapeHtml(formatReceiptNumber(row.receiptNo)) : '<span class="draft-cell-pending">Pending</span>'}</td>
        <td><span class="draft-pill ${draftStatusClass[row.status] || ""}">${row.status}</span></td>
        <td class="statement-draft-actions">${renderDraftActions(row, index)}</td>
      </tr>`;
  }

  function renderDraftTable() {
    const body = document.getElementById("statementDraftBody");
    const count = document.getElementById("statementDraftCount");
    if (!body) return;

    body.innerHTML = draftRows.map((row, i) => renderDraftRow(row, i)).join("");
    initDraftEditingControls();

    if (count) {
      const approved = draftRows.filter((r) => r.status === "Approved").length;
      count.textContent = `Showing ${draftRows.length} draft row${draftRows.length === 1 ? "" : "s"} · ${approved} approved`;
    }

    const approveAll = document.getElementById("approveAllBtn");
    if (approveAll) {
      const hasValid = draftRows.some((r) => r.status === "Ready to Approve");
      approveAll.disabled = !hasValid;
    }
  }

  function renderStatementHistory() {
    const body = document.getElementById("statementHistoryBody");
    if (!body) return;
    if (!statementHistory.length) {
      body.innerHTML = `<tr class="outstanding-empty"><td colspan="7"><span class="material-symbols-outlined">history</span>No statements reviewed yet.</td></tr>`;
      return;
    }
    body.innerHTML = statementHistory
      .map(
        (h) => `
        <tr>
          <td><span class="method-cell"><span class="material-symbols-outlined icon icon--method">description</span>${escapeHtml(h.fileName)}</span></td>
          <td>${escapeHtml(h.dateReviewed)}</td>
          <td class="text-right">${h.transactions}</td>
          <td class="text-right">${h.approved}</td>
          <td class="text-right">${h.rejected}</td>
          <td class="text-right amount">${formatNumber(Number(h.totalApproved) || 0)}</td>
          <td><span class="badge badge--paid">${escapeHtml(h.status)}</span></td>
        </tr>`
      )
      .join("");
  }

  function approveDraftRow(row) {
    if (row.status !== "Ready to Approve") return;
    // Statement imports remain unavailable until their parsed transactions can
    // be posted to the database; never manufacture an approval or receipt.
  }

  function recordBatchIfComplete() {
    if (batchRecorded || !draftRows.length || !currentStatementFile) return;
    const allTerminal = draftRows.every((r) => r.status === "Approved" || r.status === "Rejected");
    if (!allTerminal) return;

    const approved = draftRows.filter((r) => r.status === "Approved");
    const rejected = draftRows.filter((r) => r.status === "Rejected");
    statementHistory.unshift({
      fileName: currentStatementFile,
      dateReviewed: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      transactions: draftRows.length,
      approved: approved.length,
      rejected: rejected.length,
      totalApproved: approved.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
      status: "Completed",
    });
    batchRecorded = true;
    renderStatementHistory();
  }

  function handleDraftAction(action, index) {
    const row = draftRows[index];
    if (!row) return;

    if (action === "approve") {
      approveDraftRow(row);
    } else if (action === "reject") {
      row.status = "Rejected";
      row.editing = false;
    } else if (action === "edit") {
      draftRows.forEach((r) => (r.editing = false));
      row.editing = true;
    } else if (action === "cancel") {
      row.editing = false;
    } else if (action === "save") {
      const tr = document.querySelector(`.statement-draft-row[data-index="${index}"]`);
      if (tr) {
        const tenantName = tr.querySelector('[data-field="tenant"]')?.value || "";
        const date = tr.querySelector('[data-field="date"]')?.value || row.date;
        const amountRaw = (tr.querySelector('[data-field="amount"]')?.value || "").replace(/[^\d]/g, "");
        const method = tr.querySelector('[data-field="method"]')?.value || row.method;
        const match = getStatementTenantOptions().find((opt) => opt.name === tenantName);
        row.tenantName = tenantName;
        row.unit = match?.unit || "";
        row.estate = match?.estate || "";
        row.date = date;
        row.amount = amountRaw ? Number(amountRaw) : 0;
        row.method = method;
        row.status = tenantName ? "Ready to Approve" : "Needs Edit";
      }
      row.editing = false;
    }

    renderDraftTable();
    recordBatchIfComplete();
  }

  function showStatementFileChip(name) {
    const dropzone = document.getElementById("statementDropzone");
    const chip = document.getElementById("statementFileChip");
    const fileNameEl = document.getElementById("statementFileName");
    const fileMetaEl = document.getElementById("statementFileMeta");
    const reviewBtn = document.getElementById("statementReviewBtn");
    const hasDraftRows = draftRows.length > 0;
    if (dropzone) dropzone.hidden = true;
    if (chip) chip.hidden = false;
    if (fileNameEl) fileNameEl.textContent = name;
    if (fileMetaEl) fileMetaEl.textContent = hasDraftRows ? "Ready to review" : "Statement selected";
    if (reviewBtn) reviewBtn.hidden = !hasDraftRows;
  }

  function resetStatementUpload() {
    const dropzone = document.getElementById("statementDropzone");
    const chip = document.getElementById("statementFileChip");
    const draftCard = document.getElementById("statementDraftCard");
    const fileInput = document.getElementById("statementFileInput");
    if (dropzone) dropzone.hidden = false;
    if (chip) chip.hidden = true;
    if (draftCard) draftCard.hidden = true;
    if (fileInput) fileInput.value = "";
    const reviewBtn = document.getElementById("statementReviewBtn");
    if (reviewBtn) reviewBtn.hidden = true;
    draftRows = [];
    currentStatementFile = "";
    batchRecorded = false;
  }

  function startStatementReview() {
    if (!currentStatementFile || !draftRows.length) return;
    batchRecorded = false;

    // Re-match unmatched rows against the live tenant list where possible.
    const options = getStatementTenantOptions();
    draftRows.forEach((row) => {
      if (!row.tenantName) return;
      const match = options.find((opt) => opt.name === row.tenantName);
      if (match) {
        row.unit = match.unit;
        row.estate = match.estate;
      }
    });

    const draftCard = document.getElementById("statementDraftCard");
    const source = document.getElementById("statementDraftSource");
    if (source) source.textContent = `From: ${currentStatementFile}`;
    if (draftCard) {
      draftCard.hidden = false;
      // Always show the table expanded when a new review starts.
      draftCard.classList.remove("card--collapsed");
      const toggle = draftCard.querySelector("[data-collapse-toggle]");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Collapse table");
      }
    }
    renderDraftTable();
  }

  function initStatementReviewOnce() {
    if (statementReviewInitialized) return;
    statementReviewInitialized = true;

    const dropzone = document.getElementById("statementDropzone");
    const fileInput = document.getElementById("statementFileInput");
    const reviewBtn = document.getElementById("statementReviewBtn");
    const removeBtn = document.getElementById("statementRemoveBtn");
    const approveAllBtn = document.getElementById("approveAllBtn");
    const draftBody = document.getElementById("statementDraftBody");

    dropzone?.addEventListener("click", () => fileInput?.click());
    dropzone?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput?.click();
      }
    });

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      draftRows = [];
      batchRecorded = false;
      currentStatementFile = file.name;
      showStatementFileChip(file.name);
    });

    reviewBtn?.addEventListener("click", startStatementReview);
    removeBtn?.addEventListener("click", resetStatementUpload);

    approveAllBtn?.addEventListener("click", () => {
      draftRows.forEach((row) => approveDraftRow(row));
      renderDraftTable();
      recordBatchIfComplete();
    });

    draftBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      handleDraftAction(btn.dataset.action, parseInt(btn.dataset.index, 10));
    });

    document.querySelectorAll("[data-collapse-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const card = toggle.closest(".card");
        if (!card) return;
        const collapsed = card.classList.toggle("card--collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute("aria-label", collapsed ? "Expand table" : "Collapse table");
      });
    });

    renderStatementHistory();
  }

  initReceiptModalOnce();
  initAddTenantModalOnce();

  const dashYear = new Date().getFullYear();
  setDashText("dashYearCollectedLabel", `Total Collected in ${dashYear}`);

  initApi();

  paymentDatePickerControl = initDatePicker({
    picker: document.getElementById("paymentDatePicker"),
    trigger: document.getElementById("paymentDateTrigger"),
    popover: document.getElementById("paymentDatePopover"),
    display: document.getElementById("paymentDateDisplay"),
    hidden: document.getElementById("paymentDate"),
    field: document.getElementById("datepickerField"),
    monthLabel: document.getElementById("datepickerMonthLabel"),
    grid: document.getElementById("datepickerGrid"),
    prevBtn: document.getElementById("datepickerPrev"),
    nextBtn: document.getElementById("datepickerNext"),
    todayBtn: document.getElementById("datepickerToday"),
    cancelBtn: document.getElementById("datepickerCancel"),
    applyBtn: document.getElementById("datepickerApply"),
    initialDate: new Date(),
    onChange: () => syncRecordBtnState(),
  });

  syncRecordBtnState();

  function initDatePicker(els) {
    if (!els.picker || !els.grid) return;

    const today = new Date();
    const seedDate = els.initialDate ? new Date(els.initialDate) : today;
    let viewDate = new Date(seedDate.getFullYear(), seedDate.getMonth(), 1);
    let selectedDate = new Date(seedDate);
    let pendingDate = new Date(seedDate);
    let isOpen = false;

    if (els.hidden?.value) {
      selectedDate = new Date(`${els.hidden.value}T12:00:00`);
      pendingDate = new Date(selectedDate);
      viewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    }

    function pad(n) {
      return String(n).padStart(2, "0");
    }

    function toISO(d) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function formatDisplay(d) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    function formatMonthYear(d) {
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }

    function isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    }

    function syncCommitted() {
      if (!els.hidden.value) {
        els.display.textContent = els.emptyLabel || "Select date";
        return;
      }
      selectedDate = new Date(`${els.hidden.value}T12:00:00`);
      els.display.textContent = formatDisplay(selectedDate);
    }

    function setDate(iso) {
      if (!iso) {
        els.hidden.value = "";
        els.display.textContent = els.emptyLabel || "Select date";
        selectedDate = new Date(today);
        pendingDate = new Date(today);
        viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
        return;
      }
      selectedDate = new Date(`${iso}T12:00:00`);
      pendingDate = new Date(selectedDate);
      viewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      syncCommitted();
    }

    function renderGrid() {
      els.monthLabel.textContent = formatMonthYear(viewDate);
      els.field.value = formatDisplay(pendingDate);

      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset = (firstDay.getDay() + 6) % 7;
      const today = new Date();
      const gridStart = new Date(year, month, 1 - startOffset);

      els.grid.innerHTML = "";

      for (let i = 0; i < 42; i++) {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        const outside = date.getMonth() !== month;
        els.grid.appendChild(createDayButton(date, outside));
      }

      function createDayButton(date, outside) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "datepicker__day";
        btn.textContent = date.getDate();

        if (outside) btn.classList.add("datepicker__day--outside");
        if (isSameDay(date, pendingDate)) btn.classList.add("datepicker__day--selected");
        if (isSameDay(date, today)) btn.classList.add("datepicker__day--today");

        btn.addEventListener("click", (e) => {
          // Stop the click from bubbling to the document outside-click
          // handler. renderGrid() rebuilds the grid and detaches this
          // button, which would otherwise make picker.contains(e.target)
          // false and close the popover before the selection is visible.
          e.stopPropagation();
          pendingDate = new Date(date);
          if (outside) viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
          renderGrid();
        });

        return btn;
      }
    }

    function positionPopover() {
      const pop = els.popover;
      // Reset any prior inline positioning before measuring.
      pop.style.left = "";
      pop.style.right = "";
      pop.classList.remove("datepicker__popover--below");

      const margin = 8;
      const triggerRect = els.trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const popWidth = pop.offsetWidth;
      const popHeight = pop.offsetHeight;

      // Horizontal: clamp so the popover stays within the viewport. The
      // popover is absolutely positioned relative to the trigger's left edge.
      const maxOffset = viewportWidth - margin - popWidth - triggerRect.left;
      const minOffset = margin - triggerRect.left;
      let offset = 0;
      if (offset > maxOffset) offset = maxOffset;
      if (offset < minOffset) offset = minOffset;
      pop.style.left = `${Math.round(offset)}px`;
      pop.style.right = "auto";

      // Vertical: open upward by default, but allow dense table controls to
      // opt into a below-trigger popover.
      const spaceAbove = triggerRect.top;
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const shouldOpenBelow = els.placement === "below" ||
        (els.placement !== "above" && spaceAbove < popHeight + margin && spaceBelow > spaceAbove);
      if (shouldOpenBelow) {
        pop.classList.add("datepicker__popover--below");
      }
    }

    function open() {
      if (els.hidden.value) {
        pendingDate = new Date(selectedDate);
        viewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      } else {
        const now = new Date();
        pendingDate = new Date(now);
        viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      renderGrid();
      els.popover.hidden = false;
      positionPopover();
      els.trigger.setAttribute("aria-expanded", "true");
      isOpen = true;
      window.addEventListener("resize", positionPopover);
    }

    function close() {
      els.popover.hidden = true;
      els.trigger.setAttribute("aria-expanded", "false");
      isOpen = false;
      window.removeEventListener("resize", positionPopover);
    }

    els.trigger.addEventListener("click", () => {
      isOpen ? close() : open();
    });

    els.prevBtn.addEventListener("click", () => {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      renderGrid();
    });

    els.nextBtn.addEventListener("click", () => {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      renderGrid();
    });

    els.todayBtn.addEventListener("click", () => {
      const today = new Date();
      pendingDate = today;
      viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
      renderGrid();
    });

    els.cancelBtn.addEventListener("click", close);

    els.applyBtn.addEventListener("click", () => {
      selectedDate = new Date(pendingDate);
      els.hidden.value = toISO(selectedDate);
      syncCommitted();
      close();
      els.onChange?.();
    });

    document.addEventListener("click", (e) => {
      if (isOpen && !els.picker.contains(e.target)) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) close();
    });

    if (els.hidden.value) {
      syncCommitted();
    } else if (els.initialDate) {
      els.hidden.value = toISO(new Date(els.initialDate));
      syncCommitted();
    } else {
      els.display.textContent = els.emptyLabel || "Select date";
    }

    return {
      setDate,
      getDate() {
        return els.hidden.value;
      },
    };
  }

  /* ── Custom Reports ── */

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const CR_METHOD_MAP = {
    bank: ["Bank Deposit", "Bank Transfer"],
    mobile: ["Mobile Money", "USSD Transfer", "POS Merchant"],
    agb: ["Agency Banking"],
  };

  let customReportTenants = [];
  let customReportPayments = [];
  let customReportReceipts = [];

  const CR_SAVED_KEY = "rentledger:savedReports";
  let customReportsInitialized = false;
  let crMultiSelects = {};
  let crSingleSelects = {};
  let crDatePickers = {};
  let crActiveViewId = null;

  function crPhoneDigits(value) {
    const normalized = window.PhoneNumbers.normalizeE164(value);
    return normalized ? normalized.replace(/\D/g, "") : String(value || "").replace(/\D/g, "");
  }

  function crPhoneMatches(stored, query) {
    const q = crPhoneDigits(query);
    if (!q) return true;
    return crPhoneDigits(stored).includes(q);
  }

  function crMethodMatches(methodValue, paymentMethod) {
    if (!methodValue) return true;
    const labels = CR_METHOD_MAP[methodValue];
    return labels ? labels.includes(paymentMethod) : paymentMethod === methodValue;
  }

  function initMultiSelect(els, items, allLabel, emptyLabel) {
    if (!els.container || !els.menu) return null;

    let itemsList = items;
    let placeholderLabel = allLabel;
    let emptyLabelText = emptyLabel || allLabel;
    let selected = new Set();
    let isOpen = false;

    function render() {
      els.menu.innerHTML = "";
      itemsList.forEach((item) => {
        const label = document.createElement("label");
        label.className = "multi-select__item" + (selected.has(item.value) ? " multi-select__item--checked" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "multi-select__checkbox";
        cb.checked = selected.has(item.value);
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(item.value); else selected.delete(item.value);
          sync();
          render();
        });
        const span = document.createElement("span");
        span.textContent = item.label;
        label.appendChild(cb);
        label.appendChild(span);
        els.menu.appendChild(label);
      });
    }

    function sync() {
      const arr = [...selected];
      els.hidden.value = arr.join(",");
      if (arr.length === 0) {
        els.display.textContent = emptyLabelText;
      } else if (itemsList.length > 0 && arr.length === itemsList.length) {
        els.display.textContent = placeholderLabel;
      } else if (arr.length === 1) {
        els.display.textContent = arr[0];
      } else {
        els.display.textContent = `${arr.length} selected`;
      }
      els.hidden.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function close() { els.menu.hidden = true; els.trigger.setAttribute("aria-expanded","false"); isOpen = false; }
    function open() { els.menu.hidden = false; els.trigger.setAttribute("aria-expanded","true"); isOpen = true; }

    els.trigger.addEventListener("click", () => { isOpen ? close() : open(); });
    document.addEventListener("click", (e) => { if (isOpen && !els.container.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) close(); });

    render();
    sync();

    return {
      getSelected() { return [...selected]; },
      clear() { selected.clear(); sync(); render(); },
      setValues(values) { selected = new Set(values); sync(); render(); },
      setItems(newItems) {
        itemsList = newItems;
        selected.clear();
        render();
        sync();
      },
      setDisabled(disabled) {
        els.trigger.disabled = disabled;
        if (disabled) close();
      },
    };
  }

  function crGetFilterState() {
    return {
      base: document.getElementById("crBase")?.value || "payments",
      estate: document.getElementById("crEstate")?.value || "",
      unit: document.getElementById("crUnit")?.value || "",
      year: document.getElementById("crYear")?.value || "",
      pending: document.getElementById("crPending")?.value || "",
      covered: document.getElementById("crCovered")?.value || "",
      security: document.getElementById("crSecurity")?.value || "",
      method: document.getElementById("crMethod")?.value || "",
      status: document.getElementById("crStatus")?.value || "",
      delivery: document.getElementById("crDelivery")?.value || "",
      tenantName: document.getElementById("crTenantName")?.value?.trim() || "",
      phone: document.getElementById("crPhone")?.value?.trim() || "",
      dateStart: document.getElementById("crDateStart")?.value || "",
      dateEnd: document.getElementById("crDateEnd")?.value || "",
      outstandingOp: document.getElementById("crOutstandingOp")?.value || "gt",
      outstandingVal: document.getElementById("crOutstandingVal")?.value?.replace(/[^\d]/g,"") || "",
      amountMin: document.getElementById("crAmountMin")?.value?.replace(/[^\d]/g,"") || "",
      amountMax: document.getElementById("crAmountMax")?.value?.replace(/[^\d]/g,"") || "",
    };
  }

  function crApplyFilterState(state) {
    crSingleSelects.base?.setValue(state.base || "payments");
    crSingleSelects.unit?.setValue(state.unit || "");
    crSingleSelects.year?.setValue(state.year || "");
    crSingleSelects.security?.setValue(state.security || "");
    crSingleSelects.method?.setValue(state.method || "");
    crSingleSelects.status?.setValue(state.status || "");
    crSingleSelects.delivery?.setValue(state.delivery || "");
    crSingleSelects.outstandingOp?.setValue(state.outstandingOp || "gt");

    if (state.estate) crMultiSelects.estate?.setValues(state.estate.split(",").filter(Boolean));
    else crMultiSelects.estate?.clear();
    if (state.pending) crMultiSelects.pending?.setValues(state.pending.split(",").filter(Boolean));
    else crMultiSelects.pending?.clear();
    if (state.covered) crMultiSelects.covered?.setValues(state.covered.split(",").filter(Boolean));
    else crMultiSelects.covered?.clear();

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ""; };
    el("crTenantName", state.tenantName);
    el("crPhone", state.phone);
    crDatePickers.start?.setDate(state.dateStart || "");
    crDatePickers.end?.setDate(state.dateEnd || "");
    el("crOutstandingVal", state.outstandingVal);
    el("crAmountMin", state.amountMin);
    el("crAmountMax", state.amountMax);
  }

  function crClearFilters() {
    crSingleSelects.base?.setValue("payments");
    crSingleSelects.unit?.setValue("");
    crSingleSelects.year?.setValue("");
    crSingleSelects.security?.setValue("");
    crSingleSelects.method?.setValue("");
    crSingleSelects.status?.setValue("");
    crSingleSelects.delivery?.setValue("");
    crSingleSelects.outstandingOp?.setValue("gt");
    crMultiSelects.estate?.clear();
    crMultiSelects.pending?.clear();
    crMultiSelects.covered?.clear();
    ["crTenantName","crPhone","crOutstandingVal","crAmountMin","crAmountMax"].forEach((id) => {
      const e = document.getElementById(id); if (e) e.value = "";
    });
    crDatePickers.start?.setDate("");
    crDatePickers.end?.setDate("");
    document.getElementById("crViewPanel").hidden = true;
    crActiveViewId = null;
  }

  function crFilterTenants(state) {
    return customReportTenants.filter((t) => {
      if (state.estate) { const es = state.estate.split(","); if (!es.includes(t.estate)) return false; }
      if (state.unit && t.house !== state.unit) return false;
      if (state.year) { /* tenants don't have a date, skip year filter */ }
      if (state.pending) { const ms = state.pending.split(","); if (!ms.some((m) => t.pendingMonths.includes(m))) return false; }
      if (state.security && t.securityDeposit !== state.security) return false;
      if (!tenantMatchesStatusFilter(t, state.status)) return false;
      if (state.tenantName && !t.name.toLowerCase().includes(state.tenantName.toLowerCase())) return false;
      if (!crPhoneMatches(t.phone, state.phone)) return false;
      if (state.outstandingVal) {
        const val = Number(state.outstandingVal);
        if (state.outstandingOp === "gt" && !(t.outstanding > val)) return false;
        if (state.outstandingOp === "lt" && !(t.outstanding < val)) return false;
        if (state.outstandingOp === "eq" && t.outstanding !== val) return false;
      }
      return true;
    });
  }

  function crFilterPayments(state) {
    return customReportPayments.filter((p) => {
      if (state.estate) { const es = state.estate.split(","); if (!es.includes(p.estate)) return false; }
      if (state.unit && p.unit !== state.unit) return false;
      if (state.year && !p.date.startsWith(state.year)) return false;
      if (state.method && !crMethodMatches(state.method, p.method)) return false;
      if (state.tenantName && !p.tenantName.toLowerCase().includes(state.tenantName.toLowerCase())) return false;
      if (state.dateStart && p.date < state.dateStart) return false;
      if (state.dateEnd && p.date > state.dateEnd) return false;
      if (state.amountMin && p.amount < Number(state.amountMin)) return false;
      if (state.amountMax && p.amount > Number(state.amountMax)) return false;
      if (state.covered) { const ms = state.covered.split(","); if (!ms.some((m) => p.monthsCovered.includes(m))) return false; }
      return true;
    });
  }

  function crFilterReceipts(state) {
    return customReportReceipts.filter((r) => {
      if (state.estate) { const t = customReportTenants.find((st) => st.id === r.tenantId); if (t && !state.estate.split(",").includes(t.estate)) return false; }
      if (state.year && !r.date.startsWith(state.year)) return false;
      if (state.delivery && r.email !== state.delivery && r.sms !== state.delivery) return false;
      if (state.tenantName && !r.tenantName.toLowerCase().includes(state.tenantName.toLowerCase())) return false;
      if (!crPhoneMatches(r.phone, state.phone)) return false;
      if (state.dateStart && r.date < state.dateStart) return false;
      if (state.dateEnd && r.date > state.dateEnd) return false;
      if (state.amountMin && r.amount < Number(state.amountMin)) return false;
      if (state.amountMax && r.amount > Number(state.amountMax)) return false;
      if (state.covered) { const ms = state.covered.split(","); if (!ms.some((m) => r.monthsCovered.includes(m))) return false; }
      return true;
    });
  }

  function crRenderReportTable(base, rows) {
    const thead = document.getElementById("crTableHead");
    const tbody = document.getElementById("crTableBody");
    const wrap = document.getElementById("crTableWrap");
    const footer = document.getElementById("crResultsFooter");
    const count = document.getElementById("crResultsCount");
    const empty = document.getElementById("crViewEmpty");

    if (!rows.length) {
      wrap.hidden = true;
      footer.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    wrap.hidden = false;
    footer.hidden = false;
    count.textContent = `Showing ${rows.length} row${rows.length === 1 ? "" : "s"}`;

    if (base === "tenants") {
      thead.innerHTML = `<tr><th>Tenant</th><th>Estate</th><th>House</th><th>Phone</th><th>Security</th><th>Status</th><th>Pending Months</th><th class="text-right">Outstanding</th></tr>`;
      tbody.innerHTML = rows.map((t) => `<tr>
        <td><span class="outstanding-tenant__name">${t.name}</span><span class="outstanding-tenant__id">${t.id}</span></td>
        <td><span class="estate-name">${escapeHtml(estateShortName(t.estate))}</span></td>
        <td><span class="house-number">${t.house}</span></td>
        <td><span class="phone-number">${formatPhone(t.phone)}</span></td>
        <td><span class="badge ${depositBadgeClass[t.securityDeposit] || ""}">${t.securityDeposit}</span></td>
        <td><span class="badge ${statusBadgeClass[t.status] || ""}">${t.status}</span></td>
        <td>${t.pendingMonths.length ? '<div class="month-list">' + t.pendingMonths.map((m) => `<span class="month-chip">${m}</span>`).join("") + "</div>" : "—"}</td>
        <td class="text-right"><span class="${t.outstanding > 0 ? "outstanding-amount" : ""}">${t.outstanding > 0 ? formatOutstandingAmount(t.outstanding) : "—"}</span></td>
      </tr>`).join("");
    } else if (base === "payments") {
      thead.innerHTML = `<tr><th>Date</th><th>Tenant</th><th>Unit</th><th>Estate</th><th class="text-right">Amount (UGX)</th><th>Method</th><th>Receipt No.</th><th>Months Covered</th></tr>`;
      tbody.innerHTML = rows.map((p) => `<tr>
        <td>${formatStatementDate(p.date)}</td>
        <td>${p.tenantName}</td>
        <td><span class="house-number">${p.unit}</span></td>
        <td><span class="estate-name">${escapeHtml(estateShortName(p.estate))}</span></td>
        <td class="text-right amount">${formatNumber(p.amount)}</td>
        <td><span class="method-cell">${methodIcons[p.method] || ""}${p.method}</span></td>
        <td>${escapeHtml(formatReceiptNumber(p.receiptNo))}</td>
        <td>${p.monthsCovered}</td>
      </tr>`).join("");
    } else {
      thead.innerHTML = `<tr><th>Receipt No.</th><th>Tenant</th><th>Phone</th><th class="text-right">Amount (UGX)</th><th>Months Covered</th><th>Date</th><th>Email</th><th>SMS</th><th>Reference</th></tr>`;
      tbody.innerHTML = rows.map((r) => `<tr>
        <td><span class="receipt-no">${escapeHtml(formatReceiptNumber(r.receiptNo))}</span></td>
        <td>${r.tenantName}</td>
        <td><span class="phone-number">${formatPhone(r.phone)}</span></td>
        <td class="text-right amount">${formatNumber(r.amount)}</td>
        <td>${r.monthsCovered}</td>
        <td>${formatStatementDate(r.date)}</td>
        <td><span class="status-pill status-pill--${r.email}">${statusLabels[r.email] || r.email}</span></td>
        <td><span class="status-pill status-pill--${r.sms}">${statusLabels[r.sms] || r.sms}</span></td>
        <td>${r.paymentRef || "—"}</td>
      </tr>`).join("");
    }
  }

  function crRunFilters(state) {
    if (state.base === "tenants") return crFilterTenants(state);
    if (state.base === "receipts") return crFilterReceipts(state);
    return crFilterPayments(state);
  }

  function crViewReport(entry) {
    if (!entry) return;
    crActiveViewId = entry.id;
    const rows = crRunFilters(entry.state);
    const panel = document.getElementById("crViewPanel");
    const title = document.getElementById("crViewTitle");
    const meta = document.getElementById("crViewMeta");
    const when = new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    title.textContent = entry.name;
    meta.textContent = `${entry.description || ""} · ${when} · ${rows.length} row${rows.length === 1 ? "" : "s"}`;
    panel.hidden = false;
    crRenderReportTable(entry.state.base, rows);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    crRenderSavedList();
  }

  function generateCustomReport() {
    const nameInput = document.getElementById("crReportName");
    const name = nameInput?.value.trim() || "";
    nameInput?.classList.toggle("cr-filter__input--error", !name);
    if (!name) {
      nameInput?.focus();
      return;
    }
    nameInput.classList.remove("cr-filter__input--error");

    const state = crGetFilterState();
    const rows = crRunFilters(state);
    const entry = {
      id: String(Date.now()),
      name,
      state,
      rowCount: rows.length,
      timestamp: new Date().toISOString(),
      description: crDescribeFilters(state),
    };

    const saved = crLoadJson(CR_SAVED_KEY);
    saved.unshift(entry);
    crSaveJson(CR_SAVED_KEY, saved);
    crRenderSavedList();
    crViewReport(entry);
  }

  function crDescribeFilters(state) {
    const parts = [state.base.charAt(0).toUpperCase() + state.base.slice(1)];
    if (state.estate) parts.push("estate: " + state.estate.split(",").map(estateShortName).join(", "));
    if (state.tenantName) parts.push("name: " + state.tenantName);
    if (state.year) parts.push("year: " + state.year);
    if (state.status) parts.push("status: " + state.status);
    return parts.join(" | ");
  }

  function crLoadJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  }
  function crSaveJson(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  }

  function crDayKey(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function crDayLabel(key) {
    const todayKey = crDayKey(new Date().toISOString());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = crDayKey(yesterday.toISOString());
    if (key === todayKey) return "Today";
    if (key === yesterdayKey) return "Yesterday";
    const d = new Date(`${key}T12:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  function crRenderSavedList() {
    const list = document.getElementById("crSavedList");
    if (!list) return;
    const saved = crLoadJson(CR_SAVED_KEY);
    if (!saved.length) {
      list.innerHTML = '<p class="cr-empty-msg">No reports yet. Name your report, set filters, and click Generate.</p>';
      return;
    }

    const byDay = {};
    saved.forEach((entry) => {
      const key = crDayKey(entry.timestamp);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(entry);
    });

    const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
    list.innerHTML = days.map((dayKey) => {
      const entries = byDay[dayKey];
      const rows = entries.map((entry) => {
        const d = new Date(entry.timestamp);
        const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const isActive = entry.id === crActiveViewId;
        return `
        <div class="cr-list-row${isActive ? " cr-list-row--active" : ""}">
          <div class="cr-list-row__info">
            <span class="cr-list-row__name">${escapeHtml(entry.name)}</span>
            <span class="cr-list-row__meta">${time} · ${entry.rowCount} row${entry.rowCount === 1 ? "" : "s"} · ${escapeHtml(entry.description || "")}</span>
          </div>
          <div class="cr-list-row__actions">
            <button type="button" class="draft-action draft-action--approve" data-cr-view="${escapeHtml(entry.id)}">View</button>
            <button type="button" class="draft-action draft-action--edit" data-cr-load="${escapeHtml(entry.id)}">Load</button>
            <button type="button" class="draft-action draft-action--reject" data-cr-delete="${escapeHtml(entry.id)}">Delete</button>
          </div>
        </div>`;
      }).join("");
      return `
        <div class="cr-day-group">
          <h3 class="cr-day-group__label">${escapeHtml(crDayLabel(dayKey))}</h3>
          ${rows}
        </div>`;
    }).join("");
  }

  function crFindSavedEntry(id) {
    return crLoadJson(CR_SAVED_KEY).find((entry) => entry.id === id);
  }

  function initCustomReportsOnce() {
    if (customReportsInitialized || !apiLoaded) return;
    customReportsInitialized = true;

    const estates = [...new Set(customReportTenants.map((t) => t.estate))].sort();
    const units = [...new Set(customReportTenants.map((t) => t.house))].sort();

    crMultiSelects.estate = initMultiSelect(
      { container: document.getElementById("crEstateSelect"), trigger: document.getElementById("crEstateTrigger"), menu: document.getElementById("crEstateMenu"), display: document.getElementById("crEstateDisplay"), hidden: document.getElementById("crEstate") },
      estates.map((e) => ({ value: e, label: estateShortName(e) })), "All estates"
    );

    const monthItems = MONTHS.map((m) => ({ value: m, label: m }));
    crMultiSelects.pending = initMultiSelect(
      { container: document.getElementById("crPendingSelect"), trigger: document.getElementById("crPendingTrigger"), menu: document.getElementById("crPendingMenu"), display: document.getElementById("crPendingDisplay"), hidden: document.getElementById("crPending") },
      monthItems, "All months"
    );

    const coveredItems = MONTHS_SHORT.map((m) => ({ value: m, label: m }));
    crMultiSelects.covered = initMultiSelect(
      { container: document.getElementById("crCoveredSelect"), trigger: document.getElementById("crCoveredTrigger"), menu: document.getElementById("crCoveredMenu"), display: document.getElementById("crCoveredDisplay"), hidden: document.getElementById("crCovered") },
      coveredItems, "All months"
    );

    const unitMenu = document.getElementById("crUnitMenu");
    units.forEach((u) => addOutstandingFilterOption(unitMenu, u, u));

    crSingleSelects.base = initCustomSelect({ container: document.getElementById("crBaseSelect"), trigger: document.getElementById("crBaseTrigger"), menu: document.getElementById("crBaseMenu"), display: document.getElementById("crBaseDisplay"), hidden: document.getElementById("crBase") });
    crSingleSelects.unit = initCustomSelect({ container: document.getElementById("crUnitSelect"), trigger: document.getElementById("crUnitTrigger"), menu: document.getElementById("crUnitMenu"), display: document.getElementById("crUnitDisplay"), hidden: document.getElementById("crUnit") });
    crSingleSelects.year = initCustomSelect({ container: document.getElementById("crYearSelect"), trigger: document.getElementById("crYearTrigger"), menu: document.getElementById("crYearMenu"), display: document.getElementById("crYearDisplay"), hidden: document.getElementById("crYear") });
    crSingleSelects.security = initCustomSelect({ container: document.getElementById("crSecuritySelect"), trigger: document.getElementById("crSecurityTrigger"), menu: document.getElementById("crSecurityMenu"), display: document.getElementById("crSecurityDisplay"), hidden: document.getElementById("crSecurity") });
    crSingleSelects.method = initCustomSelect({ container: document.getElementById("crMethodSelect"), trigger: document.getElementById("crMethodTrigger"), menu: document.getElementById("crMethodMenu"), display: document.getElementById("crMethodDisplay"), hidden: document.getElementById("crMethod") });
    crSingleSelects.status = initCustomSelect({ container: document.getElementById("crStatusSelect"), trigger: document.getElementById("crStatusTrigger"), menu: document.getElementById("crStatusMenu"), display: document.getElementById("crStatusDisplay"), hidden: document.getElementById("crStatus") });
    crSingleSelects.delivery = initCustomSelect({ container: document.getElementById("crDeliverySelect"), trigger: document.getElementById("crDeliveryTrigger"), menu: document.getElementById("crDeliveryMenu"), display: document.getElementById("crDeliveryDisplay"), hidden: document.getElementById("crDelivery") });
    crSingleSelects.outstandingOp = initCustomSelect({ container: document.getElementById("crOutstandingOpSelect"), trigger: document.getElementById("crOutstandingOpTrigger"), menu: document.getElementById("crOutstandingOpMenu"), display: document.getElementById("crOutstandingOpDisplay"), hidden: document.getElementById("crOutstandingOp") });

    crDatePickers.start = initDatePicker({
      picker: document.getElementById("crDateStartPicker"),
      trigger: document.getElementById("crDateStartTrigger"),
      popover: document.getElementById("crDateStartPopover"),
      display: document.getElementById("crDateStartDisplay"),
      hidden: document.getElementById("crDateStart"),
      field: document.getElementById("crDateStartField"),
      monthLabel: document.getElementById("crDateStartMonthLabel"),
      grid: document.getElementById("crDateStartGrid"),
      prevBtn: document.getElementById("crDateStartPrev"),
      nextBtn: document.getElementById("crDateStartNext"),
      todayBtn: document.getElementById("crDateStartToday"),
      cancelBtn: document.getElementById("crDateStartCancel"),
      applyBtn: document.getElementById("crDateStartApply"),
      initialDate: new Date(),
      emptyLabel: "Select date",
    });

    crDatePickers.end = initDatePicker({
      picker: document.getElementById("crDateEndPicker"),
      trigger: document.getElementById("crDateEndTrigger"),
      popover: document.getElementById("crDateEndPopover"),
      display: document.getElementById("crDateEndDisplay"),
      hidden: document.getElementById("crDateEnd"),
      field: document.getElementById("crDateEndField"),
      monthLabel: document.getElementById("crDateEndMonthLabel"),
      grid: document.getElementById("crDateEndGrid"),
      prevBtn: document.getElementById("crDateEndPrev"),
      nextBtn: document.getElementById("crDateEndNext"),
      todayBtn: document.getElementById("crDateEndToday"),
      cancelBtn: document.getElementById("crDateEndCancel"),
      applyBtn: document.getElementById("crDateEndApply"),
      initialDate: new Date(),
      emptyLabel: "Select date",
    });

    document.getElementById("crGenerateBtn")?.addEventListener("click", generateCustomReport);
    document.getElementById("crClearBtn")?.addEventListener("click", () => {
      crClearFilters();
      const nameInput = document.getElementById("crReportName");
      if (nameInput) {
        nameInput.value = "";
        nameInput.classList.remove("cr-filter__input--error");
      }
    });

    document.querySelectorAll(".cr-quick-date").forEach((btn) => {
      btn.addEventListener("click", () => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        if (btn.dataset.range === "this-month") {
          crDatePickers.start?.setDate(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
          crDatePickers.end?.setDate(toISO(now));
        } else if (btn.dataset.range === "last-month") {
          crDatePickers.start?.setDate(toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
          crDatePickers.end?.setDate(toISO(new Date(now.getFullYear(), now.getMonth(), 0)));
        } else if (btn.dataset.range === "ytd") {
          crDatePickers.start?.setDate(toISO(new Date(now.getFullYear(), 0, 1)));
          crDatePickers.end?.setDate(toISO(now));
        }
      });
    });

    document.getElementById("crSavedList")?.addEventListener("click", (e) => {
      const viewBtn = e.target.closest("[data-cr-view]");
      const loadBtn = e.target.closest("[data-cr-load]");
      const delBtn = e.target.closest("[data-cr-delete]");
      if (viewBtn) {
        const entry = crFindSavedEntry(viewBtn.dataset.crView);
        if (entry) crViewReport(entry);
      }
      if (loadBtn) {
        const entry = crFindSavedEntry(loadBtn.dataset.crLoad);
        if (entry) {
          crApplyFilterState(entry.state);
          const nameInput = document.getElementById("crReportName");
          if (nameInput) nameInput.value = entry.name;
        }
      }
      if (delBtn) {
        const id = delBtn.dataset.crDelete;
        const saved = crLoadJson(CR_SAVED_KEY).filter((entry) => entry.id !== id);
        crSaveJson(CR_SAVED_KEY, saved);
        if (crActiveViewId === id) {
          document.getElementById("crViewPanel").hidden = true;
          crActiveViewId = null;
        }
        crRenderSavedList();
      }
    });

    document.getElementById("crViewClose")?.addEventListener("click", () => {
      document.getElementById("crViewPanel").hidden = true;
      crActiveViewId = null;
      crRenderSavedList();
    });

    crRenderSavedList();
  }

  /* ── Custom Select ── */

  initCustomSelect({
    container: document.getElementById("paymentMethodSelect"),
    trigger: document.getElementById("paymentMethodTrigger"),
    menu: document.getElementById("paymentMethodMenu"),
    display: document.getElementById("paymentMethodDisplay"),
    hidden: document.getElementById("paymentMethod"),
  });

  /* ── Monthly Collection Summary ── */

  const MC_MONTHS_FULL = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  let mcInitialized = false;
  let mcSelectedYear = String(new Date().getFullYear());
  let mcDrillMonth = null; // 0-11 or null
  let mcDrillEstate = null;
  let mcYearOptionsSig = "";
  let mcTxnSortKey = "date";
  let mcTxnSortDirection = "desc";
  let mcTxnSortInitialized = false;

  const mcTxnSortLabels = {
    date: "date",
    tenant: "tenant",
    unit: "unit",
    amount: "amount",
    method: "method",
    receipt: "receipt",
  };

  function mcTxnSortValue(payment, key) {
    if (key === "date") return payment.dateMs || 0;
    if (key === "amount") return payment.amount || 0;
    return payment[key] ?? "";
  }

  function compareMcTransactions(a, b) {
    const aValue = mcTxnSortValue(a, mcTxnSortKey);
    const bValue = mcTxnSortValue(b, mcTxnSortKey);
    const comparison = typeof aValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), "en", { numeric: true });
    const directionalComparison = mcTxnSortDirection === "desc" ? -comparison : comparison;
    return directionalComparison || String(a.tenant).localeCompare(String(b.tenant), "en");
  }

  function updateMcTxnSortUI() {
    document.querySelectorAll(".mc-column-sort").forEach((button) => {
      const isActive = button.dataset.sortKey === mcTxnSortKey;
      const direction = mcTxnSortDirection === "asc" ? "ascending" : "descending";
      const icon = button.querySelector(".material-symbols-outlined");
      const header = button.closest("th");
      if (icon) icon.textContent = isActive ? (mcTxnSortDirection === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";
      button.setAttribute("aria-label", `Sort by ${mcTxnSortLabels[button.dataset.sortKey] || button.dataset.sortKey} ${isActive ? direction : "ascending"}`);
      button.setAttribute("aria-pressed", String(isActive));
      header?.setAttribute("aria-sort", isActive ? direction : "none");
    });
  }

  function initMcTxnSortOnce() {
    if (mcTxnSortInitialized) return;
    const breakdown = document.getElementById("mcEstateBreakdown");
    if (!breakdown) return;
    mcTxnSortInitialized = true;
    breakdown.addEventListener("click", (event) => {
      const button = event.target.closest(".mc-column-sort");
      if (!button || !breakdown.contains(button)) return;
      const nextSortKey = button.dataset.sortKey;
      if (nextSortKey === mcTxnSortKey) {
        mcTxnSortDirection = mcTxnSortDirection === "asc" ? "desc" : "asc";
      } else {
        mcTxnSortKey = nextSortKey;
        mcTxnSortDirection = nextSortKey === "date" || nextSortKey === "amount" ? "desc" : "asc";
      }
      renderMonthlyCollection();
    });
  }

  function mcFormatUgx(n) {
    return `UGX ${Number(n || 0).toLocaleString("en-UG")}`;
  }

  function mcCompact(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return `${v % 1 === 0 ? v : v.toFixed(1)}M`;
    }
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  }

  function mcReceipt(value) {
    return formatReceiptNumber(value);
  }

  function mcParseDate(value) {
    if (!value) return null;
    let d;
    if (value instanceof Date) {
      d = value;
    } else {
      const s = String(value).trim();
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      else d = new Date(s);
    }
    if (!d || isNaN(d.getTime())) return null;
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      display: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.getTime(),
    };
  }

  let rawPaymentsCache = [];
  let rawReceiptsCache = [];

  async function fetchRawPayments() {
    try {
      rawPaymentsCache = await RentLedgerApi.get("/api/payments/raw");
    } catch {
      rawPaymentsCache = [];
    }
  }

  async function fetchRawReceipts() {
    try {
      rawReceiptsCache = await RentLedgerApi.get("/api/receipts/raw");
    } catch {
      rawReceiptsCache = [];
    }
  }

  function formatReportMonths(value) {
    if (!value || value === "—") return "—";
    return String(value).split(",").map((month) => {
      const normalized = month.trim();
      if (!/^\d{4}-\d{2}$/.test(normalized)) return normalized;
      const date = new Date(`${normalized}-01T12:00:00`);
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }).join(", ");
  }

  function refreshCustomReportData() {
    const balancesByTenant = new Map(outstandingBalances.map((balance) => [balance.id, balance]));
    customReportTenants = tenants.map((tenant) => {
      const balance = balancesByTenant.get(tenant.id);
      return {
        ...tenant,
        pendingMonths: balance?.pendingMonths || [],
        outstanding: balance?.outstanding || 0,
      };
    });
    customReportPayments = rawPaymentsCache.map((payment) => ({
      ...payment,
      amount: Number(payment.amount) || 0,
      monthsCovered: formatReportMonths(payment.monthsCovered),
    }));
    customReportReceipts = rawReceiptsCache.map((receipt) => ({
      ...receipt,
      amount: Number(receipt.amount) || 0,
      monthsCovered: formatReportMonths(receipt.monthsCovered),
      email: String(receipt.emailStatus || "pending").toLowerCase(),
      sms: String(receipt.smsStatus || "pending").toLowerCase(),
    }));
  }

  function getCollectionPayments() {
    const raw = rawPaymentsCache;

    return raw
      .map((r) => {
        const parsed = mcParseDate(r.date);
        if (!parsed) return null;
        const amount = Number(String(r.amount).replace(/[^\d.-]/g, "")) || 0;
        return {
          year: parsed.year,
          month: parsed.month,
          display: parsed.display,
          dateMs: parsed.time,
          estate: r.estate || "Unassigned",
          amount,
          tenant: r.tenantName || r.tenant || "",
          unit: r.unit || "",
          method: r.method || "",
          receipt: mcReceipt(r.receiptNo || r.receipt),
        };
      })
      .filter((p) => p && p.amount > 0);
  }

  function renderDashYearCollected(allPayments) {
    // The backend owns this figure (/api/dashboard); only fall back to a
    // client-side estimate before the summary has loaded.
    if (dashboardSummary) return;
    const currentYear = new Date().getFullYear();
    const total = allPayments
      .filter((p) => p.year === currentYear)
      .reduce((sum, p) => sum + p.amount, 0);
    const valueEl = document.getElementById("dashYearCollected");
    const labelEl = document.getElementById("dashYearCollectedLabel");
    if (valueEl) valueEl.textContent = mcFormatUgx(total);
    if (labelEl) labelEl.textContent = `Total Collected in ${currentYear}`;
  }

  function mcIsFutureMonth(year, monthIndex) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    if (year > currentYear) return true;
    if (year < currentYear) return false;
    return monthIndex > currentMonth;
  }

  function mcResolveSelectedMonth(year, yearPayments) {
    if (mcDrillMonth !== null && !mcIsFutureMonth(year, mcDrillMonth)) {
      return mcDrillMonth;
    }

    const now = new Date();
    if (year === now.getFullYear()) return now.getMonth();

    let latest = -1;
    yearPayments.forEach((p) => {
      if (p.month > latest) latest = p.month;
    });
    return latest >= 0 ? latest : 11;
  }

  function initMonthlyCollectionOnce() {
    if (mcInitialized) return;
    mcInitialized = true;

    const yearHidden = document.getElementById("mcYear");
    yearHidden?.addEventListener("change", () => {
      mcSelectedYear = yearHidden.value || mcSelectedYear;
      mcDrillMonth = null;
      mcDrillEstate = null;
      renderMonthlyCollection();
    });

  }

  function mcSyncYearOptions(allPayments) {
    const years = new Set(allPayments.map((p) => p.year));
    years.add(new Date().getFullYear());
    years.add(Number(mcSelectedYear));
    const sorted = [...years].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
    const sig = sorted.join(",");
    if (sig === mcYearOptionsSig) return;
    mcYearOptionsSig = sig;

    const menu = document.getElementById("mcYearMenu");
    if (!menu) return;
    menu.innerHTML = sorted
      .map((y) => {
        const selected = String(y) === mcSelectedYear;
        return `<li class="custom-select__option${selected ? " custom-select__option--selected" : ""}" role="option" data-value="${y}" data-label="${y}" aria-selected="${selected}">${y}</li>`;
      })
      .join("");

    initCustomSelect({
      container: document.getElementById("mcYearSelect"),
      trigger: document.getElementById("mcYearTrigger"),
      menu,
      display: document.getElementById("mcYearDisplay"),
      hidden: document.getElementById("mcYear"),
    });

    const display = document.getElementById("mcYearDisplay");
    if (display) display.textContent = mcSelectedYear;
    const hidden = document.getElementById("mcYear");
    if (hidden) hidden.value = mcSelectedYear;
  }

  function renderMonthlyCollection() {
    if (!document.getElementById("view-monthly-collection")) return;

    const allPayments = getCollectionPayments();
    mcSyncYearOptions(allPayments);
    renderDashYearCollected(allPayments);

    const year = Number(mcSelectedYear);
    const yearPayments = allPayments.filter((p) => p.year === year);

    mcDrillMonth = mcResolveSelectedMonth(year, yearPayments);

    renderMcMonthCards(yearPayments, year);
    renderMcMonthDrill(yearPayments, year);
    renderMcAnnual(yearPayments, year);
  }

  function renderMcMonthCards(yearPayments, year) {
    const container = document.getElementById("mcMonthCards");
    if (!container) return;

    const totals = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    yearPayments.forEach((p) => {
      totals[p.month] += p.amount;
      counts[p.month] += 1;
    });

    const now = new Date();
    container.innerHTML = MC_MONTHS_FULL.map((name, i) => {
      const isCurrent = year === now.getFullYear() && i === now.getMonth();
      const isFuture = mcIsFutureMonth(year, i);
      const isSelected = mcDrillMonth === i;
      const hasData = counts[i] > 0;
      return `
        <button type="button"
          class="mc-month-card${isCurrent ? " mc-month-card--current" : ""}${isSelected ? " mc-month-card--selected" : ""}${isFuture ? " mc-month-card--future" : ""}${hasData ? "" : " mc-month-card--empty"}"
          data-mc-month="${i}"
          ${isFuture ? "disabled aria-disabled=\"true\"" : ""}>
          <span class="mc-month-card__name">${name} ${year}</span>
          <span class="mc-month-card__total">${mcFormatUgx(totals[i])}</span>
          <span class="mc-month-card__meta">${counts[i]} payment${counts[i] === 1 ? "" : "s"}</span>
        </button>`;
    }).join("");

    container.querySelectorAll(".mc-month-card:not([disabled])").forEach((card) => {
      card.addEventListener("click", () => {
        mcDrillMonth = Number(card.dataset.mcMonth);
        mcDrillEstate = null;
        renderMonthlyCollection();
      });
    });
  }

  function mcRenderEstateDetail(estate, txns) {
    const detailTotal = txns.reduce((sum, p) => sum + p.amount, 0);
    return `
      <section class="mc-estate-detail" id="mcEstateDetail" aria-label="${escapeHtml(estateShortName(estate))} payment breakdown">
        <div class="mc-estate-detail__header">
          <div>
            <h3 class="mc-estate-detail__title">${escapeHtml(estateShortName(estate))}</h3>
            <p class="mc-estate-detail__meta">${txns.length} payment${txns.length === 1 ? "" : "s"} · ${mcFormatUgx(detailTotal)}</p>
          </div>
          <button type="button" class="mc-estate-detail__collapse" data-mc-estate-collapse>
            <span class="material-symbols-outlined">expand_less</span>
            Collapse
          </button>
        </div>
        <div class="table-wrap">
          <table class="payments-table mc-transactions-table">
            <thead>
              <tr>
                <th aria-sort="descending"><button type="button" class="outstanding-column-sort mc-column-sort" data-sort-key="date"><span>Date</span><span class="material-symbols-outlined">arrow_downward</span></button></th>
                <th aria-sort="none"><button type="button" class="outstanding-column-sort mc-column-sort" data-sort-key="tenant"><span>Tenant</span><span class="material-symbols-outlined">unfold_more</span></button></th>
                <th aria-sort="none"><button type="button" class="outstanding-column-sort mc-column-sort" data-sort-key="unit"><span>Unit</span><span class="material-symbols-outlined">unfold_more</span></button></th>
                <th class="text-right" aria-sort="none"><button type="button" class="outstanding-column-sort outstanding-column-sort--right mc-column-sort" data-sort-key="amount"><span>Amount</span><span class="material-symbols-outlined">unfold_more</span></button></th>
                <th aria-sort="none"><button type="button" class="outstanding-column-sort mc-column-sort" data-sort-key="method"><span>Method</span><span class="material-symbols-outlined">unfold_more</span></button></th>
                <th aria-sort="none"><button type="button" class="outstanding-column-sort mc-column-sort" data-sort-key="receipt"><span>Receipt</span><span class="material-symbols-outlined">unfold_more</span></button></th>
              </tr>
            </thead>
            <tbody>
              ${txns
                .map(
                  (p) => `
                  <tr>
                    <td>${escapeHtml(p.display)}</td>
                    <td>${escapeHtml(p.tenant || "—")}</td>
                    <td>${escapeHtml(p.unit || "—")}</td>
                    <td class="text-right amount">${Number(p.amount).toLocaleString("en-UG")}</td>
                    <td><span class="method-cell">${methodIcons[p.method] || ""}${escapeHtml(p.method || "—")}</span></td>
                    <td>${escapeHtml(p.receipt || "—")}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderMcMonthDrill(yearPayments, year) {
    const month = mcDrillMonth;
    const monthPayments = yearPayments.filter((p) => p.month === month);
    const total = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    const byEstate = {};
    monthPayments.forEach((p) => {
      const key = p.estate || "Unassigned";
      if (!byEstate[key]) byEstate[key] = { estate: key, total: 0, count: 0 };
      byEstate[key].total += p.amount;
      byEstate[key].count += 1;
    });
    const estates = Object.values(byEstate).sort((a, b) => b.total - a.total);

    document.getElementById("mcMonthDrillTitle").textContent = `${MC_MONTHS_FULL[month]} ${year}`;
    document.getElementById("mcMonthDrillTotal").textContent = mcFormatUgx(total);
    document.getElementById("mcMonthDrillMeta").textContent =
      `collected across ${estates.length} estate${estates.length === 1 ? "" : "s"}`;

    const uniqueTenantsPaid = new Set(monthPayments.map((p) => p.tenant).filter(Boolean)).size;
    const activeTenants = tenants.filter(isTenantOperationallyActive).length;
    const tenantsPaidLabel = document.getElementById("mcTenantsPaidLabel");
    const tenantsPaidValue = document.getElementById("mcTenantsPaid");
    const tenantsPaidMeta = document.getElementById("mcTenantsPaidMeta");

    if (tenantsPaidLabel) tenantsPaidLabel.textContent = "Tenants Paid";
    if (tenantsPaidValue) tenantsPaidValue.textContent = String(uniqueTenantsPaid);

    if (tenantsPaidMeta) {
      if (!monthPayments.length) {
        tenantsPaidMeta.textContent = "No payments recorded this month";
      } else if (activeTenants) {
        const unpaid = Math.max(0, activeTenants - uniqueTenantsPaid);
        tenantsPaidMeta.textContent = unpaid
          ? `${unpaid} active tenant${unpaid === 1 ? "" : "s"} yet to pay`
          : "All active tenants paid this month";
      } else {
        tenantsPaidMeta.textContent = `${uniqueTenantsPaid} unique tenant${uniqueTenantsPaid === 1 ? "" : "s"} paid`;
      }
    }

    const breakdown = document.getElementById("mcEstateBreakdown");
    if (!estates.length) {
      breakdown.innerHTML = `<div class="mc-empty"><span class="material-symbols-outlined">savings</span>No payments posted in ${MC_MONTHS_FULL[month]} ${year}.</div>`;
    } else {
      breakdown.innerHTML = estates
        .map((e) => {
          const pct = total > 0 ? Math.round((e.total / total) * 100) : 0;
          const isExpanded = mcDrillEstate === e.estate;
          const estatePayments = isExpanded
            ? monthPayments.filter((p) => (p.estate || "Unassigned") === e.estate).sort(compareMcTransactions)
            : [];
          return `
            <article class="mc-estate-item${isExpanded ? " mc-estate-item--expanded" : ""}">
              <button type="button" class="mc-estate-row" data-mc-estate="${escapeHtml(e.estate)}" aria-expanded="${isExpanded}">
                <div class="mc-estate-row__top">
                  <span class="mc-estate-row__name">${escapeHtml(estateShortName(e.estate))}</span>
                  <span class="mc-estate-row__amount">${mcFormatUgx(e.total)}</span>
                </div>
                <div class="mc-estate-row__bar"><div class="mc-estate-row__bar-fill" style="width:${pct}%"></div></div>
                <div class="mc-estate-row__meta"><span>${pct}% of month</span><span>${e.count} payment${e.count === 1 ? "" : "s"}</span></div>
              </button>
              ${isExpanded ? mcRenderEstateDetail(e.estate, estatePayments) : ""}
            </article>`;
        })
        .join("");

      breakdown.querySelectorAll(".mc-estate-row").forEach((row) => {
        row.addEventListener("click", () => {
          mcDrillEstate = mcDrillEstate === row.dataset.mcEstate ? null : row.dataset.mcEstate;
          renderMonthlyCollection();
        });
      });

      breakdown.querySelectorAll("[data-mc-estate-collapse]").forEach((button) => {
        button.addEventListener("click", () => {
          mcDrillEstate = null;
          renderMonthlyCollection();
        });
      });

      if (mcDrillEstate) {
        initMcTxnSortOnce();
        updateMcTxnSortUI();
      }
    }
  }

  function renderMcAnnual(yearPayments, year) {
    const titleEl = document.getElementById("mcAnnualTitle");
    if (titleEl) titleEl.textContent = `${year} Year Breakdown`;

    const body = document.getElementById("mcAnnualGridBody");
    if (!body) return;

    const estatesMap = {};
    yearPayments.forEach((p) => {
      const key = p.estate || "Unassigned";
      if (!estatesMap[key]) estatesMap[key] = new Array(12).fill(0);
      estatesMap[key][p.month] += p.amount;
    });

    const estateNames = Object.keys(estatesMap).sort((a, b) => a.localeCompare(b));
    if (!estateNames.length) {
      body.innerHTML = `<tr class="mc-annual-grid__empty-row"><td colspan="14">No payments posted in ${year} yet.</td></tr>`;
      return;
    }

    const colTotals = new Array(12).fill(0);
    let grand = 0;

    const cell = (value) =>
      `<td title="${mcFormatUgx(value)}">${value ? mcCompact(value) : "—"}</td>`;

    const rows = estateNames
      .map((name) => {
        const cells = estatesMap[name];
        const rowTotal = cells.reduce((a, b) => a + b, 0);
        cells.forEach((c, i) => {
          colTotals[i] += c;
        });
        grand += rowTotal;
        return `
          <tr>
            <td class="mc-annual-grid__estate-col">${escapeHtml(estateShortName(name))}</td>
            ${cells.map(cell).join("")}
            <td class="mc-annual-grid__year-col" title="${mcFormatUgx(rowTotal)}">${mcCompact(rowTotal)}</td>
          </tr>`;
      })
      .join("");

    const totalRow = `
      <tr class="mc-annual-grid__total-row">
        <td class="mc-annual-grid__estate-col">Total</td>
        ${colTotals
          .map((c) => `<td title="${mcFormatUgx(c)}">${c ? mcCompact(c) : "—"}</td>`)
          .join("")}
        <td class="mc-annual-grid__year-col" title="${mcFormatUgx(grand)}">${mcCompact(grand)}</td>
      </tr>`;

    body.innerHTML = rows + totalRow;
  }

  function initCustomSelect(els) {
    if (!els.container || !els.menu) return;

    if (els.container.__rentLedgerCustomSelect) {
      return els.container.__rentLedgerCustomSelect;
    }

    const refs = { ...els };
    let isOpen = false;

    function getOptions() {
      return [...refs.menu.querySelectorAll(".custom-select__option")];
    }

    function close() {
      refs.menu.hidden = true;
      refs.trigger.setAttribute("aria-expanded", "false");
      isOpen = false;
    }

    function open() {
      if (refs.trigger.disabled) return;
      refs.menu.hidden = false;
      refs.trigger.setAttribute("aria-expanded", "true");
      isOpen = true;
    }

    function syncSelection(value, fallbackLabel) {
      const options = getOptions();
      const option = options.find((item) => item.dataset.value === value);
      options.forEach((opt) => {
        const selected = opt === option;
        opt.classList.toggle("custom-select__option--selected", selected);
        opt.setAttribute("aria-selected", selected ? "true" : "false");
      });

      refs.hidden.value = option ? option.dataset.value : "";
      refs.display.textContent = option?.dataset.triggerLabel || option?.dataset.label || fallbackLabel || "";
    }

    function selectOption(option) {
      if (!option || refs.trigger.disabled || option.getAttribute("aria-disabled") === "true") return;

      const previousValue = refs.hidden.value;
      syncSelection(option.dataset.value, option.dataset.label);
      close();

      if (previousValue !== refs.hidden.value) {
        refs.hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    refs.trigger.addEventListener("click", () => {
      isOpen ? close() : open();
    });

    refs.menu.addEventListener("click", (event) => {
      const option = event.target.closest(".custom-select__option");
      if (option && refs.menu.contains(option)) selectOption(option);
    });

    document.addEventListener("click", (e) => {
      if (isOpen && !refs.container.contains(e.target)) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) close();
    });

    const api = {
      setValue(value) {
        const option = getOptions().find((item) => item.dataset.value === String(value ?? ""));
        if (option) selectOption(option);
      },
      setOptions(options, config = {}) {
        const selectedValue = String(config.value ?? refs.hidden.value ?? "");
        const items = Array.isArray(options) ? options : [];
        refs.menu.innerHTML = items.map((item) => {
          const value = String(item.value ?? "");
          const label = String(item.label ?? value);
          const selected = value === selectedValue;
          const triggerLabel = item.triggerLabel ? ` data-trigger-label="${escapeHtml(item.triggerLabel)}"` : "";
          const disabled = item.disabled ? ' aria-disabled="true"' : "";
          return `<li class="custom-select__option${selected ? " custom-select__option--selected" : ""}" role="option" data-value="${escapeHtml(value)}" data-label="${escapeHtml(label)}"${triggerLabel} aria-selected="${selected ? "true" : "false"}"${disabled}>${escapeHtml(label)}</li>`;
        }).join("");
        refs.trigger.disabled = Boolean(config.disabled);
        syncSelection(selectedValue, items[0]?.label || "");
      },
      setDisabled(disabled) {
        refs.trigger.disabled = Boolean(disabled);
        if (disabled) close();
      },
      refresh() {
        syncSelection(refs.hidden.value, refs.display.textContent);
      },
    };

    els.container.__rentLedgerCustomSelect = api;
    return api;
  }

  // Restore the last-open view (runs after all module data has initialized).
  (function restoreActiveView() {
    let savedView = null;
    try {
      savedView = localStorage.getItem(ACTIVE_VIEW_KEY);
    } catch (_) {}
    if (savedView && views[savedView]) showView(savedView);
  })();
})();
