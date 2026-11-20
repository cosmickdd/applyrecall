// ApplyRecall Extension Background Service Worker
// Manages application context persistence across navigation, sync, and badges.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ApplyRecall] Background service worker registered.");
  // Initialize default storage
  chrome.storage.local.get(["user_token", "current_context"], (res) => {
    if (!res.user_token) {
      chrome.action.setBadgeText({ text: "" });
    }
  });
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "APPLICATION_SUBMIT_DETECTED") {
    // Student submitted a form on the page!
    chrome.storage.local.set({ submission_pending: true, submitted_at: new Date().toISOString() });
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#2142E7" });
    sendResponse({ received: true });
  } else if (message.type === "CLEAR_SUBMISSION_FLAG") {
    chrome.storage.local.remove(["submission_pending", "submitted_at"]);
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ cleared: true });
  }
  return true;
});
