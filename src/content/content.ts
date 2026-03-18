// ============================================================
// Content Script — Core Interaction Surface
// Injected into every page; manages hover/click/annotate loop
// ============================================================

import type { AnnotationMode, RAFAnnotation, AnnotationSession } from "../shared/raf-schema";
import { generateRAFId } from "../shared/raf-schema";
import { MSG } from "../shared/constants";
import { LENS_STYLES } from "./styles";
import { buildTargetDescriptor, buildTextSelectionDescriptor } from "./selector-engine";
import { createAnnotationPopup } from "./annotation-popup";

// ── State ──────────────────────────────────────

let isActive = false;
let currentMode: AnnotationMode = "feedback";
let hoveredElement: Element | null = null;
let selectedElement: Element | null = null;
let annotations: RAFAnnotation[] = [];
let sessionId = generateRAFId();

// DOM elements
let highlightOverlay: HTMLDivElement | null = null;
let selectedOverlay: HTMLDivElement | null = null;
let activeBadge: HTMLDivElement | null = null;
let activePopup: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
const markerElements: Map<string, HTMLDivElement> = new Map();

// ── Style Injection ────────────────────────────

function injectStyles() {
  if (styleElement) return;
  styleElement = document.createElement("style");
  styleElement.textContent = LENS_STYLES;
  document.head.appendChild(styleElement);
}

function removeStyles() {
  styleElement?.remove();
  styleElement = null;
}

// ── Highlight Overlay ──────────────────────────

function createHighlight() {
  if (highlightOverlay) return;
  highlightOverlay = document.createElement("div");
  highlightOverlay.className = "rdl-highlight";
  document.body.appendChild(highlightOverlay);
}

function updateHighlight(el: Element) {
  if (!highlightOverlay) return;
  const rect = el.getBoundingClientRect();
  highlightOverlay.style.top = `${rect.top}px`;
  highlightOverlay.style.left = `${rect.left}px`;
  highlightOverlay.style.width = `${rect.width}px`;
  highlightOverlay.style.height = `${rect.height}px`;
  highlightOverlay.dataset.tag = el.tagName.toLowerCase();
  highlightOverlay.style.display = "block";
}

function hideHighlight() {
  if (highlightOverlay) highlightOverlay.style.display = "none";
}

// ── Selected Overlay ───────────────────────────

function showSelected(el: Element) {
  if (!selectedOverlay) {
    selectedOverlay = document.createElement("div");
    selectedOverlay.className = "rdl-selected";
    document.body.appendChild(selectedOverlay);
  }
  const rect = el.getBoundingClientRect();
  selectedOverlay.style.top = `${rect.top}px`;
  selectedOverlay.style.left = `${rect.left}px`;
  selectedOverlay.style.width = `${rect.width}px`;
  selectedOverlay.style.height = `${rect.height}px`;
  selectedOverlay.style.display = "block";
}

function hideSelected() {
  if (selectedOverlay) selectedOverlay.style.display = "none";
}

// ── Annotation Markers ─────────────────────────

function addMarker(ann: RAFAnnotation, index: number) {
  const marker = document.createElement("div");
  marker.className = `rdl-root rdl-marker rdl-marker--${ann.severity}`;
  if (ann.status === "resolved" || ann.status === "dismissed") {
    marker.classList.add("rdl-marker--resolved");
  }
  marker.textContent = String(index + 1);

  const bb = ann.target.bounding_box;
  marker.style.top = `${bb.y - 12}px`;
  marker.style.left = `${bb.x + bb.width - 12}px`;

  marker.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Jump to annotation in side panel
    chrome.runtime.sendMessage({
      type: "marker:clicked",
      annotationId: ann.id,
    });
  });

  document.body.appendChild(marker);
  markerElements.set(ann.id, marker);
}

function clearMarkers() {
  for (const m of markerElements.values()) m.remove();
  markerElements.clear();
}

function refreshMarkers() {
  clearMarkers();
  annotations.forEach((ann, i) => addMarker(ann, i));
}

// ── Active Badge ───────────────────────────────

function showBadge() {
  if (activeBadge) return;
  activeBadge = document.createElement("div");
  activeBadge.className = "rdl-root rdl-active-badge";
  updateBadgeMode();
  activeBadge.addEventListener("click", () => deactivate());
  document.body.appendChild(activeBadge);
}

function updateBadgeMode() {
  if (!activeBadge) return;
  activeBadge.className = "rdl-root rdl-active-badge";
  const labels: Record<AnnotationMode, string> = {
    feedback: "Lens \u2014 Feedback",
    video_direction: "Lens \u2014 Video Director",
    qa_assertion: "Lens \u2014 QA",
  };
  if (currentMode === "video_direction") activeBadge.classList.add("rdl-active-badge--video");
  if (currentMode === "qa_assertion") activeBadge.classList.add("rdl-active-badge--qa");

  // Build badge content safely
  while (activeBadge.firstChild) activeBadge.removeChild(activeBadge.firstChild);
  const dot = document.createElement("span");
  dot.className = "rdl-active-badge__dot";
  activeBadge.appendChild(dot);
  activeBadge.appendChild(document.createTextNode(labels[currentMode]));
}

function hideBadge() {
  activeBadge?.remove();
  activeBadge = null;
}

// ── Mouse Handlers ─────────────────────────────

let rafId: number | null = null;

function onMouseMove(e: MouseEvent) {
  if (activePopup) return;
  if (rafId) return; // throttle via rAF

  rafId = requestAnimationFrame(() => {
    rafId = null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlightOverlay || el === selectedOverlay || el === activeBadge) return;
    if (el.closest(".rdl-root")) return; // Don't highlight our own UI

    if (el !== hoveredElement) {
      hoveredElement = el;
      updateHighlight(el);
    }
  });
}

function onClick(e: MouseEvent) {
  if (activePopup) return;
  const target = e.target as Element;
  if (target?.closest(".rdl-root")) return; // Ignore clicks on our UI

  e.preventDefault();
  e.stopPropagation();

  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el || el === highlightOverlay || el === selectedOverlay) return;

  selectedElement = el;
  showSelected(el);
  hideHighlight();

  const targetDescriptor = buildTargetDescriptor(el);
  const rect = el.getBoundingClientRect();
  const seqOrder = currentMode === "video_direction"
    ? annotations.filter((a) => a.mode === "video_direction").length + 1
    : 0;

  const { element: popupEl, promise } = createAnnotationPopup(
    targetDescriptor,
    currentMode,
    window.location.href,
    seqOrder,
    rect,
    el,
  );

  activePopup = popupEl;
  document.body.appendChild(popupEl);

  promise.then((result) => {
    activePopup = null;
    hideSelected();

    if (result) {
      annotations.push(result.annotation);
      refreshMarkers();
      notifyBackground(result.annotation);
    }
  });
}

function onKeyDown(e: KeyboardEvent) {
  if (!isActive) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  switch (e.key) {
    case "Escape":
      if (activePopup) return; // popup handles its own escape
      deactivate();
      break;
    case "f":
      setMode("feedback");
      break;
    case "v":
      setMode("video_direction");
      break;
    case "q":
      setMode("qa_assertion");
      break;
    case "h":
      toggleMarkerVisibility();
      break;
    case "c":
      copyAnnotations();
      break;
    case "x":
      clearAllAnnotations();
      break;
    default:
      // Number keys: jump to annotation
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= annotations.length) {
        const ann = annotations[num - 1];
        chrome.runtime.sendMessage({ type: "marker:clicked", annotationId: ann.id });
      }
  }
}

// ── Helpers ─────────────────────────────────────

function notifyBackground(annotation: RAFAnnotation) {
  const session: AnnotationSession = {
    id: sessionId,
    url: window.location.href,
    title: document.title,
    created_at: annotations.length === 1 ? Date.now() : 0, // set on first annotation
    updated_at: Date.now(),
    annotations,
    mode: currentMode,
  };
  chrome.runtime.sendMessage({
    type: MSG.ANNOTATION_CREATED,
    annotation,
    session,
  });
}

function setMode(mode: AnnotationMode) {
  currentMode = mode;
  updateBadgeMode();
  chrome.runtime.sendMessage({ type: MSG.STATE_CHANGED, mode, isActive });
}

let markersVisible = true;
function toggleMarkerVisibility() {
  markersVisible = !markersVisible;
  for (const m of markerElements.values()) {
    m.style.display = markersVisible ? "flex" : "none";
  }
}

function copyAnnotations() {
  // Dynamic import would add complexity; inline simple markdown serialization
  const lines = annotations.map((ann, i) => {
    return `${i + 1}. [${ann.severity}/${ann.intent}] <${ann.target.element_tag}> — ${ann.comment} (${ann.target.selector})`;
  });
  const text = `# Lens Annotations — ${document.title}\n${window.location.href}\n\n${lines.join("\n")}`;
  navigator.clipboard.writeText(text);
}

function clearAllAnnotations() {
  annotations = [];
  clearMarkers();
  chrome.runtime.sendMessage({ type: MSG.ANNOTATION_DELETED, sessionId });
}

// ── Activation / Deactivation ──────────────────

function activate() {
  if (isActive) return;
  isActive = true;
  injectStyles();
  createHighlight();
  showBadge();

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  chrome.runtime.sendMessage({ type: MSG.STATE_CHANGED, isActive: true, mode: currentMode });
}

function deactivate() {
  if (!isActive) return;
  isActive = false;

  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);

  hideHighlight();
  hideSelected();
  hideBadge();
  activePopup?.remove();
  activePopup = null;
  hoveredElement = null;
  selectedElement = null;

  chrome.runtime.sendMessage({ type: MSG.STATE_CHANGED, isActive: false, mode: currentMode });
}

// ── Message Listener ───────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case MSG.TOGGLE_LENS:
      if (isActive) deactivate();
      else activate();
      sendResponse({ isActive });
      break;
    case MSG.SET_MODE:
      setMode(msg.mode);
      sendResponse({ mode: currentMode });
      break;
    case MSG.CLEAR_ANNOTATIONS:
      clearAllAnnotations();
      sendResponse({ ok: true });
      break;
    case "get:state":
      sendResponse({
        isActive,
        mode: currentMode,
        annotationCount: annotations.length,
      });
      break;
  }
  return true;
});

// ── Init ───────────────────────────────────────

// Don't auto-activate; wait for toggle command
console.log("[RenderDraw Lens] Content script loaded");
