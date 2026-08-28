# Chrome Extension Specification: Element Highlighter

## 1. Project Overview

A Chrome extension that allows users to highlight specific HTML elements on any webpage with a custom color. The extension must persist these highlights by domain using `chrome.storage.local`.

## 2. File Structure

* `manifest.json`: Extension configuration.
* `background.js`: Service worker for extension icon clicks and context menus.
* `content.js`: Content script injected into all pages for DOM manipulation and UI rendering.

## 3. Technical Requirements & Implementation Details

### A. `manifest.json`

* **Version:** Manifest V3.
* **Permissions:** `storage`, `activeTab`, `scripting`, `contextMenus`.
* **Host Permissions:** `<all_urls>`.
* **Action:** Default action to act as a toggle button.
* **Background:** Register `background.js` as a service worker.
* **Content Scripts:** Inject `content.js` into `<all_urls>`.

### B. `background.js` (Service Worker)

* **Initialization:** On extension install (`chrome.runtime.onInstalled`), create a context menu item with ID `resetHighlights` and title "Reset Highlights for this Domain".
* **Icon Click Handler (`chrome.action.onClicked`):**
* Check the current tab URL. If it starts with `chrome://`, `edge://`, or `about:`, abort execution and log a warning.
* Send a message to the active tab: `{ action: "togglePickerMode" }`.
* Catch and handle connection errors (e.g., when a page needs a refresh).


* **Context Menu Handler (`chrome.contextMenus.onClicked`):**
* If the clicked item is `resetHighlights`, verify the URL is valid (not `chrome://` etc.).
* Send a message to the active tab: `{ action: "resetHighlights" }`.



### C. `content.js` (Content Script)

This script manages the state, DOM events, and custom UI.

**1. State Management**

* Maintain variables for: `isActive` (boolean), `targetElement` (DOM node), `hoveredElement` (DOM node), `savedOutline` (string), and `pickerUI` (DOM node).

**2. Message Listener**

* Listen for `togglePickerMode`: Toggle `isActive`. Update `document.body.style.cursor` to `crosshair` (if active) or `default` (if inactive). Call `initPickerUI()` if active. If toggled off, clear any active hover outlines.
* Listen for `resetHighlights`: Clear storage for the current domain and remove background colors from all elements marked with custom attributes.

**3. Hover Effect (Selection Mode)**

* `mouseover` event (when `isActive` is true): Save the target element's existing `outline` style. Apply `2px solid #3879d9` with an `outline-offset` of `-2px`.
* `mouseout` event: Restore the saved outline style.

**4. Click Handling & Floating UI**

* `click` event:
* If `isActive` is false: Check if the click is outside the `pickerUI`. If so, hide the `pickerUI`.
* If `isActive` is true: Prevent default and stop propagation. Clear the hover outline. Save the clicked element as `targetElement`.
* Position the `pickerUI` at `e.pageX + 10px` and `e.pageY + 10px`. Set its display to `flex`. Reset `isActive` to false and cursor to `default`.


* **Crucial UI Constraint:** Do *not* use a hidden `<input type="color">` triggered programmatically, as modern Chrome security blocks this. Instead, inject a visible, floating `<div>` (`pickerUI`) containing a visible `<input type="color">` and a "Done" button. Set the UI `z-index` to the maximum value (`2147483647`).

**5. Storage & Persistence**

* **Domain Key:** Use `window.location.hostname` as the storage key.
* **Data Structure:** Store an object mapping CSS selectors to hex color strings. `{"domain.com": {"div > p:nth-of-type(2)": "#ff0000"}}`.
* **Save Logic:** When the color input fires the `input` event, update the `targetElement` background color, add a custom attribute (`data-highlighter-custom="true"`), and save to `chrome.storage.local`.
* **Load Logic:** On script load, fetch the domain data from storage. Iterate through the selectors, find the elements, apply the background colors, and add the custom attribute.
* **Reset Logic:** Remove the domain key from storage, find all elements with `data-highlighter-custom="true"`, remove their inline background colors, and remove the attribute.

**6. CSS Selector Generation**

* Implement a robust DOM traversal function `getCssPath(el)` to generate a unique CSS selector for any clicked element.
* Logic: Traverse up the DOM tree. If an element has an ID, use it and stop. Otherwise, use the tag name and calculate its `:nth-of-type()` index relative to its siblings. Join the path with `>`.