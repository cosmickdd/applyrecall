// ApplyRecall Extension Background Service Worker
// Manages per-tab application context, tab lifecycle, submission alerts, and
// cross-frame aggregation for pages that render their forms inside iframes.

// Clean up tab-specific data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const tabKey = `tab_${tabId}`;
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(k => k.startsWith(tabKey));
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove);
      console.log(`[ApplyRecall] Cleaned up state for closed tab ${tabId}:`, keysToRemove);
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ApplyRecall] Background service worker registered.");
});

// Runs inside every frame. It only calls into the content script's exposed API,
// so it never needs page globals or a second copy of the matching logic.
function frameTask(payload) {
  const api = window.__applyrecall;
  if (!api) return null;
  if (payload.action === "job") return { job: api.job() };
  if (payload.action === "inspect") return api.inspect();
  if (payload.action === "fill") return api.fill(payload);
  if (payload.action === "fillSingle") return api.fillSingle(payload);
  return null;
}

async function runInAllFrames(tabId) {
  try {
    return await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
  } catch (_) {
    return [];
  }
}

async function executeInFrames(tabId, payload, allFrames) {
  return chrome.scripting.executeScript({
    target: allFrames ? { tabId, allFrames: true } : { tabId },
    func: frameTask,
    args: [payload],
  });
}

function mergeInspection(frames) {
  const fields = [];
  const essayFields = [];
  const seen = new Set();

  frames.forEach(({ frameId, result }) => {
    if (!result || !Array.isArray(result.fields)) return;
    result.fields.forEach((field) => {
      const key = `${frameId}|${field.id || field.name || field.prompt}|${fields.length}`;
      if (seen.has(key)) return;
      seen.add(key);
      fields.push({ ...field, frameId });
    });
    (result.essayFields || []).forEach((field) => {
      essayFields.push({ ...field, frameId });
    });
  });

  return { fields, essayFields, count: fields.length };
}

function mergeFillResults(frames) {
  const merged = {
    filledCount: 0,
    skippedCount: 0,
    filledDetails: [],
    skippedDetails: [],
    framesFilled: 0,
  };

  frames.forEach(({ result }) => {
    if (!result) return;
    merged.filledCount += result.filledCount || 0;
    merged.skippedCount += result.skippedCount || 0;
    if ((result.filledCount || 0) > 0) merged.framesFilled += 1;
    if (Array.isArray(result.filledDetails)) {
      merged.filledDetails.push(...result.filledDetails);
    }
    if (Array.isArray(result.skippedDetails)) {
      merged.skippedDetails.push(...result.skippedDetails);
    }
  });

  merged.filledDetails = merged.filledDetails.slice(0, 40);
  merged.skippedDetails = merged.skippedDetails.slice(0, 40);
  return merged;
}

async function aggregate(tabId, payload) {
  // Re-injection makes late-loaded iframes and tabs open since install work too;
  // content.js guards against registering itself twice.
  await runInAllFrames(tabId);

  let frames;
  try {
    frames = await executeInFrames(tabId, payload, true);
  } catch (_) {
    // A restricted frame can fail the whole all-frames call; fall back to the top frame.
    if (payload.action === "job" || payload.action === "inspect" || payload.action === "fill") {
      try {
        frames = await executeInFrames(tabId, payload, false);
      } catch (_) {
        return null;
      }
    } else {
      return null;
    }
  }

  if (!Array.isArray(frames) || frames.length === 0) return null;

  if (payload.action === "job") {
    const top = frames.find((frame) => frame.frameId === 0) || frames[0];
    return top && top.result ? top.result : null;
  }

  if (payload.action === "inspect") {
    return mergeInspection(frames);
  }

  if (payload.action === "fill") {
    return mergeFillResults(frames);
  }

  if (payload.action === "fillSingle") {
    const hit = frames.find((frame) => frame.result && frame.result.success);
    return hit ? hit.result : { success: false };
  }

  return null;
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || (sender.tab && sender.tab.id);

  if (message.type === "APPLICATION_SUBMIT_DETECTED") {
    if (tabId) {
      const tabSubmitKey = `tab_${tabId}_submission_pending`;
      const tabSubmitTimeKey = `tab_${tabId}_submitted_at`;
      const updates = {};
      updates[tabSubmitKey] = true;
      updates[tabSubmitTimeKey] = new Date().toISOString();

      chrome.storage.local.set(updates, () => {
        chrome.action.setBadgeText({ text: "!", tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#2142E7", tabId: tabId });
        sendResponse({ received: true, tabId: tabId });
      });
      return true; // Keep message channel open for async response
    }
    sendResponse({ received: false, error: "No tabId identified" });
  } else if (message.type === "CLEAR_SUBMISSION_FLAG") {
    if (tabId) {
      const tabSubmitKey = `tab_${tabId}_submission_pending`;
      const tabSubmitTimeKey = `tab_${tabId}_submitted_at`;
      chrome.storage.local.remove([tabSubmitKey, tabSubmitTimeKey], () => {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
        sendResponse({ cleared: true, tabId: tabId });
      });
      return true;
    }
    sendResponse({ cleared: false });
  } else if (message.type === "AGGREGATE") {
    if (!tabId || !message.payload) {
      sendResponse(null);
      return false;
    }
    aggregate(tabId, message.payload)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }
  return true;
});
