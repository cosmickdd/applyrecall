// ApplyRecall Extension Background Service Worker
// Manages per-tab application context, tab lifecycle, and submission alerts.

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
  }
  return true;
});
