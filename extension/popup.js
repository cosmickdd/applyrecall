// ApplyRecall Extension Popup Logic
// Connects to backend, manages context, matches answers, triggers safe autofill.

const API_BASE = "http://localhost:8000/api";

document.addEventListener("DOMContentLoaded", async () => {
  const stateNotConnected = document.getElementById("state-not-connected");
  const stateConnected = document.getElementById("state-connected");
  const stateSubmission = document.getElementById("state-submission-confirm");
  const connectionBadge = document.getElementById("connection-badge");
  const userInfoFooter = document.getElementById("user-info-footer");
  const toastEl = document.getElementById("status-toast");

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

  let currentContext = {
    token: null,
    profile: null,
    job: null,
    application: null,
    fields: []
  };

  function showToast(msg, type = "success") {
    toastEl.textContent = msg;
    toastEl.className = `toast toast-${type}`;
    toastEl.classList.remove("hidden");
    setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 4000);
  }

  // Load storage state
  chrome.storage.local.get(
    ["user_token", "user_profile", "active_application", "submission_pending"],
    async (res) => {
      if (res.user_token) {
        currentContext.token = res.user_token;
        currentContext.profile = res.user_profile;
        currentContext.application = res.active_application;

        renderConnectedState();

        // Check if submission is pending
        if (res.submission_pending) {
          stateSubmission.classList.remove("hidden");
        }

        // Detect job & inspect active tab
        await inspectActiveTab();
      } else {
        renderDisconnectedState();
      }
    }
  );

  function renderConnectedState() {
    stateNotConnected.classList.add("hidden");
    stateConnected.classList.remove("hidden");
    connectionBadge.textContent = "Connected";
    connectionBadge.className = "badge badge-success";

    if (currentContext.profile) {
      userInfoFooter.textContent = currentContext.profile.full_name || currentContext.profile.email;
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
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      // Extract Job Context
      chrome.tabs.sendMessage(tab.id, { action: "GET_JOB_CONTEXT" }, (response) => {
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

        if (currentContext.application && currentContext.application.company.toLowerCase() === job.company.toLowerCase()) {
          startAppBtn.textContent = "Application In Progress ✓";
          startAppBtn.disabled = true;
          startAppBtn.className = "btn btn-ghost btn-full";
        }
      });

      // Inspect Fields
      chrome.tabs.sendMessage(tab.id, { action: "INSPECT_FORM" }, (response) => {
        if (!chrome.runtime.lastError && response && response.fields) {
          currentContext.fields = response.fields;
          detectedCountEl.textContent = `${response.count} fields detected`;
          detectedCountEl.className = "badge badge-blue";

          // Auto-prefill new question input if a long-form prompt is detected on the page
          const firstEssay = response.fields.find(f => f.isLongText && f.prompt);
          if (firstEssay && !newQInput.value) {
            newQInput.value = firstEssay.prompt;
            if (firstEssay.currentValue) {
              newAInput.value = firstEssay.currentValue;
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

  // Connect Button handler
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
        body: JSON.stringify({ code: code, device_type: "extension" })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Pairing failed");
      }

      const data = await resp.json();
      currentContext.token = data.token;
      currentContext.profile = data.profile;

      chrome.storage.local.set({
        user_token: data.token,
        user_profile: data.profile
      });

      renderConnectedState();
      showToast("Your application memory is ready.");
      await inspectActiveTab();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      connectBtn.textContent = "Connect Extension";
      connectBtn.disabled = false;
    }
  });

  // Quick Developer Connect handler
  devQuickConnectBtn.addEventListener("click", async () => {
    try {
      devQuickConnectBtn.textContent = "Connecting...";
      const resp = await fetch(`${API_BASE}/profile`, {
        headers: { "Authorization": "Bearer 00000000-0000-0000-0000-000000000001" }
      });
      if (resp.ok) {
        const data = await resp.json();
        const token = "tok_00000000-0000-0000-0000-000000000001";
        currentContext.token = token;
        currentContext.profile = data.profile;

        chrome.storage.local.set({
          user_token: token,
          user_profile: data.profile
        });

        renderConnectedState();
        showToast("Connected to Alex Morgan profile.");
        await inspectActiveTab();
      }
    } catch (e) {
      showToast("Backend not reachable at http://localhost:8000", "error");
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
      const resp = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentContext.token}`
        },
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
        chrome.storage.local.set({ active_application: app });

        startAppBtn.textContent = "Application In Progress ✓";
        startAppBtn.disabled = true;
        startAppBtn.className = "btn btn-ghost btn-full";
        showToast(`Active application context set for ${app.company}.`);
      }
    } catch (e) {
      showToast("Failed to create application context.", "error");
    }
  });

  // Autofill this application
  autofillBtn.addEventListener("click", async () => {
    if (!currentContext.profile) {
      showToast("No profile loaded. Please connect your account.", "error");
      return;
    }

    autofillBtn.textContent = "Autofilling...";
    autofillBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      // 1. Check for long-form answers in library via /api/answers/match
      const matchedAnswers = [];
      const company = currentContext.job ? currentContext.job.company : "";
      const role = currentContext.job ? currentContext.job.position : "";

      for (const field of currentContext.fields) {
        if (field.isLongText && field.prompt) {
          try {
            const matchResp = await fetch(`${API_BASE}/answers/match`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${currentContext.token}`
              },
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

      // 2. Dispatch EXECUTE_AUTOFILL to content script
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "EXECUTE_AUTOFILL",
          profile: currentContext.profile,
          matchedAnswers: matchedAnswers
        },
        (result) => {
          if (!chrome.runtime.lastError && result) {
            resultsPanel.classList.remove("hidden");
            resultsCountBadge.textContent = `${result.filledCount} filled`;
            filledList.innerHTML = "";

            if (result.filledDetails && result.filledDetails.length > 0) {
              result.filledDetails.forEach((item) => {
                const li = document.createElement("li");
                li.innerHTML = `<span>${item.label}</span><strong>✓</strong>`;
                filledList.appendChild(li);
              });
            }

            showToast(`Autofilled ${result.filledCount} fields safely.`);
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

      const resp = await fetch(`${API_BASE}/answers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentContext.token}`
        },
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
        const err = await resp.json();
        showToast(err.detail || "Could not save answer.", "error");
      }
    } catch (e) {
      showToast("Error saving answer.", "error");
    } finally {
      saveAnswerBtn.textContent = "Save to Answer Library";
      saveAnswerBtn.disabled = false;
    }
  });

  // Submission confirmation
  confirmAppliedBtn.addEventListener("click", async () => {
    if (!currentContext.application) {
      // Create quick application record if not already created
      const comp = currentContext.job ? currentContext.job.company : "Target Company";
      const pos = currentContext.job ? currentContext.job.position : "Role";
      const resp = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentContext.token}`
        },
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
        const resp = await fetch(`${API_BASE}/applications/${currentContext.application.id}/confirm-applied`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentContext.token}`
          },
          body: JSON.stringify({
            create_reminder: shouldSchedule,
            reminder_days: 7
          })
        });

        if (resp.ok) {
          stateSubmission.classList.add("hidden");
          chrome.storage.local.remove(["submission_pending"]);
          chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG" });
          showToast("Application saved. I'll help you keep track of what happens next.");
        }
      } catch (e) {
        showToast("Could not confirm application.", "error");
      }
    }
  });

  dismissSubmissionBtn.addEventListener("click", () => {
    stateSubmission.classList.add("hidden");
    chrome.storage.local.remove(["submission_pending"]);
    chrome.runtime.sendMessage({ type: "CLEAR_SUBMISSION_FLAG" });
  });
});
