// ApplyRecall Content Script
// Inspects job context, detects application form fields across major ATS platforms,
// executes safe autofill with React/Vue change dispatching, and monitors application submissions.
//
// The script runs in every frame (all_frames: true). Frames cannot talk to each other,
// so each frame exposes window.__applyrecall and the background worker aggregates results
// across frames with chrome.scripting.executeScript.

(function () {
  if (window.__applyrecall_injected) return;
  window.__applyrecall_injected = true;

  const isTopFrame = (() => {
    try {
      return window.top === window;
    } catch (_) {
      return false;
    }
  })();

  if (isTopFrame) {
    console.log("[ApplyRecall] Intelligent content script active on:", window.location.href);
  }

  // ---------------------------------------------------------------- DOM helpers
  // Queries must see inside open shadow roots: Workday, Lever and Ashby all render
  // widgets inside custom elements, and document.querySelectorAll never enters them.

  function collectRoots(root, out) {
    out.push(root);
    let elements = [];
    try {
      elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    } catch (_) {
      elements = [];
    }
    for (const el of elements) {
      if (el.shadowRoot) collectRoots(el.shadowRoot, out);
    }
    return out;
  }

  function deepQueryAll(selector) {
    const results = [];
    const seen = new Set();
    for (const root of collectRoots(document, [])) {
      let found = [];
      try {
        found = root.querySelectorAll(selector);
      } catch (_) {
        found = [];
      }
      for (const el of found) {
        if (seen.has(el)) continue;
        seen.add(el);
        results.push(el);
      }
    }
    return results;
  }

  function deepFindByAttribute(attribute, value) {
    if (!value) return null;
    return deepQueryAll(`[${attribute}]`).find((el) => el.getAttribute(attribute) === value) || null;
  }

  function deepGetById(id) {
    if (!id) return null;
    return deepQueryAll("[id]").find((el) => el.id === id) || null;
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    if (el.getClientRects().length === 0) return false;
    let style;
    try {
      style = window.getComputedStyle(el);
    } catch (_) {
      return true;
    }
    if (!style) return true;
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function readValue(el) {
    if (!el) return "";
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
      return (el.innerText || "").trim();
    }
    if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      return (el.value || "").trim();
    }
    const text = (el.innerText || el.textContent || "").trim();
    if (isPlaceholderText(el, text)) return "";
    return text;
  }

  const PLACEHOLDER_TEXTS = [
    "select", "select...", "select…", "select one", "select one...", "select one…",
    "select an option", "choose", "choose...", "choose…", "choose one",
    "search", "search...", "please select", "pick one", "none", "-", "—", "---",
  ];

  function isPlaceholderText(el, text) {
    if (!text) return true;
    const lowered = text.toLowerCase();
    const placeholder = (
      el.getAttribute("aria-placeholder") ||
      el.getAttribute("data-placeholder") ||
      ""
    ).toLowerCase().trim();
    if (placeholder && lowered === placeholder) return true;
    return PLACEHOLDER_TEXTS.includes(lowered);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(fn, timeout = 600, interval = 60) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started <= timeout) {
      try {
        last = fn();
        if (last && (!Array.isArray(last) || last.length > 0)) return last;
      } catch (_) {}
      await sleep(interval);
    }
    try {
      return fn();
    } catch (_) {
      return last;
    }
  }

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

    // A. Explicit <label for="id"> — searched inside the element's own root so
    //    labels inside shadow roots are found (document.querySelector misses them).
    if (el.id) {
      let root = null;
      try {
        root = el.getRootNode();
      } catch (_) {}
      if (root && root.querySelector) {
        let lbl = null;
        try {
          lbl = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        } catch (_) {}
        if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
      }
    }

    // B. Ancestor <label> wrapper
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.innerText.trim()) {
      return parentLabel.innerText.trim();
    }

    // C. ARIA labelled-by attribute
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const texts = ariaLabelledBy
        .split(/\s+/)
        .map((id) => {
          const target = deepGetById(id);
          return target ? (target.innerText || target.textContent || "").trim() : "";
        })
        .filter(Boolean);
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
  const FIELD_SELECTOR = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='combobox']",
    "button[aria-haspopup='listbox' i]",
    "button[aria-haspopup='tree' i]",
  ].join(", ");

  const UNFILLABLE_TYPES = ["hidden", "submit", "button", "reset", "checkbox", "radio", "file", "password"];
  const LISTBOX_POPUPS = ["listbox", "tree"];

  function elementType(el) {
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return "contenteditable";
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return (el.type || "text").toLowerCase();
    return (el.getAttribute("role") || el.tagName).toLowerCase();
  }

  function isFillableField(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";

    if (tag === "input") {
      const type = (el.type || "text").toLowerCase();
      if (UNFILLABLE_TYPES.includes(type)) return false;
    } else if (tag === "button") {
      // A button is only worth filling when it opens a dropdown we can choose from.
      const popup = (el.getAttribute("aria-haspopup") || "").toLowerCase();
      const role = (el.getAttribute("role") || "").toLowerCase();
      if (!LISTBOX_POPUPS.includes(popup) && !["combobox", "button"].includes(role)) return false;
    }

    if (isSensitiveField(el)) return false;
    return true;
  }

  function inspectPageFormFields() {
    const actionableFields = [];
    const essayFields = [];

    for (const el of deepQueryAll(FIELD_SELECTOR)) {
      if (!isFillableField(el)) continue;
      if (!isVisible(el)) continue;

      const prompt = getFieldPrompt(el);
      const isContentEditable = el.getAttribute("contenteditable") === "true";
      const isLongText = isContentEditable || el.tagName.toLowerCase() === "textarea" || (el.type === "text" && (prompt.length > 30 || (el.rows && el.rows > 2)));
      const currentValue = readValue(el);

      const fieldInfo = {
        id: el.id || "",
        name: el.name || "",
        type: elementType(el),
        prompt: prompt,
        isLongText: isLongText,
        currentValue: currentValue,
        hasValue: currentValue.length > 0
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
  function setNativeInputValue(element, strVal) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, strVal);
    } else if (valueSetter) {
      valueSetter.call(element, strVal);
    } else {
      element.value = strVal;
    }
  }

  function setNativeValue(element, value) {
    if (!element || value === null || value === undefined) return false;
    const strVal = String(value);

    // Handle ContentEditable elements
    if (element.getAttribute("contenteditable") === "true") {
      try {
        element.focus();
        element.innerText = strVal;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));
        highlightElement(element);
        return true;
      } catch (_) {
        return false;
      }
    }

    // Handle Select Elements
    if (element.tagName && element.tagName.toLowerCase() === "select") {
      const candidates = Array.from(element.options).map((option) => ({
        label: option.text,
        value: option.value,
      }));
      const pick = pickBestOption(candidates, strVal);
      if (!pick) return false;

      element.selectedIndex = pick.index;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      highlightElement(element);
      return true;
    }

    // Handle Input and Textarea (React 16+ setter bypass)
    try {
      element.focus();
    } catch (_) {}

    setNativeInputValue(element, strVal);

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));

    const verified = element.value === strVal;
    highlightElement(element);
    return verified;
  }

  // 7. Option matching (shared by native <select> and custom listboxes)
  const VALUE_ALIASES = {
    us: ["united states", "united states of america", "usa"],
    usa: ["united states", "united states of america"],
    uk: ["united kingdom", "great britain"],
    uae: ["united arab emirates"],
  };

  function normaliseOptionText(value) {
    return (value || "").toLowerCase().replace(/\s+/g, " ").replace(/[.,;]+$/, "").trim();
  }

  function scoreOption(label, value, desired) {
    const target = normaliseOptionText(desired);
    if (!target) return 0;
    const candidates = [normaliseOptionText(label), normaliseOptionText(value)].filter(Boolean);
    if (candidates.length === 0) return 0;
    if (candidates.some((candidate) => candidate === target)) return 100;
    if (candidates.some((candidate) => candidate.startsWith(target))) return 80;
    const aliases = VALUE_ALIASES[target] || [];
    if (aliases.length && candidates.some((candidate) => aliases.includes(candidate))) return 75;
    if (candidates.some((candidate) => candidate.includes(target))) return 60;
    return 0;
  }

  function pickBestOption(candidates, desired) {
    let best = null;
    candidates.forEach((candidate, index) => {
      const score = scoreOption(candidate.label, candidate.value, desired);
      if (score <= 0) return;
      const labelLength = (candidate.label || "").length;
      if (
        !best ||
        score > best.score ||
        (score === best.score && labelLength < (best.label || "").length)
      ) {
        best = { index, score, label: candidate.label, value: candidate.value };
      }
    });
    return best;
  }

  // 8. Custom dropdown support (Workday / Lever / Ashby listboxes, not native <select>)
  function getComboboxTrigger(el) {
    if (!el) return null;
    if (el.tagName === "SELECT" || el.tagName === "TEXTAREA") return null;

    const role = (el.getAttribute("role") || "").toLowerCase();
    const hasPopup = (el.getAttribute("aria-haspopup") || "").toLowerCase();

    if (role === "combobox") return el;
    if (hasPopup === "listbox" || hasPopup === "tree") return el;
    if (el.getAttribute("aria-expanded") && el.getAttribute("aria-controls")) return el;

    // Inputs/buttons wrapped in a custom-select container
    const wrapper = el.closest(
      "[role='combobox'], [class*='select__control'], [class*='combobox'], [data-automation-id*='dropdown']"
    );
    if (wrapper) {
      const inner = wrapper.querySelector("[role='combobox'], [aria-haspopup='listbox' i], [aria-expanded]");
      return inner || wrapper;
    }
    return null;
  }

  const OPTION_SELECTOR = [
    "[role='option']",
    "li[role='option']",
    "[data-automation-id='promptOption']",
    "[role='listbox'] li",
    ".select__option",
  ].join(", ");

  function visibleOptions(trigger) {
    const controlled = trigger ? trigger.getAttribute("aria-controls") : "";
    const container = controlled ? deepGetById(controlled) : null;
    const selector = container ? "[role='option'], li, [data-automation-id='promptOption']" : OPTION_SELECTOR;
    const roots = container ? [container] : collectRoots(document, []);

    const options = [];
    for (const root of roots) {
      let found = [];
      try {
        found = root.querySelectorAll(selector);
      } catch (_) {
        found = [];
      }
      for (const el of found) {
        if (options.includes(el)) continue;
        if (!isVisible(el)) continue;
        options.push(el);
      }
    }
    return options.slice(0, 400);
  }

  function simulateClick(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new PointerEvent("pointerup", opts));
      }
    } catch (_) {}
    try {
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    } catch (_) {}
  }

  function typeInto(el, value) {
    try {
      el.focus();
    } catch (_) {}
    setNativeInputValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowDown" }));
    } catch (_) {}
  }

  function verifyComboboxValue(trigger, target, label) {
    const expanded = (trigger.getAttribute("aria-expanded") || "").toLowerCase();
    if (expanded === "false") return true;
    const shown = readValue(target || trigger).toLowerCase();
    if (!shown) return false;
    const wanted = (label || "").toLowerCase();
    if (!wanted) return true;
    return shown.includes(wanted) || wanted.includes(shown);
  }

  async function fillCombobox(trigger, target, desired) {
    const clickTarget = trigger || target;
    if (!clickTarget) return false;

    const isTextInput =
      target &&
      target.tagName === "INPUT" &&
      ["", "text", "search"].includes((target.type || "").toLowerCase());

    // Typing first narrows long lists and opens many comboboxes by itself.
    if (isTextInput) typeInto(target, desired);

    let options = await waitFor(() => visibleOptions(clickTarget), 400);

    if (options.length === 0) {
      simulateClick(clickTarget);
      options = await waitFor(() => visibleOptions(clickTarget), 700);
    }

    if (options.length === 0) {
      // Free-text combobox (or a list that renders only after a keystroke).
      if (isTextInput) {
        typeInto(target, desired);
        options = await waitFor(() => visibleOptions(clickTarget), 500);
      }
      if (options.length === 0) {
        const typed = readValue(target);
        return typed.length > 0;
      }
    }

    const candidates = options.map((option) => ({
      label: (option.innerText || option.textContent || "").trim(),
      value: option.getAttribute("data-value") || option.getAttribute("value") || "",
    }));

    const pick = pickBestOption(candidates, desired);
    if (!pick) return false;

    simulateClick(options[pick.index]);
    await sleep(120);

    return verifyComboboxValue(clickTarget, target, pick.label);
  }

  // 8b. Repeated section blocks (work experience, education)
  // Application forms repeat the same small field set once per job or school, so scalar
  // field mapping only ever fills the first copy. These helpers find the section, split it
  // into one block per entry, and fill block n from the profile's experience n.

  const HEADING_SELECTOR = [
    "h1", "h2", "h3", "h4", "h5", "h6", "legend", "[role='heading']",
    "[class*='section-title']", "[class*='sectionTitle']", "[class*='section-header']",
    "[data-automation-id*='sectionTitle']",
  ].join(", ");

  const SECTION_DEFS = {
    experience: {
      heading: /\b(work|professional|employment|relevant|industry)?\s*(experience|history)\b|\bemployment\b|\binternships?\b/i,
      add: /^(?:\+\s*)?add\s+(?:another\s+)?(?:work\s+)?(?:experience|employment|position|job|role)\b/i,
      patterns: [
        /\b(company|employer|organisation|organization|firm)\b/,
        /\b(job title|position|title|role|designation)\b/,
        /\b(start|from|end|to|until|dates?|month|year)\b/,
        /\b(description|responsibilit|duties|achievements?|accomplishments?|summary)\b/,
      ],
    },
    education: {
      heading: /\beducation\b|\bacademic (?:background|history|credentials)\b|\beducational background\b|\bqualifications?\b/i,
      add: /^(?:\+\s*)?add\s+(?:another\s+)?(?:education|school|degree|qualification)\b/i,
      patterns: [
        /\b(school|university|college|institution|academy)\b/,
        /\b(degree|qualification|diploma|bachelor|master|phd)\b/,
        /\b(field of study|major|discipline|subject|speciali[sz]ation|branch)\b/,
        /\b(graduation|completion|grad year|year)\b/,
      ],
    },
    projects: {
      heading: /\bprojects?\b|\bportfolio\b|\bside projects?\b|\bselected work\b|\bpersonal projects?\b/i,
      add: /^(?:\+\s*)?add\s+(?:another\s+)?(?:project|portfolio (?:piece|project))\b/i,
      patterns: [
        /\b(project|portfolio)\b/,
        /\b(technolog|tech stack|tools|skills|stack)/,
        /\b(url|link|github|demo|live)\b/,
        /\b(description|details|summary|about)\b/,
      ],
    },
  };

  // Headings that end a section. Entry sub-titles ("Senior Engineer") are deliberately
  // absent so a card with its own title still belongs to the section around it.
  const SECTION_BOUNDARY = new RegExp(
    [
      "\\b(work|professional|employment|relevant|industry)?\\s*(experience|history)\\b",
      "\\bemployment\\b",
      "\\binternships?\\b",
      "\\beducation\\b",
      "\\bacademic (background|history|credentials)\\b",
      "\\bprojects?\\b",
      "\\bportfolio\\b",
      "\\b(additional|extra)\\s+(information|details|questions)\\b",
      "\\bpersonal\\s+(information|details)\\b",
      "\\bcontact\\s+(information|details)\\b",
      "\\bskills\\b",
      "\\bcertifications?\\b",
      "\\breferences?\\b",
      "\\blinks?\\b",
      "\\bavailability\\b",
      "\\bwork authorization\\b",
    ].join("|"),
    "i"
  );

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function sortByDomOrder(elements) {
    return elements.sort((a, b) => {
      if (a === b) return 0;
      try {
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      } catch (_) {}
      return 0;
    });
  }

  function deepQueryAllWithin(root, selector) {
    if (!root) return [];
    const results = [];
    const seen = new Set();
    for (const scope of collectRoots(root, [])) {
      let found = [];
      try {
        found = scope.querySelectorAll(selector);
      } catch (_) {
        found = [];
      }
      for (const el of found) {
        if (seen.has(el)) continue;
        seen.add(el);
        results.push(el);
      }
    }
    return results;
  }

  function headingText(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function regionNodes(region) {
    if (Array.isArray(region)) return region;
    return region ? [region] : [];
  }

  function fieldsWithin(region) {
    const seen = new Set();
    const results = [];
    for (const node of regionNodes(region)) {
      for (const el of deepQueryAllWithin(node, FIELD_SELECTOR)) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!isFillableField(el) || !isVisible(el)) continue;
        results.push(el);
      }
    }
    return sortByDomOrder(results);
  }

  function describeField(el) {
    const extra = [
      el.name,
      el.id,
      el.getAttribute("aria-label"),
      el.placeholder,
      el.getAttribute("data-automation-id"),
      el.getAttribute("data-qa"),
      el.getAttribute("data-testid"),
    ]
      .filter(Boolean)
      .join(" ");
    const text = `${getFieldPrompt(el)} ${extra}`.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
    return {
      text,
      type: (el.type || "").toLowerCase(),
      isLongText: el.tagName === "TEXTAREA" || el.getAttribute("contenteditable") === "true",
    };
  }

  function containsOtherSectionHeading(node, heading) {
    return deepQueryAllWithin(node, HEADING_SELECTOR).some((candidate) => {
      if (candidate === heading) return false;
      const text = headingText(candidate);
      if (!text || text.length > 80) return false;
      return SECTION_BOUNDARY.test(text);
    });
  }

  function isSectionHeadingElement(node) {
    if (!node || !node.tagName) return false;
    if (/^H[1-6]$/.test(node.tagName)) return true;
    if ((node.getAttribute("role") || "") === "heading") return true;
    const className = typeof node.className === "string" ? node.className : "";
    return /section-title|sectionTitle|section-header/i.test(className);
  }

  function containsSectionHeading(node) {
    // Only real headings count: a field container mentions "Project name" in its text too.
    const headings = isSectionHeadingElement(node) ? [node] : [];
    headings.push(...deepQueryAllWithin(node, HEADING_SELECTOR));
    return headings.some((candidate) => {
      const text = headingText(candidate);
      if (!text || text.length > 80) return false;
      return SECTION_BOUNDARY.test(text);
    });
  }

  function regionAfterHeading(heading) {
    const region = [];
    let node = heading.nextElementSibling;
    while (node) {
      if (isSectionHeadingElement(node)) break;
      region.push(node);
      if (containsSectionHeading(node)) break;
      node = node.nextElementSibling;
    }
    return region;
  }

  function sectionRegionFor(heading) {
    let node = heading.parentElement;
    let best = null;
    for (let depth = 0; node && node !== document.body && depth < 12; depth += 1) {
      if (containsOtherSectionHeading(node, heading)) break;
      if (fieldsWithin(node).length >= 2) best = node;
      node = node.parentElement;
    }
    if (best) return [best];

    // Flat layouts keep the heading and its fields as siblings, so the section has no
    // wrapping element; its fields are the heading's following siblings instead.
    const region = regionAfterHeading(heading);
    return fieldsWithin(region).length > 0 ? region : [];
  }

  function findSectionRoots(key) {
    const def = SECTION_DEFS[key];
    const regions = [];
    for (const heading of deepQueryAll(HEADING_SELECTOR)) {
      if (!isVisible(heading)) continue;
      const text = headingText(heading);
      if (!text || text.length > 80) continue;
      if (!def.heading.test(text)) continue;
      const region = sectionRegionFor(heading);
      if (region.length === 0) continue;
      if (regions.some((existing) => existing[0] === region[0])) continue;
      regions.push(region);
    }

    return regions.filter(
      (region) =>
        !regions.some(
          (other) => other !== region && other[0] !== region[0] && other[0].contains(region[0])
        )
    );
  }

  function nearestGroupContainer(el) {
    let node = el.parentElement;
    while (node && node !== document.body && node.parentElement) {
      if (fieldsWithin(node).length >= 2) return node;
      node = node.parentElement;
    }
    return el.parentElement || document.body;
  }

  function fieldIndexHint(el) {
    const raw = `${el.name || ""} ${el.id || ""}`;
    const bracket = raw.match(/\[(\d{1,2})\]/);
    if (bracket) return Number(bracket[1]);
    const separated = raw.match(/(?:^|[-_])(\d{1,2})(?=[-_]|$)/);
    if (separated) return Number(separated[1]);
    return null;
  }

  function lowestCommonAncestor(elements) {
    let node = elements[0].parentElement;
    while (node && node.parentElement && !elements.every((el) => node.contains(el))) {
      node = node.parentElement;
    }
    return node || elements[0].parentElement;
  }

  function splitBlocksByIndex(fields) {
    const groups = new Map();
    for (const el of fields) {
      const hint = fieldIndexHint(el);
      if (hint === null) return null;
      if (!groups.has(hint)) groups.set(hint, []);
      groups.get(hint).push(el);
    }
    if (groups.size < 2) return null;
    return Array.from(groups.keys())
      .sort((a, b) => a - b)
      .map((key) => ({
        el: lowestCommonAncestor(groups.get(key)),
        fields: sortByDomOrder(groups.get(key)),
        indexed: key,
      }));
  }

  function groupIntoBlocks(fields) {
    const assignment = new Map();
    const containers = [];
    for (const el of fields) {
      const container = nearestGroupContainer(el);
      assignment.set(el, container);
      if (!containers.includes(container)) containers.push(container);
    }

    const outer = containers.filter(
      (container) => !containers.some((other) => other !== container && other.contains(container))
    );

    // Flat forms (one wrapper around every entry) are split by the index in field names.
    if (outer.length <= 1) {
      const split = splitBlocksByIndex(fields);
      if (split) return split;
    }

    const blocks = new Map();
    for (const el of fields) {
      const own = assignment.get(el);
      const owner = outer.find((container) => container === own || container.contains(own)) || own;
      if (!blocks.has(owner)) blocks.set(owner, []);
      blocks.get(owner).push(el);
    }

    return Array.from(blocks.entries()).map(([el, members]) => ({
      el,
      fields: sortByDomOrder(members),
    }));
  }

  function blockMatches(def, fields) {
    const text = fields.map((el) => describeField(el).text).join(" | ");
    return def.patterns.filter((pattern) => pattern.test(text)).length >= 2;
  }

  function blocksInRoot(key, region) {
    const def = SECTION_DEFS[key];
    return groupIntoBlocks(fieldsWithin(region)).filter((block) => blockMatches(def, block.fields));
  }

  function parseLooseDate(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;

    let year = "";
    const yearMatch = text.match(/(?:19|20)\d{2}/);
    if (yearMatch) year = yearMatch[0];

    let month = 0;
    const isoMatch = text.match(/(?:^|\D)((?:19|20)\d{2})[-/](\d{1,2})(?:\D|$)/);
    const slashMatch = text.match(/(?:^|\D)(\d{1,2})[-/]((?:19|20)\d{2})(?:\D|$)/);
    if (isoMatch) {
      month = Number(isoMatch[2]);
    } else if (slashMatch) {
      month = Number(slashMatch[1]);
    } else {
      const lower = text.toLowerCase();
      MONTH_NAMES.forEach((name, index) => {
        if (month) return;
        const short = name.slice(0, 3).toLowerCase();
        if (new RegExp(`\\b${short}`).test(lower)) month = index + 1;
      });
      if (!month && /\bsept/.test(lower)) month = 9;
    }

    if (month < 1 || month > 12) month = 0;

    const monthName = month ? MONTH_NAMES[month - 1] : "";
    const monthNumber = month ? String(month).padStart(2, "0") : "";
    return {
      year,
      month,
      monthName,
      monthNumber,
      iso: year ? `${year}-${monthNumber || "01"}-01` : "",
    };
  }

  function experienceDateValue(el, info, raw, label) {
    const parts = parseLooseDate(raw);
    if (!parts) return null;

    if (info.type === "month") return { label, value: parts.iso ? parts.iso.slice(0, 7) : "" };
    if (info.type === "date") return { label, value: parts.iso };

    const wantsMonth = /\bmonth\b/.test(info.text);
    const wantsYear = /\byear\b/.test(info.text);

    if (wantsMonth && !wantsYear) {
      return {
        label,
        value: parts.monthName || "",
        alternates: [parts.monthNumber, String(parts.month), parts.monthName.slice(0, 3)].filter(Boolean),
      };
    }
    if (wantsYear && !wantsMonth) {
      return { label, value: parts.year };
    }

    const pretty = [parts.monthName, parts.year].filter(Boolean).join(" ");
    return { label, value: pretty || String(raw).trim() };
  }

  function experienceFieldMapping(el, exp) {
    const info = describeField(el);
    const text = info.text;

    if (
      info.isLongText ||
      /\b(description|responsibilit|duties|achievements?|accomplishments?|summary of role)\b/.test(text)
    ) {
      return exp.description ? { label: "Description", value: exp.description } : null;
    }

    if (/\b(company|employer|organisation|organization|firm)\b/.test(text) && !/\b(url|website|link)\b/.test(text)) {
      return exp.company ? { label: "Company", value: exp.company } : null;
    }

    if (/\b(job title|position|title|role|designation)\b/.test(text)) {
      return exp.position ? { label: "Title", value: exp.position } : null;
    }

    if (/\b(start|from|begin)\b/.test(text) && /\b(date|month|year|time)\b/.test(text)) {
      return exp.start_date ? experienceDateValue(el, info, exp.start_date, "Start date") : null;
    }

    if (/\b(end|to|until|through|finish)\b/.test(text) && /\b(date|month|year|time)\b/.test(text)) {
      if (exp.is_current || !exp.end_date) return null;
      return experienceDateValue(el, info, exp.end_date, "End date");
    }

    return null;
  }

  function educationFromProfile(profile) {
    if (!profile) return null;
    const education = {
      college: profile.college || "",
      degree: profile.degree || "",
      branch: profile.branch || "",
      graduation_year: profile.graduation_year || "",
    };
    const filled = Object.values(education).filter(Boolean).length;
    return filled > 0 ? education : null;
  }

  function educationFieldMapping(el, education) {
    const info = describeField(el);
    const text = info.text;
    if (/\b(gpa|grade|percentage|level|type|honou?rs|distinction)\b/.test(text)) return null;

    if (/\b(graduation|grad|completion|passing|end year)\b/.test(text) && /\b(year|date)\b/.test(text)) {
      return education.graduation_year ? { label: "Graduation year", value: education.graduation_year } : null;
    }
    if (/\b(school|university|college|institution|academy)\b/.test(text)) {
      return education.college ? { label: "School", value: education.college } : null;
    }
    if (/\b(degree|qualification|diploma)\b/.test(text)) {
      return education.degree ? { label: "Degree", value: education.degree } : null;
    }
    if (/\b(field of study|major|discipline|subject|speciali[sz]ation|branch|stream)\b/.test(text)) {
      return education.branch ? { label: "Field of study", value: education.branch } : null;
    }
    if (/\byear\b/.test(text)) {
      return education.graduation_year ? { label: "Year", value: education.graduation_year } : null;
    }
    return null;
  }

  function usableExperiences(payload) {
    return Array.isArray(payload.experiences)
      ? payload.experiences.filter((exp) => exp && (exp.company || exp.position)).slice(0, 10)
      : [];
  }

  function usableProjects(payload) {
    return Array.isArray(payload.projects)
      ? payload.projects.filter((project) => project && project.name).slice(0, 10)
      : [];
  }

  // Fields that belong to a repeated block are owned by the per-entry pass; writing the
  // first entry into every block from the scalar rules would poison the later blocks.
  function sectionFieldSet(payload) {
    const fields = new Set();
    const collect = (key, hasData) => {
      if (!hasData) return;
      for (const region of findSectionRoots(key)) {
        for (const block of blocksInRoot(key, region)) {
          block.fields.forEach((el) => fields.add(el));
        }
      }
    };

    collect("experience", usableExperiences(payload).length > 0);
    collect("education", !!educationFromProfile(payload.profile));
    collect("projects", usableProjects(payload).length > 0);
    return fields;
  }

  function projectFieldMapping(el, project) {
    const info = describeField(el);
    const text = info.text;

    if (/\b(technolog|tech stack|tools|skills|stack|languages|frameworks)/.test(text)) {
      return project.technologies ? { label: "Technologies", value: project.technologies } : null;
    }
    if (/\b(url|link|github|demo|website|live)\b/.test(text)) {
      return project.project_url ? { label: "Project URL", value: project.project_url } : null;
    }
    if (info.isLongText || /\b(description|details|summary|about|responsibilit|what it does)\b/.test(text)) {
      return project.description ? { label: "Description", value: project.description } : null;
    }
    if (/\b(name|title)\b/.test(text)) {
      return project.name ? { label: "Project name", value: project.name } : null;
    }
    return null;
  }

  // A scalar field only takes the saved project's description when the prompt is
  // about the project itself. "Describe your project management experience" is an
  // essay question and belongs to the saved-answer library, not to entry one's blurb.
  const PROJECT_SUBJECT = /\bproject\b|\bportfolio (?:piece|project)\b/;
  const PROJECT_ESSAY = /\bexperience\b|\bmanag(?:e[sd]?|ing|ement)\b|\bleadership\b|\bstakeholders?\b|\btimelines?\b|\bbudgets?\b|\bplanning\b|\bcoordination\b|\bscheduling\b|\btracking\b/;
  const PROJECT_DESCRIPTION_ASK = /\b(describe|description|details?|summary|overview|about|what (?:it|this) does|tell (?:us|me) about|explain|walk (?:us|me) through|built|build|building|developed|developing|created|creating|shipped|shipping|worked on|working on|implemented|implementing|your work on)\b/;

  function asksAboutProjectItself(text) {
    return (
      PROJECT_SUBJECT.test(text) &&
      PROJECT_DESCRIPTION_ASK.test(text) &&
      !PROJECT_ESSAY.test(text)
    );
  }

  const PROJECT_TECH = /\btechnolog|\btech stack\b|\btool(?:s|ing)?\b|\bstack\b|\blanguages?\b|\bframeworks?\b/;

  // Same guard for the tech-stack value: "what project management tools do you
  // use" asks about process, not about the saved project's stack.
  function asksAboutProjectTechnologies(text) {
    return (
      PROJECT_SUBJECT.test(text) &&
      PROJECT_TECH.test(text) &&
      !PROJECT_ESSAY.test(text)
    );
  }

  function savedAnswerFor(el, prompt, matchedAnswers) {
    if (!matchedAnswers || matchedAnswers.length === 0) return null;

    for (const ansItem of matchedAnswers) {
      const isIdMatch = el.id && ansItem.fieldId && el.id === ansItem.fieldId;
      const isNameMatch = el.name && ansItem.fieldName && el.name === ansItem.fieldName;
      const isPromptMatch = prompt && ansItem.prompt && (
        prompt === ansItem.prompt.toLowerCase().trim() ||
        prompt.includes(ansItem.prompt.toLowerCase().trim()) ||
        ansItem.prompt.toLowerCase().trim().includes(prompt)
      );

      if (isIdMatch || isNameMatch || isPromptMatch) return ansItem;
    }
    return null;
  }

  function isCurrentCheckbox(el) {
    const label = el.closest("label");
    const text = `${describeField(el).text} ${label ? headingText(label) : ""}`.toLowerCase();
    return /current|present|ongoing|still work/.test(text);
  }

  function uncheckedBoxes(region) {
    const boxes = [];
    const seen = new Set();
    for (const node of regionNodes(region)) {
      for (const el of deepQueryAllWithin(node, "input[type='checkbox']")) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!isVisible(el) || el.checked) continue;
        boxes.push(el);
      }
    }
    return boxes;
  }

  function markCurrent(block, region) {
    if (!block) return false;

    const local = uncheckedBoxes(block.el);
    const context = uncheckedBoxes(region);
    const pools = block.indexed !== undefined
      ? [context.filter((el) => fieldIndexHint(el) === block.indexed), local, context]
      : [local, context];

    const target = pools.map((pool) => pool.find(isCurrentCheckbox)).find(Boolean);
    if (!target) return false;

    simulateClick(target);
    if (!target.checked) {
      try {
        target.checked = true;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
    }
    return true;
  }

  function findAddButton(region, key) {
    const def = SECTION_DEFS[key];
    const seen = new Set();
    const buttons = [];
    for (const node of regionNodes(region)) {
      const scoped = [];
      try {
        if (node.matches && node.matches("button, [role='button'], a[role='button']")) scoped.push(node);
      } catch (_) {}
      scoped.push(...deepQueryAllWithin(node, "button, [role='button'], a[role='button']"));
      for (const el of scoped) {
        if (seen.has(el)) continue;
        seen.add(el);
        buttons.push(el);
      }
    }
    return (
      buttons.find((el) => {
        if (!isVisible(el)) return false;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
        const text = headingText(el);
        if (!text || text.length > 40) return false;
        return def.add.test(text);
      }) || null
    );
  }

  async function fillBlockFields(block, mapper, prefix, forceOverwrite, result, filledEls) {
    let written = 0;

    for (const el of block.fields) {
      if (filledEls.has(el)) continue;
      const mapping = mapper(el);
      if (!mapping) continue;

      const candidates = [mapping.value, ...(mapping.alternates || [])]
        .filter((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim().length > 0)
        .map((candidate) => String(candidate));
      if (candidates.length === 0) continue;

      const existing = readValue(el);
      if (existing && existing === candidates[0]) {
        // Already holds exactly this value (a scalar field filled in the same run).
        filledEls.add(el);
        continue;
      }

      const label = `${prefix} · ${mapping.label}`;
      if (existing && !forceOverwrite) {
        result.skippedCount += 1;
        result.skippedDetails.push({ label, existingValue: existing, reason: "field already has content" });
        continue;
      }

      const combobox = getComboboxTrigger(el);
      for (const candidate of candidates) {
        const success = combobox ? await fillCombobox(combobox, el, candidate) : setNativeValue(el, candidate);
        if (!success) continue;
        filledEls.add(el);
        result.filledCount += 1;
        result.filledDetails.push({ label, value: candidate });
        written += 1;
        break;
      }
    }

    return written;
  }

  async function fillRepeatedList(key, items, prefix, mapFor, forceOverwrite, result, filledEls, afterFill) {
    if (items.length === 0) return 0;

    let next = 0;
    for (const root of findSectionRoots(key)) {
      let blocks = blocksInRoot(key, root);
      let slot = 0;
      let clicks = 0;

      while (next < items.length && slot < 12) {
        if (slot >= blocks.length) {
          const addBtn = clicks < items.length ? findAddButton(root, key) : null;
          if (!addBtn) break;
          simulateClick(addBtn);
          clicks += 1;
          await sleep(400);
          blocks = blocksInRoot(key, root);
          if (slot >= blocks.length) break;
        }

        const item = items[next];
        const block = blocks[slot];
        await fillBlockFields(
          block,
          (el) => mapFor(el, item),
          `${prefix} ${next + 1}`,
          forceOverwrite,
          result,
          filledEls
        );
        if (afterFill) afterFill(block, root, item);
        next += 1;
        slot += 1;
      }
    }

    return next;
  }

  async function fillRepeatedSections(payload) {
    const result = { filledCount: 0, skippedCount: 0, filledDetails: [], skippedDetails: [] };
    const filledEls = new Set();
    const forceOverwrite = !!payload.forceOverwrite;
    const profile = payload.profile || {};

    const experiences = usableExperiences(payload);
    const projects = usableProjects(payload);
    const education = educationFromProfile(profile);

    await fillRepeatedList(
      "experience",
      experiences,
      "Experience",
      experienceFieldMapping,
      forceOverwrite,
      result,
      filledEls,
      (block, root, exp) => {
        if (exp.is_current) markCurrent(block, root);
      }
    );

    await fillRepeatedList(
      "projects",
      projects,
      "Project",
      projectFieldMapping,
      forceOverwrite,
      result,
      filledEls
    );

    if (education) {
      for (const root of findSectionRoots("education")) {
        const block = blocksInRoot("education", root)[0];
        if (!block) continue;
        await fillBlockFields(
          block,
          (el) => educationFieldMapping(el, education),
          "Education",
          forceOverwrite,
          result,
          filledEls
        );
        break;
      }
    }

    return result;
  }

  // 9. Execute Smart Autofill with Protection for Existing Content
  async function executeAutofill(payload) {
    const { profile, matchedAnswers, forceOverwrite } = payload || {};
    const result = { filledCount: 0, skippedCount: 0, filledDetails: [], skippedDetails: [] };
    if (!profile) return result;

    const projects = usableProjects(payload);
    const primaryProject = projects[0] || null;

    // Precompute profile fields
    const fullName = profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    const firstName = profile.first_name || (fullName ? fullName.split(" ")[0] : "");
    const lastName = profile.last_name || (fullName ? fullName.split(" ").slice(1).join(" ") : "");

    const blockedFields = sectionFieldSet(payload);
    const scalarFields = deepQueryAll(FIELD_SELECTOR).filter((el) => !blockedFields.has(el));

    for (const el of scalarFields) {
      if (!isFillableField(el)) continue;
      if (!isVisible(el)) continue;

      const isContentEditable = el.getAttribute("contenteditable") === "true";
      const prompt = getFieldPrompt(el).toLowerCase().trim();
      const name = (el.name || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const id = (el.id || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const placeholder = (el.placeholder || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase().replace(/[-_]/g, " ").trim();
      const dataAutomation = (el.getAttribute("data-automation-id") || el.getAttribute("data-qa") || el.getAttribute("data-testid") || "").toLowerCase().replace(/[-_]/g, " ").trim();

      const combined = `${prompt} ${name} ${id} ${placeholder} ${autocomplete} ${ariaLabel} ${dataAutomation}`.toLowerCase();
      const savedAnswer = savedAnswerFor(el, prompt, matchedAnswers);

      let fillVal = null;
      let matchedLabel = "";

      // 1. First Name
      if (
        combined.includes("first name") ||
        combined.includes("given name") ||
        combined.includes("firstname") ||
        autocomplete === "given name" ||
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
        autocomplete === "family name" ||
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
        autocomplete === "address level2" ||
        combined.includes("current city")
      ) {
        fillVal = profile.city;
        matchedLabel = "City";
      }
      // 7. Country
      else if (
        combined.includes("country") ||
        autocomplete === "country" ||
        autocomplete === "country name"
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
      // 9. Field of study / Major / Branch
      else if (
        combined.includes("field of study") ||
        combined.includes("major") ||
        combined.includes("branch") ||
        combined.includes("specialization") ||
        combined.includes("specialisation")
      ) {
        fillVal = profile.branch || profile.degree;
        matchedLabel = "Field of Study";
      }
      // 9b. Degree / Program
      else if (
        combined.includes("degree") ||
        combined.includes("program") ||
        combined.includes("qualification")
      ) {
        fillVal = profile.degree || profile.branch;
        matchedLabel = "Degree";
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
        fillVal = profile.portfolio_url || (primaryProject ? primaryProject.project_url : "");
        matchedLabel = "Portfolio Website";
      }
      // 13b. Project name
      else if (
        primaryProject &&
        combined.includes("project") &&
        (combined.includes("name") || combined.includes("title"))
      ) {
        fillVal = primaryProject.name;
        matchedLabel = "Project Name";
      }
      // 13c. Project link
      else if (
        primaryProject &&
        combined.includes("project") &&
        (combined.includes("url") || combined.includes("link") || combined.includes("demo"))
      ) {
        fillVal = primaryProject.project_url;
        matchedLabel = "Project Link";
      }
      // 13d. Project technologies (a saved answer for the same prompt wins)
      else if (
        primaryProject &&
        !savedAnswer &&
        asksAboutProjectTechnologies(combined)
      ) {
        fillVal = primaryProject.technologies;
        matchedLabel = "Project Technologies";
      }
      // 13e. Project description (a saved answer for the same prompt wins)
      else if (
        primaryProject &&
        !savedAnswer &&
        asksAboutProjectItself(combined)
      ) {
        fillVal = primaryProject.description;
        matchedLabel = "Project Description";
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
      if (!fillVal && savedAnswer) {
        fillVal = savedAnswer.answerText;
        matchedLabel = savedAnswer.questionTitle || "Saved Answer";
      }

      if (!fillVal) continue;

      // Safe check: do NOT overwrite non-empty fields unless forceOverwrite is enabled
      const existingVal = readValue(el);
      if (existingVal && existingVal !== fillVal && !forceOverwrite) {
        result.skippedCount++;
        result.skippedDetails.push({ label: matchedLabel, existingValue: existingVal, reason: "field already has content" });
        continue;
      }

      const combobox = getComboboxTrigger(el);
      const success = combobox
        ? await fillCombobox(combobox, el, fillVal)
        : setNativeValue(el, fillVal);

      if (success) {
        result.filledCount++;
        result.filledDetails.push({ label: matchedLabel, value: fillVal });
      }
    }

    // Repeated entries (each job and school) are filled after the scalar pass, so the
    // education block inherits the same values without being written twice.
    const sectionResult = await fillRepeatedSections(payload);
    result.filledCount += sectionResult.filledCount;
    result.skippedCount += sectionResult.skippedCount;
    result.filledDetails.push(...sectionResult.filledDetails);
    result.skippedDetails.push(...sectionResult.skippedDetails);

    return result;
  }

  async function fillSingleField(payload) {
    const { fieldId, fieldName, prompt, value } = payload || {};
    let el = deepGetById(fieldId) || deepFindByAttribute("name", fieldName);

    if (!el && prompt) {
      el = deepQueryAll("[aria-label]").find((candidate) => candidate.getAttribute("aria-label") === prompt) || null;
    }
    if (!el) return { success: false };

    const combobox = getComboboxTrigger(el);
    const success = combobox
      ? await fillCombobox(combobox, el, value)
      : setNativeValue(el, value);
    return { success };
  }

  // 10. Monitor Form Submission
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

  // 11. Cross-frame API used by the background aggregator
  window.__applyrecall = {
    job: extractJobContext,
    inspect: inspectPageFormFields,
    fill: (payload) => executeAutofill(payload || {}),
    fillSingle: (payload) => fillSingleField(payload || {}),
  };

  // 12. Chrome Runtime Message Listener (single-frame fallback / manual actions)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return false;

    if (request.action === "GET_JOB_CONTEXT") {
      sendResponse({ job: extractJobContext() });
      return false;
    }

    if (request.action === "INSPECT_FORM") {
      const inspected = inspectPageFormFields();
      sendResponse({ fields: inspected.fields, essayFields: inspected.essayFields, count: inspected.fields.length });
      return false;
    }

    if (request.action === "EXECUTE_AUTOFILL") {
      executeAutofill(request)
        .then(sendResponse)
        .catch((error) => sendResponse({
          filledCount: 0,
          skippedCount: 0,
          filledDetails: [],
          skippedDetails: [],
          error: String(error),
        }));
      return true;
    }

    if (request.action === "FILL_SINGLE_FIELD") {
      fillSingleField(request)
        .then(sendResponse)
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    return false;
  });
})();
