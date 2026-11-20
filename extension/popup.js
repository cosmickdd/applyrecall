// ApplyRecall Extension Popup Logic
// Connects to backend with secure device token, tab-scoped context, answers matching, and safe autofill.

const PROD_API_BASE = "https://applyrecall.onrender.com/api";
const PROD_DASHBOARD_BASE = "https://applyrecall.vercel.app";
const DEV_API_BASE = "http://localhost:8000/api";
const DEV_DASHBOARD_BASE = "http://localhost:3000";

let API_BASE = PROD_API_BASE;
let DASHBOARD_BASE = PROD_DASHBOARD_BASE;

document.addEventListener("DOMContentLoaded", async () => {
  const stateNotConnected = document.getElementById("state-not-connected");
  const stateConnected = document.getElementById("state-connected");
  const stateSubmission = document.getElementById("state-submission-confirm");
  const connectionBadge = document.getElementById("connection-badge");
  const userInfoFooter = document.getElementById("user-info-footer");
  const toastEl = document.getElementById("status-toast");
  const apiUrlInput = document.getElementById("api-url-input");
  const dashboardUrlInput = document.getElementById("dashboard-url-input");
  const saveApiUrlBtn = document.getElementById("save-api-url-btn");
  const resetProdUrlBtn = document.getElementById("reset-prod-url-btn");
  const resetDevUrlBtn = document.getElementById("reset-dev-url-btn");
  const openDashLink = document.getElementById("open-dashboard-link");
  const openAnswersLink = document.getElementById("open-answers-link");

  function updateFooterLinks() {
    if (openDashLink) openDashLink.href = DASHBOARD_BASE;
    if (openAnswersLink) openAnswersLink.href = `${DASHBOARD_BASE.replace(/\/+$/, "")}/answers`;
  }

  // Load configured API URL and Dashboard URL if saved
  chrome.storage.sync.get(["api_base_url", "dashboard_base_url"], (cfg) => {
    if (cfg && cfg.api_base_url) {
      API_BASE = cfg.api_base_url;
    }
    if (cfg && cfg.dashboard_base_url) {
      DASHBOARD_BASE = cfg.dashboard_base_url;
    }
    if (apiUrlInput) {
      apiUrlInput.value = API_BASE;
    }
    if (dashboardUrlInput) {
      dashboardUrlInput.value = DASHBOARD_BASE;
    }
    updateFooterLinks();
  });

  if (saveApiUrlBtn) {
    saveApiUrlBtn.addEventListener("click", () => {
      const apiVal = apiUrlInput ? apiUrlInput.value.trim().replace(/\/+$/, "") : "";
      const dashVal = dashboardUrlInput ? dashboardUrlInput.value.trim().replace(/\/+$/, "") : "";
      
      if (apiVal) {
        // Enforce HTTPS unless localhost/127.0.0.1
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
        showToast("Server configuration saved.");
      });
    });
  }

  if (resetProdUrlBtn) {
    resetProdUrlBtn.addEventListener("click", () => {
      API_BASE = PROD_API_BASE;
      DASHBOARD_BASE = PROD_DASHBOARD_BASE;
      if (apiUrlInput) apiUrlInput.value = API_BASE;
      if (dashboardUrlInput) dashboardUrlInput.value = DASHBOARD_BASE;
      chrome.storage.sync.set({ api_base_url: API_BASE, dashboard_base_url: DASHBOARD_BASE }, () => {
        updateFooterLinks();
        showToast("Switched to Production environment.");
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
        showToast("Switched to Local Development.");
      });
    });
  }

  // Job elements
  const jobCompanyEl = document.getElementById("job-company");
  const jobPositionEl = document.getElementById("job-position");
  const jobSourceEl = document.getElementById("job-source");
  const jobLocationEl = document.getElementById("job-location");
  const detectedCountEl = document.getElementById("detected-fields-count");
  const startAppBtn = document.getElementById("start-application-btn");
  const autofillBtn = document.getElementById("autofill-btn");
  const resultsPanel = document.getElementById("autofill-results");
  const resultsCountBadge = document.getElementById("results-count-badge");
  const filledList = document.getElementById("filled-items-list");

  // Answer saving elements
  const newQInput = document.getElementById("new-q-text");
  const newAInput = document.getElementById("new-a-text");
  const newScopeSelect = document.getElementById("new-scope-select");
  const saveAnswerBtn = document.getElementById("save-answer-btn");

  // Submission elements
  const confirmAppliedBtn = document.getElementById("confirm-applied-btn");
  const dismissSubmissionBtn = document.getElementById("dismiss-submission-btn");
  const reminderCheck = document.getElementById("schedule-reminder-check");

  // Pairing elements
  const pairingCodeInput = document.getElementById("pairing-code-input");
  const connectBtn = document.getElementById("connect-btn");
  const devQuickConnectBtn = document.getElementById("dev-quick-connect-btn");

  let activeTabId = null;
  let currentContext = {
    deviceToken: null,
    profile: null,
    job: null,
    application: null,
    fields: [],
    essayFields: []
  };

  function showToast(msg, type = "success") {
    toastEl.textContent = msg;
    toastEl.className = `toast toast-${type}`;
    toastEl.classList.remove("hidden");
    setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 4000);
  }

  // Get current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    activeTabId = activeTab.id;
  }

  // Storage keys are tab-specific for job & application
  const tabAppKey = activeTabId ? `tab_${activeTabId}_application` : "active_application";
  const tabSubmitKey = activeTabId ? `tab_${activeTabId}_submission_pending` : "submission_pending";

  // Load storage state
  chrome.storage.local.get(
    ["device_token", "user_profile", tabAppKey, tabSubmitKey],
    async (res) => {
      if (res.device_token) {
        currentContext.deviceToken = res.device_token;
        currentContext.profile = res.user_profile;
        currentContext.application = res[tabAppKey] || null;

        renderConnectedState();

        // Check if submission is pending for THIS tab
        if (res[tabSubmitKey]) {
          stateSubmission.classList.remove("hidden");
        }

        // Detect job & inspect active tab
        await inspectActiveTab();
      } else {
        renderDisconnectedState();
      }
    }
  );

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

    const resp = await fetch(url, {
      ...options,
      headers
    });

    if (resp.status === 401) {
      // Clear revoked or expired token
      chrome.storage.local.remove(["device_token", "user_profile"]);
      currentContext.deviceToken = null;
      currentContext.profile = null;
      renderDisconnectedState();
      showToast("Device session expired or revoked. Please reconnect.", "error");
      throw new Error("Device authorization expired (401).");
    }

    return resp;
  }

  function renderConnectedState() {
    stateNotConnected.classList.add("hidden");
    stateConnected.classList.remove("hidden");
    connectionBadge.textContent = "Connected";
    connectionBadge.className = "badge badge-success";

    if (currentContext.profile) {
      userInfoFooter.textContent = currentContext.profile.full_name || currentContext.profile.email || "ApplyRecall Student";
    }
  }

  function renderDisconnectedState() {
    stateNotConnected.classList.remove("hidden");
    stateConnected.classList.add("hidden");
    stateSubmission.classList.add("hidden");
    connectionBadge.textContent = "Offline";
    connectionBadge.className = "badge badge-neutral";
  }

  // Active Tab Inspection
  async function inspectActiveTab() {
    if (!activeTabId) return;

    try {
      // 1. Extract Job Context
      chrome.tabs.sendMessage(activeTabId, { action: "GET_JOB_CONTEXT" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.job) {
          jobCompanyEl.textContent = "No Job Detected";
          jobPositionEl.textContent = "Open a job listing or application form.";
          return;
        }

        const job = response.job;
        currentContext.job = job;

        jobCompanyEl.textContent = job.company || "Job Listing";
        jobPositionEl.textContent = job.position || "Application Form";
        jobSourceEl.textContent = job.source || "Web";
        if (job.location) {
          jobLocationEl.textContent = job.location;
          jobLocationEl.classList.remove("hidden");
        }

        if (currentContext.application && currentContext.application.company.toLowerCase() === (job.company || "").toLowerCase()) {
          startAppBtn.textContent = "Application In Progress ✓";
          startAppBtn.disabled = true;
          startAppBtn.className = "btn btn-ghost btn-full";
        }
      });

      // 2. Inspect Fields
      chrome.tabs.sendMessage(activeTabId, { action: "INSPECT_FORM" }, async (response) => {
        if (!chrome.runtime.lastError && response && response.fields) {
          currentContext.fields = response.fields;
          currentContext.essayFields = response.essayFields || [];
          detectedCountEl.textContent = `${response.count} fields detected`;
          detectedCountEl.className = "badge badge-blue";

          // Unanswered Question Detection: find essay questions and check if any are unanswered
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
        }
      });
    } catch (e) {
      console.warn("Tab inspection warning:", e);
    }
  }

  // Connect Button handler (Pairing with backend)
  connectBtn.addEventListener("click", async () => {
    const code = pairingCodeInput.value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      showToast("Please enter a valid 6-character code.", "error");
      return;
    }

    try {
      connectBtn.textContent = "Verifying...";
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
            msg = "Server is deploying or restarting. Please retry in 10 seconds.";
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
      showToast("Device paired securely with ApplyRecall.");
      await inspectActiveTab();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      connectBtn.textContent = "Connect Extension";
      connectBtn.disabled = false;
    }
  });

  // Developer Quick Connect (dev mode only)
  devQuickConnectBtn.addEventListener("click", async () => {
    try {
      devQuickConnectBtn.textContent = "Connecting...";
      // Generate code and verify atomically in dev
      const genResp = await fetch(`${API_BASE}/auth/pair/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer 00000000-0000-0000-0000-000000000001"
        },
        body: JSON.stringify({ device_type: "extension" })
      });

      if (!genResp.ok) {
        showToast("Backend not reachable or running in production mode.", "error");
        return;
      }

      const genData = await genResp.json();
      const verifyResp = await fetch(`${API_BASE}/auth/pair/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: genData.code,
          device_type: "extension",
          device_name: "Dev Extension"
        })
      });

      if (verifyResp.ok) {
        const verifyData = await verifyResp.json();
        currentContext.deviceToken = verifyData.token;
        currentContext.profile = verifyData.profile;

        chrome.storage.local.set({
          device_token: verifyData.token,
          user_profile: verifyData.profile
        });

        renderConnectedState();
        showToast("Connected to dev student profile.");
        await inspectActiveTab();
      }
    } catch (e) {
      showToast("Could not connect to backend at " + API_BASE, "error");
    } finally {
      devQuickConnectBtn.textContent = "Use Default Student Profile";
    }
  });

  // Start Application Context
  startAppBtn.addEventListener("click", async () => {
    if (!currentContext.job || !currentContext.job.company) {
      showToast("No active job detected on this page.", "error");
      return;
    }

    try {
      startAppBtn.textContent = "Saving Context...";
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

        // Store per tab
        const storageUpdate = {};
        storageUpdate[tabAppKey] = app;
        chrome.storage.local.set(storageUpdate);

        startAppBtn.textContent = "Application In Progress ✓";
        startAppBtn.disabled = true;
        startAppBtn.className = "btn btn-ghost btn-full";
        showToast(`Active application context set for ${app.company}.`);
      }
    } catch (e) {
      showToast("Failed to create application context.", "error");
    }
  });

  // Autofill this application safely
  autofillBtn.addEventListener("click", async () => {
    if (!currentContext.profile) {
      showToast("No profile loaded. Please connect your account.", "error");
      return;
    }
    if (!activeTabId) return;

    autofillBtn.textContent = "Autofilling...";
    autofillBtn.disabled = true;

    try {
      // 1. Check for long-form answers in library via /api/answers/match
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
          } catch (e) {}
        }
      }

      // 2. Dispatch EXECUTE_AUTOFILL to content script (forceOverwrite: false to protect existing values)
      chrome.tabs.sendMessage(
        activeTabId,
        {
          action: "EXECUTE_AUTOFILL",
          profile: currentContext.profile,
          matchedAnswers: matchedAnswers,
          forceOverwrite: false
        },
        (result) => {
          if (!chrome.runtime.lastError && result) {
            resultsPanel.classList.remove("hidden");
            const skipNote = result.skippedCount > 0 ? ` (${result.skippedCount} existing preserved)` : "";
            resultsCountBadge.textContent = `${result.filledCount} filled${skipNote}`;
            filledList.innerHTML = "";

            if (result.filledDetails && result.filledDetails.length > 0) {
              result.filledDetails.forEach((item) => {
                const li = document.createElement("li");
                li.innerHTML = `<span>${item.label}</span><strong>✓</strong>`;
                filledList.appendChild(li);
              });
            }

            if (result.skippedDetails && result.skippedDetails.length > 0) {
              result.skippedDetails.forEach((item) => {
                const li = document.createElement("li");
                li.innerHTML = `<span class="text-muted">${item.label} (preserved)</span><span class="text-muted text-xs">skipped</span>`;
                filledList.appendChild(li);
              });
            }

            showToast(`Safely populated ${result.filledCount} fields.`);
          } else {
            showToast("Could not autofill on this page.", "error");
          }
        }
      );
    } catch (err) {
      showToast("Autofill error: " + err.message, "error");
    } finally {
      autofillBtn.textContent = "Autofill this application";
      autofillBtn.disabled = false;
    }
  });

  // Save New Answer on the go
  saveAnswerBtn.addEventListener("click", async () => {
    const q = newQInput.value.trim();
    const a = newAInput.value.trim();
    const scope = newScopeSelect.value;
    const company = currentContext.job ? currentContext.job.company : null;
    const role = currentContext.job ? currentContext.job.position : null;

    if (!q || !a) {
      showToast("Please provide both question prompt and answer.", "error");
      return;
    }

    if (scope === "company" && !company) {
      showToast("Company name required for company scope.", "error");
      return;
    }

    try {
      saveAnswerBtn.textContent = "Saving...";
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
        showToast("Saved to your answer library.");
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

  // Submission confirmation (Tab-scoped)
  confirmAppliedBtn.addEventListener("click", async () => {
    if (!currentContext.application) {
      const comp = currentContext.job ? currentContext.job.company : "Target Company";
      const pos = currentContext.job ? currentContext.job.position : "Role";
      const resp = await apiFetch("/applications", {
        method: "POST",
        body: JSON.stringify({
          company: comp,
          position: pos,
          status: "Saved"
        })
      });
      if (resp.ok) {
        currentContext.application = await resp.json();
      }
    }

    if (currentContext.application) {
      try {
        confirmAppliedBtn.textContent = "Saving...";
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
          // Clear tab-specific flag
          chrome.storage.local.remove([tabSubmitKey]);
          chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG", tabId: activeTabId });
          showToast("Application marked as Applied. Follow-up reminder active.");
        }
      } catch (e) {
        showToast("Could not confirm application.", "error");
      }
    }
  });

  dismissSubmissionBtn.addEventListener("click", () => {
    stateSubmission.classList.add("hidden");
    chrome.storage.local.remove([tabSubmitKey]);
    chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG", tabId: activeTabId });
  });
});
