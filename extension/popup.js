// ApplyRecall Extension Popup Controller
// Premium SaaS experience: connects to backend with secure device token,
// auto-syncs student profile, matches approved answers, and executes safe multi-framework autofill.

const PROD_API_BASE = "https://applyrecall.onrender.com/api";
const PROD_DASHBOARD_BASE = "https://applyrecall.vercel.app";
const DEV_API_BASE = "http://localhost:8000/api";
const DEV_DASHBOARD_BASE = "http://localhost:3000";

let API_BASE = PROD_API_BASE;
let DASHBOARD_BASE = PROD_DASHBOARD_BASE;

document.addEventListener("DOMContentLoaded", async () => {
  // DOM Elements - State Containers
  const stateNotConnected = document.getElementById("state-not-connected");
  const stateConnected = document.getElementById("state-connected");
  const stateSubmission = document.getElementById("state-submission-confirm");
  const connectionBadge = document.getElementById("connection-badge");
  const connectionText = document.getElementById("connection-text");
  const userInfoFooter = document.getElementById("user-info-footer");
  const toastEl = document.getElementById("status-toast");

  // Settings Drawer Elements
  const settingsDrawer = document.getElementById("server-config-drawer");
  const toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const apiUrlInput = document.getElementById("api-url-input");
  const dashboardUrlInput = document.getElementById("dashboard-url-input");
  const saveApiUrlBtn = document.getElementById("save-api-url-btn");
  const resetProdUrlBtn = document.getElementById("reset-prod-url-btn");
  const resetDevUrlBtn = document.getElementById("reset-dev-url-btn");
  const openDashLink = document.getElementById("open-dashboard-link");
  const openAnswersLink = document.getElementById("open-answers-link");
  const dashSettingsLink = document.getElementById("dashboard-settings-link");

  // Pairing Elements
  const pairingCodeInput = document.getElementById("pairing-code-input");
  const connectBtn = document.getElementById("connect-btn");
  const syncWebsiteBtn = document.getElementById("sync-website-btn");

  // Job Context Elements
  const jobCompanyEl = document.getElementById("job-company");
  const jobPositionEl = document.getElementById("job-position");
  const jobSourceEl = document.getElementById("job-source");
  const jobLocationEl = document.getElementById("job-location");
  const locationText = document.getElementById("location-text");
  const atsBadge = document.getElementById("ats-badge");
  const activeStatusBadge = document.getElementById("active-status-badge");
  const startAppBtn = document.getElementById("start-application-btn");

  // Autofill Elements
  const detectedCountEl = document.getElementById("detected-fields-count");
  const rescanBtn = document.getElementById("rescan-btn");
  const safeModeCheck = document.getElementById("safe-mode-check");
  const autofillBtn = document.getElementById("autofill-btn");
  const resultsPanel = document.getElementById("autofill-results");
  const resultsCountBadge = document.getElementById("results-count-badge");
  const filledList = document.getElementById("filled-items-list");

  // Answer Library Elements
  const newQInput = document.getElementById("new-q-text");
  const newAInput = document.getElementById("new-a-text");
  const newScopeSelect = document.getElementById("new-scope-select");
  const saveAnswerBtn = document.getElementById("save-answer-btn");

  // Submission Elements
  const confirmAppliedBtn = document.getElementById("confirm-applied-btn");
  const dismissSubmissionBtn = document.getElementById("dismiss-submission-btn");
  const reminderCheck = document.getElementById("schedule-reminder-check");

  // Active state context
  let activeTabId = null;
  let currentContext = {
    deviceToken: null,
    profile: null,
    job: null,
    application: null,
    fields: [],
    essayFields: []
  };

  // Toast notification helper
  function showToast(msg, type = "success") {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = `toast toast-${type}`;
    toastEl.classList.remove("hidden");
    setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 4500);
  }

  // Update dynamic links to point to current dashboard base
  function updateFooterLinks() {
    const cleanDash = DASHBOARD_BASE.replace(/\/+$/, "");
    if (openDashLink) openDashLink.href = cleanDash;
    if (openAnswersLink) openAnswersLink.href = `${cleanDash}/answers`;
    if (dashSettingsLink) dashSettingsLink.href = `${cleanDash}/settings`;
  }

  // Auto-uppercase & filter pairing code input
  if (pairingCodeInput) {
    pairingCodeInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
  }

  // Settings Drawer Toggle
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
    closeSettingsBtn.addEventListener("click", () => {
      settingsDrawer.classList.add("hidden");
    });
  }

  // Save Settings
  if (saveApiUrlBtn) {
    saveApiUrlBtn.addEventListener("click", () => {
      const apiVal = apiUrlInput ? apiUrlInput.value.trim().replace(/\/+$/, "") : "";
      const dashVal = dashboardUrlInput ? dashboardUrlInput.value.trim().replace(/\/+$/, "") : "";

      if (apiVal) {
        if (!apiVal.startsWith("https://") && !apiVal.startsWith("http://localhost") && !apiVal.startsWith("http://127.0.0.1")) {
          showToast("Production API URL must use HTTPS.", "error");
          return;
        }
        API_BASE = apiVal;
      }
      if (dashVal) {
        DASHBOARD_BASE = dashVal;
      }

      chrome.storage.sync.set({ api_base_url: API_BASE, dashboard_base_url: DASHBOARD_BASE }, () => {
        updateFooterLinks();
        if (settingsDrawer) settingsDrawer.classList.add("hidden");
        showToast("Server configuration updated.");
      });
    });
  }

  // Preset Buttons
  if (resetProdUrlBtn) {
    resetProdUrlBtn.addEventListener("click", () => {
      API_BASE = PROD_API_BASE;
      DASHBOARD_BASE = PROD_DASHBOARD_BASE;
      if (apiUrlInput) apiUrlInput.value = API_BASE;
      if (dashboardUrlInput) dashboardUrlInput.value = DASHBOARD_BASE;
      chrome.storage.sync.set({ api_base_url: API_BASE, dashboard_base_url: DASHBOARD_BASE }, () => {
        updateFooterLinks();
        if (settingsDrawer) settingsDrawer.classList.add("hidden");
        showToast("Switched to Production Cloud.");
      });
    });
  }

  if (resetDevUrlBtn) {
    resetDevUrlBtn.addEventListener("click", () => {
      API_BASE = DEV_API_BASE;
      DASHBOARD_BASE = DEV_DASHBOARD_BASE;
      if (apiUrlInput) apiUrlInput.value = API_BASE;
      if (dashboardUrlInput) dashboardUrlInput.value = DASHBOARD_BASE;
      chrome.storage.sync.set({ api_base_url: API_BASE, dashboard_base_url: DASHBOARD_BASE }, () => {
        updateFooterLinks();
        if (settingsDrawer) settingsDrawer.classList.add("hidden");
        showToast("Switched to Localhost Dev.");
      });
    });
  }

  // Load configured API & Dashboard URLs
  chrome.storage.sync.get(["api_base_url", "dashboard_base_url"], (cfg) => {
    if (cfg && cfg.api_base_url) API_BASE = cfg.api_base_url;
    if (cfg && cfg.dashboard_base_url) DASHBOARD_BASE = cfg.dashboard_base_url;
    if (apiUrlInput) apiUrlInput.value = API_BASE;
    if (dashboardUrlInput) dashboardUrlInput.value = DASHBOARD_BASE;
    updateFooterLinks();
  });

  // Query Current Active Tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    activeTabId = activeTab.id;
  }

  const tabAppKey = activeTabId ? `tab_${activeTabId}_application` : "active_application";
  const tabSubmitKey = activeTabId ? `tab_${activeTabId}_submission_pending` : "submission_pending";

  // API Fetch with device token & 401 handling
  function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (currentContext.deviceToken) {
      headers["X-Device-Token"] = currentContext.deviceToken;
    }
    return headers;
  }

  async function apiFetch(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const headers = {
      ...getAuthHeaders(),
      ...(options.headers || {})
    };

    const resp = await fetch(url, { ...options, headers });

    if (resp.status === 401) {
      chrome.storage.local.remove(["device_token", "user_profile"]);
      currentContext.deviceToken = null;
      currentContext.profile = null;
      renderDisconnectedState();
      showToast("Device session expired or revoked. Please reconnect.", "error");
      throw new Error("Device authorization expired (401).");
    }

    return resp;
  }

  // Render Connected Workspace
  function renderConnectedState() {
    stateNotConnected.classList.add("hidden");
    stateConnected.classList.remove("hidden");
    connectionBadge.className = "status-pill status-pill-connected";
    connectionText.textContent = "Connected";

    if (currentContext.profile) {
      const displayName = currentContext.profile.full_name || currentContext.profile.email || "ApplyRecall Student";
      userInfoFooter.textContent = displayName;
      userInfoFooter.title = `Connected as ${displayName}`;
    }
  }

  // Render Disconnected State
  function renderDisconnectedState() {
    stateNotConnected.classList.remove("hidden");
    stateConnected.classList.add("hidden");
    stateSubmission.classList.add("hidden");
    connectionBadge.className = "status-pill status-pill-offline";
    connectionText.textContent = "Offline";
    userInfoFooter.textContent = "ApplyRecall MVP";
  }

  // Inspect Active Tab for Job Context and Form Fields
  async function inspectActiveTab() {
    if (!activeTabId) return;

    try {
      // 1. Extract Job Context
      chrome.tabs.sendMessage(activeTabId, { action: "GET_JOB_CONTEXT" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.job) {
          jobCompanyEl.textContent = "No Job Detected";
          jobPositionEl.textContent = "Open a job application page to begin.";
          atsBadge.textContent = "Web Page";
          return;
        }

        const job = response.job;
        currentContext.job = job;

        jobCompanyEl.textContent = job.company || "Job Listing";
        jobPositionEl.textContent = job.position || "Application Form";
        atsBadge.textContent = job.ats_platform || "Web Listing";

        if (job.source) {
          jobSourceEl.querySelector("span").textContent = job.source;
        }

        if (job.location) {
          locationText.textContent = job.location;
          jobLocationEl.classList.remove("hidden");
        } else {
          jobLocationEl.classList.add("hidden");
        }

        // Check if application is already tracked
        if (currentContext.application && currentContext.application.company &&
            currentContext.application.company.toLowerCase() === (job.company || "").toLowerCase()) {
          startAppBtn.innerHTML = `<span>✓ Tracked in Dashboard</span>`;
          startAppBtn.disabled = true;
          startAppBtn.className = "btn btn-sm btn-ghost btn-full";
          activeStatusBadge.textContent = "Tracked";
          activeStatusBadge.className = "badge badge-success";
        }
      });

      // 2. Inspect Form Fields
      chrome.tabs.sendMessage(activeTabId, { action: "INSPECT_FORM" }, (response) => {
        if (!chrome.runtime.lastError && response && response.fields) {
          currentContext.fields = response.fields;
          currentContext.essayFields = response.essayFields || [];

          const count = response.count || 0;
          detectedCountEl.textContent = count > 0 ? `${count} fields detected` : "No fields found";
          detectedCountEl.className = count > 0 ? "badge badge-blue" : "badge badge-neutral";

          // If essay question found, pre-populate quick-save assistant
          if (currentContext.essayFields.length > 0) {
            const firstEssay = currentContext.essayFields[0];
            if (!newQInput.value && firstEssay.prompt) {
              newQInput.value = firstEssay.prompt;
              if (firstEssay.currentValue) {
                newAInput.value = firstEssay.currentValue;
              }
            }
          }
        } else {
          detectedCountEl.textContent = "No form fields";
          detectedCountEl.className = "badge badge-neutral";
        }
      });
    } catch (e) {
      console.warn("Active tab inspection error:", e);
    }
  }

  // Load storage state on startup
  chrome.storage.local.get(
    ["device_token", "user_profile", tabAppKey, tabSubmitKey],
    async (res) => {
      if (res.device_token) {
        currentContext.deviceToken = res.device_token;
        currentContext.profile = res.user_profile;
        currentContext.application = res[tabAppKey] || null;

        renderConnectedState();

        if (res[tabSubmitKey]) {
          stateSubmission.classList.remove("hidden");
        }

        await inspectActiveTab();

        // Background Profile Sync: Silently refresh user profile from backend
        try {
          const profResp = await apiFetch("/profile");
          if (profResp.ok) {
            const profData = await profResp.json();
            if (profData && profData.profile) {
              currentContext.profile = profData.profile;
              chrome.storage.local.set({ user_profile: profData.profile });
              renderConnectedState();
            }
          }
        } catch (_) {}
      } else {
        renderDisconnectedState();
      }
    }
  );

  // Manual Re-scan Button
  if (rescanBtn) {
    rescanBtn.addEventListener("click", async () => {
      detectedCountEl.textContent = "Re-scanning...";
      await inspectActiveTab();
      showToast("Form fields re-scanned.");
    });
  }

  // Connect Button handler (Pairing with backend)
  connectBtn.addEventListener("click", async () => {
    const code = pairingCodeInput.value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      showToast("Please enter your 6-character code.", "error");
      return;
    }

    try {
      connectBtn.textContent = "Verifying Code...";
      connectBtn.disabled = true;

      const resp = await fetch(`${API_BASE}/auth/pair/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code,
          device_type: "extension",
          device_name: "Chrome Browser"
        })
      });

      if (!resp.ok) {
        let msg = "Pairing failed. Check the code.";
        try {
          const err = await resp.json();
          if (err && err.detail) msg = err.detail;
        } catch (_) {
          if (resp.status === 502 || resp.status === 503) {
            msg = "Server is starting up. Please retry in 10 seconds.";
          } else if (resp.status === 500) {
            msg = "Server error occurred. Please try generating a new code.";
          }
        }
        throw new Error(msg);
      }

      const data = await resp.json();
      currentContext.deviceToken = data.token;
      currentContext.profile = data.profile;

      chrome.storage.local.set({
        device_token: data.token,
        user_profile: data.profile
      });

      renderConnectedState();
      showToast("Extension linked successfully!");
      await inspectActiveTab();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      connectBtn.textContent = "Connect Extension";
      connectBtn.disabled = false;
    }
  });

  // Sync from Active Website Login
  if (syncWebsiteBtn) {
    syncWebsiteBtn.addEventListener("click", async () => {
      try {
        syncWebsiteBtn.textContent = "Checking Website Session...";
        syncWebsiteBtn.disabled = true;

        // Query open tabs for ApplyRecall dashboard
        const tabs = await chrome.tabs.query({});
        const dashTabs = tabs.filter(t => t.url && (
          t.url.includes("localhost:3000") ||
          t.url.includes("127.0.0.1:3000") ||
          t.url.includes("applyrecall.vercel.app") ||
          t.url.includes("applyrecall.onrender.com")
        ));

        if (dashTabs.length === 0) {
          showToast("Opening ApplyRecall website to log in...", "error");
          chrome.tabs.create({ url: `${DASHBOARD_BASE}/login` });
          return;
        }

        // Check if user is logged into the open website tab
        let foundToken = null;
        for (const tab of dashTabs) {
          try {
            const [res] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => localStorage.getItem("applyrecall_token")
            });
            if (res && res.result) {
              foundToken = res.result;
              break;
            }
          } catch (_) {}
        }

        if (!foundToken) {
          showToast("Please log in to ApplyRecall in your browser first.", "error");
          chrome.tabs.update(dashTabs[0].id, { active: true });
          return;
        }

        // Use active website token to link extension
        const headers = { "Content-Type": "application/json" };
        if (foundToken.startsWith("eyJ")) {
          headers["Authorization"] = `Bearer ${foundToken}`;
        } else {
          headers["X-Device-Token"] = foundToken;
        }

        const genResp = await fetch(`${API_BASE}/auth/pair/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ device_type: "extension" })
        });

        if (!genResp.ok) {
          throw new Error("Could not link with website session. Please enter the pairing code from Settings.");
        }

        const genData = await genResp.json();
        const verifyResp = await fetch(`${API_BASE}/auth/pair/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: genData.code,
            device_type: "extension",
            device_name: "Chrome Browser Extension"
          })
        });

        if (!verifyResp.ok) {
          throw new Error("Extension pairing verification failed.");
        }

        const verifyData = await verifyResp.json();
        currentContext.deviceToken = verifyData.token;
        currentContext.profile = verifyData.profile;

        chrome.storage.local.set({
          device_token: verifyData.token,
          user_profile: verifyData.profile
        });

        renderConnectedState();
        showToast("Connected to your logged-in ApplyRecall account!");
        await inspectActiveTab();
      } catch (err) {
        showToast(err.message || "Failed to link from website.", "error");
      } finally {
        syncWebsiteBtn.textContent = "✨ Sync from Active Website Login";
        syncWebsiteBtn.disabled = false;
      }
    });
  }

  // Track Application in Dashboard
  startAppBtn.addEventListener("click", async () => {
    if (!currentContext.job || !currentContext.job.company) {
      showToast("No active job detected on this page.", "error");
      return;
    }

    try {
      startAppBtn.textContent = "Tracking Application...";
      const resp = await apiFetch("/applications", {
        method: "POST",
        body: JSON.stringify({
          company: currentContext.job.company,
          position: currentContext.job.position,
          job_url: currentContext.job.job_url,
          source: currentContext.job.source,
          location: currentContext.job.location,
          employment_type: currentContext.job.employment_type,
          status: "Saved"
        })
      });

      if (resp.ok) {
        const app = await resp.json();
        currentContext.application = app;

        const storageUpdate = {};
        storageUpdate[tabAppKey] = app;
        chrome.storage.local.set(storageUpdate);

        startAppBtn.innerHTML = `<span>✓ Tracked in Dashboard</span>`;
        startAppBtn.disabled = true;
        startAppBtn.className = "btn btn-sm btn-ghost btn-full";
        activeStatusBadge.textContent = "Tracked";
        activeStatusBadge.className = "badge badge-success";
        showToast(`Opportunity saved for ${app.company}.`);
      }
    } catch (e) {
      showToast("Failed to save application context.", "error");
    }
  });

  // Execute Intelligent Autofill
  autofillBtn.addEventListener("click", async () => {
    if (!currentContext.profile) {
      showToast("Please connect your account first.", "error");
      return;
    }
    if (!activeTabId) {
      showToast("No active browser tab found.", "error");
      return;
    }

    autofillBtn.textContent = "Autofilling...";
    autofillBtn.disabled = true;

    try {
      // 1. Query Answer Library for essay/open-ended questions
      const matchedAnswers = [];
      const company = currentContext.job ? currentContext.job.company : "";
      const role = currentContext.job ? currentContext.job.position : "";

      for (const field of currentContext.fields) {
        if (field.isLongText && field.prompt) {
          try {
            const matchResp = await apiFetch("/answers/match", {
              method: "POST",
              body: JSON.stringify({
                question: field.prompt,
                company: company,
                role: role
              })
            });

            if (matchResp.ok) {
              const matchData = await matchResp.json();
              if (matchData.matched && matchData.answer) {
                matchedAnswers.push({
                  fieldId: field.id,
                  fieldName: field.name,
                  prompt: field.prompt,
                  questionTitle: matchData.answer.question,
                  answerText: matchData.answer.answer
                });
              }
            }
          } catch (_) {}
        }
      }

      // 2. Dispatch EXECUTE_AUTOFILL to Content Script
      const safeMode = safeModeCheck ? safeModeCheck.checked : true;

      chrome.tabs.sendMessage(
        activeTabId,
        {
          action: "EXECUTE_AUTOFILL",
          profile: currentContext.profile,
          matchedAnswers: matchedAnswers,
          forceOverwrite: !safeMode
        },
        (result) => {
          if (!chrome.runtime.lastError && result) {
            resultsPanel.classList.remove("hidden");
            const skipNote = result.skippedCount > 0 ? ` (${result.skippedCount} preserved)` : "";
            resultsCountBadge.textContent = `${result.filledCount} Filled${skipNote}`;
            filledList.innerHTML = "";

            if (result.filledDetails && result.filledDetails.length > 0) {
              result.filledDetails.forEach((item) => {
                const li = document.createElement("li");
                const previewVal = String(item.value).length > 24 ? String(item.value).substring(0, 22) + "…" : String(item.value);
                li.innerHTML = `<span><strong>✓</strong> ${item.label}</span><span class="text-muted text-xs">${previewVal}</span>`;
                filledList.appendChild(li);
              });
            }

            if (result.skippedDetails && result.skippedDetails.length > 0) {
              result.skippedDetails.forEach((item) => {
                const li = document.createElement("li");
                li.innerHTML = `<span class="text-muted">• ${item.label}</span><span class="text-muted text-xs">preserved</span>`;
                filledList.appendChild(li);
              });
            }

            if (result.filledCount > 0) {
              showToast(`Populated ${result.filledCount} fields cleanly.`);
            } else if (result.skippedCount > 0) {
              showToast(`All fields already contained values (preserved in safe mode).`);
            } else {
              showToast(`No matching empty fields on this page.`);
            }
          } else {
            showToast("Could not autofill this page. Try refreshing the tab.", "error");
          }
        }
      );
    } catch (err) {
      showToast("Autofill error: " + err.message, "error");
    } finally {
      autofillBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right: 6px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        <span>Autofill this Application</span>
      `;
      autofillBtn.disabled = false;
    }
  });

  // Save New Answer
  saveAnswerBtn.addEventListener("click", async () => {
    const q = newQInput.value.trim();
    const a = newAInput.value.trim();
    const scope = newScopeSelect.value;
    const company = currentContext.job ? currentContext.job.company : null;
    const role = currentContext.job ? currentContext.job.position : null;

    if (!q || !a) {
      showToast("Please enter both question prompt and answer.", "error");
      return;
    }

    if (scope === "company" && !company) {
      showToast("Company name required for company scope.", "error");
      return;
    }

    try {
      saveAnswerBtn.textContent = "Saving to Library...";
      saveAnswerBtn.disabled = true;

      const resp = await apiFetch("/answers", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          answer: a,
          scope: scope,
          company: scope === "company" ? company : null,
          role: scope === "application" ? role : null,
          tags: scope
        })
      });

      if (resp.ok) {
        showToast("Answer saved to your library.");
        newQInput.value = "";
        newAInput.value = "";
      } else {
        const err = await resp.json().catch(() => ({}));
        showToast(err.detail || "Could not save answer.", "error");
      }
    } catch (e) {
      showToast("Error saving answer.", "error");
    } finally {
      saveAnswerBtn.textContent = "Save to Answer Library";
      saveAnswerBtn.disabled = false;
    }
  });

  // Submission Confirmation
  confirmAppliedBtn.addEventListener("click", async () => {
    if (!currentContext.application) {
      const comp = currentContext.job ? currentContext.job.company : "Target Company";
      const pos = currentContext.job ? currentContext.job.position : "Role";
      const resp = await apiFetch("/applications", {
        method: "POST",
        body: JSON.stringify({ company: comp, position: pos, status: "Saved" })
      });
      if (resp.ok) {
        currentContext.application = await resp.json();
      }
    }

    if (currentContext.application) {
      try {
        confirmAppliedBtn.textContent = "Marking as Applied...";
        const shouldSchedule = reminderCheck.checked;
        const resp = await apiFetch(`/applications/${currentContext.application.id}/confirm-applied`, {
          method: "POST",
          body: JSON.stringify({
            create_reminder: shouldSchedule,
            reminder_days: 7
          })
        });

        if (resp.ok) {
          stateSubmission.classList.add("hidden");
          chrome.storage.local.remove([tabSubmitKey]);
          chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG", tabId: activeTabId });
          showToast("Marked as Applied! Follow-up reminder active.");
        }
      } catch (e) {
        showToast("Could not confirm application.", "error");
      } finally {
        confirmAppliedBtn.textContent = "Yes, mark as Applied";
      }
    }
  });

  dismissSubmissionBtn.addEventListener("click", () => {
    stateSubmission.classList.add("hidden");
    chrome.storage.local.remove([tabSubmitKey]);
    chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG", tabId: activeTabId });
  });
});
