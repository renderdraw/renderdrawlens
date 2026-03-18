// ============================================================
// Side Panel — Annotation List, Timeline, Session Management
// ============================================================

import type { RAFAnnotation, AnnotationMode, AnnotationSession, ProjectContext } from "../shared/raf-schema";
import { MSG } from "../shared/constants";
import {
  sessionToMarkdown,
  sessionToRemotionManifest,
  sessionToPlaywright,
  sessionToClipboard,
  sessionToJSON,
} from "../shared/serializers";

// ── State ──────────────────────────────────────

let currentView: "annotations" | "timeline" | "settings" = "annotations";
let currentMode: AnnotationMode = "feedback";
let annotations: RAFAnnotation[] = [];
let isActive = false;
let mcpConnected = false;
let sessionUrl = "";
let sessionTitle = "";
let activeProject: ProjectContext | null = null;
let savedProjects: ProjectContext[] = [];

const app = document.getElementById("app")!;

// ── Safe DOM Helpers ───────────────────────────

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (HTMLElement | Text | string)[] = []
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

// ── Project Persistence ────────────────────────

async function loadProjects() {
  const data = await chrome.storage.local.get(["lens_projects", "lens_active_project"]);
  savedProjects = data.lens_projects || [];
  activeProject = data.lens_active_project || null;
}

async function saveProjects() {
  await chrome.storage.local.set({
    lens_projects: savedProjects,
    lens_active_project: activeProject,
  });
}

async function addProject(project: ProjectContext) {
  const existing = savedProjects.findIndex((p) => p.slug === project.slug);
  if (existing >= 0) {
    savedProjects[existing] = project;
  } else {
    savedProjects.push(project);
  }
  activeProject = project;
  await saveProjects();
}

async function selectProject(slug: string | null) {
  if (!slug) {
    activeProject = null;
  } else {
    activeProject = savedProjects.find((p) => p.slug === slug) || null;
  }
  await saveProjects();
}

async function removeProject(slug: string) {
  savedProjects = savedProjects.filter((p) => p.slug !== slug);
  if (activeProject?.slug === slug) activeProject = null;
  await saveProjects();
}

// ── Render ─────────────────────────────────────

function render() {
  app.textContent = "";

  // Header
  const header = h("div", { className: "sp-header" });
  const brand = h("div", { className: "sp-header__brand" });
  brand.appendChild(h("div", { className: "sp-header__logo" }, ["\u25CE"]));
  brand.appendChild(h("div", { className: "sp-header__title" }, ["RenderDraw Lens"]));
  header.appendChild(brand);

  const actions = h("div", { className: "sp-header__actions" });
  const settingsBtn = h("button", { className: "sp-icon-btn", title: "Settings" }, ["\u2699"]);
  settingsBtn.addEventListener("click", () => {
    currentView = currentView === "settings" ? "annotations" : "settings";
    render();
  });
  actions.appendChild(settingsBtn);
  header.appendChild(actions);
  app.appendChild(header);

  // Project context bar
  renderProjectBar();

  // Tabs
  const tabs = h("div", { className: "sp-tabs" });
  const feedbackTab = h("button", {
    className: `sp-tab ${currentMode === "feedback" ? "sp-tab--active" : ""}`,
  }, ["Feedback"]);
  feedbackTab.addEventListener("click", () => switchMode("feedback"));
  tabs.appendChild(feedbackTab);

  const videoTab = h("button", {
    className: `sp-tab sp-tab--video ${currentMode === "video_direction" ? "sp-tab--active" : ""}`,
  }, ["Video"]);
  videoTab.addEventListener("click", () => switchMode("video_direction"));
  tabs.appendChild(videoTab);

  const qaTab = h("button", {
    className: `sp-tab sp-tab--qa ${currentMode === "qa_assertion" ? "sp-tab--active" : ""}`,
  }, ["QA"]);
  qaTab.addEventListener("click", () => switchMode("qa_assertion"));
  tabs.appendChild(qaTab);
  app.appendChild(tabs);

  // Session info
  if (sessionUrl) {
    const session = h("div", { className: "sp-session" });
    session.appendChild(h("div", { className: "sp-session__url" }, [sessionUrl]));
    const meta = h("div", { className: "sp-session__meta" });
    const countStat = h("span", { className: "sp-session__stat" });
    const countStrong = h("strong", {}, [String(annotations.length)]);
    countStat.appendChild(countStrong);
    countStat.appendChild(document.createTextNode(" annotations"));
    meta.appendChild(countStat);
    const pendingCount = annotations.filter((a) => a.status === "pending").length;
    if (pendingCount > 0) {
      const pendingStat = h("span", { className: "sp-session__stat" });
      const pendingStrong = h("strong", {}, [String(pendingCount)]);
      pendingStat.appendChild(pendingStrong);
      pendingStat.appendChild(document.createTextNode(" pending"));
      meta.appendChild(pendingStat);
    }
    session.appendChild(meta);
    app.appendChild(session);
  }

  // Content area
  if (currentView === "settings") {
    renderSettings();
  } else if (currentMode === "video_direction") {
    renderTimeline();
  } else {
    renderAnnotationList();
  }

  // Export bar
  renderExportBar();

  // MCP status
  const mcpStatus = h("div", { className: "sp-mcp-status" });
  const dot = h("span", { className: `sp-mcp-dot ${mcpConnected ? "sp-mcp-dot--connected" : ""}` });
  mcpStatus.appendChild(dot);
  mcpStatus.appendChild(document.createTextNode(mcpConnected ? "MCP Connected (port 4848)" : "MCP Disconnected"));
  app.appendChild(mcpStatus);
}

// ── Project Bar ────────────────────────────────

function renderProjectBar() {
  const bar = h("div", { className: "sp-project-bar" });

  const label = h("span", { className: "sp-project-bar__label" }, ["Project"]);
  bar.appendChild(label);

  // Project dropdown
  const select = h("select", { className: "sp-project-select" }) as HTMLSelectElement;
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No project selected";
  select.appendChild(noneOpt);

  for (const p of savedProjects) {
    const opt = document.createElement("option");
    opt.value = p.slug;
    opt.textContent = p.name;
    if (activeProject?.slug === p.slug) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener("change", async () => {
    await selectProject(select.value || null);
    render();
  });
  bar.appendChild(select);

  // Add project button
  const addBtn = h("button", { className: "sp-icon-btn sp-project-bar__add", title: "Add project" }, ["+"]);
  addBtn.addEventListener("click", () => showAddProjectDialog());
  bar.appendChild(addBtn);

  // Edit/remove active project
  if (activeProject) {
    const removeBtn = h("button", { className: "sp-icon-btn sp-project-bar__remove", title: "Remove project" }, ["\u00D7"]);
    removeBtn.addEventListener("click", async () => {
      if (activeProject) {
        await removeProject(activeProject.slug);
        render();
      }
    });
    bar.appendChild(removeBtn);
  }

  app.appendChild(bar);
}

function showAddProjectDialog() {
  // Remove any existing dialog
  document.querySelector(".sp-dialog-overlay")?.remove();

  const overlay = h("div", { className: "sp-dialog-overlay" });
  const dialog = h("div", { className: "sp-dialog" });

  dialog.appendChild(h("div", { className: "sp-dialog__title" }, ["Add Project"]));

  const nameGroup = h("div", { className: "sp-settings__group" });
  nameGroup.appendChild(h("label", { className: "sp-settings__label" }, ["Project Name"]));
  const nameInput = h("input", { className: "sp-settings__input", type: "text", placeholder: "Journeys App" }) as HTMLInputElement;
  nameGroup.appendChild(nameInput);
  dialog.appendChild(nameGroup);

  const slugGroup = h("div", { className: "sp-settings__group" });
  slugGroup.appendChild(h("label", { className: "sp-settings__label" }, ["Slug (kebab-case)"]));
  const slugInput = h("input", { className: "sp-settings__input", type: "text", placeholder: "journeys-app" }) as HTMLInputElement;
  slugGroup.appendChild(slugInput);
  dialog.appendChild(slugGroup);

  // Auto-generate slug from name
  nameInput.addEventListener("input", () => {
    if (!slugInput.dataset.manual) {
      slugInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
  });
  slugInput.addEventListener("input", () => { slugInput.dataset.manual = "true"; });

  const repoGroup = h("div", { className: "sp-settings__group" });
  repoGroup.appendChild(h("label", { className: "sp-settings__label" }, ["Repo URL (optional)"]));
  const repoInput = h("input", { className: "sp-settings__input", type: "text", placeholder: "github.com/org/repo" }) as HTMLInputElement;
  repoGroup.appendChild(repoInput);
  dialog.appendChild(repoGroup);

  const btnRow = h("div", { className: "sp-dialog__actions" });
  const cancelBtn = h("button", { className: "sp-btn sp-btn--secondary" }, ["Cancel"]);
  cancelBtn.addEventListener("click", () => overlay.remove());
  btnRow.appendChild(cancelBtn);

  const saveBtn = h("button", { className: "sp-btn sp-btn--primary" }, ["Add Project"]);
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const slug = slugInput.value.trim();
    if (!name || !slug) return;
    await addProject({
      slug,
      name,
      repo: repoInput.value.trim() || undefined,
    });
    overlay.remove();
    render();
  });
  btnRow.appendChild(saveBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  nameInput.focus();
}

// ── Annotation List ────────────────────────────

function renderAnnotationList() {
  const list = h("div", { className: "sp-list" });

  if (annotations.length === 0) {
    const empty = h("div", { className: "sp-empty" });
    empty.appendChild(h("div", { className: "sp-empty__icon" }, ["\u25CE"]));
    const text = h("div", { className: "sp-empty__text" });
    text.appendChild(document.createTextNode("No annotations yet. Activate Lens with "));
    text.appendChild(h("span", { className: "sp-empty__shortcut" }, ["\u2318\u21E7L"]));
    text.appendChild(document.createTextNode(" then click on any element."));
    empty.appendChild(text);
    list.appendChild(empty);
  } else {
    for (let i = 0; i < annotations.length; i++) {
      list.appendChild(renderAnnotationCard(annotations[i], i));
    }
  }

  app.appendChild(list);
}

function renderAnnotationCard(ann: RAFAnnotation, index: number): HTMLElement {
  const card = h("div", { className: "sp-card" });
  card.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "highlight:annotation",
          annotation: ann,
        });
      }
    });
  });

  // Header row
  const cardHeader = h("div", { className: "sp-card__header" });
  cardHeader.appendChild(h("span", { className: `sp-card__number sp-card__number--${ann.severity}` }, [String(index + 1)]));
  cardHeader.appendChild(h("span", { className: "sp-card__target" }, [`<${ann.target.element_tag}> ${ann.target.selector}`]));
  const statusClass = ann.status.replace("_", "-");
  cardHeader.appendChild(h("span", { className: `sp-card__status sp-card__status--${statusClass}` }, [ann.status]));
  card.appendChild(cardHeader);

  // Comment
  if (ann.comment) {
    card.appendChild(h("div", { className: "sp-card__comment" }, [ann.comment]));
  }

  // Badges
  const badges = h("div", { className: "sp-card__badges" });
  badges.appendChild(h("span", { className: "sp-badge sp-badge--intent" }, [ann.intent]));
  for (const tag of ann.tags) {
    badges.appendChild(h("span", { className: "sp-badge sp-badge--tag" }, [tag]));
  }
  card.appendChild(badges);

  return card;
}

function renderTimeline() {
  const timeline = h("div", { className: "sp-timeline" });
  const videoAnns = annotations
    .filter((a) => a.mode === "video_direction" && a.video_direction)
    .sort((a, b) => a.video_direction!.sequence_order - b.video_direction!.sequence_order);

  if (videoAnns.length === 0) {
    const empty = h("div", { className: "sp-empty" });
    empty.appendChild(h("div", { className: "sp-empty__icon" }, ["\u25B6"]));
    const text = h("div", { className: "sp-empty__text" });
    text.appendChild(document.createTextNode("No video sequences yet. Switch to Video Director mode and click on elements to build your sequence."));
    empty.appendChild(text);
    timeline.appendChild(empty);
  } else {
    for (const ann of videoAnns) {
      const vd = ann.video_direction!;
      const step = h("div", { className: "sp-timeline-step" });
      step.dataset.step = String(vd.sequence_order);

      const content = h("div", { className: "sp-timeline-step__content" });
      content.appendChild(h("div", { className: "sp-timeline-step__action" }, [`${vd.action} \u2192 <${ann.target.element_tag}>`]));
      content.appendChild(h("div", { className: "sp-timeline-step__target" }, [ann.target.selector]));
      if (vd.narration) {
        content.appendChild(h("div", { className: "sp-timeline-step__narration" }, [`"${vd.narration}"`]));
      }
      content.appendChild(h("div", { className: "sp-timeline-step__duration" }, [`${vd.duration_ms}ms \u2022 ${vd.easing}`]));
      step.appendChild(content);
      timeline.appendChild(step);
    }
  }

  app.appendChild(timeline);
}

// ── Export Bar ──────────────────────────────────

function renderExportBar() {
  if (annotations.length === 0) return;

  const exportBar = h("div", { className: "sp-export" });

  // Primary action: Copy All Feedback (always visible)
  const copyAllBtn = h("button", { className: "sp-btn sp-btn--primary sp-btn--copy-all" }, ["\uD83D\uDCCB Copy All Feedback"]);
  copyAllBtn.addEventListener("click", () => {
    const session = buildSession();
    const text = sessionToClipboard(session);
    navigator.clipboard.writeText(text);
    copyAllBtn.textContent = "\u2705 Copied!";
    setTimeout(() => { copyAllBtn.textContent = "\uD83D\uDCCB Copy All Feedback"; }, 2000);
  });
  exportBar.appendChild(copyAllBtn);

  // Secondary row
  const secondaryRow = h("div", { className: "sp-export__secondary" });

  const copyMdBtn = h("button", { className: "sp-btn sp-btn--secondary sp-btn--sm" }, ["Copy MD"]);
  copyMdBtn.addEventListener("click", () => {
    const session = buildSession();
    const md = sessionToMarkdown(session, "standard");
    navigator.clipboard.writeText(md);
    flashBtn(copyMdBtn, "Copied!");
  });
  secondaryRow.appendChild(copyMdBtn);

  const copyJsonBtn = h("button", { className: "sp-btn sp-btn--secondary sp-btn--sm" }, ["Copy JSON"]);
  copyJsonBtn.addEventListener("click", () => {
    const session = buildSession();
    const json = sessionToJSON(session);
    navigator.clipboard.writeText(json);
    flashBtn(copyJsonBtn, "Copied!");
  });
  secondaryRow.appendChild(copyJsonBtn);

  if (currentMode === "video_direction") {
    const remotionBtn = h("button", { className: "sp-btn sp-btn--teal sp-btn--sm" }, ["Remotion"]);
    remotionBtn.addEventListener("click", () => {
      const session = buildSession();
      const manifest = sessionToRemotionManifest(session);
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      downloadBlob(blob, `lens-remotion-${Date.now()}.json`);
    });
    secondaryRow.appendChild(remotionBtn);
  }

  if (currentMode === "qa_assertion") {
    const pwBtn = h("button", { className: "sp-btn sp-btn--teal sp-btn--sm" }, ["Playwright"]);
    pwBtn.addEventListener("click", () => {
      const session = buildSession();
      const code = sessionToPlaywright(session);
      const blob = new Blob([code], { type: "text/typescript" });
      downloadBlob(blob, `lens-test-${Date.now()}.spec.ts`);
    });
    secondaryRow.appendChild(pwBtn);
  }

  const pushBtn = h("button", {
    className: `sp-btn sp-btn--sm ${mcpConnected ? "sp-btn--teal" : "sp-btn--secondary sp-btn--disabled"}`,
    title: mcpConnected ? "Push to MCP" : "MCP not connected",
  }, ["Push MCP"]);
  pushBtn.addEventListener("click", () => {
    if (!mcpConnected) return;
    chrome.runtime.sendMessage({ type: MSG.MCP_PUSH, session: buildSession() });
    flashBtn(pushBtn, "Pushed!");
  });
  secondaryRow.appendChild(pushBtn);

  exportBar.appendChild(secondaryRow);
  app.appendChild(exportBar);
}

function flashBtn(btn: HTMLElement, text: string) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, 1500);
}

// ── Settings ────────────────────────────────────

function renderSettings() {
  const settings = h("div", { className: "sp-settings sp-list" });

  const portGroup = h("div", { className: "sp-settings__group" });
  portGroup.appendChild(h("label", { className: "sp-settings__label" }, ["MCP Server Port"]));
  const portInput = h("input", { className: "sp-settings__input", type: "number", value: "4848" }) as HTMLInputElement;
  portGroup.appendChild(portInput);
  settings.appendChild(portGroup);

  const tierGroup = h("div", { className: "sp-settings__group" });
  tierGroup.appendChild(h("label", { className: "sp-settings__label" }, ["Default Output Tier"]));
  const tierSelect = h("select", { className: "sp-settings__input" }) as HTMLSelectElement;
  for (const tier of ["minimal", "standard", "detailed", "forensic"]) {
    const opt = document.createElement("option");
    opt.value = tier;
    opt.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
    if (tier === "standard") opt.selected = true;
    tierSelect.appendChild(opt);
  }
  tierGroup.appendChild(tierSelect);
  settings.appendChild(tierGroup);

  // Projects management section
  settings.appendChild(h("div", { className: "sp-settings__divider" }));
  settings.appendChild(h("div", { className: "sp-settings__section-title" }, ["Saved Projects"]));

  if (savedProjects.length === 0) {
    settings.appendChild(h("div", { className: "sp-settings__hint" }, ["No projects yet. Add one from the project bar above."]));
  } else {
    for (const p of savedProjects) {
      const row = h("div", { className: "sp-settings__project-row" });
      const info = h("div", { className: "sp-settings__project-info" });
      info.appendChild(h("span", { className: "sp-settings__project-name" }, [p.name]));
      info.appendChild(h("span", { className: "sp-settings__project-slug" }, [p.slug]));
      if (p.repo) {
        info.appendChild(h("span", { className: "sp-settings__project-repo" }, [p.repo]));
      }
      row.appendChild(info);

      const delBtn = h("button", { className: "sp-icon-btn sp-icon-btn--danger", title: "Remove" }, ["\u00D7"]);
      delBtn.addEventListener("click", async () => {
        await removeProject(p.slug);
        render();
      });
      row.appendChild(delBtn);
      settings.appendChild(row);
    }
  }

  app.appendChild(settings);
}

// ── Helpers ─────────────────────────────────────

function buildSession(): AnnotationSession {
  return {
    id: `session_${Date.now()}`,
    url: sessionUrl || "unknown",
    title: sessionTitle || "Untitled",
    created_at: annotations.length > 0 ? annotations[0].timestamp : Date.now(),
    updated_at: Date.now(),
    annotations,
    mode: currentMode,
    project: activeProject || undefined,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function switchMode(mode: AnnotationMode) {
  currentMode = mode;
  currentView = mode === "video_direction" ? "timeline" : "annotations";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: MSG.SET_MODE, mode });
    }
  });
  render();
}

// ── Message Listener ───────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case MSG.ANNOTATION_CREATED:
      annotations = msg.session.annotations;
      sessionUrl = msg.session.url;
      sessionTitle = msg.session.title;
      render();
      break;
    case MSG.STATE_CHANGED:
      isActive = msg.isActive;
      if (msg.mode) currentMode = msg.mode;
      render();
      break;
    case MSG.ANNOTATION_DELETED:
      annotations = [];
      render();
      break;
    case "mcp:status":
      mcpConnected = msg.connected;
      render();
      break;
  }
});

// ── Init ───────────────────────────────────────

(async () => {
  await loadProjects();

  // Get current state from active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: "get:state" }) as {
        isActive: boolean;
        mode: AnnotationMode;
        annotationCount: number;
      } | undefined;
      if (response) {
        isActive = response.isActive;
        currentMode = response.mode;
      }
    } catch {
      // Content script not loaded
    }
  }
  render();
})();
