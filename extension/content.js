// ApplyRecall Content Script
// Inspects job context, detects application form fields, executes safe autofill without overwriting, and monitors submission.

(function () {
  if (window.__applyrecall_injected) return;
  window.__applyrecall_injected = true;

  console.log("[ApplyRecall] Content script initialized on:", window.location.href);

  // 1. Job Detection
  function extractJobContext() {
    let company = "";
    let position = "";
    let description = "";
    let location = "";
    let employmentType = "";
    let source = window.location.hostname.replace("www.", "");

    // A. Check JSON-LD for JobPosting
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const postings = Array.isArray(data) ? data : [data];
        for (const item of postings) {
          if (item["@type"] === "JobPosting") {
            position = item.title || item.name || position;
            if (item.hiringOrganization) {
              company = item.hiringOrganization.name || company;
            }
            description = item.description || description;
            if (item.jobLocation) {
              if (typeof item.jobLocation === "string") location = item.jobLocation;
              else if (item.jobLocation.address) {
                location = item.jobLocation.address.addressLocality || item.jobLocation.address.addressRegion || "";
              }
            }
            employmentType = item.employmentType || employmentType;
            break;
          }
        }
      } catch (e) {}
    }

    // B. Check Meta tags if missing
    if (!position) {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
      if (ogTitle) {
        const parts = ogTitle.split(/ at | - | \| |: /i);
        if (parts.length >= 2) {
          position = parts[0].trim();
          company = company || parts[1].trim();
        } else {
          position = ogTitle.trim();
        }
      }
    }

    // C. Check Headings & Document Title
    if (!position) {
      const h1 = document.querySelector("h1");
      if (h1 && h1.innerText.trim()) {
        position = h1.innerText.trim();
      } else {
        position = document.title.split(/ - | \| /)[0].trim() || "Applicant Role";
      }
    }

    if (!company) {
      const hostParts = window.location.hostname.split(".");
      if (hostParts.length > 1) {
        company = hostParts[hostParts.length - 2].toUpperCase();
      } else {
        company = "Target Company";
      }
    }

    return {
      company,
      position,
      job_url: window.location.href,
      source,
      description: description.substring(0, 500),
      location,
      employment_type: employmentType
    };
  }

  // 2. Sensitive Field Checking
  function isSensitiveField(el) {
    const type = (el.type || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const autocomplete = (el.autocomplete || "").toLowerCase();

    const sensitiveTerms = [
      "password", "pwd", "token", "otp", "secret", "cvv", "creditcard",
      "cardnumber", "ssn", "socialsecurity", "bank", "routing", "captcha",
      "salary_expectation", "pin", "passcode"
    ];

    if (type === "password" || type === "file") return true;

    for (const term of sensitiveTerms) {
      if (name.includes(term) || id.includes(term) || autocomplete.includes(term)) {
        return true;
      }
    }
    return false;
  }

  // 3. Resolve Field Label or Prompt
  function getFieldPrompt(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.innerText.trim()) {
      return parentLabel.innerText.trim();
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    if (el.placeholder) return el.placeholder.trim();
    if (el.name) return el.name.replace(/[-_]/g, " ").trim();
    return "";
  }

  // 4. Form Fields Inspection
  function inspectPageFormFields() {
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
    const actionableFields = [];
    const essayFields = [];

    for (const el of inputs) {
      if (isSensitiveField(el)) continue;
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") continue;

      const prompt = getFieldPrompt(el);
      const isLongText = el.tagName.toLowerCase() === "textarea" || (el.type === "text" && (prompt.length > 30 || (el.rows && el.rows > 2)));
      const hasValue = !!(el.value && el.value.trim().length > 0);

      const fieldInfo = {
        id: el.id || "",
        name: el.name || "",
        type: el.type || el.tagName.toLowerCase(),
        prompt: prompt,
        isLongText: isLongText,
        currentValue: el.value || "",
        hasValue: hasValue
      };

      actionableFields.push(fieldInfo);

      if (isLongText && prompt) {
        essayFields.push(fieldInfo);
      }
    }

    return { fields: actionableFields, essayFields: essayFields };
  }

  // 5. Fill Value safely and Trigger Events
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Verify assignment
    const verified = element.value === value;

    // Visual feedback
    element.style.outline = "2px solid #2142E7";
    element.style.backgroundColor = "#EEF2FF";
    element.style.transition = "background-color 0.3s, outline 0.3s";

    return verified;
  }

  // 6. Execute Safe Autofill (Respects existing values unless forceOverwrite is true)
  function executeAutofill(profile, matchedAnswers, forceOverwrite = false) {
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
    let filledCount = 0;
    let skippedCount = 0;
    const filledDetails = [];
    const skippedDetails = [];

    for (const el of inputs) {
      if (isSensitiveField(el)) continue;
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") continue;

      const prompt = getFieldPrompt(el).toLowerCase();
      const name = (el.name || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      const combined = `${prompt} ${name} ${id}`;

      let fillVal = null;
      let matchedLabel = "";

      // Profile mappings
      if (combined.includes("first name") || name === "fname" || id === "fname") {
        fillVal = profile.first_name || (profile.full_name ? profile.full_name.split(" ")[0] : "");
        matchedLabel = "First Name";
      } else if (combined.includes("last name") || name === "lname" || id === "lname") {
        fillVal = profile.last_name || (profile.full_name ? profile.full_name.split(" ").slice(1).join(" ") : "");
        matchedLabel = "Last Name";
      } else if (combined.includes("full name") || combined.includes("your name") || name === "name" || id === "name") {
        fillVal = profile.full_name;
        matchedLabel = "Full Name";
      } else if (combined.includes("email") || el.type === "email") {
        fillVal = profile.email;
        matchedLabel = "Email";
      } else if (combined.includes("phone") || combined.includes("mobile") || el.type === "tel") {
        fillVal = profile.phone;
        matchedLabel = "Phone";
      } else if (combined.includes("city")) {
        fillVal = profile.city;
        matchedLabel = "City";
      } else if (combined.includes("country")) {
        fillVal = profile.country;
        matchedLabel = "Country";
      } else if (combined.includes("college") || combined.includes("university") || combined.includes("school")) {
        fillVal = profile.college;
        matchedLabel = "University";
      } else if (combined.includes("degree") || combined.includes("major") || combined.includes("branch")) {
        fillVal = profile.degree || profile.branch;
        matchedLabel = "Degree";
      } else if (combined.includes("graduation") || combined.includes("grad year")) {
        fillVal = profile.graduation_year;
        matchedLabel = "Graduation Year";
      } else if (combined.includes("linkedin")) {
        fillVal = profile.linkedin_url;
        matchedLabel = "LinkedIn";
      } else if (combined.includes("github")) {
        fillVal = profile.github_url;
        matchedLabel = "GitHub";
      } else if (combined.includes("portfolio") || combined.includes("website")) {
        fillVal = profile.portfolio_url;
        matchedLabel = "Portfolio";
      }

      // Check matched answers library for essay/textareas
      if (!fillVal && matchedAnswers && matchedAnswers.length > 0) {
        for (const ansItem of matchedAnswers) {
          if (ansItem.fieldId && (ansItem.fieldId === el.id || ansItem.fieldName === el.name || ansItem.prompt === getFieldPrompt(el))) {
            fillVal = ansItem.answerText;
            matchedLabel = ansItem.questionTitle || "Saved Answer";
            break;
          }
        }
      }

      if (fillVal) {
        // Safe check: do NOT overwrite non-empty fields unless forceOverwrite is enabled
        const existingVal = (el.value || "").trim();
        if (existingVal && existingVal !== fillVal && !forceOverwrite) {
          skippedCount++;
          skippedDetails.push({ label: matchedLabel, existingValue: existingVal, reason: "field already has content" });
          continue;
        }

        const success = setNativeValue(el, fillVal);
        if (success) {
          filledCount++;
          filledDetails.push({ label: matchedLabel, value: fillVal });
        }
      }
    }

    return { filledCount, skippedCount, filledDetails, skippedDetails };
  }

  // 7. Monitor Submission
  document.addEventListener("submit", function (e) {
    chrome.runtime.sendMessage({ type: "APPLICATION_SUBMIT_DETECTED" });
  }, true);

  // Message Listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_JOB_CONTEXT") {
      const job = extractJobContext();
      sendResponse({ job });
    } else if (request.action === "INSPECT_FORM") {
      const result = inspectPageFormFields();
      sendResponse({ fields: result.fields, essayFields: result.essayFields, count: result.fields.length });
    } else if (request.action === "EXECUTE_AUTOFILL") {
      const result = executeAutofill(request.profile, request.matchedAnswers, !!request.forceOverwrite);
      sendResponse(result);
    } else if (request.action === "FILL_SINGLE_FIELD") {
      const el = document.getElementById(request.fieldId) || document.querySelector(`[name="${request.fieldName}"]`);
      if (el) {
        const ok = setNativeValue(el, request.value);
        sendResponse({ success: ok });
      } else {
        sendResponse({ success: false });
      }
    }
    return true;
  });
})();
