// ============================================================
// Element Selection Engine
// Handles DOM, Shadow DOM/LWC, and Three.js detection
// ============================================================

import type { TargetDescriptor, ComponentNode, BoundingBox, TargetType } from "../shared/raf-schema";

// ── CSS Selector Generation ────────────────────

function getUniqueSelector(el: Element): string {
  // Priority: id > data-testid > data-id > unique class combo > nth-child path
  if (el.id) return `#${CSS.escape(el.id)}`;

  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;

  const dataId = el.getAttribute("data-id");
  if (dataId) return `[data-id="${dataId}"]`;

  // Build nth-child path
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    const parent = current.parentElement;
    if (!parent) break;

    let selector = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (s) => s.tagName === current!.tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }
    parts.unshift(selector);
    current = parent;
  }
  return parts.join(" > ");
}

// ── Shadow DOM Traversal ───────────────────────

function traverseShadowRoots(el: Element): Element[] {
  const chain: Element[] = [el];
  let host: Element | null = el;

  // Walk up through shadow boundaries
  while (host) {
    const root = host.getRootNode();
    if (root instanceof ShadowRoot) {
      chain.unshift(root.host);
      host = root.host;
    } else {
      break;
    }
  }
  return chain;
}

function isLWCElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag.startsWith("c-") || tag.startsWith("lightning-") || el.hasAttribute("lwc:host");
}

function getShadowPiercingSelector(el: Element): string {
  const chain = traverseShadowRoots(el);
  if (chain.length <= 1) return getUniqueSelector(el);

  return chain
    .map((host, i) => {
      if (i === chain.length - 1) return getUniqueSelector(host);
      return host.tagName.toLowerCase();
    })
    .join(" >>> ");
}

// ── Component Tree Detection ───────────────────

function getReactFiber(el: Element): ComponentNode[] {
  const nodes: ComponentNode[] = [];
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  if (!fiberKey) return nodes;

  let fiber = (el as any)[fiberKey];
  while (fiber) {
    if (fiber.type && typeof fiber.type === "function") {
      const name = fiber.type.displayName || fiber.type.name;
      if (name && !name.startsWith("_")) {
        nodes.push({
          name,
          type: "react",
          source: fiber._debugSource
            ? `${fiber._debugSource.fileName}:${fiber._debugSource.lineNumber}`
            : undefined,
        });
      }
    }
    fiber = fiber.return;
  }
  return nodes.reverse();
}

function getLWCComponentTree(el: Element): ComponentNode[] {
  const nodes: ComponentNode[] = [];
  const chain = traverseShadowRoots(el);
  for (const host of chain) {
    if (isLWCElement(host)) {
      nodes.push({
        name: host.tagName.toLowerCase(),
        type: "lwc",
      });
    }
  }
  return nodes;
}

// ── Computed Styles Extraction ──────────────────

const RELEVANT_STYLES = [
  "color", "background-color", "font-size", "font-family", "font-weight",
  "padding", "margin", "border", "border-radius", "display", "position",
  "width", "height", "opacity", "z-index", "gap", "flex-direction",
];

function getRelevantStyles(el: Element): Record<string, string> {
  const computed = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of RELEVANT_STYLES) {
    const val = computed.getPropertyValue(prop);
    if (val && val !== "normal" && val !== "none" && val !== "auto") {
      styles[prop] = val;
    }
  }
  return styles;
}

// ── Nearby Text ────────────────────────────────

function getNearbyText(el: Element): string {
  const text = el.textContent?.trim()?.slice(0, 200) || "";
  if (text) return text;

  // Check siblings
  const prev = el.previousElementSibling?.textContent?.trim()?.slice(0, 100) || "";
  const next = el.nextElementSibling?.textContent?.trim()?.slice(0, 100) || "";
  return [prev, next].filter(Boolean).join(" … ");
}

// ── Playwright Selector Generation ─────────────

export function getPlaywrightSelector(el: Element): string {
  // Prefer role-based selectors
  const role = el.getAttribute("role");
  const ariaLabel = el.getAttribute("aria-label");
  if (role && ariaLabel) return `role=${role}[name="${ariaLabel}"]`;

  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;

  const text = el.textContent?.trim();
  if (el.tagName === "BUTTON" && text) return `button:has-text("${text.slice(0, 50)}")`;
  if (el.tagName === "A" && text) return `a:has-text("${text.slice(0, 50)}")`;

  return getUniqueSelector(el);
}

// ── Main: Build Target Descriptor ──────────────

export function buildTargetDescriptor(el: Element, detailed = true): TargetDescriptor {
  const rect = el.getBoundingClientRect();
  const bounding_box: BoundingBox = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };

  const isInShadow = el.getRootNode() instanceof ShadowRoot;
  const type: TargetType = isInShadow ? "shadow_element" : "dom_element";
  const selector = isInShadow ? getShadowPiercingSelector(el) : getUniqueSelector(el);

  const componentTree = [
    ...getReactFiber(el),
    ...getLWCComponentTree(el),
  ];

  const descriptor: TargetDescriptor = {
    type,
    selector,
    bounding_box,
    viewport_position: {
      x: (rect.x + rect.width / 2) / window.innerWidth,
      y: (rect.y + rect.height / 2) / window.innerHeight,
    },
    element_tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
    component_tree: componentTree.length ? componentTree : undefined,
    nearby_text: getNearbyText(el),
  };

  if (isInShadow) {
    const shadowChain = traverseShadowRoots(el);
    if (shadowChain.length > 1) {
      descriptor.shadow_host = shadowChain[0].tagName.toLowerCase();
    }
  }

  if (detailed) {
    descriptor.computed_styles = getRelevantStyles(el);
  }

  return descriptor;
}

// ── Text Selection Descriptor ──────────────────

export function buildTextSelectionDescriptor(selection: Selection): TargetDescriptor | null {
  if (!selection.rangeCount || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const container = range.commonAncestorContainer;
  const el = container.nodeType === Node.ELEMENT_NODE
    ? (container as Element)
    : container.parentElement;
  if (!el) return null;

  return {
    type: "text_selection",
    selector: getUniqueSelector(el),
    bounding_box: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    viewport_position: {
      x: (rect.x + rect.width / 2) / window.innerWidth,
      y: (rect.y + rect.height / 2) / window.innerHeight,
    },
    element_tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
    selected_text: selection.toString().slice(0, 500),
    nearby_text: getNearbyText(el),
  };
}
