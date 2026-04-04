(() => {
  if (window.__expenseSplitRuntimeAuthBooted === true) {
    return;
  }
  window.__expenseSplitRuntimeAuthBooted = true;

  const LOGIN_PATHS = new Set(["/login"]);
  const SIGNUP_PATHS = new Set(["/signup", "/register"]);
  const MARKETING_PATHS = new Set(["/", "/features", "/how-it-works", "/pricing", "/about", "/contact"]);
  const DASHBOARD_LIKE_PATHS = new Set(["/dashboard", "/groups", "/activity", "/expenses", "/ai-assistance"]);
  const SETTLE_LAUNCHER_PATHS = new Set(["/dashboard", "/groups", "/activity", "/expenses", "/settle"]);
  const FILTER_CHIP_PATHS = new Set(["/expenses"]);
  const PROTECTED_MATCHERS = [
    /^\/dashboard$/,
    /^\/create-group$/,
    /^\/create-expense$/,
    /^\/settle$/,
    /^\/profile$/,
    /^\/groups$/,
    /^\/expenses$/,
    /^\/activity$/,
    /^\/ai-assistance$/,
    /^\/group\/[^/]+$/,
  ];
  const NAV_ALIASES = {
    "/groups": "/groups",
    "/expenses": "/expenses",
    "/activity": "/expenses",
    "/ai-assistance": "/ai-assistance",
  };
  const PROFILE_PREFS_STORAGE_KEY = "expense_split_profile_prefs_v1";
  const PROFILE_CURRENCY_OPTIONS = [
    { value: "INR", label: "INR - Indian Rupee" },
    { value: "USD", label: "USD - US Dollar" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "GBP", label: "GBP - British Pound" },
    { value: "AED", label: "AED - UAE Dirham" },
    { value: "SGD", label: "SGD - Singapore Dollar" },
    { value: "AUD", label: "AUD - Australian Dollar" },
    { value: "CAD", label: "CAD - Canadian Dollar" },
    { value: "JPY", label: "JPY - Japanese Yen" },
  ];
  const PROFILE_LANGUAGE_OPTIONS = [
    { value: "English", label: "English" },
    { value: "Hindi", label: "Hindi (हिन्दी)" },
    { value: "Bengali", label: "Bengali (বাংলা)" },
    { value: "Tamil", label: "Tamil (தமிழ்)" },
    { value: "Telugu", label: "Telugu (తెలుగు)" },
    { value: "Marathi", label: "Marathi (मराठी)" },
    { value: "Gujarati", label: "Gujarati (ગુજરાતી)" },
    { value: "Kannada", label: "Kannada (ಕನ್ನಡ)" },
    { value: "Malayalam", label: "Malayalam (മലയാളം)" },
    { value: "Punjabi", label: "Punjabi (ਪੰਜਾਬੀ)" },
  ];
  const PROFILE_MOTION_PRESET_OPTIONS = [
    { value: "subtle", label: "Subtle" },
    { value: "cinematic", label: "Cinematic" },
    { value: "dramatic", label: "Dramatic" },
  ];
  const PROFILE_PAYMENT_METHOD_OPTIONS = [
    { type: "upi", name: "UPI" },
    { type: "card", name: "Credit / Debit Card" },
  ];
  const SEARCH_HISTORY_STORAGE_KEY = "expense_split_search_history_v1";
  const SEARCH_HISTORY_LIMIT = 8;
  const ONBOARDING_PROGRESS_STORAGE_KEY = "expense_split_onboarding_progress_v1";
  const ACTIVE_EXPENSE_FILTER_STORAGE_KEY = "expense_split_active_expense_filter_v1";
  const AI_ASSISTANT_DRAFT_STORAGE_KEY = "expense_split_ai_assistant_draft_v1";
  const AI_ASSISTANT_IMPORT_PREFS_STORAGE_KEY = "expense_split_ai_import_prefs_v1";
  const AI_ASSISTANT_SUGGESTIONS = [
    "Create a group called Weekend Trip with John, Sarah, Mike for dinner $150",
    "Make a group Apartment with Tom, Jerry, Lisa for rent $2000 paid by Tom",
    "Start a Road Trip group with Alex, Ben, Chris for gas $80",
    "Create Lunch Buddies with Emma, Olivia for $45 lunch bill",
  ];
  const AI_ASSISTANT_WELCOME_MESSAGE =
    "Hi! I'm your AI assistant. I can create groups and add expenses using natural language.";

  const state = {
    submitBusy: false,
    routeGuardBusy: false,
    routeGuardLastSignature: "",
    routeGuardLastAt: 0,
    routeSyncTimer: null,
    routeSyncLastSignature: "",
    routeSyncLastAt: 0,
    realtimeSource: null,
    realtimeConnected: false,
    realtimeReconnectTimer: null,
    realtimeReconnectDelayMs: 1500,
    realtimeRefreshTimer: null,
    realtimeRefreshInFlight: false,
    realtimeLastRefreshAt: 0,
    realtimeLastMessageAt: 0,
    routeTransitionTimer: null,
    session: null,
    sessionOnboarding: null,
    sessionCheckedAt: 0,
    sessionPromise: null,
    groupsCache: [],
    groupsCheckedAt: 0,
    groupDetails: new Map(),
    actionBusy: new Set(),
    healthCheckedAt: 0,
    lastHealthSignature: "",
    opsCheckedAt: 0,
    lastOpsSignature: "",
    lastAutoscrollPath: "",
    notificationPanelOpen: false,
    notificationItems: [],
    notificationItemsAt: 0,
    notificationEventsBound: false,
    opsLauncherEventsBound: false,
    settleLauncherEventsBound: false,
    paymentMethodsCache: [],
    paymentMethodsCheckedAt: 0,
    motionObserver: null,
    motionRouteSignature: "",
    motionApplyTimer: null,
    motionPreset: "dramatic",
    ambientSceneInstalled: false,
    ambientPointerBound: false,
    ambientPointerFrame: 0,
    ambientPointerX: 0,
    ambientPointerY: 0,
    searchPreviewTimer: null,
    searchPreviewAbort: null,
    searchPreviewQuery: "",
    searchPreviewResults: [],
    searchPreviewAt: 0,
    searchPreviewCache: new Map(),
    savedFilters: [],
    savedFiltersAt: 0,
    opsSnapshot: null,
    opsSnapshotAt: 0,
    settlementCandidatesCache: [],
    settlementCandidatesAt: 0,
    routeSectionFocusPath: "",
    aiAssistantPrompt: "",
    aiAssistantPlan: null,
    aiAssistantPlanPrompt: "",
    aiAssistantTarget: "__new__",
    aiAssistantAllowDuplicates: false,
    aiAssistantImportPrefsLoaded: false,
    aiAssistantOcrBusy: false,
    aiAssistantOcrJobs: [],
    aiAssistantMessages: [],
    aiAssistantPendingPlan: null,
    aiAssistantTyping: false,
    profileAvatarUrl: "",
    profileAvatarKnown: false,
    profileAvatarDirty: false,
  };

  let toastStack = null;

  function normalizePath(pathname) {
    let value = String(pathname || "/").trim();
    const virtualPath =
      typeof window !== "undefined" ? String(window.__EXPENSE_SPLIT_VIRTUAL_PATH || "").trim() : "";
    const bootstrapPath =
      typeof window !== "undefined" ? String(window.__EXPENSE_SPLIT_BOOTSTRAP_PATH || "").trim() : "";
    if (virtualPath && bootstrapPath && value === bootstrapPath) {
      value = virtualPath;
    }
    if (!value) return "/";
    if (value.length > 1 && value.endsWith("/")) {
      return value.slice(0, -1);
    }
    return value;
  }

  function shouldEnableFilterChips(pathname) {
    const path = normalizePath(pathname);
    if (DASHBOARD_LIKE_PATHS.has(path) || FILTER_CHIP_PATHS.has(path)) return true;
    if (path.startsWith("/group/")) return true;
    return false;
  }

  function resolveInternalNavigationPath(target) {
    if (target == null) {
      return normalizePath(window.location.pathname);
    }

    let raw = "";
    if (typeof target === "string") {
      raw = target;
    } else if (target instanceof URL) {
      raw = target.toString();
    } else if (typeof target === "object") {
      const pathname = String(target.pathname || "").trim();
      const search = String(target.search || "").trim();
      const hash = String(target.hash || "").trim();
      raw = pathname ? `${pathname}${search}${hash}` : String(target.href || "");
    }

    if (!raw) return normalizePath(window.location.pathname);

    try {
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) return "";
      return normalizePath(url.pathname);
    } catch {
      return normalizeHrefPath(raw);
    }
  }

  function normalizeHrefPath(href) {
    const value = String(href || "").trim();
    if (!value || value.startsWith("http://") || value.startsWith("https://")) return "";
    if (!value.startsWith("/")) return "";
    const pathOnly = value.split("?")[0].split("#")[0];
    return normalizePath(pathOnly);
  }

  function isProtectedPath(pathname) {
    const path = normalizePath(pathname);
    return PROTECTED_MATCHERS.some((matcher) => matcher.test(path));
  }

  function safeLower(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizedKey(value) {
    return normalizedText(value).toLowerCase();
  }

  function sanitizeAvatarUrl(value) {
    return String(value || "").trim();
  }

  function deriveInitials(name, email = "") {
    const normalizedName = normalizedText(name || "");
    const parts = normalizedName.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    const localPart = normalizedText(String(email || "").split("@")[0] || "");
    if (localPart) {
      return localPart.slice(0, 2).toUpperCase();
    }
    return "U";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeMotionPreset(value) {
    const key = normalizedKey(value || "");
    if (key === "subtle" || key === "cinematic" || key === "dramatic") {
      return key;
    }
    return "dramatic";
  }

  function getMotionProfile(preset = state.motionPreset) {
    const mode = normalizeMotionPreset(preset);
    if (mode === "subtle") {
      return {
        mode,
        maxTilt: 6.1,
        damping: 0.2,
        sheenMultiplier: 16,
        layerDepthMultiplier: 0.62,
        layerWeightMultiplier: 0.72,
        layerMotionScale: 0.62,
        shadowXFactor: -1.35,
        shadowYBase: 17,
        shadowYTiltFactor: 0.62,
        shadowBlurBase: 36,
        shadowBlurFactor: 0.55,
      };
    }
    if (mode === "cinematic") {
      return {
        mode,
        maxTilt: 9.8,
        damping: 0.18,
        sheenMultiplier: 26,
        layerDepthMultiplier: 0.86,
        layerWeightMultiplier: 0.9,
        layerMotionScale: 0.82,
        shadowXFactor: -1.95,
        shadowYBase: 21,
        shadowYTiltFactor: 0.9,
        shadowBlurBase: 46,
        shadowBlurFactor: 0.8,
      };
    }
    return {
      mode: "dramatic",
      maxTilt: 13.5,
      damping: 0.16,
      sheenMultiplier: 36,
      layerDepthMultiplier: 1,
      layerWeightMultiplier: 1,
      layerMotionScale: 1,
      shadowXFactor: -2.4,
      shadowYBase: 24,
      shadowYTiltFactor: 1.1,
      shadowBlurBase: 52,
      shadowBlurFactor: 1.0,
    };
  }

  function getTrigger(target) {
    return target?.closest?.("button, a") || null;
  }

  function getTriggerText(trigger) {
    return normalizedText(trigger?.textContent || "");
  }

  function resolveWorkspaceRouteMode(pathname) {
    const path = normalizePath(pathname);
    if (path === "/dashboard") return "dashboard";
    if (path === "/groups") return "groups";
    if (path === "/activity") return "expenses";
    if (path === "/expenses") return "expenses";
    if (path === "/ai-assistance") return "ai";
    return "";
  }

  function setWorkspaceRouteClass(mode) {
    if (!(document.body instanceof HTMLElement)) return;
    document.body.classList.remove(
      "runtime-route-dashboard",
      "runtime-route-groups",
      "runtime-route-expenses",
      "runtime-route-ai"
    );
    if (mode) {
      document.body.classList.add(`runtime-route-${mode}`);
    }
  }

  function resolveWorkspaceNavKey(node) {
    if (!(node instanceof Element)) return "";
    const hrefPath = normalizeHrefPath(node.getAttribute?.("href") || "");
    if (hrefPath === "/dashboard") {
      return "/dashboard";
    }
    if (hrefPath === "/groups") {
      return "/groups";
    }
    if (hrefPath === "/expenses" || hrefPath === "/activity") {
      return "/expenses";
    }
    if (hrefPath === "/ai-assistance") {
      return "/ai-assistance";
    }
    const label = normalizedKey(node.textContent || "");
    if (label === "dashboard") return "/dashboard";
    if (label === "groups") return "/groups";
    if (label === "expenses" || label === "activity" || label === "expenses & activity") return "/expenses";
    if (label === "ai assistance" || label === "ai assistant") return "/ai-assistance";
    return "";
  }

  function setWorkspaceNavLabel(node, label) {
    if (!(node instanceof HTMLElement)) return;
    const targets = Array.from(node.querySelectorAll("span, p, small, strong, div")).filter(
      (item) => item instanceof HTMLElement
    );
    const textTarget =
      targets.find((item) => {
        const key = normalizedKey(item.textContent || "");
        return key === "expenses" || key === "activity" || key === "expenses & activity";
      }) || null;
    if (textTarget instanceof HTMLElement) {
      textTarget.textContent = label;
      return;
    }

    const textNode = Array.from(node.childNodes)
      .reverse()
      .find((child) => child.nodeType === Node.TEXT_NODE && normalizedText(child.textContent || ""));
    if (textNode) {
      textNode.textContent = label;
      return;
    }

    node.textContent = label;
  }

  function mergeExpensesActivitySectionInNav() {
    const nodes = Array.from(document.querySelectorAll("a[href], button"));
    let expensesNode = null;
    const activityNodes = [];

    for (const node of nodes) {
      const hrefPath = normalizeHrefPath(node.getAttribute?.("href") || "");
      const label = normalizedKey(node.textContent || "");

      const isExpenses =
        hrefPath === "/expenses" || label === "expenses" || label === "expenses & activity";
      const isActivity = hrefPath === "/activity" || label === "activity";

      if (isExpenses && !(expensesNode instanceof HTMLElement) && node instanceof HTMLElement) {
        expensesNode = node;
      }
      if (isActivity && node instanceof HTMLElement) {
        activityNodes.push(node);
      }
    }

    if (expensesNode instanceof HTMLElement) {
      setWorkspaceNavLabel(expensesNode, "Expenses & Activity");
      expensesNode.setAttribute("title", "Expenses & Activity");
      expensesNode.dataset.runtimeMergedExpensesActivity = "1";
      for (const node of activityNodes) {
        if (node === expensesNode) continue;
        node.style.display = "none";
        node.setAttribute("aria-hidden", "true");
        if ("tabIndex" in node) {
          node.tabIndex = -1;
        }
      }
      return;
    }

    if (activityNodes[0] instanceof HTMLElement) {
      const fallback = activityNodes[0];
      setWorkspaceNavLabel(fallback, "Expenses & Activity");
      fallback.dataset.runtimeMergedExpensesActivity = "1";
      if (normalizeHrefPath(fallback.getAttribute?.("href") || "") === "/activity") {
        fallback.setAttribute("href", "/expenses");
      }
      for (const node of activityNodes.slice(1)) {
        node.style.display = "none";
        node.setAttribute("aria-hidden", "true");
        if ("tabIndex" in node) {
          node.tabIndex = -1;
        }
      }
    }
  }

  function ensureAIAssistanceNavLink() {
    const containers = Array.from(document.querySelectorAll("aside nav, nav[aria-label], nav")).filter(
      (node) => node instanceof HTMLElement
    );
    if (!containers.length) return;

    const scoreContainer = (container) => {
      const nodes = Array.from(container.querySelectorAll("a[href], button"));
      let score = nodes.length;
      for (const node of nodes) {
        const key = resolveWorkspaceNavKey(node);
        if (key === "/dashboard") score += 4;
        if (key === "/groups") score += 4;
        if (key === "/expenses") score += 4;
      }
      return score;
    };

    const navContainer = containers
      .slice()
      .sort((left, right) => scoreContainer(right) - scoreContainer(left))[0];
    if (!(navContainer instanceof HTMLElement)) return;

    const isAiNode = (node) => {
      const hrefPath = normalizeHrefPath(node?.getAttribute?.("href") || "");
      const label = normalizedKey(node?.textContent || "");
      return hrefPath === "/ai-assistance" || label === "ai assistance" || label === "ai assistant";
    };

    const setAiIcon = (node) => {
      const iconMarkup = `
        <path d="m12 4 .95 2.7L15.7 7.6 13 8.55l-.9 2.75-.95-2.75L8.4 7.6l2.75-.9L12 4Z" fill="currentColor"/>
        <path d="m18.2 11.2.6 1.7 1.7.55-1.7.6-.6 1.7-.55-1.7-1.7-.6 1.7-.55.55-1.7Z" fill="currentColor" opacity="0.78"/>
        <path d="m7.2 13.2.72 2.06 2.08.7-2.08.72-.72 2.08-.7-2.08-2.06-.72 2.06-.7.7-2.06Z" fill="currentColor" opacity="0.72"/>
      `;
      let iconHost =
        node.querySelector("svg[data-runtime-ai-icon='1']") ||
        node.querySelector("svg") ||
        null;

      if (!(iconHost instanceof SVGElement)) {
        const iconWrapper =
          node.querySelector("[data-icon], [class*='icon']") ||
          node;
        iconHost = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        iconHost.setAttribute("data-runtime-ai-icon", "1");
        iconHost.setAttribute("aria-hidden", "true");
        iconHost.style.flexShrink = "0";

        if (iconWrapper instanceof HTMLElement && iconWrapper !== node) {
          iconWrapper.innerHTML = "";
          iconWrapper.appendChild(iconHost);
        } else {
          const firstElement = node.firstElementChild;
          if (firstElement) {
            node.insertBefore(iconHost, firstElement);
          } else {
            node.appendChild(iconHost);
          }
        }
      }

      const width = iconHost.getAttribute("width") || "18";
      const height = iconHost.getAttribute("height") || "18";
      iconHost.setAttribute("viewBox", "0 0 24 24");
      iconHost.setAttribute("fill", "none");
      iconHost.setAttribute("width", width);
      iconHost.setAttribute("height", height);
      iconHost.innerHTML = iconMarkup;
    };

    const normalizeAiNode = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node instanceof HTMLAnchorElement) {
        node.setAttribute("href", "/ai-assistance");
      } else if (node instanceof HTMLButtonElement) {
        node.setAttribute("type", "button");
        node.dataset.runtimeAiNavigate = "1";
      }
      node.classList.remove("active", "runtime-nav-active");
      node.removeAttribute("aria-current");
      node.dataset.runtimeAiNav = "1";
      node.classList.add("runtime-route-nav-link");
      setWorkspaceNavLabel(node, "AI Assistance");
      setAiIcon(node);
    };

    const allNodesInContainer = Array.from(navContainer.querySelectorAll("a[href], button")).filter(
      (node) => node instanceof HTMLElement
    );
    const expensesAnchor =
      allNodesInContainer.find((node) => {
        const key = resolveWorkspaceNavKey(node);
        return key === "/expenses";
      }) || null;
    const groupsAnchor =
      allNodesInContainer.find((node) => {
        const key = resolveWorkspaceNavKey(node);
        return key === "/groups";
      }) || null;
    const dashboardAnchor =
      allNodesInContainer.find((node) => {
        const key = resolveWorkspaceNavKey(node);
        return key === "/dashboard";
      }) || null;
    const targetAnchor = expensesAnchor || groupsAnchor || dashboardAnchor || allNodesInContainer[0] || null;
    if (!(targetAnchor instanceof HTMLElement)) return;

    let canonicalAiNode = allNodesInContainer.find((node) => isAiNode(node)) || null;
    if (!(canonicalAiNode instanceof HTMLElement)) {
      const clone = targetAnchor.cloneNode(true);
      if (!(clone instanceof HTMLElement)) return;
      normalizeAiNode(clone);

      const targetItem = targetAnchor.closest("li") || targetAnchor;
      if (targetItem instanceof HTMLLIElement) {
        const wrappedClone = targetItem.cloneNode(false);
        if (wrappedClone instanceof HTMLElement) {
          wrappedClone.appendChild(clone);
          targetItem.insertAdjacentElement("afterend", wrappedClone);
          canonicalAiNode = clone;
        }
      }
      if (!(canonicalAiNode instanceof HTMLElement)) {
        targetItem.insertAdjacentElement("afterend", clone);
        canonicalAiNode = clone;
      }
    } else {
      normalizeAiNode(canonicalAiNode);
      const canonicalItem = canonicalAiNode.closest("li") || canonicalAiNode;
      const targetItem = targetAnchor.closest("li") || targetAnchor;
      if (canonicalItem !== targetItem && canonicalItem.previousElementSibling !== targetItem) {
        targetItem.insertAdjacentElement("afterend", canonicalItem);
      }
    }

    const globalAiNodes = containers.flatMap((container) =>
      Array.from(container.querySelectorAll("a[href], button")).filter((node) => node instanceof HTMLElement && isAiNode(node))
    );
    for (const node of globalAiNodes) {
      if (node === canonicalAiNode) continue;
      const item = node.closest("li");
      if (item instanceof HTMLElement) {
        const itemControls = Array.from(item.querySelectorAll("a[href], button")).filter((control) => control instanceof HTMLElement);
        if (itemControls.length <= 1) {
          item.remove();
          continue;
        }
      }
      node.remove();
    }
  }

  function syncWorkspaceNavHighlight() {
    const path = normalizePath(window.location.pathname);
    const navNodes = Array.from(
      document.querySelectorAll("a[href], button")
    );

    for (const node of navNodes) {
      const navKey = resolveWorkspaceNavKey(node);
      if (!navKey) continue;

      const active =
        navKey === "/dashboard"
          ? path === "/dashboard"
          : navKey === "/groups"
          ? path === "/groups"
          : navKey === "/expenses"
            ? path === "/expenses" || path === "/activity"
            : navKey === "/ai-assistance"
              ? path === "/ai-assistance"
            : false;

      node.classList.toggle("active", active);
      node.classList.toggle("runtime-nav-active", active);
      if (active) {
        node.setAttribute("aria-current", "page");
      } else if (node.getAttribute("aria-current") === "page") {
        node.removeAttribute("aria-current");
      }
    }
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function ensureRouteTransitionOverlay() {
    let overlay = document.getElementById("runtime-route-overlay");
    if (overlay instanceof HTMLElement) return overlay;

    overlay = document.createElement("div");
    overlay.id = "runtime-route-overlay";
    overlay.className = "runtime-route-overlay";
    overlay.innerHTML = `
      <div class="runtime-route-overlay-glow"></div>
      <div class="runtime-route-overlay-bar"></div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function beginRouteTransition() {
    if (isReducedMotionPreferred()) return;
    ensureRuntimeMotionStyles();

    const overlay = ensureRouteTransitionOverlay();
    const root = document.getElementById("root");

    if (state.routeTransitionTimer) {
      window.clearTimeout(state.routeTransitionTimer);
      state.routeTransitionTimer = null;
    }

    overlay.classList.add("visible");
    if (root instanceof HTMLElement) {
      root.classList.add("runtime-route-leaving");
    }
  }

  function endRouteTransition() {
    const overlay = document.getElementById("runtime-route-overlay");
    const root = document.getElementById("root");
    if (root instanceof HTMLElement) {
      root.classList.remove("runtime-route-leaving");
    }
    if (!(overlay instanceof HTMLElement)) return;

    overlay.classList.remove("visible");
    if (state.routeTransitionTimer) {
      window.clearTimeout(state.routeTransitionTimer);
    }
    state.routeTransitionTimer = window.setTimeout(() => {
      state.routeTransitionTimer = null;
      overlay.remove();
    }, 260);
  }

  function navigateWithTransition(target, options = {}) {
    const href = String(target || "").trim();
    if (!href) return;

    const delayMs = isReducedMotionPreferred() ? 0 : Math.max(0, Number(options.delayMs || 110));
    beginRouteTransition();
    window.setTimeout(() => {
      window.location.assign(href);
    }, delayMs);
  }

  function ensureToastStyles() {
    if (document.getElementById("expense-split-runtime-toast-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-toast-style";
    style.textContent = `
      html {
        scroll-behavior: smooth;
      }
      @media (prefers-reduced-motion: reduce) {
        html {
          scroll-behavior: auto;
        }
      }
      .runtime-sticky-actions {
        position: sticky;
        top: 0.7rem;
        z-index: 45;
      }
      @media (max-width: 1024px) {
        .runtime-sticky-actions {
          top: 0.5rem;
        }
      }
      .runtime-product-panels {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.9rem;
        margin-bottom: 1rem;
        align-items: stretch;
      }
      .runtime-product-panels.runtime-product-panels-immersive {
        width: 100%;
        max-width: none;
        grid-column: 1 / -1;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        min-height: 0;
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-feature-card {
        min-height: clamp(300px, 52vh, 620px);
        display: flex;
        flex-direction: column;
        background-size: 100% 100%, 165% 165%;
        background-position: 0 0, 36% 18%;
        transition:
          transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1),
          box-shadow 0.24s ease,
          border-color 0.24s ease,
          background-position 0.42s ease;
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-feature-card:hover {
        background-position: 0 0, 72% 26%;
      }
      .runtime-product-panels.runtime-product-panels-immersive > #runtime-saved-filters-card,
      .runtime-product-panels.runtime-product-panels-immersive > #runtime-onboarding-card {
        min-height: clamp(300px, 52vh, 620px);
      }
      .runtime-route-hidden {
        display: none !important;
      }
      .runtime-route-nav-link {
        margin-top: 0.35rem;
      }
      .runtime-nav-active {
        border-color: rgba(14, 165, 233, 0.5) !important;
        box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.28);
        background: rgba(14, 165, 233, 0.14) !important;
        color: #0f172a !important;
      }
      .runtime-motion-nav.runtime-nav-active,
      nav a.runtime-nav-active,
      nav button.runtime-nav-active,
      aside a.runtime-nav-active,
      aside button.runtime-nav-active {
        background: rgba(14, 165, 233, 0.16) !important;
        border-color: rgba(14, 165, 233, 0.58) !important;
        color: #0f172a !important;
      }
      .runtime-section-selected {
        border-color: rgba(14, 165, 233, 0.54) !important;
        box-shadow:
          0 0 0 2px rgba(14, 165, 233, 0.16),
          0 12px 28px rgba(2, 6, 23, 0.14) !important;
      }
      .runtime-recent-activity-scroll {
        max-height: min(64vh, 620px);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(14, 165, 233, 0.6) rgba(148, 163, 184, 0.16);
      }
      .runtime-recent-activity-scroll > * {
        width: 100%;
      }
      .runtime-activity-row-left {
        justify-content: flex-start !important;
        align-items: flex-start !important;
        text-align: left !important;
      }
      .runtime-activity-row-left .text-right,
      .runtime-activity-row-left [class*="text-right"],
      .runtime-activity-row-left .ml-auto {
        text-align: left !important;
        margin-left: 0 !important;
      }
      .runtime-recent-activity-scroll::-webkit-scrollbar {
        width: 8px;
      }
      .runtime-recent-activity-scroll::-webkit-scrollbar-track {
        background: rgba(148, 163, 184, 0.12);
        border-radius: 999px;
      }
      .runtime-recent-activity-scroll::-webkit-scrollbar-thumb {
        background: rgba(14, 165, 233, 0.58);
        border-radius: 999px;
      }
      .runtime-route-ai .runtime-product-panels {
        grid-template-columns: minmax(0, 1fr);
      }
      .runtime-route-expenses .runtime-expense-history-full {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        min-width: 100% !important;
        flex: 1 1 100% !important;
        margin-left: 0 !important;
        margin-right: auto !important;
        max-width: none !important;
      }
      .runtime-product-card {
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 16px;
        padding: 0.9rem;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 12px 26px rgba(2, 6, 23, 0.08);
      }
      .runtime-feature-card {
        position: relative;
        overflow: hidden;
        isolation: isolate;
      }
      .runtime-feature-card > * {
        position: relative;
        z-index: 1;
      }
      .runtime-feature-card.runtime-feature-filters {
        border-color: rgba(6, 182, 212, 0.22);
        background:
          linear-gradient(180deg, rgba(248, 252, 255, 0.96), rgba(239, 248, 255, 0.94)),
          radial-gradient(circle at 12% 10%, rgba(6, 182, 212, 0.1), transparent 34%);
      }
      .runtime-feature-card.runtime-feature-onboarding {
        border-color: rgba(16, 185, 129, 0.22);
        background:
          linear-gradient(180deg, rgba(249, 255, 252, 0.96), rgba(239, 253, 245, 0.94)),
          radial-gradient(circle at 84% 18%, rgba(16, 185, 129, 0.11), transparent 38%);
      }
      .runtime-feature-card.runtime-feature-ai {
        border-color: rgba(6, 182, 212, 0.28);
        background:
          linear-gradient(180deg, rgba(247, 253, 255, 0.98), rgba(238, 249, 255, 0.96)),
          radial-gradient(circle at 88% 16%, rgba(6, 182, 212, 0.14), transparent 38%);
      }
      .runtime-ai-card {
        grid-column: 1 / -1;
      }
      .runtime-product-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.55rem;
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-product-head {
        margin-bottom: 0.78rem;
      }
      .runtime-card-progress-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.34rem;
        margin: 0 0 0.6rem;
      }
      .runtime-card-progress {
        position: relative;
        height: 8px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.22);
        overflow: hidden;
      }
      .runtime-card-progress-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, #06b6d4 0%, #10b981 100%);
        transition:
          width 0.45s cubic-bezier(0.22, 0.61, 0.36, 1),
          filter 0.28s ease;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
      }
      .runtime-card-progress-fill::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(120deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0));
        transform: translateX(-120%);
        animation: runtimeTrackSweep 2.6s ease-in-out infinite;
      }
      .runtime-card-progress-label {
        font-size: 0.68rem;
        color: #475569;
        letter-spacing: 0.01em;
      }
      .runtime-product-title {
        font-size: 0.86rem;
        font-weight: 700;
        color: #0f172a;
      }
      .runtime-product-subtitle {
        font-size: 0.74rem;
        color: #64748b;
      }
      .runtime-mini-btn {
        border: 1px solid rgba(148, 163, 184, 0.34);
        border-radius: 10px;
        background: #ffffff;
        color: #0f172a;
        padding: 0.34rem 0.6rem;
        font-size: 0.71rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition: all 0.16s ease;
      }
      .runtime-mini-btn:hover {
        border-color: rgba(14, 165, 233, 0.42);
        color: #0369a1;
      }
      .runtime-mini-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .runtime-mini-btn.primary {
        background: #0ea5e9;
        color: #ffffff;
        border-color: rgba(14, 165, 233, 0.58);
      }
      .runtime-mini-btn.success {
        background: #10b981;
        color: #ffffff;
        border-color: rgba(16, 185, 129, 0.56);
      }
      .runtime-mini-list {
        display: flex;
        flex-direction: column;
        gap: 0.44rem;
      }
      .runtime-feature-card .runtime-mini-list {
        gap: 0.52rem;
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-right: 0.22rem;
        scrollbar-width: thin;
        scrollbar-color: rgba(6, 182, 212, 0.56) rgba(148, 163, 184, 0.16);
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list::-webkit-scrollbar {
        width: 8px;
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list::-webkit-scrollbar-track {
        background: rgba(148, 163, 184, 0.14);
        border-radius: 999px;
      }
      .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list::-webkit-scrollbar-thumb {
        background: rgba(6, 182, 212, 0.58);
        border-radius: 999px;
      }
      .runtime-mini-empty {
        font-size: 0.76rem;
        color: #64748b;
      }
      .runtime-mini-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 10px;
        background: rgba(248, 250, 252, 0.92);
        padding: 0.45rem 0.55rem;
      }
      .runtime-feature-card .runtime-mini-row {
        background: rgba(255, 255, 255, 0.66);
        backdrop-filter: blur(14px);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38);
      }
      .runtime-feature-row {
        animation: runtimeFeatureRowIn 0.44s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        animation-delay: var(--runtime-row-delay, 0ms);
      }
      .runtime-feature-row .runtime-mini-row-title {
        transition:
          transform 0.2s ease,
          color 0.2s ease;
      }
      .runtime-feature-row:hover .runtime-mini-row-title {
        transform: translateX(2px);
      }
      .runtime-ai-form {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
        gap: 0.75rem;
        align-items: start;
      }
      .runtime-ai-copy {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        min-height: 100%;
        border-radius: 16px;
        border: 1px dashed rgba(6, 182, 212, 0.18);
        padding: 0.55rem;
        background: rgba(255, 255, 255, 0.16);
        transition:
          border-color 0.22s ease,
          background 0.22s ease,
          box-shadow 0.22s ease,
          transform 0.22s ease;
      }
      .runtime-ai-copy.drag-active {
        border-color: rgba(6, 182, 212, 0.56);
        background: rgba(6, 182, 212, 0.08);
        box-shadow:
          inset 0 0 0 1px rgba(6, 182, 212, 0.18),
          0 18px 34px rgba(6, 182, 212, 0.12);
        transform: translateY(-1px);
      }
      .runtime-ai-copy.drag-active::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        border-radius: inherit;
        background:
          linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(255, 255, 255, 0)),
          radial-gradient(circle at 22% 20%, rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0) 38%);
      }
      .runtime-ai-drop-hint {
        font-size: 0.69rem;
        line-height: 1.45;
        color: #64748b;
        padding: 0 0.15rem;
      }
      .runtime-signup-terms-note {
        margin-top: 0.45rem;
        font-size: 0.72rem;
        line-height: 1.45;
        color: #64748b;
        transition: color 0.18s ease;
      }
      .runtime-signup-terms-note.ready {
        color: #047857;
      }
      .runtime-auth-submit-blocked {
        opacity: 0.72;
        cursor: not-allowed;
        filter: saturate(0.92);
      }
      .runtime-ai-textarea {
        min-height: 170px;
        width: 100%;
        resize: vertical;
        border-radius: 14px;
        border: 1px solid rgba(6, 182, 212, 0.28);
        background: rgba(255, 255, 255, 0.7);
        padding: 0.85rem 0.95rem;
        font-size: 0.82rem;
        line-height: 1.55;
        color: #0f172a;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.5),
          0 14px 30px rgba(6, 182, 212, 0.08);
      }
      .runtime-ai-textarea:focus {
        outline: none;
        border-color: rgba(6, 182, 212, 0.56);
        box-shadow:
          0 0 0 3px rgba(6, 182, 212, 0.14),
          0 16px 34px rgba(6, 182, 212, 0.14);
      }
      .runtime-ai-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .runtime-ai-suggestion-btn {
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.78);
        color: #334155;
        padding: 0.3rem 0.58rem;
        font-size: 0.68rem;
        line-height: 1.2;
        font-weight: 600;
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          color 0.18s ease,
          background 0.18s ease,
          transform 0.18s ease;
      }
      .runtime-ai-suggestion-btn:hover {
        border-color: rgba(6, 182, 212, 0.46);
        color: #0369a1;
        background: rgba(6, 182, 212, 0.1);
        transform: translateY(-1px);
      }
      .runtime-ai-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .runtime-ai-hidden-input {
        display: none;
      }
      .runtime-ai-select {
        min-width: 210px;
        max-width: 100%;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.86);
        color: #0f172a;
        font-size: 0.73rem;
        font-weight: 600;
        padding: 0.48rem 0.7rem;
        outline: none;
      }
      .runtime-ai-select:focus {
        border-color: rgba(6, 182, 212, 0.48);
        box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.12);
      }
      .runtime-ai-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-top: 0.12rem;
      }
      .runtime-ai-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.28rem;
        border-radius: 999px;
        border: 1px solid rgba(6, 182, 212, 0.22);
        background: rgba(6, 182, 212, 0.08);
        color: #0f172a;
        padding: 0.26rem 0.55rem;
        font-size: 0.67rem;
        font-weight: 700;
      }
      .runtime-ai-preview {
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.56);
        backdrop-filter: blur(14px);
        padding: 0.8rem;
        min-height: 100%;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .runtime-ai-preview-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .runtime-ai-preview-title {
        font-size: 0.79rem;
        font-weight: 700;
        color: #0f172a;
      }
      .runtime-ai-preview-note {
        font-size: 0.7rem;
        line-height: 1.45;
        color: #64748b;
      }
      .runtime-ai-jobs {
        display: flex;
        flex-direction: column;
        gap: 0.46rem;
      }
      .runtime-ai-jobs[hidden] {
        display: none !important;
      }
      .runtime-ai-jobs-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.55rem;
      }
      .runtime-ai-jobs-head-main {
        min-width: 0;
        flex: 1;
      }
      .runtime-ai-jobs-title {
        font-size: 0.74rem;
        font-weight: 700;
        color: #0f172a;
      }
      .runtime-ai-jobs-meta {
        font-size: 0.66rem;
        color: #64748b;
      }
      .runtime-ai-job-list {
        display: flex;
        flex-direction: column;
        gap: 0.46rem;
      }
      .runtime-ai-job {
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.54);
        padding: 0.58rem 0.66rem;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        backdrop-filter: blur(12px);
      }
      .runtime-ai-job-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.6rem;
      }
      .runtime-ai-job-side {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.36rem;
        flex-shrink: 0;
      }
      .runtime-ai-job-copy {
        min-width: 0;
        flex: 1;
      }
      .runtime-ai-job-name {
        display: block;
        font-size: 0.73rem;
        font-weight: 700;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .runtime-ai-job-note {
        display: block;
        margin-top: 0.18rem;
        font-size: 0.67rem;
        line-height: 1.45;
        color: #64748b;
      }
      .runtime-ai-job-status {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 0.32rem;
        padding: 0.28rem 0.52rem;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(148, 163, 184, 0.08);
        color: #334155;
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: capitalize;
      }
      .runtime-ai-job-status::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.04);
      }
      .runtime-ai-job-status.is-queued {
        border-color: rgba(148, 163, 184, 0.24);
        background: rgba(148, 163, 184, 0.08);
        color: #64748b;
      }
      .runtime-ai-job-status.is-scanning {
        border-color: rgba(6, 182, 212, 0.28);
        background: rgba(6, 182, 212, 0.1);
        color: #0891b2;
        animation: runtimeAiJobPulse 1.4s ease-in-out infinite;
      }
      .runtime-ai-job-status.is-success {
        border-color: rgba(16, 185, 129, 0.26);
        background: rgba(16, 185, 129, 0.1);
        color: #047857;
      }
      .runtime-ai-job-status.is-skipped {
        border-color: rgba(245, 158, 11, 0.26);
        background: rgba(245, 158, 11, 0.1);
        color: #b45309;
      }
      .runtime-ai-job-bar {
        position: relative;
        overflow: hidden;
        height: 7px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.14);
      }
      .runtime-ai-job-bar-fill {
        position: relative;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(6, 182, 212, 0.82), rgba(34, 211, 238, 0.96));
        transition: width 0.24s ease, background 0.24s ease, opacity 0.24s ease;
      }
      .runtime-ai-job.is-success .runtime-ai-job-bar-fill {
        background: linear-gradient(90deg, rgba(16, 185, 129, 0.9), rgba(52, 211, 153, 0.98));
      }
      .runtime-ai-job.is-skipped .runtime-ai-job-bar-fill {
        background: linear-gradient(90deg, rgba(245, 158, 11, 0.9), rgba(251, 191, 36, 0.98));
      }
      .runtime-ai-job.is-scanning .runtime-ai-job-bar-fill::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: runtimeAiJobSweep 1.2s linear infinite;
      }
      .runtime-ai-preview-list {
        display: flex;
        flex-direction: column;
        gap: 0.46rem;
      }
      .runtime-ai-preview-item {
        display: flex;
        justify-content: space-between;
        gap: 0.55rem;
        padding: 0.55rem 0.65rem;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(255, 255, 255, 0.56);
      }
      .runtime-ai-preview-item strong {
        display: block;
        font-size: 0.73rem;
        color: #0f172a;
      }
      .runtime-ai-preview-item span,
      .runtime-ai-warning-item,
      .runtime-ai-member-line {
        font-size: 0.68rem;
        color: #64748b;
      }
      .runtime-ai-warning-list,
      .runtime-ai-member-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.42rem;
      }
      .runtime-ai-member-line {
        padding: 0.26rem 0.5rem;
        border-radius: 999px;
        border: 1px solid rgba(16, 185, 129, 0.2);
        background: rgba(16, 185, 129, 0.08);
        color: #065f46;
        font-weight: 600;
      }
      .runtime-ai-warning-item {
        padding: 0.26rem 0.5rem;
        border-radius: 999px;
        border: 1px solid rgba(245, 158, 11, 0.22);
        background: rgba(245, 158, 11, 0.08);
        color: #92400e;
        font-weight: 600;
      }
      .runtime-mini-row-label {
        min-width: 0;
        flex: 1;
      }
      .runtime-mini-row-title {
        color: #0f172a;
        font-size: 0.76rem;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .runtime-mini-row-meta {
        color: #64748b;
        font-size: 0.68rem;
      }
      .runtime-mini-actions {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
      }
      .runtime-onboard-progress {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 42px;
        height: 22px;
        border-radius: 999px;
        background: rgba(14, 165, 233, 0.12);
        color: #0369a1;
        font-size: 0.68rem;
        font-weight: 700;
        padding: 0 0.46rem;
        animation: runtimeOnboardPillPulse 2.6s ease-in-out infinite;
      }
      .runtime-check-toggle {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.4);
        background: #ffffff;
        color: transparent;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
      }
      .runtime-check-toggle.completed {
        background: #10b981;
        border-color: rgba(16, 185, 129, 0.65);
        color: #ffffff;
      }
      .runtime-check-toggle.locked {
        cursor: default;
      }
      .runtime-onboard-row {
        align-items: flex-start;
      }
      .runtime-ops-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.45rem;
      }
      .runtime-ops-cell {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 10px;
        background: rgba(248, 250, 252, 0.94);
        padding: 0.42rem 0.5rem;
      }
      .runtime-ops-k {
        font-size: 0.66rem;
        color: #64748b;
      }
      .runtime-ops-v {
        font-size: 0.82rem;
        color: #0f172a;
        font-weight: 700;
      }
      .runtime-ops-hub,
      .runtime-settle-hub {
        position: relative;
        z-index: 8;
        display: inline-flex;
        align-items: center;
        overflow: visible;
      }
      .runtime-ops-launcher,
      .runtime-settle-launcher {
        position: relative;
        width: 42px;
        height: 42px;
        border-radius: 14px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.94));
        box-shadow: 0 12px 24px rgba(2, 6, 23, 0.12);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #0f172a;
        cursor: pointer;
      }
      .runtime-ops-launcher svg,
      .runtime-settle-launcher svg {
        width: 22px;
        height: 22px;
      }
      .runtime-ops-launcher-dot {
        position: absolute;
        top: 7px;
        right: 7px;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #38bdf8;
        box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.16);
      }
      .runtime-settle-launcher-dot {
        position: absolute;
        top: 7px;
        right: 7px;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #10b981;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.16);
      }
      .runtime-ops-launcher-badge {
        position: absolute;
        right: -5px;
        bottom: -4px;
        min-width: 18px;
        height: 18px;
        border-radius: 999px;
        padding: 0 0.3rem;
        display: none;
        align-items: center;
        justify-content: center;
        background: #f59e0b;
        color: #fff;
        font-size: 0.62rem;
        font-weight: 800;
        box-shadow: 0 10px 18px rgba(245, 158, 11, 0.28);
      }
      .runtime-settle-launcher-badge {
        position: absolute;
        right: -5px;
        bottom: -4px;
        min-width: 18px;
        height: 18px;
        border-radius: 999px;
        padding: 0 0.3rem;
        display: none;
        align-items: center;
        justify-content: center;
        background: #10b981;
        color: #fff;
        font-size: 0.62rem;
        font-weight: 800;
        box-shadow: 0 10px 18px rgba(16, 185, 129, 0.28);
      }
      .runtime-ops-launcher[data-runtime-ops-state="healthy"] .runtime-ops-launcher-dot {
        background: #10b981;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.16);
      }
      .runtime-ops-launcher[data-runtime-ops-state="warn"] .runtime-ops-launcher-dot {
        background: #f59e0b;
        box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18);
      }
      .runtime-ops-launcher[data-runtime-ops-state="warn"] .runtime-ops-launcher-badge {
        display: inline-flex;
      }
      .runtime-settle-launcher[data-runtime-settle-state="pending"] .runtime-settle-launcher-dot {
        background: #f59e0b;
        box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18);
      }
      .runtime-settle-launcher[data-runtime-settle-state="pending"] .runtime-settle-launcher-badge {
        display: inline-flex;
      }
      .runtime-ops-flyout,
      .runtime-settle-flyout {
        position: absolute;
        top: calc(100% + 0.8rem);
        right: 0;
        width: min(330px, calc(100vw - 2rem));
        pointer-events: none;
        opacity: 0;
        transform: translateY(10px) scale(0.96);
        transform-origin: right top;
        transition:
          opacity 0.2s ease,
          transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .runtime-ops-hub.open .runtime-ops-flyout {
        pointer-events: auto;
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .runtime-settle-hub.open .runtime-settle-flyout {
        pointer-events: auto;
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .runtime-ops-flyout .runtime-product-card,
      .runtime-settle-flyout .runtime-product-card {
        margin: 0;
      }
      .runtime-ops-controls {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      @media (max-width: 900px) {
        .runtime-product-panels {
          grid-template-columns: 1fr;
        }
        .runtime-product-panels.runtime-product-panels-immersive {
          min-height: auto;
        }
        .runtime-product-panels.runtime-product-panels-immersive .runtime-feature-card {
          min-height: clamp(280px, 56vh, 560px);
        }
        .runtime-ai-form {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 768px) {
        .runtime-ops-flyout,
        .runtime-settle-flyout {
          right: -0.2rem;
          width: min(312px, calc(100vw - 1.4rem));
        }
      }
      .runtime-toast-stack {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        width: min(360px, calc(100vw - 2rem));
        pointer-events: none;
      }
      .runtime-toast {
        pointer-events: auto;
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.92);
        color: #e2e8f0;
        box-shadow: 0 16px 40px rgba(2, 6, 23, 0.35);
        padding: 0.75rem 0.85rem;
        font-size: 0.875rem;
        line-height: 1.35;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.6rem;
        animation: runtimeToastIn 0.2s ease-out both;
      }
      .runtime-toast.success {
        border-color: rgba(16, 185, 129, 0.45);
      }
      .runtime-toast.warn {
        border-color: rgba(245, 158, 11, 0.45);
      }
      .runtime-toast.error {
        border-color: rgba(239, 68, 68, 0.5);
      }
      .runtime-toast.info {
        border-color: rgba(6, 182, 212, 0.45);
      }
      .runtime-toast-close {
        border: 0;
        background: transparent;
        color: #94a3b8;
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
      }
      .runtime-toast-close:hover {
        color: #e2e8f0;
      }
      .runtime-notify-panel {
        position: fixed;
        top: 4.6rem;
        right: 1rem;
        width: min(430px, calc(100vw - 2rem));
        max-height: min(72vh, 680px);
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.3);
        box-shadow: 0 22px 54px rgba(15, 23, 42, 0.2);
        border-radius: 14px;
        z-index: 9998;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .runtime-notify-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 0.85rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.24);
        color: #0f172a;
      }
      .runtime-notify-head strong {
        font-size: 0.95rem;
        font-weight: 600;
      }
      .runtime-notify-controls {
        display: flex;
        align-items: center;
        gap: 0.45rem;
      }
      .runtime-notify-btn {
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 8px;
        background: #ffffff;
        color: #334155;
        padding: 0.25rem 0.5rem;
        font-size: 0.72rem;
        line-height: 1.2;
      }
      .runtime-notify-btn:hover {
        color: #0f172a;
        border-color: rgba(6, 182, 212, 0.45);
      }
      .runtime-notify-body {
        overflow: auto;
        overscroll-behavior: contain;
      }
      .runtime-notify-item {
        padding: 0.7rem 0.85rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        color: #334155;
      }
      .runtime-notify-item:last-child {
        border-bottom: 0;
      }
      .runtime-notify-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.24rem;
      }
      .runtime-notify-group {
        font-size: 0.78rem;
        color: #64748b;
      }
      .runtime-notify-time {
        font-size: 0.72rem;
        color: #64748b;
      }
      .runtime-notify-text {
        font-size: 0.82rem;
        line-height: 1.35;
        color: #0f172a;
      }
      .runtime-notify-meta {
        margin-top: 0.36rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        color: #64748b;
      }
      .runtime-notify-status {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #64748b;
      }
      .runtime-notify-status.sent {
        color: #34d399;
      }
      .runtime-notify-status.failed {
        color: #f87171;
      }
      .runtime-notify-status.queued {
        color: #fbbf24;
      }
      .runtime-notify-actions {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .runtime-notify-empty {
        padding: 1rem 0.9rem;
        color: #64748b;
        font-size: 0.84rem;
      }
      .runtime-active-filter-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.42rem;
        margin: 0.5rem 0 0.85rem;
        padding: 0.42rem 0.5rem;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 12px;
        background: #ffffff;
      }
      .runtime-active-filter-label {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(248, 250, 252, 0.85);
        color: #475569;
        font-size: 0.67rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 0.26rem 0.52rem;
      }
      .runtime-filter-chip {
        border: 1px solid rgba(14, 165, 233, 0.34);
        border-radius: 999px;
        background: #ffffff;
        color: #0f172a;
        padding: 0.26rem 0.55rem;
        font-size: 0.69rem;
        font-weight: 600;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        gap: 0.36rem;
        cursor: pointer;
      }
      .runtime-filter-chip:hover {
        border-color: rgba(14, 165, 233, 0.55);
        background: #ffffff;
      }
      input[type="search"],
      input[placeholder*="search" i],
      input[aria-label*="search" i],
      [class*="search"] input,
      [class*="search-bar"] input {
        background: #ffffff !important;
        color: #0f172a !important;
        border-color: rgba(148, 163, 184, 0.36) !important;
      }
      [class*="search"],
      [class*="search-bar"] {
        background: #ffffff !important;
      }
      .runtime-filter-chip-text {
        max-width: min(40vw, 220px);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .runtime-filter-chip-close {
        font-size: 0.78rem;
        font-weight: 700;
        opacity: 0.78;
      }
      body.runtime-dark .runtime-active-filter-label {
        border-color: rgba(148, 163, 184, 0.28);
        background: #ffffff;
        color: #475569;
      }
      body.runtime-dark .runtime-filter-chip {
        border-color: rgba(6, 182, 212, 0.4);
        background: #ffffff;
        color: #0f172a;
      }
      body.runtime-dark .runtime-filter-chip:hover {
        border-color: rgba(6, 182, 212, 0.65);
        background: #ffffff;
      }
      body.runtime-dark .runtime-active-filter-row,
      body.runtime-dark input[type="search"],
      body.runtime-dark input[placeholder*="search" i],
      body.runtime-dark input[aria-label*="search" i],
      body.runtime-dark [class*="search"] input,
      body.runtime-dark [class*="search-bar"] input,
      body.runtime-dark [class*="search"],
      body.runtime-dark [class*="search-bar"] {
        background: #ffffff !important;
        color: #0f172a !important;
        border-color: rgba(148, 163, 184, 0.3) !important;
      }
      @keyframes runtimeToastIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (max-width: 640px) {
        .runtime-notify-panel {
          left: 0.75rem;
          right: 0.75rem;
          width: auto;
          top: 4rem;
        }
        .runtime-toast-stack {
          left: 0.75rem;
          right: 0.75rem;
          width: auto;
          bottom: 0.75rem;
        }
        .runtime-filter-chip-text {
          max-width: 54vw;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureToastStack() {
    ensureToastStyles();
    if (toastStack && document.body.contains(toastStack)) return toastStack;
    toastStack = document.createElement("div");
    toastStack.className = "runtime-toast-stack";
    toastStack.setAttribute("aria-live", "polite");
    toastStack.setAttribute("aria-atomic", "false");
    document.body.appendChild(toastStack);
    return toastStack;
  }

  function showToast(message, type = "info", durationMs = 4000) {
    const text = normalizedText(message);
    if (!text) return;

    const stack = ensureToastStack();
    const item = document.createElement("div");
    item.className = `runtime-toast ${String(type || "info").toLowerCase()}`;

    const msg = document.createElement("div");
    msg.textContent = text;

    const close = document.createElement("button");
    close.className = "runtime-toast-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss notification");

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      item.remove();
    };

    close.addEventListener("click", remove);
    item.appendChild(msg);
    item.appendChild(close);
    stack.appendChild(item);

    window.setTimeout(remove, Math.max(1200, Number(durationMs || 0)));
  }

  function ensureRuntimeThemeStyles() {
    if (document.getElementById("expense-split-runtime-theme-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-theme-style";
    style.textContent = `
      html.runtime-dark,
      body.runtime-dark {
        background: #020617 !important;
        color: #e2e8f0 !important;
      }
      body.runtime-dark .bg-white {
        background: #0f172a !important;
        color: #e2e8f0 !important;
      }
      body.runtime-dark .runtime-feature-card.runtime-feature-filters {
        background:
          linear-gradient(180deg, rgba(10, 24, 38, 0.96), rgba(8, 20, 32, 0.94)),
          radial-gradient(circle at 12% 10%, rgba(6, 182, 212, 0.15), transparent 38%);
        border-color: rgba(6, 182, 212, 0.26);
      }
      body.runtime-dark .runtime-feature-card.runtime-feature-onboarding {
        background:
          linear-gradient(180deg, rgba(10, 28, 25, 0.95), rgba(8, 22, 20, 0.94)),
          radial-gradient(circle at 84% 18%, rgba(16, 185, 129, 0.16), transparent 40%);
        border-color: rgba(16, 185, 129, 0.24);
      }
      body.runtime-dark .runtime-feature-card.runtime-feature-ai {
        background:
          linear-gradient(180deg, rgba(8, 24, 34, 0.96), rgba(8, 20, 30, 0.94)),
          radial-gradient(circle at 88% 16%, rgba(6, 182, 212, 0.18), transparent 40%);
        border-color: rgba(6, 182, 212, 0.28);
      }
      body.runtime-dark .runtime-feature-card .runtime-mini-row {
        background: rgba(15, 23, 42, 0.56);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      body.runtime-dark .runtime-card-progress {
        background: rgba(148, 163, 184, 0.2);
      }
      body.runtime-dark .runtime-card-progress-fill {
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.42) inset;
      }
      body.runtime-dark .runtime-card-progress-label {
        color: #cbd5e1;
      }
      body.runtime-dark .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list {
        scrollbar-color: rgba(6, 182, 212, 0.58) rgba(15, 23, 42, 0.46);
      }
      body.runtime-dark .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.46);
      }
      body.runtime-dark .runtime-product-panels.runtime-product-panels-immersive .runtime-mini-list::-webkit-scrollbar-thumb {
        background: rgba(6, 182, 212, 0.6);
      }
      body.runtime-dark .runtime-ai-textarea,
      body.runtime-dark .runtime-ai-select,
      body.runtime-dark .runtime-ai-preview,
      body.runtime-dark .runtime-ai-preview-item {
        background: rgba(15, 23, 42, 0.6);
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.22);
      }
      body.runtime-dark .runtime-ai-preview-title,
      body.runtime-dark .runtime-ai-jobs-title,
      body.runtime-dark .runtime-ai-pill,
      body.runtime-dark .runtime-ai-preview-item strong {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-ai-preview-note,
      body.runtime-dark .runtime-ai-jobs-meta,
      body.runtime-dark .runtime-ai-preview-item span,
      body.runtime-dark .runtime-ai-warning-item,
      body.runtime-dark .runtime-ai-member-line {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-ai-job {
        background: rgba(15, 23, 42, 0.56);
        border-color: rgba(148, 163, 184, 0.18);
      }
      body.runtime-dark .runtime-ai-job-name {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-ai-job-note {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-ai-job-bar {
        background: rgba(148, 163, 184, 0.16);
      }
      body.runtime-dark .runtime-ai-job-status.is-queued {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-ai-job-status.is-scanning {
        color: #67e8f9;
      }
      body.runtime-dark .runtime-ai-job-status.is-success {
        color: #6ee7b7;
      }
      body.runtime-dark .runtime-ai-job-status.is-skipped {
        color: #fcd34d;
      }
      body.runtime-dark .runtime-ai-member-line {
        background: rgba(16, 185, 129, 0.12);
        color: #bbf7d0;
      }
      body.runtime-dark .runtime-ai-warning-item {
        background: rgba(245, 158, 11, 0.12);
        color: #fcd34d;
      }
      body.runtime-dark .runtime-ai-copy {
        background: rgba(15, 23, 42, 0.18);
        border-color: rgba(6, 182, 212, 0.2);
      }
      body.runtime-dark .runtime-ai-suggestion-btn {
        border-color: rgba(148, 163, 184, 0.28);
        background: rgba(15, 23, 42, 0.74);
        color: #d9e5f4;
      }
      body.runtime-dark .runtime-ai-suggestion-btn:hover {
        border-color: rgba(6, 182, 212, 0.52);
        color: #22d3ee;
        background: rgba(6, 182, 212, 0.14);
      }
      body.runtime-dark .runtime-ai-copy.drag-active {
        background: rgba(6, 182, 212, 0.12);
        box-shadow:
          inset 0 0 0 1px rgba(6, 182, 212, 0.24),
          0 18px 34px rgba(2, 6, 23, 0.28);
      }
      body.runtime-dark .runtime-ai-drop-hint {
        color: #94a3b8;
      }
      body.runtime-dark .bg-gray-50 {
        background: #111827 !important;
      }
      body.runtime-dark .text-splitwise-text,
      body.runtime-dark .text-gray-900 {
        color: #f8fafc !important;
      }
      body.runtime-dark .text-gray-700,
      body.runtime-dark .text-gray-600 {
        color: #cbd5e1 !important;
      }
      body.runtime-dark .text-gray-500,
      body.runtime-dark .text-gray-400 {
        color: #94a3b8 !important;
      }
      body.runtime-dark .border-gray-100,
      body.runtime-dark .border-gray-200,
      body.runtime-dark .border-gray-300 {
        border-color: rgba(148, 163, 184, 0.25) !important;
      }
      body.runtime-dark input,
      body.runtime-dark textarea,
      body.runtime-dark select {
        background: #0b1220 !important;
        color: #e2e8f0 !important;
        border-color: rgba(148, 163, 184, 0.35) !important;
      }
      body.runtime-dark aside {
        background: #0b1220 !important;
      }
      .runtime-pref-select {
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 0.6rem;
        background: #ffffff;
        color: #334155;
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.2;
        padding: 0.42rem 2rem 0.42rem 0.7rem;
        outline: none;
      }
      .runtime-pref-select:focus {
        border-color: rgba(16, 185, 129, 0.7);
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
      }
      body.runtime-dark .runtime-pref-select {
        background: #0b1220;
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.35);
      }
      body.runtime-dark .runtime-ops-launcher,
      body.runtime-dark .runtime-settle-launcher {
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(11, 18, 32, 0.94));
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.22);
        box-shadow: 0 18px 34px rgba(2, 6, 23, 0.44);
      }
      body.runtime-dark .runtime-notify-panel {
        background: rgba(255, 255, 255, 0.98) !important;
        border-color: rgba(148, 163, 184, 0.3) !important;
        color: #0f172a !important;
      }
      body.runtime-dark .runtime-notify-head,
      body.runtime-dark .runtime-notify-item,
      body.runtime-dark .runtime-notify-text,
      body.runtime-dark .runtime-notify-group,
      body.runtime-dark .runtime-notify-time,
      body.runtime-dark .runtime-notify-empty,
      body.runtime-dark .runtime-notify-btn {
        color: #0f172a !important;
      }
      body.runtime-dark .runtime-notify-btn {
        background: #ffffff !important;
        border-color: rgba(148, 163, 184, 0.32) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRuntimeAmbientStyles() {
    if (document.getElementById("expense-split-runtime-ambient-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-ambient-style";
    style.textContent = `
      :root {
        --runtime-ambient-x: 50vw;
        --runtime-ambient-y: 26vh;
      }
      body > #root {
        position: relative;
        z-index: 1;
        isolation: isolate;
      }
      #runtime-ambient-scene {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
        opacity: 0.88;
      }
      #runtime-ambient-scene.is-auth {
        opacity: 0.72;
      }
      #runtime-ambient-scene.is-marketing {
        opacity: 1;
      }
      #runtime-ambient-scene.is-app {
        opacity: 0.86;
      }
      #runtime-ambient-scene.motion-subtle {
        opacity: 0.58;
      }
      #runtime-ambient-scene.motion-cinematic {
        opacity: 0.82;
      }
      #runtime-ambient-scene.motion-dramatic {
        opacity: 0.96;
      }
      .runtime-ambient-base,
      .runtime-ambient-grid,
      .runtime-ambient-orb,
      .runtime-ambient-noise,
      .runtime-ambient-spotlight {
        position: absolute;
        inset: 0;
      }
      .runtime-ambient-base {
        background:
          radial-gradient(1200px 640px at 12% -10%, rgba(56, 189, 248, 0.18), transparent 62%),
          radial-gradient(960px 560px at 88% 8%, rgba(16, 185, 129, 0.15), transparent 60%),
          radial-gradient(980px 600px at 50% 118%, rgba(99, 102, 241, 0.12), transparent 62%),
          linear-gradient(180deg, rgba(2, 6, 23, 0.1), rgba(2, 6, 23, 0.35));
      }
      .runtime-ambient-grid {
        background:
          linear-gradient(rgba(148, 163, 184, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.03) 1px, transparent 1px);
        background-size: 34px 34px, 34px 34px;
        mask-image: radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.85), transparent 75%);
        opacity: 0.42;
        animation: runtimeAmbientGridDrift 18s linear infinite;
      }
      #runtime-ambient-scene.motion-subtle .runtime-ambient-grid {
        opacity: 0.2;
      }
      #runtime-ambient-scene.motion-cinematic .runtime-ambient-grid {
        opacity: 0.34;
      }
      #runtime-ambient-scene.motion-dramatic .runtime-ambient-grid {
        opacity: 0.5;
      }
      .runtime-ambient-orb {
        filter: blur(52px) saturate(1.14);
        transform: translate3d(0, 0, 0) scale(1);
        will-change: transform, opacity;
      }
      #runtime-ambient-scene.motion-subtle .runtime-ambient-orb {
        filter: blur(62px) saturate(1.02);
      }
      #runtime-ambient-scene.motion-cinematic .runtime-ambient-orb {
        filter: blur(56px) saturate(1.1);
      }
      #runtime-ambient-scene.motion-dramatic .runtime-ambient-orb {
        filter: blur(48px) saturate(1.2);
      }
      .runtime-ambient-orb.orb-a {
        width: 48vw;
        height: 48vw;
        max-width: 760px;
        max-height: 760px;
        left: -16vw;
        top: -18vh;
        background: radial-gradient(circle, rgba(34, 211, 238, 0.38) 0%, rgba(34, 211, 238, 0) 66%);
        animation: runtimeAmbientFloatA 17s ease-in-out infinite;
      }
      .runtime-ambient-orb.orb-b {
        width: 44vw;
        height: 44vw;
        max-width: 700px;
        max-height: 700px;
        right: -14vw;
        top: 16vh;
        background: radial-gradient(circle, rgba(16, 185, 129, 0.33) 0%, rgba(16, 185, 129, 0) 70%);
        animation: runtimeAmbientFloatB 20s ease-in-out infinite;
      }
      .runtime-ambient-orb.orb-c {
        width: 52vw;
        height: 52vw;
        max-width: 840px;
        max-height: 840px;
        left: 22vw;
        bottom: -28vh;
        background: radial-gradient(circle, rgba(59, 130, 246, 0.26) 0%, rgba(59, 130, 246, 0) 68%);
        animation: runtimeAmbientFloatC 22s ease-in-out infinite;
      }
      .runtime-ambient-noise {
        opacity: 0.14;
        background-image:
          radial-gradient(rgba(148, 163, 184, 0.24) 0.7px, transparent 0.7px),
          radial-gradient(rgba(148, 163, 184, 0.16) 0.55px, transparent 0.55px);
        background-position: 0 0, 17px 17px;
        background-size: 34px 34px, 34px 34px;
        animation: runtimeAmbientNoise 10s linear infinite;
      }
      .runtime-ambient-spotlight {
        background:
          radial-gradient(
            360px circle at var(--runtime-ambient-x) var(--runtime-ambient-y),
            rgba(56, 189, 248, 0.24) 0%,
            rgba(56, 189, 248, 0.08) 36%,
            transparent 72%
          ),
          radial-gradient(
            520px circle at calc(var(--runtime-ambient-x) + 14vw) calc(var(--runtime-ambient-y) + 18vh),
            rgba(16, 185, 129, 0.12) 0%,
            transparent 70%
          );
        transition: opacity 0.24s ease;
        mix-blend-mode: screen;
        opacity: 0.9;
      }
      #runtime-ambient-scene.motion-subtle .runtime-ambient-spotlight {
        opacity: 0.52;
      }
      #runtime-ambient-scene.motion-cinematic .runtime-ambient-spotlight {
        opacity: 0.74;
      }
      #runtime-ambient-scene.motion-dramatic .runtime-ambient-spotlight {
        opacity: 0.98;
      }
      #runtime-ambient-scene.is-auth .runtime-ambient-orb,
      #runtime-ambient-scene.is-auth .runtime-ambient-grid {
        opacity: 0.74;
      }
      #runtime-ambient-scene.is-auth .runtime-ambient-spotlight {
        opacity: 0.62;
      }
      #runtime-ambient-scene.is-app .runtime-ambient-noise {
        opacity: 0.1;
      }
      @keyframes runtimeAmbientGridDrift {
        0% {
          transform: translate3d(0, 0, 0);
        }
        50% {
          transform: translate3d(-12px, -8px, 0);
        }
        100% {
          transform: translate3d(0, 0, 0);
        }
      }
      @keyframes runtimeAmbientFloatA {
        0%, 100% {
          transform: translate3d(0, 0, 0) scale(1);
        }
        50% {
          transform: translate3d(5vw, 4vh, 0) scale(1.07);
        }
      }
      @keyframes runtimeAmbientFloatB {
        0%, 100% {
          transform: translate3d(0, 0, 0) scale(1);
        }
        50% {
          transform: translate3d(-6vw, -5vh, 0) scale(1.08);
        }
      }
      @keyframes runtimeAmbientFloatC {
        0%, 100% {
          transform: translate3d(0, 0, 0) scale(1);
        }
        50% {
          transform: translate3d(-3vw, -6vh, 0) scale(1.05);
        }
      }
      @keyframes runtimeAmbientNoise {
        0% {
          transform: translate3d(0, 0, 0);
        }
        100% {
          transform: translate3d(18px, 16px, 0);
        }
      }
      @media (max-width: 900px) {
        #runtime-ambient-scene {
          opacity: 0.72;
        }
        .runtime-ambient-grid {
          opacity: 0.28;
        }
        .runtime-ambient-orb {
          filter: blur(46px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .runtime-ambient-grid,
        .runtime-ambient-orb,
        .runtime-ambient-noise {
          animation: none !important;
          transform: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyMotionPresetClasses(preset = state.motionPreset) {
    const mode = normalizeMotionPreset(preset);
    state.motionPreset = mode;

    document.body.classList.toggle("runtime-motion-subtle", mode === "subtle");
    document.body.classList.toggle("runtime-motion-cinematic", mode === "cinematic");
    document.body.classList.toggle("runtime-motion-dramatic", mode === "dramatic");

    const scene = document.getElementById("runtime-ambient-scene");
    if (scene instanceof HTMLElement) {
      scene.classList.toggle("motion-subtle", mode === "subtle");
      scene.classList.toggle("motion-cinematic", mode === "cinematic");
      scene.classList.toggle("motion-dramatic", mode === "dramatic");
    }
  }

  function applyStoredMotionPreset() {
    const prefs = readProfilePrefs();
    applyMotionPresetClasses(prefs.motionPreset || "dramatic");
  }

  function ensureRuntimeAmbientScene() {
    ensureRuntimeAmbientStyles();

    let scene = document.getElementById("runtime-ambient-scene");
    if (!(scene instanceof HTMLElement)) {
      scene = document.createElement("div");
      scene.id = "runtime-ambient-scene";
      scene.innerHTML = `
        <div class="runtime-ambient-base"></div>
        <div class="runtime-ambient-grid"></div>
        <div class="runtime-ambient-orb orb-a"></div>
        <div class="runtime-ambient-orb orb-b"></div>
        <div class="runtime-ambient-orb orb-c"></div>
        <div class="runtime-ambient-noise"></div>
        <div class="runtime-ambient-spotlight"></div>
      `;
      document.body.prepend(scene);
    }

    const path = normalizePath(window.location.pathname);
    const isAuth = LOGIN_PATHS.has(path) || SIGNUP_PATHS.has(path);
    const isMarketing = MARKETING_PATHS.has(path);
    scene.classList.toggle("is-auth", isAuth);
    scene.classList.toggle("is-marketing", isMarketing);
    scene.classList.toggle("is-app", !isAuth && !isMarketing);
    applyMotionPresetClasses(state.motionPreset);

    if (!state.ambientPointerBound) {
      state.ambientPointerBound = true;
      state.ambientPointerX = Math.round(window.innerWidth * 0.5);
      state.ambientPointerY = Math.round(window.innerHeight * 0.26);

      const flushPointer = () => {
        state.ambientPointerFrame = 0;
        document.documentElement.style.setProperty("--runtime-ambient-x", `${state.ambientPointerX}px`);
        document.documentElement.style.setProperty("--runtime-ambient-y", `${state.ambientPointerY}px`);
      };

      const queuePointerFlush = () => {
        if (state.ambientPointerFrame) return;
        state.ambientPointerFrame = window.requestAnimationFrame(flushPointer);
      };

      window.addEventListener(
        "pointermove",
        (event) => {
          if (!(event instanceof PointerEvent)) return;
          state.ambientPointerX = Math.round(event.clientX);
          state.ambientPointerY = Math.round(event.clientY);
          queuePointerFlush();
        },
        { passive: true }
      );

      window.addEventListener(
        "resize",
        () => {
          if (state.ambientPointerX <= 0 || state.ambientPointerY <= 0) {
            state.ambientPointerX = Math.round(window.innerWidth * 0.5);
            state.ambientPointerY = Math.round(window.innerHeight * 0.26);
          }
          queuePointerFlush();
        },
        { passive: true }
      );

      queuePointerFlush();
    }
  }

  function ensureRuntimeMotionStyles() {
    if (document.getElementById("expense-split-runtime-motion-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-motion-style";
    style.textContent = `
      #root.runtime-page-enter {
        animation: runtimePageFadeIn 0.38s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      .runtime-motion-card {
        transition:
          transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1),
          box-shadow 0.24s ease,
          border-color 0.24s ease;
        will-change: transform;
      }
      .runtime-motion-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14);
      }
      body.runtime-dark .runtime-motion-card:hover {
        box-shadow: 0 18px 42px rgba(2, 6, 23, 0.52);
      }
      .runtime-motion-panel {
        position: relative;
        overflow: hidden;
        isolation: isolate;
      }
      .runtime-motion-panel::after {
        content: "";
        position: absolute;
        top: -55%;
        left: -34%;
        width: 42%;
        height: 210%;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(
          120deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.16) 50%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translate3d(-16%, 0, 0) rotate(18deg);
        transition:
          transform 0.68s cubic-bezier(0.22, 0.61, 0.36, 1),
          opacity 0.26s ease;
      }
      .runtime-motion-panel:hover::after {
        opacity: 0.56;
        transform: translate3d(340%, 0, 0) rotate(18deg);
      }
      body.runtime-dark .runtime-motion-panel::after {
        background: linear-gradient(
          120deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.22) 50%,
          rgba(255, 255, 255, 0) 100%
        );
      }
      .runtime-motion-btn {
        transition:
          transform 0.18s ease,
          filter 0.18s ease,
          box-shadow 0.18s ease;
        will-change: transform;
      }
      .runtime-motion-btn:hover {
        transform: translateY(-1px);
        filter: saturate(1.03);
      }
      .runtime-motion-btn:active {
        transform: translateY(0) scale(0.99);
      }
      .runtime-motion-row {
        position: relative;
        transition:
          transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1),
          box-shadow 0.24s ease,
          border-color 0.24s ease,
          background 0.24s ease;
        will-change: transform;
      }
      .runtime-motion-row::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(
          96deg,
          rgba(6, 182, 212, 0.08) 0%,
          rgba(255, 255, 255, 0) 34%,
          rgba(16, 185, 129, 0.08) 100%
        );
        transform: scale(0.986);
        transition:
          opacity 0.24s ease,
          transform 0.24s ease;
      }
      .runtime-motion-row:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
      }
      .runtime-motion-row:hover::after {
        opacity: 1;
        transform: scale(1);
      }
      body.runtime-dark .runtime-motion-row:hover {
        box-shadow: 0 16px 28px rgba(2, 6, 23, 0.34);
      }
      .runtime-motion-nav {
        position: relative;
        transition:
          transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
          color 0.22s ease,
          border-color 0.22s ease,
          background 0.22s ease,
          box-shadow 0.22s ease;
      }
      .runtime-motion-nav:hover {
        transform: translateX(3px);
      }
      .runtime-motion-nav::after {
        content: "";
        position: absolute;
        left: 10px;
        right: 10px;
        bottom: 6px;
        height: 1px;
        border-radius: 999px;
        opacity: 0;
        transform: scaleX(0.4);
        transform-origin: left center;
        background: linear-gradient(90deg, rgba(6, 182, 212, 0.92), rgba(16, 185, 129, 0.82));
        transition:
          opacity 0.2s ease,
          transform 0.24s ease;
      }
      .runtime-motion-nav:hover::after,
      .runtime-motion-nav.active::after,
      .runtime-motion-nav[aria-current="page"]::after {
        opacity: 0.9;
        transform: scaleX(1);
      }
      .runtime-motion-pill {
        transition:
          transform 0.18s ease,
          box-shadow 0.2s ease,
          border-color 0.2s ease;
        will-change: transform;
      }
      .runtime-motion-pill:hover {
        transform: translateY(-1px) scale(1.02);
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
      }
      body.runtime-dark .runtime-motion-pill:hover {
        box-shadow: 0 10px 20px rgba(2, 6, 23, 0.28);
      }
      .runtime-motion-field {
        transition:
          transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
          box-shadow 0.22s ease;
      }
      .runtime-motion-field:focus-within {
        transform: translateY(-1px);
        box-shadow: 0 14px 30px rgba(6, 182, 212, 0.12);
      }
      .drawer.open .drawer-overlay,
      .modal-backdrop {
        animation: runtimeBackdropFadeIn 0.24s ease both;
      }
      .drawer.open .drawer-panel {
        animation: runtimeDrawerPanelIn 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      .modal-card {
        transform-origin: 50% 18%;
        animation: runtimeModalCardIn 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      .qr-panel,
      .progress-track,
      .metric-card,
      .dropzone,
      .preview-stats article,
      .member-tag,
      .batch-toolbar {
        position: relative;
        overflow: hidden;
      }
      .qr-panel::after,
      .dropzone::after,
      .metric-card::after,
      .preview-stats article::after,
      .member-tag::after {
        content: "";
        position: absolute;
        inset: -28%;
        pointer-events: none;
        opacity: 0.16;
        background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 58%);
        transform: translate3d(0, 0, 0) scale(1);
        animation: runtimeSurfaceAura 6.2s ease-in-out infinite;
      }
      .qr-panel::after {
        opacity: 0.22;
        background:
          radial-gradient(circle at 26% 28%, rgba(16, 185, 129, 0.26), rgba(16, 185, 129, 0) 44%),
          radial-gradient(circle at 72% 68%, rgba(6, 182, 212, 0.18), rgba(6, 182, 212, 0) 40%);
        animation-duration: 5.4s;
      }
      .progress-track::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.65;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.22) 48%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translateX(-120%);
        animation: runtimeTrackSweep 2.6s linear infinite;
      }
      .batch-toolbar {
        animation: runtimeToolbarFloatIn 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      .runtime-notify-panel {
        transform-origin: top right;
        animation: runtimeNotifyPanelIn 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      .runtime-notify-panel::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        border-radius: inherit;
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 34%);
        opacity: 0.9;
      }
      .runtime-notify-item {
        position: relative;
        overflow: hidden;
      }
      .runtime-notify-item.runtime-notify-item-enter {
        opacity: 0;
        transform: translateY(8px) scale(0.985);
        animation: runtimeNotifyItemIn 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        animation-delay: var(--runtime-notify-delay, 0ms);
      }
      .runtime-notify-item::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        opacity: 0;
        background: linear-gradient(90deg, rgba(6, 182, 212, 0.8), rgba(16, 185, 129, 0.75));
        transform: scaleX(0.2);
        transform-origin: left center;
        transition:
          opacity 0.22s ease,
          transform 0.26s ease;
      }
      .runtime-notify-item:hover::after {
        opacity: 0.9;
        transform: scaleX(1);
      }
      .runtime-bell-unread {
        position: relative;
        animation: runtimeBellNudge 2.8s ease-in-out infinite;
      }
      .runtime-bell-unread::after {
        content: "";
        position: absolute;
        inset: -5px;
        border-radius: 999px;
        pointer-events: none;
        border: 1px solid rgba(6, 182, 212, 0.3);
        opacity: 0;
        animation: runtimeBellRing 2.8s ease-in-out infinite;
      }
      .runtime-feature-card::before,
      .runtime-feature-card::after {
        content: "";
        position: absolute;
        pointer-events: none;
        border-radius: 28px;
      }
      .runtime-feature-card::before {
        inset: -20% auto auto -18%;
        width: 180px;
        height: 180px;
        opacity: 0.26;
        filter: blur(10px);
        background: radial-gradient(circle, rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0) 66%);
        animation: runtimeFeatureCardFloat 8.2s ease-in-out infinite;
      }
      .runtime-feature-card::after {
        right: -28px;
        bottom: -34px;
        width: 150px;
        height: 150px;
        opacity: 0.22;
        filter: blur(12px);
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0));
        animation: runtimeFeatureCardTilt 9.4s ease-in-out infinite;
      }
      .runtime-feature-card.runtime-3d-card.runtime-3d-active::before {
        opacity: 0.34;
      }
      .runtime-feature-card.runtime-feature-filters .runtime-product-title,
      .runtime-feature-card.runtime-feature-filters .runtime-onboard-progress {
        text-shadow: 0 10px 18px rgba(6, 182, 212, 0.18);
      }
      .runtime-feature-card.runtime-feature-onboarding .runtime-product-title,
      .runtime-feature-card.runtime-feature-onboarding .runtime-onboard-progress {
        text-shadow: 0 10px 18px rgba(16, 185, 129, 0.16);
      }
      .runtime-feature-card.runtime-feature-ai .runtime-product-title,
      .runtime-feature-card.runtime-feature-ai .runtime-ai-pill {
        text-shadow: 0 10px 18px rgba(6, 182, 212, 0.18);
      }
      .runtime-ops-launcher,
      .runtime-settle-launcher {
        animation: runtimeOpsLauncherFloat 5.6s ease-in-out infinite;
      }
      .runtime-ops-launcher[data-runtime-ops-state="warn"] {
        animation:
          runtimeOpsLauncherFloat 5.6s ease-in-out infinite,
          runtimeOpsLauncherAlert 2.8s ease-in-out infinite;
      }
      .runtime-settle-launcher[data-runtime-settle-state="pending"] {
        animation:
          runtimeOpsLauncherFloat 5.6s ease-in-out infinite,
          runtimeOpsLauncherAlert 2.8s ease-in-out infinite;
      }
      .runtime-ops-flyout .runtime-product-card,
      .runtime-settle-flyout .runtime-product-card {
        transform-origin: left bottom;
      }
      #root.runtime-route-leaving {
        animation: runtimeRouteFadeOut 0.18s ease both;
      }
      .runtime-route-overlay {
        position: fixed;
        inset: 0;
        z-index: 10040;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.18s ease;
      }
      .runtime-route-overlay.visible {
        opacity: 1;
      }
      .runtime-route-overlay-glow {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 18% 10%, rgba(6, 182, 212, 0.14), transparent 28%),
          radial-gradient(circle at 82% 14%, rgba(16, 185, 129, 0.12), transparent 30%),
          linear-gradient(180deg, rgba(2, 6, 23, 0.08), rgba(2, 6, 23, 0));
        backdrop-filter: blur(1.5px);
      }
      .runtime-route-overlay-bar {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 3px;
        background: linear-gradient(90deg, rgba(6, 182, 212, 0.92), rgba(16, 185, 129, 0.86));
        transform-origin: left center;
        animation: runtimeRouteBarSweep 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      .recharts-wrapper {
        overflow: visible;
      }
      .recharts-wrapper .runtime-chart-grid {
        opacity: 0;
        animation: runtimeChartGridIn 0.6s ease forwards;
        animation-delay: var(--runtime-chart-delay, 0ms);
      }
      .recharts-wrapper .runtime-chart-bar,
      .recharts-wrapper .runtime-chart-sector,
      .recharts-wrapper .runtime-chart-line,
      .recharts-wrapper .runtime-chart-dot,
      .recharts-wrapper .runtime-chart-label {
        opacity: 0;
        animation-delay: var(--runtime-chart-delay, 0ms);
        animation-fill-mode: forwards;
      }
      .recharts-wrapper .runtime-chart-bar {
        transform-box: fill-box;
        transform-origin: center bottom;
        animation-name: runtimeChartBarIn;
        animation-duration: 0.64s;
        animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .recharts-wrapper .runtime-chart-sector {
        transform-box: fill-box;
        transform-origin: center center;
        animation-name: runtimeChartSectorIn;
        animation-duration: 0.72s;
        animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .recharts-wrapper .runtime-chart-line {
        transform-box: fill-box;
        transform-origin: center center;
        animation-name: runtimeChartLineIn;
        animation-duration: 0.78s;
        animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .recharts-wrapper .runtime-chart-dot {
        transform-box: fill-box;
        transform-origin: center center;
        animation-name: runtimeChartDotIn;
        animation-duration: 0.5s;
        animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .recharts-wrapper .runtime-chart-label {
        animation-name: runtimeChartLabelIn;
        animation-duration: 0.5s;
        animation-timing-function: ease;
      }
      .recharts-wrapper .recharts-tooltip-wrapper {
        transition:
          transform 0.18s ease,
          opacity 0.18s ease,
          filter 0.18s ease;
      }
      .recharts-wrapper:hover .recharts-tooltip-wrapper {
        filter: drop-shadow(0 8px 18px rgba(2, 6, 23, 0.18));
      }
      .runtime-skeleton-list {
        display: grid;
        gap: 0.62rem;
      }
      .runtime-skeleton-row {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 0.74rem;
        min-height: 62px;
        padding: 0.72rem;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        background: rgba(248, 250, 252, 0.8);
      }
      .runtime-skeleton-row.compact {
        min-height: 54px;
      }
      .runtime-skeleton-avatar,
      .runtime-skeleton-line,
      .runtime-skeleton-chip,
      .runtime-loading-copy {
        position: relative;
        overflow: hidden;
        background: rgba(148, 163, 184, 0.18);
      }
      .runtime-skeleton-avatar::after,
      .runtime-skeleton-line::after,
      .runtime-skeleton-chip::after,
      .runtime-loading-copy::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(
          100deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.46) 48%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translateX(-120%);
        animation: runtimeSkeletonShimmer 1.3s linear infinite;
      }
      .runtime-skeleton-avatar {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        flex: 0 0 auto;
      }
      .runtime-skeleton-lines {
        min-width: 0;
        flex: 1;
        display: grid;
        gap: 0.42rem;
      }
      .runtime-skeleton-line {
        display: block;
        height: 11px;
        border-radius: 999px;
      }
      .runtime-skeleton-line.short {
        width: 62%;
      }
      .runtime-skeleton-chip {
        width: 64px;
        height: 14px;
        border-radius: 999px;
        flex: 0 0 auto;
      }
      .runtime-loading-copy {
        display: inline-flex;
        color: transparent !important;
        border-radius: 999px;
        min-width: 92px;
      }
      body.runtime-dark .runtime-skeleton-row {
        border-color: rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.74);
      }
      body.runtime-dark .runtime-skeleton-avatar,
      body.runtime-dark .runtime-skeleton-line,
      body.runtime-dark .runtime-skeleton-chip,
      body.runtime-dark .runtime-loading-copy {
        background: rgba(148, 163, 184, 0.16);
      }
      .runtime-empty-state {
        position: relative;
        overflow: hidden;
        display: grid;
        gap: 0.56rem;
        justify-items: start;
        padding: 0.92rem;
        border: 1px dashed rgba(148, 163, 184, 0.32);
        border-radius: 14px;
        background:
          linear-gradient(180deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.92));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
      }
      .runtime-empty-state.compact {
        padding: 0.76rem;
        gap: 0.42rem;
      }
      .runtime-empty-state::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(circle at 18% 16%, rgba(6, 182, 212, 0.12), rgba(6, 182, 212, 0) 30%),
          radial-gradient(circle at 82% 84%, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0) 26%);
      }
      .runtime-empty-state-icon {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(6, 182, 212, 0.24);
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.14), rgba(16, 185, 129, 0.1));
        color: #0f172a;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
      }
      .runtime-empty-state.compact .runtime-empty-state-icon {
        width: 38px;
        height: 38px;
        border-radius: 11px;
      }
      .runtime-empty-state-copy {
        position: relative;
        display: grid;
        gap: 0.22rem;
      }
      .runtime-empty-state-title {
        font-size: 0.84rem;
        line-height: 1.3;
        font-weight: 700;
        color: #0f172a;
      }
      .runtime-empty-state-note {
        font-size: 0.73rem;
        line-height: 1.45;
        color: #64748b;
      }
      body.runtime-dark .runtime-empty-state {
        border-color: rgba(148, 163, 184, 0.24);
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(11, 18, 32, 0.92));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      body.runtime-dark .runtime-empty-state-icon {
        color: #d9faff;
        border-color: rgba(6, 182, 212, 0.28);
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.14), rgba(16, 185, 129, 0.12));
        box-shadow: 0 12px 24px rgba(2, 6, 23, 0.28);
      }
      body.runtime-dark .runtime-empty-state-title {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-empty-state-note {
        color: #94a3b8;
      }
      .runtime-success-pulse {
        animation: runtimeSuccessPulse 0.64s cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .runtime-success-pulse.runtime-mini-btn,
      .runtime-success-pulse.runtime-notify-btn,
      .runtime-success-pulse button {
        box-shadow:
          0 0 0 0 rgba(16, 185, 129, 0.34),
          0 10px 24px rgba(16, 185, 129, 0.18);
      }
      .runtime-success-surface {
        position: relative;
        overflow: hidden;
      }
      .runtime-success-surface::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(
          105deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.18) 42%,
          rgba(16, 185, 129, 0.16) 52%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translateX(-120%);
      }
      .runtime-success-surface.runtime-success-pulse::after {
        animation: runtimeSuccessSweep 0.7s cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .runtime-avatar-upload-btn {
        border: 1px solid rgba(148, 163, 184, 0.34);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.9);
        color: #0f172a;
        font-size: 0.74rem;
        line-height: 1;
        font-weight: 700;
        padding: 0.45rem 0.78rem;
        transition:
          border-color 0.16s ease,
          box-shadow 0.16s ease,
          transform 0.16s ease;
      }
      .runtime-avatar-upload-btn:hover {
        border-color: rgba(6, 182, 212, 0.5);
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
        transform: translateY(-1px);
      }
      .runtime-avatar-upload-btn:focus-visible {
        outline: none;
        border-color: rgba(6, 182, 212, 0.68);
        box-shadow:
          0 0 0 2px rgba(6, 182, 212, 0.14),
          0 12px 24px rgba(15, 23, 42, 0.12);
      }
      body.runtime-dark .runtime-avatar-upload-btn {
        border-color: rgba(148, 163, 184, 0.32);
        background: rgba(15, 23, 42, 0.74);
        color: #e2e8f0;
      }
      body.runtime-dark .runtime-avatar-upload-btn:hover {
        border-color: rgba(6, 182, 212, 0.55);
        box-shadow: 0 14px 30px rgba(2, 6, 23, 0.44);
      }
      .runtime-avatar-image-badge {
        background-position: center;
        background-repeat: no-repeat;
        background-size: cover;
        color: transparent !important;
      }
      .runtime-3d-shell {
        perspective: 1350px;
      }
      body.runtime-motion-subtle .runtime-3d-shell {
        perspective: 1750px;
      }
      body.runtime-motion-cinematic .runtime-3d-shell {
        perspective: 1500px;
      }
      body.runtime-motion-dramatic .runtime-3d-shell {
        perspective: 1250px;
      }
      .runtime-3d-card {
        position: relative;
        transform-style: preserve-3d;
        backface-visibility: hidden;
        --runtime-3d-rx: 0deg;
        --runtime-3d-ry: 0deg;
        --runtime-3d-lift: 0px;
        --runtime-3d-scale: 1;
        --runtime-3d-shadow-x: 0px;
        --runtime-3d-shadow-y: 20px;
        --runtime-3d-shadow-blur: 44px;
        --runtime-3d-shadow-alpha: 0.14;
        --runtime-3d-shadow-color: 15, 23, 42;
        --runtime-3d-active-scale: 1.02;
        --runtime-3d-active-lift: 12px;
        --runtime-3d-active-shadow-alpha: 0.32;
        transform: translate3d(0, calc(-1 * var(--runtime-3d-lift)), 0)
          rotateX(var(--runtime-3d-rx))
          rotateY(var(--runtime-3d-ry))
          scale3d(var(--runtime-3d-scale), var(--runtime-3d-scale), var(--runtime-3d-scale));
        box-shadow: var(--runtime-3d-shadow-x) var(--runtime-3d-shadow-y) var(--runtime-3d-shadow-blur)
          rgba(var(--runtime-3d-shadow-color), var(--runtime-3d-shadow-alpha));
        transition:
          transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1),
          box-shadow 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      .runtime-motion-card.runtime-3d-card:hover {
        transform: translate3d(0, calc(-1 * var(--runtime-3d-lift)), 0)
          rotateX(var(--runtime-3d-rx))
          rotateY(var(--runtime-3d-ry))
          scale3d(var(--runtime-3d-scale), var(--runtime-3d-scale), var(--runtime-3d-scale));
      }
      .runtime-3d-card.runtime-3d-active {
        --runtime-3d-scale: var(--runtime-3d-active-scale);
        --runtime-3d-lift: var(--runtime-3d-active-lift);
        --runtime-3d-shadow-alpha: var(--runtime-3d-active-shadow-alpha);
        transition: transform 0.12s linear, box-shadow 0.18s ease;
      }
      body.runtime-motion-subtle .runtime-3d-card {
        --runtime-3d-active-scale: 1.008;
        --runtime-3d-active-lift: 7px;
        --runtime-3d-active-shadow-alpha: 0.22;
      }
      body.runtime-motion-cinematic .runtime-3d-card {
        --runtime-3d-active-scale: 1.014;
        --runtime-3d-active-lift: 9px;
        --runtime-3d-active-shadow-alpha: 0.27;
      }
      body.runtime-motion-dramatic .runtime-3d-card {
        --runtime-3d-active-scale: 1.02;
        --runtime-3d-active-lift: 12px;
        --runtime-3d-active-shadow-alpha: 0.32;
      }
      .runtime-3d-card .runtime-3d-layer {
        transform-style: preserve-3d;
        backface-visibility: hidden;
        translate: 0 0 0;
        transition: translate 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
        will-change: translate;
      }
      .runtime-3d-card.runtime-3d-active .runtime-3d-layer {
        transition: translate 0.12s linear;
      }
      .runtime-3d-card::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(
          circle at var(--runtime-3d-x, 50%) var(--runtime-3d-y, 50%),
          rgba(255, 255, 255, 0.34) 0%,
          rgba(255, 255, 255, 0.13) 22%,
          rgba(255, 255, 255, 0) 52%
        );
        transition: opacity 0.24s ease;
      }
      .runtime-3d-card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(
          120deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.23) 46%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translateX(var(--runtime-3d-sheen-shift, 0%));
        transition: opacity 0.24s ease, transform 0.3s ease;
      }
      .runtime-3d-card.runtime-3d-active::after {
        opacity: 1;
      }
      .runtime-3d-card.runtime-3d-active::before {
        opacity: 1;
      }
      body.runtime-dark .runtime-3d-card {
        --runtime-3d-shadow-color: 2, 6, 23;
        --runtime-3d-shadow-alpha: 0.48;
      }
      body.runtime-dark .runtime-3d-card.runtime-3d-active {
        --runtime-3d-shadow-alpha: 0.72;
      }
      body.runtime-dark.runtime-motion-subtle .runtime-3d-card.runtime-3d-active {
        --runtime-3d-shadow-alpha: 0.56;
      }
      body.runtime-dark.runtime-motion-cinematic .runtime-3d-card.runtime-3d-active {
        --runtime-3d-shadow-alpha: 0.64;
      }
      .runtime-reveal {
        opacity: 0;
        transform: translateY(14px) scale(0.995);
        transition:
          opacity 0.5s cubic-bezier(0.22, 0.61, 0.36, 1),
          transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
        transition-delay: var(--runtime-reveal-delay, 0ms);
        will-change: opacity, transform;
      }
      .runtime-reveal.in-view {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .runtime-reveal.runtime-reveal-soft {
        transform: translateY(10px) scale(0.998);
      }
      .runtime-reveal.runtime-reveal-soft.in-view {
        transform: translateY(0) scale(1);
      }
      @keyframes runtimePageFadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes runtimeBackdropFadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes runtimeDrawerPanelIn {
        from {
          opacity: 0.72;
          transform: translate3d(24px, 0, 0) scale(0.992);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }
      @keyframes runtimeModalCardIn {
        from {
          opacity: 0;
          transform: translateY(16px) scale(0.975);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes runtimeRouteFadeOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0.94;
          transform: translateY(3px);
        }
      }
      @keyframes runtimeRouteBarSweep {
        from {
          transform: scaleX(0.08);
          opacity: 0.8;
        }
        to {
          transform: scaleX(1);
          opacity: 1;
        }
      }
      @keyframes runtimeNotifyPanelIn {
        from {
          opacity: 0;
          transform: translate3d(0, -10px, 0) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }
      @keyframes runtimeNotifyItemIn {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes runtimeBellNudge {
        0%,
        100%,
        88% {
          transform: translate3d(0, 0, 0);
        }
        90% {
          transform: translate3d(-1px, 0, 0) rotate(-5deg);
        }
        94% {
          transform: translate3d(1px, 0, 0) rotate(5deg);
        }
      }
      @keyframes runtimeBellRing {
        0%,
        82%,
        100% {
          opacity: 0;
          transform: scale(0.86);
        }
        88% {
          opacity: 0.44;
          transform: scale(1);
        }
        96% {
          opacity: 0;
          transform: scale(1.22);
        }
      }
      @keyframes runtimeSurfaceAura {
        0%,
        100% {
          opacity: 0.1;
          transform: translate3d(-2%, -1%, 0) scale(1);
        }
        50% {
          opacity: 0.22;
          transform: translate3d(2%, 2%, 0) scale(1.04);
        }
      }
      @keyframes runtimeTrackSweep {
        0% {
          transform: translateX(-120%);
        }
        100% {
          transform: translateX(140%);
        }
      }
      @keyframes runtimeToolbarFloatIn {
        from {
          opacity: 0;
          transform: translate3d(-50%, 10px, 0) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translate3d(-50%, 0, 0) scale(1);
        }
      }
      @keyframes runtimeChartGridIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes runtimeChartBarIn {
        from {
          opacity: 0;
          transform: translateY(10px) scaleY(0.16);
        }
        to {
          opacity: 1;
          transform: translateY(0) scaleY(1);
        }
      }
      @keyframes runtimeChartSectorIn {
        from {
          opacity: 0;
          transform: scale(0.82);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes runtimeChartLineIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes runtimeChartDotIn {
        from {
          opacity: 0;
          transform: scale(0.4);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes runtimeChartLabelIn {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes runtimeSkeletonShimmer {
        0% {
          transform: translateX(-120%);
        }
        100% {
          transform: translateX(140%);
        }
      }
      @keyframes runtimeSuccessPulse {
        0% {
          transform: scale(1);
        }
        35% {
          transform: scale(1.018);
        }
        100% {
          transform: scale(1);
        }
      }
      @keyframes runtimeSuccessSweep {
        0% {
          opacity: 0;
          transform: translateX(-120%);
        }
        16% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          transform: translateX(140%);
        }
      }
      @keyframes runtimeFeatureCardFloat {
        0%, 100% {
          transform: translate3d(0, 0, 0) scale(1);
        }
        50% {
          transform: translate3d(20px, 16px, 0) scale(1.08);
        }
      }
      @keyframes runtimeFeatureCardTilt {
        0%, 100% {
          transform: translate3d(0, 0, 0) rotate(0deg);
        }
        50% {
          transform: translate3d(-10px, -12px, 0) rotate(8deg);
        }
      }
      @keyframes runtimeOpsLauncherFloat {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-4px);
        }
      }
      @keyframes runtimeOpsLauncherAlert {
        0%, 100% {
          box-shadow: 0 16px 34px rgba(2, 6, 23, 0.18);
        }
        50% {
          box-shadow: 0 18px 38px rgba(245, 158, 11, 0.24);
        }
      }
      @keyframes runtimeAiJobPulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.18);
        }
        50% {
          box-shadow: 0 0 0 6px rgba(6, 182, 212, 0.04);
        }
      }
      @keyframes runtimeAiJobSweep {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
      @keyframes runtimeFeatureRowIn {
        from {
          opacity: 0;
          transform: translate3d(0, 10px, 0) scale(0.988);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }
      @keyframes runtimeOnboardPillPulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.08);
        }
        50% {
          box-shadow: 0 0 0 6px rgba(6, 182, 212, 0.03);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #root.runtime-page-enter {
          animation: none !important;
        }
        .runtime-motion-card,
        .runtime-motion-panel,
        .runtime-motion-row,
        .runtime-motion-nav,
        .runtime-motion-pill,
        .runtime-motion-field,
        .runtime-motion-btn,
        .runtime-ai-job-status,
        .runtime-feature-row,
        .runtime-onboard-progress,
        .runtime-3d-card,
        .runtime-3d-layer,
        .runtime-reveal,
        .runtime-ops-launcher,
        .runtime-settle-launcher {
          transition: none !important;
          animation: none !important;
          transform: none !important;
          opacity: 1 !important;
        }
        .runtime-motion-panel::after,
        .runtime-motion-row::after,
        .runtime-motion-nav::after,
        .runtime-notify-panel::before,
        .runtime-notify-item::after,
        .qr-panel::after,
        .dropzone::after,
        .metric-card::after,
        .preview-stats article::after,
        .member-tag::after,
        .progress-track::after,
        .runtime-ai-job-bar-fill::after,
        .runtime-bell-unread::after,
        .runtime-feature-card::before,
        .runtime-feature-card::after,
        .runtime-skeleton-avatar::after,
        .runtime-skeleton-line::after,
        .runtime-skeleton-chip::after,
        .runtime-loading-copy::after,
        .runtime-success-surface::after,
        .runtime-card-progress-fill::after {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isReducedMotionPreferred() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function clearRuntimeMotionObserver() {
    if (state.motionObserver && typeof state.motionObserver.disconnect === "function") {
      state.motionObserver.disconnect();
    }
    state.motionObserver = null;
  }

  function gatherUniqueNodes(selector, root, limit = 120) {
    const nodes = Array.from(root.querySelectorAll(selector));
    const unique = [];
    const seen = new Set();
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (seen.has(node)) continue;
      seen.add(node);
      unique.push(node);
      if (unique.length >= limit) break;
    }
    return unique;
  }

  function filterMotionNodes(nodes, options = {}) {
    const { minWidth = 0, minHeight = 0, max = 120 } = options;
    const filtered = [];
    const seen = new Set();
    const safeNodes = Array.isArray(nodes) ? nodes : [];

    for (const node of safeNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (seen.has(node)) continue;
      if (node.closest(".runtime-toast-stack, .runtime-notify-panel")) continue;

      const rect = node.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) continue;
      if (rect.width < minWidth || rect.height < minHeight) continue;
      if (rect.width <= 1 || rect.height <= 1) continue;

      seen.add(node);
      filtered.push(node);
      if (filtered.length >= max) break;
    }

    return filtered;
  }

  function supportsRuntime3DMotion() {
    if (isReducedMotionPreferred()) return false;
    if (!window.matchMedia) return false;
    return window.matchMedia("(pointer: fine)").matches;
  }

  function bindRuntime3DCard(card) {
    if (!(card instanceof HTMLElement)) return;
    if (card.dataset.runtime3dBound === "1") return;
    if (!supportsRuntime3DMotion()) return;

    card.dataset.runtime3dBound = "1";
    card.classList.add("runtime-3d-shell", "runtime-3d-card");

    const layerConfig = [
      { selector: "h1, h2, h3, h4, h5, h6, .font-bold, .font-semibold", depth: 30, weight: 1.05 },
      { selector: "button, a, .inline-flex, .rounded-full, .badge", depth: 42, weight: 1.35 },
      { selector: "img, svg, input, textarea, select", depth: 24, weight: 0.9 },
      { selector: "p, span, .text-sm, .text-xs, .text-base", depth: 16, weight: 0.68 },
    ];
    const layeredNodes = [];
    const seen = new Set();
    for (const config of layerConfig) {
      const matches = Array.from(card.querySelectorAll(config.selector));
      for (const node of matches) {
        if (!(node instanceof HTMLElement)) continue;
        if (node === card) continue;
        if (node.closest(".runtime-toast-stack, .runtime-notify-panel")) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        node.classList.add("runtime-3d-layer");
        layeredNodes.push({
          node,
          baseDepth: Number(config.depth || 0),
          baseWeight: Number(config.weight || 1),
        });
        if (layeredNodes.length >= 18) break;
      }
      if (layeredNodes.length >= 18) break;
    }

    const initialProfile = getMotionProfile();
    const settleThreshold = 0.02;
    const motion = {
      active: false,
      raf: 0,
      currentRX: 0,
      currentRY: 0,
      targetRX: 0,
      targetRY: 0,
      currentX: 50,
      currentY: 50,
      targetX: 50,
      targetY: 50,
      currentSheen: 0,
      targetSheen: 0,
      currentShadowX: 0,
      currentShadowY: Number(initialProfile.shadowYBase || 20),
      targetShadowX: 0,
      targetShadowY: Number(initialProfile.shadowYBase || 20),
      currentShadowBlur: Number(initialProfile.shadowBlurBase || 44),
      targetShadowBlur: Number(initialProfile.shadowBlurBase || 44),
    };

    const render = () => {
      const profile = getMotionProfile();
      const damping = Number(profile.damping || 0.16);
      motion.currentRX += (motion.targetRX - motion.currentRX) * damping;
      motion.currentRY += (motion.targetRY - motion.currentRY) * damping;
      motion.currentX += (motion.targetX - motion.currentX) * (damping * 0.9);
      motion.currentY += (motion.targetY - motion.currentY) * (damping * 0.9);
      motion.currentSheen += (motion.targetSheen - motion.currentSheen) * (damping * 0.8);
      motion.currentShadowX += (motion.targetShadowX - motion.currentShadowX) * (damping * 0.82);
      motion.currentShadowY += (motion.targetShadowY - motion.currentShadowY) * (damping * 0.82);
      motion.currentShadowBlur += (motion.targetShadowBlur - motion.currentShadowBlur) * (damping * 0.78);

      card.style.setProperty("--runtime-3d-rx", `${motion.currentRX.toFixed(2)}deg`);
      card.style.setProperty("--runtime-3d-ry", `${motion.currentRY.toFixed(2)}deg`);
      card.style.setProperty("--runtime-3d-x", `${Math.max(0, Math.min(100, motion.currentX)).toFixed(1)}%`);
      card.style.setProperty("--runtime-3d-y", `${Math.max(0, Math.min(100, motion.currentY)).toFixed(1)}%`);
      card.style.setProperty("--runtime-3d-sheen-shift", `${motion.currentSheen.toFixed(1)}%`);
      card.style.setProperty("--runtime-3d-shadow-x", `${motion.currentShadowX.toFixed(2)}px`);
      card.style.setProperty("--runtime-3d-shadow-y", `${motion.currentShadowY.toFixed(2)}px`);
      card.style.setProperty("--runtime-3d-shadow-blur", `${motion.currentShadowBlur.toFixed(2)}px`);

      if (layeredNodes.length) {
        for (const layer of layeredNodes) {
          const layerWeight = Number(layer.baseWeight || 1) * Number(profile.layerWeightMultiplier || 1);
          const layerDepth = Number(layer.baseDepth || 0) * Number(profile.layerDepthMultiplier || 1);
          const layerMotionScale = 0.22 * Number(profile.layerMotionScale || 1);
          const offsetX = motion.currentRY * layerMotionScale * layerWeight;
          const offsetY = -motion.currentRX * layerMotionScale * layerWeight;
          layer.node.style.setProperty(
            "translate",
            `${offsetX.toFixed(2)}px ${offsetY.toFixed(2)}px ${layerDepth.toFixed(2)}px`
          );
        }
      }

      const nearRest =
        Math.abs(motion.targetRX - motion.currentRX) < settleThreshold &&
        Math.abs(motion.targetRY - motion.currentRY) < settleThreshold &&
        Math.abs(motion.targetX - motion.currentX) < 0.2 &&
        Math.abs(motion.targetY - motion.currentY) < 0.2;

      if (!motion.active && nearRest) {
        motion.raf = 0;
        return;
      }

      motion.raf = window.requestAnimationFrame(render);
    };

    const queueRender = () => {
      if (motion.raf) return;
      motion.raf = window.requestAnimationFrame(render);
    };

    const reset = () => {
      const profile = getMotionProfile();
      motion.active = false;
      motion.targetRX = 0;
      motion.targetRY = 0;
      motion.targetX = 50;
      motion.targetY = 50;
      motion.targetSheen = 0;
      motion.targetShadowX = 0;
      motion.targetShadowY = Number(profile.shadowYBase || 20);
      motion.targetShadowBlur = Number(profile.shadowBlurBase || 44);
      card.classList.remove("runtime-3d-active");
      queueRender();
    };

    const move = (event) => {
      if (!(event instanceof PointerEvent)) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const px = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const py = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const ratioX = px / rect.width;
      const ratioY = py / rect.height;
      const profile = getMotionProfile();
      const maxTilt = Number(profile.maxTilt || 13.5);

      motion.active = true;
      motion.targetRY = (ratioX - 0.5) * maxTilt * 2;
      motion.targetRX = (0.5 - ratioY) * maxTilt * 2;
      motion.targetX = ratioX * 100;
      motion.targetY = ratioY * 100;
      motion.targetSheen = (ratioX - 0.5) * Number(profile.sheenMultiplier || 36);
      motion.targetShadowX = motion.targetRY * Number(profile.shadowXFactor || -2.4);
      motion.targetShadowY =
        Number(profile.shadowYBase || 24) + Math.abs(motion.targetRX) * Number(profile.shadowYTiltFactor || 1.1);
      motion.targetShadowBlur =
        Number(profile.shadowBlurBase || 52) +
        (Math.abs(motion.targetRX) + Math.abs(motion.targetRY)) * Number(profile.shadowBlurFactor || 1.0);

      card.classList.add("runtime-3d-active");
      queueRender();
    };

    card.addEventListener("pointerenter", move, { passive: true });
    card.addEventListener("pointermove", move, { passive: true });
    card.addEventListener("pointerleave", reset, { passive: true });
    card.addEventListener("blur", reset, { passive: true });
    reset();
  }

  function installRuntime3DCards(cards) {
    if (!supportsRuntime3DMotion()) return;
    const safeCards = Array.isArray(cards) ? cards : [];
    for (let i = 0; i < safeCards.length; i += 1) {
      const card = safeCards[i];
      if (!(card instanceof HTMLElement)) continue;
      if (card.closest(".runtime-notify-panel, .runtime-toast-stack")) continue;
      bindRuntime3DCard(card);
    }
  }

  function installRuntimeChartMotion(root) {
    const scope = root instanceof HTMLElement ? root : document;
    const wrappers = Array.from(scope.querySelectorAll(".recharts-wrapper"));

    for (const wrapper of wrappers) {
      if (!(wrapper instanceof HTMLElement)) continue;
      const signature = `${wrapper.querySelectorAll(".recharts-bar-rectangle, .recharts-sector, .recharts-line-curve, .recharts-dot").length}`;
      if (wrapper.dataset.runtimeChartSignature === signature) continue;
      wrapper.dataset.runtimeChartSignature = signature;

      const assign = (selector, className, step = 40) => {
        const nodes = Array.from(wrapper.querySelectorAll(selector));
        for (let i = 0; i < nodes.length; i += 1) {
          const node = nodes[i];
          if (!(node instanceof SVGElement) && !(node instanceof HTMLElement)) continue;
          node.classList.remove(className);
          void node.getBoundingClientRect();
          node.classList.add(className);
          node.style.setProperty("--runtime-chart-delay", `${Math.min(i * step, 260)}ms`);
        }
      };

      assign(".recharts-cartesian-grid line, .recharts-polar-grid line, .recharts-polar-grid circle, .recharts-polar-grid path", "runtime-chart-grid", 16);
      assign(".recharts-bar-rectangle path, .recharts-bar-rectangle rect", "runtime-chart-bar", 36);
      assign(".recharts-sector", "runtime-chart-sector", 46);
      assign(".recharts-line-curve, .recharts-area-area, .recharts-area-curve, .recharts-radar-polygon, .recharts-radial-bar-sector path", "runtime-chart-line", 60);
      assign(".recharts-dot, .recharts-scatter-symbol, .recharts-reference-dot", "runtime-chart-dot", 24);
      assign(".recharts-text, .recharts-label, .recharts-label-list text", "runtime-chart-label", 18);
    }
  }

  function applyRuntimeMotionTargets() {
    const root = document.getElementById("root");
    if (!(root instanceof HTMLElement)) return;

    const routeSignature = `${normalizePath(window.location.pathname)}|${window.location.search || ""}`;
    const routeChanged = routeSignature !== state.motionRouteSignature;
    if (routeChanged) {
      state.motionRouteSignature = routeSignature;
      root.classList.remove("runtime-page-enter");
      void root.offsetWidth;
      root.classList.add("runtime-page-enter");
      for (const prior of root.querySelectorAll(".runtime-reveal.in-view")) {
        prior.classList.remove("in-view");
      }
    }

    const cardTargets = filterMotionNodes(
      gatherUniqueNodes(
        "div.bg-white.rounded-2xl, div.shadow-card, div.rounded-2xl.shadow-card, div.rounded-xl.bg-gray-50, [role='dialog'], .auth-card, .verify-card, .welcome-card, .group-topbar, .group-card, .panel, .slate-panel, .metric-card, .qr-panel, .dropzone, .preview-stats article, .member-tag, .toast-item, aside[class], nav[class], section[class*='rounded'], article[class*='rounded'], div[class*='rounded-3xl'][class*='border'], div[class*='rounded-2xl'][class*='border'], div[class*='rounded-xl'][class*='border'], div[class*='rounded-3xl'][class*='shadow'], div[class*='rounded-2xl'][class*='shadow'], div[class*='rounded-xl'][class*='shadow']",
        root,
        220
      ),
      {
        minWidth: 180,
        minHeight: 64,
        max: 180,
      }
    );
    for (const card of cardTargets) {
      card.classList.add("runtime-motion-card", "runtime-motion-panel");
    }

    const premiumCards = cardTargets.filter((card) => {
      if (!(card instanceof HTMLElement)) return false;
      if (card.matches("nav, aside, .metric-card, .member-tag, .toast-item, .batch-toolbar, .preview-stats article")) {
        return false;
      }
      const rect = card.getBoundingClientRect();
      return rect.width >= 240 && rect.height >= 120;
    });
    installRuntime3DCards(premiumCards.slice(0, 48));

    const rowTargets = filterMotionNodes(
      gatherUniqueNodes(
        "main li, main tbody tr, main [role='row'], .expense-row, .history-row, .settlement-row, .leaderboard-row, .runtime-mini-row, .divide-y > div, .divide-y > a, .divide-y > button, [class*='space-y-'] > div, [class*='space-y-'] > a, [class*='space-y-'] > button",
        root,
        260
      ),
      {
        minWidth: 120,
        minHeight: 30,
        max: 220,
      }
    );
    for (const row of rowTargets) {
      row.classList.add("runtime-motion-row");
    }

    const navTargets = filterMotionNodes(
      gatherUniqueNodes("nav a, nav button, aside a, aside button, [role='tablist'] a, [role='tablist'] button", root, 140),
      {
        minWidth: 32,
        minHeight: 24,
        max: 120,
      }
    );
    for (const nav of navTargets) {
      nav.classList.add("runtime-motion-nav");
    }

    const pillTargets = filterMotionNodes(
      gatherUniqueNodes(
        "span[class*='rounded-full'], div[class*='rounded-full'], button[class*='rounded-full'], a[class*='rounded-full'], [class*='badge'], [class*='chip'], [class*='tag']",
        root,
        180
      ),
      {
        minWidth: 18,
        minHeight: 18,
        max: 140,
      }
    );
    for (const pill of pillTargets) {
      pill.classList.add("runtime-motion-pill");
    }

    const fieldTargets = filterMotionNodes(
      gatherUniqueNodes("form div, form label, [class*='search'] > div, [class*='search-bar']", root, 180),
      {
        minWidth: 120,
        minHeight: 20,
        max: 120,
      }
    );
    for (const field of fieldTargets) {
      if (!field.querySelector("input, textarea, select")) continue;
      field.classList.add("runtime-motion-field");
    }

    const buttonCandidates = gatherUniqueNodes("button, a", root, 220);
    for (const node of buttonCandidates) {
      if (node.closest(".runtime-toast-stack, .runtime-notify-panel")) continue;
      if (node instanceof HTMLButtonElement && node.classList.contains("runtime-toast-close")) continue;
      if (node instanceof HTMLButtonElement && node.disabled) continue;

      if (node instanceof HTMLAnchorElement) {
        const className = String(node.className || "");
        const role = String(node.getAttribute("role") || "");
        const isButtonLike = role === "button" || /rounded|btn|button|px-/.test(className);
        if (!isButtonLike) continue;
      }

      node.classList.add("runtime-motion-btn");
    }

    const revealTargets = filterMotionNodes(
      gatherUniqueNodes(
        "main > div, main > section, section, article, aside, li, tbody tr, [role='dialog'], .auth-card, .verify-card, .welcome-card, .group-topbar, .group-card, .panel, .slate-panel, .metric-card, .qr-panel, .dropzone, .preview-stats article, .member-tag, div.bg-white.rounded-2xl, div.shadow-card",
        root,
        220
      ),
      {
        minWidth: 120,
        minHeight: 24,
        max: 180,
      }
    );
    for (let i = 0; i < revealTargets.length; i += 1) {
      const node = revealTargets[i];
      node.classList.add("runtime-reveal");
      const rect = node.getBoundingClientRect();
      if (rect.height < 76) {
        node.classList.add("runtime-reveal-soft");
      }
      if (routeChanged || !node.style.getPropertyValue("--runtime-reveal-delay")) {
        node.style.setProperty("--runtime-reveal-delay", `${Math.min(i * 28, 420)}ms`);
      }
    }

    clearRuntimeMotionObserver();

    if (!("IntersectionObserver" in window)) {
      for (const node of revealTargets) {
        node.classList.add("in-view");
      }
      return;
    }

    state.motionObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    for (const node of revealTargets) {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.85) {
        node.classList.add("in-view");
      } else {
        state.motionObserver.observe(node);
      }
    }

    installRuntimeChartMotion(root);
  }

  function installRuntimeAnimations() {
    ensureRuntimeMotionStyles();
    if (isReducedMotionPreferred()) {
      clearRuntimeMotionObserver();
      return;
    }

    applyRuntimeMotionTargets();
    if (state.motionApplyTimer) {
      window.clearTimeout(state.motionApplyTimer);
    }
    state.motionApplyTimer = window.setTimeout(() => {
      state.motionApplyTimer = null;
      applyRuntimeMotionTargets();
    }, 220);
  }

  function readProfilePrefs() {
    const defaults = {
      currency: "INR",
      language: "English",
      darkMode: false,
      motionPreset: "dramatic",
    };

    try {
      const raw = window.localStorage.getItem(PROFILE_PREFS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        currency: normalizedText(parsed?.currency || defaults.currency) || defaults.currency,
        language: normalizedText(parsed?.language || defaults.language) || defaults.language,
        darkMode: Boolean(parsed?.darkMode),
        motionPreset: normalizeMotionPreset(parsed?.motionPreset || defaults.motionPreset),
      };
    } catch {
      return defaults;
    }
  }

  function writeProfilePrefs(nextPrefs) {
    const merged = {
      ...readProfilePrefs(),
      ...(nextPrefs && typeof nextPrefs === "object" ? nextPrefs : {}),
    };
    try {
      window.localStorage.setItem(PROFILE_PREFS_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage failures.
    }
    return merged;
  }

  function applyRuntimeDarkMode(enabled) {
    ensureRuntimeThemeStyles();
    const dark = Boolean(enabled);
    document.documentElement.classList.toggle("runtime-dark", dark);
    document.body.classList.toggle("runtime-dark", dark);
  }

  function applyStoredThemePreference() {
    const prefs = readProfilePrefs();
    applyRuntimeDarkMode(Boolean(prefs.darkMode));
  }

  function findProfilePreferenceRow(title) {
    const key = normalizedKey(title);
    const titleNode = Array.from(document.querySelectorAll("p")).find(
      (node) => normalizedKey(node.textContent || "") === key
    );
    if (!titleNode) return null;

    let current = titleNode.parentElement;
    while (current && current !== document.body) {
      const cls = String(current.className || "");
      if (cls.includes("flex") && cls.includes("justify-between")) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function findPreferenceValueNode(row, title) {
    if (!row) return null;
    const key = normalizedKey(title);
    const nodes = Array.from(row.querySelectorAll("p"));
    let seenTitle = false;
    for (const node of nodes) {
      const textKey = normalizedKey(node.textContent || "");
      if (!seenTitle && textKey === key) {
        seenTitle = true;
        continue;
      }
      if (seenTitle && node.textContent) {
        return node;
      }
    }
    return null;
  }

  function syncDarkModeSwitchState(button, enabled) {
    if (!(button instanceof HTMLButtonElement)) return;
    const value = Boolean(enabled);
    button.setAttribute("aria-checked", value ? "true" : "false");
    button.dataset.state = value ? "checked" : "unchecked";

    const thumb = button.querySelector("span");
    if (thumb instanceof HTMLElement) {
      thumb.dataset.state = value ? "checked" : "unchecked";
    }
  }

  function isAriaToggleChecked(node) {
    if (!(node instanceof Element)) return false;
    const ariaChecked = String(node.getAttribute("aria-checked") || "").trim().toLowerCase();
    const dataState = String(node.getAttribute("data-state") || "").trim().toLowerCase();
    return ariaChecked === "true" || dataState === "checked";
  }

  function findOptionLabel(options, value, fallback = "") {
    const key = normalizedText(value || "");
    const match = (options || []).find((item) => normalizedText(item?.value || item?.name) === key);
    return String(match?.label || match?.name || fallback || value || "").trim();
  }

  function ensureRuntimeOptionModalStyles() {
    if (document.getElementById("expense-split-runtime-option-modal-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-option-modal-style";
    style.textContent = `
      .runtime-option-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 10020;
        background: rgba(2, 6, 23, 0.58);
        backdrop-filter: blur(3px);
        display: grid;
        place-items: center;
        padding: 1rem;
      }
      .runtime-option-modal {
        width: min(520px, 100%);
        border-radius: 1rem;
        background: #ffffff;
        border: 1px solid rgba(148, 163, 184, 0.26);
        box-shadow: 0 24px 60px rgba(2, 6, 23, 0.33);
        overflow: hidden;
      }
      .runtime-option-modal-head {
        padding: 1rem 1rem 0.75rem 1rem;
      }
      .runtime-option-modal-title {
        font-size: 1rem;
        font-weight: 700;
        color: #0f172a;
      }
      .runtime-option-modal-subtitle {
        margin-top: 0.2rem;
        font-size: 0.82rem;
        color: #64748b;
      }
      .runtime-option-modal-list {
        max-height: min(48vh, 340px);
        overflow: auto;
        padding: 0 0.9rem 0.75rem 0.9rem;
        display: grid;
        gap: 0.45rem;
      }
      .runtime-option-item {
        width: 100%;
        text-align: left;
        border-radius: 0.7rem;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: #f8fafc;
        padding: 0.62rem 0.72rem;
        font-size: 0.84rem;
        color: #1e293b;
      }
      .runtime-option-item:hover {
        border-color: rgba(16, 185, 129, 0.55);
      }
      .runtime-option-item.selected {
        background: rgba(16, 185, 129, 0.1);
        border-color: rgba(16, 185, 129, 0.8);
        color: #065f46;
        font-weight: 600;
      }
      .runtime-import-report-section {
        border-radius: 0.72rem;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: #f8fafc;
        padding: 0.64rem 0.7rem;
        display: grid;
        gap: 0.34rem;
      }
      .runtime-import-report-section.success {
        border-color: rgba(16, 185, 129, 0.34);
      }
      .runtime-import-report-section.info {
        border-color: rgba(6, 182, 212, 0.36);
      }
      .runtime-import-report-section.warn {
        border-color: rgba(245, 158, 11, 0.34);
      }
      .runtime-import-report-title {
        font-size: 0.79rem;
        font-weight: 700;
        color: #0f172a;
      }
      .runtime-import-report-list {
        display: grid;
        gap: 0.26rem;
      }
      .runtime-import-report-item {
        font-size: 0.78rem;
        color: #334155;
        line-height: 1.35;
      }
      .runtime-import-report-item.empty {
        color: #64748b;
      }
      .runtime-import-report-more {
        font-size: 0.72rem;
        color: #64748b;
        font-weight: 600;
      }
      .runtime-option-modal-footer {
        border-top: 1px solid rgba(148, 163, 184, 0.2);
        padding: 0.75rem 0.9rem;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.55rem;
      }
      .runtime-option-btn {
        border-radius: 0.62rem;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: #ffffff;
        color: #334155;
        padding: 0.5rem 0.78rem;
        font-size: 0.8rem;
        font-weight: 600;
      }
      .runtime-option-btn.primary {
        background: #10b981;
        border-color: #10b981;
        color: #ffffff;
      }
      .runtime-option-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .runtime-option-modal-input-wrap {
        padding: 0 0.9rem 0.9rem 0.9rem;
      }
      .runtime-option-modal-input {
        width: 100%;
        border-radius: 0.62rem;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: #ffffff;
        color: #1e293b;
        padding: 0.6rem 0.72rem;
        font-size: 0.84rem;
      }
      .runtime-option-modal-input:focus {
        outline: none;
        border-color: rgba(16, 185, 129, 0.85);
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.18);
      }
      .runtime-filter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.62rem;
      }
      .runtime-filter-field {
        display: flex;
        flex-direction: column;
        gap: 0.28rem;
      }
      .runtime-filter-field.full {
        grid-column: 1 / -1;
      }
      .runtime-filter-field label {
        font-size: 0.72rem;
        color: #475569;
        font-weight: 600;
      }
      .runtime-filter-hint {
        font-size: 0.68rem;
        color: #64748b;
      }
      @media (max-width: 720px) {
        .runtime-filter-grid {
          grid-template-columns: 1fr;
        }
      }
      body.runtime-dark .runtime-option-modal {
        background: #0f172a;
        border-color: rgba(148, 163, 184, 0.28);
      }
      body.runtime-dark .runtime-option-modal-title {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-option-modal-subtitle {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-option-item {
        background: #0b1220;
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.3);
      }
      body.runtime-dark .runtime-option-item.selected {
        background: rgba(16, 185, 129, 0.14);
        color: #a7f3d0;
      }
      body.runtime-dark .runtime-import-report-section {
        background: #0b1220;
        border-color: rgba(148, 163, 184, 0.28);
      }
      body.runtime-dark .runtime-import-report-section.success {
        border-color: rgba(16, 185, 129, 0.36);
      }
      body.runtime-dark .runtime-import-report-section.info {
        border-color: rgba(6, 182, 212, 0.36);
      }
      body.runtime-dark .runtime-import-report-section.warn {
        border-color: rgba(245, 158, 11, 0.38);
      }
      body.runtime-dark .runtime-import-report-title {
        color: #e2e8f0;
      }
      body.runtime-dark .runtime-import-report-item {
        color: #cbd5e1;
      }
      body.runtime-dark .runtime-import-report-item.empty,
      body.runtime-dark .runtime-import-report-more {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-option-modal-footer {
        border-top-color: rgba(148, 163, 184, 0.22);
      }
      body.runtime-dark .runtime-option-btn {
        background: #0b1220;
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.32);
      }
      body.runtime-dark .runtime-option-modal-input {
        background: #0b1220;
        color: #e2e8f0;
        border-color: rgba(148, 163, 184, 0.32);
      }
      body.runtime-dark .runtime-filter-field label {
        color: #cbd5e1;
      }
      body.runtime-dark .runtime-filter-hint {
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);
  }

  function removeRuntimeOptionModal() {
    const existing = document.getElementById("runtime-option-modal-overlay");
    if (existing) existing.remove();
  }

  function openRuntimeOptionModal({ title = "Select an option", subtitle = "", options = [], selectedValue = "" } = {}) {
    ensureRuntimeOptionModalStyles();
    removeRuntimeOptionModal();

    const opts = Array.isArray(options) ? options : [];
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "runtime-option-modal-overlay";
      overlay.className = "runtime-option-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "runtime-option-modal";

      const head = document.createElement("div");
      head.className = "runtime-option-modal-head";
      const titleNode = document.createElement("p");
      titleNode.className = "runtime-option-modal-title";
      titleNode.textContent = normalizedText(title || "Select an option");
      const subtitleNode = document.createElement("p");
      subtitleNode.className = "runtime-option-modal-subtitle";
      subtitleNode.textContent = normalizedText(subtitle || "");
      head.appendChild(titleNode);
      if (subtitleNode.textContent) head.appendChild(subtitleNode);

      const list = document.createElement("div");
      list.className = "runtime-option-modal-list";

      let chosen = normalizedText(selectedValue || "");
      const buttons = [];
      for (const option of opts) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "runtime-option-item";
        btn.dataset.value = normalizedText(option?.value || option?.name || "");
        btn.textContent = normalizedText(option?.label || option?.name || option?.value || "");
        if (btn.dataset.value === chosen) {
          btn.classList.add("selected");
        }
        btn.addEventListener("click", () => {
          chosen = btn.dataset.value;
          for (const item of buttons) {
            item.classList.toggle("selected", item.dataset.value === chosen);
          }
          confirmBtn.disabled = !chosen;
        });
        buttons.push(btn);
        list.appendChild(btn);
      }

      const footer = document.createElement("div");
      footer.className = "runtime-option-modal-footer";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "runtime-option-btn";
      cancelBtn.textContent = "Cancel";
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "runtime-option-btn primary";
      confirmBtn.textContent = "Save";
      confirmBtn.disabled = !chosen;

      const close = (value = "") => {
        window.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
        resolve(normalizedText(value || ""));
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          stopEvent(event);
          close("");
          return;
        }
        if ((event.key === "ArrowDown" || event.key === "ArrowRight") && buttons.length) {
          stopEvent(event);
          const currentIndex = Math.max(
            0,
            buttons.findIndex((item) => item.dataset.value === chosen)
          );
          const nextButton = buttons[(currentIndex + 1 + buttons.length) % buttons.length];
          nextButton.focus();
          nextButton.click();
          return;
        }
        if ((event.key === "ArrowUp" || event.key === "ArrowLeft") && buttons.length) {
          stopEvent(event);
          const currentIndex = Math.max(
            0,
            buttons.findIndex((item) => item.dataset.value === chosen)
          );
          const nextButton = buttons[(currentIndex - 1 + buttons.length) % buttons.length];
          nextButton.focus();
          nextButton.click();
          return;
        }
        if (event.key === "Enter" && !confirmBtn.disabled) {
          stopEvent(event);
          close(chosen);
        }
      };

      cancelBtn.addEventListener("click", () => close(""));
      confirmBtn.addEventListener("click", () => close(chosen));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          close("");
        }
      });
      window.addEventListener("keydown", onKeyDown, true);

      footer.appendChild(cancelBtn);
      footer.appendChild(confirmBtn);

      modal.appendChild(head);
      modal.appendChild(list);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      window.setTimeout(() => {
        const focusTarget = buttons.find((item) => item.dataset.value === chosen) || buttons[0] || confirmBtn;
        if (focusTarget instanceof HTMLElement) {
          focusTarget.focus();
        }
      }, 10);
    });
  }

  function openRuntimeInputModal({ title = "", subtitle = "", placeholder = "", initialValue = "" } = {}) {
    ensureRuntimeOptionModalStyles();
    removeRuntimeOptionModal();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "runtime-option-modal-overlay";
      overlay.className = "runtime-option-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "runtime-option-modal";

      const head = document.createElement("div");
      head.className = "runtime-option-modal-head";
      const titleNode = document.createElement("p");
      titleNode.className = "runtime-option-modal-title";
      titleNode.textContent = normalizedText(title || "Enter value");
      const subtitleNode = document.createElement("p");
      subtitleNode.className = "runtime-option-modal-subtitle";
      subtitleNode.textContent = normalizedText(subtitle || "");
      head.appendChild(titleNode);
      if (subtitleNode.textContent) head.appendChild(subtitleNode);

      const inputWrap = document.createElement("div");
      inputWrap.className = "runtime-option-modal-input-wrap";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "runtime-option-modal-input";
      input.placeholder = normalizedText(placeholder || "");
      input.value = normalizedText(initialValue || "");
      inputWrap.appendChild(input);

      const footer = document.createElement("div");
      footer.className = "runtime-option-modal-footer";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "runtime-option-btn";
      cancelBtn.textContent = "Cancel";
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "runtime-option-btn primary";
      confirmBtn.textContent = "Save";

      const close = (value = null) => {
        window.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
        resolve(value === null ? null : normalizedText(value));
      };

      const submit = () => {
        close(input.value || "");
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          stopEvent(event);
          close(null);
          return;
        }
        if (event.key === "Enter") {
          stopEvent(event);
          submit();
        }
      };

      cancelBtn.addEventListener("click", () => close(null));
      confirmBtn.addEventListener("click", submit);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });
      window.addEventListener("keydown", onKeyDown, true);

      footer.appendChild(cancelBtn);
      footer.appendChild(confirmBtn);
      modal.appendChild(head);
      modal.appendChild(inputWrap);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 10);
    });
  }

  function openRuntimeImportReportModal(result = null) {
    const safe = result && typeof result === "object" ? result : null;
    if (!safe) return Promise.resolve("");

    ensureRuntimeOptionModalStyles();
    removeRuntimeOptionModal();

    const successCount = Math.max(0, Number(safe.successCount || 0));
    const duplicateCount = Math.max(0, Number(safe.duplicateCount || 0));
    const failureCount = Math.max(0, Number(safe.failureCount || 0));
    const plannedCount = Math.max(
      0,
      Number(safe.plannedCount || successCount + duplicateCount + failureCount)
    );

    const importedTitles = Array.isArray(safe.importedTitles)
      ? safe.importedTitles.map((item) => normalizedText(item || "")).filter(Boolean)
      : [];
    const duplicateTitles = Array.isArray(safe.duplicateTitles)
      ? safe.duplicateTitles.map((item) => normalizedText(item || "")).filter(Boolean)
      : [];
    const failedTitles = Array.isArray(safe.failedTitles)
      ? safe.failedTitles.map((item) => normalizedText(item || "")).filter(Boolean)
      : [];

    const modeLabel = Boolean(safe.allowDuplicates) ? "Mode: allow duplicates" : "Mode: skip duplicates";
    const subtitle = `Planned ${plannedCount} • Imported ${successCount} • Duplicates ${duplicateCount} • Failed ${failureCount} • ${modeLabel}`;
    const maxItemsPerSection = 8;

    const buildReportText = () => {
      const lines = [
        "AI Import Report",
        subtitle,
        "",
        `Imported (${successCount}):`,
        ...(importedTitles.length ? importedTitles.map((item) => `- ${item}`) : ["- None"]),
        "",
        `Duplicates Skipped (${duplicateCount}):`,
        ...(duplicateTitles.length ? duplicateTitles.map((item) => `- ${item}`) : ["- None"]),
        "",
        `Failed (${failureCount}):`,
        ...(failedTitles.length ? failedTitles.map((item) => `- ${item}`) : ["- None"]),
      ];
      return lines.join("\n");
    };

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "runtime-option-modal-overlay";
      overlay.className = "runtime-option-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "runtime-option-modal";

      const head = document.createElement("div");
      head.className = "runtime-option-modal-head";
      const titleNode = document.createElement("p");
      titleNode.className = "runtime-option-modal-title";
      titleNode.textContent = "AI Import Report";
      const subtitleNode = document.createElement("p");
      subtitleNode.className = "runtime-option-modal-subtitle";
      subtitleNode.textContent = subtitle;
      head.appendChild(titleNode);
      head.appendChild(subtitleNode);

      const list = document.createElement("div");
      list.className = "runtime-option-modal-list";

      const sections = [
        {
          title: `Imported (${successCount})`,
          items: importedTitles,
          tone: "success",
          empty: "No expenses were imported.",
        },
        {
          title: `Duplicates Skipped (${duplicateCount})`,
          items: duplicateTitles,
          tone: "info",
          empty: "No duplicates were detected.",
        },
        {
          title: `Failed (${failureCount})`,
          items: failedTitles,
          tone: "warn",
          empty: "No failures occurred.",
        },
      ];

      for (const section of sections) {
        const card = document.createElement("article");
        card.className = `runtime-import-report-section ${section.tone}`.trim();

        const sectionTitle = document.createElement("p");
        sectionTitle.className = "runtime-import-report-title";
        sectionTitle.textContent = section.title;
        card.appendChild(sectionTitle);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "runtime-import-report-list";
        const visibleItems = section.items.slice(0, maxItemsPerSection);
        if (!visibleItems.length) {
          const empty = document.createElement("p");
          empty.className = "runtime-import-report-item empty";
          empty.textContent = section.empty;
          itemsWrap.appendChild(empty);
        } else {
          for (const item of visibleItems) {
            const row = document.createElement("p");
            row.className = "runtime-import-report-item";
            row.textContent = `• ${item}`;
            itemsWrap.appendChild(row);
          }
          if (section.items.length > visibleItems.length) {
            const more = document.createElement("p");
            more.className = "runtime-import-report-more";
            more.textContent = `+${section.items.length - visibleItems.length} more`;
            itemsWrap.appendChild(more);
          }
        }

        card.appendChild(itemsWrap);
        list.appendChild(card);
      }

      const footer = document.createElement("div");
      footer.className = "runtime-option-modal-footer";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "runtime-option-btn";
      copyBtn.textContent = "Copy Summary";

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "runtime-option-btn primary";
      closeBtn.textContent = "Close";

      const close = () => {
        window.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
        resolve("closed");
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          stopEvent(event);
          close();
        }
      };

      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(buildReportText());
          showToast("Import report copied to clipboard.", "success", 2600);
        } catch {
          showToast("Unable to copy import report.", "warn", 3200);
        }
      });
      closeBtn.addEventListener("click", close);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          close();
        }
      });
      window.addEventListener("keydown", onKeyDown, true);

      footer.appendChild(copyBtn);
      footer.appendChild(closeBtn);

      modal.appendChild(head);
      modal.appendChild(list);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      window.setTimeout(() => closeBtn.focus(), 10);
    });
  }

  function applyProfilePreferenceLabels() {
    const prefs = readProfilePrefs();

    const languageRow = findProfilePreferenceRow("Language");
    const languageValueNode = findPreferenceValueNode(languageRow, "Language");
    if (languageValueNode) {
      languageValueNode.textContent = findOptionLabel(PROFILE_LANGUAGE_OPTIONS, prefs.language, "English");
    }

    const currencyRow = findProfilePreferenceRow("Default Currency");
    const currencyValueNode = findPreferenceValueNode(currencyRow, "Default Currency");
    if (currencyValueNode) {
      const currencyLabel = findOptionLabel(PROFILE_CURRENCY_OPTIONS, prefs.currency, "INR");
      currencyValueNode.textContent = currencyLabel || "INR";
    }

    const motionRow = findProfilePreferenceRow("Motion Style");
    const motionValueNode = findPreferenceValueNode(motionRow, "Motion Style");
    if (motionValueNode) {
      motionValueNode.textContent = findOptionLabel(PROFILE_MOTION_PRESET_OPTIONS, prefs.motionPreset, "Dramatic");
    }
  }

  function ensureProfileMotionPreferenceRow() {
    const path = normalizePath(window.location.pathname);
    if (path !== "/profile") return;

    const existing = findProfilePreferenceRow("Motion Style");
    if (existing) return;

    const card = findProfileCardByTitle("App Preferences");
    if (!card) return;
    const listRoot = card.querySelector(".space-y-6");
    if (!(listRoot instanceof HTMLElement)) return;

    const row = document.createElement("div");
    row.className = "flex items-center justify-between";

    const left = document.createElement("div");
    left.className = "flex items-center gap-3";

    const iconWrap = document.createElement("div");
    iconWrap.className = "w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center";
    const icon = document.createElement("span");
    icon.className = "text-xs font-semibold text-gray-700";
    icon.textContent = "3D";
    iconWrap.appendChild(icon);

    const textWrap = document.createElement("div");
    const title = document.createElement("p");
    title.className = "font-medium text-splitwise-text";
    title.textContent = "Motion Style";
    const value = document.createElement("p");
    value.className = "text-sm text-gray-500";
    value.textContent = "Dramatic";
    textWrap.appendChild(title);
    textWrap.appendChild(value);

    left.appendChild(iconWrap);
    left.appendChild(textWrap);

    const right = document.createElement("button");
    right.type = "button";
    right.className =
      "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-8 px-3 text-gray-600 hover:text-gray-900";
    right.textContent = "Change";

    row.appendChild(left);
    row.appendChild(right);
    listRoot.appendChild(row);
  }

  async function handleProfilePreferenceChange(trigger) {
    const row = trigger?.closest?.("div.flex.items-center.justify-between") || trigger?.closest?.("div");
    const titleNode = row ? row.querySelector("p") : null;
    const titleKey = normalizedKey(titleNode?.textContent || "");
    const prefs = readProfilePrefs();

    if (titleKey === "language") {
      const nextLanguage = await openRuntimeOptionModal({
        title: "Choose Language",
        subtitle: "Select your preferred app language.",
        options: PROFILE_LANGUAGE_OPTIONS,
        selectedValue: prefs.language,
      });
      if (!nextLanguage) return;
      writeProfilePrefs({ language: nextLanguage });
      applyProfilePreferenceLabels();
      showToast(`Language set to ${findOptionLabel(PROFILE_LANGUAGE_OPTIONS, nextLanguage, nextLanguage)}.`, "success", 2600);
      return;
    }

    if (titleKey === "default currency") {
      const nextCurrency = await openRuntimeOptionModal({
        title: "Choose Default Currency",
        subtitle: "Used as your preferred display currency.",
        options: PROFILE_CURRENCY_OPTIONS,
        selectedValue: prefs.currency,
      });
      if (!nextCurrency) return;
      writeProfilePrefs({ currency: nextCurrency });
      applyProfilePreferenceLabels();
      showToast(`Currency set to ${findOptionLabel(PROFILE_CURRENCY_OPTIONS, nextCurrency, nextCurrency)}.`, "success", 2600);
      return;
    }

    if (titleKey === "motion style") {
      const nextPreset = await openRuntimeOptionModal({
        title: "Choose Motion Style",
        subtitle: "Pick the animation intensity for this UI.",
        options: PROFILE_MOTION_PRESET_OPTIONS,
        selectedValue: normalizeMotionPreset(prefs.motionPreset),
      });
      if (!nextPreset) return;

      const normalizedPreset = normalizeMotionPreset(nextPreset);
      writeProfilePrefs({ motionPreset: normalizedPreset });
      applyMotionPresetClasses(normalizedPreset);
      applyProfilePreferenceLabels();
      installRuntimeAnimations();
      showToast(
        `Motion style set to ${findOptionLabel(PROFILE_MOTION_PRESET_OPTIONS, normalizedPreset, normalizedPreset)}.`,
        "success",
        2800
      );
      return;
    }

    showToast("Use this setting control on the profile page.", "info", 2600);
  }

  function normalizeProfilePaymentMethod(item) {
    const id = normalizedText(item?.id || "");
    const name = normalizedText(item?.name || "");
    if (!id || !name) return null;
    return {
      id,
      type: normalizedText(item?.type || ""),
      name,
      account: normalizedText(item?.account || ""),
      provider: normalizedText(item?.provider || ""),
      connected: item?.connected !== false,
      verificationStatus: normalizedText(item?.verificationStatus || "verified"),
      verifiedAt: normalizedText(item?.verifiedAt || ""),
    };
  }

  async function fetchProfilePaymentMethods(force = false) {
    const now = Date.now();
    if (!force && now - Number(state.paymentMethodsCheckedAt || 0) < 12_000) {
      return Array.isArray(state.paymentMethodsCache) ? state.paymentMethodsCache : [];
    }

    const { response, body } = await jsonRequest("/api/payments/methods", {
      method: "GET",
      headers: {},
    });
    if (!response.ok) {
      throw new Error(parseApiError(body, "Unable to load payment methods."));
    }

    const methods = (Array.isArray(body?.methods) ? body.methods : [])
      .map(normalizeProfilePaymentMethod)
      .filter(Boolean);
    state.paymentMethodsCache = methods;
    state.paymentMethodsCheckedAt = Date.now();
    return methods;
  }

  function paymentMethodIcon(type) {
    const key = normalizedKey(type);
    if (key === "paypal") return "💰";
    if (key === "google_pay") return "🔍";
    if (key === "venmo") return "💳";
    if (key === "upi") return "🇮🇳";
    if (key === "bank") return "🏦";
    if (key === "card") return "💳";
    if (key === "cash_app") return "💵";
    return "💳";
  }

  function normalizeUpiId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidUpiId(value) {
    const upi = normalizeUpiId(value);
    return /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i.test(upi);
  }

  function normalizeCardDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidLuhn(digits) {
    const card = normalizeCardDigits(digits);
    if (card.length < 12 || card.length > 19) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = card.length - 1; i >= 0; i -= 1) {
      let digit = Number(card[i] || 0);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function normalizeCardExpiry(value) {
    const cleaned = String(value || "").trim().replace(/\s+/g, "").replace(/-/g, "/");
    const match = cleaned.match(/^(\d{1,2})\/?(\d{2}|\d{4})$/);
    if (!match) return "";

    const month = Number(match[1]);
    let year = Number(match[2]);
    if (!Number.isFinite(month) || month < 1 || month > 12) return "";
    if (!Number.isFinite(year)) return "";
    if (year < 100) year += 2000;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    if (year < currentYear) return "";
    if (year === currentYear && month < currentMonth) return "";
    if (year > currentYear + 30) return "";

    return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
  }

  function parseCardExpiryParts(value) {
    const normalized = normalizeCardExpiry(value);
    if (!normalized) return null;
    const [monthText = "", yearText = ""] = normalized.split("/");
    const month = Number(monthText || 0);
    let year = Number(yearText || 0);
    if (!Number.isFinite(month) || month < 1 || month > 12) return null;
    if (!Number.isFinite(year)) return null;
    if (year < 100) year += 2000;
    return {
      month,
      year,
      normalized,
    };
  }

  function findProfileCardByTitle(title) {
    const key = normalizedKey(title);
    const heading = Array.from(document.querySelectorAll("h3, h2, p")).find(
      (node) => normalizedKey(node.textContent || "") === key
    );
    if (!heading) return null;
    return heading.closest("div.bg-white.rounded-2xl") || heading.closest("div");
  }

  function findProfileIdentityCard() {
    const editButton = Array.from(document.querySelectorAll("button")).find((button) => {
      const key = normalizedKey(button.textContent || "");
      return key === "edit profile" || key === "cancel";
    });
    if (editButton) {
      return editButton.closest("div.bg-white.rounded-2xl");
    }

    const firstNameInput = findInputByLabel("First Name");
    const formCard = firstNameInput?.closest("div.bg-white.rounded-2xl");
    if (formCard?.previousElementSibling instanceof HTMLElement) {
      const previousCard = formCard.previousElementSibling.closest("div.bg-white.rounded-2xl");
      if (previousCard) return previousCard;
    }

    const emailNode = Array.from(document.querySelectorAll("p")).find((node) =>
      String(node.textContent || "").includes("@")
    );
    return emailNode?.closest("div.bg-white.rounded-2xl") || null;
  }

  function findProfileAvatarNodes() {
    const card = findProfileIdentityCard();
    if (!card) {
      return {
        card: null,
        avatarContainer: null,
        avatarImage: null,
        avatarFallback: null,
        avatarTrigger: null,
      };
    }

    const imageCandidates = Array.from(card.querySelectorAll("img"));
    const avatarImage =
      imageCandidates.find((image) => {
        const src = String(image.getAttribute("src") || "");
        return src.includes("avatar-") || src.startsWith("data:image/");
      }) || imageCandidates[0] || null;

    const avatarContainer =
      avatarImage?.closest("div.relative") ||
      card.querySelector("div.relative") ||
      avatarImage?.parentElement ||
      card;

    const avatarFallback = Array.from(avatarContainer?.querySelectorAll("span, div") || []).find((node) => {
      const text = normalizedText(node.textContent || "");
      return /^[A-Za-z]{1,3}$/.test(text);
    });

    const avatarTrigger = avatarContainer?.querySelector("button") || null;

    return {
      card,
      avatarContainer,
      avatarImage,
      avatarFallback,
      avatarTrigger,
    };
  }

  function applyAvatarToBadgeNode(node, avatarUrl, initials) {
    if (!(node instanceof HTMLElement)) return;

    if (avatarUrl) {
      node.classList.add("runtime-avatar-image-badge");
      node.style.backgroundImage = `url("${avatarUrl.replace(/"/g, "%22")}")`;
      node.textContent = "";
    } else {
      node.classList.remove("runtime-avatar-image-badge");
      node.style.removeProperty("background-image");
      node.textContent = initials;
    }
  }

  function syncProfileAvatarUi(avatarUrl = "", session = null) {
    const cleanAvatarUrl = sanitizeAvatarUrl(avatarUrl);
    const activeSession = session && typeof session === "object" ? session : state.session || {};
    const initials = deriveInitials(activeSession?.name || "", activeSession?.email || "");
    const { avatarImage, avatarFallback } = findProfileAvatarNodes();

    if (avatarImage instanceof HTMLImageElement) {
      if (!avatarImage.dataset.runtimeAvatarDefaultSrc) {
        avatarImage.dataset.runtimeAvatarDefaultSrc = String(avatarImage.getAttribute("src") || "/avatar-1.jpg");
      }
      const defaultSrc = String(avatarImage.dataset.runtimeAvatarDefaultSrc || "/avatar-1.jpg");
      avatarImage.setAttribute("src", cleanAvatarUrl || defaultSrc);
      avatarImage.setAttribute("alt", activeSession?.name ? `${activeSession.name} avatar` : "Profile avatar");
      if (avatarImage.dataset.runtimeAvatarErrorBound !== "1") {
        avatarImage.dataset.runtimeAvatarErrorBound = "1";
        avatarImage.addEventListener("error", () => {
          const fallbackSrc = String(avatarImage.dataset.runtimeAvatarDefaultSrc || "/avatar-1.jpg");
          avatarImage.setAttribute("src", fallbackSrc);
        });
      }
    }

    if (avatarFallback instanceof HTMLElement) {
      avatarFallback.textContent = initials;
    }

    const badgeNodes = Array.from(document.querySelectorAll(".avatar-badge"));
    for (const badgeNode of badgeNodes) {
      applyAvatarToBadgeNode(badgeNode, cleanAvatarUrl, initials);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read this image file."));
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not process this image."));
      image.src = dataUrl;
    });
  }

  async function prepareProfileAvatarDataUrl(file) {
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    const mimeType = String(file?.type || "").toLowerCase();
    if (!allowedTypes.has(mimeType)) {
      throw new Error("Use PNG, JPG, or WEBP format for profile photo.");
    }
    if (Number(file?.size || 0) > 8 * 1024 * 1024) {
      throw new Error("Profile photo must be under 8MB.");
    }

    const rawDataUrl = await readFileAsDataUrl(file);
    const sourceImage = await loadImageElement(rawDataUrl);
    const sourceWidth = Number(sourceImage.naturalWidth || sourceImage.width || 0);
    const sourceHeight = Number(sourceImage.naturalHeight || sourceImage.height || 0);

    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("Selected image is invalid.");
    }

    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) return rawDataUrl;
    context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

    try {
      return canvas.toDataURL("image/jpeg", 0.86) || rawDataUrl;
    } catch {
      return rawDataUrl;
    }
  }

  function installProfileAvatarUploader() {
    const path = normalizePath(window.location.pathname);
    if (path !== "/profile") return;

    const { card, avatarContainer, avatarTrigger } = findProfileAvatarNodes();
    if (!card) return;

    let trigger = avatarTrigger;
    if (!(trigger instanceof HTMLButtonElement)) {
      const actionHost = Array.from(card.querySelectorAll("button")).find((button) => {
        const key = normalizedKey(button.textContent || "");
        return key === "edit profile" || key === "cancel";
      })?.parentElement || card;

      trigger = actionHost.querySelector("button[data-runtime-avatar-action='upload']");
      if (!(trigger instanceof HTMLButtonElement)) {
        trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "runtime-avatar-upload-btn";
        trigger.dataset.runtimeAvatarAction = "upload";
        trigger.textContent = "Change Photo";
        actionHost.insertBefore(trigger, actionHost.firstChild || null);
      }
    } else {
      trigger.type = "button";
      trigger.dataset.runtimeAvatarAction = "upload";
      if (!normalizedText(trigger.getAttribute("aria-label") || "")) {
        trigger.setAttribute("aria-label", "Change profile photo");
      }
    }

    let fileInput = card.querySelector("input[type='file'][data-runtime-profile-avatar-input='1']");
    if (!(fileInput instanceof HTMLInputElement)) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/webp";
      fileInput.hidden = true;
      fileInput.dataset.runtimeProfileAvatarInput = "1";
      card.appendChild(fileInput);
    }

    if (trigger.dataset.runtimeAvatarUploadBound !== "1") {
      trigger.dataset.runtimeAvatarUploadBound = "1";
      trigger.addEventListener(
        "click",
        (event) => {
          stopEvent(event);
          if (state.actionBusy.has("profile-avatar-file-read")) return;
          fileInput.click();
        },
        true
      );
    }

    if (fileInput.dataset.runtimeAvatarUploadBound !== "1") {
      fileInput.dataset.runtimeAvatarUploadBound = "1";
      fileInput.addEventListener("change", async () => {
        const selectedFile = fileInput.files?.[0];
        if (!selectedFile) return;
        if (state.actionBusy.has("profile-avatar-file-read")) return;

        state.actionBusy.add("profile-avatar-file-read");
        try {
          const avatarDataUrl = await prepareProfileAvatarDataUrl(selectedFile);
          state.profileAvatarUrl = avatarDataUrl;
          state.profileAvatarKnown = true;
          state.profileAvatarDirty = true;
          syncProfileAvatarUi(avatarDataUrl, state.session || null);
          flashSuccessState(avatarContainer || trigger || card);
          showToast("Profile photo selected. Click Save Changes to update it.", "success", 4200);
        } catch (error) {
          showToast(String(error?.message || "Could not update profile photo."), "error", 5000);
        } finally {
          fileInput.value = "";
          state.actionBusy.delete("profile-avatar-file-read");
        }
      });
    }

    if (!state.profileAvatarKnown) {
      state.profileAvatarUrl = sanitizeAvatarUrl(state.session?.avatarUrl || "");
      state.profileAvatarKnown = true;
    }
    syncProfileAvatarUi(state.profileAvatarUrl, state.session || null);
  }

  function createProfilePaymentMethodRow(method) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between p-4 rounded-xl bg-gray-50";

    const left = document.createElement("div");
    left.className = "flex items-center gap-4";

    const iconWrap = document.createElement("div");
    iconWrap.className = "w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm";
    const icon = document.createElement("span");
    icon.className = "text-2xl";
    icon.textContent = paymentMethodIcon(method.type);
    iconWrap.appendChild(icon);

    const info = document.createElement("div");
    const nameNode = document.createElement("p");
    nameNode.className = "font-medium text-splitwise-text";
    nameNode.textContent = method.name;
    const accountNode = document.createElement("p");
    accountNode.className = "text-sm text-gray-500";
    accountNode.textContent = method.account || "Connected";
    info.appendChild(nameNode);
    info.appendChild(accountNode);

    left.appendChild(iconWrap);
    left.appendChild(info);

    const right = document.createElement("div");
    right.className = "flex items-center gap-3";

    const badge = document.createElement("span");
    badge.className = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-700";
    badge.textContent = "Connected";

    const disconnectButton = document.createElement("button");
    disconnectButton.type = "button";
    disconnectButton.className = "text-sm text-gray-600 hover:text-gray-900";
    disconnectButton.textContent = "Disconnect";
    disconnectButton.dataset.runtimePaymentAction = "disconnect";
    disconnectButton.dataset.runtimePaymentMethodId = method.id;

    right.appendChild(badge);
    right.appendChild(disconnectButton);

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  async function renderProfilePaymentMethods(force = false) {
    const path = normalizePath(window.location.pathname);
    if (path !== "/profile") return;

    const card = findProfileCardByTitle("Connected Payment Methods");
    if (!card) return;

    const listRoot = card.querySelector(".space-y-4");
    if (!listRoot) return;

    let methods = [];
    try {
      methods = (await fetchProfilePaymentMethods(force)).filter((item) => item.connected !== false);
    } catch (error) {
      methods = [];
      showToast(String(error?.message || "Unable to load payment methods."), "error", 4200);
    }
    listRoot.innerHTML = "";

    if (!methods.length) {
      renderRuntimeEmptyState(listRoot, {
        title: "No verified payment methods yet.",
        note: "Connect UPI or card details to unlock faster settlement flows.",
        kind: "payments",
        compact: true,
      });
    } else {
      for (const method of methods) {
        listRoot.appendChild(createProfilePaymentMethodRow(method));
      }
    }

    const connectButton = Array.from(card.querySelectorAll("button")).find(
      (button) => normalizedKey(button.textContent || "").includes("connect new payment method")
    );
    if (connectButton instanceof HTMLButtonElement) {
      connectButton.dataset.runtimePaymentAction = "connect";
    }
  }

  async function collectValidatedPaymentAccount(methodOption) {
    const methodType = normalizedKey(methodOption?.type || "");

    if (methodType === "upi") {
      const upi = await openRuntimeInputModal({
        title: "UPI ID",
        subtitle: "Enter a valid UPI ID (example: yourname@okaxis).",
        placeholder: "yourname@okaxis",
        initialValue: "",
      });
      if (upi === null) return null;

      const normalizedUpi = normalizeUpiId(upi);
      if (!isValidUpiId(normalizedUpi)) {
        showToast("Invalid UPI ID format. Use format like name@bank.", "error", 4200);
        return null;
      }

      return {
        requestBody: {
          type: "upi",
          upiId: normalizedUpi,
        },
      };
    }

    if (methodType === "card") {
      const cardNumberInput = await openRuntimeInputModal({
        title: "Card Number",
        subtitle: "Enter your credit/debit card number.",
        placeholder: "4111 1111 1111 1111",
        initialValue: "",
      });
      if (cardNumberInput === null) return null;

      const cardDigits = normalizeCardDigits(cardNumberInput);
      if (!isValidLuhn(cardDigits)) {
        showToast("Invalid card number. Please check and try again.", "error", 4200);
        return null;
      }

      const expiryInput = await openRuntimeInputModal({
        title: "Card Expiry",
        subtitle: "Enter expiry in MM/YY format.",
        placeholder: "MM/YY",
        initialValue: "",
      });
      if (expiryInput === null) return null;

      const expiry = parseCardExpiryParts(expiryInput);
      if (!expiry) {
        showToast("Invalid expiry. Use MM/YY and ensure card is not expired.", "error", 4200);
        return null;
      }

      const cvcInput = await openRuntimeInputModal({
        title: "Card CVC",
        subtitle: "Enter 3 or 4 digit CVC to verify your card.",
        placeholder: "123",
        initialValue: "",
      });
      if (cvcInput === null) return null;

      const cvc = String(cvcInput || "").replace(/\D/g, "");
      if (!/^\d{3,4}$/.test(cvc)) {
        showToast("Invalid CVC. Please enter 3 or 4 digits.", "error", 4200);
        return null;
      }

      const holderNameInput = await openRuntimeInputModal({
        title: "Cardholder Name (Optional)",
        subtitle: "Name on card, used for verification context.",
        placeholder: "Your full name",
        initialValue: "",
      });
      if (holderNameInput === null) return null;

      return {
        requestBody: {
          type: "card",
          card: {
            number: cardDigits,
            expMonth: expiry.month,
            expYear: expiry.year,
            cvc,
            holderName: normalizedText(holderNameInput || ""),
          },
        },
      };
    }

    showToast("This method is not enabled yet.", "warn", 3000);
    return null;
  }

  async function connectNewPaymentMethodFromUi() {
    if (state.actionBusy.has("profile-payment-connect")) return;
    state.actionBusy.add("profile-payment-connect");
    try {
      const methodType = await openRuntimeOptionModal({
        title: "Connect Payment Method",
        subtitle: "Choose a method. We verify it with the real provider before saving.",
        options: PROFILE_PAYMENT_METHOD_OPTIONS.map((item) => ({
          value: item.type,
          label: item.name,
        })),
        selectedValue: "",
      });
      const methodOption = PROFILE_PAYMENT_METHOD_OPTIONS.find(
        (item) => normalizedText(item.type) === normalizedText(methodType)
      ) || null;
      if (!methodOption) return;

      const accountDetails = await collectValidatedPaymentAccount(methodOption);
      if (!accountDetails?.requestBody || typeof accountDetails.requestBody !== "object") return;

      const { response, body } = await jsonRequest("/api/payments/methods", {
        method: "POST",
        body: JSON.stringify(accountDetails.requestBody),
      });
      if (!response.ok) {
        throw new Error(parseApiError(body, `Could not connect ${methodOption.name}.`));
      }

      state.paymentMethodsCheckedAt = 0;
      await renderProfilePaymentMethods(true);
      flashSuccessState(findProfileCardByTitle("Connected Payment Methods"));
      showToast(`${methodOption.name} verified and connected.`, "success", 3500);
    } catch (error) {
      showToast(String(error?.message || "Unable to connect payment method."), "error", 5000);
    } finally {
      state.actionBusy.delete("profile-payment-connect");
    }
  }

  async function disconnectPaymentMethodFromUi(methodId) {
    const id = normalizedText(methodId || "");
    if (!id) return;
    const actionKey = `profile-payment-disconnect:${id}`;
    if (state.actionBusy.has(actionKey)) return;
    state.actionBusy.add(actionKey);
    try {
      const { response, body } = await jsonRequest(`/api/payments/methods/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(parseApiError(body, "Could not disconnect payment method."));
      }
      state.paymentMethodsCheckedAt = 0;
      await renderProfilePaymentMethods(true);
      flashSuccessState(findProfileCardByTitle("Connected Payment Methods"));
      showToast("Payment method disconnected.", "success", 3200);
    } catch (error) {
      showToast(String(error?.message || "Unable to disconnect payment method."), "error", 4500);
    } finally {
      state.actionBusy.delete(actionKey);
    }
  }

  function installProfilePreferenceControls() {
    const path = normalizePath(window.location.pathname);
    if (path !== "/profile") return;
    installProfileAvatarUploader();
    ensureProfileMotionPreferenceRow();
    applyProfilePreferenceLabels();
    void renderProfilePaymentMethods();
  }

  function installProfileDarkModeControl() {
    const path = normalizePath(window.location.pathname);
    if (path !== "/profile") return;

    const darkRow = findProfilePreferenceRow("Dark Mode");
    if (!darkRow) return;

    const switchButton = darkRow.querySelector("button[role='switch'], button[aria-checked]");
    if (!(switchButton instanceof HTMLButtonElement)) return;

    if (switchButton.dataset.runtimeDarkBound !== "1") {
      switchButton.dataset.runtimeDarkBound = "1";
      const toggle = (event) => {
        stopEvent(event);
        const current = readProfilePrefs();
        const next = !Boolean(current.darkMode);
        writeProfilePrefs({ darkMode: next });
        applyRuntimeDarkMode(next);
        syncDarkModeSwitchState(switchButton, next);
        showToast(next ? "Dark mode enabled." : "Dark mode disabled.", "info", 2600);
      };

      switchButton.addEventListener("click", toggle, true);
      switchButton.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter" || event.key === " ") {
            toggle(event);
          }
        },
        true
      );
    }

    const prefs = readProfilePrefs();
    syncDarkModeSwitchState(switchButton, Boolean(prefs.darkMode));
    applyRuntimeDarkMode(Boolean(prefs.darkMode));
  }

  function parseApiError(body, fallback) {
    if (body && typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
    if (body && typeof body.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
    return fallback;
  }

  function isDuplicateExpenseConflict(response, body) {
    return Number(response?.status || 0) === 409 && normalizedKey(body?.code || "") === "duplicate_expense";
  }

  async function jsonRequest(url, options = {}) {
    const init = {
      credentials: "include",
      ...options,
    };

    const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
    const headers = {
      ...(init.headers || {}),
    };
    if (!isFormData && !headers["Content-Type"] && !headers["content-type"] && init.method !== "GET") {
      headers["Content-Type"] = "application/json";
    }
    init.headers = headers;

    const response = await fetch(url, init);

    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    return { response, body };
  }

  function getReturnToPath() {
    const query = new URLSearchParams(window.location.search);
    const raw = String(query.get("returnTo") || "").trim();
    if (!raw.startsWith("/")) return "";
    if (raw.startsWith("//")) return "";
    return raw;
  }

  function resolvePostLoginPath() {
    const explicitReturn = getReturnToPath();
    if (explicitReturn) return explicitReturn;

    const nextStep = normalizedKey(state.sessionOnboarding?.nextStep || "");
    if (nextStep === "create_group") return "/create-group";
    if (nextStep === "add_expense") return "/create-expense";
    if (nextStep === "invite_member") return "/groups";
    if (nextStep === "settle" || nextStep === "settle_up") return "/settle";
    return "/dashboard";
  }

  async function fetchSession(force = false) {
    const now = Date.now();
    if (!force && now - state.sessionCheckedAt < 10_000) {
      return state.session;
    }

    if (state.sessionPromise) {
      return state.sessionPromise;
    }

    state.sessionPromise = (async () => {
      try {
        const { response, body } = await jsonRequest("/api/auth/session", {
          method: "GET",
          headers: {},
        });
        state.sessionCheckedAt = Date.now();
        if (response.ok && body?.authenticated && body?.session) {
          state.session = body.session;
          state.sessionOnboarding = body?.onboarding && typeof body.onboarding === "object" ? body.onboarding : null;
        } else {
          state.session = null;
          state.sessionOnboarding = null;
        }
      } catch {
        state.sessionCheckedAt = Date.now();
        state.session = null;
        state.sessionOnboarding = null;
      }
      return state.session;
    })();

    try {
      return await state.sessionPromise;
    } finally {
      state.sessionPromise = null;
    }
  }

  async function fetchGroups(force = false) {
    const now = Date.now();
    if (!force && now - state.groupsCheckedAt < 20_000 && Array.isArray(state.groupsCache)) {
      return state.groupsCache;
    }

    const { response, body } = await jsonRequest("/api/groups", {
      method: "GET",
      headers: {},
    });
    if (!response.ok) {
      throw new Error(parseApiError(body, "Unable to load groups."));
    }

    const groups = Array.isArray(body?.groups) ? body.groups : [];
    state.groupsCache = groups;
    state.groupsCheckedAt = Date.now();
    return groups;
  }

  async function fetchGroupDetail(groupId, force = false) {
    const id = Number(groupId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const cacheKey = String(id);
    const cached = state.groupDetails.get(cacheKey);
    const now = Date.now();
    if (!force && cached && now - Number(cached.at || 0) < 20_000) {
      return cached.value;
    }

    const { response, body } = await jsonRequest(`/api/groups/${id}`, {
      method: "GET",
      headers: {},
    });
    if (!response.ok) {
      throw new Error(parseApiError(body, "Unable to load group details."));
    }

    const value = body?.group || null;
    state.groupDetails.set(cacheKey, {
      value,
      at: Date.now(),
    });
    return value;
  }

  function relativeTime(isoOrDate) {
    const ms = new Date(isoOrDate || "").getTime();
    if (!Number.isFinite(ms)) return "just now";
    const diff = Date.now() - ms;
    const abs = Math.abs(diff);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (abs < minute) return "just now";
    if (abs < hour) {
      const value = Math.max(1, Math.round(abs / minute));
      return `${value} min${value === 1 ? "" : "s"} ago`;
    }
    if (abs < day) {
      const value = Math.max(1, Math.round(abs / hour));
      return `${value} hour${value === 1 ? "" : "s"} ago`;
    }
    const value = Math.max(1, Math.round(abs / day));
    return `${value} day${value === 1 ? "" : "s"} ago`;
  }

  function mapGroupIcon(name, index = 0) {
    const text = normalizedKey(name);
    if (text.includes("trip") || text.includes("travel") || text.includes("vacation")) return "🏝️";
    if (text.includes("home") || text.includes("apartment") || text.includes("rent")) return "🏠";
    if (text.includes("dinner") || text.includes("food") || text.includes("lunch")) return "🍽️";
    if (text.includes("office") || text.includes("work")) return "💼";
    if (text.includes("party")) return "🎉";
    const fallback = ["🏝️", "🏠", "🍽️", "🎉", "✈️", "☕", "🎬", "🎮"];
    return fallback[index % fallback.length] || "💸";
  }

  function parseAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value || "")
      .replace(/[^0-9.+-]/g, "")
      .trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseAmountFromText(value) {
    const text = String(value || "");
    const match = text.match(/(-?\d+(?:\.\d{1,2})?)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatMoney(amount, currencySymbol = "$") {
    const value = Number(amount || 0);
    return `${currencySymbol}${Math.abs(value).toFixed(2)}`;
  }

  function parseAnimatedTextValue(text) {
    const raw = normalizedText(text || "");
    const match = raw.match(/(\d[\d,]*(?:\.\d+)?)/);
    if (!match) return null;

    const numberText = String(match[1] || "").replace(/,/g, "");
    const numberValue = Number(numberText);
    if (!Number.isFinite(numberValue)) return null;

    const start = Number(match.index || 0);
    const prefix = raw.slice(0, start);
    const suffix = raw.slice(start + String(match[1] || "").length);
    const sign = prefix.includes("-") ? -1 : 1;
    const decimals = (numberText.split(".")[1] || "").length;

    return {
      raw,
      prefix,
      suffix,
      value: numberValue * sign,
      decimals,
    };
  }

  function formatAnimatedText(parts, value) {
    const safeParts = parts || {};
    const decimals = Math.max(0, Number(safeParts.decimals || 0));
    const magnitude = Math.abs(Number(value || 0)).toFixed(decimals);
    return `${safeParts.prefix || ""}${magnitude}${safeParts.suffix || ""}`;
  }

  function animateTextValue(node, targetText, options = {}) {
    if (!(node instanceof HTMLElement)) return;

    const next = normalizedText(targetText || "");
    if (!next) {
      node.textContent = "";
      node.dataset.runtimeAnimatedValue = "";
      return;
    }
    if (node.dataset.runtimeAnimatedValue === next) return;

    const target = parseAnimatedTextValue(next);
    if (!target) {
      node.textContent = next;
      node.dataset.runtimeAnimatedValue = next;
      return;
    }

    const current = parseAnimatedTextValue(node.textContent || "");
    const canReuseCurrent =
      current &&
      current.prefix === target.prefix &&
      current.suffix === target.suffix &&
      current.decimals === target.decimals;
    const fromValue = canReuseCurrent ? Number(current.value || 0) : 0;
    const toValue = Number(target.value || 0);
    const durationMs = Math.max(260, Number(options.durationMs || 620));
    const startedAt = performance.now();

    if (typeof node._runtimeCounterFrame === "number") {
      window.cancelAnimationFrame(node._runtimeCounterFrame);
    }

    const step = (now) => {
      const elapsed = Math.max(0, now - startedAt);
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = fromValue + (toValue - fromValue) * eased;
      node.textContent = formatAnimatedText(target, value);

      if (progress >= 1) {
        node.textContent = next;
        node.dataset.runtimeAnimatedValue = next;
        node._runtimeCounterFrame = 0;
        return;
      }

      node._runtimeCounterFrame = window.requestAnimationFrame(step);
    };

    node._runtimeCounterFrame = window.requestAnimationFrame(step);
  }

  function createSkeletonRow({ compact = false, showAvatar = true } = {}) {
    const row = document.createElement("div");
    row.className = `runtime-skeleton-row${compact ? " compact" : ""}`;

    if (showAvatar) {
      const avatar = document.createElement("span");
      avatar.className = "runtime-skeleton-avatar";
      row.appendChild(avatar);
    }

    const lines = document.createElement("div");
    lines.className = "runtime-skeleton-lines";
    const lineA = document.createElement("span");
    lineA.className = "runtime-skeleton-line";
    const lineB = document.createElement("span");
    lineB.className = "runtime-skeleton-line short";
    lines.appendChild(lineA);
    lines.appendChild(lineB);
    row.appendChild(lines);

    const side = document.createElement("span");
    side.className = "runtime-skeleton-chip";
    row.appendChild(side);
    return row;
  }

  function renderSkeletonList(container, rows = 3, options = {}) {
    if (!(container instanceof HTMLElement)) return;
    container.innerHTML = "";
    container.classList.add("runtime-skeleton-list");
    for (let i = 0; i < rows; i += 1) {
      container.appendChild(createSkeletonRow(options));
    }
  }

  function emptyStateIconMarkup(kind = "default") {
    switch (normalizedKey(kind)) {
      case "payments":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <rect x="3" y="6.5" width="18" height="11" rx="3" stroke="currentColor" stroke-width="1.6"/>
            <path d="M3.8 10.2h16.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M7.5 14.2h3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        `;
      case "filters":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <path d="M5 7h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M7 12h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M9 17h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="9" cy="7" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
          </svg>
        `;
      case "notifications":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <path d="M8 17h8l-1.1-1.5a5.5 5.5 0 0 1-.9-3.02V10a4 4 0 1 0-8 0v2.48c0 1.08-.31 2.14-.9 3.02L8 17Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        `;
      case "reminders":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="7.2" stroke="currentColor" stroke-width="1.6"/>
            <path d="M12 8.7v3.8l2.7 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M16.9 5.6 19 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        `;
      case "groups":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <circle cx="9" cy="9.2" r="2.5" stroke="currentColor" stroke-width="1.6"/>
            <circle cx="16" cy="10.2" r="2.1" stroke="currentColor" stroke-width="1.6"/>
            <path d="M4.8 18.2c.7-2.2 2.5-3.4 4.9-3.4s4.2 1.2 4.9 3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M14.5 17.5c.45-1.55 1.72-2.45 3.48-2.45 1 0 1.88.25 2.52.72" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        `;
      case "activity":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <path d="M4 16.5h3.2l2.2-5.1 3.2 7 2.8-5.1H20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 19.5h16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
          </svg>
        `;
      case "search":
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="5.8" stroke="currentColor" stroke-width="1.6"/>
            <path d="M16 16 20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        `;
      default:
        return `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            <path d="m12 4 .95 2.7L15.7 7.6 13 8.55l-.9 2.75-.95-2.75L8.4 7.6l2.75-.9L12 4Z" fill="currentColor"/>
            <path d="m18.2 11.2.6 1.7 1.7.55-1.7.6-.6 1.7-.55-1.7-1.7-.6 1.7-.55.55-1.7Z" fill="currentColor" opacity="0.78"/>
            <path d="m7.2 13.2.72 2.06 2.08.7-2.08.72-.72 2.08-.7-2.08-2.06-.72 2.06-.7.7-2.06Z" fill="currentColor" opacity="0.72"/>
          </svg>
        `;
    }
  }

  function ensureRuntimeNoGroupsStyles() {
    if (document.getElementById("expense-split-runtime-no-groups-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-no-groups-style";
    style.textContent = `
      .runtime-groups-empty-list {
        margin: 0;
        width: 100%;
        padding: 0.06rem 0;
        display: flex;
        justify-content: center;
        min-height: clamp(480px, 72vh, 790px);
      }
      .runtime-empty-groups-wrap {
        position: relative;
        width: min(100%, 42rem);
        margin: 0 auto;
        padding: 0.14rem 0;
      }
      .runtime-empty-groups-bg {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 0;
      }
      .runtime-empty-groups-float {
        position: absolute;
        display: grid;
        place-items: center;
        animation: runtimeEmptyGroupsFloat 4s ease-in-out infinite;
      }
      .runtime-empty-groups-float.coin {
        border-radius: 999px;
        font-weight: 800;
        color: rgba(15, 23, 42, 0.55);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
      }
      .runtime-empty-groups-float.coin span {
        font-size: 1.08rem;
        line-height: 1;
      }
      .runtime-empty-groups-float.coin-a {
        top: 1.6rem;
        left: 0.95rem;
        width: 3rem;
        height: 3rem;
        background: linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%);
        animation-duration: 5s;
      }
      .runtime-empty-groups-float.coin-b {
        top: 4.2rem;
        right: 1.7rem;
        width: 2.7rem;
        height: 2.7rem;
        background: linear-gradient(135deg, #86efac 0%, #10b981 100%);
        animation-duration: 3.2s;
        animation-delay: 0.35s;
      }
      .runtime-empty-groups-float.coin-c {
        bottom: 8rem;
        left: 1.5rem;
        width: 2.25rem;
        height: 2.25rem;
        background: linear-gradient(135deg, #fda4af 0%, #f43f5e 100%);
        animation-duration: 4s;
        animation-delay: 0.7s;
      }
      .runtime-empty-groups-float.badge {
        width: 2.8rem;
        height: 2.8rem;
        border-radius: 0.88rem;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
      }
      .runtime-empty-groups-float.badge svg {
        width: 1.32rem;
        height: 1.32rem;
      }
      .runtime-empty-groups-float.badge-receipt {
        top: 0.85rem;
        right: 4.7rem;
        color: #2563eb;
        background: linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%);
        animation-name: runtimeEmptyGroupsFloatRotate12;
        animation-duration: 5.2s;
        animation-delay: 0.25s;
      }
      .runtime-empty-groups-float.badge-wallet {
        right: 0.8rem;
        bottom: 9.4rem;
        color: #7c3aed;
        background: linear-gradient(180deg, #ede9fe 0%, #ddd6fe 100%);
        animation-name: runtimeEmptyGroupsFloatRotateN6;
        animation-duration: 3.3s;
        animation-delay: 0.55s;
      }
      .runtime-empty-groups-float.badge-users {
        top: 7.3rem;
        left: 0.2rem;
        color: #0f766e;
        background: linear-gradient(180deg, #ccfbf1 0%, #99f6e4 100%);
        animation-name: runtimeEmptyGroupsFloatRotate6;
        animation-duration: 4.1s;
        animation-delay: 0.95s;
      }
      .runtime-empty-groups-sparkle {
        position: absolute;
        color: #f59e0b;
        animation: runtimeEmptyGroupsSparkle 2s ease-in-out infinite;
      }
      .runtime-empty-groups-sparkle svg {
        width: 1.05rem;
        height: 1.05rem;
      }
      .runtime-empty-groups-sparkle.sparkle-a {
        top: 1.9rem;
        left: 35%;
      }
      .runtime-empty-groups-sparkle.sparkle-b {
        right: 24%;
        bottom: 8.3rem;
        color: #34d399;
        animation-delay: 0.9s;
      }
      .runtime-empty-groups-orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(36px);
      }
      .runtime-empty-groups-orb.orb-main {
        top: 50%;
        left: 50%;
        width: 16rem;
        height: 16rem;
        background: linear-gradient(120deg, rgba(45, 212, 191, 0.22), rgba(16, 185, 129, 0.2));
        transform: translate3d(-50%, -50%, 0);
      }
      .runtime-empty-groups-orb.orb-side {
        top: 30%;
        right: 20%;
        width: 8rem;
        height: 8rem;
        background: linear-gradient(120deg, rgba(252, 211, 77, 0.18), rgba(251, 146, 60, 0.15));
      }
      .runtime-empty-groups-card {
        position: relative;
        z-index: 1;
        overflow: hidden;
        border-radius: 1.6rem;
        border: 1px solid #f1f5f9;
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(10px);
        box-shadow:
          0 24px 50px -30px rgba(15, 23, 42, 0.46),
          0 12px 30px -24px rgba(15, 23, 42, 0.34);
        padding: 2.05rem 2.25rem 2.25rem;
      }
      .runtime-empty-groups-card-glow {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, rgba(240, 253, 250, 0.86), rgba(255, 255, 255, 0.42), rgba(236, 253, 245, 0.74));
        opacity: 0.85;
      }
      .runtime-empty-groups-core {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: center;
        text-align: center;
      }
      .runtime-empty-groups-main-wrap {
        position: relative;
        width: 8rem;
        height: 8rem;
        margin-bottom: 1.38rem;
        display: grid;
        place-items: center;
        animation: runtimeEmptyGroupsPulse 2s ease-in-out infinite;
      }
      .runtime-empty-groups-main-icon {
        width: 100%;
        height: 100%;
        border-radius: 1.45rem;
        display: grid;
        place-items: center;
        color: #ffffff;
        background: linear-gradient(135deg, #2dd4bf 0%, #10b981 100%);
        box-shadow:
          0 20px 38px rgba(45, 212, 191, 0.28),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .runtime-empty-groups-main-icon svg {
        width: 3rem;
        height: 3rem;
      }
      .runtime-empty-groups-main-orbit {
        position: absolute;
        border-radius: 999px;
      }
      .runtime-empty-groups-main-orbit.orbit-a {
        top: -0.22rem;
        left: 50%;
        width: 0.72rem;
        height: 0.72rem;
        background: #fbbf24;
        box-shadow: 0 2px 7px rgba(251, 191, 36, 0.5);
        transform-origin: center 4.22rem;
        animation: runtimeEmptyGroupsOrbit 8s linear infinite;
      }
      .runtime-empty-groups-main-orbit.orbit-b {
        top: 50%;
        right: -0.2rem;
        width: 0.55rem;
        height: 0.55rem;
        background: #fb7185;
        box-shadow: 0 2px 7px rgba(244, 63, 94, 0.5);
        transform-origin: -3.95rem center;
        animation: runtimeEmptyGroupsOrbitReverse 12s linear infinite;
      }
      .runtime-empty-groups-title {
        margin: 0;
        font-size: clamp(1.65rem, 2.8vw, 2rem);
        line-height: 1.18;
        font-weight: 800;
        color: #1e293b;
      }
      .runtime-empty-groups-note {
        margin-top: 0.82rem;
        max-width: 33rem;
        font-size: clamp(1rem, 1.65vw, 1.1rem);
        line-height: 1.62;
        color: #64748b;
      }
      .runtime-empty-groups-pills {
        margin-top: 1.45rem;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.7rem;
      }
      .runtime-empty-groups-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.46rem;
        padding: 0.48rem 0.86rem;
        border-radius: 999px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #475569;
        font-size: 0.84rem;
        font-weight: 600;
        transition: transform 0.2s ease, background-color 0.2s ease;
      }
      .runtime-empty-groups-pill:hover {
        transform: translateY(-1px) scale(1.03);
        background: #f0fdf4;
      }
      .runtime-empty-groups-pill svg {
        width: 0.95rem;
        height: 0.95rem;
        color: #14b8a6;
      }
      .runtime-empty-groups-actions {
        margin-top: 1.55rem;
        display: grid;
        justify-items: center;
      }
      .runtime-empty-groups-cta {
        position: relative;
        overflow: hidden;
        border: 0;
        border-radius: 0.82rem;
        min-width: 18.6rem;
        height: 3rem;
        padding: 0 1.26rem;
        background: linear-gradient(90deg, #14b8a6 0%, #10b981 100%);
        color: #ffffff;
        box-shadow: 0 18px 30px -18px rgba(20, 184, 166, 0.8);
        font-size: 0.97rem;
        font-weight: 650;
        transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.2s ease;
      }
      .runtime-empty-groups-cta:hover {
        transform: translateY(-2px);
        filter: saturate(1.05);
        box-shadow: 0 24px 34px -18px rgba(20, 184, 166, 0.84);
      }
      .runtime-empty-groups-cta-copy {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: 0.54rem;
      }
      .runtime-empty-groups-cta-plus {
        width: 1.02rem;
        height: 1.02rem;
        transition: transform 0.28s ease;
      }
      .runtime-empty-groups-cta-arrow {
        width: 0.94rem;
        height: 0.94rem;
        opacity: 0;
        transform: translateX(-6px);
        transition: opacity 0.26s ease, transform 0.26s ease;
      }
      .runtime-empty-groups-cta:hover .runtime-empty-groups-cta-plus {
        transform: rotate(90deg);
      }
      .runtime-empty-groups-cta:hover .runtime-empty-groups-cta-arrow {
        opacity: 1;
        transform: translateX(0);
      }
      .runtime-empty-groups-cta-shine {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          110deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.22) 50%,
          rgba(255, 255, 255, 0) 100%
        );
        transform: translateX(-180%);
        animation: runtimeEmptyGroupsShine 3s linear infinite;
      }
      .runtime-empty-groups-subline {
        margin-top: 1.18rem;
        font-size: 0.9rem;
        color: #94a3b8;
      }
      .runtime-empty-groups-sub {
        border: 0;
        background: transparent;
        color: #14b8a6;
        font-size: 0.9rem;
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 2px;
        transition: color 0.2s ease;
      }
      .runtime-empty-groups-sub:hover {
        color: #0d9488;
      }
      .runtime-empty-groups-dots {
        margin-top: 1.45rem;
        display: flex;
        justify-content: center;
        gap: 0.45rem;
      }
      .runtime-empty-groups-dots span {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 999px;
        background: #cbd5e1;
        animation: runtimeEmptyGroupsDot 1.5s ease-in-out infinite;
      }
      .runtime-empty-groups-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      .runtime-empty-groups-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
      body.runtime-dark .runtime-empty-groups-card {
        border-color: rgba(148, 163, 184, 0.28);
        background: rgba(15, 23, 42, 0.9);
      }
      body.runtime-dark .runtime-empty-groups-card-glow {
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.1), rgba(2, 6, 23, 0.2), rgba(15, 23, 42, 0.06));
      }
      body.runtime-dark .runtime-empty-groups-title {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-empty-groups-note {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-empty-groups-pill {
        border-color: rgba(148, 163, 184, 0.24);
        background: rgba(15, 23, 42, 0.82);
        color: #dbe6f5;
      }
      body.runtime-dark .runtime-empty-groups-subline {
        color: #9aaec6;
      }
      @keyframes runtimeEmptyGroupsFloat {
        0%, 100% { transform: translate3d(0, -6px, 0); }
        50% { transform: translate3d(0, 6px, 0); }
      }
      @keyframes runtimeEmptyGroupsFloatRotate12 {
        0%, 100% { transform: translate3d(0, -6px, 0) rotate(12deg); }
        50% { transform: translate3d(0, 6px, 0) rotate(12deg); }
      }
      @keyframes runtimeEmptyGroupsFloatRotateN6 {
        0%, 100% { transform: translate3d(0, -6px, 0) rotate(-6deg); }
        50% { transform: translate3d(0, 6px, 0) rotate(-6deg); }
      }
      @keyframes runtimeEmptyGroupsFloatRotate6 {
        0%, 100% { transform: translate3d(0, -6px, 0) rotate(6deg); }
        50% { transform: translate3d(0, 6px, 0) rotate(6deg); }
      }
      @keyframes runtimeEmptyGroupsPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes runtimeEmptyGroupsSparkle {
        0% { opacity: 0; transform: scale(0) rotate(0deg); }
        50% { opacity: 1; transform: scale(1) rotate(160deg); }
        100% { opacity: 0; transform: scale(0) rotate(300deg); }
      }
      @keyframes runtimeEmptyGroupsOrbit {
        from { transform: translateX(-50%) rotate(0deg); }
        to { transform: translateX(-50%) rotate(360deg); }
      }
      @keyframes runtimeEmptyGroupsOrbitReverse {
        from { transform: translateY(-50%) rotate(0deg); }
        to { transform: translateY(-50%) rotate(-360deg); }
      }
      @keyframes runtimeEmptyGroupsShine {
        0% { transform: translateX(-180%); }
        100% { transform: translateX(190%); }
      }
      @keyframes runtimeEmptyGroupsDot {
        0%, 100% { transform: scale(1); opacity: 0.7; }
        50% { transform: scale(1.18); opacity: 1; }
      }
      @media (max-width: 760px) {
        .runtime-groups-empty-list {
          min-height: clamp(430px, 68vh, 680px);
          padding: 0;
        }
        .runtime-empty-groups-wrap {
          width: 100%;
          padding: 0;
        }
        .runtime-empty-groups-card {
          border-radius: 1.2rem;
          padding: 1.72rem 1.05rem 1.8rem;
        }
        .runtime-empty-groups-main-wrap {
          width: 6rem;
          height: 6rem;
          margin-bottom: 1.12rem;
        }
        .runtime-empty-groups-main-icon svg {
          width: 2.4rem;
          height: 2.4rem;
        }
        .runtime-empty-groups-title {
          font-size: 1.42rem;
        }
        .runtime-empty-groups-note {
          font-size: 0.93rem;
          max-width: 29rem;
          margin-top: 0.62rem;
        }
        .runtime-empty-groups-pills {
          margin-top: 1.18rem;
          gap: 0.52rem;
        }
        .runtime-empty-groups-pill {
          font-size: 0.78rem;
          padding: 0.38rem 0.68rem;
        }
        .runtime-empty-groups-cta {
          min-width: 15.4rem;
          font-size: 0.9rem;
          height: 2.72rem;
        }
        .runtime-empty-groups-float.coin-a {
          top: 1rem;
          left: 0.1rem;
        }
        .runtime-empty-groups-float.coin-b {
          top: 3rem;
          right: 0.2rem;
        }
        .runtime-empty-groups-float.coin-c {
          left: 0.1rem;
          bottom: 6.2rem;
        }
        .runtime-empty-groups-float.badge-receipt {
          top: 0.46rem;
          right: 3.15rem;
        }
        .runtime-empty-groups-float.badge-wallet {
          right: 0.05rem;
          bottom: 7.3rem;
        }
        .runtime-empty-groups-float.badge-users {
          top: 5.5rem;
          left: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .runtime-empty-groups-wrap * {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createRuntimeEmptyState(options = {}) {
    const title = normalizedText(options?.title || "Nothing here yet.");
    const note = normalizedText(options?.note || "");
    const compact = Boolean(options?.compact);
    const node = document.createElement("div");
    node.className = `runtime-empty-state${compact ? " compact" : ""}`;

    const icon = document.createElement("div");
    icon.className = "runtime-empty-state-icon";
    icon.innerHTML = emptyStateIconMarkup(options?.kind || "default");

    const copy = document.createElement("div");
    copy.className = "runtime-empty-state-copy";

    const titleNode = document.createElement("p");
    titleNode.className = "runtime-empty-state-title";
    titleNode.textContent = title;
    copy.appendChild(titleNode);

    if (note) {
      const noteNode = document.createElement("p");
      noteNode.className = "runtime-empty-state-note";
      noteNode.textContent = note;
      copy.appendChild(noteNode);
    }

    node.appendChild(icon);
    node.appendChild(copy);
    return node;
  }

  function renderRuntimeEmptyState(container, options = {}) {
    if (!(container instanceof HTMLElement)) return null;
    const node = createRuntimeEmptyState(options);
    container.innerHTML = "";
    container.classList.remove("runtime-skeleton-list");
    container.appendChild(node);
    return node;
  }

  function createNoGroupsShowcaseState() {
    ensureRuntimeNoGroupsStyles();
    const node = document.createElement("div");
    node.className = "runtime-empty-groups-wrap";
    node.innerHTML = `
      <div class="runtime-empty-groups-bg" aria-hidden="true">
        <span class="runtime-empty-groups-float coin coin-a"><span>$</span></span>
        <span class="runtime-empty-groups-float coin coin-b"><span>$</span></span>
        <span class="runtime-empty-groups-float coin coin-c"><span>$</span></span>
        <span class="runtime-empty-groups-float badge badge-receipt">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 4.6h10v14.8l-2-1.3-2 1.3-2-1.3-2 1.3V4.6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
            <path d="M9 9h6M9 12h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="runtime-empty-groups-float badge badge-wallet">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.8" y="6.4" width="16.4" height="11.2" rx="2.4" stroke="currentColor" stroke-width="1.7"/>
            <path d="M15.8 11.2h4.2v3.2h-4.2a1.6 1.6 0 0 1 0-3.2Z" stroke="currentColor" stroke-width="1.7"/>
          </svg>
        </span>
        <span class="runtime-empty-groups-float badge badge-users">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.6 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Zm6.6-.8a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" stroke-width="1.6"/>
            <path d="M4.9 17.8c.6-2.05 2.17-3.2 4.2-3.2 2.05 0 3.63 1.15 4.24 3.2M14.1 17c.43-1.46 1.6-2.28 3.2-2.28.9 0 1.7.23 2.3.65" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="runtime-empty-groups-sparkle sparkle-a">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 4 .95 2.7L15.7 7.6 13 8.55l-.9 2.75-.95-2.75L8.4 7.6l2.75-.9L12 4Z"/>
            <path d="m17.6 11.7.55 1.57 1.57.5-1.57.55-.55 1.57-.5-1.57-1.57-.55 1.57-.5.5-1.57Z"/>
          </svg>
        </span>
        <span class="runtime-empty-groups-sparkle sparkle-b">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 4 .95 2.7L15.7 7.6 13 8.55l-.9 2.75-.95-2.75L8.4 7.6l2.75-.9L12 4Z"/>
            <path d="m17.6 11.7.55 1.57 1.57.5-1.57.55-.55 1.57-.5-1.57-1.57-.55 1.57-.5.5-1.57Z"/>
          </svg>
        </span>
        <span class="runtime-empty-groups-orb orb-main"></span>
        <span class="runtime-empty-groups-orb orb-side"></span>
      </div>
      <article class="runtime-empty-groups-card runtime-motion-panel">
        <span class="runtime-empty-groups-card-glow" aria-hidden="true"></span>
        <div class="runtime-empty-groups-core">
          <div class="runtime-empty-groups-main-wrap">
            <div class="runtime-empty-groups-main-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8.7 10.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Zm6.7-.8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z" stroke="currentColor" stroke-width="1.75"/>
                <path d="M4.9 18.1c.67-2.24 2.4-3.5 4.66-3.5 2.29 0 4.03 1.26 4.7 3.5M14.3 17.2c.47-1.6 1.74-2.52 3.46-2.52.98 0 1.88.26 2.54.72" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="runtime-empty-groups-main-orbit orbit-a" aria-hidden="true"></span>
            <span class="runtime-empty-groups-main-orbit orbit-b" aria-hidden="true"></span>
          </div>
          <h3 class="runtime-empty-groups-title">No groups yet</h3>
          <p class="runtime-empty-groups-note">Create your first group to start splitting trips, rent, and shared expenses with friends and family.</p>
          <div class="runtime-empty-groups-pills">
            <span class="runtime-empty-groups-pill">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 4.6h10v14.8l-2-1.3-2 1.3-2-1.3-2 1.3V4.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M9 9h6M9 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
              Split bills
            </span>
            <span class="runtime-empty-groups-pill">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8.6 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Zm6.6-.8a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" stroke-width="1.6"/>
                <path d="M4.9 17.8c.6-2.05 2.17-3.2 4.2-3.2 2.05 0 3.63 1.15 4.24 3.2M14.1 17c.43-1.46 1.6-2.28 3.2-2.28.9 0 1.7.23 2.3.65" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
              Add friends
            </span>
            <span class="runtime-empty-groups-pill">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.8" y="6.4" width="16.4" height="11.2" rx="2.4" stroke="currentColor" stroke-width="1.6"/>
                <path d="M15.8 11.2h4.2v3.2h-4.2a1.6 1.6 0 0 1 0-3.2Z" stroke="currentColor" stroke-width="1.6"/>
              </svg>
              Track expenses
            </span>
          </div>
          <div class="runtime-empty-groups-actions">
            <button type="button" class="runtime-empty-groups-cta" data-runtime-empty-groups-create="1">
              <span class="runtime-empty-groups-cta-copy">
                <svg class="runtime-empty-groups-cta-plus" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5.2v13.6M5.2 12h13.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span>Create Your First Group</span>
                <svg class="runtime-empty-groups-cta-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14m0 0-4.5-4.5M19 12l-4.5 4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span class="runtime-empty-groups-cta-shine" aria-hidden="true"></span>
            </button>
          </div>
          <p class="runtime-empty-groups-subline">
            or <button type="button" class="runtime-empty-groups-sub" data-runtime-empty-groups-join="1">join an existing group</button>
          </p>
        </div>
      </article>
      <div class="runtime-empty-groups-dots" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    return node;
  }

  function renderNoGroupsShowcaseState(container) {
    if (!(container instanceof HTMLElement)) return null;
    container.innerHTML = "";
    container.classList.remove("runtime-skeleton-list");
    container.classList.add("runtime-groups-empty-list");
    const parent = container.parentElement;
    if (parent instanceof HTMLElement) {
      const parentStyles = window.getComputedStyle(parent);
      const leftPad = Number.parseFloat(parentStyles.paddingLeft || "0");
      const rightPad = Number.parseFloat(parentStyles.paddingRight || "0");
      const sidePad = Math.max(0, leftPad, rightPad);
      if (sidePad > 0) {
        container.style.setProperty("--runtime-empty-edge-pad", `${sidePad}px`);
      }
    }
    const node = createNoGroupsShowcaseState();
    container.appendChild(node);
    return node;
  }

  function flashSuccessState(target, options = {}) {
    if (!(target instanceof HTMLElement)) return;

    const durationMs = Math.max(560, Number(options.durationMs || 980));
    const pulseTarget = options?.pulseTarget instanceof HTMLElement ? options.pulseTarget : null;
    const targets = pulseTarget && pulseTarget !== target ? [target, pulseTarget] : [target];

    for (const node of targets) {
      node.classList.remove("runtime-success-pulse");
      if (node === target) {
        node.classList.remove("runtime-success-surface");
      }
      if (typeof node._runtimeSuccessTimer === "number") {
        window.clearTimeout(node._runtimeSuccessTimer);
      }
      void node.offsetWidth;
      node.classList.add("runtime-success-pulse");
      if (node === target) {
        node.classList.add("runtime-success-surface");
      }
      node._runtimeSuccessTimer = window.setTimeout(() => {
        node.classList.remove("runtime-success-pulse");
        if (node === target) {
          node.classList.remove("runtime-success-surface");
        }
        node._runtimeSuccessTimer = 0;
      }, durationMs);
    }
  }

  function readSearchHistory() {
    try {
      const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => normalizedText(item || ""))
        .filter(Boolean)
        .slice(0, SEARCH_HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  function writeSearchHistory(items) {
    try {
      const safe = Array.from(new Set((items || []).map((item) => normalizedText(item || "")).filter(Boolean))).slice(
        0,
        SEARCH_HISTORY_LIMIT
      );
      window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Ignore localStorage write failures.
    }
  }

  function readAIAssistantDraft() {
    try {
      return String(window.sessionStorage.getItem(AI_ASSISTANT_DRAFT_STORAGE_KEY) || "")
        .replace(/\r\n/g, "\n")
        .trim();
    } catch {
      return "";
    }
  }

  function writeAIAssistantDraft(value) {
    const safe = String(value || "")
      .replace(/\r\n/g, "\n")
      .trim();
    state.aiAssistantPrompt = safe;
    try {
      window.sessionStorage.setItem(AI_ASSISTANT_DRAFT_STORAGE_KEY, safe);
    } catch {
      // Ignore session storage write failures.
    }
    return safe;
  }

  function readAIAssistantImportPrefs() {
    try {
      const raw = window.localStorage.getItem(AI_ASSISTANT_IMPORT_PREFS_STORAGE_KEY);
      if (!raw) {
        return { allowDuplicates: false };
      }
      const parsed = JSON.parse(raw);
      const safe = parsed && typeof parsed === "object" ? parsed : {};
      return {
        allowDuplicates: Boolean(safe.allowDuplicates),
      };
    } catch {
      return { allowDuplicates: false };
    }
  }

  function writeAIAssistantImportPrefs(patch = {}) {
    const current = readAIAssistantImportPrefs();
    const next = {
      allowDuplicates:
        patch.allowDuplicates === undefined ? Boolean(current.allowDuplicates) : Boolean(patch.allowDuplicates),
    };
    state.aiAssistantAllowDuplicates = Boolean(next.allowDuplicates);
    state.aiAssistantImportPrefsLoaded = true;
    try {
      window.localStorage.setItem(AI_ASSISTANT_IMPORT_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage write failures.
    }
    return next;
  }

  function ensureAIAssistantImportPrefsLoaded() {
    if (state.aiAssistantImportPrefsLoaded) return;
    const prefs = readAIAssistantImportPrefs();
    state.aiAssistantAllowDuplicates = Boolean(prefs.allowDuplicates);
    state.aiAssistantImportPrefsLoaded = true;
  }

  function resolveAIAssistantActorName(session = null) {
    const sessionName = normalizedText(session?.name || "");
    if (sessionName) return sessionName;

    const email = normalizedText(session?.email || "");
    if (email && email.includes("@")) {
      return normalizedText(email.split("@")[0] || "Owner") || "Owner";
    }

    return "Owner";
  }

  function mergeAIAssistantText(currentValue, addition) {
    const current = String(currentValue || "")
      .replace(/\r\n/g, "\n")
      .trim();
    const next = String(addition || "")
      .replace(/\r\n/g, "\n")
      .trim();

    if (!next) return current;
    if (!current) return next;
    if (current.includes(next)) return current;
    return `${current}\n\n${next}`;
  }

  function isSupportedAIAssistantReceiptFile(file) {
    if (!(file instanceof File)) return false;
    const type = String(file.type || "").trim().toLowerCase();
    if (type === "image/png" || type === "image/jpeg" || type === "image/jpg" || type === "image/webp") {
      return true;
    }

    const name = normalizedKey(file.name || "");
    return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp");
  }

  function getAIAssistantReceiptFileSignature(file) {
    if (!(file instanceof File)) return "";
    return [
      normalizedKey(file.name || ""),
      normalizedKey(file.type || ""),
      String(Number(file.size || 0)),
      String(Number(file.lastModified || 0)),
    ].join(":");
  }

  function pickAIAssistantReceiptFiles(files, options = {}) {
    const limit = Math.max(1, Math.min(12, Number(options?.limit || 6)));
    const entries = Array.from(files || []);
    const picked = [];
    const seen = new Set();

    for (const file of entries) {
      if (!isSupportedAIAssistantReceiptFile(file)) continue;
      const signature = getAIAssistantReceiptFileSignature(file);
      if (signature && seen.has(signature)) continue;
      if (signature) seen.add(signature);
      picked.push(file);
      if (picked.length >= limit) break;
    }

    return picked;
  }

  function pickAIAssistantReceiptFile(files) {
    return pickAIAssistantReceiptFiles(files, { limit: 1 })[0] || null;
  }

  function pickAIAssistantClipboardImages(dataTransfer = null) {
    const picked = pickAIAssistantReceiptFiles(dataTransfer?.files || [], { limit: 8 });
    const seen = new Set(picked.map((file) => getAIAssistantReceiptFileSignature(file)).filter(Boolean));

    const items = Array.from(dataTransfer?.items || []);
    for (const item of items) {
      if (!item || item.kind !== "file") continue;
      const type = String(item.type || "").trim().toLowerCase();
      if (!type.startsWith("image/")) continue;
      const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
      if (!(file instanceof File) || !isSupportedAIAssistantReceiptFile(file)) continue;
      const signature = getAIAssistantReceiptFileSignature(file);
      if (signature && seen.has(signature)) continue;
      if (signature) seen.add(signature);
      picked.push(file);
      if (picked.length >= 8) break;
    }

    return picked;
  }

  function buildAIAssistantReceiptDraftLines(parsed = null, session = null, options = {}) {
    const merchant = normalizedText(parsed?.merchant || parsed?.suggestedTitle || "Receipt");
    const total = Number(parsed?.total || 0);
    const receiptDate = normalizedText(parsed?.receiptDate || "");
    const category = normalizedText(parsed?.suggestedCategory || "Misc") || "Misc";
    const actorName = resolveAIAssistantActorName(session);
    const sourceLabel = normalizedText(options?.sourceLabel || "");
    const itemNames = Array.isArray(parsed?.items)
      ? parsed.items
          .map((item) => normalizedText(item?.name || ""))
          .filter(Boolean)
          .slice(0, 5)
      : [];

    const lines = [
      total > 0
        ? `${merchant} ${total.toFixed(2)} paid by ${actorName} split among ${actorName}.`
        : `${merchant} paid by ${actorName} split among ${actorName}.`,
    ];

    if (receiptDate) {
      lines.push(`Date: ${receiptDate}`);
    }
    if (category) {
      lines.push(`Category: ${category}`);
    }
    if (sourceLabel) {
      lines.push(`Source: ${sourceLabel}`);
    }
    if (itemNames.length) {
      lines.push(`Items: ${itemNames.join(", ")}`);
    }

    return lines;
  }

  function buildAIAssistantDraftFromReceipt(parsed = null, session = null, options = {}) {
    const merchant = normalizedText(parsed?.merchant || parsed?.suggestedTitle || "Receipt");
    const actorName = resolveAIAssistantActorName(session);
    const groupName =
      merchant && normalizedKey(merchant) !== "unknown merchant"
        ? `${merchant} Receipt`
        : "Receipt Import";

    const lines = [`Group: ${groupName}`, `Members: ${actorName}`, ...buildAIAssistantReceiptDraftLines(parsed, session, options)];

    return lines.join("\n");
  }

  function buildAIAssistantBatchDraftFromReceipts(entries, session = null, options = {}) {
    const receipts = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry === "object") : [];
    if (!receipts.length) return "";

    if (receipts.length === 1) {
      const onlyEntry = receipts[0];
      return buildAIAssistantDraftFromReceipt(onlyEntry.parsed || null, session, {
        sourceLabel: onlyEntry.sourceLabel || options?.sourceLabel || "",
      });
    }

    const actorName = resolveAIAssistantActorName(session);
    const groupName = normalizedText(options?.groupName || "Receipt Import Batch") || "Receipt Import Batch";
    const lines = [`Group: ${groupName}`, `Members: ${actorName}`];

    receipts.forEach((entry, index) => {
      const sectionLines = buildAIAssistantReceiptDraftLines(entry?.parsed || null, session, {
        sourceLabel: entry?.sourceLabel || "",
      });
      if (!sectionLines.length) return;
      lines.push("");
      lines.push(`Receipt ${index + 1}:`);
      sectionLines.forEach((line, lineIndex) => {
        lines.push(lineIndex === 0 ? `- ${line}` : line);
      });
    });

    return lines.join("\n").trim();
  }

  function createAIAssistantOcrJobs(files) {
    return pickAIAssistantReceiptFiles(files || [], { limit: 8 }).map((file, index) => ({
      id: `${Date.now()}-${index}-${getAIAssistantReceiptFileSignature(file) || normalizedKey(file?.name || "receipt")}`,
      name: normalizedText(file?.name || `Receipt ${index + 1}`) || `Receipt ${index + 1}`,
      status: "queued",
      note: index === 0 ? "Waiting to start OCR scan." : `Queued behind ${index} earlier receipt${index === 1 ? "" : "s"}.`,
      progress: 10,
      file,
    }));
  }

  function setAIAssistantOcrJobs(jobs) {
    state.aiAssistantOcrJobs = Array.isArray(jobs)
      ? jobs
          .filter((job) => job && typeof job === "object")
          .map((job) => ({
            id: normalizedText(job.id || ""),
            name: normalizedText(job.name || "Receipt") || "Receipt",
            status: normalizedKey(job.status || "queued") || "queued",
            note: normalizedText(job.note || ""),
            progress: Math.max(0, Math.min(100, Number(job.progress || 0))),
            file: job.file instanceof File ? job.file : null,
          }))
      : [];
    renderAIAssistantOcrJobs();
  }

  function updateAIAssistantOcrJob(jobId, patch = {}) {
    const targetId = normalizedText(jobId || "");
    if (!targetId) return;

    let changed = false;
    state.aiAssistantOcrJobs = state.aiAssistantOcrJobs.map((job) => {
      if (normalizedText(job?.id || "") !== targetId) return job;
      changed = true;
      return {
        ...job,
        ...patch,
        note: normalizedText(patch?.note ?? job?.note ?? ""),
        progress: Math.max(0, Math.min(100, Number(patch?.progress ?? job?.progress ?? 0))),
      };
    });

    if (changed) {
      renderAIAssistantOcrJobs();
    }
  }

  function getAIAssistantOcrJobStatusView(job) {
    const status = normalizedKey(job?.status || "queued");
    if (status === "done" || status === "success") {
      return { label: "Ready", className: "is-success", progress: 100, rowClassName: "is-success" };
    }
    if (status === "skipped" || status === "error" || status === "failed") {
      return { label: "Skipped", className: "is-skipped", progress: 100, rowClassName: "is-skipped" };
    }
    if (status === "scanning" || status === "running") {
      return { label: "Scanning", className: "is-scanning", progress: Math.max(18, Number(job?.progress || 72)), rowClassName: "is-scanning" };
    }
    return { label: "Queued", className: "is-queued", progress: Math.max(8, Number(job?.progress || 10)), rowClassName: "is-queued" };
  }

  function summarizeAIAssistantOcrJobs(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    if (!list.length) return "";

    const totals = list.reduce(
      (acc, job) => {
        const status = normalizedKey(job?.status || "queued");
        if (status === "done" || status === "success") acc.ready += 1;
        else if (status === "skipped" || status === "error" || status === "failed") acc.skipped += 1;
        else if (status === "scanning" || status === "running") acc.scanning += 1;
        else acc.queued += 1;
        return acc;
      },
      { ready: 0, skipped: 0, scanning: 0, queued: 0 }
    );

    if (totals.scanning > 0) {
      return `Scanning ${totals.ready + totals.skipped + 1} of ${list.length}`;
    }
    if (totals.queued > 0) {
      return `${totals.ready} ready • ${totals.queued} queued`;
    }
    if (totals.skipped > 0) {
      return `${totals.ready} ready • ${totals.skipped} skipped`;
    }
    return `${totals.ready} ready`;
  }

  function describeAIAssistantOcrResult(parsed = null) {
    const merchant = normalizedText(parsed?.merchant || parsed?.suggestedTitle || "");
    const amount = Number(parsed?.total || 0);
    const category = normalizedText(parsed?.suggestedCategory || "");
    const parts = [];
    if (merchant) parts.push(merchant);
    if (amount > 0) parts.push(`Amount ${amount.toFixed(2)}`);
    if (category) parts.push(category);
    return parts.join(" • ");
  }

  function clearFinishedAIAssistantOcrJobs() {
    const next = (Array.isArray(state.aiAssistantOcrJobs) ? state.aiAssistantOcrJobs : []).filter((job) => {
      const status = normalizedKey(job?.status || "queued");
      return !["done", "success", "skipped", "error", "failed"].includes(status);
    });
    setAIAssistantOcrJobs(next);
  }

  function renderAIAssistantOcrJobs(root = null) {
    const host =
      root instanceof HTMLElement
        ? root
        : document.querySelector("#runtime-ai-assistant-card [data-runtime-ai-jobs]");
    if (!(host instanceof HTMLElement)) return;

    const jobs = Array.isArray(state.aiAssistantOcrJobs) ? state.aiAssistantOcrJobs : [];
    if (!jobs.length) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }

    host.hidden = false;
    host.innerHTML = "";

    const head = document.createElement("div");
    head.className = "runtime-ai-jobs-head";

    const headMain = document.createElement("div");
    headMain.className = "runtime-ai-jobs-head-main";
    const title = document.createElement("p");
    title.className = "runtime-ai-jobs-title";
    title.textContent = "Receipt Jobs";

    const meta = document.createElement("span");
    meta.className = "runtime-ai-jobs-meta";
    meta.textContent = summarizeAIAssistantOcrJobs(jobs);

    headMain.appendChild(title);
    headMain.appendChild(meta);
    head.appendChild(headMain);

    const completedCount = jobs.filter((job) => {
      const status = normalizedKey(job?.status || "queued");
      return ["done", "success", "skipped", "error", "failed"].includes(status);
    }).length;
    if (completedCount > 0) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "runtime-mini-btn";
      clearButton.textContent = "Clear Finished";
      clearButton.disabled = state.aiAssistantOcrBusy;
      clearButton.addEventListener("click", () => {
        clearFinishedAIAssistantOcrJobs();
        showToast("Finished receipt jobs cleared.", "info", 2200);
      });
      head.appendChild(clearButton);
    }

    host.appendChild(head);

    const list = document.createElement("div");
    list.className = "runtime-ai-job-list";

    jobs.slice(0, 8).forEach((job) => {
      const statusView = getAIAssistantOcrJobStatusView(job);
      const row = document.createElement("div");
      row.className = `runtime-ai-job runtime-motion-row ${statusView.rowClassName}`.trim();

      const main = document.createElement("div");
      main.className = "runtime-ai-job-main";

      const copy = document.createElement("div");
      copy.className = "runtime-ai-job-copy";
      const name = document.createElement("strong");
      name.className = "runtime-ai-job-name";
      name.textContent = normalizedText(job?.name || "Receipt") || "Receipt";
      const note = document.createElement("span");
      note.className = "runtime-ai-job-note";
      note.textContent = normalizedText(job?.note || "Waiting to start OCR scan.");
      copy.appendChild(name);
      copy.appendChild(note);

      const status = document.createElement("span");
      status.className = `runtime-ai-job-status ${statusView.className}`.trim();
      status.textContent = statusView.label;

      const side = document.createElement("div");
      side.className = "runtime-ai-job-side";
      side.appendChild(status);

      const rawStatus = normalizedKey(job?.status || "queued");
      if (["skipped", "error", "failed"].includes(rawStatus) && job?.file instanceof File) {
        const retryButton = document.createElement("button");
        retryButton.type = "button";
        retryButton.className = "runtime-mini-btn";
        retryButton.textContent = "Retry";
        retryButton.disabled = state.aiAssistantOcrBusy;
        retryButton.addEventListener("click", async () => {
          await retryAIAssistantOcrJob(job.id, retryButton);
        });
        side.appendChild(retryButton);
      }

      main.appendChild(copy);
      main.appendChild(side);

      const bar = document.createElement("div");
      bar.className = "runtime-ai-job-bar";
      const fill = document.createElement("div");
      fill.className = "runtime-ai-job-bar-fill";
      fill.style.width = `${statusView.progress}%`;
      bar.appendChild(fill);

      row.appendChild(main);
      row.appendChild(bar);
      list.appendChild(row);
    });

    host.appendChild(list);
  }

  async function scanAIAssistantReceiptFile(file) {
    const safeFile = file instanceof File ? file : null;
    if (!safeFile) {
      throw new Error("Choose a valid receipt image.");
    }

    const formData = new FormData();
    formData.append("file", safeFile);

    const result = await jsonRequest("/api/ocr/image", {
      method: "POST",
      body: formData,
    });
    if (!result.response.ok) {
      throw new Error(parseApiError(result.body, "Unable to read this receipt image."));
    }

    return {
      parsed: result.body?.parsed || null,
      sourceLabel: `OCR image ${normalizedText(result.body?.ocr?.fileName || safeFile.name || "")}`.trim(),
    };
  }

  async function retryAIAssistantOcrJob(jobId, trigger = null) {
    const targetId = normalizedText(jobId || "");
    const job = (Array.isArray(state.aiAssistantOcrJobs) ? state.aiAssistantOcrJobs : []).find(
      (entry) => normalizedText(entry?.id || "") === targetId
    );
    if (!job?.file || !(job.file instanceof File)) {
      showToast("Original receipt file is no longer available for retry.", "warn", 3600);
      return;
    }
    if (state.aiAssistantOcrBusy) {
      showToast("Receipt OCR is already running. Please wait a moment.", "info", 3200);
      return;
    }

    state.aiAssistantOcrBusy = true;
    const restore = trigger instanceof HTMLButtonElement ? setButtonBusy(trigger, true, "Retrying...") : () => {};

    try {
      updateAIAssistantOcrJob(targetId, {
        status: "scanning",
        note: "Retrying OCR for this receipt.",
        progress: 72,
      });

      const [session, scanned] = await Promise.all([fetchSession(false), scanAIAssistantReceiptFile(job.file)]);
      const draft = buildAIAssistantDraftFromReceipt(scanned.parsed, session, {
        sourceLabel: scanned.sourceLabel,
      });

      await setAIAssistantDraftFromReceipt(draft, {
        append: true,
        autoAnalyze: true,
        trigger,
      });

      updateAIAssistantOcrJob(targetId, {
        status: "done",
        note: describeAIAssistantOcrResult(scanned.parsed) || "Receipt scanned and added to the import draft.",
        progress: 100,
      });
      showToast("Receipt retry added to the AI assistant.", "success", 4200);
    } catch (error) {
      updateAIAssistantOcrJob(targetId, {
        status: "skipped",
        note: normalizedText(error?.message || "Retry failed for this receipt.") || "Retry failed for this receipt.",
        progress: 100,
      });
      showToast(String(error?.message || "Unable to retry receipt OCR."), "error", 5200);
    } finally {
      state.aiAssistantOcrBusy = false;
      renderAIAssistantOcrJobs();
      restore();
    }
  }

  async function setAIAssistantDraftFromReceipt(draftText, options = {}) {
    const card = document.getElementById("runtime-ai-assistant-card");
    const textarea = card?.querySelector("[data-runtime-ai-input]");
    const prompt = options?.append
      ? mergeAIAssistantText(textarea instanceof HTMLTextAreaElement ? textarea.value : state.aiAssistantPrompt, draftText)
      : String(draftText || "").trim();

    if (!prompt) return;

    state.aiAssistantPlan = null;
    state.aiAssistantPlanPrompt = "";
    writeAIAssistantDraft(prompt);

    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = prompt;
    }

    if (card instanceof HTMLElement) {
      flashSuccessState(card, { pulseTarget: options?.trigger instanceof HTMLElement ? options.trigger : null });
    }

    if (options?.autoAnalyze) {
      await analyzeAIAssistantPrompt(options?.trigger instanceof HTMLElement ? options.trigger : null, { silent: true });
    } else {
      renderAIAssistantCard();
    }
  }

  async function convertAIAssistantTextWithOCR(trigger = null) {
    const card = document.getElementById("runtime-ai-assistant-card");
    const textarea = card?.querySelector("[data-runtime-ai-input]");
    const rawText = String(textarea instanceof HTMLTextAreaElement ? textarea.value : state.aiAssistantPrompt || "")
      .replace(/\r\n/g, "\n")
      .trim();

    if (!rawText) {
      showToast("Paste receipt text into the assistant box first.", "warn", 3400);
      return;
    }

    const restore = trigger instanceof HTMLButtonElement ? setButtonBusy(trigger, true, "Parsing OCR...") : () => {};
    try {
      const [session, result] = await Promise.all([
        fetchSession(false),
        jsonRequest("/api/ocr/parse", {
          method: "POST",
          body: JSON.stringify({ text: rawText }),
        }),
      ]);
      if (!result.response.ok) {
        throw new Error(parseApiError(result.body, "Unable to parse OCR text."));
      }

      const parsed = result.body?.parsed || null;
      const draft = buildAIAssistantDraftFromReceipt(parsed, session, {
        sourceLabel: "OCR text import",
      });
      await setAIAssistantDraftFromReceipt(draft, {
        append: false,
        autoAnalyze: true,
        trigger,
      });
      showToast("OCR text converted into an AI import draft.", "success", 4200);
    } catch (error) {
      showToast(String(error?.message || "Unable to convert OCR text."), "error", 5200);
    } finally {
      restore();
    }
  }

  async function convertAIAssistantReceiptImages(files, trigger = null) {
    const safeFiles = pickAIAssistantReceiptFiles(files || [], { limit: 8 });
    if (!safeFiles.length) {
      showToast("Choose one or more receipt images first.", "warn", 3400);
      return;
    }

    if (state.aiAssistantOcrBusy) {
      showToast("Receipt OCR is already running. Please wait a moment.", "info", 3200);
      return;
    }

    state.aiAssistantOcrBusy = true;
    const totalCount = safeFiles.length;
    const jobs = createAIAssistantOcrJobs(safeFiles);
    setAIAssistantOcrJobs(jobs);
    const restore =
      trigger instanceof HTMLButtonElement
        ? setButtonBusy(trigger, true, totalCount > 1 ? `Scanning ${totalCount} receipts...` : "Scanning receipt...")
        : () => {};

    try {
      const session = await fetchSession(false);
      const receiptEntries = [];
      let failureCount = 0;

      for (let index = 0; index < safeFiles.length; index += 1) {
        const file = safeFiles[index];
        const job = jobs[index] || null;
        if (trigger instanceof HTMLButtonElement && totalCount > 1) {
          trigger.textContent = `Scanning ${index + 1}/${totalCount}...`;
        }
        if (job?.id) {
          updateAIAssistantOcrJob(job.id, {
            status: "scanning",
            note:
              totalCount > 1
                ? `Running OCR for receipt ${index + 1} of ${totalCount}.`
                : "Running OCR for this receipt.",
            progress: 72,
          });
        }

        try {
          const scanned = await scanAIAssistantReceiptFile(file);
          receiptEntries.push(scanned);
          if (job?.id) {
            updateAIAssistantOcrJob(job.id, {
              status: "done",
              note: describeAIAssistantOcrResult(scanned.parsed) || "Receipt scanned and added to the import draft.",
              progress: 100,
            });
          }
        } catch (error) {
          failureCount += 1;
          if (job?.id) {
            updateAIAssistantOcrJob(job.id, {
              status: "skipped",
              note: normalizedText(error?.message || "Receipt skipped during OCR.") || "Receipt skipped during OCR.",
              progress: 100,
            });
          }
          if (safeFiles.length === 1) {
            throw error;
          }
          console.warn("AI assistant receipt OCR failed", error);
        }
      }

      if (!receiptEntries.length) {
        throw new Error("Unable to scan any of these receipt images.");
      }

      const draft =
        receiptEntries.length === 1
          ? buildAIAssistantDraftFromReceipt(receiptEntries[0].parsed, session, {
              sourceLabel: receiptEntries[0].sourceLabel,
            })
          : buildAIAssistantBatchDraftFromReceipts(receiptEntries, session, {
              groupName: "Receipt Import Batch",
            });

      await setAIAssistantDraftFromReceipt(draft, {
        append: true,
        autoAnalyze: true,
        trigger,
      });

      const successCount = receiptEntries.length;
      if (successCount === 1 && failureCount === 0) {
        showToast("Receipt OCR inserted into the AI assistant.", "success", 4200);
      } else if (failureCount > 0) {
        showToast(
          `Added OCR from ${successCount} receipt${successCount === 1 ? "" : "s"} with ${failureCount} skipped.`,
          "warn",
          5200
        );
      } else {
        showToast(`Added OCR from ${successCount} receipts into the AI assistant.`, "success", 4600);
      }
    } catch (error) {
      const errorNote = normalizedText(error?.message || "Unable to scan receipt image.") || "Unable to scan receipt image.";
      if (Array.isArray(state.aiAssistantOcrJobs) && state.aiAssistantOcrJobs.length) {
        setAIAssistantOcrJobs(
          state.aiAssistantOcrJobs.map((job) => {
            const status = normalizedKey(job?.status || "queued");
            if (status === "done" || status === "success" || status === "skipped" || status === "error" || status === "failed") {
              return job;
            }
            return {
              ...job,
              status: "skipped",
              note: errorNote,
              progress: 100,
            };
          })
        );
      }
      showToast(String(error?.message || "Unable to scan receipt image."), "error", 5600);
    } finally {
      state.aiAssistantOcrBusy = false;
      renderAIAssistantOcrJobs();
      restore();
    }
  }

  function rememberSearchQuery(query) {
    const value = normalizedText(query || "");
    if (!value) return;
    const next = [value, ...readSearchHistory().filter((item) => normalizedKey(item) !== normalizedKey(value))];
    writeSearchHistory(next);
  }

  function searchSuggestionsLabel(item) {
    if (!item || typeof item !== "object") return "";
    if (item.kind === "group") return normalizedText(item.name || "");
    if (item.kind === "expense") return normalizedText(item.title || "");
    if (item.kind === "activity") return normalizedText(item.message || "");
    return "";
  }

  function ensureSearchSuggestionList() {
    let datalist = document.getElementById("runtime-global-search-datalist");
    if (!(datalist instanceof HTMLDataListElement)) {
      datalist = document.createElement("datalist");
      datalist.id = "runtime-global-search-datalist";
      document.body.appendChild(datalist);
    }
    return datalist;
  }

  function applySearchSuggestions(input, query, results = []) {
    if (!(input instanceof HTMLInputElement)) return;

    const historyMatches = readSearchHistory().filter((item) => {
      const key = normalizedKey(item);
      const q = normalizedKey(query || "");
      return !q || key.includes(q);
    });
    const apiMatches = results.map(searchSuggestionsLabel).filter(Boolean);
    const merged = Array.from(new Set([...historyMatches, ...apiMatches])).slice(0, 12);

    const datalist = ensureSearchSuggestionList();
    datalist.innerHTML = "";
    for (const value of merged) {
      const option = document.createElement("option");
      option.value = value;
      datalist.appendChild(option);
    }

    if (merged.length) {
      input.setAttribute("list", datalist.id);
    } else {
      input.removeAttribute("list");
    }
  }

  function searchResultHref(item) {
    const href = String(item?.href || "").trim();
    if (!href.startsWith("/") || href.startsWith("//")) return "";
    return href;
  }

  function topSearchResult(results = []) {
    const list = Array.isArray(results) ? results : [];
    return list.find((item) => Boolean(searchResultHref(item))) || null;
  }

  async function fetchGlobalSearchPreview(query) {
    const normalizedQuery = normalizedText(query || "");
    const cacheKey = normalizedKey(normalizedQuery);
    if (cacheKey.length < 2) {
      state.searchPreviewQuery = "";
      state.searchPreviewResults = [];
      return [];
    }

    const cached = state.searchPreviewCache.get(cacheKey);
    if (cached && Date.now() - Number(cached.at || 0) < 20_000) {
      state.searchPreviewQuery = cacheKey;
      state.searchPreviewResults = Array.isArray(cached.items) ? cached.items : [];
      state.searchPreviewAt = Date.now();
      return state.searchPreviewResults;
    }

    if (state.searchPreviewAbort) {
      try {
        state.searchPreviewAbort.abort();
      } catch {
        // Ignore abort errors.
      }
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    state.searchPreviewAbort = controller;

    try {
      const { response, body } = await jsonRequest(
        `/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=6`,
        {
          method: "GET",
          headers: {},
          signal: controller?.signal,
        }
      );
      if (!response.ok) {
        return [];
      }

      const items = Array.isArray(body?.items) ? body.items : [];
      state.searchPreviewQuery = cacheKey;
      state.searchPreviewResults = items;
      state.searchPreviewAt = Date.now();
      state.searchPreviewCache.set(cacheKey, {
        at: Date.now(),
        items,
      });
      if (state.searchPreviewCache.size > 40) {
        const firstKey = state.searchPreviewCache.keys().next().value;
        if (firstKey) {
          state.searchPreviewCache.delete(firstKey);
        }
      }
      return items;
    } catch (error) {
      if (String(error?.name || "") === "AbortError") {
        return state.searchPreviewResults;
      }
      return [];
    } finally {
      if (state.searchPreviewAbort === controller) {
        state.searchPreviewAbort = null;
      }
    }
  }

  function toSafePositiveInt(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }

  function toSafeAmount(value) {
    if (normalizedText(value || "") === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Number(parsed.toFixed(2));
  }

  function normalizeFilterCriteria(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const dateFrom = normalizedText(source.dateFrom || "");
    const dateTo = normalizedText(source.dateTo || "");
    return {
      search: normalizedText(source.search || ""),
      category: normalizedText(source.category || ""),
      memberId: toSafePositiveInt(source.memberId),
      dateFrom: dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : "",
      dateTo: dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : "",
      minAmount: toSafeAmount(source.minAmount),
      maxAmount: toSafeAmount(source.maxAmount),
    };
  }

  function filterCriteriaSummary(criteria = {}) {
    const safe = normalizeFilterCriteria(criteria);
    const parts = [];
    if (safe.search) parts.push(`Search "${safe.search}"`);
    if (safe.category) parts.push(`Category ${safe.category}`);
    if (safe.memberId) parts.push(`Member #${safe.memberId}`);
    if (safe.dateFrom || safe.dateTo) parts.push(`Date ${safe.dateFrom || "any"} to ${safe.dateTo || "any"}`);
    if (safe.minAmount !== null || safe.maxAmount !== null) {
      parts.push(`Amount ${safe.minAmount !== null ? safe.minAmount : 0} to ${safe.maxAmount !== null ? safe.maxAmount : "any"}`);
    }
    return parts.length ? parts.join(" • ") : "Criteria saved";
  }

  function getCurrentCriteriaSeed(searchInput) {
    const params = new URLSearchParams(window.location.search || "");
    const storedRaw = window.sessionStorage.getItem(ACTIVE_EXPENSE_FILTER_STORAGE_KEY);
    let stored = {};
    try {
      stored = storedRaw ? JSON.parse(storedRaw) : {};
    } catch {
      stored = {};
    }
    return normalizeFilterCriteria({
      search: normalizedText(searchInput?.value || params.get("search") || stored?.search || ""),
      category: normalizedText(params.get("category") || stored?.category || ""),
      memberId: params.get("memberId") || stored?.memberId || "",
      dateFrom: params.get("dateFrom") || stored?.dateFrom || "",
      dateTo: params.get("dateTo") || stored?.dateTo || "",
      minAmount: params.get("minAmount") || stored?.minAmount || "",
      maxAmount: params.get("maxAmount") || stored?.maxAmount || "",
    });
  }

  function criteriaToQuery(criteria = {}) {
    const safe = normalizeFilterCriteria(criteria);
    const query = new URLSearchParams();
    if (safe.search) query.set("search", safe.search);
    if (safe.category) query.set("category", safe.category);
    if (safe.memberId) query.set("memberId", String(safe.memberId));
    if (safe.dateFrom) query.set("dateFrom", safe.dateFrom);
    if (safe.dateTo) query.set("dateTo", safe.dateTo);
    if (safe.minAmount !== null) query.set("minAmount", String(safe.minAmount));
    if (safe.maxAmount !== null) query.set("maxAmount", String(safe.maxAmount));
    return query;
  }

  function formatFilterChipDate(value) {
    const text = normalizedText(value || "");
    if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return "Any";
    const parsed = new Date(`${text}T00:00:00`);
    if (!Number.isFinite(parsed.getTime())) return text;
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function formatFilterChipAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Any";
    return amount % 1 === 0 ? String(amount) : amount.toFixed(2);
  }

  function activeFilterChipDescriptors(criteria = {}) {
    const safe = normalizeFilterCriteria(criteria);
    const chips = [];

    if (safe.search) {
      chips.push({
        key: "search",
        name: "Search",
        label: `Search: ${safe.search}`,
      });
    }
    if (safe.category) {
      chips.push({
        key: "category",
        name: "Category",
        label: `Category: ${safe.category}`,
      });
    }
    if (safe.memberId) {
      chips.push({
        key: "memberId",
        name: "Member",
        label: `Member #${safe.memberId}`,
      });
    }
    if (safe.dateFrom || safe.dateTo) {
      chips.push({
        key: "dateRange",
        name: "Date range",
        label: `Date: ${formatFilterChipDate(safe.dateFrom)} - ${formatFilterChipDate(safe.dateTo)}`,
      });
    }
    if (safe.minAmount !== null || safe.maxAmount !== null) {
      let amountLabel = "";
      if (safe.minAmount !== null && safe.maxAmount !== null) {
        amountLabel = `${formatFilterChipAmount(safe.minAmount)}-${formatFilterChipAmount(safe.maxAmount)}`;
      } else if (safe.minAmount !== null) {
        amountLabel = `>= ${formatFilterChipAmount(safe.minAmount)}`;
      } else {
        amountLabel = `<= ${formatFilterChipAmount(safe.maxAmount)}`;
      }

      chips.push({
        key: "amountRange",
        name: "Amount range",
        label: `Amount: ${amountLabel}`,
      });
    }

    return chips;
  }

  function clearFilterCriteriaValue(criteria = {}, key = "") {
    const safe = normalizeFilterCriteria(criteria);
    const next = { ...safe };

    if (key === "search") next.search = "";
    if (key === "category") next.category = "";
    if (key === "memberId") next.memberId = null;
    if (key === "dateRange") {
      next.dateFrom = "";
      next.dateTo = "";
    }
    if (key === "amountRange") {
      next.minAmount = null;
      next.maxAmount = null;
    }

    return normalizeFilterCriteria(next);
  }

  function removeActiveFilterChips() {
    const existing = document.getElementById("runtime-active-filter-row");
    if (existing) existing.remove();
  }

  function ensureActiveFilterChipsRoot(searchInput) {
    if (!(searchInput instanceof HTMLInputElement)) return null;

    let root = document.getElementById("runtime-active-filter-row");
    if (!(root instanceof HTMLElement)) {
      root = document.createElement("div");
      root.id = "runtime-active-filter-row";
      root.className = "runtime-active-filter-row";
    }

    const header = searchInput.closest("header");
    const inputContainer = searchInput.closest("div");
    const parent =
      header?.parentElement ||
      inputContainer?.parentElement ||
      searchInput.closest("main") ||
      document.querySelector("main") ||
      document.body;

    if (!(parent instanceof HTMLElement)) return root;

    if (header && header.parentElement === parent) {
      parent.insertBefore(root, header.nextSibling);
      return root;
    }

    if (inputContainer && inputContainer.parentElement === parent) {
      parent.insertBefore(root, inputContainer.nextSibling);
      return root;
    }

    if (root.parentElement !== parent) {
      parent.prepend(root);
    }
    return root;
  }

  function renderActiveFilterChips(criteria = null) {
    const currentPath = normalizePath(window.location.pathname);
    if (!shouldEnableFilterChips(currentPath)) {
      removeActiveFilterChips();
      return;
    }

    const searchInput = getDashboardSearchInput();
    if (!(searchInput instanceof HTMLInputElement)) {
      removeActiveFilterChips();
      return;
    }

    const safe = normalizeFilterCriteria(criteria || getCurrentCriteriaSeed(searchInput));
    const descriptors = activeFilterChipDescriptors(safe);
    const root = ensureActiveFilterChipsRoot(searchInput);
    if (!(root instanceof HTMLElement)) return;

    root.innerHTML = "";
    if (!descriptors.length) {
      root.style.display = "none";
      return;
    }

    root.style.display = "";

    const title = document.createElement("span");
    title.className = "runtime-active-filter-label";
    title.textContent = "Active Filters";
    root.appendChild(title);

    for (const descriptor of descriptors) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "runtime-filter-chip";
      chip.title = `Remove ${descriptor.name}`;

      const text = document.createElement("span");
      text.className = "runtime-filter-chip-text";
      text.textContent = descriptor.label;

      const close = document.createElement("span");
      close.className = "runtime-filter-chip-close";
      close.textContent = "×";

      chip.appendChild(text);
      chip.appendChild(close);
      chip.addEventListener("click", (event) => {
        stopEvent(event);
        const next = clearFilterCriteriaValue(safe, descriptor.key);
        applySavedFilterCriteria(next, { silent: true });
        showToast(`${descriptor.name} filter removed.`, "info", 1800);
      });
      root.appendChild(chip);
    }

    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "runtime-mini-btn";
    clearAll.textContent = "Clear All";
    clearAll.addEventListener("click", (event) => {
      stopEvent(event);
      applySavedFilterCriteria({}, { silent: true });
      showToast("All filters cleared.", "info", 2000);
    });
    root.appendChild(clearAll);
  }

  function getDashboardSearchInput() {
    const candidates = Array.from(document.querySelectorAll("input[type='text'], input"));
    return (
      candidates.find((input) => {
        const placeholder = normalizedKey(input?.placeholder || "");
        const ariaLabel = normalizedKey(input?.getAttribute?.("aria-label") || "");
        const name = normalizedKey(input?.getAttribute?.("name") || "");
        return placeholder.includes("search") || ariaLabel.includes("search") || name.includes("search");
      }) || null
    );
  }

  function dashboardListRoots() {
    const groupsHeading = Array.from(document.querySelectorAll("h2")).find((item) =>
      normalizedKey(item.textContent || "") === "your groups"
    );
    const groupsRoot = groupsHeading?.closest("div.bg-white.rounded-2xl")?.querySelector(".divide-y") || null;

    const activityHeading = Array.from(document.querySelectorAll("h2")).find((item) =>
      normalizedKey(item.textContent || "") === "recent activity"
    );
    const activityRoot = activityHeading?.closest("div.bg-white.rounded-2xl")?.querySelector(".divide-y") || null;

    return { groupsRoot, activityRoot };
  }

  function toggleSearchEmptyState(root, id, text, visible) {
    if (!root) return;
    let node = root.querySelector(`#${id}`);
    if (!node) {
      node = createRuntimeEmptyState({
        title: normalizedText(text || "No matches found."),
        note: "Try broadening the search or clearing a filter chip.",
        kind: "search",
        compact: true,
      });
      node.id = id;
      root.appendChild(node);
    }
    node.style.display = visible ? "" : "none";
  }

  function applyDashboardSearchFilter(rawQuery) {
    const query = normalizedKey(rawQuery || "");
    const { groupsRoot, activityRoot } = dashboardListRoots();

    const applyFilter = (root, emptyId, emptyLabel) => {
      if (!root) return;
      const rows = Array.from(root.children).filter((node) => node.id !== emptyId);
      let visibleCount = 0;

      for (const row of rows) {
        const text = normalizedKey(row.textContent || "");
        const visible = !query || text.includes(query);
        row.style.display = visible ? "" : "none";
        if (visible) visibleCount += 1;
      }

      toggleSearchEmptyState(root, emptyId, emptyLabel, Boolean(query) && visibleCount === 0);
    };

    applyFilter(groupsRoot, "runtime-groups-search-empty", "No groups match this search.");
    applyFilter(activityRoot, "runtime-activity-search-empty", "No activity matches this search.");
  }

  function installDashboardSearch() {
    const currentPath = normalizePath(window.location.pathname);
    if (!shouldEnableFilterChips(currentPath)) {
      removeActiveFilterChips();
      return;
    }

    const input = getDashboardSearchInput();
    if (!input) {
      removeActiveFilterChips();
      return;
    }

    if (input.dataset.runtimeSearchBound !== "1") {
      input.dataset.runtimeSearchBound = "1";

      const scheduleRemotePreview = () => {
        if (state.searchPreviewTimer) {
          window.clearTimeout(state.searchPreviewTimer);
          state.searchPreviewTimer = null;
        }

        const query = input.value || "";
        if (normalizedKey(query).length < 2) {
          state.searchPreviewQuery = "";
          state.searchPreviewResults = [];
          applySearchSuggestions(input, query, []);
          return;
        }

        state.searchPreviewTimer = window.setTimeout(async () => {
          const pendingQuery = input.value || "";
          const results = await fetchGlobalSearchPreview(pendingQuery);
          if (normalizedKey(input.value || "") !== normalizedKey(pendingQuery)) return;
          applySearchSuggestions(input, pendingQuery, results);
        }, 280);
      };

      const onSearch = () => {
        const query = input.value || "";
        applyDashboardSearchFilter(query);
        scheduleRemotePreview();
        const snapshot = getCurrentCriteriaSeed(input);
        persistActiveFilterCriteria(snapshot);
        renderActiveFilterChips(snapshot);
      };

      input.addEventListener("input", onSearch);
      input.addEventListener("search", onSearch);
      input.addEventListener("focus", () => {
        applySearchSuggestions(input, input.value || "", state.searchPreviewResults || []);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const query = input.value || "";
        rememberSearchQuery(query);

        if (normalizedKey(query).length < 2) return;
        const match = topSearchResult(state.searchPreviewResults || []);
        const href = searchResultHref(match);
        if (!href) return;
        stopEvent(event);
        navigateWithTransition(href);
      });
      input.addEventListener("blur", () => {
        rememberSearchQuery(input.value || "");
      });
    }

    const initialCriteria = getCurrentCriteriaSeed(input);
    if (!normalizedText(input.value || "") && initialCriteria.search) {
      input.value = initialCriteria.search;
    }

    applyDashboardSearchFilter(input.value || "");
    applySearchSuggestions(input, input.value || "", state.searchPreviewResults || []);
    persistActiveFilterCriteria(getCurrentCriteriaSeed(input));
    renderActiveFilterChips(getCurrentCriteriaSeed(input));
  }

  function readOnboardingProgress() {
    try {
      const raw = window.localStorage.getItem(ONBOARDING_PROGRESS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return {};
      return {
        create_group: parsed.create_group === true,
        add_expense: parsed.add_expense === true,
        invite_member: parsed.invite_member === true,
        settle_up: parsed.settle_up === true,
      };
    } catch {
      return {};
    }
  }

  function writeOnboardingProgress(progress = {}) {
    try {
      const safe = {
        create_group: progress.create_group === true,
        add_expense: progress.add_expense === true,
        invite_member: progress.invite_member === true,
        settle_up: progress.settle_up === true,
      };
      window.localStorage.setItem(ONBOARDING_PROGRESS_STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Ignore localStorage failures.
    }
  }

  function mergeOnboardingProgress(patch = {}) {
    const current = readOnboardingProgress();
    const next = {
      ...current,
      create_group: patch.create_group === true ? true : current.create_group === true,
      add_expense: patch.add_expense === true ? true : current.add_expense === true,
      invite_member: patch.invite_member === true ? true : current.invite_member === true,
      settle_up: patch.settle_up === true ? true : current.settle_up === true,
    };
    writeOnboardingProgress(next);
    return next;
  }

  function onboardingDerivedState(snapshot = null) {
    const counts = snapshot?.counts || {};
    const groups = Number(counts.groups || 0);
    const expenses = Number(counts.expenses || 0);
    const members = Number(counts.members || 0);
    const payments = Number(counts.payments || 0);
    const pendingSettlements = Number(counts.pendingSettlements || 0);

    return {
      create_group: groups > 0,
      add_expense: expenses > 0,
      invite_member: members > groups,
      settle_up: payments > 0 || (expenses > 0 && pendingSettlements === 0),
    };
  }

  function onboardingItems(snapshot = null) {
    const manual = readOnboardingProgress();
    const derived = onboardingDerivedState(snapshot);
    const done = (key) => Boolean(manual[key] || derived[key]);
    return [
      {
        key: "create_group",
        label: "Create a group",
        hint: "Start collaboration by creating your first group.",
        route: "/create-group",
        completed: done("create_group"),
        locked: derived.create_group,
      },
      {
        key: "add_expense",
        label: "Add first expense",
        hint: "Track your first shared payment.",
        route: "/create-expense",
        completed: done("add_expense"),
        locked: derived.add_expense,
      },
      {
        key: "invite_member",
        label: "Invite a member",
        hint: "Add at least one teammate to split expenses.",
        route: "/groups",
        completed: done("invite_member"),
        locked: derived.invite_member,
      },
      {
        key: "settle_up",
        label: "Set up settlement",
        hint: "Record or request your first settlement payment.",
        route: "/settle",
        completed: done("settle_up"),
        locked: derived.settle_up,
      },
    ];
  }

  function collectPlannedMemberEntries(plan = null) {
    const safePlan = plan && typeof plan === "object" ? plan : null;
    const deduped = new Map();

    const pushEntry = (name, email = "") => {
      const safeName = normalizedText(name || "");
      const key = normalizedKey(safeName);
      if (!key) return;

      const existing = deduped.get(key);
      if (existing) {
        if (!existing.email && email) {
          existing.email = normalizedText(email || "");
        }
        return;
      }

      deduped.set(key, {
        name: safeName,
        email: normalizedText(email || ""),
      });
    };

    for (const member of safePlan?.members || []) {
      pushEntry(member?.name || "", member?.email || "");
    }

    for (const expense of safePlan?.expenses || []) {
      pushEntry(expense?.payerName || "");
      for (const name of expense?.participantNames || []) {
        pushEntry(name || "");
      }

      const percentages = expense?.splitConfig?.percentages || {};
      for (const name of Object.keys(percentages)) {
        pushEntry(name);
      }

      const shares = expense?.splitConfig?.shares || {};
      for (const name of Object.keys(shares)) {
        pushEntry(name);
      }
    }

    return Array.from(deduped.values());
  }

  function buildGroupMemberNameMap(groupDetail = null) {
    const map = new Map();
    for (const member of groupDetail?.members || []) {
      const key = normalizedKey(member?.name || "");
      const id = Number(member?.id || 0);
      if (!key || !Number.isFinite(id) || id <= 0 || map.has(key)) continue;
      map.set(key, id);
    }
    return map;
  }

  function resolveSessionMemberIdInGroup(groupDetail = null, session = null) {
    const sessionUserId = Number(session?.userId || 0);
    if (!Number.isFinite(sessionUserId) || sessionUserId <= 0) return 0;

    for (const member of groupDetail?.members || []) {
      if (Number(member?.userId || 0) === sessionUserId) {
        return Number(member.id || 0);
      }
    }

    return 0;
  }

  const AI_ASSISTANT_LOCAL_PATTERNS = {
    groupName: [
      /group\s+(?:called|named)?\s*["']?([^"']+?)["']?\s+(?:with|for|and)/i,
      /create\s+(?:a\s+)?group\s+(?:called|named)?\s*["']?([^"']+?)["']?$/i,
      /(?:called|named)\s+["']?([^"']+?)["']?\s+with/i,
      /(?:for|about)\s+["']?([^"']+?)["']?\s+(?:with|expense)/i,
    ],
    members: [
      /with\s+(.+?)(?:\s+(?:for|expense|spent|paid|and\s+\$))/i,
      /add\s+(.+?)(?:\s+(?:to|for|and))/i,
      /members?(?:\s+are)?:?\s+(.+?)(?:\s+(?:for|expense|and\s+\$))/i,
    ],
    expenseDescription: [
      /for\s+(.+?)(?:\s+(?:cost|worth|at|from|on|with))/i,
      /(?:spent|paid)\s+(?:on|for)?\s+(.+?)(?:\s+(?:cost|worth|\$|with))/i,
      /(?:dinner|lunch|breakfast|trip|gas|groceries|rent|utilities|movie|concert|hotel|flight)/i,
    ],
    amount: [
      /\$\s*(\d+(?:\.\d{1,2})?)/,
      /(\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd|inr|rs)/i,
      /cost\s+(?:me|us)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
      /worth\s+\$?\s*(\d+(?:\.\d{1,2})?)/i,
      /total\s+(?:of\s+)?\$?\s*(\d+(?:\.\d{1,2})?)/i,
    ],
    paidBy: [
      /(\w+)\s+(?:paid|spent|covered|bought)/i,
      /paid\s+(?:by\s+)?(\w+)/i,
      /(\w+)\s+(?:got|bought|purchased)/i,
    ],
  };

  function aiExtractGroupName(input = "") {
    const text = String(input || "");
    for (const pattern of AI_ASSISTANT_LOCAL_PATTERNS.groupName) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return normalizedText(String(match[1] || "").replace(/[.,]$/, ""));
      }
    }
    const fallback = text.match(
      /(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?group\s+(?:for\s+)?([A-Z][a-zA-Z\s]+?)(?:\s+(?:with|for|and)\s|$)/
    );
    return fallback?.[1] ? normalizedText(String(fallback[1] || "")) : "";
  }

  function aiExtractMembers(input = "") {
    const text = String(input || "");
    const members = [];
    for (const pattern of AI_ASSISTANT_LOCAL_PATTERNS.members) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const names = String(match[1] || "")
        .split(/(?:,\s*|\s+and\s+|\s+&\s+)/)
        .map((value) =>
          normalizedText(
            String(value || "")
              .replace(/^(?:add|include|with)\s+/i, "")
              .replace(/\s+(?:and|&)$/, "")
              .replace(/[.,]$/, "")
          )
        )
        .filter((name) => name.length > 1 && !/^(?:me|myself|i)$/i.test(name));

      for (const name of names) {
        if (!members.some((member) => normalizedKey(member.name) === normalizedKey(name))) {
          members.push({ name });
        }
      }
      if (members.length) break;
    }
    return members;
  }

  function aiExtractExpenseDescription(input = "") {
    const text = String(input || "");
    const common = [
      "dinner",
      "lunch",
      "breakfast",
      "brunch",
      "groceries",
      "gas",
      "fuel",
      "rent",
      "utilities",
      "bills",
      "movie",
      "concert",
      "hotel",
      "flight",
      "trip",
      "travel",
      "uber",
      "taxi",
      "ride",
      "coffee",
      "drinks",
      "subscription",
      "internet",
    ];

    for (const token of common) {
      const regex = new RegExp(`\\b${token}\\b`, "i");
      if (!regex.test(text)) continue;
      const context = text.match(
        new RegExp(`(?:for|on|at)\\s+([a-z\\s]*${token}[a-z\\s]*?)(?:\\s+(?:cost|worth|\\$|with|and))`, "i")
      );
      if (context?.[1]) return normalizedText(context[1]);
      return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
    }

    for (const pattern of AI_ASSISTANT_LOCAL_PATTERNS.expenseDescription) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return normalizedText(String(match[1] || "").replace(/[.,]$/, ""));
      }
    }
    return "";
  }

  function aiExtractAmount(input = "") {
    const text = String(input || "");
    for (const pattern of AI_ASSISTANT_LOCAL_PATTERNS.amount) {
      const match = text.match(pattern);
      const amount = Number.parseFloat(String(match?.[1] || ""));
      if (Number.isFinite(amount) && amount > 0) return Number(amount.toFixed(2));
    }
    return null;
  }

  function aiExtractPaidBy(input = "", members = []) {
    const text = String(input || "");
    for (const pattern of AI_ASSISTANT_LOCAL_PATTERNS.paidBy) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const payer = normalizedText(match[1] || "");
      const payerKey = normalizedKey(payer);
      const memberMatch = members.find(
        (member) =>
          normalizedKey(member?.name || "") === payerKey ||
          normalizedKey(member?.name || "").startsWith(payerKey)
      );
      if (memberMatch) return memberMatch.name;
      if (payerKey === "i" || payerKey === "me" || payerKey === "myself") return "You";
      return payer;
    }
    return members.length ? members[0].name : "You";
  }

  function aiDetectCategory(text = "") {
    const key = normalizedKey(text || "");
    if (!key) return "misc";
    if (/dinner|lunch|breakfast|brunch|food|zomato|swiggy|coffee|drinks/.test(key)) return "food";
    if (/uber|taxi|cab|ride|trip|flight|bus|train|fuel|gas/.test(key)) return "travel";
    if (/rent|subscription|internet|electricity|utility|bill/.test(key)) return "utility";
    if (/movie|concert|game|entertainment/.test(key)) return "entertainment";
    return "misc";
  }

  function parseAIAssistantLanguagePrompt(input = "") {
    const text = normalizedText(input || "");
    const errors = [];
    const groupName = aiExtractGroupName(text);
    const members = aiExtractMembers(text);
    const description = aiExtractExpenseDescription(text) || "Expense";
    const amount = aiExtractAmount(text);

    if (!groupName) {
      errors.push("Couldn't identify a group name. Try: Create a group called Weekend Trip ...");
    }
    if (!members.length) {
      errors.push("Couldn't identify members. Try: with John, Sarah, and Mike ...");
    }

    const expenses = [];
    if (amount && amount > 0) {
      const paidBy = aiExtractPaidBy(text, members);
      const splitAmong = Array.from(
        new Set([
          ...members.map((member) => member.name),
          ...(paidBy && normalizedKey(paidBy) !== "you" ? [paidBy] : []),
        ].map((value) => normalizedText(value || "")).filter(Boolean))
      );
      expenses.push({
        title: description,
        amount: Number(amount.toFixed(2)),
        payerName: normalizedText(paidBy || "You"),
        participantNames: splitAmong,
        splitMode: "equal",
        splitConfig: null,
        category: aiDetectCategory(description),
        notes: "Parsed from AI assistant language parser.",
      });
    }

    const isValid = errors.length === 0 && members.length > 0;
    const warnings = [];
    if (!expenses.length && isValid) {
      warnings.push("No expense amount found. Group will be created without an expense.");
    }

    const currencyMatch = text.match(/\b(INR|USD|EUR|GBP|AED|SGD|AUD|CAD|JPY)\b/i);
    const confidence = Math.max(
      0.45,
      Math.min(
        0.96,
        0.56 + (groupName ? 0.12 : 0) + (members.length >= 2 ? 0.14 : members.length ? 0.08 : 0) + (expenses.length ? 0.16 : 0)
      )
    );

    const plan = {
      group: {
        name: groupName || "New Group",
        description: "Created from AI assistant",
        currency: normalizedText(currencyMatch?.[1] || "INR").toUpperCase(),
      },
      members,
      expenses,
      warnings,
      source: "Language parser",
      confidence,
      summary: isValid
        ? `Ready: ${members.length} member${members.length === 1 ? "" : "s"} and ${expenses.length} expense${
            expenses.length === 1 ? "" : "s"
          }.`
        : `Need more details before import (${errors.length} issue${errors.length === 1 ? "" : "s"}).`,
    };

    return {
      isValid,
      errors,
      groupName: plan.group.name,
      members,
      expenses,
      warnings,
      plan,
    };
  }

  function generateAIAssistantLanguageReply(parsed = null) {
    if (!parsed || typeof parsed !== "object") {
      return "I couldn't read that. Please try again.";
    }
    if (!parsed.isValid) {
      const bullets = Array.isArray(parsed.errors) ? parsed.errors.map((item) => `• ${normalizedText(item || "")}`) : [];
      return `I need a bit more information:\n${bullets.join("\n")}`;
    }

    let reply = `I'll create "${parsed.groupName}"`;
    if (Array.isArray(parsed.members) && parsed.members.length) {
      reply += ` with ${parsed.members.map((member) => normalizedText(member?.name || "")).filter(Boolean).join(", ")}`;
    }
    if (Array.isArray(parsed.expenses) && parsed.expenses.length) {
      const first = parsed.expenses[0];
      const amount = Number(first?.amount || 0);
      reply += `. I also found ${normalizedText(first?.title || "an expense")} for ${amount.toFixed(2)} paid by ${normalizedText(
        first?.payerName || "You"
      )}.`;
    } else {
      reply += `. I can create the group now, and you can add expenses next.`;
    }
    return reply;
  }

  function resolvePlanExpenseSplit(expense = null, memberNameMap = new Map()) {
    const rawMode = normalizedKey(expense?.splitMode || "");
    if (rawMode === "percent") {
      const percentages = {};
      for (const [name, value] of Object.entries(expense?.splitConfig?.percentages || {})) {
        const memberId = memberNameMap.get(normalizedKey(name || ""));
        const pct = Number(value);
        if (!memberId || !Number.isFinite(pct) || pct <= 0) continue;
        percentages[String(memberId)] = Number(pct.toFixed(2));
      }

      const total = Object.values(percentages).reduce((sum, value) => sum + Number(value || 0), 0);
      if (Object.keys(percentages).length >= 2 && Math.abs(total - 100) <= 0.5) {
        return {
          splitMode: "percent",
          splitConfig: { percentages },
        };
      }
    }

    if (rawMode === "shares") {
      const shares = {};
      for (const [name, value] of Object.entries(expense?.splitConfig?.shares || {})) {
        const memberId = memberNameMap.get(normalizedKey(name || ""));
        const share = Number(value);
        if (!memberId || !Number.isFinite(share) || share <= 0) continue;
        shares[String(memberId)] = Number(share.toFixed(2));
      }

      const total = Object.values(shares).reduce((sum, value) => sum + Number(value || 0), 0);
      if (Object.keys(shares).length >= 2 && total > 0) {
        return {
          splitMode: "shares",
          splitConfig: { shares },
        };
      }
    }

    return {
      splitMode: "equal",
      splitConfig: null,
    };
  }

  async function ensurePlanMembersInGroup(groupId, plan = null) {
    let detail = await fetchGroupDetail(groupId, true);
    if (!detail) {
      throw new Error("Unable to load target group for AI import.");
    }

    const desiredMembers = collectPlannedMemberEntries(plan);
    let memberMap = buildGroupMemberNameMap(detail);
    let addedCount = 0;

    for (const member of desiredMembers) {
      const key = normalizedKey(member?.name || "");
      if (!key || memberMap.has(key)) continue;
      try {
        const { response, body } = await jsonRequest(`/api/groups/${groupId}/members`, {
          method: "POST",
          body: JSON.stringify({
            name: normalizedText(member?.name || ""),
            email: normalizedText(member?.email || ""),
            phone: "",
            upiId: "",
          }),
        });
        if (!response.ok) {
          throw new Error(parseApiError(body, `Unable to add member "${member?.name || "member"}".`));
        }
        addedCount += 1;
      } catch {
        // Keep importing with existing members where possible.
      }
    }

    if (addedCount > 0) {
      detail = await fetchGroupDetail(groupId, true);
      if (!detail) {
        throw new Error("Group updated but could not be refreshed.");
      }
      memberMap = buildGroupMemberNameMap(detail);
    }

    const unresolvedNames = desiredMembers
      .filter((member) => !memberMap.has(normalizedKey(member?.name || "")))
      .map((member) => normalizedText(member?.name || ""))
      .filter(Boolean);

    return {
      detail,
      addedCount,
      unresolvedNames,
    };
  }

  async function analyzeAIAssistantPrompt(trigger = null, options = {}) {
    const card = document.getElementById("runtime-ai-assistant-card");
    const inputNode = card?.querySelector("[data-runtime-ai-input]");
    const promptSource =
      normalizedText(options?.promptOverride || "") ||
      (inputNode instanceof HTMLTextAreaElement || inputNode instanceof HTMLInputElement
        ? inputNode.value
        : state.aiAssistantPrompt);
    const prompt = writeAIAssistantDraft(promptSource);
    const silent = Boolean(options?.silent);
    const appendMessage = options?.appendMessage !== false;

    if (!prompt) {
      if (!silent) {
        showToast("Describe a group or some expenses first.", "warn", 3200);
      }
      return null;
    }

    const restore = trigger instanceof HTMLButtonElement ? setButtonBusy(trigger, true, "Parsing...") : () => {};
    try {
      const parsed = parseAIAssistantLanguagePrompt(prompt);
      const plan = parsed.isValid ? parsed.plan : null;

      state.aiAssistantPlan = plan;
      state.aiAssistantPlanPrompt = prompt;
      state.aiAssistantPendingPlan = plan;

      if (appendMessage) {
        state.aiAssistantMessages = Array.isArray(state.aiAssistantMessages) ? state.aiAssistantMessages : [];
        state.aiAssistantMessages.push({
          id: `assistant-${Date.now()}`,
          type: "assistant",
          content: generateAIAssistantLanguageReply(parsed),
          timestamp: new Date().toISOString(),
          parsed,
        });
      }

      renderAIAssistantCard();

      if (!silent) {
        if (plan) {
          flashSuccessState(card, { pulseTarget: trigger });
          showToast(String(plan.summary || "AI plan ready."), "success", 3600);
        } else {
          showToast(parsed.errors?.[0] || "Need a few more details to build a plan.", "warn", 4200);
        }
      }

      return plan;
    } catch (error) {
      if (!silent) {
        showToast(String(error?.message || "Unable to analyze prompt."), "error", 5000);
      }
      return null;
    } finally {
      restore();
    }
  }

  async function importAIAssistantPlanToWeb(plan = null, targetValue = "__new__", options = {}) {
    const safePlan = plan && typeof plan === "object" ? plan : null;
    if (!safePlan) {
      throw new Error("Analyze your prompt first before importing.");
    }
    const allowDuplicates = Boolean(options?.allowDuplicates);

    const session = await fetchSession(false);
    let groupId = Number(targetValue || 0);
    let createdGroup = false;

    if (targetValue === "__new__") {
      const create = await jsonRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name: normalizedText(safePlan.group?.name || "AI Imported Group"),
          description: normalizedText(safePlan.group?.description || "Created from AI assistant"),
          currency: normalizedText(safePlan.group?.currency || "INR") || "INR",
        }),
      });
      if (!create.response.ok) {
        throw new Error(parseApiError(create.body, "Unable to create group from AI plan."));
      }
      groupId = Number(create.body?.group?.id || 0);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        throw new Error("Group created but AI import did not receive a valid group id.");
      }
      createdGroup = true;
      state.groupsCheckedAt = 0;
    }

    if (!Number.isFinite(groupId) || groupId <= 0) {
      throw new Error("Choose a valid target group for AI import.");
    }

    const memberResult = await ensurePlanMembersInGroup(groupId, safePlan);
    const detail = memberResult.detail;
    const memberMap = buildGroupMemberNameMap(detail);
    const sessionMemberId = resolveSessionMemberIdInGroup(detail, session);
    const fallbackMemberId = Number(detail?.members?.[0]?.id || 0) || sessionMemberId;
    const plannedExpenses = Array.isArray(safePlan.expenses) ? safePlan.expenses : [];

    let successCount = 0;
    let duplicateCount = 0;
    let failureCount = 0;
    const importedTitles = [];
    const duplicateTitles = [];
    const failedTitles = [];

    for (const [expenseIndex, expense] of plannedExpenses.entries()) {
      const expenseLabel = normalizedText(expense?.title || "") || `Imported Expense ${expenseIndex + 1}`;
      const explicitPayerKey = normalizedKey(expense?.payerName || "");
      const mappedPayerId = explicitPayerKey ? memberMap.get(explicitPayerKey) : 0;
      if (explicitPayerKey && !mappedPayerId) {
        failureCount += 1;
        failedTitles.push(expenseLabel);
        continue;
      }

      const participantIds = Array.from(
        new Set(
          (expense?.participantNames || [])
            .map((name) => memberMap.get(normalizedKey(name || "")))
            .filter((id) => Number.isFinite(Number(id)) && Number(id) > 0)
            .map((id) => Number(id))
        )
      );
      if (Array.isArray(expense?.participantNames) && expense.participantNames.length > 0 && participantIds.length === 0) {
        failureCount += 1;
        failedTitles.push(expenseLabel);
        continue;
      }

      const payerId =
        mappedPayerId ||
        sessionMemberId ||
        participantIds[0] ||
        fallbackMemberId;

      if (!Number.isFinite(Number(payerId)) || Number(payerId) <= 0) {
        failureCount += 1;
        failedTitles.push(expenseLabel);
        continue;
      }

      const split = resolvePlanExpenseSplit(expense, memberMap);
      if (split.splitMode !== "equal" && split.splitConfig) {
        const splitIds = Object.keys(split.splitConfig.percentages || split.splitConfig.shares || {})
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0);
        for (const splitId of splitIds) {
          if (!participantIds.includes(splitId)) participantIds.push(splitId);
        }
      }

      if (!participantIds.includes(Number(payerId))) {
        participantIds.push(Number(payerId));
      }

      if (!participantIds.length) {
        participantIds.push(Number(payerId));
      }

      const payload = {
        groupId,
        title: expenseLabel,
        amount: Number(expense?.amount || 0),
        payerMemberId: Number(payerId),
        participants: participantIds,
        splitMode: split.splitMode,
        splitConfig: split.splitConfig,
        category: normalizedText(expense?.category || "auto") || "auto",
        expenseDate: normalizedText(expense?.expenseDate || ""),
        notes: normalizedText(expense?.notes || "Imported from AI prompt"),
        recurring: {
          enabled: false,
          dayOfMonth: 1,
        },
        currency: normalizedText(safePlan.group?.currency || ""),
        allowDuplicate: allowDuplicates,
      };

      try {
        const createExpense = await jsonRequest("/api/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!createExpense.response.ok) {
          if (isDuplicateExpenseConflict(createExpense.response, createExpense.body)) {
            duplicateCount += 1;
            duplicateTitles.push(expenseLabel);
            continue;
          }
          throw new Error(parseApiError(createExpense.body, `Could not import "${payload.title}".`));
        }
        successCount += 1;
        importedTitles.push(expenseLabel);
      } catch {
        failureCount += 1;
        failedTitles.push(expenseLabel);
      }
    }

    state.groupsCheckedAt = 0;
    state.groupDetails.delete(String(groupId));
    mergeOnboardingProgress({
      create_group: createdGroup,
      add_expense: successCount > 0,
      invite_member: Number(memberResult.addedCount || 0) > 0,
    });

    if (createdGroup && successCount === 0 && failureCount === 0) {
      const duplicateOnlyMessage =
        duplicateCount > 0
          ? `Group "${safePlan.group?.name || "AI Imported Group"}" created. ${duplicateCount} duplicate expense${duplicateCount === 1 ? " was" : "s were"} skipped.`
          : `Group "${safePlan.group?.name || "AI Imported Group"}" created from AI text.`;
      return {
        groupId,
        createdGroup,
        plannedCount: plannedExpenses.length,
        allowDuplicates,
        successCount,
        duplicateCount,
        failureCount,
        importedTitles,
        duplicateTitles,
        failedTitles,
        addedMembers: memberResult.addedCount,
        message: duplicateOnlyMessage,
      };
    }

    if (!createdGroup && successCount === 0) {
      if (duplicateCount > 0 && failureCount === 0) {
        return {
          groupId,
          createdGroup,
          plannedCount: plannedExpenses.length,
          allowDuplicates,
          successCount,
          duplicateCount,
          failureCount,
          importedTitles,
          duplicateTitles,
          failedTitles,
          addedMembers: memberResult.addedCount,
          message: `No new expenses imported. ${duplicateCount} duplicate expense${duplicateCount === 1 ? " was" : "s were"} already in this group.`,
        };
      }
      throw new Error("No expenses could be imported into the selected group.");
    }

    const summaryParts = [];
    summaryParts.push(`Imported ${successCount} expense${successCount === 1 ? "" : "s"}`);
    if (duplicateCount > 0) {
      summaryParts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped`);
    }
    if (failureCount > 0) {
      summaryParts.push(`${failureCount} failed`);
    }

    return {
      groupId,
      createdGroup,
      plannedCount: plannedExpenses.length,
      allowDuplicates,
      successCount,
      duplicateCount,
      failureCount,
      importedTitles,
      duplicateTitles,
      failedTitles,
      addedMembers: memberResult.addedCount,
      message: `${summaryParts.join(" • ")}.`,
    };
  }

  function syncAIAssistantImportButtonLabel(card) {
    if (!(card instanceof HTMLElement)) return;
    const select = card.querySelector("[data-runtime-ai-target]");
    const importButton = card.querySelector("[data-runtime-ai-import]");
    if (!(select instanceof HTMLSelectElement) || !(importButton instanceof HTMLButtonElement)) return;
    importButton.textContent = select.value === "__new__" ? "Create Group + Import" : "Import to Group";
  }

  function syncAIAssistantDuplicateToggle(card) {
    if (!(card instanceof HTMLElement)) return;
    const toggle = card.querySelector("[data-runtime-ai-duplicates]");
    if (!(toggle instanceof HTMLButtonElement)) return;

    const enabled = Boolean(state.aiAssistantAllowDuplicates);
    toggle.textContent = enabled ? "Duplicates: Allow" : "Duplicates: Skip";
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.classList.toggle("success", enabled);
  }

  function ensureAIAssistantChatStyles() {
    if (document.getElementById("expense-split-runtime-ai-chat-style")) return;
    const style = document.createElement("style");
    style.id = "expense-split-runtime-ai-chat-style";
    style.textContent = `
      .runtime-ai-chat-shell {
        border-radius: 20px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(241, 245, 249, 0.9));
        box-shadow: 0 24px 46px -30px rgba(15, 23, 42, 0.38);
        overflow: hidden;
      }
      .runtime-ai-chat-header {
        padding: 0.96rem 1rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(255, 255, 255, 0.86);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .runtime-ai-chat-brand {
        display: flex;
        align-items: center;
        gap: 0.62rem;
        min-width: 0;
      }
      .runtime-ai-chat-logo {
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 0.75rem;
        display: grid;
        place-items: center;
        color: #ffffff;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        box-shadow: 0 12px 24px -16px rgba(124, 58, 237, 0.9);
        flex: 0 0 auto;
      }
      .runtime-ai-chat-logo svg {
        width: 1rem;
        height: 1rem;
      }
      .runtime-ai-chat-title {
        font-size: 1.02rem;
        line-height: 1.2;
        font-weight: 700;
        color: #1e293b;
      }
      .runtime-ai-chat-subtitle {
        margin-top: 0.1rem;
        font-size: 0.8rem;
        color: #64748b;
      }
      .runtime-ai-chat-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.22rem;
        border-radius: 999px;
        border: 1px solid rgba(139, 92, 246, 0.25);
        background: rgba(139, 92, 246, 0.12);
        color: #6d28d9;
        font-size: 0.68rem;
        font-weight: 700;
        padding: 0.3rem 0.58rem;
        white-space: nowrap;
      }
      .runtime-ai-chat-badge svg {
        width: 0.72rem;
        height: 0.72rem;
      }
      .runtime-ai-chat-feed {
        max-height: min(56vh, 620px);
        min-height: 360px;
        overflow: auto;
        padding: 1rem;
        display: grid;
        gap: 0.72rem;
      }
      .runtime-ai-chat-suggestions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.52rem;
      }
      .runtime-ai-chat-suggestion {
        text-align: left;
        border: 1px solid rgba(148, 163, 184, 0.26);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.9);
        color: #475569;
        font-size: 0.8rem;
        line-height: 1.45;
        font-weight: 600;
        padding: 0.64rem 0.72rem;
        transition: all 0.18s ease;
      }
      .runtime-ai-chat-suggestion:hover {
        border-color: rgba(139, 92, 246, 0.4);
        background: rgba(237, 233, 254, 0.52);
        color: #4c1d95;
        transform: translateY(-1px);
      }
      .runtime-ai-chat-messages {
        display: grid;
        gap: 0.72rem;
      }
      .runtime-ai-chat-row {
        display: flex;
        align-items: flex-start;
        gap: 0.62rem;
      }
      .runtime-ai-chat-row.user {
        flex-direction: row-reverse;
      }
      .runtime-ai-chat-avatar {
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        display: grid;
        place-items: center;
        color: #ffffff;
        flex: 0 0 auto;
      }
      .runtime-ai-chat-row.assistant .runtime-ai-chat-avatar {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      }
      .runtime-ai-chat-row.user .runtime-ai-chat-avatar {
        background: #0f172a;
      }
      .runtime-ai-chat-avatar svg {
        width: 0.95rem;
        height: 0.95rem;
      }
      .runtime-ai-chat-bubble-wrap {
        max-width: min(88%, 640px);
      }
      .runtime-ai-chat-bubble {
        border-radius: 16px;
        padding: 0.66rem 0.82rem;
        font-size: 0.93rem;
        line-height: 1.58;
        white-space: pre-line;
        border: 1px solid rgba(148, 163, 184, 0.2);
      }
      .runtime-ai-chat-row.user .runtime-ai-chat-bubble {
        background: linear-gradient(120deg, #8b5cf6 0%, #7c3aed 100%);
        color: #ffffff;
        border-color: rgba(124, 58, 237, 0.72);
        border-bottom-right-radius: 7px;
      }
      .runtime-ai-chat-row.assistant .runtime-ai-chat-bubble {
        background: rgba(255, 255, 255, 0.96);
        color: #1f2937;
        border-bottom-left-radius: 7px;
      }
      .runtime-ai-chat-time {
        margin-top: 0.22rem;
        font-size: 0.64rem;
        color: #94a3b8;
      }
      .runtime-ai-chat-row.user .runtime-ai-chat-time {
        text-align: right;
      }
      .runtime-ai-chat-typing {
        display: inline-flex;
        align-items: center;
        gap: 0.34rem;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(255, 255, 255, 0.84);
        padding: 0.35rem 0.6rem;
        width: fit-content;
      }
      .runtime-ai-chat-typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #8b5cf6;
        animation: runtimeAiTypingDot 0.58s ease-in-out infinite;
      }
      .runtime-ai-chat-typing-dot:nth-child(2) {
        animation-delay: 0.12s;
      }
      .runtime-ai-chat-typing-dot:nth-child(3) {
        animation-delay: 0.24s;
      }
      .runtime-ai-chat-typing[hidden] {
        display: none !important;
      }
      .runtime-ai-chat-toolbar {
        border-top: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(255, 255, 255, 0.76);
        padding: 0.72rem 1rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .runtime-ai-chat-compose {
        border-top: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(255, 255, 255, 0.92);
        padding: 0.82rem 1rem 0.78rem;
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
      }
      .runtime-ai-chat-input {
        min-height: 44px;
        max-height: 130px;
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: #f8fafc;
        color: #0f172a;
        padding: 0.62rem 0.74rem;
        font-size: 0.94rem;
        line-height: 1.45;
        resize: vertical;
      }
      .runtime-ai-chat-input:focus {
        outline: none;
        border-color: rgba(139, 92, 246, 0.52);
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.14);
        background: #ffffff;
      }
      .runtime-ai-chat-send {
        border: 0;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: linear-gradient(120deg, #8b5cf6 0%, #7c3aed 100%);
        color: #ffffff;
        display: grid;
        place-items: center;
        box-shadow: 0 16px 28px -22px rgba(124, 58, 237, 0.9);
      }
      .runtime-ai-chat-send:hover {
        transform: translateY(-1px);
        filter: brightness(1.02);
      }
      .runtime-ai-chat-send svg {
        width: 1rem;
        height: 1rem;
      }
      .runtime-ai-chat-hint {
        padding: 0 1rem 0.88rem;
        font-size: 0.74rem;
        color: #94a3b8;
      }
      .runtime-ai-chat-preview {
        margin-top: 0.5rem;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(255, 255, 255, 0.96);
      }
      .runtime-ai-chat-preview-head {
        background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%);
        color: #ffffff;
        padding: 0.52rem 0.72rem;
        font-size: 0.73rem;
        font-weight: 700;
      }
      .runtime-ai-chat-preview-body {
        padding: 0.68rem 0.72rem;
        display: grid;
        gap: 0.44rem;
      }
      .runtime-ai-chat-preview-line {
        font-size: 0.74rem;
        color: #334155;
      }
      .runtime-ai-chat-preview-line strong {
        color: #0f172a;
      }
      .runtime-ai-chat-member-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.34rem;
      }
      .runtime-ai-chat-member-chip {
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: #f1f5f9;
        color: #334155;
        font-size: 0.66rem;
        font-weight: 600;
        padding: 0.18rem 0.42rem;
      }
      .runtime-ai-chat-expense-card {
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 10px;
        background: #f8fafc;
        padding: 0.44rem 0.52rem;
      }
      .runtime-ai-chat-expense-title {
        font-size: 0.72rem;
        font-weight: 700;
        color: #1e293b;
      }
      .runtime-ai-chat-expense-meta {
        margin-top: 0.14rem;
        font-size: 0.66rem;
        color: #64748b;
      }
      .runtime-ai-chat-invalid {
        margin-top: 0.48rem;
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 12px;
        background: rgba(254, 243, 199, 0.45);
        padding: 0.52rem 0.66rem;
      }
      .runtime-ai-chat-invalid-title {
        font-size: 0.72rem;
        font-weight: 700;
        color: #92400e;
      }
      .runtime-ai-chat-invalid ul {
        margin-top: 0.34rem;
        padding-left: 1rem;
        display: grid;
        gap: 0.2rem;
        color: #b45309;
        font-size: 0.68rem;
      }
      .runtime-ai-chat-confirm {
        margin-top: 0.5rem;
        display: flex;
        gap: 0.4rem;
      }
      .runtime-ai-chat-confirm .runtime-mini-btn {
        font-size: 0.68rem;
      }
      @keyframes runtimeAiTypingDot {
        0%, 100% { transform: translateY(0); opacity: 0.72; }
        50% { transform: translateY(-4px); opacity: 1; }
      }
      @media (max-width: 920px) {
        .runtime-ai-chat-suggestions {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 680px) {
        .runtime-ai-chat-header,
        .runtime-ai-chat-feed,
        .runtime-ai-chat-toolbar,
        .runtime-ai-chat-compose {
          padding-left: 0.7rem;
          padding-right: 0.7rem;
        }
        .runtime-ai-chat-badge {
          display: none;
        }
        .runtime-ai-chat-bubble-wrap {
          max-width: 100%;
        }
      }
      body.runtime-dark .runtime-ai-chat-shell {
        border-color: rgba(148, 163, 184, 0.22);
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(11, 18, 32, 0.93));
      }
      body.runtime-dark .runtime-ai-chat-header,
      body.runtime-dark .runtime-ai-chat-toolbar,
      body.runtime-dark .runtime-ai-chat-compose {
        border-color: rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.88);
      }
      body.runtime-dark .runtime-ai-chat-title {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-ai-chat-subtitle,
      body.runtime-dark .runtime-ai-chat-hint,
      body.runtime-dark .runtime-ai-chat-time {
        color: #94a3b8;
      }
      body.runtime-dark .runtime-ai-chat-suggestion,
      body.runtime-dark .runtime-ai-chat-row.assistant .runtime-ai-chat-bubble,
      body.runtime-dark .runtime-ai-chat-preview,
      body.runtime-dark .runtime-ai-chat-expense-card,
      body.runtime-dark .runtime-ai-chat-typing {
        border-color: rgba(148, 163, 184, 0.22);
        background: rgba(15, 23, 42, 0.82);
        color: #dbe6f5;
      }
      body.runtime-dark .runtime-ai-chat-suggestion:hover {
        border-color: rgba(167, 139, 250, 0.54);
        background: rgba(76, 29, 149, 0.22);
        color: #ede9fe;
      }
      body.runtime-dark .runtime-ai-chat-member-chip {
        border-color: rgba(148, 163, 184, 0.24);
        background: rgba(30, 41, 59, 0.9);
        color: #dbe6f5;
      }
      body.runtime-dark .runtime-ai-chat-preview-line,
      body.runtime-dark .runtime-ai-chat-expense-meta {
        color: #9fb0c4;
      }
      body.runtime-dark .runtime-ai-chat-preview-line strong,
      body.runtime-dark .runtime-ai-chat-expense-title {
        color: #f8fafc;
      }
      body.runtime-dark .runtime-ai-chat-input {
        background: rgba(15, 23, 42, 0.82);
        border-color: rgba(148, 163, 184, 0.28);
        color: #f8fafc;
      }
      body.runtime-dark .runtime-ai-chat-input:focus {
        background: rgba(15, 23, 42, 0.94);
      }
      body.runtime-dark .runtime-ai-chat-invalid {
        border-color: rgba(245, 158, 11, 0.36);
        background: rgba(120, 53, 15, 0.34);
      }
      body.runtime-dark .runtime-ai-chat-invalid-title {
        color: #fde68a;
      }
      body.runtime-dark .runtime-ai-chat-invalid ul {
        color: #fcd34d;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureAIAssistantMessageSeed() {
    if (!Array.isArray(state.aiAssistantMessages)) {
      state.aiAssistantMessages = [];
    }
    if (!state.aiAssistantMessages.length) {
      state.aiAssistantMessages.push({
        id: "ai-welcome",
        type: "assistant",
        content: AI_ASSISTANT_WELCOME_MESSAGE,
        timestamp: new Date().toISOString(),
        parsed: null,
      });
    }
  }

  function pushAIAssistantMessage(type, content, extras = {}) {
    ensureAIAssistantMessageSeed();
    state.aiAssistantMessages.push({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: type === "user" ? "user" : "assistant",
      content: String(content || "").replace(/\r\n/g, "\n").trim(),
      timestamp: new Date().toISOString(),
      parsed: extras?.parsed || null,
    });
  }

  function formatAIAssistantTime(value) {
    const date = new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function createAIAssistantParsedPreview(parsed = null) {
    if (!parsed || typeof parsed !== "object" || !parsed.isValid || !parsed.plan) return null;

    const preview = document.createElement("div");
    preview.className = "runtime-ai-chat-preview";

    const head = document.createElement("div");
    head.className = "runtime-ai-chat-preview-head";
    head.textContent = "Preview: Ready to Import";
    preview.appendChild(head);

    const body = document.createElement("div");
    body.className = "runtime-ai-chat-preview-body";

    const groupLine = document.createElement("div");
    groupLine.className = "runtime-ai-chat-preview-line";
    groupLine.innerHTML = `<strong>Group:</strong> ${escapeHtml(parsed.plan.group?.name || "New Group")}`;
    body.appendChild(groupLine);

    const memberWrap = document.createElement("div");
    memberWrap.className = "runtime-ai-chat-member-chips";
    for (const member of parsed.members || []) {
      const chip = document.createElement("span");
      chip.className = "runtime-ai-chat-member-chip";
      chip.textContent = normalizedText(member?.name || "Member");
      memberWrap.appendChild(chip);
    }
    if (memberWrap.childElementCount) {
      body.appendChild(memberWrap);
    }

    for (const expense of (parsed.expenses || []).slice(0, 3)) {
      const row = document.createElement("div");
      row.className = "runtime-ai-chat-expense-card";

      const title = document.createElement("p");
      title.className = "runtime-ai-chat-expense-title";
      title.textContent = `${normalizedText(expense?.title || "Expense")} • ${Number(expense?.amount || 0).toFixed(2)}`;

      const meta = document.createElement("p");
      meta.className = "runtime-ai-chat-expense-meta";
      const participants = Array.isArray(expense?.participantNames) ? expense.participantNames.filter(Boolean) : [];
      meta.textContent = `Paid by ${normalizedText(expense?.payerName || "You")}${
        participants.length ? ` • Split: ${participants.join(", ")}` : ""
      }`;

      row.appendChild(title);
      row.appendChild(meta);
      body.appendChild(row);
    }

    preview.appendChild(body);
    return preview;
  }

  function createAIAssistantInvalidBlock(parsed = null) {
    if (!parsed || typeof parsed !== "object" || parsed.isValid) return null;
    const box = document.createElement("div");
    box.className = "runtime-ai-chat-invalid";

    const title = document.createElement("p");
    title.className = "runtime-ai-chat-invalid-title";
    title.textContent = "Missing Information";
    box.appendChild(title);

    const list = document.createElement("ul");
    for (const error of parsed.errors || []) {
      const item = document.createElement("li");
      item.textContent = normalizedText(error || "");
      list.appendChild(item);
    }
    box.appendChild(list);
    return box;
  }

  async function runAIAssistantImportFromState(card, select, triggerButton) {
    let plan = state.aiAssistantPendingPlan || state.aiAssistantPlan;
    if (!plan) {
      plan = await analyzeAIAssistantPrompt(triggerButton, {
        silent: true,
        appendMessage: true,
      });
    }
    if (!plan) {
      showToast("Parse a message first, then import.", "warn", 3200);
      return;
    }
    const restore = setButtonBusy(triggerButton, true, "Importing...");
    try {
      const result = await importAIAssistantPlanToWeb(plan, select.value, {
        allowDuplicates: Boolean(state.aiAssistantAllowDuplicates),
      });
      setAIAssistantOcrJobs([]);
      state.aiAssistantPendingPlan = null;
      pushAIAssistantMessage("assistant", `Done. ${result.message}`);
      await Promise.all([hydrateDashboardData(), installDashboardProductPanels()]);
      flashSuccessState(card, { pulseTarget: triggerButton });
      const toastType =
        Number(result?.failureCount || 0) > 0 ? "warn" : Number(result?.duplicateCount || 0) > 0 ? "info" : "success";
      showToast(result.message, toastType, 5200);
      const shouldShowReport = Number(result?.duplicateCount || 0) > 0 || Number(result?.failureCount || 0) > 0;
      if (shouldShowReport) {
        await openRuntimeImportReportModal(result);
      }
      window.setTimeout(() => {
        navigateWithTransition(`/group/${result.groupId}`);
      }, shouldShowReport ? 90 : 160);
    } catch (error) {
      showToast(String(error?.message || "Unable to import AI plan."), "error", 5600);
    } finally {
      restore();
    }
  }

  function renderAIAssistantCard() {
    const card = document.getElementById("runtime-ai-assistant-card");
    if (!(card instanceof HTMLElement)) return;
    ensureAIAssistantChatStyles();
    ensureAIAssistantImportPrefsLoaded();
    ensureAIAssistantMessageSeed();

    if (!state.aiAssistantPrompt) {
      state.aiAssistantPrompt = readAIAssistantDraft();
    }

    if (!card.querySelector("[data-runtime-ai-input]")) {
      card.innerHTML = `
        <div class="runtime-ai-chat-shell">
          <div class="runtime-ai-chat-header">
            <div class="runtime-ai-chat-brand">
              <span class="runtime-ai-chat-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="m12 4 .95 2.7L15.7 7.6 13 8.55l-.9 2.75-.95-2.75L8.4 7.6l2.75-.9L12 4Z" fill="currentColor"/>
                  <path d="m17.6 11.7.55 1.57 1.57.5-1.57.55-.55 1.57-.5-1.57-1.57-.55 1.57-.5.5-1.57Z" fill="currentColor" opacity="0.84"/>
                </svg>
              </span>
              <div>
                <p class="runtime-ai-chat-title">AI Assistant</p>
                <p class="runtime-ai-chat-subtitle">Natural language group parser</p>
              </div>
            </div>
            <span class="runtime-ai-chat-badge">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4.6 7.2 7.2v5.6c0 3.2 2.2 6.2 4.8 6.95 2.6-.75 4.8-3.75 4.8-6.95V7.2L12 4.6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
              </svg>
              Powered by AI
            </span>
          </div>
          <div class="runtime-ai-chat-feed" data-runtime-ai-chat-feed>
            <div class="runtime-ai-chat-suggestions" data-runtime-ai-suggestion-wrap></div>
            <div class="runtime-ai-chat-messages" data-runtime-ai-messages></div>
            <div class="runtime-ai-chat-typing" data-runtime-ai-typing hidden>
              <span class="runtime-ai-chat-typing-dot"></span>
              <span class="runtime-ai-chat-typing-dot"></span>
              <span class="runtime-ai-chat-typing-dot"></span>
            </div>
            <div class="runtime-ai-jobs" data-runtime-ai-jobs hidden></div>
          </div>
          <div class="runtime-ai-chat-toolbar">
            <select class="runtime-ai-select" data-runtime-ai-target></select>
            <button type="button" class="runtime-mini-btn" data-runtime-ai-duplicates aria-pressed="false">Duplicates: Skip</button>
            <button type="button" class="runtime-mini-btn success" data-runtime-ai-import>Create Group + Import</button>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple class="runtime-ai-hidden-input" data-runtime-ai-receipt-file />
            <button type="button" class="runtime-mini-btn" data-runtime-ai-ocr-upload>Upload Receipt</button>
            <button type="button" class="runtime-mini-btn" data-runtime-ai-ocr-text>Parse OCR Text</button>
          </div>
          <div class="runtime-ai-chat-compose" data-runtime-ai-dropzone>
            <textarea
              class="runtime-ai-chat-input runtime-motion-field"
              data-runtime-ai-input
              placeholder="Type: Create a group Weekend Trip with John, Sarah, Mike for dinner $150"
            ></textarea>
            <button type="button" class="runtime-ai-chat-send" data-runtime-ai-send aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="m4 12 14.5-6.4c.77-.34 1.57.45 1.23 1.22L13.3 21.5c-.34.77-1.46.72-1.73-.08L9.9 15.7 4 12Zm5.9 3.7 2.8-2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <p class="runtime-ai-chat-hint">Press Enter to send. Shift + Enter for a new line.</p>
        </div>
      `;
      installRuntime3DCards([card]);
    }

    const textarea = card.querySelector("[data-runtime-ai-input]");
    const select = card.querySelector("[data-runtime-ai-target]");
    const dropzone = card.querySelector("[data-runtime-ai-dropzone]");
    const fileInput = card.querySelector("[data-runtime-ai-receipt-file]");
    const ocrUploadButton = card.querySelector("[data-runtime-ai-ocr-upload]");
    const ocrTextButton = card.querySelector("[data-runtime-ai-ocr-text]");
    const sendButton = card.querySelector("[data-runtime-ai-send]");
    const duplicatesButton = card.querySelector("[data-runtime-ai-duplicates]");
    const importButton = card.querySelector("[data-runtime-ai-import]");
    const feed = card.querySelector("[data-runtime-ai-chat-feed]");
    const suggestionWrap = card.querySelector("[data-runtime-ai-suggestion-wrap]");
    const messagesRoot = card.querySelector("[data-runtime-ai-messages]");
    const typingRoot = card.querySelector("[data-runtime-ai-typing]");
    const jobsRoot = card.querySelector("[data-runtime-ai-jobs]");

    if (
      !(textarea instanceof HTMLTextAreaElement) ||
      !(select instanceof HTMLSelectElement) ||
      !(dropzone instanceof HTMLElement) ||
      !(fileInput instanceof HTMLInputElement) ||
      !(ocrUploadButton instanceof HTMLButtonElement) ||
      !(ocrTextButton instanceof HTMLButtonElement) ||
      !(sendButton instanceof HTMLButtonElement) ||
      !(duplicatesButton instanceof HTMLButtonElement) ||
      !(importButton instanceof HTMLButtonElement) ||
      !(feed instanceof HTMLElement) ||
      !(suggestionWrap instanceof HTMLElement) ||
      !(messagesRoot instanceof HTMLElement) ||
      !(typingRoot instanceof HTMLElement) ||
      !(jobsRoot instanceof HTMLElement) ||
      !(dropzone instanceof HTMLElement)
    ) {
      return;
    }

    textarea.value = state.aiAssistantPrompt || "";
    if (textarea.dataset.runtimeAiBound !== "1") {
      textarea.dataset.runtimeAiBound = "1";
      textarea.addEventListener("input", () => {
        state.aiAssistantPrompt = textarea.value;
        writeAIAssistantDraft(textarea.value);
      });
    }

    const previousTarget = state.aiAssistantTarget || "__new__";
    const groups = Array.isArray(state.groupsCache) ? state.groupsCache : [];
    select.innerHTML = "";
    const createOption = document.createElement("option");
    createOption.value = "__new__";
    createOption.textContent = "Create new group from parsed text";
    select.appendChild(createOption);
    for (const group of groups.slice(0, 20)) {
      const option = document.createElement("option");
      option.value = String(group.id);
      option.textContent = normalizedText(group.name || `Group ${group.id}`);
      select.appendChild(option);
    }
    select.value = Array.from(select.options).some((option) => option.value === previousTarget) ? previousTarget : "__new__";
    state.aiAssistantTarget = select.value;
    if (select.dataset.runtimeAiBound !== "1") {
      select.dataset.runtimeAiBound = "1";
      select.addEventListener("change", () => {
        state.aiAssistantTarget = select.value;
        syncAIAssistantImportButtonLabel(card);
      });
    }
    syncAIAssistantImportButtonLabel(card);
    syncAIAssistantDuplicateToggle(card);

    suggestionWrap.innerHTML = "";
    if ((state.aiAssistantMessages || []).length <= 1) {
      for (const suggestion of AI_ASSISTANT_SUGGESTIONS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "runtime-ai-chat-suggestion runtime-motion-pill";
        button.textContent = suggestion;
        button.addEventListener("click", () => {
          textarea.value = suggestion;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.focus({ preventScroll: false });
        });
        suggestionWrap.appendChild(button);
      }
    }

    messagesRoot.innerHTML = "";
    const messages = Array.isArray(state.aiAssistantMessages) ? state.aiAssistantMessages : [];
    const lastMessageId = messages.length ? messages[messages.length - 1].id : "";
    for (const message of messages) {
      const row = document.createElement("div");
      row.className = `runtime-ai-chat-row ${message.type === "user" ? "user" : "assistant"} runtime-motion-row`;

      const avatar = document.createElement("span");
      avatar.className = "runtime-ai-chat-avatar";
      avatar.innerHTML =
        message.type === "user"
          ? `<svg viewBox="0 0 24 24" fill="none"><path d="M12 13.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6.3 5.5c.7-2.55 3-4 6.3-4 3.28 0 5.58 1.45 6.28 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none"><path d="m12 4 .95 2.7L15.7 7.6 13 8.55l-.9 2.75-.95-2.75L8.4 7.6l2.75-.9L12 4Z" fill="currentColor"/><path d="m17.6 11.7.55 1.57 1.57.5-1.57.55-.55 1.57-.5-1.57-1.57-.55 1.57-.5.5-1.57Z" fill="currentColor" opacity="0.84"/></svg>`;

      const wrap = document.createElement("div");
      wrap.className = "runtime-ai-chat-bubble-wrap";

      const bubble = document.createElement("div");
      bubble.className = "runtime-ai-chat-bubble";
      bubble.textContent = String(message.content || "").replace(/\r\n/g, "\n").trim();
      wrap.appendChild(bubble);

      const parsed = message?.parsed && typeof message.parsed === "object" ? message.parsed : null;
      const preview = createAIAssistantParsedPreview(parsed);
      if (preview) {
        wrap.appendChild(preview);
      }

      const invalidBlock = createAIAssistantInvalidBlock(parsed);
      if (invalidBlock) {
        wrap.appendChild(invalidBlock);
      }

      if (message.id === lastMessageId && parsed?.isValid && state.aiAssistantPendingPlan) {
        const confirmRow = document.createElement("div");
        confirmRow.className = "runtime-ai-chat-confirm";

        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "runtime-mini-btn success";
        confirmBtn.textContent = "Create Group";
        confirmBtn.addEventListener("click", async () => {
          await runAIAssistantImportFromState(card, select, confirmBtn);
        });

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "runtime-mini-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
          state.aiAssistantPendingPlan = null;
          pushAIAssistantMessage("assistant", "No problem. I canceled that draft. Share another message anytime.");
          renderAIAssistantCard();
        });

        confirmRow.appendChild(confirmBtn);
        confirmRow.appendChild(cancelBtn);
        wrap.appendChild(confirmRow);
      }

      const time = document.createElement("p");
      time.className = "runtime-ai-chat-time";
      time.textContent = formatAIAssistantTime(message.timestamp);
      wrap.appendChild(time);

      row.appendChild(avatar);
      row.appendChild(wrap);
      messagesRoot.appendChild(row);
    }

    typingRoot.hidden = !state.aiAssistantTyping;

    if (ocrUploadButton.dataset.runtimeAiBound !== "1") {
      ocrUploadButton.dataset.runtimeAiBound = "1";
      ocrUploadButton.addEventListener("click", () => {
        fileInput.click();
      });
    }

    if (fileInput.dataset.runtimeAiBound !== "1") {
      fileInput.dataset.runtimeAiBound = "1";
      fileInput.addEventListener("change", async () => {
        const files = pickAIAssistantReceiptFiles(fileInput.files || [], { limit: 8 });
        await convertAIAssistantReceiptImages(files, ocrUploadButton);
        fileInput.value = "";
      });
    }

    if (dropzone.dataset.runtimeAiBound !== "1") {
      dropzone.dataset.runtimeAiBound = "1";

      const activate = (event) => {
        const items = event.dataTransfer?.items;
        const files = event.dataTransfer?.files;
        const hasFiles = Array.from(items || []).some((item) => item?.kind === "file") || Array.from(files || []).length > 0;
        const hasImage =
          Array.from(items || []).some((item) => String(item?.type || "").toLowerCase().startsWith("image/")) ||
          pickAIAssistantReceiptFiles(files || [], { limit: 1 }).length > 0;
        if (!hasFiles) return false;
        event.preventDefault();
        dropzone.classList.toggle("drag-active", hasImage);
        return hasImage;
      };

      dropzone.addEventListener("dragenter", (event) => {
        activate(event);
      });

      dropzone.addEventListener("dragover", (event) => {
        if (activate(event)) {
          event.dataTransfer.dropEffect = "copy";
        }
      });

      dropzone.addEventListener("dragleave", (event) => {
        if (!dropzone.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) {
          dropzone.classList.remove("drag-active");
        }
      });

      dropzone.addEventListener("drop", async (event) => {
        event.preventDefault();
        dropzone.classList.remove("drag-active");
        const files = pickAIAssistantReceiptFiles(event.dataTransfer?.files || [], { limit: 8 });
        if (!files.length) {
          showToast("Drop PNG, JPG, or WEBP receipt images.", "warn", 3600);
          return;
        }
        await convertAIAssistantReceiptImages(files, ocrUploadButton);
      });
    }

    if (card.dataset.runtimeAiPasteBound !== "1") {
      card.dataset.runtimeAiPasteBound = "1";
      card.addEventListener("paste", async (event) => {
        if (event.defaultPrevented) return;
        const files = pickAIAssistantClipboardImages(event.clipboardData || null);
        if (!files.length) return;
        event.preventDefault();
        await convertAIAssistantReceiptImages(files, ocrUploadButton);
      });
    }

    if (ocrTextButton.dataset.runtimeAiBound !== "1") {
      ocrTextButton.dataset.runtimeAiBound = "1";
      ocrTextButton.addEventListener("click", async () => {
        await convertAIAssistantTextWithOCR(ocrTextButton);
      });
    }

    if (duplicatesButton.dataset.runtimeAiBound !== "1") {
      duplicatesButton.dataset.runtimeAiBound = "1";
      duplicatesButton.addEventListener("click", () => {
        const nextValue = !Boolean(state.aiAssistantAllowDuplicates);
        writeAIAssistantImportPrefs({ allowDuplicates: nextValue });
        syncAIAssistantDuplicateToggle(card);
        showToast(
          nextValue
            ? "AI import will allow duplicate expenses."
            : "AI import will skip duplicate expenses.",
          "info",
          2600
        );
      });
    }

    renderAIAssistantOcrJobs(jobsRoot);
    if (importButton.dataset.runtimeAiBound !== "1") {
      importButton.dataset.runtimeAiBound = "1";
      importButton.addEventListener("click", async () => {
        await runAIAssistantImportFromState(card, select, importButton);
      });
    }

    if (sendButton.dataset.runtimeAiBound !== "1") {
      sendButton.dataset.runtimeAiBound = "1";
      const sendMessage = async () => {
        const prompt = normalizedText(textarea.value || "");
        if (!prompt || state.aiAssistantTyping) return;

        pushAIAssistantMessage("user", prompt);
        state.aiAssistantTyping = true;
        state.aiAssistantPendingPlan = null;
        state.aiAssistantPlan = null;
        state.aiAssistantPlanPrompt = "";
        textarea.value = "";
        state.aiAssistantPrompt = "";
        writeAIAssistantDraft("");
        renderAIAssistantCard();

        await new Promise((resolve) => window.setTimeout(resolve, 380));
        state.aiAssistantTyping = false;
        await analyzeAIAssistantPrompt(sendButton, {
          silent: true,
          appendMessage: true,
          promptOverride: prompt,
        });
        renderAIAssistantCard();
      };

      sendButton.addEventListener("click", async () => {
        await sendMessage();
      });

      textarea.addEventListener("keydown", async (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          stopEvent(event);
          await sendMessage();
        }
      });
    }

    window.setTimeout(() => {
      feed.scrollTop = feed.scrollHeight;
    }, 0);
  }

  function openSavedFilterModal({ mode = "create", initialName = "", initialCriteria = {} } = {}) {
    ensureRuntimeOptionModalStyles();
    removeRuntimeOptionModal();

    const criteria = normalizeFilterCriteria(initialCriteria);
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "runtime-option-modal-overlay";
      overlay.className = "runtime-option-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "runtime-option-modal";

      const head = document.createElement("div");
      head.className = "runtime-option-modal-head";
      const titleNode = document.createElement("p");
      titleNode.className = "runtime-option-modal-title";
      titleNode.textContent = mode === "edit" ? "Edit Saved Filter" : "Save Filter";
      const subtitleNode = document.createElement("p");
      subtitleNode.className = "runtime-option-modal-subtitle";
      subtitleNode.textContent = "Choose criteria for search, category, member, date range, and amount range.";
      head.appendChild(titleNode);
      head.appendChild(subtitleNode);

      const inputWrap = document.createElement("div");
      inputWrap.className = "runtime-option-modal-input-wrap";

      const grid = document.createElement("div");
      grid.className = "runtime-filter-grid";

      const createField = ({ label, type = "text", value = "", placeholder = "", full = false, inputMode = "" } = {}) => {
        const field = document.createElement("div");
        field.className = `runtime-filter-field${full ? " full" : ""}`;
        const labelNode = document.createElement("label");
        labelNode.textContent = label;
        const input = document.createElement("input");
        input.type = type;
        input.className = "runtime-option-modal-input";
        input.value = value;
        input.placeholder = placeholder;
        if (inputMode) input.inputMode = inputMode;
        field.appendChild(labelNode);
        field.appendChild(input);
        return { field, input };
      };

      const nameField = createField({
        label: "Filter Name",
        value: normalizedText(initialName || criteria.search || ""),
        placeholder: "Weekend Dining",
        full: true,
      });
      const searchField = createField({
        label: "Search",
        value: criteria.search,
        placeholder: "dinner july",
      });
      const categoryField = createField({
        label: "Category",
        value: criteria.category,
        placeholder: "Food / Travel / Utility",
      });
      const memberIdField = createField({
        label: "Member ID",
        value: criteria.memberId ? String(criteria.memberId) : "",
        placeholder: "Optional numeric id",
        inputMode: "numeric",
      });
      const minAmountField = createField({
        label: "Min Amount",
        type: "number",
        value: criteria.minAmount !== null ? String(criteria.minAmount) : "",
        placeholder: "0",
        inputMode: "decimal",
      });
      const maxAmountField = createField({
        label: "Max Amount",
        type: "number",
        value: criteria.maxAmount !== null ? String(criteria.maxAmount) : "",
        placeholder: "5000",
        inputMode: "decimal",
      });
      const dateFromField = createField({
        label: "Date From",
        type: "date",
        value: criteria.dateFrom,
      });
      const dateToField = createField({
        label: "Date To",
        type: "date",
        value: criteria.dateTo,
      });

      grid.appendChild(nameField.field);
      grid.appendChild(searchField.field);
      grid.appendChild(categoryField.field);
      grid.appendChild(memberIdField.field);
      grid.appendChild(minAmountField.field);
      grid.appendChild(maxAmountField.field);
      grid.appendChild(dateFromField.field);
      grid.appendChild(dateToField.field);

      const hint = document.createElement("p");
      hint.className = "runtime-filter-hint";
      hint.textContent = "Leave any field empty to keep that criterion optional.";

      inputWrap.appendChild(grid);
      inputWrap.appendChild(hint);

      const footer = document.createElement("div");
      footer.className = "runtime-option-modal-footer";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "runtime-option-btn";
      cancelBtn.textContent = "Cancel";
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "runtime-option-btn primary";
      confirmBtn.textContent = mode === "edit" ? "Update" : "Save";

      const close = (value = null) => {
        window.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
        resolve(value);
      };

      const submit = () => {
        const name = normalizedText(nameField.input.value || "");
        if (!name) {
          showToast("Filter name is required.", "warn", 3000);
          nameField.input.focus();
          return;
        }

        const payload = normalizeFilterCriteria({
          search: searchField.input.value || "",
          category: categoryField.input.value || "",
          memberId: memberIdField.input.value || "",
          dateFrom: dateFromField.input.value || "",
          dateTo: dateToField.input.value || "",
          minAmount: minAmountField.input.value || "",
          maxAmount: maxAmountField.input.value || "",
        });

        if (
          payload.minAmount !== null &&
          payload.maxAmount !== null &&
          Number(payload.minAmount) > Number(payload.maxAmount)
        ) {
          showToast("Min amount cannot be greater than max amount.", "warn", 3200);
          minAmountField.input.focus();
          return;
        }

        close({ name, criteria: payload });
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          stopEvent(event);
          close(null);
          return;
        }
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          stopEvent(event);
          submit();
        }
      };

      cancelBtn.addEventListener("click", () => close(null));
      confirmBtn.addEventListener("click", submit);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });
      window.addEventListener("keydown", onKeyDown, true);

      footer.appendChild(cancelBtn);
      footer.appendChild(confirmBtn);
      modal.appendChild(head);
      modal.appendChild(inputWrap);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      window.setTimeout(() => nameField.input.focus(), 10);
    });
  }

  async function fetchSavedFilters(force = false) {
    const now = Date.now();
    if (!force && now - state.savedFiltersAt < 20_000 && Array.isArray(state.savedFilters)) {
      return state.savedFilters;
    }

    const { response, body } = await jsonRequest("/api/expenses/filters", {
      method: "GET",
      headers: {},
    });
    if (!response.ok) {
      throw new Error(parseApiError(body, "Unable to load saved filters."));
    }
    const filters = Array.isArray(body?.filters) ? body.filters : [];
    state.savedFilters = filters;
    state.savedFiltersAt = Date.now();
    return filters;
  }

  async function fetchOpsSnapshot(force = false) {
    const now = Date.now();
    if (!force && now - state.opsSnapshotAt < 60_000 && state.opsSnapshot) {
      return state.opsSnapshot;
    }

    const { response, body } = await jsonRequest("/api/health/ops", {
      method: "GET",
      headers: {},
    });
    if (!response.ok) {
      throw new Error(parseApiError(body, "Unable to load ops metrics."));
    }

    state.opsSnapshot = body || null;
    state.opsSnapshotAt = Date.now();
    return state.opsSnapshot;
  }

  function dashboardPanelAnchor() {
    const groupsHeading = Array.from(document.querySelectorAll("h2, h3")).find((item) => {
      const text = normalizedKey(item.textContent || "");
      return text === "your groups" || text === "groups";
    });
    if (groupsHeading) {
      const groupsCard =
        groupsHeading.closest("div.bg-white.rounded-2xl") ||
        groupsHeading.closest("section, article, div");
      const parent = groupsCard?.parentElement;
      if (groupsCard && parent instanceof HTMLElement) {
        return { parent, beforeNode: groupsCard };
      }
    }

    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) {
      const root = document.getElementById("root");
      if (root instanceof HTMLElement) {
        return { parent: root, beforeNode: root.firstElementChild || null };
      }
      return null;
    }
    const container =
      main.querySelector("main > div.max-w-7xl, main > div.max-w-6xl, div.max-w-7xl, div.max-w-6xl") ||
      main.firstElementChild ||
      main;

    if (!(container instanceof HTMLElement)) return null;
    return { parent: container, beforeNode: container.firstElementChild || null };
  }

  function hideInlineDashboardSettleCard() {
    const path = normalizePath(window.location.pathname);
    if (!DASHBOARD_LIKE_PATHS.has(path)) return;

    const settleButtons = Array.from(document.querySelectorAll("button, a")).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest("#runtime-settlement-hub, #runtime-ops-health-hub, #runtime-notify-panel")) return false;
      return normalizedKey(node.textContent || "") === "settle now";
    });

    for (const trigger of settleButtons) {
      const card =
        trigger.closest("section, article, div.rounded-2xl, div.rounded-xl, div") ||
        trigger.parentElement;
      if (!(card instanceof HTMLElement)) continue;
      if (String(card.id || "").startsWith("runtime-")) continue;
      card.classList.add("runtime-route-hidden");
      card.style.display = "none";
      card.setAttribute("aria-hidden", "true");

      const wrapper = card.parentElement;
      if (wrapper instanceof HTMLElement) {
        const computed = window.getComputedStyle(wrapper);
        if (computed.display === "grid") {
          wrapper.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
        }
      }
    }
  }

  function opsHealthHubNode() {
    return document.getElementById("runtime-ops-health-hub");
  }

  function opsHealthLauncherNode() {
    return document.getElementById("runtime-ops-health-launcher");
  }

  function resolveHeaderActionRail() {
    const bell = getNotificationBellButton();
    if (bell?.parentElement instanceof HTMLElement) {
      return {
        rail: bell.parentElement,
        beforeNode: bell,
      };
    }

    const header = document.querySelector("header");
    if (!(header instanceof HTMLElement)) return null;

    const candidate =
      Array.from(header.querySelectorAll("div")).reverse().find((node) => {
        if (!(node instanceof HTMLElement)) return false;
        return node.querySelectorAll("button").length >= 1;
      }) || header;

    return {
      rail: candidate,
      beforeNode: null,
    };
  }

  function closeOpsHealthPanel() {
    const hub = opsHealthHubNode();
    if (!(hub instanceof HTMLElement)) return;
    hub.classList.remove("open");

    const launcher = opsHealthLauncherNode();
    if (launcher instanceof HTMLButtonElement) {
      launcher.setAttribute("aria-expanded", "false");
    }
  }

  function removeOpsHealthLauncher() {
    closeOpsHealthPanel();
    const hub = opsHealthHubNode();
    if (hub) hub.remove();
  }

  function syncOpsHealthLauncher(snapshot = null) {
    const launcher = opsHealthLauncherNode();
    if (!(launcher instanceof HTMLButtonElement)) return;

    const safe = snapshot && typeof snapshot === "object" ? snapshot : null;
    const failed = Math.max(0, Number(safe?.queue?.failed || 0));
    const badge = launcher.querySelector("[data-runtime-ops-badge]");
    const stateLabel = safe ? (failed > 0 ? "warn" : "healthy") : "pending";
    launcher.dataset.runtimeOpsState = stateLabel;

    const title =
      stateLabel === "warn"
        ? `${failed} failed background job${failed === 1 ? "" : "s"}`
        : stateLabel === "healthy"
          ? "Ops healthy"
          : "Loading ops health";
    launcher.title = title;
    launcher.setAttribute("aria-label", title);

    if (badge instanceof HTMLElement) {
      badge.textContent = failed > 9 ? "9+" : String(failed || "");
      badge.style.display = failed > 0 ? "inline-flex" : "none";
    }
  }

  function ensureOpsHealthLauncher() {
    const path = normalizePath(window.location.pathname);
    if (!DASHBOARD_LIKE_PATHS.has(path)) {
      removeOpsHealthLauncher();
      return null;
    }

    const headerRail = resolveHeaderActionRail();
    if (!headerRail?.rail) {
      removeOpsHealthLauncher();
      return null;
    }

    let hub = opsHealthHubNode();
    if (!(hub instanceof HTMLElement)) {
      hub = document.createElement("div");
      hub.id = "runtime-ops-health-hub";
      hub.className = "runtime-ops-hub";
    }

    if (headerRail.beforeNode instanceof HTMLElement && headerRail.beforeNode.parentElement === headerRail.rail) {
      if (hub.parentElement !== headerRail.rail || hub.nextSibling !== headerRail.beforeNode) {
        headerRail.rail.insertBefore(hub, headerRail.beforeNode);
      }
    } else if (hub.parentElement !== headerRail.rail) {
      headerRail.rail.appendChild(hub);
    }

    let launcher = opsHealthLauncherNode();
    if (!(launcher instanceof HTMLButtonElement)) {
      launcher = document.createElement("button");
      launcher.id = "runtime-ops-health-launcher";
      launcher.type = "button";
      launcher.className = "runtime-ops-launcher runtime-motion-btn runtime-motion-pill";
      launcher.setAttribute("aria-haspopup", "dialog");
      launcher.setAttribute("aria-expanded", "false");
      launcher.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 15.5h3.3l2-5.1 3.15 7.05 2.8-5.25H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 19.2h16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.65"/>
        </svg>
        <span class="runtime-ops-launcher-dot" aria-hidden="true"></span>
        <span class="runtime-ops-launcher-badge" data-runtime-ops-badge aria-hidden="true"></span>
      `;
      launcher.addEventListener("click", async (event) => {
        stopEvent(event);
        if (!hub.classList.contains("open")) {
          closeSettlementReminderLauncher();
        }
        const nextOpen = !hub.classList.contains("open");
        hub.classList.toggle("open", nextOpen);
        launcher.setAttribute("aria-expanded", nextOpen ? "true" : "false");

        if (nextOpen && (!state.opsSnapshot || Date.now() - state.opsSnapshotAt > 60_000)) {
          try {
            const snapshot = await fetchOpsSnapshot(false);
            renderOpsCard(snapshot);
          } catch {
            // Keep the panel visible with cached or placeholder content.
          }
        }
      });
      hub.appendChild(launcher);
    }

    let flyout = hub.querySelector(".runtime-ops-flyout");
    if (!(flyout instanceof HTMLElement)) {
      flyout = document.createElement("div");
      flyout.className = "runtime-ops-flyout";
      flyout.innerHTML = `
        <article id="runtime-ops-health-card" class="runtime-product-card runtime-motion-card runtime-motion-panel">
          <div class="runtime-product-head">
            <div>
              <p class="runtime-product-title">Ops Health</p>
              <p class="runtime-product-subtitle" data-runtime-ops-meta>Loading...</p>
            </div>
            <div class="runtime-ops-controls">
              <button type="button" class="runtime-mini-btn primary" data-runtime-ops-refresh-btn>Refresh</button>
              <button type="button" class="runtime-mini-btn" data-runtime-ops-close-btn>Close</button>
            </div>
          </div>
          <div class="runtime-ops-grid" data-runtime-ops-grid>
            <div class="runtime-ops-cell"><p class="runtime-ops-k">Groups</p><p class="runtime-ops-v">--</p></div>
            <div class="runtime-ops-cell"><p class="runtime-ops-k">Expenses</p><p class="runtime-ops-v">--</p></div>
            <div class="runtime-ops-cell"><p class="runtime-ops-k">Queue Failed</p><p class="runtime-ops-v">--</p></div>
            <div class="runtime-ops-cell"><p class="runtime-ops-k">Latency</p><p class="runtime-ops-v">--</p></div>
          </div>
        </article>
      `;
      hub.appendChild(flyout);

      const closeButton = flyout.querySelector("[data-runtime-ops-close-btn]");
      if (closeButton instanceof HTMLButtonElement) {
        closeButton.addEventListener("click", (event) => {
          stopEvent(event);
          closeOpsHealthPanel();
        });
      }
    }

    const card = document.getElementById("runtime-ops-health-card");
    if (card instanceof HTMLElement) {
      installRuntime3DCards([card]);
    }

    if (!state.opsLauncherEventsBound) {
      state.opsLauncherEventsBound = true;
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          const currentHub = opsHealthHubNode();
          if (!currentHub || !currentHub.classList.contains("open")) return;
          if (currentHub.contains(target)) return;
          closeOpsHealthPanel();
        },
        true
      );

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeOpsHealthPanel();
        }
      });
    }

    syncOpsHealthLauncher(state.opsSnapshot);
    return card instanceof HTMLElement ? card : null;
  }

  function removeDashboardProductPanels() {
    const existing = document.getElementById("runtime-dashboard-product-panels");
    if (existing) existing.remove();
    removeOpsHealthLauncher();
  }

  function ensureDashboardProductPanels() {
    const path = normalizePath(window.location.pathname);
    if (!DASHBOARD_LIKE_PATHS.has(path)) {
      removeDashboardProductPanels();
      return null;
    }

    const anchor = dashboardPanelAnchor();
    if (!anchor) return null;
    const { parent, beforeNode } = anchor;

    let panelRoot = document.getElementById("runtime-dashboard-product-panels");
    if (!(panelRoot instanceof HTMLElement)) {
      panelRoot = document.createElement("section");
      panelRoot.id = "runtime-dashboard-product-panels";
      panelRoot.className = "runtime-product-panels";
    }

    if (beforeNode && beforeNode.parentElement === parent) {
      if (panelRoot.parentElement !== parent || panelRoot.nextSibling !== beforeNode) {
        parent.insertBefore(panelRoot, beforeNode);
      }
    } else if (panelRoot.parentElement !== parent) {
      parent.prepend(panelRoot);
    }
    panelRoot.classList.add("runtime-product-panels-immersive");
    panelRoot.style.width = "100%";
    panelRoot.style.maxWidth = "none";
    panelRoot.style.gridColumn = "1 / -1";
    panelRoot.style.flex = "1 1 100%";
    panelRoot.style.minWidth = "100%";
    panelRoot.style.alignSelf = "stretch";

    const legacyOpsCard = panelRoot.querySelector("#runtime-ops-health-card");
    if (legacyOpsCard) {
      legacyOpsCard.remove();
    }

    ensureOpsHealthLauncher();

    if (!panelRoot.querySelector("#runtime-saved-filters-card")) {
      const savedCard = document.createElement("article");
      savedCard.id = "runtime-saved-filters-card";
      savedCard.className = "runtime-product-card runtime-feature-card runtime-feature-filters runtime-motion-card runtime-motion-panel";
      savedCard.innerHTML = `
        <div class="runtime-product-head">
          <div>
            <p class="runtime-product-title">Saved Filters</p>
            <p class="runtime-product-subtitle" data-runtime-saved-filters-meta>Loading...</p>
          </div>
          <button type="button" class="runtime-mini-btn success" data-runtime-save-filter-btn>Save Current</button>
        </div>
        <div class="runtime-card-progress-wrap">
          <div class="runtime-card-progress" aria-hidden="true">
            <span class="runtime-card-progress-fill" data-runtime-saved-filters-fill></span>
          </div>
          <p class="runtime-card-progress-label" data-runtime-saved-filters-progress>Preparing shortcuts...</p>
        </div>
        <div class="runtime-mini-list" data-runtime-saved-filters-list>
          <p class="runtime-mini-empty">Loading saved filters...</p>
        </div>
      `;
      panelRoot.appendChild(savedCard);
    }

    if (!panelRoot.querySelector("#runtime-onboarding-card")) {
      const onboardingCard = document.createElement("article");
      onboardingCard.id = "runtime-onboarding-card";
      onboardingCard.className = "runtime-product-card runtime-feature-card runtime-feature-onboarding runtime-motion-card runtime-motion-panel";
      onboardingCard.innerHTML = `
        <div class="runtime-product-head">
          <div>
            <p class="runtime-product-title">Getting Started</p>
            <p class="runtime-product-subtitle" data-runtime-onboarding-meta>Loading checklist...</p>
          </div>
          <button type="button" class="runtime-mini-btn" data-runtime-onboarding-reset-btn>Reset</button>
        </div>
        <div class="runtime-card-progress-wrap">
          <div class="runtime-card-progress" aria-hidden="true">
            <span class="runtime-card-progress-fill" data-runtime-onboarding-fill></span>
          </div>
          <p class="runtime-card-progress-label" data-runtime-onboarding-progress>Preparing journey...</p>
        </div>
        <div class="runtime-mini-list" data-runtime-onboarding-list>
          <p class="runtime-mini-empty">Preparing checklist...</p>
        </div>
      `;
      panelRoot.appendChild(onboardingCard);
    }

    if (!panelRoot.querySelector("#runtime-ai-assistant-card")) {
      const aiCard = document.createElement("article");
      aiCard.id = "runtime-ai-assistant-card";
      aiCard.className = "runtime-product-card runtime-feature-card runtime-feature-ai runtime-ai-card runtime-motion-card runtime-motion-panel";
      aiCard.innerHTML = `
        <div class="runtime-product-head">
          <div>
            <p class="runtime-product-title">AI Assistant</p>
            <p class="runtime-product-subtitle">Natural language group parser and bulk import studio.</p>
          </div>
          <span class="runtime-ai-pill">Powered by AI</span>
        </div>
      `;
      panelRoot.appendChild(aiCard);
    }

    const featureCards = Array.from(
      panelRoot.querySelectorAll("#runtime-saved-filters-card, #runtime-onboarding-card, #runtime-ai-assistant-card")
    ).filter((node) => node instanceof HTMLElement);
    installRuntime3DCards(featureCards);

    return panelRoot;
  }

  function setRouteElementVisibility(node, visible) {
    if (!(node instanceof HTMLElement)) return;
    node.classList.toggle("runtime-route-hidden", !visible);
  }

  function setRouteElementsVisibility(nodes, visible) {
    const items = Array.isArray(nodes) ? nodes : [];
    for (const node of items) {
      setRouteElementVisibility(node, visible);
    }
  }

  function setExpenseHistoryFullWidth(node, enabled) {
    if (!(node instanceof HTMLElement)) return;
    const isEnabled = Boolean(enabled);
    node.classList.toggle("runtime-expense-history-full", isEnabled);
    if (isEnabled) {
      node.style.gridColumn = "1 / -1";
      node.style.width = "100%";
      node.style.minWidth = "100%";
      node.style.flex = "1 1 100%";
      node.style.maxWidth = "none";
    } else {
      node.style.removeProperty("grid-column");
      node.style.removeProperty("width");
      node.style.removeProperty("min-width");
      node.style.removeProperty("flex");
      node.style.removeProperty("max-width");
    }
  }

  function setGroupsSectionFullWidth(node, enabled) {
    if (!(node instanceof HTMLElement)) return;
    const isEnabled = Boolean(enabled);
    node.classList.toggle("runtime-groups-full-width", isEnabled);
    if (isEnabled) {
      node.style.gridColumn = "1 / -1";
      node.style.width = "100%";
      node.style.minWidth = "100%";
      node.style.maxWidth = "none";
      node.style.flex = "1 1 100%";
      node.style.alignSelf = "stretch";
    } else {
      node.style.removeProperty("grid-column");
      node.style.removeProperty("width");
      node.style.removeProperty("min-width");
      node.style.removeProperty("max-width");
      node.style.removeProperty("flex");
      node.style.removeProperty("align-self");
    }
  }

  function syncWorkspaceSectionHighlight(mode, groupsCard, activityCard) {
    const cards = [groupsCard, activityCard].filter((node) => node instanceof HTMLElement);
    for (const card of cards) {
      card.classList.remove("runtime-section-selected");
    }
    if (mode === "groups" && groupsCard instanceof HTMLElement) {
      groupsCard.classList.add("runtime-section-selected");
      return;
    }
    if (mode === "expenses" && activityCard instanceof HTMLElement) {
      activityCard.classList.add("runtime-section-selected");
    }
  }

  function findDashboardCardByHeadings(titles = []) {
    const normalizedTitles = (Array.isArray(titles) ? titles : [titles])
      .map((item) => normalizedKey(item))
      .filter(Boolean);
    if (!normalizedTitles.length) return null;

    const headingNodes = Array.from(document.querySelectorAll("h1, h2, h3")).filter(
      (node) => node instanceof HTMLElement
    );

    let heading =
      headingNodes.find((item) => {
        const text = normalizedKey(item.textContent || "");
        return normalizedTitles.includes(text);
      }) || null;

    if (!(heading instanceof HTMLElement)) {
      heading =
        headingNodes.find((item) => {
          const text = normalizedKey(item.textContent || "");
          return normalizedTitles.some((target) => text.includes(target) || target.includes(text));
        }) || null;
    }

    if (!(heading instanceof HTMLElement)) return null;
    return heading.closest("div.bg-white.rounded-2xl") || heading.closest("section") || heading.closest("div");
  }

  function findSummaryMetricCards() {
    const cards = Array.from(document.querySelectorAll("div.bg-white.rounded-2xl.p-6.shadow-card")).filter(
      (node) => node instanceof HTMLElement
    );

    if (cards.length) {
      return cards;
    }

    return Array.from(document.querySelectorAll("div")).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const text = normalizedKey(node.textContent || "");
      const hasMetric = text.includes("you owe") || text.includes("you are owed") || text.includes("net balance");
      return hasMetric && node.querySelector("p, h2, h3");
    });
  }

  function applyWorkspaceRouteLayout() {
    const mode = resolveWorkspaceRouteMode(window.location.pathname);
    setWorkspaceRouteClass(mode);
    mergeExpensesActivitySectionInNav();
    ensureAIAssistanceNavLink();
    syncWorkspaceNavHighlight();
    hideInlineDashboardSettleCard();
    if (!mode) return;

    const metricCards = findSummaryMetricCards();
    const groupsCard = findDashboardCardByHeadings(["Your Groups", "Groups"]);
    const activityCard = findDashboardCardByHeadings(["Recent Activity", "Activity", "Expense History"]);
    const productPanels = document.getElementById("runtime-dashboard-product-panels");
    const savedFiltersCard = document.getElementById("runtime-saved-filters-card");
    const onboardingCard = document.getElementById("runtime-onboarding-card");
    const aiAssistantCard = document.getElementById("runtime-ai-assistant-card");
    setExpenseHistoryFullWidth(activityCard, mode === "expenses");
    setGroupsSectionFullWidth(groupsCard, mode === "groups");
    syncWorkspaceSectionHighlight(mode, groupsCard, activityCard);

    if (mode === "dashboard") {
      setRouteElementsVisibility(metricCards, true);
      setRouteElementVisibility(groupsCard, false);
      setRouteElementVisibility(activityCard, false);
      setRouteElementVisibility(productPanels, true);
      setRouteElementVisibility(savedFiltersCard, true);
      setRouteElementVisibility(onboardingCard, true);
      setRouteElementVisibility(aiAssistantCard, false);
      return;
    }

    if (mode === "groups") {
      if (!(groupsCard instanceof HTMLElement)) {
        // Fail-safe: never allow a blank groups page if the target section isn't detected yet.
        setRouteElementsVisibility(metricCards, true);
        setRouteElementVisibility(activityCard, true);
        setRouteElementVisibility(productPanels, true);
        setRouteElementVisibility(savedFiltersCard, true);
        setRouteElementVisibility(onboardingCard, true);
        return;
      }
      setRouteElementsVisibility(metricCards, false);
      setRouteElementVisibility(groupsCard, true);
      setRouteElementVisibility(activityCard, false);
      setRouteElementVisibility(productPanels, false);
      setRouteElementVisibility(aiAssistantCard, false);
      return;
    }

    if (mode === "expenses") {
      setRouteElementsVisibility(metricCards, true);
      setRouteElementVisibility(groupsCard, false);
      setRouteElementVisibility(activityCard, true);
      setRouteElementVisibility(productPanels, false);
      setRouteElementVisibility(aiAssistantCard, false);
      return;
    }

    if (mode === "ai") {
      setRouteElementsVisibility(metricCards, false);
      setRouteElementVisibility(groupsCard, false);
      setRouteElementVisibility(activityCard, false);
      setRouteElementVisibility(productPanels, true);
      setRouteElementVisibility(savedFiltersCard, false);
      setRouteElementVisibility(onboardingCard, false);
      setRouteElementVisibility(aiAssistantCard, true);
      if (aiAssistantCard instanceof HTMLElement) {
        aiAssistantCard.style.gridColumn = "1 / -1";
        aiAssistantCard.style.width = "100%";
        aiAssistantCard.style.minWidth = "100%";
        aiAssistantCard.style.maxWidth = "none";
      }
      return;
    }
  }

  function persistActiveFilterCriteria(criteria = {}) {
    try {
      const safe = normalizeFilterCriteria(criteria);
      window.sessionStorage.setItem(ACTIVE_EXPENSE_FILTER_STORAGE_KEY, JSON.stringify(safe));
    } catch {
      // Ignore session storage failures.
    }
  }

  function applySavedFilterCriteria(criteria = {}, options = {}) {
    const safe = normalizeFilterCriteria(criteria);
    const { silent = false } = options;
    const searchInput = getDashboardSearchInput();
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = safe.search || "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const query = criteriaToQuery(safe);
    const url = new URL(window.location.href);
    const keys = ["search", "category", "memberId", "dateFrom", "dateTo", "minAmount", "maxAmount"];
    for (const key of keys) {
      url.searchParams.delete(key);
    }
    for (const [key, value] of query.entries()) {
      url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    persistActiveFilterCriteria(safe);
    renderActiveFilterChips(safe);

    if (!silent) {
      const summary = filterCriteriaSummary(safe);
      showToast(`Filter applied: ${summary}.`, "success", 2800);
      if (!["/expenses", "/create-expense", "/groups", "/dashboard"].includes(normalizePath(window.location.pathname))) {
        showToast("Advanced filter criteria are now ready for your expenses views.", "info", 3200);
      }
    }
  }

  function renderSavedFiltersCard(filters = []) {
    const card = document.getElementById("runtime-saved-filters-card");
    if (!(card instanceof HTMLElement)) return;
    installRuntime3DCards([card]);

    const list = card.querySelector("[data-runtime-saved-filters-list]");
    const meta = card.querySelector("[data-runtime-saved-filters-meta]");
    const saveButton = card.querySelector("[data-runtime-save-filter-btn]");
    const progressFill = card.querySelector("[data-runtime-saved-filters-fill]");
    const progressLabel = card.querySelector("[data-runtime-saved-filters-progress]");
    if (!(list instanceof HTMLElement) || !(meta instanceof HTMLElement) || !(saveButton instanceof HTMLButtonElement)) {
      return;
    }

    const searchInput = getDashboardSearchInput();
    const safeFilters = Array.isArray(filters) ? filters : [];
    meta.textContent = safeFilters.length
      ? `${safeFilters.length} filter${safeFilters.length === 1 ? "" : "s"} saved`
      : "Save frequent filters for one-click access";
    const progressPercent = Math.max(
      0,
      Math.min(100, Math.round((Math.min(safeFilters.length, 8) / 8) * 100))
    );
    if (progressFill instanceof HTMLElement) {
      progressFill.style.width = safeFilters.length ? `${Math.max(12, progressPercent)}%` : "0%";
      progressFill.style.filter = safeFilters.length ? "saturate(1.06)" : "saturate(0.9)";
    }
    if (progressLabel instanceof HTMLElement) {
      progressLabel.textContent = safeFilters.length
        ? `${progressPercent}% quick-access library ready`
        : "Save filters to build one-click shortcuts";
    }

    list.innerHTML = "";
    if (!safeFilters.length) {
      renderRuntimeEmptyState(list, {
        title: "No saved filters yet.",
        note: "Save your favorite search combos for one-click reuse.",
        kind: "filters",
        compact: true,
      });
    } else {
      safeFilters.slice(0, 8).forEach((filter, index) => {
        const row = document.createElement("div");
        row.className = "runtime-mini-row runtime-feature-row";
        row.style.setProperty("--runtime-row-delay", `${Math.min(index * 70, 440)}ms`);

        const label = document.createElement("div");
        label.className = "runtime-mini-row-label";
        const title = document.createElement("p");
        title.className = "runtime-mini-row-title";
        title.textContent = normalizedText(filter?.name || "Saved Filter");
        const summary = filterCriteriaSummary(filter?.criteria || {});
        const detail = document.createElement("p");
        detail.className = "runtime-mini-row-meta";
        detail.textContent = summary;
        label.appendChild(title);
        label.appendChild(detail);

        const actions = document.createElement("div");
        actions.className = "runtime-mini-actions";
        const apply = document.createElement("button");
        apply.type = "button";
        apply.className = "runtime-mini-btn";
        apply.textContent = "Apply";
        apply.addEventListener("click", () => {
          if (!(searchInput instanceof HTMLInputElement) && !normalizedText(filter?.criteria?.search || "")) {
            showToast("Search bar not available on this page.", "warn");
            return;
          }
          applySavedFilterCriteria(filter?.criteria || {});
        });

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "runtime-mini-btn";
        edit.textContent = "Edit";
        edit.addEventListener("click", async () => {
          const filterId = normalizedText(filter?.id || "");
          if (!filterId) return;

          const next = await openSavedFilterModal({
            mode: "edit",
            initialName: normalizedText(filter?.name || ""),
            initialCriteria: filter?.criteria || {},
          });
          if (!next) return;

          const restore = setButtonBusy(edit, true, "Saving...");
          try {
            const { response, body } = await jsonRequest("/api/expenses/filters", {
              method: "POST",
              body: JSON.stringify({
                id: filterId,
                name: next.name,
                criteria: normalizeFilterCriteria(next.criteria || {}),
              }),
            });
            if (!response.ok) {
              throw new Error(parseApiError(body, "Unable to update saved filter."));
            }
            const updatedFilters = Array.isArray(body?.filters) ? body.filters : [];
            state.savedFilters = updatedFilters;
            state.savedFiltersAt = Date.now();
            renderSavedFiltersCard(updatedFilters);
            flashSuccessState(card);
            showToast(`Updated filter "${next.name}".`, "success", 2400);
          } catch (error) {
            showToast(String(error?.message || "Unable to update filter."), "error", 4200);
          } finally {
            restore();
          }
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "runtime-mini-btn";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          const filterId = normalizedText(filter?.id || "");
          if (!filterId) return;
          const restore = setButtonBusy(remove, true, "Deleting...");
          try {
            const { response, body } = await jsonRequest(
              `/api/expenses/filters/${encodeURIComponent(filterId)}`,
              {
                method: "DELETE",
                headers: {},
              }
            );
            if (!response.ok) {
              throw new Error(parseApiError(body, "Unable to delete saved filter."));
            }
            const next = Array.isArray(body?.filters) ? body.filters : [];
            state.savedFilters = next;
            state.savedFiltersAt = Date.now();
            renderSavedFiltersCard(next);
            flashSuccessState(card);
            showToast("Saved filter removed.", "success", 2200);
          } catch (error) {
            showToast(String(error?.message || "Unable to delete filter."), "error", 4200);
          } finally {
            restore();
          }
        });

        actions.appendChild(apply);
        actions.appendChild(edit);
        actions.appendChild(remove);

        row.appendChild(label);
        row.appendChild(actions);
        list.appendChild(row);
      });
    }

    if (saveButton.dataset.runtimeBound !== "1") {
      saveButton.dataset.runtimeBound = "1";
      saveButton.addEventListener("click", async () => {
        const seedCriteria = getCurrentCriteriaSeed(searchInput);
        const seedName = normalizedText(seedCriteria.search || "");
        const payload = await openSavedFilterModal({
          mode: "create",
          initialName: seedName.length > 36 ? `${seedName.slice(0, 33)}...` : seedName,
          initialCriteria: seedCriteria,
        });
        if (!payload) return;

        const restore = setButtonBusy(saveButton, true, "Saving...");
        try {
          const { response, body } = await jsonRequest("/api/expenses/filters", {
            method: "POST",
            body: JSON.stringify({
              name: payload.name,
              criteria: normalizeFilterCriteria(payload.criteria || {}),
            }),
          });
          if (!response.ok) {
            throw new Error(parseApiError(body, "Unable to save filter."));
          }
          const next = Array.isArray(body?.filters) ? body.filters : [];
          state.savedFilters = next;
          state.savedFiltersAt = Date.now();
          renderSavedFiltersCard(next);
          flashSuccessState(card, { pulseTarget: saveButton });
          showToast(`Saved filter "${payload.name}".`, "success", 2400);
        } catch (error) {
          showToast(String(error?.message || "Unable to save filter."), "error", 4200);
        } finally {
          restore();
        }
      });
    }
  }

  function renderOpsCard(snapshot = null) {
    const safe = snapshot && typeof snapshot === "object" ? snapshot : null;
    syncOpsHealthLauncher(safe);

    const card = document.getElementById("runtime-ops-health-card");
    if (!(card instanceof HTMLElement)) return;
    installRuntime3DCards([card]);

    const meta = card.querySelector("[data-runtime-ops-meta]");
    const refresh = card.querySelector("[data-runtime-ops-refresh-btn]");
    const grid = card.querySelector("[data-runtime-ops-grid]");
    if (!(meta instanceof HTMLElement) || !(refresh instanceof HTMLButtonElement) || !(grid instanceof HTMLElement)) {
      return;
    }

    const cells = Array.from(grid.querySelectorAll(".runtime-ops-cell .runtime-ops-v"));
    const counts = safe?.counts || {};
    const queue = safe?.queue || {};
    const latency = safe?.latency || {};

    if (!safe) {
      for (const cell of cells) {
        if (!(cell instanceof HTMLElement)) continue;
        cell.textContent = "--";
        cell.dataset.runtimeAnimatedValue = "";
      }
      meta.textContent = "Snapshot unavailable. Refresh to retry.";
      meta.style.color = "#64748b";
    } else {
      if (cells[0]) animateTextValue(cells[0], String(Number(counts.groups || 0)), { durationMs: 560 });
      if (cells[1]) animateTextValue(cells[1], String(Number(counts.expenses || 0)), { durationMs: 560 });
      if (cells[2]) animateTextValue(cells[2], String(Number(queue.failed || 0)), { durationMs: 560 });
      if (cells[3]) animateTextValue(cells[3], `${Math.round(Number(latency.totalMs || 0))}ms`, { durationMs: 560 });

      const failed = Number(queue.failed || 0);
      if (failed > 0) {
        meta.textContent = `${failed} failed background job${failed === 1 ? "" : "s"} detected`;
        meta.style.color = "#b45309";
      } else {
        const generatedAt = new Date(String(safe.generatedAt || Date.now())).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        meta.textContent = `Healthy • updated ${generatedAt}`;
        meta.style.color = "#64748b";
      }
    }

    if (refresh.dataset.runtimeBound !== "1") {
      refresh.dataset.runtimeBound = "1";
      refresh.addEventListener("click", async () => {
        const restore = setButtonBusy(refresh, true, "Refreshing...");
        try {
          const next = await fetchOpsSnapshot(true);
          renderOpsCard(next);
          flashSuccessState(card, { pulseTarget: opsHealthLauncherNode() || refresh });
          showToast("Ops panel refreshed.", "success", 2200);
        } catch (error) {
          showToast(String(error?.message || "Unable to refresh ops panel."), "error", 4200);
        } finally {
          restore();
        }
      });
    }
  }

  function renderOnboardingCard(snapshot = null) {
    const card = document.getElementById("runtime-onboarding-card");
    if (!(card instanceof HTMLElement)) return;
    installRuntime3DCards([card]);

    const meta = card.querySelector("[data-runtime-onboarding-meta]");
    const list = card.querySelector("[data-runtime-onboarding-list]");
    const resetButton = card.querySelector("[data-runtime-onboarding-reset-btn]");
    const progressFill = card.querySelector("[data-runtime-onboarding-fill]");
    const progressLabel = card.querySelector("[data-runtime-onboarding-progress]");
    if (!(meta instanceof HTMLElement) || !(list instanceof HTMLElement) || !(resetButton instanceof HTMLButtonElement)) {
      return;
    }

    const items = onboardingItems(snapshot);
    const completed = items.filter((item) => item.completed).length;
    meta.textContent = `${completed}/${items.length} completed`;
    const completionPercent = items.length ? Math.round((completed / items.length) * 100) : 0;
    if (progressFill instanceof HTMLElement) {
      progressFill.style.width = completed ? `${Math.max(12, completionPercent)}%` : "0%";
      progressFill.style.filter = completed === items.length ? "saturate(1.1)" : "saturate(1)";
    }
    if (progressLabel instanceof HTMLElement) {
      progressLabel.textContent = completionPercent
        ? `${completionPercent}% onboarding complete`
        : "Complete tasks to unlock full workspace setup";
    }

    list.innerHTML = "";
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "runtime-mini-row runtime-onboard-row runtime-feature-row";
      row.style.setProperty("--runtime-row-delay", `${Math.min(index * 74, 420)}ms`);

      const left = document.createElement("div");
      left.className = "runtime-mini-actions";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `runtime-check-toggle${item.completed ? " completed" : ""}${item.locked ? " locked" : ""}`;
      toggle.textContent = item.completed ? "✓" : "•";
      toggle.title = item.locked ? "Automatically completed from activity" : "Mark completed";
      toggle.disabled = item.locked;
      toggle.addEventListener("click", () => {
        const current = readOnboardingProgress();
        current[item.key] = !current[item.key];
        writeOnboardingProgress(current);
        renderOnboardingCard(snapshot);
      });
      left.appendChild(toggle);

      const label = document.createElement("div");
      label.className = "runtime-mini-row-label";
      const title = document.createElement("p");
      title.className = "runtime-mini-row-title";
      title.textContent = item.label;
      const hint = document.createElement("p");
      hint.className = "runtime-mini-row-meta";
      hint.textContent = item.hint;
      label.appendChild(title);
      label.appendChild(hint);

      const actions = document.createElement("div");
      actions.className = "runtime-mini-actions";
      const go = document.createElement("button");
      go.type = "button";
      go.className = "runtime-mini-btn";
      go.textContent = "Open";
      go.addEventListener("click", () => {
        navigateWithTransition(item.route);
      });
      actions.appendChild(go);

      row.appendChild(left);
      row.appendChild(label);
      row.appendChild(actions);
      list.appendChild(row);
    });

    const progressPill = card.querySelector("[data-runtime-onboard-pill]");
    if (!(progressPill instanceof HTMLElement)) {
      const pill = document.createElement("span");
      pill.className = "runtime-onboard-progress";
      pill.dataset.runtimeOnboardPill = "1";
      pill.textContent = `${completed}/${items.length}`;
      const head = card.querySelector(".runtime-product-head");
      if (head instanceof HTMLElement) {
        head.insertBefore(pill, resetButton);
      }
    } else {
      progressPill.textContent = `${completed}/${items.length}`;
    }

    if (resetButton.dataset.runtimeBound !== "1") {
      resetButton.dataset.runtimeBound = "1";
      resetButton.addEventListener("click", () => {
        writeOnboardingProgress({
          create_group: false,
          add_expense: false,
          invite_member: false,
          settle_up: false,
        });
        renderOnboardingCard(snapshot);
        showToast("Checklist reset.", "info", 2200);
      });
    }
  }

  async function installDashboardProductPanels() {
    const root = ensureDashboardProductPanels();
    if (!root) return;

    let filters = [];
    let ops = null;
    try {
      [filters, ops] = await Promise.all([
        fetchSavedFilters(false).catch(() => []),
        fetchOpsSnapshot(false).catch(() => null),
      ]);
    } catch {
      // Keep defaults.
    }

    try {
      renderSavedFiltersCard(filters);
    } catch {
      // Keep existing fallback nodes.
    }

    try {
      renderOpsCard(ops);
    } catch {
      // Keep existing fallback nodes.
    }

    try {
      renderOnboardingCard(ops);
    } catch {
      // Keep existing fallback nodes.
    }

    try {
      renderAIAssistantCard();
    } catch {
      // Keep existing fallback nodes.
    }
  }

  function installStickyPrimaryActions() {
    const currentPath = normalizePath(window.location.pathname);
    if (!["/dashboard", "/groups", "/activity", "/expenses", "/ai-assistance", "/create-group", "/create-expense", "/settle"].includes(currentPath)) {
      return;
    }

    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) return;

    const buttons = Array.from(main.querySelectorAll("button"));
    const keywords = [
      "create group",
      "new group",
      "add expense",
      "review & bulk import",
      "review and bulk import",
      "send reminders",
      "settle",
      "save",
    ];

    for (const button of buttons) {
      const label = normalizedKey(button.textContent || "");
      if (!keywords.some((keyword) => label.includes(keyword))) continue;
      if (button.dataset.runtimeStickyBound === "1") continue;
      button.dataset.runtimeStickyBound = "1";

      const container = button.closest("div");
      if (container instanceof HTMLElement) {
        container.classList.add("runtime-sticky-actions");
      } else {
        button.classList.add("runtime-sticky-actions");
      }
    }
  }

  function notificationPanelNode() {
    return document.getElementById("runtime-notify-panel");
  }

  function closeNotificationPanel() {
    const existing = notificationPanelNode();
    if (existing) existing.remove();
    state.notificationPanelOpen = false;
  }

  function getNotificationBellButton() {
    const header = document.querySelector("header");
    if (!header) return null;
    const buttons = Array.from(header.querySelectorAll("button"));
    return (
      buttons.find((button) =>
        Array.from(button.querySelectorAll("span")).some((span) => {
          const cls = String(span.className || "");
          return cls.includes("w-2") && cls.includes("h-2") && cls.includes("rounded-full");
        })
      ) || null
    );
  }

  function setBellUnreadIndicator(visible) {
    const bell = getNotificationBellButton();
    if (!bell) return;
    bell.classList.toggle("runtime-bell-unread", Boolean(visible));
    const dot = Array.from(bell.querySelectorAll("span")).find((span) => {
      const cls = String(span.className || "");
      return cls.includes("w-2") && cls.includes("h-2") && cls.includes("rounded-full");
    });
    if (!dot) return;
    dot.style.display = visible ? "" : "none";
  }

  async function loadNotificationItems(force = false) {
    const now = Date.now();
    if (!force && now - state.notificationItemsAt < 12_000 && Array.isArray(state.notificationItems)) {
      return state.notificationItems;
    }

    const groups = await fetchGroups(force);
    const details = await Promise.all(
      (groups || []).slice(0, 8).map(async (group) => {
        try {
          return await fetchGroupDetail(group.id, force);
        } catch {
          return null;
        }
      })
    );

    const items = [];
    for (const detail of details) {
      if (!detail) continue;

      const groupName = String(detail.name || "Group");
      const groupId = Number(detail.id || 0);
      const notificationLogs = Array.isArray(detail.notificationLogs) ? detail.notificationLogs.slice(0, 8) : [];
      for (const log of notificationLogs) {
        items.push({
          kind: "notification",
          id: `n-${groupId}-${log.id}`,
          groupId,
          logId: Number(log.id),
          groupName,
          status: String(log.status || "queued").toLowerCase(),
          channel: String(log.channel || "notification").toLowerCase(),
          text:
            normalizedText(log.message || "") ||
            `Settlement reminder via ${String(log.channel || "notification").toUpperCase()}`,
          createdAt: String(log.createdAt || ""),
        });
      }

      const activityLogs = Array.isArray(detail.activityLogs) ? detail.activityLogs.slice(0, 6) : [];
      for (const activity of activityLogs) {
        const type = String(activity.type || "").toLowerCase();
        if (!["expense_added", "settlement_reminder", "settlement_paid"].includes(type)) continue;
        items.push({
          kind: "activity",
          id: `a-${groupId}-${activity.id}`,
          groupId,
          groupName,
          status: type.replace(/_/g, " "),
          channel: "activity",
          text: normalizedText(activity.message || "Group activity update"),
          createdAt: String(activity.createdAt || ""),
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    state.notificationItems = items.slice(0, 20);
    state.notificationItemsAt = Date.now();
    setBellUnreadIndicator(state.notificationItems.some((item) => item.kind === "notification"));
    return state.notificationItems;
  }

  function createNotifyItemRow(item, index = 0) {
    const row = document.createElement("div");
    row.className = "runtime-notify-item runtime-notify-item-enter";
    row.style.setProperty("--runtime-notify-delay", `${Math.min(Math.max(Number(index) || 0, 0) * 34, 220)}ms`);

    const head = document.createElement("div");
    head.className = "runtime-notify-item-head";

    const group = document.createElement("div");
    group.className = "runtime-notify-group";
    group.textContent = item.groupName || "Group";

    const time = document.createElement("div");
    time.className = "runtime-notify-time";
    time.textContent = relativeTime(item.createdAt);

    head.appendChild(group);
    head.appendChild(time);

    const text = document.createElement("div");
    text.className = "runtime-notify-text";
    text.textContent = item.text || "Notification";

    const meta = document.createElement("div");
    meta.className = "runtime-notify-meta";

    const status = document.createElement("div");
    status.className = `runtime-notify-status ${item.status || ""}`;
    if (item.kind === "notification") {
      status.textContent = `${String(item.channel || "").toUpperCase()} • ${String(item.status || "queued").toUpperCase()}`;
    } else {
      status.textContent = String(item.status || "ACTIVITY").toUpperCase();
    }

    const actions = document.createElement("div");
    actions.className = "runtime-notify-actions";

    if (item.kind === "notification" && item.status === "failed") {
      const retryBtn = document.createElement("button");
      retryBtn.className = "runtime-notify-btn";
      retryBtn.type = "button";
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", async (event) => {
        stopEvent(event);
        retryBtn.disabled = true;
        const { response, body } = await jsonRequest(`/api/groups/${item.groupId}/notifications/retry`, {
          method: "POST",
          body: JSON.stringify({ logId: item.logId }),
        });
        if (!response.ok) {
          showToast(parseApiError(body, "Could not retry notification."), "error", 5000);
          retryBtn.disabled = false;
          return;
        }
        state.notificationItemsAt = 0;
        await openNotificationPanel(true);
        flashSuccessState(notificationPanelNode() || row);
        showToast("Notification retry sent.", "success");
      });
      actions.appendChild(retryBtn);
    }

    if (item.kind === "notification") {
      const dismissBtn = document.createElement("button");
      dismissBtn.className = "runtime-notify-btn";
      dismissBtn.type = "button";
      dismissBtn.textContent = "Dismiss";
      dismissBtn.addEventListener("click", async (event) => {
        stopEvent(event);
        dismissBtn.disabled = true;
        const { response, body } = await jsonRequest(`/api/groups/${item.groupId}/notifications/${item.logId}`, {
          method: "DELETE",
          headers: {},
        });
        if (!response.ok) {
          showToast(parseApiError(body, "Could not dismiss notification."), "error", 5000);
          dismissBtn.disabled = false;
          return;
        }
        state.notificationItemsAt = 0;
        await openNotificationPanel(true);
        flashSuccessState(notificationPanelNode() || row);
        showToast("Notification dismissed.", "success");
      });
      actions.appendChild(dismissBtn);
    }

    meta.appendChild(status);
    meta.appendChild(actions);

    row.appendChild(head);
    row.appendChild(text);
    row.appendChild(meta);

    return row;
  }

  async function openNotificationPanel(forceRefresh = false) {
    closeNotificationPanel();

    const panel = document.createElement("div");
    panel.id = "runtime-notify-panel";
    panel.className = "runtime-notify-panel";

    const head = document.createElement("div");
    head.className = "runtime-notify-head";

    const title = document.createElement("strong");
    title.textContent = "Notifications";

    const controls = document.createElement("div");
    controls.className = "runtime-notify-controls";

    const refreshButton = document.createElement("button");
    refreshButton.className = "runtime-notify-btn";
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";
    refreshButton.addEventListener("click", async (event) => {
      stopEvent(event);
      state.notificationItemsAt = 0;
      await openNotificationPanel(true);
    });

    const closeButton = document.createElement("button");
    closeButton.className = "runtime-notify-btn";
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", (event) => {
      stopEvent(event);
      closeNotificationPanel();
    });

    controls.appendChild(refreshButton);
    controls.appendChild(closeButton);
    head.appendChild(title);
    head.appendChild(controls);

    const body = document.createElement("div");
    body.className = "runtime-notify-body";

    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);
    state.notificationPanelOpen = true;
    renderSkeletonList(body, 4, { showAvatar: false, compact: true });

    let items = [];
    try {
      items = await loadNotificationItems(forceRefresh);
    } catch {
      items = [];
    }
    setBellUnreadIndicator(items.some((item) => item.kind === "notification"));

    body.innerHTML = "";
    body.classList.remove("runtime-skeleton-list");
    if (!items.length) {
      renderRuntimeEmptyState(body, {
        title: "No notifications yet.",
        note: "Background job alerts and reminder retries will show up here.",
        kind: "notifications",
        compact: true,
      });
      return;
    }

    for (let index = 0; index < items.length; index += 1) {
      body.appendChild(createNotifyItemRow(items[index], index));
    }
  }

  function installNotificationBell() {
    const currentPath = normalizePath(window.location.pathname);
    if (!DASHBOARD_LIKE_PATHS.has(currentPath)) {
      closeNotificationPanel();
      return;
    }

    const bellButton = getNotificationBellButton();
    if (!bellButton) return;

    if (bellButton.dataset.runtimeNotifyBound !== "1") {
      bellButton.dataset.runtimeNotifyBound = "1";
      bellButton.addEventListener("click", async (event) => {
        stopEvent(event);
        if (state.notificationPanelOpen) {
          closeNotificationPanel();
          return;
        }
        await openNotificationPanel(false);
      });
    }

    if (!state.notificationEventsBound) {
      state.notificationEventsBound = true;
      document.addEventListener(
        "click",
        (event) => {
          if (!state.notificationPanelOpen) return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          const panel = notificationPanelNode();
          const bell = getNotificationBellButton();
          if (panel?.contains(target)) return;
          if (bell?.contains(target)) return;
          closeNotificationPanel();
        },
        true
      );

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.notificationPanelOpen) {
          closeNotificationPanel();
        }
      });
    }
  }

  function removeSettlementReminderPanel() {
    const node = document.getElementById("runtime-settlement-reminder-card");
    if (node) node.remove();
  }

  function settlementReminderHubNode() {
    return document.getElementById("runtime-settlement-hub");
  }

  function settlementReminderLauncherNode() {
    return document.getElementById("runtime-settlement-launcher");
  }

  function settlementReminderFlyoutCardNode() {
    return document.getElementById("runtime-settlement-reminder-flyout-card");
  }

  function closeSettlementReminderLauncher() {
    const hub = settlementReminderHubNode();
    if (!(hub instanceof HTMLElement)) return;
    hub.classList.remove("open");

    const launcher = settlementReminderLauncherNode();
    if (launcher instanceof HTMLButtonElement) {
      launcher.setAttribute("aria-expanded", "false");
    }
  }

  function removeSettlementReminderLauncher() {
    closeSettlementReminderLauncher();
    const hub = settlementReminderHubNode();
    if (hub) hub.remove();
  }

  function findSettleMainContainer() {
    return (
      document.querySelector("main .max-w-4xl.mx-auto") ||
      document.querySelector("main [class*='max-w-4xl']") ||
      null
    );
  }

  async function resolveReminderCandidates(force = false) {
    const [groups, session] = await Promise.all([fetchGroups(force), fetchSession(false)]);
    if (!Array.isArray(groups) || !groups.length || !session) return [];

    const candidates = [];
    for (const group of groups.slice(0, 10)) {
      const detail = await fetchGroupDetail(group.id, force).catch(() => null);
      if (!detail?.summary?.settlements?.length) continue;

      const memberIdsForSession = new Set(
        (detail.members || [])
          .filter((member) => Number(member.userId || 0) === Number(session.userId || 0))
          .map((member) => Number(member.id))
      );
      if (!memberIdsForSession.size) continue;

      for (const settlement of detail.summary.settlements) {
        if (!memberIdsForSession.has(Number(settlement.toMemberId))) continue;
        const amount = Number(settlement.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        candidates.push({
          key: `${group.id}:${settlement.fromMemberId}:${settlement.toMemberId}:${amount.toFixed(2)}`,
          groupId: Number(group.id),
          groupName: String(detail.name || group.name || "Group"),
          currency: String(detail.currency || group.currency || "INR"),
          fromMemberId: Number(settlement.fromMemberId),
          toMemberId: Number(settlement.toMemberId),
          fromName: normalizedText(settlement.fromName || "Member"),
          toName: normalizedText(settlement.toName || "You"),
          amount,
        });
      }
    }

    candidates.sort((a, b) => b.amount - a.amount);
    return candidates;
  }

  async function fetchReminderCandidatesCached(force = false) {
    const now = Date.now();
    if (!force && now - state.settlementCandidatesAt < 45_000 && Array.isArray(state.settlementCandidatesCache)) {
      return state.settlementCandidatesCache;
    }

    const candidates = await resolveReminderCandidates(force).catch(() => []);
    state.settlementCandidatesCache = Array.isArray(candidates) ? candidates : [];
    state.settlementCandidatesAt = Date.now();
    return state.settlementCandidatesCache;
  }

  function syncSettlementReminderLauncher(candidates = null) {
    const launcher = settlementReminderLauncherNode();
    if (!(launcher instanceof HTMLButtonElement)) return;

    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const count = safeCandidates.length;
    const badge = launcher.querySelector("[data-runtime-settle-badge]");
    const stateLabel = count > 0 ? "pending" : "clear";
    launcher.dataset.runtimeSettleState = stateLabel;
    const title =
      count > 0
        ? `${count} pending settlement reminder${count === 1 ? "" : "s"}`
        : "Settle now • no pending reminders";
    launcher.title = title;
    launcher.setAttribute("aria-label", title);

    if (badge instanceof HTMLElement) {
      badge.textContent = count > 9 ? "9+" : String(count || "");
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  }

  async function sendSettlementReminder(candidate, button = null, options = {}) {
    const fromName = normalizedText(candidate?.fromName || "member");
    const amount = Number(candidate?.amount || 0);
    const silent = Boolean(options?.silent);

    const restoreButton = setButtonBusy(button, true, "Sending...");
    try {
      const payload = {
        groupId: Number(candidate?.groupId || 0),
        fromMemberId: Number(candidate?.fromMemberId || 0),
        toMemberId: Number(candidate?.toMemberId || 0),
        amount,
        channel: "all",
        message: `Friendly reminder: ${fromName}, please settle ${candidate.currency} ${amount.toFixed(2)}.`,
      };

      const notify = await jsonRequest("/api/notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!notify.response.ok) {
        throw new Error(parseApiError(notify.body, "Could not send reminder."));
      }

      mergeOnboardingProgress({ settle_up: true });
      if (Array.isArray(state.settlementCandidatesCache) && state.settlementCandidatesCache.length) {
        state.settlementCandidatesCache = state.settlementCandidatesCache.filter(
          (item) => String(item?.key || "") !== String(candidate?.key || "")
        );
        state.settlementCandidatesAt = Date.now();
        syncSettlementReminderLauncher(state.settlementCandidatesCache);
      } else {
        state.settlementCandidatesAt = 0;
      }
      if (!silent) {
        flashSuccessState(button?.closest("div") || button, { pulseTarget: button });
        showToast(`Reminder sent to ${fromName}.`, "success");
      }
      state.notificationItemsAt = 0;
      if (button instanceof HTMLButtonElement) {
        button.textContent = "Sent";
        button.disabled = true;
        button.dataset.runtimeReminderSent = "1";
      }
      return true;
    } catch (error) {
      if (!silent) {
        showToast(String(error?.message || "Unable to send reminder."), "error", 6000);
      }
      restoreButton();
      return false;
    }
  }

  async function sendAllSettlementReminders(card, button = null) {
    const candidates = Array.isArray(card?._runtimeReminderVisibleCandidates)
      ? card._runtimeReminderVisibleCandidates
      : [];
    if (!candidates.length) {
      showToast("No pending reminders to send.", "info");
      return;
    }

    const restore = setButtonBusy(button, true, "Sending All...");
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const candidate of candidates) {
        const rowButton = card.querySelector(
          `[data-runtime-reminder-item-button="1"][data-runtime-reminder-key="${candidate.key}"]`
        );
        if (rowButton instanceof HTMLButtonElement && rowButton.dataset.runtimeReminderSent === "1") {
          continue;
        }
        const ok = await sendSettlementReminder(candidate, rowButton, { silent: true });
        if (ok) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      }

      if (successCount > 0 && failureCount === 0) {
        flashSuccessState(card, { pulseTarget: button });
        showToast(`Sent ${successCount} reminder${successCount === 1 ? "" : "s"}.`, "success");
      } else if (successCount > 0 && failureCount > 0) {
        flashSuccessState(card, { pulseTarget: button });
        showToast(
          `Sent ${successCount} reminder${successCount === 1 ? "" : "s"}, ${failureCount} failed.`,
          "warn",
          5500
        );
      } else {
        showToast("Could not send reminders. Please try again.", "error", 6000);
      }

      state.settlementCandidatesAt = 0;
      const refreshed = await fetchReminderCandidatesCached(true).catch(() => []);
      syncSettlementReminderLauncher(refreshed);
      if (card instanceof HTMLElement) {
        renderReminderPanel(card, refreshed);
      }
    } finally {
      restore();
      if (button instanceof HTMLButtonElement) {
        button.textContent = "Send All";
      }
    }
  }

  function createReminderRow(candidate) {
    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50";

    const info = document.createElement("div");
    info.className = "min-w-0";
    const title = document.createElement("p");
    title.className = "text-sm font-semibold text-gray-900 truncate";
    title.textContent = `${candidate.fromName} owes ${formatMoney(candidate.amount)}`;

    const meta = document.createElement("p");
    meta.className = "text-xs text-gray-500 truncate";
    meta.textContent = `${candidate.groupName} • ${candidate.currency} ${candidate.amount.toFixed(2)}`;

    info.appendChild(title);
    info.appendChild(meta);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors";
    btn.style.background = "#10b981";
    btn.style.boxShadow = "0 6px 14px rgba(16, 185, 129, 0.28)";
    btn.textContent = "Send Reminder";
    btn.dataset.runtimeReminderItemButton = "1";
    btn.dataset.runtimeReminderSent = "0";
    btn.dataset.runtimeReminderKey = String(candidate.key || "");
    btn.addEventListener("click", () => {
      sendSettlementReminder(candidate, btn);
    });

    row.appendChild(info);
    row.appendChild(btn);
    return row;
  }

  function renderReminderPanel(card, candidates) {
    const list = card.querySelector("[data-runtime-reminder-list]");
    const count = card.querySelector("[data-runtime-reminder-count]");
    const sendAllButton = card.querySelector("[data-runtime-reminder-send-all]");
    if (!list || !count) return;

    list.innerHTML = "";
    list.classList.remove("runtime-skeleton-list");
    if (!Array.isArray(candidates) || !candidates.length) {
      count.textContent = "No pending reminders right now.";
      if (sendAllButton instanceof HTMLButtonElement) {
        sendAllButton.disabled = true;
        sendAllButton.textContent = "Send All";
      }
      card._runtimeReminderVisibleCandidates = [];
      renderRuntimeEmptyState(list, {
        title: "You are all caught up.",
        note: "Pending settlement nudges will appear here when someone owes you.",
        kind: "reminders",
        compact: true,
      });
      return;
    }

    count.textContent = `${candidates.length} pending reminder${candidates.length === 1 ? "" : "s"}`;
    const visibleCandidates = candidates.slice(0, 6);
    card._runtimeReminderVisibleCandidates = visibleCandidates;
    if (sendAllButton instanceof HTMLButtonElement) {
      sendAllButton.disabled = false;
      sendAllButton.textContent = "Send All";
    }

    for (const candidate of visibleCandidates) {
      list.appendChild(createReminderRow(candidate));
    }
  }

  function createReminderCard() {
    const card = document.createElement("section");
    card.id = "runtime-settlement-reminder-card";
    card.className = "bg-white rounded-2xl shadow-card p-5 sm:p-6 mb-6";
    card.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-4">
        <div>
          <p class="text-sm font-semibold text-gray-900">Payment Reminders</p>
          <p class="text-xs text-gray-500 mt-0.5" data-runtime-reminder-count>Loading...</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white transition-colors disabled:opacity-55 disabled:cursor-not-allowed" style="background:#059669;" data-runtime-reminder-send-all>
            Send All
          </button>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style="background:#10b981;">
            Settlement
          </span>
        </div>
      </div>
      <div class="space-y-2.5" data-runtime-reminder-list>
        <p class="text-sm text-gray-500">Loading pending reminders...</p>
      </div>
    `;
    const list = card.querySelector("[data-runtime-reminder-list]");
    if (list instanceof HTMLElement) {
      renderSkeletonList(list, 3, { showAvatar: false, compact: true });
    }
    const sendAllButton = card.querySelector("[data-runtime-reminder-send-all]");
    if (sendAllButton instanceof HTMLButtonElement) {
      sendAllButton.disabled = true;
      sendAllButton.addEventListener("click", () => {
        sendAllSettlementReminders(card, sendAllButton);
      });
    }
    return card;
  }

  function createReminderFlyoutCard() {
    const card = document.createElement("article");
    card.id = "runtime-settlement-reminder-flyout-card";
    card.className = "runtime-product-card runtime-motion-card runtime-motion-panel";
    card.innerHTML = `
      <div class="runtime-product-head">
        <div>
          <p class="runtime-product-title">Settle Now</p>
          <p class="runtime-product-subtitle" data-runtime-reminder-count>Loading reminders...</p>
        </div>
        <div class="runtime-mini-actions">
          <button type="button" class="runtime-mini-btn success" data-runtime-reminder-send-all>Send All</button>
          <button type="button" class="runtime-mini-btn" data-runtime-settle-close-btn>Close</button>
        </div>
      </div>
      <div class="runtime-mini-list" data-runtime-reminder-list>
        <p class="runtime-mini-empty">Loading pending reminders...</p>
      </div>
    `;

    const list = card.querySelector("[data-runtime-reminder-list]");
    if (list instanceof HTMLElement) {
      renderSkeletonList(list, 3, { showAvatar: false, compact: true });
    }

    const sendAllButton = card.querySelector("[data-runtime-reminder-send-all]");
    if (sendAllButton instanceof HTMLButtonElement) {
      sendAllButton.disabled = true;
      sendAllButton.addEventListener("click", () => {
        sendAllSettlementReminders(card, sendAllButton);
      });
    }

    const closeButton = card.querySelector("[data-runtime-settle-close-btn]");
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.addEventListener("click", (event) => {
        stopEvent(event);
        closeSettlementReminderLauncher();
      });
    }

    return card;
  }

  async function ensureSettlementReminderLauncher(force = false) {
    const path = normalizePath(window.location.pathname);
    if (!SETTLE_LAUNCHER_PATHS.has(path)) {
      removeSettlementReminderLauncher();
      return null;
    }

    const headerRail = resolveHeaderActionRail();
    if (!headerRail?.rail) {
      removeSettlementReminderLauncher();
      return null;
    }

    let hub = settlementReminderHubNode();
    if (!(hub instanceof HTMLElement)) {
      hub = document.createElement("div");
      hub.id = "runtime-settlement-hub";
      hub.className = "runtime-settle-hub";
    }

    if (headerRail.beforeNode instanceof HTMLElement && headerRail.beforeNode.parentElement === headerRail.rail) {
      if (hub.parentElement !== headerRail.rail || hub.nextSibling !== headerRail.beforeNode) {
        headerRail.rail.insertBefore(hub, headerRail.beforeNode);
      }
    } else if (hub.parentElement !== headerRail.rail) {
      headerRail.rail.appendChild(hub);
    }

    let launcher = settlementReminderLauncherNode();
    if (!(launcher instanceof HTMLButtonElement)) {
      launcher = document.createElement("button");
      launcher.id = "runtime-settlement-launcher";
      launcher.type = "button";
      launcher.className = "runtime-settle-launcher runtime-motion-btn runtime-motion-pill";
      launcher.setAttribute("aria-haspopup", "dialog");
      launcher.setAttribute("aria-expanded", "false");
      launcher.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.5 6.5h13M5.5 12h13M5.5 17.5h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M9 8.4c0-1.4 1-2.4 2.5-2.4 1.3 0 2.1.6 2.1 1.6 0 0.7-.4 1.2-1.3 1.7l-0.6 0.3c-0.9 0.5-1.3 1-1.3 1.9V12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="11.4" cy="14.8" r="0.95" fill="currentColor"/>
        </svg>
        <span class="runtime-settle-launcher-dot" aria-hidden="true"></span>
        <span class="runtime-settle-launcher-badge" data-runtime-settle-badge aria-hidden="true"></span>
      `;
      launcher.addEventListener("click", async (event) => {
        stopEvent(event);
        if (!hub.classList.contains("open")) {
          closeOpsHealthPanel();
        }
        const nextOpen = !hub.classList.contains("open");
        hub.classList.toggle("open", nextOpen);
        launcher.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        if (!nextOpen) return;

        const card = settlementReminderFlyoutCardNode();
        try {
          const candidates = await fetchReminderCandidatesCached(force);
          if (card instanceof HTMLElement) {
            renderReminderPanel(card, candidates);
          }
          syncSettlementReminderLauncher(candidates);
        } catch {
          if (card instanceof HTMLElement) {
            renderReminderPanel(card, []);
          }
          syncSettlementReminderLauncher([]);
        }
      });
      hub.appendChild(launcher);
    }

    let flyout = hub.querySelector(".runtime-settle-flyout");
    if (!(flyout instanceof HTMLElement)) {
      flyout = document.createElement("div");
      flyout.className = "runtime-settle-flyout";
      const flyoutCard = createReminderFlyoutCard();
      flyout.appendChild(flyoutCard);
      hub.appendChild(flyout);
      installRuntime3DCards([flyoutCard]);
    }

    const card = settlementReminderFlyoutCardNode();
    if (card instanceof HTMLElement) {
      installRuntime3DCards([card]);
    }

    if (!state.settleLauncherEventsBound) {
      state.settleLauncherEventsBound = true;
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          const currentHub = settlementReminderHubNode();
          if (!currentHub || !currentHub.classList.contains("open")) return;
          if (currentHub.contains(target)) return;
          closeSettlementReminderLauncher();
        },
        true
      );

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeSettlementReminderLauncher();
        }
      });
    }

    try {
      const candidates = await fetchReminderCandidatesCached(force);
      syncSettlementReminderLauncher(candidates);
      if (card instanceof HTMLElement) {
        renderReminderPanel(card, candidates);
      }
    } catch {
      syncSettlementReminderLauncher([]);
      if (card instanceof HTMLElement) {
        renderReminderPanel(card, []);
      }
    }

    return card instanceof HTMLElement ? card : null;
  }

  async function installSettlementReminderPanel() {
    const currentPath = normalizePath(window.location.pathname);
    if (!SETTLE_LAUNCHER_PATHS.has(currentPath)) {
      removeSettlementReminderPanel();
      removeSettlementReminderLauncher();
      return;
    }

    await ensureSettlementReminderLauncher(false);
    removeSettlementReminderPanel();
  }

  function buildPaymentMethodIntentUrl(intent) {
    const method = normalizedKey(intent?.method || "");
    const amount = Math.max(0, Number(intent?.amount || 0));
    const amountText = amount > 0 ? amount.toFixed(2) : "0";
    const recipient = normalizedText(intent?.toName || "group member");
    const note = encodeURIComponent(`Expense settlement to ${recipient}`);

    if (method.includes("paypal")) {
      return `https://www.paypal.com/sendmoney?amount=${encodeURIComponent(amountText)}&note=${note}`;
    }
    if (method.includes("venmo")) {
      return `https://venmo.com/?txn=pay&amount=${encodeURIComponent(amountText)}&note=${note}`;
    }
    if (method.includes("cash app") || method.includes("cashapp")) {
      return "https://cash.app/";
    }
    return "";
  }

  function launchPaymentMethodFlow(intent) {
    const methodName = normalizedText(intent?.method || "");
    if (!methodName) {
      return {
        opened: false,
        methodName: "",
      };
    }

    const methodKey = normalizedKey(methodName);
    if (methodKey.includes("bank")) {
      showToast("Bank transfer selected. Complete transfer in your banking app and this payment will be recorded.", "info", 5500);
      return {
        opened: false,
        methodName,
      };
    }
    if (methodKey === "cash") {
      showToast("Cash payment selected. Hand over cash and this payment will be recorded.", "info", 5000);
      return {
        opened: false,
        methodName,
      };
    }

    const url = buildPaymentMethodIntentUrl(intent);
    if (!url) {
      showToast(`${methodName} selected. Complete payment in your payment app.`, "info", 5000);
      return {
        opened: false,
        methodName,
      };
    }

    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      showToast(`${methodName} opened in a new tab.`, "success", 4500);
      return {
        opened: true,
        methodName,
        url,
      };
    } else {
      showToast(`Popup blocked. Open ${methodName} manually to complete payment.`, "warn", 5500);
      return {
        opened: false,
        methodName,
        url,
      };
    }
  }

  function resolveIntegratedPaymentProvider(intent, groupCurrency = "") {
    const method = normalizedKey(intent?.method || "");
    const currency = normalizedKey(groupCurrency || "");

    if (method.includes("paypal")) return "paypal";
    if (method.includes("stripe") || method.includes("card")) return "stripe";
    if (method.includes("razorpay") || method.includes("upi")) return "razorpay";
    if ((method.includes("gpay") || method.includes("google pay")) && currency === "inr") return "razorpay";

    return "";
  }

  function isLogoutTrigger(target) {
    const trigger = getTrigger(target);
    if (!trigger) return false;
    const text = getTriggerText(trigger).toLowerCase();
    return text === "logout" || text === "log out" || text === "sign out";
  }

  function getSocialAuthProvider(target) {
    const trigger = getTrigger(target);
    if (!trigger) return "";
    const text = getTriggerText(trigger).toLowerCase();
    if (text.includes("google")) return "google";
    if (text.includes("apple")) return "apple";
    return "";
  }

  function getNavAliasTarget(target) {
    const trigger = getTrigger(target);
    if (!trigger) return "";

    if (trigger instanceof HTMLButtonElement) {
      const type = String(trigger.getAttribute("type") || "button").toLowerCase();
      if (type === "submit") return "";
      if (trigger.closest("form")) return "";
    }

    if (trigger instanceof HTMLButtonElement && trigger.dataset.runtimeAiNavigate === "1") {
      return "/ai-assistance";
    }

    const hrefPath = normalizeHrefPath(trigger.getAttribute("href") || "");
    if (hrefPath && NAV_ALIASES[hrefPath]) {
      return NAV_ALIASES[hrefPath];
    }

    const label = getTriggerText(trigger).toLowerCase();
    if (label === "groups") return NAV_ALIASES["/groups"];
    if (label === "expenses") return NAV_ALIASES["/expenses"];
    if (label === "activity") return NAV_ALIASES["/activity"];
    if (label === "ai assistance" || label === "ai assistant") return NAV_ALIASES["/ai-assistance"];
    return "";
  }

  function getLoginFields(form) {
    const emailInput = form.querySelector("input#email, input[type='email']");
    const passwordInput = form.querySelector("input#password, input[type='password']");
    return { emailInput, passwordInput };
  }

  function getSignupFields(form) {
    const firstNameInput = form.querySelector("input#firstName");
    const lastNameInput = form.querySelector("input#lastName");
    const emailInput = form.querySelector("input#email, input[type='email']");
    const passwordInput = form.querySelector("input#password, input[type='password']");
    return { firstNameInput, lastNameInput, emailInput, passwordInput };
  }

  function getSignupTermsButton(form) {
    if (!(form instanceof HTMLFormElement)) return null;
    return form.querySelector("button[role='checkbox'][aria-required='true'], button[role='checkbox']") || null;
  }

  function setSubmitState(form, busy) {
    const submitButtons = form.querySelectorAll("button[type='submit']");
    submitButtons.forEach((button) => {
      const requiresTerms = button.dataset.runtimeTermsRequired === "1";
      const termsAccepted = button.dataset.runtimeTermsAccepted === "1";
      button.disabled = Boolean(busy || (requiresTerms && !termsAccepted));
    });
  }

  function setButtonBusy(button, busy, busyLabel = "Working...") {
    if (!(button instanceof HTMLButtonElement)) return () => {};
    const previous = {
      disabled: button.disabled,
      html: button.innerHTML,
    };
    button.disabled = Boolean(busy);
    if (busy) {
      button.textContent = busyLabel;
    }
    return () => {
      button.disabled = previous.disabled;
      button.innerHTML = previous.html;
    };
  }

  async function runLogin(form) {
    const { emailInput, passwordInput } = getLoginFields(form);
    const email = String(emailInput?.value || "").trim();
    const password = String(passwordInput?.value || "");

    if (!email || !password) {
      showToast("Please enter your email and password.", "warn");
      return;
    }

    setSubmitState(form, true);

    try {
      const first = await jsonRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          mode: "request_otp",
          email,
          password,
        }),
      });

      if (!first.response.ok) {
        throw new Error(parseApiError(first.body, "Login failed."));
      }

      let loginUser = first.body?.user || null;
      if (first.body.requiresOtp) {
        if (String(first.body?.delivery?.status || "").toLowerCase() === "preview" && first.body.previewOtpCode) {
          showToast("Using development OTP preview because email delivery is unavailable.", "warn", 5000);
        }

        const defaultOtp = String(first.body.previewOtpCode || "").trim();
        const otpInput = window.prompt(
          first.body.maskedEmail
            ? `Enter the 6-digit OTP sent to ${first.body.maskedEmail}`
            : "Enter the 6-digit OTP sent to your email",
          defaultOtp
        );

        const otp = String(otpInput || "")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (otp.length !== 6) {
          throw new Error("OTP is required to complete login.");
        }

        const verify = await jsonRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            mode: "verify_otp",
            challengeToken: String(first.body.challengeToken || ""),
            otp,
          }),
        });

        if (!verify.response.ok) {
          throw new Error(parseApiError(verify.body, "OTP verification failed."));
        }

        loginUser = verify.body?.user || loginUser;
      }

      showToast("Signed in successfully.", "success");
      const user = loginUser;
      if (user && typeof user === "object") {
        state.session = {
          userId: Number(user.id || 0) || null,
          email: String(user.email || ""),
          name: String(user.name || ""),
          expiresAt: Date.now() + 60 * 60 * 1000,
        };
      }
      state.sessionCheckedAt = Date.now();
      await fetchSession(true).catch(() => null);
      const nextPath = resolvePostLoginPath();
      navigateWithTransition(nextPath);
    } catch (error) {
      showToast(String(error?.message || "Unable to sign in."), "error", 5000);
    } finally {
      setSubmitState(form, false);
    }
  }

  function extractTokenFromVerifyLink(link) {
    const value = String(link || "").trim();
    if (!value) return "";
    try {
      const url = new URL(value, window.location.origin);
      const direct = String(url.searchParams.get("token") || "").trim();
      if (direct) return direct;
      const parts = url.pathname.split("/").filter(Boolean);
      return String(parts[parts.length - 1] || "").trim();
    } catch {
      return "";
    }
  }

  async function runSignup(form) {
    const { firstNameInput, lastNameInput, emailInput, passwordInput } = getSignupFields(form);
    const firstName = String(firstNameInput?.value || "").trim();
    const lastName = String(lastNameInput?.value || "").trim();
    const name = `${firstName} ${lastName}`.trim() || firstName || lastName || "User";
    const email = String(emailInput?.value || "").trim();
    const password = String(passwordInput?.value || "");

    if (!email || !password) {
      showToast("Please complete all required fields.", "warn");
      return;
    }

    const termsButton = getSignupTermsButton(form);
    if (termsButton && !isAriaToggleChecked(termsButton)) {
      showToast("Accept the Terms of Service and Privacy Policy to continue.", "warn", 4200);
      return;
    }

    setSubmitState(form, true);

    try {
      const { response, body } = await jsonRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          phone: "",
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(parseApiError(body, "Signup failed."));
      }

      if (body.requiresEmailVerification) {
        const previewLink = String(body.verificationPreviewUrl || "").trim();
        const deliveryStatus = String(body?.verificationDelivery?.status || "").toLowerCase();
        if (previewLink && deliveryStatus === "preview") {
          const token = extractTokenFromVerifyLink(previewLink);
          if (token) {
            const verify = await jsonRequest("/api/auth/verify-email", {
              method: "POST",
              body: JSON.stringify({ token }),
            });
            if (verify.response.ok) {
              showToast("Account created and email verified. Please sign in to continue.", "success", 5000);
              navigateWithTransition("/login?verified=1");
              return;
            }
          }
          showToast("Account created. Open the preview verification link before signing in.", "warn", 6000);
        } else {
          showToast("Account created. Verify your email, then sign in.", "success", 5000);
        }
        navigateWithTransition("/login");
        return;
      }

      showToast("Account created. You are now signed in.", "success");
      await fetchSession(true).catch(() => null);
      navigateWithTransition(resolvePostLoginPath());
    } catch (error) {
      showToast(String(error?.message || "Unable to sign up."), "error", 5000);
    } finally {
      setSubmitState(form, false);
    }
  }

  function syncSignupSubmitGuard(form) {
    if (!(form instanceof HTMLFormElement)) return;
    const submitButton = form.querySelector("button[type='submit']");
    const termsButton = getSignupTermsButton(form);
    if (!(submitButton instanceof HTMLButtonElement) || !(termsButton instanceof Element)) return;

    submitButton.dataset.runtimeTermsRequired = "1";
    const accepted = isAriaToggleChecked(termsButton);
    submitButton.dataset.runtimeTermsAccepted = accepted ? "1" : "0";
    submitButton.classList.toggle("runtime-auth-submit-blocked", !accepted);
    if (!state.submitBusy) {
      submitButton.disabled = !accepted;
    }
    submitButton.title = accepted ? "" : "Accept the Terms of Service and Privacy Policy to continue";

    let note = form.querySelector(".runtime-signup-terms-note");
    if (!(note instanceof HTMLParagraphElement)) {
      note = document.createElement("p");
      note.className = "runtime-signup-terms-note";
      submitButton.insertAdjacentElement("afterend", note);
    }
    note.textContent = accepted
      ? "Everything looks good. You can create your account now."
      : "Accept the Terms of Service and Privacy Policy to enable account creation.";
    note.classList.toggle("ready", accepted);
  }

  function installAuthPageAssist() {
    const path = normalizePath(window.location.pathname);
    const form = document.querySelector("form");
    if (!(form instanceof HTMLFormElement)) return;

    const firstEmptyField = form.querySelector("input:not([type='hidden']):not([type='checkbox']):not([value]), input:not([type='hidden']):not([type='checkbox']), textarea");
    if (firstEmptyField instanceof HTMLInputElement || firstEmptyField instanceof HTMLTextAreaElement) {
      if (document.activeElement === document.body && !firstEmptyField.value) {
        firstEmptyField.focus({ preventScroll: true });
      }
    }

    if (!SIGNUP_PATHS.has(path)) return;

    const termsButton = getSignupTermsButton(form);
    if (!(termsButton instanceof HTMLElement)) return;
    if (!termsButton.dataset.runtimeTermsBound) {
      termsButton.dataset.runtimeTermsBound = "1";
      const sync = () => window.setTimeout(() => syncSignupSubmitGuard(form), 0);
      termsButton.addEventListener("click", sync, true);
      termsButton.addEventListener("keydown", sync, true);
    }
    syncSignupSubmitGuard(form);
  }

  function focusDashboardSectionForRoute() {
    const path = normalizePath(window.location.pathname);
    const sectionId =
      path === "/groups" ? "groups-section" : path === "/activity" || path === "/expenses" ? "activity-section" : "";
    if (!sectionId) {
      state.routeSectionFocusPath = "";
      return;
    }

    const section = document.getElementById(sectionId);
    if (!(section instanceof HTMLElement)) return;
    if (state.routeSectionFocusPath === path) return;
    state.routeSectionFocusPath = path;

    window.requestAnimationFrame(() => {
      section.scrollIntoView({
        block: "start",
        behavior: isReducedMotionPreferred() ? "auto" : "smooth",
      });
    });
  }

  async function guardRoute() {
    if (state.routeGuardBusy) return;

    const currentPath = normalizePath(window.location.pathname);
    const onAuthPage = LOGIN_PATHS.has(currentPath) || SIGNUP_PATHS.has(currentPath);
    const requiresAuth = isProtectedPath(currentPath);
    const guardSignature = `${currentPath}|${window.location.search || ""}`;
    const now = Date.now();

    if (!onAuthPage && !requiresAuth) return;
    if (!requiresAuth && onAuthPage && state.routeGuardLastSignature === guardSignature && now - state.routeGuardLastAt < 2500) {
      return;
    }

    state.routeGuardBusy = true;
    try {
      const session = await fetchSession(false);
      if (requiresAuth && !session) {
        const returnTo = encodeURIComponent(`${currentPath}${window.location.search || ""}${window.location.hash || ""}`);
        navigateWithTransition(`/login?returnTo=${returnTo}`);
        return;
      }
      if (onAuthPage && session) {
        navigateWithTransition(resolvePostLoginPath());
      }
    } finally {
      state.routeGuardLastSignature = guardSignature;
      state.routeGuardLastAt = Date.now();
      state.routeGuardBusy = false;
    }
  }

  function showAuthErrorAlert() {
    const currentPath = normalizePath(window.location.pathname);
    if (!LOGIN_PATHS.has(currentPath) && !SIGNUP_PATHS.has(currentPath)) return;

    const query = new URLSearchParams(window.location.search);
    const errorCode = String(query.get("error") || "").trim();
    if (!errorCode) return;

    const errorMessages = {
      google_not_configured: "Google sign-in is not configured. Add Google OAuth credentials in .env.local.",
      google_rate_limited: "Too many Google sign-in attempts. Please try again in a few minutes.",
      google_access_denied: "Google sign-in was cancelled or denied.",
      google_state_mismatch: "Google sign-in session expired. Please try again.",
      google_invalid_callback: "Google sign-in callback was invalid. Please try again.",
      google_token_exchange_failed: "Google sign-in failed during token exchange. Check redirect URI in Google Console.",
      google_token_missing: "Google sign-in failed because token was missing from Google response.",
      google_userinfo_failed: "Google sign-in failed while loading your profile from Google.",
      google_email_not_verified: "Google account email is not verified. Verify email in your Google account.",
      google_email_missing: "Google sign-in failed because email was not returned by Google.",
      google_auth_failed: "Google sign-in failed. Please try again.",
      google_start_failed: "Unable to start Google sign-in. Please try again.",
    };

    try {
      const lastShown = String(window.sessionStorage.getItem("expense_split_last_auth_error") || "");
      if (lastShown === errorCode) return;
      window.sessionStorage.setItem("expense_split_last_auth_error", errorCode);
    } catch {
      // Ignore storage failures.
    }

    const message = errorMessages[errorCode] || "Sign-in failed. Please try again.";
    showToast(`${message} (${errorCode})`, "error", 6000);
  }

  function findInputByLabel(labelText) {
    const normalizedLabel = normalizedKey(labelText);
    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find((label) => normalizedKey(label.textContent || "").includes(normalizedLabel));
    if (!match) return null;
    const htmlFor = String(match.getAttribute("for") || "").trim();
    if (htmlFor) {
      const byId = document.getElementById(htmlFor);
      if (byId instanceof HTMLInputElement || byId instanceof HTMLTextAreaElement) {
        return byId;
      }
    }
    const wrapper = match.parentElement;
    if (!wrapper) return null;
    return wrapper.querySelector("input, textarea") || null;
  }

  function findSectionByLabel(labelText) {
    const normalizedLabel = normalizedKey(labelText);
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((item) => normalizedKey(item.textContent || "").includes(normalizedLabel));
    if (!label) return null;
    return label.closest("div") || label.parentElement || null;
  }

  function resolveSelectedCreateGroupMembers() {
    const selected = [];
    const contactEmailByName = new Map();

    const contactButtons = Array.from(document.querySelectorAll("button"));
    for (const button of contactButtons) {
      const paragraphs = button.querySelectorAll("p");
      if (paragraphs.length < 2) continue;
      const name = normalizedText(paragraphs[0]?.textContent || "");
      const email = normalizedText(paragraphs[1]?.textContent || "");
      if (!name || !email.includes("@")) continue;
      contactEmailByName.set(normalizedKey(name), email);
    }

    const selectedCounter = Array.from(document.querySelectorAll("p")).find((item) =>
      /member/i.test(item.textContent || "") && /selected/i.test(item.textContent || "")
    );
    const selectedRoot = selectedCounter?.parentElement || null;
    if (!selectedRoot) return selected;

    const chips = Array.from(selectedRoot.querySelectorAll("div"));
    for (const chip of chips) {
      const nameNode = chip.querySelector("span");
      const name = normalizedText(nameNode?.textContent || "");
      if (!name) continue;
      if (normalizedKey(name) === "you") continue;
      const key = normalizedKey(name);
      if (selected.some((item) => normalizedKey(item.name) === key)) continue;
      selected.push({
        name,
        email: String(contactEmailByName.get(key) || ""),
      });
    }

    return selected;
  }

  async function submitCreateGroup(button) {
    const actionKey = "create-group";
    if (state.actionBusy.has(actionKey)) return;

    const nameInput = findInputByLabel("Group Name") || document.querySelector("#groupName");
    const descriptionInput = findInputByLabel("Description") || document.querySelector("textarea#description");
    const name = normalizedText(nameInput?.value || "");
    const description = normalizedText(descriptionInput?.value || "");

    if (!name) {
      showToast("Group name is required.", "warn");
      return;
    }

    state.actionBusy.add(actionKey);
    const restoreButton = setButtonBusy(button, true, "Creating...");

    try {
      const create = await jsonRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          currency: "INR",
        }),
      });

      if (!create.response.ok) {
        throw new Error(parseApiError(create.body, "Could not create group."));
      }

      const group = create.body?.group;
      const groupId = Number(group?.id || 0);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        throw new Error("Group created but response was incomplete.");
      }

      const selectedMembers = resolveSelectedCreateGroupMembers();
      if (selectedMembers.length) {
        await Promise.all(
          selectedMembers.map(async (member) => {
            try {
              await jsonRequest(`/api/groups/${groupId}/members`, {
                method: "POST",
                body: JSON.stringify({
                  name: member.name,
                  email: member.email || "",
                  phone: "",
                  upiId: "",
                }),
              });
            } catch {
              // Ignore per-member failures to avoid blocking group creation.
            }
          })
        );
      }

      mergeOnboardingProgress({
        create_group: true,
        invite_member: selectedMembers.length > 0,
      });
      showToast(`Group "${name}" created successfully.`, "success");
      window.setTimeout(() => {
        navigateWithTransition(`/group/${groupId}`);
      }, 120);
    } catch (error) {
      showToast(String(error?.message || "Unable to create group."), "error", 5000);
    } finally {
      restoreButton();
      state.actionBusy.delete(actionKey);
      state.groupsCheckedAt = 0;
    }
  }

  function normalizeCategory(value) {
    const text = normalizedKey(value);
    if (!text) return "Misc";
    if (text.includes("food")) return "Food";
    if (text.includes("transport")) return "Transport";
    if (text.includes("travel")) return "Travel";
    if (text.includes("rent")) return "Rent";
    if (text.includes("util")) return "Utilities";
    if (text.includes("shop")) return "Shopping";
    if (text.includes("entertain")) return "Entertainment";
    if (text.includes("health")) return "Health";
    return "Misc";
  }

  function dataUrlToProof(dataUrl) {
    const value = String(dataUrl || "").trim();
    const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) return null;
    const mimeType = String(match[1] || "").trim().toLowerCase();
    const base64 = String(match[2] || "").trim();
    if (!base64) return null;

    let ext = "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = "jpg";
    if (mimeType.includes("webp")) ext = "webp";

    return {
      name: `receipt-${Date.now()}.${ext}`,
      type: mimeType,
      base64,
    };
  }

  function resolveSelectedGroupCardName() {
    const buttons = Array.from(document.querySelectorAll("button"));
    const selected = buttons.find((button) => {
      const cls = String(button.className || "");
      if (!cls.includes("border-splitwise-green") || !cls.includes("bg-splitwise-light-green")) return false;
      return /members/i.test(button.textContent || "");
    });

    if (!selected) return "";
    const nameNode = selected.querySelector("p");
    return normalizedText(nameNode?.textContent || "");
  }

  function resolveSelectedPayerName() {
    const paidBySection = findSectionByLabel("Paid by");
    if (!paidBySection) return "";

    const selectedButton = Array.from(paidBySection.querySelectorAll("button")).find((button) =>
      String(button.className || "").includes("bg-splitwise-green")
    );
    return normalizedText(selectedButton?.textContent || "");
  }

  function resolveSelectedParticipantNames() {
    const splitSection = findSectionByLabel("Split between");
    if (!splitSection) return [];

    const selectedRows = Array.from(splitSection.querySelectorAll("button")).filter((button) =>
      String(button.className || "").includes("bg-splitwise-light-green")
    );

    const names = [];
    for (const row of selectedRows) {
      const nameNode = row.querySelector("p") || row.querySelector("span");
      const value = normalizedText(nameNode?.textContent || "");
      if (!value) continue;
      if (!names.some((item) => normalizedKey(item) === normalizedKey(value))) {
        names.push(value);
      }
    }

    return names;
  }

  async function submitCreateExpense(button) {
    const actionKey = "create-expense";
    if (state.actionBusy.has(actionKey)) return;

    const descriptionInput = document.querySelector("input#description") || findInputByLabel("Description");
    const amountInput = document.querySelector("input#amount") || findInputByLabel("Amount");
    const dateInput = document.querySelector("input#date") || findInputByLabel("Date");
    const notesInput = document.querySelector("textarea#notes") || findInputByLabel("Notes");

    const title = normalizedText(descriptionInput?.value || "");
    const amount = parseAmount(amountInput?.value || "");
    const expenseDate = normalizedText(dateInput?.value || "");
    const notes = normalizedText(notesInput?.value || "");

    if (!title || !(amount > 0)) {
      showToast("Please enter a valid description and amount.", "warn");
      return;
    }

    state.actionBusy.add(actionKey);
    const restoreButton = setButtonBusy(button, true, "Saving...");

    try {
      const [groups, session] = await Promise.all([fetchGroups(true), fetchSession(false)]);
      if (!Array.isArray(groups) || groups.length === 0) {
        showToast("Create a group first before adding expenses.", "warn", 5000);
        navigateWithTransition("/create-group");
        return;
      }

      const selectedGroupName = resolveSelectedGroupCardName();
      const selectedGroupKey = normalizedKey(selectedGroupName);

      let group = groups.find((item) => normalizedKey(item?.name || "") === selectedGroupKey) || null;
      if (!group && selectedGroupKey) {
        group = groups.find((item) => normalizedKey(item?.name || "").includes(selectedGroupKey));
      }
      if (!group) {
        group = groups[0];
      }

      const groupId = Number(group?.id || 0);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        throw new Error("No valid group found for this expense.");
      }

      const groupDetail = await fetchGroupDetail(groupId, true);
      const members = Array.isArray(groupDetail?.members) ? groupDetail.members : [];
      if (!members.length) {
        throw new Error("This group has no members yet.");
      }

      const payerName = resolveSelectedPayerName();
      const payerKey = normalizedKey(payerName);
      let payer = null;

      if (payerKey === "you" || payerKey.includes("you")) {
        const sessionUserId = Number(session?.userId || 0);
        payer = members.find((member) => Number(member.userId || 0) === sessionUserId) || null;
      }
      if (!payer && payerKey) {
        payer = members.find((member) => normalizedKey(member?.name || "") === payerKey) || null;
      }
      if (!payer) {
        payer = members[0];
      }

      const selectedParticipantNames = resolveSelectedParticipantNames();
      const participantIds = new Set();
      for (const name of selectedParticipantNames) {
        const key = normalizedKey(name);
        const member = members.find((item) => normalizedKey(item?.name || "") === key);
        if (member) {
          participantIds.add(Number(member.id));
        }
      }
      if (!participantIds.size) {
        for (const member of members) {
          participantIds.add(Number(member.id));
        }
      }
      participantIds.add(Number(payer.id));

      const categoryTrigger = Array.from(document.querySelectorAll("button")).find((item) => {
        const text = normalizedKey(item.textContent || "");
        return text.includes("food") || text.includes("transport") || text.includes("shopping") || text.includes("other");
      });
      const category = normalizeCategory(categoryTrigger?.textContent || "");

      const receiptImage = document.querySelector("img[alt='Receipt'][src^='data:']");
      const proof = dataUrlToProof(receiptImage?.getAttribute("src") || "");

      const payload = {
        groupId,
        title,
        amount,
        payerMemberId: Number(payer.id),
        participants: Array.from(participantIds).filter((id) => Number.isFinite(id) && id > 0),
        splitMode: "equal",
        splitConfig: null,
        category,
        expenseDate,
        notes,
        recurring: {
          enabled: false,
          dayOfMonth: 1,
        },
        proof,
      };

      const requestCreateExpense = async (nextPayload) =>
        jsonRequest("/api/expenses", {
          method: "POST",
          body: JSON.stringify(nextPayload),
        });

      let create = await requestCreateExpense(payload);
      let addedViaDuplicateOverride = false;

      if (!create.response.ok) {
        if (isDuplicateExpenseConflict(create.response, create.body)) {
          const duplicate = create.body?.duplicate && typeof create.body.duplicate === "object"
            ? create.body.duplicate
            : null;
          const duplicateTitle = normalizedText(duplicate?.title || "a similar expense");
          const duplicateAmount = Number(duplicate?.amount || 0);
          const duplicateDate = normalizedText(duplicate?.expenseDate || duplicate?.createdAt || "");
          const duplicateHintParts = [
            duplicateTitle ? `"${duplicateTitle}"` : "",
            duplicateAmount > 0 ? `amount ${duplicateAmount.toFixed(2)}` : "",
            duplicateDate ? `date ${duplicateDate}` : "",
          ].filter(Boolean);
          const duplicateHint = duplicateHintParts.length ? duplicateHintParts.join(" • ") : "a similar entry";
          const confirmed = window.confirm(
            `Possible duplicate found (${duplicateHint}). Do you want to add this expense anyway?`
          );

          if (!confirmed) {
            showToast("Expense was not added.", "info", 3200);
            return;
          }

          create = await requestCreateExpense({
            ...payload,
            allowDuplicate: true,
          });
          if (!create.response.ok) {
            throw new Error(parseApiError(create.body, "Could not add expense."));
          }
          addedViaDuplicateOverride = true;
        } else {
          throw new Error(parseApiError(create.body, "Could not add expense."));
        }
      }

      mergeOnboardingProgress({ add_expense: true });
      showToast(
        addedViaDuplicateOverride ? "Duplicate confirmed. Expense added." : "Expense added successfully.",
        "success",
        3600
      );
      window.setTimeout(() => {
        navigateWithTransition(`/group/${groupId}`);
      }, 120);
    } catch (error) {
      showToast(String(error?.message || "Unable to add expense."), "error", 6000);
    } finally {
      restoreButton();
      state.actionBusy.delete(actionKey);
      state.groupsCheckedAt = 0;
    }
  }

  function resolveSettlementIntentFromUi() {
    const detailsCard = Array.from(document.querySelectorAll("div")).find((item) => {
      const cls = String(item.className || "");
      return cls.includes("bg-gray-50") && cls.includes("rounded-xl") && /Amount/i.test(item.textContent || "") && /To/i.test(item.textContent || "");
    });

    if (!detailsCard) return { toName: "", amount: 0, method: "" };

    let amount = 0;
    let toName = "";
    let method = "";

    const rows = Array.from(detailsCard.querySelectorAll("div")).filter((item) => {
      const cls = String(item.className || "");
      return cls.includes("justify-between");
    });

    for (const row of rows) {
      const spans = row.querySelectorAll("span");
      if (spans.length < 2) continue;
      const key = normalizedKey(spans[0]?.textContent || "");
      const value = normalizedText(spans[1]?.textContent || "");
      if (!key) continue;
      if (key.includes("amount") || key.includes("total")) {
        amount = parseAmountFromText(value);
      }
      if (key === "to") {
        toName = value;
      }
      if (key.includes("payment method")) {
        method = value;
      }
    }

    return { toName, amount, method };
  }

  function paymentProviderLabel(provider) {
    const key = normalizedKey(provider || "");
    if (key === "paypal") return "PayPal";
    if (key === "stripe") return "Stripe";
    if (key === "razorpay") return "Razorpay";
    return normalizedText(provider || "Payment");
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
    });
  }

  async function ensureScriptLoaded(src, markerAttr) {
    const source = String(src || "").trim();
    if (!source) return false;

    const attr = String(markerAttr || "data-runtime-script");
    const existing = document.querySelector(`script[${attr}="${source}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") return true;
      return new Promise((resolve) => {
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
      });
    }

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.setAttribute(attr, source);
      script.addEventListener("load", () => {
        script.dataset.loaded = "1";
        resolve(true);
      });
      script.addEventListener("error", () => resolve(false));
      document.head.appendChild(script);
    });
  }

  async function resolvePendingSettlementMatch(intentOverride = null) {
    const [groups, session] = await Promise.all([fetchGroups(true), fetchSession(false)]);
    if (!Array.isArray(groups) || !groups.length || !session) return null;

    const intent =
      intentOverride && typeof intentOverride === "object"
        ? intentOverride
        : resolveSettlementIntentFromUi();
    const expectedToName = normalizedKey(intent.toName);
    const expectedAmount = Number(intent.amount || 0);

    let selected = null;
    for (const group of groups) {
      const detail = await fetchGroupDetail(group.id, true).catch(() => null);
      if (!detail?.summary?.settlements?.length) continue;

      for (const settlement of detail.summary.settlements) {
        const fromMember = (detail.members || []).find(
          (member) => Number(member.id) === Number(settlement.fromMemberId)
        );
        const toMember = (detail.members || []).find(
          (member) => Number(member.id) === Number(settlement.toMemberId)
        );
        const fromUserId = Number(fromMember?.userId || 0);
        const fromIsSession =
          fromUserId > 0 &&
          Number(session?.userId || 0) > 0 &&
          fromUserId === Number(session.userId);

        const nameMatch = expectedToName
          ? normalizedKey(settlement.toName || "") === expectedToName
          : true;
        const amountMatch =
          expectedAmount > 0
            ? Math.abs(Number(settlement.amount || 0) - expectedAmount) <= 0.5
            : true;

        if (fromIsSession && nameMatch && amountMatch) {
          selected = {
            groupId: Number(group.id),
            groupName: String(detail.name || group.name || ""),
            groupCurrency: String(detail.currency || group.currency || "INR"),
            settlement,
            payeeMemberId: Number(toMember?.id || settlement.toMemberId || 0),
            payeeName: normalizedText(toMember?.name || settlement.toName || "Member"),
            payeeUpiId: normalizeUpiId(toMember?.upiId || ""),
          };
          break;
        }

        if (!selected && fromIsSession) {
          selected = {
            groupId: Number(group.id),
            groupName: String(detail.name || group.name || ""),
            groupCurrency: String(detail.currency || group.currency || "INR"),
            settlement,
            payeeMemberId: Number(toMember?.id || settlement.toMemberId || 0),
            payeeName: normalizedText(toMember?.name || settlement.toName || "Member"),
            payeeUpiId: normalizeUpiId(toMember?.upiId || ""),
          };
        }
      }

      if (selected && expectedToName && expectedAmount > 0) break;
    }

    if (!selected) return null;
    return { selected, intent };
  }

  function isDirectUpiIntent(intent) {
    const method = normalizedKey(intent?.method || "");
    if (!method) return false;
    return (
      method.includes("upi") ||
      method.includes("gpay") ||
      method.includes("google pay") ||
      method.includes("phonepe") ||
      method.includes("paytm") ||
      method.includes("bhim")
    );
  }

  function buildUpiDeepLink({ upiId, payeeName, amount, note, ref } = {}) {
    const account = normalizeUpiId(upiId);
    if (!isValidUpiId(account)) return "";

    const amountValue = Number(amount || 0);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return "";

    const params = new URLSearchParams();
    params.set("pa", account);
    if (payeeName) params.set("pn", normalizedText(payeeName).slice(0, 60));
    params.set("am", amountValue.toFixed(2));
    params.set("cu", "INR");
    if (note) params.set("tn", normalizedText(note).slice(0, 120));
    if (ref) params.set("tr", normalizedText(ref).slice(0, 40));
    return `upi://pay?${params.toString()}`;
  }

  async function resolvePayeeUpiForSettlement(selected) {
    const cached = normalizeUpiId(selected?.payeeUpiId || "");
    if (isValidUpiId(cached)) return cached;

    const entered = await openRuntimeInputModal({
      title: "Recipient UPI ID Required",
      subtitle: `Add UPI ID for ${selected?.payeeName || "recipient"} to send direct payment request.`,
      placeholder: "name@okaxis",
      initialValue: "",
    });
    if (entered === null) return "";

    const nextUpi = normalizeUpiId(entered);
    if (!isValidUpiId(nextUpi)) {
      showToast("Invalid UPI ID format. Use format like name@bank.", "error", 4500);
      return "";
    }

    selected.payeeUpiId = nextUpi;

    const groupId = Number(selected?.groupId || 0);
    const memberId = Number(selected?.payeeMemberId || 0);
    if (groupId > 0 && memberId > 0) {
      try {
        await jsonRequest(`/api/groups/${groupId}/members/${memberId}`, {
          method: "PATCH",
          body: JSON.stringify({ upiId: nextUpi }),
        });
      } catch {
        // Persist failure should not block direct UPI launch.
      }
    }

    return nextUpi;
  }

  function triggerUpiAppLaunch(uri) {
    const link = String(uri || "").trim();
    if (!link) return false;

    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = link;
      document.body.appendChild(iframe);
      window.setTimeout(() => {
        iframe.remove();
      }, 1400);
    } catch {
      // Ignore iframe launch failures.
    }

    try {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    } catch {
      return false;
    }
  }

  async function handleDirectUpiSettlementFlow(selected, intent) {
    if (normalizedKey(selected?.groupCurrency || "inr") !== "inr") {
      showToast("Direct UPI app launch currently supports INR settlements only.", "warn", 5000);
      return null;
    }

    const upiId = await resolvePayeeUpiForSettlement(selected);
    if (!upiId) return null;

    const amount = Number(selected?.settlement?.amount || 0);
    const referenceId = `upi-${Date.now()}`;
    const note = `${selected?.groupName || "Expense Split"} settlement`;
    const uri = buildUpiDeepLink({
      upiId,
      payeeName: selected?.payeeName || selected?.settlement?.toName || "",
      amount,
      note,
      ref: referenceId,
    });
    if (!uri) {
      throw new Error("Could not build a valid UPI payment request.");
    }

    const launched = triggerUpiAppLaunch(uri);
    if (!launched) {
      throw new Error("Could not open UPI app. Please ensure a UPI app is installed.");
    }

    return {
      provider: "upi",
      referenceId,
      method: `UPI (${upiId})`,
    };
  }

  function buildSettlementNote(intent, selected, verification = null) {
    const preferredMethod = normalizedText(
      verification?.method || intent?.method || paymentProviderLabel(verification?.provider || "")
    );
    const groupName = normalizedText(selected?.groupName || "");
    const reference = normalizedText(verification?.referenceId || "");

    let note = preferredMethod ? `Paid via ${preferredMethod}` : "Paid from web app";
    if (groupName) {
      note += ` (${groupName})`;
    }
    if (reference) {
      note += ` • Ref ${reference}`;
    }
    return note.slice(0, 950);
  }

  async function saveSettlementPaymentRecord(selected, intent, verification = null) {
    const payload = {
      fromMemberId: Number(selected?.settlement?.fromMemberId || 0),
      toMemberId: Number(selected?.settlement?.toMemberId || 0),
      amount: Number(selected?.settlement?.amount || 0),
      note: buildSettlementNote(intent, selected, verification),
      paymentProvider: normalizedText(verification?.provider || ""),
      providerReference: normalizedText(verification?.referenceId || ""),
      verificationStatus: verification ? "verified" : "manual",
    };

    const save = await jsonRequest(`/api/groups/${selected.groupId}/settlements/payments`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!save.response.ok) {
      throw new Error(parseApiError(save.body, "Could not save settlement payment."));
    }

    mergeOnboardingProgress({ settle_up: true });
    state.groupsCheckedAt = 0;
    state.groupDetails.delete(String(selected.groupId));
    return save.body;
  }

  async function startIntegratedPaymentCheckout(selected, intent, provider) {
    const payload = {
      groupId: Number(selected.groupId),
      fromMemberId: Number(selected.settlement.fromMemberId),
      toMemberId: Number(selected.settlement.toMemberId),
      amount: Number(selected.settlement.amount || 0),
      currency: String(selected.groupCurrency || "INR"),
      provider,
      method: normalizedText(intent.method || paymentProviderLabel(provider)),
      returnUrl: `${window.location.pathname}${window.location.search || ""}`,
    };

    const checkout = await jsonRequest("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!checkout.response.ok) {
      throw new Error(parseApiError(checkout.body, "Could not start payment checkout."));
    }

    const details = checkout.body?.checkout;
    if (!details?.referenceId) {
      throw new Error("Payment checkout was created without a reference id.");
    }
    return details;
  }

  async function verifyIntegratedPaymentOnce(selected, intent, provider, checkout, extraPayload = {}) {
    const payload = {
      groupId: Number(selected.groupId),
      fromMemberId: Number(selected.settlement.fromMemberId),
      toMemberId: Number(selected.settlement.toMemberId),
      amount: Number(selected.settlement.amount || 0),
      currency: String(selected.groupCurrency || "INR"),
      provider,
      referenceId: normalizedText(checkout.referenceId || checkout.orderId || checkout.sessionId || ""),
      method: normalizedText(intent.method || paymentProviderLabel(provider)),
      ...extraPayload,
    };

    const verify = await jsonRequest("/api/payments/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (verify.response.ok && verify.body?.verified) {
      return {
        done: true,
        verification: verify.body.verification || null,
      };
    }

    const pending = verify.response.status === 409 && Boolean(verify.body?.retryable);
    if (pending) {
      return {
        done: false,
        pending: true,
      };
    }

    throw new Error(parseApiError(verify.body, "Payment verification failed."));
  }

  async function waitForRedirectProviderVerification(selected, intent, provider, checkout, popupWindow = null) {
    const startMs = Date.now();
    const timeoutMs = 180_000;
    let popupClosedAt = 0;

    while (Date.now() - startMs <= timeoutMs) {
      const result = await verifyIntegratedPaymentOnce(selected, intent, provider, checkout);
      if (result.done) {
        return result.verification;
      }

      if (popupWindow) {
        if (popupWindow.closed && popupClosedAt === 0) {
          popupClosedAt = Date.now();
        }
        if (popupClosedAt > 0 && Date.now() - popupClosedAt > 12_000) {
          throw new Error("Payment window was closed before verification completed.");
        }
      }

      await sleep(2500);
    }

    throw new Error("Payment confirmation timed out. Please retry verification in a few moments.");
  }

  async function completeRazorpayPayment(selected, intent, checkout) {
    const loaded = await ensureScriptLoaded(
      "https://checkout.razorpay.com/v1/checkout.js",
      "data-runtime-gateway"
    );
    if (!loaded || typeof window.Razorpay !== "function") {
      throw new Error("Could not load Razorpay checkout.");
    }

    const paymentData = await new Promise((resolve, reject) => {
      const options = {
        key: String(checkout.keyId || ""),
        amount: Number(checkout.amountMinor || 0),
        currency: String(checkout.currency || selected.groupCurrency || "INR"),
        name: selected.groupName || "Expense Split",
        description: `Settlement to ${selected.settlement?.toName || intent.toName || "group member"}`,
        order_id: String(checkout.orderId || checkout.referenceId || ""),
        theme: {
          color: "#10b981",
        },
        handler: (response) => {
          resolve(response || {});
        },
        modal: {
          ondismiss: () => reject(new Error("Payment was cancelled.")),
        },
      };

      try {
        const instance = new window.Razorpay(options);
        instance.on("payment.failed", (event) => {
          const reason = normalizedText(event?.error?.description || "");
          reject(new Error(reason || "Razorpay payment failed."));
        });
        instance.open();
      } catch {
        reject(new Error("Could not initialize Razorpay checkout."));
      }
    });

    const verificationResult = await verifyIntegratedPaymentOnce(selected, intent, "razorpay", checkout, {
      razorpay: {
        orderId: String(paymentData.razorpay_order_id || checkout.orderId || checkout.referenceId || ""),
        paymentId: String(paymentData.razorpay_payment_id || ""),
        signature: String(paymentData.razorpay_signature || ""),
      },
      referenceId: String(paymentData.razorpay_payment_id || checkout.referenceId || ""),
    });

    if (!verificationResult.done) {
      throw new Error("Razorpay payment is still pending verification.");
    }
    return verificationResult.verification;
  }

  async function completeIntegratedPayment(selected, intent, provider) {
    const checkout = await startIntegratedPaymentCheckout(selected, intent, provider);

    if (provider === "razorpay") {
      return await completeRazorpayPayment(selected, intent, checkout);
    }

    const checkoutUrl = normalizedText(checkout.checkoutUrl || "");
    if (!checkoutUrl) {
      throw new Error(`${paymentProviderLabel(provider)} checkout URL is missing.`);
    }

    const popup = window.open(checkoutUrl, "_blank", "noopener,noreferrer,width=520,height=760");
    if (!popup) {
      throw new Error("Popup blocked. Please allow popups to continue secure payment.");
    }

    showToast(
      `Complete payment in ${paymentProviderLabel(provider)}. We will verify and save automatically.`,
      "info",
      6000
    );

    const verification = await waitForRedirectProviderVerification(
      selected,
      intent,
      provider,
      checkout,
      popup
    );

    try {
      if (!popup.closed) {
        popup.close();
      }
    } catch {
      // Ignore popup-close failures.
    }
    return verification;
  }

  async function submitSettlementPaymentFromUi(intentOverride = null, options = {}) {
    const actionKey = "settlement-payment";
    if (state.actionBusy.has(actionKey)) return;
    state.actionBusy.add(actionKey);

    try {
      const matched = await resolvePendingSettlementMatch(intentOverride);
      if (!matched?.selected) {
        showToast("No matching pending settlement found in your groups.", "warn", 5000);
        return;
      }

      const selected = matched.selected;
      const intent = matched.intent;
      if (isDirectUpiIntent(intent)) {
        const upiVerification = await handleDirectUpiSettlementFlow(selected, intent);
        if (!upiVerification) return;
        await saveSettlementPaymentRecord(selected, intent, upiVerification);
        showToast("UPI payment request opened in your app. Settlement marked from web.", "success", 5200);
        return;
      }

      const provider = resolveIntegratedPaymentProvider(intent, selected.groupCurrency);
      let verification = null;

      if (provider) {
        try {
          verification = await completeIntegratedPayment(selected, intent, provider);
          showToast(`${paymentProviderLabel(provider)} payment verified. Saving settlement...`, "success", 5000);
        } catch (error) {
          const message = String(error?.message || "");
          const notConfigured = message.toLowerCase().includes("not configured");
          if (!notConfigured) throw error;

          showToast(
            `${paymentProviderLabel(provider)} is not configured. Falling back to manual payment confirmation.`,
            "warn",
            6000
          );
          launchPaymentMethodFlow(intent);
        }
      } else {
        if (!options.manualLaunchHandled) {
          launchPaymentMethodFlow(intent);
        }
      }

      await saveSettlementPaymentRecord(selected, intent, verification);
      flashSuccessState(findSettleMainContainer() || document.querySelector("main"));
      showToast("Settlement payment saved.", "success");
    } catch (error) {
      showToast(String(error?.message || "Unable to save settlement."), "error", 6000);
    } finally {
      state.actionBusy.delete(actionKey);
    }
  }

  async function submitProfileSave() {
    const actionKey = "profile-save";
    if (state.actionBusy.has(actionKey)) return;
    state.actionBusy.add(actionKey);

    try {
      const firstNameInput = findInputByLabel("First Name");
      const lastNameInput = findInputByLabel("Last Name");
      const emailInput = findInputByLabel("Email");
      const phoneInput = findInputByLabel("Phone");

      const firstName = normalizedText(firstNameInput?.value || "");
      const lastName = normalizedText(lastNameInput?.value || "");
      const name = `${firstName} ${lastName}`.trim();
      const email = normalizedText(emailInput?.value || "");
      const phone = normalizedText(phoneInput?.value || "");

      const payload = {
        name,
        email,
        phone,
      };
      if (state.profileAvatarDirty) {
        payload.avatarUrl = sanitizeAvatarUrl(state.profileAvatarUrl || "");
      }

      const save = await jsonRequest("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (!save.response.ok) {
        throw new Error(parseApiError(save.body, "Could not save profile."));
      }

      if (save.body?.user && typeof save.body.user === "object") {
        state.session = {
          ...(state.session && typeof state.session === "object" ? state.session : {}),
          ...save.body.user,
        };
        state.profileAvatarUrl = sanitizeAvatarUrl(save.body.user.avatarUrl || "");
        state.profileAvatarKnown = true;
        state.profileAvatarDirty = false;
        syncProfileAvatarUi(state.profileAvatarUrl, state.session);
      }

      flashSuccessState(firstNameInput?.closest("div.bg-white.rounded-2xl") || emailInput?.closest("div.bg-white.rounded-2xl"));
      showToast("Profile updated.", "success");
      state.sessionCheckedAt = 0;
      await hydrateSessionDisplay();
    } catch (error) {
      showToast(String(error?.message || "Unable to save profile."), "error", 5000);
    } finally {
      state.actionBusy.delete(actionKey);
    }
  }

  async function hydrateSessionDisplay() {
    const path = normalizePath(window.location.pathname);
    if (!isProtectedPath(path)) return;

    const session = await fetchSession(false);
    if (!session) return;

    const sidebars = Array.from(document.querySelectorAll("aside"));
    for (const sidebar of sidebars) {
      const emailNode = sidebar.querySelector("p.text-xs");
      const nameNode = sidebar.querySelector("p.font-medium");
      if (emailNode && session.email) {
        emailNode.textContent = session.email;
      }
      if (nameNode && session.name) {
        nameNode.textContent = session.name;
      }
    }

    syncProfileAvatarUi(sanitizeAvatarUrl(session.avatarUrl || ""), session);
  }

  function summarizeUserNet(groupDetail, sessionUserId) {
    const members = Array.isArray(groupDetail?.members) ? groupDetail.members : [];
    const balances = Array.isArray(groupDetail?.summary?.balances) ? groupDetail.summary.balances : [];
    if (!members.length || !balances.length) return 0;

    const memberIds = new Set(
      members
        .filter((member) => Number(member.userId || 0) === Number(sessionUserId || 0))
        .map((member) => Number(member.id))
    );

    if (!memberIds.size) return 0;

    let net = 0;
    for (const entry of balances) {
      if (memberIds.has(Number(entry.memberId))) {
        net += Number(entry.net || 0);
      }
    }
    return net;
  }

  function resolveLatestActivityFromGroup(groupDetail) {
    const activity = Array.isArray(groupDetail?.activityLogs) ? groupDetail.activityLogs : [];
    if (activity.length) {
      return activity[0]?.createdAt || "";
    }
    const expenses = Array.isArray(groupDetail?.expenses) ? groupDetail.expenses : [];
    if (expenses.length) {
      return expenses[0]?.createdAt || expenses[0]?.expenseDate || "";
    }
    return String(groupDetail?.createdAt || "");
  }

  function getDashboardSectionListRoot(titleText) {
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (item) => normalizedKey(item.textContent || "") === normalizedKey(titleText)
    );
    return heading?.closest("div.bg-white.rounded-2xl")?.querySelector(".divide-y") || null;
  }

  function showDashboardLoadingState() {
    const groupsRoot = getDashboardSectionListRoot("your groups");
    const activityRoot = getDashboardSectionListRoot("recent activity");

    if (groupsRoot instanceof HTMLElement) {
      if (!groupsRoot._runtimeTemplate) {
        const template = groupsRoot.querySelector("a");
        if (template) {
          groupsRoot._runtimeTemplate = template.cloneNode(true);
        }
      }
      renderSkeletonList(groupsRoot, 3, { showAvatar: true });
    }
    if (activityRoot instanceof HTMLElement) {
      if (!activityRoot._runtimeTemplate) {
        const template = activityRoot.firstElementChild;
        if (template) {
          activityRoot._runtimeTemplate = template.cloneNode(true);
        }
      }
      renderSkeletonList(activityRoot, 4, { showAvatar: true, compact: true });
    }

    const metricValues = Array.from(document.querySelectorAll("div.bg-white.rounded-2xl.p-6.shadow-card p.text-3xl"));
    for (const valueNode of metricValues) {
      valueNode.classList.add("runtime-loading-copy");
      valueNode.textContent = "Loading";
    }
  }

  function updateDashboardCards(totalOwe, totalOwed, groupCount) {
    const cards = Array.from(document.querySelectorAll("div.bg-white.rounded-2xl.p-6.shadow-card"));
    for (const card of cards) {
      const text = normalizedKey(card.textContent || "");
      const valueNode = card.querySelector("p.text-3xl");
      const helperNode = Array.from(card.querySelectorAll("p")).find((p) => normalizedKey(p.textContent || "").includes("groups") || normalizedKey(p.textContent || "").includes("balance"));

      if (text.includes("you owe") && valueNode) {
        valueNode.classList.remove("runtime-loading-copy");
        animateTextValue(valueNode, formatMoney(totalOwe));
        if (helperNode) helperNode.textContent = `Across ${groupCount} group${groupCount === 1 ? "" : "s"}`;
      } else if (text.includes("you are owed") && valueNode) {
        valueNode.classList.remove("runtime-loading-copy");
        animateTextValue(valueNode, formatMoney(totalOwed));
        if (helperNode) helperNode.textContent = `From ${groupCount} group${groupCount === 1 ? "" : "s"}`;
      } else if (text.includes("net balance") && valueNode) {
        const net = totalOwed - totalOwe;
        valueNode.classList.remove("runtime-loading-copy");
        animateTextValue(valueNode, `${net >= 0 ? "" : "-"}${formatMoney(net)}`);
        valueNode.classList.remove("text-green-500", "text-red-500");
        valueNode.classList.add(net >= 0 ? "text-green-500" : "text-red-500");
      }
    }
  }

  function updateGroupsList(groupsData) {
    const heading = Array.from(document.querySelectorAll("h2")).find((item) => normalizedKey(item.textContent || "") === "your groups");
    if (!heading) return;
    heading.id = "groups-section";

    const card = heading.closest("div.bg-white.rounded-2xl");
    if (!card) return;

    const listRoot = card.querySelector(".divide-y");
    if (!listRoot) return;

    if (!listRoot._runtimeTemplate) {
      const existingTemplate = listRoot.querySelector("a");
      if (existingTemplate) {
        listRoot._runtimeTemplate = existingTemplate.cloneNode(true);
      }
    }

    const template = listRoot._runtimeTemplate ? listRoot._runtimeTemplate.cloneNode(true) : null;
    if (!template) return;

    listRoot.innerHTML = "";
    listRoot.classList.remove("runtime-skeleton-list");

    if (!groupsData.length) {
      renderNoGroupsShowcaseState(listRoot);
      return;
    }
    listRoot.classList.remove("runtime-groups-empty-list");
    listRoot.style.removeProperty("--runtime-empty-edge-pad");

    groupsData.forEach((item, index) => {
      const row = template.cloneNode(true);
      row.setAttribute("href", `/group/${item.id}`);

      const iconNode = row.querySelector("div.text-2xl");
      if (iconNode) {
        iconNode.textContent = mapGroupIcon(item.name, index);
      }

      const nameNode = row.querySelector("h3");
      if (nameNode) {
        nameNode.textContent = item.name;
      }

      const metaNode = Array.from(row.querySelectorAll("p")).find((p) => normalizedKey(p.textContent || "").includes("members"));
      if (metaNode) {
        metaNode.textContent = `${item.memberCount} members • ${item.expenseCount} expenses`;
      }

      const balanceNode = Array.from(row.querySelectorAll("p")).find((p) => String(p.className || "").includes("font-semibold"));
      if (balanceNode) {
        const value = Number(item.userNet || 0);
        balanceNode.classList.remove("text-green-500", "text-red-500", "text-gray-500");
        if (Math.abs(value) < 0.01) {
          balanceNode.textContent = "Settled up";
          balanceNode.classList.add("text-gray-500");
        } else if (value > 0) {
          balanceNode.textContent = `+${formatMoney(value)}`;
          balanceNode.classList.add("text-green-500");
        } else {
          balanceNode.textContent = formatMoney(value);
          balanceNode.classList.add("text-red-500");
        }
      }

      const activityNode = Array.from(row.querySelectorAll("p")).find((p) => String(p.className || "").includes("text-xs"));
      if (activityNode) {
        activityNode.textContent = relativeTime(item.lastActivityAt);
      }

      listRoot.appendChild(row);
    });
  }

  function buildRecentActivityEntries(groupDetails, session) {
    const entries = [];

    for (const detail of groupDetails) {
      if (!detail) continue;
      const members = Array.isArray(detail.members) ? detail.members : [];
      const memberByUserId = new Map();
      for (const member of members) {
        const userId = Number(member.userId || 0);
        if (userId > 0 && !memberByUserId.has(userId)) {
          memberByUserId.set(userId, member);
        }
      }

      const logs = Array.isArray(detail.activityLogs) ? detail.activityLogs : [];
      for (const log of logs) {
        const creatorUserId = Number(log.createdByUserId || 0);
        const creatorMember = memberByUserId.get(creatorUserId) || null;
        const actor = creatorUserId > 0 && Number(session?.userId || 0) === creatorUserId
          ? "You"
          : normalizedText(creatorMember?.name || "A member");
        const rawMessage = normalizedText(log.message || "Activity update");
        const amount = parseAmountFromText(rawMessage);

        entries.push({
          id: `activity-${detail.id}-${log.id}`,
          actor,
          message: rawMessage,
          groupName: detail.name,
          amount,
          createdAt: log.createdAt,
        });
      }

      const expenses = Array.isArray(detail.expenses) ? detail.expenses : [];
      for (const expense of expenses) {
        const payer = members.find((member) => Number(member.id) === Number(expense.payerMemberId));
        const actor = Number(payer?.userId || 0) === Number(session?.userId || 0)
          ? "You"
          : normalizedText(payer?.name || "A member");
        entries.push({
          id: `expense-${detail.id}-${expense.id}`,
          actor,
          message: `added ${expense.title}`,
          groupName: detail.name,
          amount: Number(expense.amount || 0),
          createdAt: expense.createdAt || expense.expenseDate,
        });
      }
    }

    entries.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return entries.slice(0, 120);
  }

  function updateRecentActivityList(entries) {
    const heading = Array.from(document.querySelectorAll("h2")).find((item) => normalizedKey(item.textContent || "") === "recent activity");
    if (!heading) return;
    heading.id = "activity-section";

    const card = heading.closest("div.bg-white.rounded-2xl");
    if (!card) return;
    const listRoot = card.querySelector(".divide-y");
    if (!listRoot) return;
    listRoot.classList.add("runtime-recent-activity-scroll");

    if (!listRoot._runtimeTemplate) {
      const existingTemplate = listRoot.firstElementChild;
      if (existingTemplate) {
        listRoot._runtimeTemplate = existingTemplate.cloneNode(true);
      }
    }

    const template = listRoot._runtimeTemplate ? listRoot._runtimeTemplate.cloneNode(true) : null;
    if (!template) return;

    listRoot.innerHTML = "";
    listRoot.classList.remove("runtime-skeleton-list");

    if (!entries.length) {
      renderRuntimeEmptyState(listRoot, {
        title: "No recent activity yet.",
        note: "New expenses, settlements, and member actions will land here.",
        kind: "activity",
      });
      return;
    }

    entries.forEach((entry, index) => {
      const row = template.cloneNode(true);
      if (row instanceof HTMLElement) {
        row.classList.add("runtime-activity-row-left");
      }
      const avatarImage = row.querySelector("img");
      const avatarFallback = row.querySelector("span");

      if (avatarImage) {
        const avatarIndex = (index % 6) + 1;
        avatarImage.setAttribute("src", `/avatar-${avatarIndex}.jpg`);
      }
      if (avatarFallback) {
        avatarFallback.textContent = entry.actor.charAt(0).toUpperCase();
      }

      const primary = row.querySelector("p.text-sm");
      if (primary) {
        primary.textContent = `${entry.actor} ${entry.message}`;
      }

      const secondary = row.querySelector("p.text-xs");
      if (secondary) {
        secondary.textContent = `${entry.groupName} • ${relativeTime(entry.createdAt)}`;
      }

      const amountNode = Array.from(row.querySelectorAll("p")).find((p) => String(p.className || "").includes("font-semibold"));
      if (amountNode) {
        amountNode.classList.remove("text-right");
        amountNode.style.textAlign = "left";
        amountNode.style.marginLeft = "0";
        const amount = Number(entry.amount || 0);
        amountNode.classList.remove("text-green-500", "text-red-500", "text-gray-500");
        if (Math.abs(amount) < 0.01) {
          amountNode.textContent = "--";
          amountNode.classList.add("text-gray-500");
        } else if (amount > 0) {
          amountNode.textContent = `+${formatMoney(amount)}`;
          amountNode.classList.add("text-green-500");
        } else {
          amountNode.textContent = formatMoney(amount);
          amountNode.classList.add("text-red-500");
        }
      }

      const amountContainer =
        amountNode?.closest("div") ||
        Array.from(row.querySelectorAll("div")).find((node) => String(node.className || "").includes("text-right")) ||
        null;
      if (amountContainer instanceof HTMLElement) {
        amountContainer.classList.remove("text-right", "ml-auto");
        amountContainer.style.textAlign = "left";
        amountContainer.style.marginLeft = "0";
      }

      listRoot.appendChild(row);
    });
  }

  async function hydrateDashboardData() {
    const path = normalizePath(window.location.pathname);
    if (!DASHBOARD_LIKE_PATHS.has(path)) return;

    try {
      if (!Array.isArray(state.groupsCache) || !state.groupsCache.length || Date.now() - state.groupsCheckedAt > 20_000) {
        showDashboardLoadingState();
      }

      const [groups, session] = await Promise.all([fetchGroups(false), fetchSession(false)]);
      if (!Array.isArray(groups)) return;

      const details = await Promise.all(
        groups.slice(0, 10).map(async (group) => {
          try {
            const detail = await fetchGroupDetail(group.id, false);
            return detail;
          } catch {
            return null;
          }
        })
      );

      const groupsData = groups.map((group, index) => {
        const detail = details.find((item) => Number(item?.id || 0) === Number(group.id)) || null;
        const userNet = detail ? summarizeUserNet(detail, Number(session?.userId || 0)) : 0;
        const lastActivityAt = detail ? resolveLatestActivityFromGroup(detail) : group?.createdAt || "";
        return {
          id: Number(group.id),
          name: String(group.name || `Group ${group.id}`),
          memberCount: Number(group.memberCount || detail?.members?.length || 0),
          expenseCount: Number(group.expenseCount || detail?.summary?.expenseCount || 0),
          userNet,
          lastActivityAt,
          index,
        };
      });

      const totalOwe = groupsData.reduce((sum, item) => sum + (item.userNet < 0 ? Math.abs(item.userNet) : 0), 0);
      const totalOwed = groupsData.reduce((sum, item) => sum + (item.userNet > 0 ? item.userNet : 0), 0);

      updateDashboardCards(totalOwe, totalOwed, groupsData.length);
      updateGroupsList(groupsData);

      const activityEntries = buildRecentActivityEntries(details.filter(Boolean), session || null);
      updateRecentActivityList(activityEntries);
      focusDashboardSectionForRoute();
      await installDashboardProductPanels();
    } catch {
      // Keep existing static fallback UI if hydration fails.
    }
  }

  async function hydrateProfileData() {
    const path = normalizePath(window.location.pathname);
    if (path !== "/profile") return;

    installProfilePreferenceControls();
    installProfileDarkModeControl();
    installProfileAvatarUploader();

    try {
      const { response, body } = await jsonRequest("/api/profile", {
        method: "GET",
        headers: {},
      });
      if (!response.ok || !body?.user) return;
      const user = body.user;
      state.session = {
        ...(state.session && typeof state.session === "object" ? state.session : {}),
        ...user,
      };

      const firstNameInput = findInputByLabel("First Name");
      const lastNameInput = findInputByLabel("Last Name");
      const emailInput = findInputByLabel("Email");
      const phoneInput = findInputByLabel("Phone");

      const nameParts = normalizedText(user.name || "").split(" ").filter(Boolean);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ");

      if (firstNameInput && !firstNameInput.dataset.runtimeHydrated) {
        firstNameInput.value = firstName;
        firstNameInput.dataset.runtimeHydrated = "1";
      }
      if (lastNameInput && !lastNameInput.dataset.runtimeHydrated) {
        lastNameInput.value = lastName;
        lastNameInput.dataset.runtimeHydrated = "1";
      }
      if (emailInput && !emailInput.dataset.runtimeHydrated) {
        emailInput.value = String(user.email || "");
        emailInput.dataset.runtimeHydrated = "1";
      }
      if (phoneInput && !phoneInput.dataset.runtimeHydrated) {
        phoneInput.value = String(user.phone || "");
        phoneInput.dataset.runtimeHydrated = "1";
      }

      const headerName = Array.from(document.querySelectorAll("h2")).find((node) =>
        normalizedKey(node.textContent || "").includes("john") || normalizedKey(node.textContent || "").includes("doe")
      );
      if (headerName && user.name) {
        headerName.textContent = user.name;
      }

      const headerEmail = Array.from(document.querySelectorAll("p")).find((node) =>
        String(node.textContent || "").includes("@") && node.closest("main")
      );
      if (headerEmail && user.email) {
        headerEmail.textContent = user.email;
      }

      if (!state.profileAvatarDirty) {
        state.profileAvatarUrl = sanitizeAvatarUrl(user.avatarUrl || "");
      }
      state.profileAvatarKnown = true;
      syncProfileAvatarUi(state.profileAvatarUrl, state.session);

      installProfilePreferenceControls();
      installProfileDarkModeControl();
      installProfileAvatarUploader();
    } catch {
      // Keep fallback values.
    }
  }

  async function maybeCheckConfigHealth() {
    const path = normalizePath(window.location.pathname);
    if (!isProtectedPath(path)) return;
    if (Date.now() - state.healthCheckedAt < 60_000) return;

    state.healthCheckedAt = Date.now();
    try {
      const { response, body } = await jsonRequest("/api/health/config", {
        method: "GET",
        headers: {},
      });
      if (!response.ok) return;

      const counts = body?.counts || {};
      const signature = `${counts.fail || 0}:${counts.warn || 0}:${body?.score || 0}`;
      if (signature === state.lastHealthSignature) return;
      state.lastHealthSignature = signature;

      const fails = Number(counts.fail || 0);
      const warns = Number(counts.warn || 0);
      if (fails > 0) {
        showToast(`System alert: ${fails} required configuration issue(s) detected.`, "error", 5500);
      } else if (warns > 0) {
        showToast(`Config check: ${warns} optional service(s) are not configured.`, "warn", 5000);
      }

      if (Date.now() - state.opsCheckedAt < 120_000) return;
      state.opsCheckedAt = Date.now();
      const ops = await fetchOpsSnapshot(false);
      if (!ops) return;

      const queue = ops?.queue || {};
      const latency = ops?.latency || {};
      const opsSignature = `${queue.failed || 0}:${queue.queued || 0}:${latency.totalMs || 0}`;
      if (opsSignature === state.lastOpsSignature) return;
      state.lastOpsSignature = opsSignature;

      const failedJobs = Number(queue.failed || 0);
      if (failedJobs > 0) {
        showToast(`Ops alert: ${failedJobs} failed background notification job(s) need review.`, "warn", 5200);
      }

      const totalMs = Number(latency.totalMs || 0);
      if (Number.isFinite(totalMs) && totalMs > 450) {
        showToast("Ops signal: backend response time is elevated.", "info", 4500);
      }
    } catch {
      // Ignore health check failures.
    }
  }

  function invalidateRealtimeDataCaches() {
    state.groupsCheckedAt = 0;
    state.groupDetails.clear();
    state.notificationItemsAt = 0;
    state.settlementCandidatesAt = 0;
  }

  function closeRealtimeUpdates() {
    if (state.realtimeReconnectTimer) {
      window.clearTimeout(state.realtimeReconnectTimer);
      state.realtimeReconnectTimer = null;
    }

    if (state.realtimeRefreshTimer) {
      window.clearTimeout(state.realtimeRefreshTimer);
      state.realtimeRefreshTimer = null;
    }

    if (state.realtimeSource) {
      try {
        state.realtimeSource.close();
      } catch {
        // Ignore close errors.
      }
      state.realtimeSource = null;
    }

    state.realtimeConnected = false;
    state.realtimeRefreshInFlight = false;
  }

  function scheduleRealtimeReconnect() {
    const path = normalizePath(window.location.pathname);
    if (!isProtectedPath(path)) {
      closeRealtimeUpdates();
      return;
    }
    if (state.realtimeReconnectTimer) return;

    const delay = Math.max(1200, Math.min(15_000, Number(state.realtimeReconnectDelayMs || 1500)));
    state.realtimeReconnectTimer = window.setTimeout(() => {
      state.realtimeReconnectTimer = null;
      installRealtimeUpdates();
    }, delay);
    state.realtimeReconnectDelayMs = Math.min(15_000, Math.round(delay * 1.7));
  }

  function scheduleRealtimeRefresh() {
    const path = normalizePath(window.location.pathname);
    if (!isProtectedPath(path)) return;
    if (state.realtimeRefreshTimer) return;

    const now = Date.now();
    const elapsedSinceLast = now - Number(state.realtimeLastRefreshAt || 0);
    const wait = Math.max(140, 900 - Math.max(0, elapsedSinceLast));

    state.realtimeRefreshTimer = window.setTimeout(async () => {
      state.realtimeRefreshTimer = null;
      if (state.realtimeRefreshInFlight) return;

      state.realtimeRefreshInFlight = true;
      state.realtimeLastRefreshAt = Date.now();
      try {
        await runEnhancements();
      } catch {
        // Keep page usable if a realtime refresh fails.
      } finally {
        state.realtimeRefreshInFlight = false;
      }
    }, wait);
  }

  function handleRealtimePayload(payload) {
    const safe = payload && typeof payload === "object" ? payload : {};
    const changedGroupIds = Array.isArray(safe.changedGroupIds) ? safe.changedGroupIds : [];

    // Empty changedGroupIds means a global update (for example auth/profile background changes).
    if (changedGroupIds.length > 0) {
      const hasKnownIds = changedGroupIds.some((id) => Number.isFinite(Number(id)) && Number(id) > 0);
      if (!hasKnownIds) {
        return;
      }
    }

    state.realtimeLastMessageAt = Date.now();
    invalidateRealtimeDataCaches();
    scheduleRealtimeRefresh();
  }

  function installRealtimeUpdates() {
    const path = normalizePath(window.location.pathname);
    if (!isProtectedPath(path)) {
      closeRealtimeUpdates();
      return;
    }
    if (typeof window.EventSource !== "function") {
      return;
    }

    if (state.realtimeSource) {
      return;
    }

    let source = null;
    try {
      source = new EventSource("/api/events/stream");
    } catch {
      scheduleRealtimeReconnect();
      return;
    }

    state.realtimeSource = source;
    state.realtimeConnected = false;

    const onPayload = (event) => {
      const raw = String(event?.data || "").trim();
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        handleRealtimePayload(parsed);
      } catch {
        // Ignore malformed realtime payloads.
      }
    };

    source.addEventListener("open", () => {
      state.realtimeConnected = true;
      state.realtimeReconnectDelayMs = 1500;
    });
    source.addEventListener("update", onPayload);
    source.addEventListener("message", onPayload);
    source.addEventListener("error", () => {
      state.realtimeConnected = false;
      if (state.realtimeSource === source) {
        try {
          source.close();
        } catch {
          // Ignore close errors.
        }
        state.realtimeSource = null;
      }
      scheduleRealtimeReconnect();
    });
  }

  function installSubmitHandler() {
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (state.submitBusy) {
          event.preventDefault();
          return;
        }

        const currentPath = normalizePath(window.location.pathname);
        if (LOGIN_PATHS.has(currentPath)) {
          stopEvent(event);
          state.submitBusy = true;
          runLogin(form).finally(() => {
            state.submitBusy = false;
          });
          return;
        }

        if (SIGNUP_PATHS.has(currentPath)) {
          stopEvent(event);
          state.submitBusy = true;
          runSignup(form).finally(() => {
            state.submitBusy = false;
          });
        }
      },
      true
    );
  }

  function handleGenericButtonActions(trigger, event) {
    const text = getTriggerText(trigger).toLowerCase();
    if (!text) return false;

    if (text === "copy") {
      stopEvent(event);
      const scopedInput = trigger.closest("div")?.querySelector("input");
      const value = normalizedText(scopedInput?.value || scopedInput?.getAttribute("value") || "");
      const copyValue = value || `${window.location.origin}/invite`;
      navigator.clipboard
        .writeText(copyValue)
        .then(() => {
          flashSuccessState(trigger);
          showToast("Copied to clipboard.", "success");
        })
        .catch(() => showToast("Unable to copy link.", "warn"));
      return true;
    }

    if (text === "settings") {
      stopEvent(event);
      navigateWithTransition("/profile");
      return true;
    }

    if (text === "group settings" || text === "manage members") {
      stopEvent(event);
      showToast("Group management panel will open here soon.", "info");
      return true;
    }

    if (text === "leave group") {
      stopEvent(event);
      showToast("Leave group action is protected. Use the API-backed management flow.", "warn", 5000);
      return true;
    }

    if (text === "connect new payment method") {
      const path = normalizePath(window.location.pathname);
      if (path === "/profile") {
        stopEvent(event);
        void connectNewPaymentMethodFromUi();
        return true;
      }
      stopEvent(event);
      showToast("This action is queued for backend integration.", "info");
      return true;
    }

    if (text === "disconnect") {
      const path = normalizePath(window.location.pathname);
      if (path === "/profile") {
        const methodId = normalizedText(trigger.dataset.runtimePaymentMethodId || "");
        if (methodId) {
          stopEvent(event);
          void disconnectPaymentMethodFromUi(methodId);
          return true;
        }
      }
      stopEvent(event);
      showToast("This action is queued for backend integration.", "info");
      return true;
    }

    if (text === "delete") {
      stopEvent(event);
      showToast("Delete action is protected. Confirm from account settings backend flow.", "warn", 4000);
      return true;
    }

    if (text === "change") {
      const path = normalizePath(window.location.pathname);
      if (path === "/profile") {
        stopEvent(event);
        handleProfilePreferenceChange(trigger);
        return true;
      }

      stopEvent(event);
      showToast("Preference change options will be available in an upcoming update.", "info");
      return true;
    }

    return false;
  }

  function installClickHandler() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const trigger = getTrigger(target);
        if (!trigger) return;

        const currentPath = normalizePath(window.location.pathname);
        const triggerText = getTriggerText(trigger).toLowerCase();

        if (trigger.closest("#runtime-ops-health-hub, #runtime-settlement-hub, #runtime-notify-panel")) {
          return;
        }

        if (isLogoutTrigger(target)) {
          stopEvent(event);
          fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
          }).finally(() => {
            showToast("Signed out.", "success");
            navigateWithTransition("/login");
          });
          return;
        }

        const aliasTarget = getNavAliasTarget(target);
        if (aliasTarget) {
          stopEvent(event);
          navigateWithTransition(aliasTarget);
          return;
        }

        if (trigger instanceof HTMLButtonElement && trigger.dataset.runtimeEmptyGroupsCreate === "1") {
          stopEvent(event);
          navigateWithTransition("/create-group");
          return;
        }

        if (trigger instanceof HTMLButtonElement && trigger.dataset.runtimeEmptyGroupsJoin === "1") {
          stopEvent(event);
          showToast("Ask your teammate for an invite link to join an existing group.", "info", 3800);
          return;
        }

        const provider = getSocialAuthProvider(target);
        if ((LOGIN_PATHS.has(currentPath) || SIGNUP_PATHS.has(currentPath)) && provider) {
          stopEvent(event);
          if (provider === "google") {
            if (state.actionBusy.has("google-auth-start")) return;
            state.actionBusy.add("google-auth-start");
            const returnTo = encodeURIComponent(getReturnToPath() || "/dashboard");
            showToast("Opening Google sign-in...", "info", 2000);
            navigateWithTransition(`/api/auth/google/start?returnTo=${returnTo}`);
            window.setTimeout(() => {
              state.actionBusy.delete("google-auth-start");
            }, 3500);
            return;
          }
          if (provider === "apple") {
            showToast("Apple sign-in is not configured yet. Please use Google or email login.", "warn", 5000);
            return;
          }
        }

        if ((LOGIN_PATHS.has(currentPath) || SIGNUP_PATHS.has(currentPath)) && trigger instanceof HTMLButtonElement) {
          const type = String(trigger.getAttribute("type") || "button").toLowerCase();
          const form = trigger.form || trigger.closest("form");
          if (type === "submit" && form instanceof HTMLFormElement) {
            stopEvent(event);
            if (state.submitBusy) return;
            state.submitBusy = true;

            const finalize = () => {
              state.submitBusy = false;
              if (SIGNUP_PATHS.has(currentPath)) {
                syncSignupSubmitGuard(form);
              }
            };

            if (LOGIN_PATHS.has(currentPath)) {
              runLogin(form).finally(finalize);
              return;
            }

            runSignup(form).finally(finalize);
            return;
          }
        }

        if (currentPath === "/create-group" && trigger instanceof HTMLButtonElement && triggerText === "create group") {
          stopEvent(event);
          submitCreateGroup(trigger);
          return;
        }

        if (currentPath === "/create-expense" && trigger instanceof HTMLButtonElement && triggerText === "add expense") {
          stopEvent(event);
          submitCreateExpense(trigger);
          return;
        }

        if (currentPath === "/settle" && trigger instanceof HTMLButtonElement && triggerText === "yes, pay now") {
          // Let existing UI state flow continue and sync settlement in background.
          const intent = resolveSettlementIntentFromUi();
          const providerHint = resolveIntegratedPaymentProvider(intent, "");
          if (!providerHint) {
            launchPaymentMethodFlow(intent);
          }
          submitSettlementPaymentFromUi(intent, {
            manualLaunchHandled: !providerHint,
          });
          return;
        }

        if (currentPath === "/profile" && trigger instanceof HTMLButtonElement && triggerText === "save changes") {
          // Keep existing UI interaction while syncing to backend.
          submitProfileSave();
          return;
        }

        handleGenericButtonActions(trigger, event);

        if (currentPath === "/profile") {
          window.setTimeout(() => {
            installProfilePreferenceControls();
            installProfileDarkModeControl();
            installProfileAvatarUploader();
          }, 40);
        }
      },
      true
    );
  }

  function installRouteHooks() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const scheduleRouteSync = () => {
      const signature = `${normalizePath(window.location.pathname)}|${window.location.search || ""}|${window.location.hash || ""}`;
      const now = Date.now();
      if (state.routeSyncLastSignature === signature && now - state.routeSyncLastAt < 400) {
        return;
      }

      if (state.routeSyncTimer) {
        window.clearTimeout(state.routeSyncTimer);
      }

      state.routeSyncTimer = window.setTimeout(async () => {
        state.routeSyncTimer = null;
        state.routeSyncLastSignature = signature;
        state.routeSyncLastAt = Date.now();
        await guardRoute();
        await runEnhancements();
      }, 80);
    };

    history.pushState = function pushState(...args) {
      const currentPath = normalizePath(window.location.pathname);
      const nextPath = resolveInternalNavigationPath(args[2]);
      if (nextPath && nextPath !== currentPath) {
        beginRouteTransition();
      }
      originalPushState.apply(history, args);
      scheduleRouteSync();
    };

    history.replaceState = function replaceState(...args) {
      const currentPath = normalizePath(window.location.pathname);
      const nextPath = resolveInternalNavigationPath(args[2]);
      if (nextPath && nextPath !== currentPath) {
        beginRouteTransition();
      }
      originalReplaceState.apply(history, args);
      scheduleRouteSync();
    };

    window.addEventListener("popstate", () => {
      beginRouteTransition();
      scheduleRouteSync();
    });
  }

  function installAutoScroll() {
    const path = normalizePath(window.location.pathname);
    if (!MARKETING_PATHS.has(path)) return;
    if (state.lastAutoscrollPath === path) return;
    state.lastAutoscrollPath = path;

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      window.removeEventListener("wheel", cancel, { passive: true });
      window.removeEventListener("touchstart", cancel, { passive: true });
      window.removeEventListener("keydown", cancel, { passive: true });
      window.removeEventListener("mousedown", cancel, { passive: true });
    };

    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("keydown", cancel, { passive: true });
    window.addEventListener("mousedown", cancel, { passive: true });

    window.setTimeout(() => {
      if (cancelled) return;
      if (window.scrollY > 30) return;
      window.scrollTo({
        top: Math.max(window.innerHeight * 0.75, 300),
        behavior: "smooth",
      });
    }, 4500);
  }

  async function runEnhancements() {
    applyStoredMotionPreset();
    ensureRuntimeAmbientScene();
    applyStoredThemePreference();
    installAuthPageAssist();
    installRealtimeUpdates();
    await hydrateSessionDisplay();
    await Promise.all([hydrateDashboardData(), hydrateProfileData()]);
    await installDashboardProductPanels();
    applyWorkspaceRouteLayout();
    installDashboardSearch();
    installStickyPrimaryActions();
    installNotificationBell();
    await installSettlementReminderPanel();
    await maybeCheckConfigHealth();
    installAutoScroll();
    installRuntimeAnimations();
    endRouteTransition();
  }

  installSubmitHandler();
  installClickHandler();
  installRouteHooks();
  window.addEventListener("beforeunload", closeRealtimeUpdates);
  showAuthErrorAlert();
  installAutoScroll();

  queueMicrotask(async () => {
    await guardRoute();
    await runEnhancements();
  });
})();
