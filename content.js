// Element Highlighter - Content Script
//
// Manages highlight state, DOM events, the floating color-picker UI, and
// per-domain persistence of highlights via chrome.storage.local.

// ---------------------------------------------------------------------------
// 1. State Management
// ---------------------------------------------------------------------------
let isActive = false;          // Whether "selection mode" is currently on.
let targetElement = null;      // The element the user clicked to highlight.
let hoveredElement = null;     // The element currently under the cursor.
let savedOutline = null;       // Original inline `outline` of the hovered element.
let savedOutlineOffset = null; // Original inline `outline-offset` of the hovered element.
let pickerUI = null;           // The floating color-picker <div>.

const HOVER_OUTLINE = "2px solid #3879d9";
const HOVER_OUTLINE_OFFSET = "-2px";
const HIGHLIGHT_ATTR = "data-highlighter-custom";

// ---------------------------------------------------------------------------
// 2. Message Listener (from background.js)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.action === "getState") {
    sendResponse({ isActive });
    return;
  }

  if (message.action === "togglePickerMode") {
    togglePickerMode();
  } else if (message.action === "resetHighlights") {
    resetHighlights();
  }
});

function togglePickerMode() {
  isActive = !isActive;
  document.body.style.cursor = isActive ? "crosshair" : "default";

  if (isActive) {
    initPickerUI();
    if (pickerUI) pickerUI.style.display = "none"; // hidden until an element is picked
  } else {
    clearHoverOutline();
  }
}

// ---------------------------------------------------------------------------
// 3. Hover Effect (Selection Mode)
// ---------------------------------------------------------------------------
function handleMouseOver(event) {
  if (!isActive) return;

  const el = event.target;
  // Ignore the picker UI itself while hovering during selection mode.
  if (pickerUI && (el === pickerUI || pickerUI.contains(el))) return;

  hoveredElement = el;
  savedOutline = el.style.outline;
  savedOutlineOffset = el.style.outlineOffset;

  el.style.outline = HOVER_OUTLINE;
  el.style.outlineOffset = HOVER_OUTLINE_OFFSET;
}

function handleMouseOut(event) {
  if (!isActive) return;
  if (event.target === hoveredElement) {
    clearHoverOutline();
  }
}

function clearHoverOutline() {
  if (!hoveredElement) return;

  hoveredElement.style.outline = savedOutline || "";
  hoveredElement.style.outlineOffset = savedOutlineOffset || "";

  hoveredElement = null;
  savedOutline = null;
  savedOutlineOffset = null;
}

// ---------------------------------------------------------------------------
// 4. Click Handling & Floating UI
// ---------------------------------------------------------------------------
function handleClick(event) {
  if (isActive) {
    event.preventDefault();
    event.stopPropagation();

    clearHoverOutline();
    targetElement = event.target;

    showPickerUI(event.pageX + 10, event.pageY + 10);

    isActive = false;
    document.body.style.cursor = "default";
    return;
  }

  // Selection mode is off: dismiss the picker when clicking outside of it.
  if (pickerUI && !pickerUI.contains(event.target)) {
    hidePickerUI();
  }
}

function initPickerUI() {
  if (pickerUI) return;

  pickerUI = document.createElement("div");
  pickerUI.setAttribute("data-highlighter-picker", "true");
  pickerUI.style.position = "fixed";
  pickerUI.style.display = "none";
  pickerUI.style.zIndex = "2147483647";
  pickerUI.style.alignItems = "center";
  pickerUI.style.gap = "8px";
  pickerUI.style.padding = "8px 10px";
  pickerUI.style.background = "#ffffff";
  pickerUI.style.border = "1px solid #cccccc";
  pickerUI.style.borderRadius = "6px";
  pickerUI.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = "#ff0000";
  colorInput.addEventListener("input", handleColorInput);

  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.textContent = "Done";
  doneButton.addEventListener("click", (event) => {
    event.stopPropagation();
    hidePickerUI();
  });

  pickerUI.appendChild(colorInput);
  pickerUI.appendChild(doneButton);
  document.body.appendChild(pickerUI);
}

function showPickerUI(x, y) {
  initPickerUI();
  pickerUI.style.left = x + "px";
  pickerUI.style.top = y + "px";
  pickerUI.style.display = "flex";
}

function hidePickerUI() {
  if (pickerUI) pickerUI.style.display = "none";
  targetElement = null;
}

function handleColorInput(event) {
  if (!targetElement) return;

  const color = event.target.value;
  targetElement.style.backgroundColor = color;
  targetElement.setAttribute(HIGHLIGHT_ATTR, "true");
  saveHighlight(targetElement, color);
}

// ---------------------------------------------------------------------------
// 5. Storage & Persistence
// ---------------------------------------------------------------------------
function getDomainKey() {
  return window.location.hostname;
}

async function saveHighlight(el, color) {
  const selector = getCssPath(el);
  const domain = getDomainKey();

  const stored = (await chrome.storage.local.get(domain))[domain] || {};
  stored[selector] = color;

  await chrome.storage.local.set({ [domain]: stored });
}

async function loadHighlights() {
  const domain = getDomainKey();
  const stored = (await chrome.storage.local.get(domain))[domain] || {};

  for (const [selector, color] of Object.entries(stored)) {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.backgroundColor = color;
      el.setAttribute(HIGHLIGHT_ATTR, "true");
    });
  }
}

async function resetHighlights() {
  const domain = getDomainKey();
  await chrome.storage.local.remove(domain);

  document
    .querySelectorAll(`[${HIGHLIGHT_ATTR}="true"]`)
    .forEach((el) => {
      el.style.backgroundColor = "";
      el.removeAttribute(HIGHLIGHT_ATTR);
    });
}

// ---------------------------------------------------------------------------
// 6. CSS Selector Generation
// ---------------------------------------------------------------------------
function getCssPath(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";

  const segments = [];
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    // If an element has an ID, use it and stop — IDs are unique.
    if (current.id) {
      segments.unshift("#" + cssEscape(current.id));
      break;
    }

    segments.unshift(tagWithNthOfType(current));
    current = current.parentNode;
  }

  return segments.join(" > ");
}

function tagWithNthOfType(el) {
  const tag = el.nodeName.toLowerCase();

  // Count this element's position among same-typed siblings (1-based).
  let index = 1;
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.nodeName === el.nodeName) index++;
    sibling = sibling.previousElementSibling;
  }

  // Determine whether any following sibling shares this element's type.
  let hasFollowingSameType = false;
  sibling = el.nextElementSibling;
  while (sibling) {
    if (sibling.nodeName === el.nodeName) {
      hasFollowingSameType = true;
      break;
    }
    sibling = sibling.nextElementSibling;
  }

  // Only qualify with :nth-of-type() when it is required for uniqueness.
  if (index === 1 && !hasFollowingSameType) return tag;
  return `${tag}:nth-of-type(${index})`;
}

function cssEscape(value) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

// ---------------------------------------------------------------------------
// Event wiring & initial load
// ---------------------------------------------------------------------------
document.addEventListener("mouseover", handleMouseOver, true);
document.addEventListener("mouseout", handleMouseOut, true);
document.addEventListener("click", handleClick, true);

// Apply any previously saved highlights for this domain.
loadHighlights();
