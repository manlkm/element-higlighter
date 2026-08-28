// popup.js — controls the Element Highlighter popup menu.

const toggleBtn = document.getElementById("toggle");
const resetBtn = document.getElementById("reset");
const domainEl = document.getElementById("domain");
const statusEl = document.getElementById("status");

const RESTRICTED_PREFIXES = ["chrome://", "edge://", "about:"];

function isRestrictedUrl(url) {
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function init() {
  const tab = await getActiveTab();
  const url = tab && tab.url ? tab.url : "";

  // Restricted pages (chrome://, edge://, about:) can't run content scripts.
  if (!tab || tab.id == null || isRestrictedUrl(url)) {
    toggleBtn.disabled = true;
    resetBtn.disabled = true;
    setStatus("This page can't be controlled by the extension.");
    return;
  }

  const host = new URL(url).hostname;
  domainEl.textContent = host;

  // How many highlights are currently saved for this domain?
  const stored = (await chrome.storage.local.get(host))[host] || {};
  const count = Object.keys(stored).length;
  resetBtn.disabled = count === 0;

  // Ask the content script whether picker mode is currently on.
  try {
    const state = await chrome.tabs.sendMessage(tab.id, { action: "getState" });
    toggleBtn.textContent = state.isActive
      ? "Stop Highlight Mode"
      : "Start Highlight Mode";
    setStatus(count > 0 ? `${count} highlight(s) saved` : "No highlights saved yet");
  } catch (error) {
    toggleBtn.disabled = true;
    setStatus("Reload this page, then reopen the menu.");
  }
}

toggleBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "togglePickerMode" });
  } catch (error) {
    setStatus("Could not reach the page. Reload it and try again.");
    return;
  }
  // Close the popup so the user can click elements on the page.
  window.close();
});

resetBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "resetHighlights" });
    resetBtn.disabled = true;
    setStatus("Highlights reset for this domain.");
  } catch (error) {
    setStatus("Could not reach the page. Reload it and try again.");
  }
});

init();
