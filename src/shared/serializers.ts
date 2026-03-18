// ============================================================
// RAF Serialization — Markdown, JSON, Remotion, Playwright
// ============================================================

import type { RAFAnnotation, OutputTier, AnnotationSession, ProjectContext } from "./raf-schema";

// ── Structured Markdown ────────────────────────

export function annotationToMarkdown(ann: RAFAnnotation, tier: OutputTier = "standard"): string {
  const lines: string[] = [];
  lines.push(`## Annotation: ${ann.id}`);
  lines.push(`**Mode:** ${ann.mode} | **Intent:** ${ann.intent} | **Severity:** ${ann.severity}`);
  lines.push(`**Status:** ${ann.status}`);
  lines.push("");
  lines.push(`> ${ann.comment}`);
  lines.push("");
  lines.push(`**Target:** \`<${ann.target.element_tag}>\` — \`${ann.target.selector}\``);

  if (tier === "minimal") return lines.join("\n");

  lines.push(`**Bounding Box:** ${ann.target.bounding_box.width}×${ann.target.bounding_box.height} @ (${ann.target.bounding_box.x}, ${ann.target.bounding_box.y})`);
  if (ann.target.classes.length) {
    lines.push(`**Classes:** ${ann.target.classes.join(", ")}`);
  }
  if (ann.target.component_tree?.length) {
    lines.push(`**Component Tree:** ${ann.target.component_tree.map((c) => c.name).join(" → ")}`);
  }

  if (tier === "standard") return lines.join("\n");

  if (ann.target.computed_styles) {
    lines.push("**Computed Styles:**");
    for (const [k, v] of Object.entries(ann.target.computed_styles)) {
      lines.push(`  - ${k}: ${v}`);
    }
  }
  if (ann.target.nearby_text) {
    lines.push(`**Nearby Text:** "${ann.target.nearby_text}"`);
  }
  if (ann.target.source_file) {
    lines.push(`**Source File:** ${ann.target.source_file}`);
  }
  if (ann.video_direction) {
    const vd = ann.video_direction;
    lines.push("");
    lines.push(`### Video Direction (Step ${vd.sequence_order})`);
    lines.push(`**Action:** ${vd.action} | **Duration:** ${vd.duration_ms}ms | **Easing:** ${vd.easing}`);
    if (vd.narration) lines.push(`**Narration:** "${vd.narration}"`);
  }
  if (ann.qa_assertion) {
    const qa = ann.qa_assertion;
    lines.push("");
    lines.push("### QA Assertion");
    lines.push(`**Type:** ${qa.assertion_type} | **Expected:** ${qa.expected_value}`);
    lines.push(`**Playwright Selector:** \`${qa.playwright_selector}\``);
  }

  if (tier === "detailed") return lines.join("\n");

  // Forensic: include everything
  if (ann.target.shadow_host) {
    lines.push(`**Shadow Host:** ${ann.target.shadow_host}`);
  }
  if (ann.thread.length) {
    lines.push("");
    lines.push("### Thread");
    for (const msg of ann.thread) {
      lines.push(`- **${msg.author}** (${new Date(msg.timestamp).toISOString()}): ${msg.content}`);
    }
  }

  return lines.join("\n");
}

export function sessionToMarkdown(session: AnnotationSession, tier: OutputTier = "standard"): string {
  const lines: string[] = [];
  lines.push(`# Lens Session: ${session.title}`);
  lines.push(`**URL:** ${session.url}`);
  lines.push(`**Mode:** ${session.mode} | **Annotations:** ${session.annotations.length}`);
  lines.push(`**Created:** ${new Date(session.created_at).toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const ann of session.annotations) {
    lines.push(annotationToMarkdown(ann, tier));
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

// ── Remotion Composition Manifest ──────────────

export function sessionToRemotionManifest(session: AnnotationSession) {
  const videoAnnotations = session.annotations
    .filter((a) => a.mode === "video_direction" && a.video_direction)
    .sort((a, b) => (a.video_direction!.sequence_order - b.video_direction!.sequence_order));

  let currentFrame = 0;
  const sequences = videoAnnotations.map((ann) => {
    const vd = ann.video_direction!;
    const durationInFrames = Math.round((vd.duration_ms / 1000) * 60); // 60fps
    const seq = {
      id: ann.id,
      from: currentFrame,
      durationInFrames,
      action: vd.action,
      easing: vd.easing,
      target: {
        selector: ann.target.selector,
        bounding_box: ann.target.bounding_box,
      },
      camera_start: vd.camera_start,
      camera_end: vd.camera_end,
      narration: vd.narration,
    };
    currentFrame += durationInFrames;
    return seq;
  });

  return {
    version: "1.0",
    source: "renderdraw-lens",
    session_id: session.id,
    source_url: session.url,
    fps: 60,
    width: 1920,
    height: 1080,
    totalDurationInFrames: currentFrame,
    sequences,
  };
}

// ── Playwright Test Scaffold ───────────────────

export function sessionToPlaywright(session: AnnotationSession): string {
  const qaAnnotations = session.annotations
    .filter((a) => a.mode === "qa_assertion" && a.qa_assertion);

  const lines: string[] = [];
  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push("");
  lines.push(`test.describe("Visual Regression: ${session.title}", () => {`);
  lines.push(`  test.beforeEach(async ({ page }) => {`);
  lines.push(`    await page.goto("${session.url}");`);
  lines.push(`  });`);
  lines.push("");

  for (const ann of qaAnnotations) {
    const qa = ann.qa_assertion!;
    lines.push(`  test("${ann.comment}", async ({ page }) => {`);
    lines.push(`    const el = page.locator("${qa.playwright_selector}");`);

    switch (qa.assertion_type) {
      case "exists":
        lines.push(`    await expect(el).toBeAttached();`);
        break;
      case "visible":
        lines.push(`    await expect(el).toBeVisible();`);
        break;
      case "text_equals":
        lines.push(`    await expect(el).toHaveText("${qa.expected_value}");`);
        break;
      case "style_matches":
        const [prop, val] = qa.expected_value.split(":");
        lines.push(`    await expect(el).toHaveCSS("${prop?.trim()}", "${val?.trim()}");`);
        break;
      case "layout_within":
        lines.push(`    const box = await el.boundingBox();`);
        lines.push(`    expect(box).not.toBeNull();`);
        break;
    }
    lines.push(`  });`);
    lines.push("");
  }
  lines.push(`});`);
  return lines.join("\n");
}

// ── Clipboard-Ready Feedback Export ────────────

const SEVERITY_EMOJI: Record<string, string> = {
  blocking: "🔴",
  important: "🟠",
  suggestion: "🟡",
  cosmetic: "⚪",
};

const INTENT_LABEL: Record<string, string> = {
  fix: "Fix",
  change: "Change",
  question: "Question",
  approve: "Approved",
  direct: "Direction",
  assert: "Assert",
};

export function sessionToClipboard(session: AnnotationSession): string {
  const lines: string[] = [];
  const project = session.project;

  // Header
  if (project) {
    lines.push(`# 🔍 Lens Feedback — ${project.name}`);
    if (project.repo) lines.push(`**Repo:** ${project.repo}`);
  } else {
    lines.push(`# 🔍 Lens Feedback`);
  }
  lines.push(`**Page:** ${session.url}`);
  lines.push(`**Date:** ${new Date(session.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`);
  lines.push(`**Items:** ${session.annotations.length}`);
  lines.push("");

  // Group by severity
  const grouped: Record<string, RAFAnnotation[]> = {};
  for (const ann of session.annotations) {
    const key = ann.severity;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ann);
  }

  const severityOrder = ["blocking", "important", "suggestion", "cosmetic"];
  for (const severity of severityOrder) {
    const items = grouped[severity];
    if (!items || items.length === 0) continue;

    const emoji = SEVERITY_EMOJI[severity] || "•";
    lines.push(`## ${emoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${items.length})`);
    lines.push("");

    for (const ann of items) {
      const intent = INTENT_LABEL[ann.intent] || ann.intent;
      const tag = `<${ann.target.element_tag}>`;
      const status = ann.status === "resolved" ? " ✅" : ann.status === "dismissed" ? " ❌" : "";
      lines.push(`- **[${intent}]** ${ann.comment}${status}`);
      lines.push(`  \`${tag}\` → \`${ann.target.selector}\``);
      if (ann.target.component_tree?.length) {
        lines.push(`  Component: ${ann.target.component_tree.map((c) => c.name).join(" → ")}`);
      }
      if (ann.thread.length > 0) {
        for (const msg of ann.thread) {
          lines.push(`  > **${msg.author}:** ${msg.content}`);
        }
      }
      lines.push("");
    }
  }

  // Summary line for quick scanning
  const blocking = grouped["blocking"]?.length || 0;
  const important = grouped["important"]?.length || 0;
  lines.push("---");
  if (blocking > 0) {
    lines.push(`⚠️ **${blocking} blocking** issue${blocking > 1 ? "s" : ""} require immediate attention.`);
  } else if (important > 0) {
    lines.push(`📋 ${important} important item${important > 1 ? "s" : ""}, no blockers.`);
  } else {
    lines.push(`✅ All items are suggestions or cosmetic.`);
  }

  return lines.join("\n");
}

// ── JSON export for offline/import ─────────────

export function sessionToJSON(session: AnnotationSession): string {
  return JSON.stringify({
    version: "1.0",
    source: "renderdraw-lens",
    exported_at: new Date().toISOString(),
    project: session.project || null,
    session: {
      id: session.id,
      url: session.url,
      title: session.title,
      mode: session.mode,
      created_at: session.created_at,
      updated_at: session.updated_at,
    },
    annotations: session.annotations,
  }, null, 2);
}
