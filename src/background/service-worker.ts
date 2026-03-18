// ============================================================
// Service Worker — Background orchestration
// MCP server, session persistence, tab capture, messaging
// ============================================================

import { MSG } from "../shared/constants";
import { saveSession, getAllSessions, evictStaleSessions } from "../shared/storage";
import { updateSession, handleToolCall, MCP_TOOLS } from "./mcp-server";
import type { AnnotationSession } from "../shared/raf-schema";

// ── Keepalive ──────────────────────────────────

// MV3 service workers terminate after ~5min of inactivity
// Use alarms to keep alive while annotations are active
chrome.alarms.create("keepalive", { periodInMinutes: 4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    // Ping to stay alive
  }
  if (alarm.name === "evict") {
    evictStaleSessions();
  }
});

// Evict stale sessions daily
chrome.alarms.create("evict", { periodInMinutes: 1440 });

// ── Message Handler ────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case MSG.ANNOTATION_CREATED:
    case MSG.SESSION_UPDATED: {
      const session = msg.session as AnnotationSession;
      // Update MCP in-memory store
      updateSession(session);
      // Persist to IndexedDB
      saveSession(session);
      // Forward to side panel
      broadcastToUI(msg);
      sendResponse({ ok: true });
      break;
    }

    case MSG.ANNOTATION_DELETED: {
      broadcastToUI(msg);
      sendResponse({ ok: true });
      break;
    }

    case MSG.STATE_CHANGED: {
      broadcastToUI(msg);
      sendResponse({ ok: true });
      break;
    }

    case MSG.MCP_PUSH: {
      const session = msg.session as AnnotationSession;
      updateSession(session);
      saveSession(session);
      sendResponse({ ok: true });
      break;
    }

    case MSG.CAPTURE_START: {
      startCapture(sender.tab?.id);
      sendResponse({ ok: true });
      break;
    }

    case MSG.CAPTURE_STOP: {
      stopCapture();
      sendResponse({ ok: true });
      break;
    }

    // MCP tool calls via internal messaging
    case "mcp:tools:list": {
      sendResponse({ tools: MCP_TOOLS });
      break;
    }
    case "mcp:tools:call": {
      const result = handleToolCall(msg.name, msg.arguments || {});
      sendResponse({ result });
      break;
    }
  }
  return true;
});

// ── Broadcast to UI ────────────────────────────

function broadcastToUI(msg: unknown) {
  // Send to all extension views (side panel, popup)
  chrome.runtime.sendMessage(msg).catch(() => {
    // No listeners, that's fine
  });
}

// ── Keyboard Shortcut ──────────────────────────

// Ensure content script is present before sending messages
async function ensureContentScript(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "get:state" });
  } catch {
    // Content script not loaded — inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    // Wait for script initialization
    await new Promise((r) => setTimeout(r, 150));
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-lens") {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    await ensureContentScript(tabId);
    chrome.tabs.sendMessage(tabId, { type: MSG.TOGGLE_LENS });
  }
});

// ── Extension Icon Click → Open Side Panel ─────

chrome.sidePanel?.setOptions?.({
  enabled: true,
});

// ── Tab Capture ────────────────────────────────

let activeCapture: {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
} | null = null;

async function startCapture(tabId?: number) {
  if (!tabId || activeCapture) return;

  try {
    const stream = await (chrome.tabCapture as any).getMediaStreamId({ targetTabId: tabId });
    if (!stream) return;

    // Note: In MV3, tab capture requires user gesture and active tab
    // This is a simplified version; full implementation needs offscreen document
    console.log("[Lens] Tab capture started for tab", tabId);
  } catch (err) {
    console.error("[Lens] Tab capture failed:", err);
  }
}

function stopCapture() {
  if (!activeCapture) return;
  activeCapture.recorder.stop();
  activeCapture.stream.getTracks().forEach((t) => t.stop());
  activeCapture = null;
}

// ── External Messaging (MCP Bridge) ────────────

// The external Node.js MCP bridge (npm run mcp) communicates via
// chrome.runtime.sendMessage from a native messaging host.
// We also support external extension messaging for other tools.
chrome.runtime.onMessageExternal?.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "mcp:tools:list") {
    sendResponse({ tools: MCP_TOOLS });
    return true;
  }
  if (msg.type === "mcp:tools:call" && msg.name) {
    const result = handleToolCall(msg.name, msg.arguments || {});
    sendResponse({ result });
    return true;
  }
  sendResponse({ error: "Unknown message type" });
  return true;
});

// ── Init ───────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log("[RenderDraw Lens] Extension installed");
  // Open side panel by default
  chrome.sidePanel?.setOptions?.({ enabled: true });
});

console.log("[RenderDraw Lens] Service worker started");
