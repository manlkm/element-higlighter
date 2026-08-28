// Element Highlighter - Background Service Worker
//
// Responsibilities:
//   - Register the "Reset Highlights for this Domain" context menu item.
//   - Relay extension icon clicks to the content script to toggle picker mode.
//   - Relay context menu clicks to the content script to reset highlights.

// Schemes where the content script is not allowed to run.
const RESTRICTED_PREFIXES = ["chrome://", "edge://", "about:"];

function isRestrictedUrl(url) {
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "resetHighlights",
    title: "Reset Highlights for this Domain",
    contexts: ["page", "frame", "selection", "link", "image"],
  });
});

// ---------------------------------------------------------------------------
// Icon click handling
// ---------------------------------------------------------------------------
// The extension icon now opens a popup (see `default_popup` in manifest.json),
// so the `chrome.action.onClicked` event no longer fires. Toggling picker mode
// and resetting highlights are handled by popup.js, which sends the same
// "togglePickerMode" / "resetHighlights" messages to the content script.

// ---------------------------------------------------------------------------
// Context menu handler: reset highlights for the current domain.
// ---------------------------------------------------------------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "resetHighlights") return;
  if (!tab || tab.id == null) return;

  const url = tab.url || "";

  if (isRestrictedUrl(url)) {
    console.warn(`Element Highlighter: cannot reset highlights on "${url}".`);
    return;
  }

  chrome.tabs
    .sendMessage(tab.id, { action: "resetHighlights" })
    .catch((error) => {
      console.warn(
        "Element Highlighter: failed to reset highlights. " +
          "The page may need to be refreshed.",
        error
      );
    });
});
