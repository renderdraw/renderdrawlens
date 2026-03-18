// ============================================================
// Popup — Quick Mode Toggle & Status
// ============================================================

import type { AnnotationMode } from "../shared/raf-schema";
import { MSG } from "../shared/constants";

let isActive = false;
let currentMode: AnnotationMode = "feedback";
let annotationCount = 0;

const app = document.getElementById("app")!;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (HTMLElement | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

// Ensure content script is injected, then send a message to it
async function ensureContentScriptAndSend(tabId: number, message: unknown): Promise<unknown> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response;
  } catch {
    // Content script not loaded — inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await new Promise((r) => setTimeout(r, 100));
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      return null;
    }
  }
}

function render() {
  app.textContent = "";

  // Header
  const header = h("div", { className: "pp-header" });
  header.appendChild(h("div", { className: "pp-logo" }, ["\u25CE"]));
  const brand = h("div", { className: "pp-brand" });
  brand.appendChild(h("div", { className: "pp-brand__name" }, ["RenderDraw Lens"]));
  brand.appendChild(h("div", { className: "pp-brand__tagline" }, ["Point. Describe. Ship."]));
  header.appendChild(brand);
  app.appendChild(header);

  // Primary action row: Activate + Open Panel
  const actionRow = h("div", { className: "pp-action-row" });

  const toggleBtn = h("button", {
    className: `pp-toggle ${isActive ? "pp-toggle--deactivate" : "pp-toggle--activate"}`,
  }, [isActive ? "Deactivate" : "Activate Lens"]);
  toggleBtn.addEventListener("click", async () => {
    toggleBtn.textContent = "Activating...";
    toggleBtn.setAttribute("disabled", "true");

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    const response = await ensureContentScriptAndSend(tabId, { type: MSG.TOGGLE_LENS }) as { isActive: boolean } | null;
    if (response) {
      isActive = response.isActive;
    } else {
      isActive = true;
    }

    // If just activated, close popup so it doesn't obscure the page
    if (isActive) {
      window.close();
      return;
    }
    render();
  });
  actionRow.appendChild(toggleBtn);

  const panelBtn = h("button", { className: "pp-panel-btn", title: "Open Side Panel" }, ["\u25EB"]);
  panelBtn.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId) {
      // Open the side panel for the current tab
      await (chrome.sidePanel as any).open({ tabId });
    }
    window.close();
  });
  actionRow.appendChild(panelBtn);

  app.appendChild(actionRow);

  // Mode selector
  const modes = h("div", { className: "pp-modes" });
  const modeConfigs: { mode: AnnotationMode; name: string; desc: string; icon: string; cls: string }[] = [
    { mode: "feedback", name: "Feedback", desc: "Visual feedback & bug reports", icon: "\u270E", cls: "feedback" },
    { mode: "video_direction", name: "Video Director", desc: "Build video sequences", icon: "\u25B6", cls: "video" },
    { mode: "qa_assertion", name: "QA Assertion", desc: "Visual regression tests", icon: "\u2713", cls: "qa" },
  ];

  for (const cfg of modeConfigs) {
    const modeBtn = h("button", {
      className: `pp-mode pp-mode--${cfg.cls} ${currentMode === cfg.mode ? "pp-mode--active" : ""}`,
    });
    modeBtn.appendChild(h("span", { className: "pp-mode__icon" }, [cfg.icon]));
    const info = h("div", { className: "pp-mode__info" });
    info.appendChild(h("span", { className: "pp-mode__name" }, [cfg.name]));
    info.appendChild(h("span", { className: "pp-mode__desc" }, [cfg.desc]));
    modeBtn.appendChild(info);
    modeBtn.addEventListener("click", async () => {
      currentMode = cfg.mode;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await ensureContentScriptAndSend(tabs[0].id, { type: MSG.SET_MODE, mode: cfg.mode });
      }
      render();
    });
    modes.appendChild(modeBtn);
  }
  app.appendChild(modes);

  // Shortcuts reference
  const shortcuts = h("div", { className: "pp-shortcuts" });
  const shortcutsHeader = h("div", { className: "pp-shortcuts__header" });
  shortcutsHeader.appendChild(h("div", { className: "pp-shortcuts__title" }, ["Shortcuts"]));
  shortcutsHeader.appendChild(h("div", { className: "pp-shortcuts__hint" }, ["active on page when Lens is on"]));
  shortcuts.appendChild(shortcutsHeader);
  const shortcutList = [
    ["Toggle", "\u2318\u21E7L"],
    ["Feedback", "F"],
    ["Video", "V"],
    ["QA", "Q"],
    ["Copy All", "C"],
    ["Hide Markers", "H"],
  ];
  for (const [label, key] of shortcutList) {
    const row = h("div", { className: "pp-shortcut-row" });
    row.appendChild(h("span", { className: "pp-shortcut-row__label" }, [label]));
    row.appendChild(h("span", { className: "pp-shortcut-row__key" }, [key]));
    shortcuts.appendChild(row);
  }
  app.appendChild(shortcuts);

  // Status bar
  const status = h("div", { className: "pp-status" });
  status.appendChild(h("span", { className: `pp-status__dot ${isActive ? "pp-status__dot--on" : "pp-status__dot--off"}` }));
  const statusText = isActive ? `Active \u2022 ${annotationCount} annotations` : "Inactive";
  status.appendChild(document.createTextNode(statusText));
  app.appendChild(status);
}

// Get current state on popup open
(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "get:state" }) as {
        isActive: boolean;
        mode: AnnotationMode;
        annotationCount: number;
      } | undefined;
      if (response) {
        isActive = response.isActive;
        currentMode = response.mode;
        annotationCount = response.annotationCount;
      }
    } catch {
      // Content script not injected yet
    }
  }
  render();
})();
