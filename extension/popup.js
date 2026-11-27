// ApplyRecall extension popup controller
//
// Design rule: every action has an automatic path, and a manual alternative.
//   Connect      -> automatic website-login sync, or a manual pairing code
//   Tracking     -> automatic tracking of pages with forms, or the manual button
//   Autofill     -> safe default (keeps typed values), or manual "replace everything"
//   Answer saves -> one-click save of questions detected on the page, or manual entry

const PROD_API_BASE = "https://applyrecall.onrender.com/api";
const PROD_DASHBOARD_BASE = "https://applyrecall.vercel.app";
const DEV_API_BASE = "http://localhost:8000/api";
const DEV_DASHBOARD_BASE = "http://localhost:3000";

const STORAGE_KEYS = ["device_token", "user_profile"];
const SETTING_KEYS = ["api_base_url", "dashboard_base_url", "fill_mode", "auto_track"];
const DASHBOARD_URL_MATCHERS = ["localhost:3000", "127.0.0.1:3000", "applyrecall.vercel.app", "applyrecall.onrender.com"];

let API_BASE = PROD_API_BASE;
let DASHBOARD_BASE = PROD_DASHBOARD_BASE;

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);

  // Containers
  const stateNotConnected = $("state-not-connected");
  const stateConnected = $("state-connected");
  const stateSubmission = $("state-submission-confirm");
  const toastEl = $("status-toast");

  // Header
  const connectionBadge = $("connection-badge");
  const connectionText = $("connection-text");
  const userInfoFooter = $("user-info-footer");

  // Settings drawer
  const settingsDrawer = $("server-config-drawer");
  const toggleSettingsBtn = $("toggle-settings-btn");
  const closeSettingsBtn = $("close-settings-btn");
  const apiUrlInput = $("api-url-input");
  const dashboardUrlInput = $("dashboard-url-input");
  const saveApiUrlBtn = $("save-api-url-btn");
  const resetProdUrlBtn = $("reset-prod-url-btn");
  const resetDevUrlBtn = $("reset-dev-url-btn");
  const openDashLink = $("open-dashboard-link");
  const openAnswersLink = $("open-answers-link");
  const dashSettingsLink = $("dashboard-settings-link");

  // Connect screen
  const websiteStatusText = $("website-status-text");
  const websiteStatusDot = $("website-status-dot");
  const syncWebsiteBtn = $("sync-website-btn");
  const toggleManualPairBtn = $("toggle-manual-pair");
  const manualPairPanel = $("manual-pair-panel");
  const pairingCodeInput = $("pairing-code-input");
  const connectBtn = $("connect-btn");

  // Page context
  const jobCompanyEl = $("job-company");
  const jobPositionEl = $("job-position");
  const jobSourceEl = $("job-source");
  const jobLocationEl = $("job-location");
  const locationText = $("location-text");
  const atsBadge = $("ats-badge");
  const activeStatusBadge = $("active-status-badge");
  const startAppBtn = $("start-application-btn");
  const autoTrackCheck = $("auto-track-check");

  // Autofill
  const detectedCountEl = $("detected-fields-count");
  const rescanBtn = $("rescan-btn");
  const fillModeToggle = $("fill-mode-toggle");
  const fillModeHint = $("fill-mode-hint");
  const autofillBtn = $("autofill-btn");
  const autofillLabel = autofillBtn ? autofillBtn.querySelector(".btn-label") : null;
  const resultsPanel = $("autofill-results");
  const resultsCountBadge = $("results-count-badge");
  const resultsText = $("results-text");
  const filledList = $("filled-items-list");

  // Answer library
  const detectedQuestionsBadge = $("detected-questions-badge");
  const detectedQuestionsList = $("detected-questions-list");
  const toggleManualAnswerBtn = $("toggle-manual-answer");
  const manualAnswerPanel = $("manual-answer-panel");
  const newQInput = $("new-q-text");
  const newAInput = $("new-a-text");
  const newScopeSelect = $("new-scope-select");
  const saveAnswerBtn = $("save-answer-btn");

  // Submission
  const confirmAppliedBtn = $("confirm-applied-btn");
  const dismissSubmissionBtn = $("dismiss-submission-btn");
  const reminderCheck = $("schedule-reminder-check");

  const context = {
    deviceToken: null,
    profile: null,
    job: null,
    application: null,
    fields: [],
    essayFields: [],
    websiteToken: null,
    savedPrompts: new Set()
  };

  // Resolved once the initial storage/tab read finishes, so clicks made while the
  // popup is still opening wait for the account context instead of failing.
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  let fillMode = "safe";
  let autoTrack = true;
  let activeTabId = null;
  let tabAppKey = null;
  let tabSubmitKey = null;

  // ---------------------------------------------------------------- helpers

  function showToast(message, type = "success") {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `toast toast-${type}`;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toastEl.classList.add("hidden"), 4500);
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve) => {
      if (!tabId) return resolve(null);
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(response || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  // Runs an inspection/autofill action in every frame of the tab and merges results.
  function sendAggregate(tabId, payload) {
    return new Promise((resolve) => {
      if (!tabId) return resolve(null);
      try {
        chrome.runtime.sendMessage({ type: "AGGREGATE", tabId, payload }, (response) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(response || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function updateFooterLinks() {
    const base = DASHBOARD_BASE.replace(/\/+$/, "");
    if (openDashLink) openDashLink.href = base;
    if (openAnswersLink) openAnswersLink.href = `${base}/answers`;
    if (dashSettingsLink) dashSettingsLink.href = `${base}/settings`;
  }

  function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (context.deviceToken) headers["X-Device-Token"] = context.deviceToken;
    return headers;
  }

  async function apiFetch(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) }
    });

    if (response.status === 401) {
      chrome.storage.local.remove(STORAGE_KEYS);
      context.deviceToken = null;
      context.profile = null;
      renderDisconnected();
      showToast("Session expired. Please reconnect.", "error");
      throw new Error("Device authorization expired.");
    }
    return response;
  }

  // ------------------------------------------------------------- rendering

  function renderDisconnected() {
    if (stateNotConnected) stateNotConnected.classList.remove("hidden");
    if (stateConnected) stateConnected.classList.add("hidden");
    if (stateSubmission) stateSubmission.classList.add("hidden");
    if (connectionBadge) connectionBadge.className = "pill pill-offline";
    if (connectionText) connectionText.textContent = "Offline";
    if (userInfoFooter) userInfoFooter.textContent = "Not connected";
  }

  function renderConnected() {
    if (stateNotConnected) stateNotConnected.classList.add("hidden");
    if (stateConnected) stateConnected.classList.remove("hidden");
    if (connectionBadge) connectionBadge.className = "pill pill-online";
    if (connectionText) connectionText.textContent = "Connected";

    const profile = context.profile;
    if (userInfoFooter) {
      const label = (profile && (profile.full_name || profile.email)) || "Connected";
      userInfoFooter.textContent = label;
      userInfoFooter.title = `Connected as ${label}`;
    }
  }

  function setWebsiteStatus(state, text) {
    if (websiteStatusText) websiteStatusText.textContent = text;
    if (websiteStatusDot) {
      websiteStatusDot.className = "dot " + (state === "ok" ? "dot-ok" : state === "warn" ? "dot-warn" : "dot-idle");
    }
  }

  function setFillMode(mode, persist = true) {
    fillMode = mode === "replace" ? "replace" : "safe";
    if (fillModeToggle) {
      Array.from(fillModeToggle.querySelectorAll(".seg-btn")).forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.mode === fillMode);
      });
    }
    if (fillModeHint) {
      fillModeHint.textContent = fillMode === "safe"
        ? "Answers you already typed on the page are kept."
        : "Existing values on the page will be overwritten.";
    }
    if (persist) chrome.storage.sync.set({ fill_mode: fillMode });
  }

  function paintTracked(label) {
    if (startAppBtn) {
      startAppBtn.textContent = "Tracked in dashboard";
      startAppBtn.disabled = true;
      startAppBtn.classList.add("hidden");
    }
    if (activeStatusBadge) {
      activeStatusBadge.textContent = label || "Tracked";
      activeStatusBadge.classList.remove("hidden");
    }
  }

  function resetTracked() {
    if (startAppBtn) {
      startAppBtn.textContent = "Track this job manually";
      startAppBtn.disabled = false;
      startAppBtn.classList.remove("hidden");
    }
    if (activeStatusBadge) activeStatusBadge.classList.add("hidden");
  }

  function renderJob(job) {
    if (!job || !job.company) {
      if (jobCompanyEl) jobCompanyEl.textContent = "No job detected";
      if (jobPositionEl) jobPositionEl.textContent = "Open a job posting or application form to begin.";
      if (atsBadge) atsBadge.textContent = "Web page";
      return;
    }

    if (jobCompanyEl) jobCompanyEl.textContent = job.company;
    if (jobPositionEl) jobPositionEl.textContent = job.position || "Application form";
    if (atsBadge) atsBadge.textContent = job.ats_platform || "Web page";

    if (job.source && jobSourceEl) {
      const label = jobSourceEl.querySelector("span");
      if (label) label.textContent = job.source;
    }

    if (job.location) {
      if (locationText) locationText.textContent = job.location;
      if (jobLocationEl) jobLocationEl.classList.remove("hidden");
    } else if (jobLocationEl) {
      jobLocationEl.classList.add("hidden");
    }
  }

  function renderFormSummary(count) {
    if (!detectedCountEl) return;
    if (count > 0) {
      detectedCountEl.textContent = `${count} form field${count === 1 ? "" : "s"} found`;
      if (autofillBtn) {
        autofillBtn.disabled = false;
        if (autofillLabel) autofillLabel.textContent = "Autofill this page";
      }
    } else {
      detectedCountEl.textContent = "No form fields on this page";
      if (autofillBtn) {
        autofillBtn.disabled = true;
        if (autofillLabel) autofillLabel.textContent = "Nothing to autofill here";
      }
    }
  }

  function renderDetectedQuestions() {
    const fields = context.essayFields || [];
    if (detectedQuestionsBadge) {
      detectedQuestionsBadge.textContent = fields.length
        ? `${fields.length} found`
        : "None found";
    }
    if (!detectedQuestionsList) return;

    detectedQuestionsList.innerHTML = "";
    if (fields.length === 0) {
      const empty = document.createElement("li");
      empty.className = "q-empty";
      empty.textContent = "No written questions detected on this page.";
      detectedQuestionsList.appendChild(empty);
      return;
    }

    fields.slice(0, 6).forEach((field) => {
      const row = document.createElement("li");
      row.className = "q-item";

      const body = document.createElement("div");
      body.className = "q-body";

      const prompt = document.createElement("span");
      prompt.className = "q-prompt";
      prompt.textContent = field.prompt;
      body.appendChild(prompt);

      const answer = document.createElement("span");
      answer.className = "q-answer";
      answer.textContent = (field.currentValue || "").trim()
        ? (field.currentValue || "").trim()
        : "Not answered on this page yet";
      body.appendChild(answer);
      row.appendChild(body);

      const action = document.createElement("button");
      action.className = "btn btn-quiet btn-sm";
      const alreadySaved = context.savedPrompts.has(field.prompt);
      const hasAnswer = !!(field.currentValue || "").trim();
      action.textContent = alreadySaved ? "Saved" : hasAnswer ? "Save" : "Write";
      action.disabled = alreadySaved;
      action.addEventListener("click", async () => {
        if (hasAnswer) {
          await saveDetectedAnswer(field, action);
        } else {
          openManualAnswer(field.prompt);
        }
      });
      row.appendChild(action);

      detectedQuestionsList.appendChild(row);
    });
  }

  // -------------------------------------------------------- page inspection

  async function inspectActiveTab({ allowAutoTrack = false } = {}) {
    if (!activeTabId) return;

    const jobResponse = await sendAggregate(activeTabId, { action: "job" });
    const job = jobResponse && jobResponse.job ? jobResponse.job : null;
    context.job = job;
    renderJob(job);

    if (context.application && job && context.application.company &&
        (job.company || "").toLowerCase() === context.application.company.toLowerCase()) {
      paintTracked("Tracked");
    } else {
      resetTracked();
    }

    const formResponse = await sendAggregate(activeTabId, { action: "inspect" });
    if (formResponse) {
      context.fields = formResponse.fields || [];
      context.essayFields = formResponse.essayFields || [];
    } else {
      context.fields = [];
      context.essayFields = [];
    }
    renderFormSummary(context.fields.length);
    renderDetectedQuestions();

    // Automatic tracking: only on pages that actually contain an application form.
    if (allowAutoTrack && autoTrack && context.fields.length > 0 && !context.application) {
      try {
        await trackCurrentJob({ silent: true });
      } catch (_) {}
    }
  }

  // ------------------------------------------------------------- tracking

  async function trackCurrentJob({ silent = false } = {}) {
    if (context.application) return context.application;
    if (!context.job || !context.job.company) {
      if (!silent) showToast("No job detected on this page.", "error");
      return null;
    }

    const response = await apiFetch("/applications", {
      method: "POST",
      body: JSON.stringify({
        company: context.job.company,
        position: context.job.position || "Role",
        job_url: context.job.job_url,
        source: context.job.source,
        location: context.job.location,
        employment_type: context.job.employment_type,
        status: "Saved"
      })
    });

    if (!response.ok) {
      if (!silent) showToast("Could not save this job. Please retry.", "error");
      return null;
    }

    const application = await response.json();
    context.application = application;
    if (tabAppKey) chrome.storage.local.set({ [tabAppKey]: application });
    paintTracked(silent ? "Auto-tracked" : "Tracked");
    if (!silent) showToast(`Saved ${application.company} to your dashboard.`);
    return application;
  }

  // ------------------------------------------------------------- answers

  function autoScopeFor(prompt) {
    const company = context.job && context.job.company ? context.job.company : "";
    if (company && prompt.toLowerCase().includes(company.toLowerCase())) return "company";
    return "general";
  }

  async function saveDetectedAnswer(field, button) {
    const scope = autoScopeFor(field.prompt);
    const company = context.job ? context.job.company : null;
    const role = context.job ? context.job.position : null;

    button.disabled = true;
    button.textContent = "Saving…";

    try {
      const response = await apiFetch("/answers", {
        method: "POST",
        body: JSON.stringify({
          question: field.prompt,
          answer: (field.currentValue || "").trim(),
          scope,
          company: scope === "company" ? company : null,
          role: scope === "application" ? role : null,
          tags: scope
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Could not save answer.");
      }

      context.savedPrompts.add(field.prompt);
      button.textContent = "Saved";
      showToast(scope === "company" ? "Saved for this company." : "Saved for any application.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save";
      showToast(error.message || "Could not save answer.", "error");
    }
  }

  function openManualAnswer(prompt = "") {
    if (manualAnswerPanel) manualAnswerPanel.classList.remove("hidden");
    if (newQInput) {
      newQInput.value = prompt;
      newQInput.focus();
    }
  }

  // ------------------------------------------------------------ connection

  async function findWebsiteToken() {
    const tabs = await chrome.tabs.query({});
    const dashTabs = tabs.filter((tab) => tab.url && DASHBOARD_URL_MATCHERS.some((m) => tab.url.includes(m)));
    if (dashTabs.length === 0) return { token: null, reason: "no_tab", tab: null };

    for (const tab of dashTabs) {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => localStorage.getItem("applyrecall_token")
        });
        if (result && result.result) return { token: result.result, reason: "ok", tab };
      } catch (_) {}
    }
    return { token: null, reason: "not_signed_in", tab: dashTabs[0] };
  }

  async function detectWebsiteSession() {
    setWebsiteStatus("idle", "Checking for a signed-in ApplyRecall tab…");
    try {
      const { token, reason } = await findWebsiteToken();
      if (token) {
        context.websiteToken = token;
        setWebsiteStatus("ok", "Signed in on your ApplyRecall tab — ready to connect.");
      } else if (reason === "no_tab") {
        setWebsiteStatus("warn", "No ApplyRecall tab open — we'll open it for you.");
      } else {
        setWebsiteStatus("warn", "Your ApplyRecall tab is not signed in yet.");
      }
    } catch (_) {
      setWebsiteStatus("warn", "Could not check the website session.");
    }
  }

  async function finishConnection(token, profile) {
    context.deviceToken = token;
    context.profile = profile || null;
    chrome.storage.local.set({ device_token: token, user_profile: profile || null });
    renderConnected();
    await inspectActiveTab({ allowAutoTrack: true });
  }

  async function connectAutomatically() {
    if (!syncWebsiteBtn) return;
    const labelEl = syncWebsiteBtn.querySelector(".btn-label");
    const setLabel = (text) => { if (labelEl) labelEl.textContent = text; };

    setLabel("Connecting…");
    syncWebsiteBtn.disabled = true;

    try {
      let token = context.websiteToken;
      if (!token) {
        const found = await findWebsiteToken();
        token = found.token;
        if (!token) {
          if (found.reason === "no_tab") {
            showToast("Opening ApplyRecall — log in, then press Connect again.");
            chrome.tabs.create({ url: `${DASHBOARD_BASE}/login` });
          } else {
            showToast("Please log in to ApplyRecall in your browser tab.", "error");
            if (found.tab) chrome.tabs.update(found.tab.id, { active: true });
          }
          return;
        }
      }

      const siteHeaders = { "Content-Type": "application/json" };
      if (token.startsWith("eyJ")) siteHeaders["Authorization"] = `Bearer ${token}`;
      else siteHeaders["X-Device-Token"] = token;

      const generateResponse = await fetch(`${API_BASE}/auth/pair/generate`, {
        method: "POST",
        headers: siteHeaders,
        body: JSON.stringify({ device_type: "extension" })
      });

      if (!generateResponse.ok) {
        throw new Error("Could not read your website login. Use the pairing code instead.");
      }

      const { code } = await generateResponse.json();
      const verifyResponse = await fetch(`${API_BASE}/auth/pair/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, device_type: "extension", device_name: "Chrome Browser Extension" })
      });

      if (!verifyResponse.ok) throw new Error("Linking failed. Please try the pairing code.");

      const verifyData = await verifyResponse.json();
      await finishConnection(verifyData.token, verifyData.profile);
      showToast("Connected to your ApplyRecall account.");
    } catch (error) {
      showToast(error.message || "Could not connect automatically.", "error");
    } finally {
      setLabel("Connect automatically");
      syncWebsiteBtn.disabled = false;
    }
  }

  async function connectWithCode() {
    const code = (pairingCodeInput ? pairingCodeInput.value : "").trim().toUpperCase();
    if (!code || code.length !== 6) {
      showToast("Enter the 6-character code from your dashboard.", "error");
      return;
    }

    const labelEl = connectBtn ? connectBtn.querySelector(".btn-label") : null;
    if (labelEl) labelEl.textContent = "Verifying…";
    if (connectBtn) connectBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE}/auth/pair/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, device_type: "extension", device_name: "Chrome Browser" })
      });

      if (!response.ok) {
        let message = "That code did not work. Generate a new one and retry.";
        try {
          const err = await response.json();
          if (err && err.detail) message = err.detail;
        } catch (_) {
          if (response.status === 502 || response.status === 503) {
            message = "Server is starting up. Retry in 10 seconds.";
          }
        }
        throw new Error(message);
      }

      const data = await response.json();
      await finishConnection(data.token, data.profile);
      showToast("Extension paired successfully.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (labelEl) labelEl.textContent = "Pair with code";
      if (connectBtn) connectBtn.disabled = false;
    }
  }

  // --------------------------------------------------------------- autofill

  async function runAutofill() {
    await ready;
    if (!context.profile) {
      showToast("Connect your account first.", "error");
      return;
    }
    if (!activeTabId) {
      showToast("No active browser tab found.", "error");
      return;
    }

    if (autofillLabel) autofillLabel.textContent = "Autofilling…";
    autofillBtn.disabled = true;

    try {
      const company = context.job ? context.job.company : "";
      const role = context.job ? context.job.position : "";
      const matchedAnswers = [];

      for (const field of context.fields) {
        if (!field.isLongText || !field.prompt) continue;
        try {
          const response = await apiFetch("/answers/match", {
            method: "POST",
            body: JSON.stringify({ question: field.prompt, company, role })
          });
          if (!response.ok) continue;
          const match = await response.json();
          if (match.matched && match.answer) {
            matchedAnswers.push({
              fieldId: field.id,
              fieldName: field.name,
              prompt: field.prompt,
              questionTitle: match.answer.question,
              answerText: match.answer.answer
            });
          }
        } catch (_) {}
      }

      // Repeated blocks (one per job, school or project) need the saved entries, not just the profile row.
      let experiences = context.experiences || [];
      let projects = context.projects || [];
      try {
        const profileResponse = await apiFetch("/profile");
        if (profileResponse.ok) {
          const data = await profileResponse.json();
          if (Array.isArray(data.experiences)) {
            experiences = data.experiences;
            context.experiences = experiences;
          }
          if (Array.isArray(data.projects)) {
            projects = data.projects;
            context.projects = projects;
          }
        }
      } catch (_) {}

      const result = await sendAggregate(activeTabId, {
        action: "fill",
        profile: context.profile,
        matchedAnswers,
        experiences,
        projects,
        forceOverwrite: fillMode === "replace"
      });

      if (!result) {
        showToast("Could not reach this page. Reload the tab and retry.", "error");
        return;
      }

      renderAutofillResult(result);
    } catch (error) {
      showToast("Autofill failed: " + (error.message || "unknown error"), "error");
    } finally {
      if (autofillLabel) autofillLabel.textContent = "Autofill this page";
      autofillBtn.disabled = context.fields.length === 0;
    }
  }

  function renderAutofillResult(result) {
    if (!resultsPanel) return;
    resultsPanel.classList.remove("hidden");

    const filled = result.filledCount || 0;
    const skipped = result.skippedCount || 0;
    const skippedNote = skipped > 0 ? ` · ${skipped} kept` : "";

    if (resultsCountBadge) resultsCountBadge.textContent = `${filled} filled${skippedNote}`;
    if (resultsText) {
      resultsText.textContent = filled > 0 ? "Fields written on this page" : "Nothing was written";
    }

    if (filledList) {
      filledList.innerHTML = "";
      (result.filledDetails || []).forEach((item) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.className = "f-label";
        const tick = document.createElement("span");
        tick.className = "ok";
        tick.textContent = "✓";
        const name = document.createElement("span");
        name.textContent = item.label || "Field";
        label.append(tick, name);

        const value = document.createElement("span");
        value.className = "f-value";
        const text = String(item.value || "");
        value.textContent = text.length > 26 ? text.slice(0, 24) + "…" : text;
        value.title = text;

        li.append(label, value);
        filledList.appendChild(li);
      });

      (result.skippedDetails || []).forEach((item) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.className = "f-label";
        label.textContent = `• ${item.label || "Field"}`;
        const value = document.createElement("span");
        value.className = "f-value";
        value.textContent = "kept";
        li.append(label, value);
        filledList.appendChild(li);
      });
    }

    if (filled > 0) showToast(`Filled ${filled} field${filled === 1 ? "" : "s"} on this page.`);
    else if (skipped > 0) showToast("Every field already had a value, so nothing changed.");
    else showToast("No matching fields found on this page.", "error");
  }

  // ------------------------------------------------------------- submission

  async function markApplied() {
    await ready;
    if (!context.application) {
      const company = context.job && context.job.company ? context.job.company : "Target company";
      const position = context.job && context.job.position ? context.job.position : "Role";
      const created = await apiFetch("/applications", {
        method: "POST",
        body: JSON.stringify({ company, position, status: "Saved" })
      });
      if (!created.ok) {
        showToast("Could not save this application.", "error");
        return;
      }
      context.application = await created.json();
    }

    if (!context.application) return;

    try {
      confirmAppliedBtn.disabled = true;
      confirmAppliedBtn.textContent = "Saving…";
      const response = await apiFetch(`/applications/${context.application.id}/confirm-applied`, {
        method: "POST",
        body: JSON.stringify({
          create_reminder: reminderCheck ? reminderCheck.checked : true,
          reminder_days: 7
        })
      });

      if (!response.ok) throw new Error();

      if (stateSubmission) stateSubmission.classList.add("hidden");
      if (tabSubmitKey) chrome.storage.local.remove([tabSubmitKey]);
      chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG", tabId: activeTabId });
      await trackCurrentJob({ silent: true });
      showToast("Marked as applied. Follow-up reminder is set.");
    } catch (_) {
      showToast("Could not confirm this application.", "error");
    } finally {
      confirmAppliedBtn.disabled = false;
      confirmAppliedBtn.textContent = "Mark as applied";
    }
  }

  // Register handlers first so the popup is usable while it loads.
  attachEvents();

  // -------------------------------------------------------------- bootstrap

  const config = await chrome.storage.sync.get(SETTING_KEYS);
  if (config.api_base_url) API_BASE = config.api_base_url;
  if (config.dashboard_base_url) DASHBOARD_BASE = config.dashboard_base_url;
  if (apiUrlInput) apiUrlInput.value = API_BASE;
  if (dashboardUrlInput) dashboardUrlInput.value = DASHBOARD_BASE;
  updateFooterLinks();

  if (autoTrackCheck) {
    autoTrack = config.auto_track !== false;
    autoTrackCheck.checked = autoTrack;
  }
  setFillMode(config.fill_mode || "safe", false);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0] ? tabs[0] : null;
  if (activeTab) activeTabId = activeTab.id;
  tabAppKey = activeTabId ? `tab_${activeTabId}_application` : "active_application";
  tabSubmitKey = activeTabId ? `tab_${activeTabId}_submission_pending` : "submission_pending";

  const stored = await chrome.storage.local.get([...STORAGE_KEYS, tabAppKey, tabSubmitKey]);

  if (stored.device_token) {
    context.deviceToken = stored.device_token;
    context.profile = stored.user_profile || null;
    context.application = stored[tabAppKey] || null;
    renderConnected();
    if (stored[tabSubmitKey] && stateSubmission) stateSubmission.classList.remove("hidden");
    await inspectActiveTab({ allowAutoTrack: true });

    // Refresh the cached profile in the background.
    try {
      const response = await apiFetch("/profile");
      if (response.ok) {
        const data = await response.json();
        if (data && data.profile) {
          context.profile = data.profile;
          chrome.storage.local.set({ user_profile: data.profile });
          renderConnected();
        }
      }
    } catch (_) {}
  } else {
    renderDisconnected();
    await detectWebsiteSession();
  }

  if (resolveReady) resolveReady();

  // ---------------------------------------------------------------- events

  function attachEvents() {
  if (pairingCodeInput) {
    pairingCodeInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (event.target.value.length === 6) connectWithCode();
    });
  }

  if (toggleManualPairBtn) {
    toggleManualPairBtn.addEventListener("click", () => {
      const hidden = manualPairPanel.classList.toggle("hidden");
      toggleManualPairBtn.textContent = hidden
        ? "Have a pairing code instead?"
        : "Hide pairing code";
      if (!hidden && pairingCodeInput) pairingCodeInput.focus();
    });
  }

  if (toggleManualAnswerBtn) {
    toggleManualAnswerBtn.addEventListener("click", () => {
      const hidden = manualAnswerPanel.classList.toggle("hidden");
      toggleManualAnswerBtn.textContent = hidden ? "Add an answer manually" : "Hide manual entry";
      if (!hidden && newQInput) newQInput.focus();
    });
  }

  if (toggleSettingsBtn && settingsDrawer) {
    toggleSettingsBtn.addEventListener("click", () => {
      settingsDrawer.classList.toggle("hidden");
      if (!settingsDrawer.classList.contains("hidden")) {
        if (apiUrlInput) apiUrlInput.value = API_BASE;
        if (dashboardUrlInput) dashboardUrlInput.value = DASHBOARD_BASE;
      }
    });
  }

  if (closeSettingsBtn && settingsDrawer) {
    closeSettingsBtn.addEventListener("click", () => settingsDrawer.classList.add("hidden"));
  }

  function persistServerConfig(apiBase, dashboardBase, message) {
    API_BASE = apiBase;
    DASHBOARD_BASE = dashboardBase;
    if (apiUrlInput) apiUrlInput.value = apiBase;
    if (dashboardUrlInput) dashboardUrlInput.value = dashboardBase;
    chrome.storage.sync.set({ api_base_url: apiBase, dashboard_base_url: dashboardBase }, () => {
      updateFooterLinks();
      if (settingsDrawer) settingsDrawer.classList.add("hidden");
      showToast(message);
    });
  }

  if (saveApiUrlBtn) {
    saveApiUrlBtn.addEventListener("click", () => {
      const apiValue = apiUrlInput ? apiUrlInput.value.trim().replace(/\/+$/, "") : "";
      const dashValue = dashboardUrlInput ? dashboardUrlInput.value.trim().replace(/\/+$/, "") : "";
      if (apiValue && !apiValue.startsWith("https://") &&
          !apiValue.startsWith("http://localhost") && !apiValue.startsWith("http://127.0.0.1")) {
        showToast("Use HTTPS for remote servers, or localhost for local development.", "error");
        return;
      }
      persistServerConfig(apiValue || API_BASE, dashValue || DASHBOARD_BASE, "Connection settings saved.");
    });
  }

  if (resetProdUrlBtn) {
    resetProdUrlBtn.addEventListener("click", () =>
      persistServerConfig(PROD_API_BASE, PROD_DASHBOARD_BASE, "Switched to the cloud server."));
  }

  if (resetDevUrlBtn) {
    resetDevUrlBtn.addEventListener("click", () =>
      persistServerConfig(DEV_API_BASE, DEV_DASHBOARD_BASE, "Switched to localhost."));
  }

  if (syncWebsiteBtn) syncWebsiteBtn.addEventListener("click", connectAutomatically);
  if (connectBtn) connectBtn.addEventListener("click", connectWithCode);

  if (rescanBtn) {
    rescanBtn.addEventListener("click", async () => {
      if (detectedCountEl) detectedCountEl.textContent = "Scanning…";
      await inspectActiveTab();
      showToast("Page scanned again.");
    });
  }

  if (fillModeToggle) {
    fillModeToggle.addEventListener("click", (event) => {
      const btn = event.target.closest(".seg-btn");
      if (btn && btn.dataset.mode) setFillMode(btn.dataset.mode);
    });
  }

  if (autoTrackCheck) {
    autoTrackCheck.addEventListener("change", () => {
      autoTrack = autoTrackCheck.checked;
      chrome.storage.sync.set({ auto_track: autoTrack });
      showToast(autoTrack ? "Pages with forms will be tracked automatically." : "Automatic tracking turned off.");
    });
  }

  if (startAppBtn) {
    startAppBtn.addEventListener("click", async () => {
      await ready;
      startAppBtn.disabled = true;
      startAppBtn.textContent = "Saving…";
      const app = await trackCurrentJob({ silent: false });
      if (!app) {
        startAppBtn.disabled = false;
        startAppBtn.textContent = "Track this job manually";
        startAppBtn.classList.remove("hidden");
      }
    });
  }

  if (autofillBtn) autofillBtn.addEventListener("click", runAutofill);

  if (saveAnswerBtn) {
    saveAnswerBtn.addEventListener("click", async () => {
      await ready;
      const question = newQInput ? newQInput.value.trim() : "";
      const answer = newAInput ? newAInput.value.trim() : "";
      const scope = newScopeSelect ? newScopeSelect.value : "general";
      const company = context.job ? context.job.company : null;
      const role = context.job ? context.job.position : null;

      if (!question || !answer) {
        showToast("Add both a question and an answer.", "error");
        return;
      }
      if (scope === "company" && !company) {
        showToast("Open the company's application page to save a company answer.", "error");
        return;
      }

      saveAnswerBtn.disabled = true;
      saveAnswerBtn.textContent = "Saving…";

      try {
        const response = await apiFetch("/answers", {
          method: "POST",
          body: JSON.stringify({
            question,
            answer,
            scope,
            company: scope === "company" ? company : null,
            role: scope === "application" ? role : null,
            tags: scope
          })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || "Could not save this answer.");
        }

        showToast("Answer saved to your library.");
        if (newQInput) newQInput.value = "";
        if (newAInput) newAInput.value = "";
        if (manualAnswerPanel) manualAnswerPanel.classList.add("hidden");
        if (toggleManualAnswerBtn) toggleManualAnswerBtn.textContent = "Add an answer manually";
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        saveAnswerBtn.disabled = false;
        saveAnswerBtn.textContent = "Save answer";
      }
    });
  }

  if (confirmAppliedBtn) confirmAppliedBtn.addEventListener("click", markApplied);

  if (dismissSubmissionBtn) {
    dismissSubmissionBtn.addEventListener("click", () => {
      if (stateSubmission) stateSubmission.classList.add("hidden");
      if (tabSubmitKey) chrome.storage.local.remove([tabSubmitKey]);
      chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG", tabId: activeTabId });
    });
  }
  } // end attachEvents
});
