// ApplyRecall Content Script
// Inspects job context, detects application form fields across major ATS platforms,
// executes safe autofill with React/Vue change dispatching, and monitors application submissions.

(function () {
  if (window.__applyrecall_injected) return;
  window.__applyrecall_injected = true;

  console.log("[ApplyRecall] Intelligent content script active on:", window.location.href);

  function formatCompanyName(raw) {
    if (!raw) return "";
    return raw
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  // 1. Intelligent Job Detection across Web, Schema.org, and ATS platforms
  function extractJobContext() {
    let company = "";
    let position = "";
    let description = "";
    let location = "";
    let employmentType = "";
    let source = window.location.hostname.replace("www.", "");
    let atsPlatform = "Web Listing";
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname;

    // A. Detect Known ATS Platforms
    if (hostname.includes("greenhouse.io")) {
      atsPlatform = "Greenhouse";
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length > 0 && parts[0] !== "embed" && parts[0] !== "jobs") {
        company = formatCompanyName(parts[0]);
      } else if (parts.length > 1 && (parts[0] === "embed" || parts[0] === "jobs")) {
        company = formatCompanyName(parts[1]);
      }
    } else if (hostname.includes("lever.co")) {
      atsPlatform = "Lever";
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        company = formatCompanyName(parts[0]);
      }
    } else if (hostname.includes("ashbyhq.com")) {
      atsPlatform = "Ashby";
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        company = formatCompanyName(parts[0]);
      }
    } else if (hostname.includes("myworkdayjobs.com")) {
      atsPlatform = "Workday";
      const sub = hostname.split(".")[0];
      if (sub && sub !== "www") {
        company = formatCompanyName(sub);
      }
    } else if (hostname.includes("smartrecruiters.com")) {
      atsPlatform = "SmartRecruiters";
    } else if (hostname.includes("taleo.net") || hostname.includes("oraclecloud.com")) {
      atsPlatform = "Oracle Taleo";
    } else if (hostname.includes("jobvite.com")) {
      atsPlatform = "Jobvite";
    } else if (hostname.includes("linkedin.com")) {
      atsPlatform = "LinkedIn";
    } else if (hostname.includes("indeed.com")) {
      atsPlatform = "Indeed";
    }

    // B. Check JSON-LD for JobPosting (Highest fidelity)
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
                const a = item.jobLocation.address;
                location = [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(", ");
              }
            }
            employmentType = item.employmentType || employmentType;
            break;
          }
        }
      } catch (_) {}
    }

    // C. Check Meta tags
    if (!position) {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content ||
                       document.querySelector('meta[name="twitter:title"]')?.content;
      if (ogTitle) {
        const parts = ogTitle.split(/ at | - | \| |: /i);
        if (parts.length >= 2) {
          position = parts[0].trim();
          company = company || formatCompanyName(parts[1].trim());
        } else {
          position = ogTitle.trim();
        }
      }
    }

    // D. Check Headings & Document Title
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
        company = formatCompanyName(hostParts[hostParts.length - 2]);
      } else {
        company = "Target Company";
      }
    }

    return {
      company,
      position,
      job_url: window.location.href,
      source,
      ats_platform: atsPlatform,
      description: description.substring(0, 500),
      location,
      employment_type: employmentType
    };
  }

  // 2. Sensitive Field Identification (Protects passwords, financial & identity secrets)
  function isSensitiveField(el) {
    const type = (el.type || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
    const prompt = (getFieldPrompt(el) || "").toLowerCase();

    if (type === "password" || type === "file") return true;

    const sensitiveTerms = [
      "password", "pwd", "token", "otp", "secret", "cvv", "creditcard",
      "cardnumber", "ssn", "socialsecurity", "social_security", "bank", "routing",
      "captcha", "recaptcha", "pin", "passcode"
    ];

    for (const term of sensitiveTerms) {
      if (name.includes(term) || id.includes(term) || autocomplete.includes(term) || prompt.includes(term)) {
        return true;
      }
    }
    return false;
  }

  // 3. Robust Field Label Resolution (Handles ARIA, containers, labels, and placeholders)
  function getFieldPrompt(el) {
    if (!el) return "";

    // A. Explicit <label for="id">
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
    }

    // B. Ancestor <label> wrapper
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.innerText.trim()) {
      return parentLabel.innerText.trim();
    }

    // C. ARIA labelled-by attribute
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/);
      const texts = ids.map(id => document.getElementById(id)?.innerText?.trim()).filter(Boolean);
      if (texts.length > 0) return texts.join(" ");
    }

    // D. Direct ARIA label or title
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    if (el.getAttribute("title")) return el.getAttribute("title").trim();

    // E. Sibling or parent container label (Common in Workday, Lever, modern React forms)
    const container = el.closest(".form-group, .field, [class*='field'], [class*='input'], [class*='form-item'], [data-automation-id]");
    if (container) {
      const containerLabel = container.querySelector("label, [class*='label'], [class*='title'], [class*='prompt'], legend");
      if (containerLabel && containerLabel !== el && containerLabel.innerText.trim()) {
        return containerLabel.innerText.trim();
      }
    }

    // F. Placeholder
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();

    // G. Name or ID attribute fallback
    if (el.name) return el.name.replace(/[-_]/g, " ").trim();
    if (el.id) return el.id.replace(/[-_]/g, " ").trim();

    return "";
  }

  // 4. Form Inspection
  function inspectPageFormFields() {
    const inputs = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
    const actionableFields = [];
    const essayFields = [];

    for (const el of inputs) {
      if (isSensitiveField(el)) continue;
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") continue;

      const prompt = getFieldPrompt(el);
      const isContentEditable = el.getAttribute("contenteditable") === "true";
      const isLongText = isContentEditable || el.tagName.toLowerCase() === "textarea" || (el.type === "text" && (prompt.length > 30 || (el.rows && el.rows > 2)));
      const hasValue = !!(isContentEditable ? (el.innerText && el.innerText.trim().length > 0) : (el.value && el.value.trim().length > 0));

      const fieldInfo = {
        id: el.id || "",
        name: el.name || "",
        type: isContentEditable ? "contenteditable" : (el.type || el.tagName.toLowerCase()),
        prompt: prompt,
        isLongText: isLongText,
        currentValue: isContentEditable ? (el.innerText || "") : (el.value || ""),
        hasValue: hasValue
      };

      actionableFields.push(fieldInfo);

      if (isLongText && prompt) {
        essayFields.push(fieldInfo);
      }
    }

    return { fields: actionableFields, essayFields: essayFields };
  }

  // 5. Visual Highlighting on the live page
  function highlightElement(element) {
    if (!element || !element.style) return;
    const prevTransition = element.style.transition;
    const prevOutline = element.style.outline;
    const prevBg = element.style.backgroundColor;

    element.style.transition = "all 0.25s ease-in-out";
    element.style.outline = "2px solid #2563EB";
    element.style.backgroundColor = "#EFF6FF";

    setTimeout(() => {
      element.style.outline = "2px solid #10B981";
      element.style.backgroundColor = "#F0FDF4";
    }, 350);

    setTimeout(() => {
      element.style.outline = prevOutline || "";
      element.style.backgroundColor = prevBg || "";
      element.style.transition = prevTransition || "";
    }, 1800);
  }

  // 6. Native Value Assignment with React/Vue Synthetic Event Emulation
  function setNativeValue(element, value) {
    if (!element || value === null || value === undefined) return false;
    const strVal = String(value);

    // Handle ContentEditable elements
    if (element.getAttribute("contenteditable") === "true") {
      try {
        element.focus();
        element.innerText = strVal;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        highlightElement(element);
        return true;
      } catch (_) {
        return false;
      }
    }

    // Handle Select Elements
    if (element.tagName && element.tagName.toLowerCase() === "select") {
      let matchedIndex = -1;
      const lowerVal = strVal.toLowerCase().trim();

      // Pass 1: exact value match
      for (let i = 0; i < element.options.length; i++) {
        if (element.options[i].value.toLowerCase().trim() === lowerVal) {
          matchedIndex = i;
          break;
        }
      }
      // Pass 2: exact text match
      if (matchedIndex === -1) {
        for (let i = 0; i < element.options.length; i++) {
          if (element.options[i].text.toLowerCase().trim() === lowerVal) {
            matchedIndex = i;
            break;
          }
        }
      }
      // Pass 3: substring / contains match
      if (matchedIndex === -1 && lowerVal.length >= 3) {
        for (let i = 0; i < element.options.length; i++) {
          const optText = element.options[i].text.toLowerCase();
          const optVal = element.options[i].value.toLowerCase();
          if (optText.includes(lowerVal) || lowerVal.includes(optText) || optVal.includes(lowerVal)) {
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        element.selectedIndex = matchedIndex;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        highlightElement(element);
        return true;
      }
      return false;
    }

    // Handle Input and Textarea (React 16+ setter bypass)
    try {
      element.focus();
    } catch (_) {}

    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, strVal);
    } else if (valueSetter) {
      valueSetter.call(element, strVal);
    } else {
      element.value = strVal;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    const verified = element.value === strVal;
    highlightElement(element);
    return verified;
  }

  // 7. Execute Smart Autofill with Protection for Existing Content
  function executeAutofill(profile, matchedAnswers, forceOverwrite = false) {
    if (!profile) return { filledCount: 0, skippedCount: 0, filledDetails: [], skippedDetails: [] };

    const inputs = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
    let filledCount = 0;
    let skippedCount = 0;
    const filledDetails = [];
    const skippedDetails = [];

    // Precompute profile fields
    const fullName = profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    const firstName = profile.first_name || (fullName ? fullName.split(" ")[0] : "");
    const lastName = profile.last_name || (fullName ? fullName.split(" ").slice(1).join(" ") : "");

    for (const el of inputs) {
      if (isSensitiveField(el)) continue;
      if (el.type === "hidden" || el.type === "submit" || el.type === "button") continue;

      const isContentEditable = el.getAttribute("contenteditable") === "true";
      const prompt = getFieldPrompt(el).toLowerCase().trim();
      const name = (el.name || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const id = (el.id || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const placeholder = (el.placeholder || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const dataAutomation = (el.getAttribute("data-automation-id") || el.getAttribute("data-qa") || el.getAttribute("data-testid") || "").toLowerCase().replace(/[-_]/g, " ").trim();

      const combined = `${prompt} ${name} ${id} ${placeholder} ${autocomplete} ${ariaLabel} ${dataAutomation}`.toLowerCase();

      let fillVal = null;
      let matchedLabel = "";

      // 1. First Name
      if (
        combined.includes("first name") ||
        combined.includes("given name") ||
        combined.includes("firstname") ||
        autocomplete === "given-name" ||
        name === "fname" ||
        id === "fname" ||
        name === "first" ||
        id === "first" ||
        dataAutomation.includes("firstname")
      ) {
        fillVal = firstName;
        matchedLabel = "First Name";
      }
      // 2. Last Name
      else if (
        combined.includes("last name") ||
        combined.includes("family name") ||
        combined.includes("surname") ||
        combined.includes("lastname") ||
        autocomplete === "family-name" ||
        name === "lname" ||
        id === "lname" ||
        name === "last" ||
        id === "last" ||
        dataAutomation.includes("lastname")
      ) {
        fillVal = lastName;
        matchedLabel = "Last Name";
      }
      // 3. Full Name (only if not already matched as first/last name)
      else if (
        (combined.includes("full name") ||
         combined.includes("your name") ||
         combined.includes("legal name") ||
         combined.includes("candidate name") ||
         autocomplete === "name" ||
         name === "name" ||
         id === "name") &&
        !combined.includes("company")
      ) {
        fillVal = fullName;
        matchedLabel = "Full Name";
      }
      // 4. Email Address
      else if (
        el.type === "email" ||
        combined.includes("email") ||
        autocomplete === "email"
      ) {
        fillVal = profile.email;
        matchedLabel = "Email Address";
      }
      // 5. Phone Number
      else if (
        el.type === "tel" ||
        combined.includes("phone") ||
        combined.includes("mobile") ||
        combined.includes("telephone") ||
        combined.includes("cell") ||
        autocomplete === "tel"
      ) {
        fillVal = profile.phone;
        matchedLabel = "Phone Number";
      }
      // 6. City / Address City
      else if (
        combined.includes("city") ||
        autocomplete === "address-level2" ||
        combined.includes("current city")
      ) {
        fillVal = profile.city;
        matchedLabel = "City";
      }
      // 7. Country
      else if (
        combined.includes("country") ||
        autocomplete === "country" ||
        autocomplete === "country-name"
      ) {
        fillVal = profile.country;
        matchedLabel = "Country";
      }
      // 8. University / College / Institution
      else if (
        combined.includes("college") ||
        combined.includes("university") ||
        combined.includes("school") ||
        combined.includes("institution") ||
        combined.includes("campus")
      ) {
        fillVal = profile.college;
        matchedLabel = "University";
      }
      // 9. Degree / Major / Branch
      else if (
        combined.includes("degree") ||
        combined.includes("major") ||
        combined.includes("branch") ||
        combined.includes("field of study") ||
        combined.includes("program")
      ) {
        fillVal = profile.degree || profile.branch;
        matchedLabel = "Degree / Major";
      }
      // 10. Graduation Year
      else if (
        combined.includes("graduation year") ||
        combined.includes("grad year") ||
        combined.includes("year of graduation") ||
        combined.includes("expected graduation") ||
        combined.includes("completion year")
      ) {
        fillVal = profile.graduation_year;
        matchedLabel = "Graduation Year";
      }
      // 11. LinkedIn URL
      else if (combined.includes("linkedin")) {
        fillVal = profile.linkedin_url;
        matchedLabel = "LinkedIn Profile";
      }
      // 12. GitHub URL
      else if (combined.includes("github")) {
        fillVal = profile.github_url;
        matchedLabel = "GitHub Profile";
      }
      // 13. Portfolio / Website
      else if (
        combined.includes("portfolio") ||
        combined.includes("website") ||
        combined.includes("personal site") ||
        combined.includes("personal url")
      ) {
        fillVal = profile.portfolio_url;
        matchedLabel = "Portfolio Website";
      }
      // 14. Summary / Bio / About You
      else if (
        (el.tagName === "TEXTAREA" || isContentEditable) &&
        (combined.includes("summary") ||
         combined.includes("about you") ||
         combined.includes("about yourself") ||
         combined.includes("bio") ||
         combined.includes("tell us about yourself"))
      ) {
        fillVal = profile.summary;
        matchedLabel = "Professional Summary";
      }

      // 15. Check Matched Answers Library for Essay / Open Questions
      if (!fillVal && matchedAnswers && matchedAnswers.length > 0) {
        for (const ansItem of matchedAnswers) {
          const isIdMatch = el.id && ansItem.fieldId && el.id === ansItem.fieldId;
          const isNameMatch = el.name && ansItem.fieldName && el.name === ansItem.fieldName;
          const isPromptMatch = prompt && ansItem.prompt && (
            prompt === ansItem.prompt.toLowerCase().trim() ||
            prompt.includes(ansItem.prompt.toLowerCase().trim()) ||
            ansItem.prompt.toLowerCase().trim().includes(prompt)
          );

          if (isIdMatch || isNameMatch || isPromptMatch) {
            fillVal = ansItem.answerText;
            matchedLabel = ansItem.questionTitle || "Saved Answer";
            break;
          }
        }
      }

      if (fillVal) {
        // Safe check: do NOT overwrite non-empty fields unless forceOverwrite is enabled
        const existingVal = isContentEditable ? (el.innerText || "").trim() : (el.value || "").trim();
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

  // 8. Monitor Form Submission
  document.addEventListener("submit", function (e) {
    const form = e.target;
    if (form && form.elements) {
      const inputs = Array.from(form.elements).filter(el =>
        el.tagName !== "BUTTON" && el.type !== "submit" && el.type !== "hidden"
      );
      if (inputs.length >= 2) {
        chrome.runtime.sendMessage({ type: "APPLICATION_SUBMIT_DETECTED" });
      }
    }
  }, true);

  // 9. Chrome Runtime Message Listener
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
      const el = document.getElementById(request.fieldId) ||
                 document.querySelector(`[name="${CSS.escape(request.fieldName || "")}"]`) ||
                 document.querySelector(`[aria-label="${CSS.escape(request.prompt || "")}"]`);
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
