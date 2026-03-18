// ============================================================
// Annotation Popup — Modal for creating/editing annotations
// Uses safe DOM construction (no innerHTML with user data)
// ============================================================

import type {
  AnnotationMode, Intent, Severity, RAFAnnotation,
  VideoAction, AssertionType, TargetDescriptor,
} from "../shared/raf-schema";
import { generateRAFId } from "../shared/raf-schema";
import { getPlaywrightSelector } from "./selector-engine";

export interface PopupResult {
  annotation: RAFAnnotation;
}

// Safe DOM helpers
function el<K extends keyof HTMLElementTagNameMap>(
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
    if (typeof child === "string") {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

function option(value: string, label: string, selected = false): HTMLOptionElement {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  opt.selected = selected;
  return opt;
}

function buildSelect(id: string, options: { value: string; label: string; selected?: boolean }[]): HTMLSelectElement {
  const select = el("select", { className: "rdl-select", id });
  for (const o of options) {
    select.appendChild(option(o.value, o.label, o.selected));
  }
  return select;
}

function buildStyleRows(styles: Record<string, string>): HTMLElement[] {
  return Object.entries(styles).map(([k, v]) => {
    const row = el("div", { className: "rdl-style-row" });
    const key = el("span", { className: "rdl-style-row__key" }, [k]);
    const val = el("span", { className: "rdl-style-row__val" }, [v]);
    row.appendChild(key);
    row.appendChild(val);
    return row;
  });
}

export function createAnnotationPopup(
  target: TargetDescriptor,
  mode: AnnotationMode,
  sourceUrl: string,
  sequenceOrder: number,
  anchorRect: DOMRect,
  existingElement: Element | null,
): { element: HTMLElement; promise: Promise<PopupResult | null> } {
  const popup = el("div", { className: "rdl-root rdl-popup" });

  // Position popup near the selected element
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 500);
  const left = Math.min(anchorRect.left, window.innerWidth - 400);
  popup.style.top = `${Math.max(8, top)}px`;
  popup.style.left = `${Math.max(8, left)}px`;

  const modeLabels: Record<AnnotationMode, string> = {
    feedback: "Feedback",
    video_direction: "Video Director",
    qa_assertion: "QA Assertion",
  };

  // Header
  const header = el("div", { className: "rdl-popup__header" });
  header.appendChild(el("span", { className: "rdl-popup__title" }, [`Lens \u2014 ${modeLabels[mode]}`]));
  const targetTag = el("span", { className: "rdl-popup__target-tag" }, [`<${target.element_tag}>`]);
  header.appendChild(targetTag);
  popup.appendChild(header);

  // Body
  const body = el("div", { className: "rdl-popup__body" });

  // Comment textarea
  const textarea = el("textarea", {
    className: "rdl-textarea",
    id: "rdl-comment",
    placeholder: "Describe what you see...",
  });
  body.appendChild(textarea);

  // Intent + Severity row
  const row1 = el("div", { className: "rdl-row" });

  const intentGroup = el("div", { className: "rdl-select-group" });
  intentGroup.appendChild(el("label", { className: "rdl-label" }, ["Intent"]));
  const intentOpts = [
    { value: "fix", label: "Fix" },
    { value: "change", label: "Change" },
    { value: "question", label: "Question" },
    { value: "approve", label: "Approve" },
  ];
  if (mode === "video_direction") intentOpts.push({ value: "direct", label: "Direct" });
  if (mode === "qa_assertion") intentOpts.push({ value: "assert", label: "Assert" });
  const defaultIntent = mode === "video_direction" ? "direct" : mode === "qa_assertion" ? "assert" : "fix";
  intentOpts.forEach((o) => { if (o.value === defaultIntent) (o as any).selected = true; });
  intentGroup.appendChild(buildSelect("rdl-intent", intentOpts));
  row1.appendChild(intentGroup);

  const severityGroup = el("div", { className: "rdl-select-group" });
  severityGroup.appendChild(el("label", { className: "rdl-label" }, ["Severity"]));
  severityGroup.appendChild(buildSelect("rdl-severity", [
    { value: "blocking", label: "Blocking" },
    { value: "important", label: "Important" },
    { value: "suggestion", label: "Suggestion", selected: true },
    { value: "cosmetic", label: "Cosmetic" },
  ]));
  row1.appendChild(severityGroup);
  body.appendChild(row1);

  // Video Direction fields
  if (mode === "video_direction") {
    const vfContainer = el("div", { className: "rdl-video-fields" });
    vfContainer.appendChild(el("span", { className: "rdl-video-fields__title" }, [`Video Direction \u2014 Step ${sequenceOrder}`]));

    const vfRow = el("div", { className: "rdl-row" });
    const actionGroup = el("div", { className: "rdl-select-group" });
    actionGroup.appendChild(el("label", { className: "rdl-label" }, ["Action"]));
    actionGroup.appendChild(buildSelect("rdl-action", [
      { value: "zoom_in", label: "Zoom In" },
      { value: "zoom_out", label: "Zoom Out" },
      { value: "pan_to", label: "Pan To" },
      { value: "highlight", label: "Highlight", selected: true },
      { value: "crossfade", label: "Crossfade" },
      { value: "hold", label: "Hold" },
      { value: "track", label: "Track" },
      { value: "reveal", label: "Reveal" },
    ]));
    vfRow.appendChild(actionGroup);

    const durGroup = el("div", { className: "rdl-select-group" });
    durGroup.appendChild(el("label", { className: "rdl-label" }, ["Duration (ms)"]));
    const durInput = el("input", { className: "rdl-input", id: "rdl-duration", type: "number", value: "2000", step: "100", min: "100" });
    durGroup.appendChild(durInput);
    vfRow.appendChild(durGroup);
    vfContainer.appendChild(vfRow);

    const easingGroup = el("div", { className: "rdl-select-group" });
    easingGroup.appendChild(el("label", { className: "rdl-label" }, ["Easing"]));
    easingGroup.appendChild(buildSelect("rdl-easing", [
      { value: "ease-in-out", label: "Ease In-Out", selected: true },
      { value: "ease-in", label: "Ease In" },
      { value: "ease-out", label: "Ease Out" },
      { value: "linear", label: "Linear" },
      { value: "spring(1, 80, 10)", label: "Spring" },
    ]));
    vfContainer.appendChild(easingGroup);

    const narGroup = el("div", { className: "rdl-select-group" });
    narGroup.appendChild(el("label", { className: "rdl-label" }, ["Narration"]));
    narGroup.appendChild(el("input", { className: "rdl-input", id: "rdl-narration", type: "text", placeholder: "Voiceover text for this step..." }));
    vfContainer.appendChild(narGroup);

    body.appendChild(vfContainer);
  }

  // QA Assertion fields
  if (mode === "qa_assertion") {
    const qaContainer = el("div", { className: "rdl-qa-fields" });
    qaContainer.appendChild(el("span", { className: "rdl-qa-fields__title" }, ["QA Assertion"]));

    const qaRow = el("div", { className: "rdl-row" });
    const typeGroup = el("div", { className: "rdl-select-group" });
    typeGroup.appendChild(el("label", { className: "rdl-label" }, ["Assertion Type"]));
    typeGroup.appendChild(buildSelect("rdl-assertion-type", [
      { value: "exists", label: "Exists" },
      { value: "visible", label: "Visible", selected: true },
      { value: "text_equals", label: "Text Equals" },
      { value: "style_matches", label: "Style Matches" },
      { value: "layout_within", label: "Layout Within" },
    ]));
    qaRow.appendChild(typeGroup);
    qaContainer.appendChild(qaRow);

    const expGroup = el("div", { className: "rdl-select-group" });
    expGroup.appendChild(el("label", { className: "rdl-label" }, ["Expected Value"]));
    const expInput = el("input", {
      className: "rdl-input",
      id: "rdl-expected",
      type: "text",
      placeholder: "Expected text or style value",
    });
    // Set value safely via property, not attribute, to avoid injection
    expInput.value = target.nearby_text?.slice(0, 100) || "";
    expGroup.appendChild(expInput);
    qaContainer.appendChild(expGroup);

    body.appendChild(qaContainer);
  }

  // Computed styles accordion
  if (target.computed_styles && Object.keys(target.computed_styles).length) {
    const accordion = el("div", { className: "rdl-accordion" });
    const trigger = el("button", { className: "rdl-accordion__trigger", id: "rdl-styles-trigger" });
    trigger.appendChild(document.createTextNode("Computed Styles"));
    const triggerIcon = el("span", {}, ["+"]);
    trigger.appendChild(triggerIcon);

    const content = el("div", { className: "rdl-accordion__content", id: "rdl-styles-content" });
    content.style.display = "none";
    for (const row of buildStyleRows(target.computed_styles)) {
      content.appendChild(row);
    }

    trigger.addEventListener("click", () => {
      const open = content.style.display !== "none";
      content.style.display = open ? "none" : "block";
      triggerIcon.textContent = open ? "+" : "\u2212";
    });

    accordion.appendChild(trigger);
    accordion.appendChild(content);
    body.appendChild(accordion);
  }

  // Tags input
  const tagsGroup = el("div", { className: "rdl-select-group" });
  tagsGroup.appendChild(el("label", { className: "rdl-label" }, ["Tags"]));
  const tagsContainer = el("div", { className: "rdl-tags", id: "rdl-tags-container" });
  const tagsInput = el("input", { className: "rdl-tags__input", id: "rdl-tags-input", placeholder: "Add tag + Enter" });
  tagsContainer.appendChild(tagsInput);
  tagsGroup.appendChild(tagsContainer);
  body.appendChild(tagsGroup);

  popup.appendChild(body);

  // Footer
  const footer = el("div", { className: "rdl-popup__footer" });
  const cancelBtn = el("button", { className: "rdl-btn rdl-btn--secondary", id: "rdl-cancel" }, ["Cancel"]);
  const submitBtn = el("button", { className: "rdl-btn rdl-btn--primary", id: "rdl-submit" }, ["Submit"]);
  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);
  popup.appendChild(footer);

  // Tags state
  const tags: string[] = [];

  const promise = new Promise<PopupResult | null>((resolve) => {
    // Tags input handler
    tagsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && tagsInput.value.trim()) {
        e.preventDefault();
        const tag = tagsInput.value.trim().toLowerCase();
        if (!tags.includes(tag)) {
          tags.push(tag);
          const tagEl = el("span", { className: "rdl-tag" }, [tag]);
          const removeBtn = el("span", { className: "rdl-tag__remove" }, ["\u00d7"]);
          removeBtn.addEventListener("click", () => {
            const idx = tags.indexOf(tag);
            if (idx > -1) tags.splice(idx, 1);
            tagEl.remove();
          });
          tagEl.appendChild(removeBtn);
          tagsContainer.insertBefore(tagEl, tagsInput);
        }
        tagsInput.value = "";
      }
    });

    // Submit
    submitBtn.addEventListener("click", () => {
      const comment = textarea.value || "";
      const intent = (popup.querySelector("#rdl-intent") as HTMLSelectElement)?.value as Intent;
      const severity = (popup.querySelector("#rdl-severity") as HTMLSelectElement)?.value as Severity;

      const annotation: RAFAnnotation = {
        id: generateRAFId(),
        comment,
        target,
        timestamp: Date.now(),
        mode,
        source_url: sourceUrl,
        intent,
        severity,
        status: "pending",
        thread: [],
        tags,
      };

      if (mode === "video_direction") {
        const action = (popup.querySelector("#rdl-action") as HTMLSelectElement)?.value as VideoAction;
        const duration = parseInt((popup.querySelector("#rdl-duration") as HTMLInputElement)?.value || "2000");
        const easing = (popup.querySelector("#rdl-easing") as HTMLSelectElement)?.value || "ease-in-out";
        const narration = (popup.querySelector("#rdl-narration") as HTMLInputElement)?.value || "";

        annotation.video_direction = {
          sequence_order: sequenceOrder,
          action,
          duration_ms: duration,
          easing,
          narration: narration || undefined,
          capture_config: { width: 1920, height: 1080, fps: 60 },
        };
      }

      if (mode === "qa_assertion" && existingElement) {
        const assertionType = (popup.querySelector("#rdl-assertion-type") as HTMLSelectElement)?.value as AssertionType;
        const expected = (popup.querySelector("#rdl-expected") as HTMLInputElement)?.value || "";

        annotation.qa_assertion = {
          assertion_type: assertionType,
          expected_value: expected,
          playwright_selector: getPlaywrightSelector(existingElement),
        };
      }

      popup.remove();
      resolve({ annotation });
    });

    // Cancel
    cancelBtn.addEventListener("click", () => {
      popup.remove();
      resolve(null);
    });

    // Escape key
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        popup.remove();
        document.removeEventListener("keydown", escHandler);
        resolve(null);
      }
    };
    document.addEventListener("keydown", escHandler);

    // Focus textarea after mount
    requestAnimationFrame(() => {
      textarea.focus();
    });
  });

  return { element: popup, promise };
}
