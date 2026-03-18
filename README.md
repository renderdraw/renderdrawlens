# RenderDraw Lens

**Point. Describe. Ship.**

Chrome extension for visual feedback, video direction, and QA assertions across the RenderDraw stack. Click any element on any page, describe what needs to change, and get structured annotation data that routes directly to Claude Code via MCP — or copy it to your clipboard when MCP isn't running.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-FFD700?style=flat&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-14B8A6?style=flat)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white)

---

## Quick Start

```bash
# Clone
git clone https://github.com/renderdraw/renderdrawlens.git
cd renderdrawlens

# Install & build
npm install
npm run build

# Load into Chrome
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked"
# 4. Select the dist/ folder
```

## Three Modes

### Feedback
Click any element to report visual bugs. Lens captures the DOM selector, bounding box, computed styles, and React/Vue/Angular component tree automatically. You describe what's wrong; Lens packages the context.

### Video Director
Build cinematic sequences by selecting elements and assigning camera actions (zoom, pan, highlight, crossfade). Each annotation becomes a sequence step with timing, easing, and optional narration. Export as a Remotion composition manifest.

### QA Assertion
Click elements and define what should be true about them (exists, visible, text equals, style matches, layout within bounds). Export as a Playwright test file with real selectors.

## Usage

### Popup Controls
- **Activate Lens** — Injects the overlay onto the current page. The popup closes automatically so it doesn't block your view.
- **◫ (Open Panel)** — Opens the side panel for annotation management, export, and project context.
- **Mode Buttons** — Switch between Feedback, Video Director, and QA Assertion.

### On-Page Shortcuts (active when Lens is on)

| Key | Action |
|-----|--------|
| `⌘⇧L` | Toggle Lens on/off (works from anywhere) |
| `F` | Switch to Feedback mode |
| `V` | Switch to Video Director mode |
| `Q` | Switch to QA Assertion mode |
| `C` | Copy all annotations to clipboard |
| `H` | Hide/show annotation markers |
| `Esc` | Deactivate Lens |
| `1-9` | Jump to annotation by number |

### Side Panel
Open the side panel (◫ button in popup) to:
- View all annotations in the current session
- Set project context (slug, name, repo) for MCP routing
- Export as Markdown, JSON, Playwright tests, or Remotion manifest
- Copy all feedback to clipboard in a structured format
- Manage annotation status (acknowledge, resolve, dismiss)

### Clipboard Export (No MCP Required)
Press `C` while Lens is active, or use the side panel's Copy button. Annotations export as structured Markdown grouped by severity:

```
# 🔍 Lens Feedback — Journeys App
**Page:** https://app.renderdraw.com/editor
**Date:** Mar 18, 2026
**Items:** 3

## 🔴 Blocking (1)
- **[Fix]** Button overlaps the sidebar on mobile
  `<button>` → `div.editor-toolbar > button:nth-child(3)`
  Component: EditorToolbar → ActionButton

## 🟠 Important (1)
- **[Change]** Color contrast too low on disabled state
  `<span>` → `span.label--disabled`
```

## MCP Integration

The MCP bridge connects Lens to Claude Code. Annotations flow from the browser to your terminal in real time.

### Start the Bridge

```bash
npm run mcp
# → Server listening on http://localhost:4848
```

### Configure Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "renderdraw-lens": {
      "command": "npx",
      "args": ["tsx", "src/mcp-bridge/server.ts"],
      "cwd": "/path/to/renderdrawlens"
    }
  }
}
```

Or connect via HTTP:

```json
{
  "mcpServers": {
    "renderdraw-lens": {
      "url": "http://localhost:4848"
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `lens_get_pending` | Get all pending annotations (optionally filter by `project_slug`) |
| `lens_get_session` | Get a session by ID or URL (includes project context) |
| `lens_acknowledge` | Mark annotation as seen |
| `lens_resolve` | Mark annotation as fixed (with optional message) |
| `lens_dismiss` | Dismiss annotation |
| `lens_reply` | Add a message to an annotation's thread |
| `lens_watch` | Long-poll for new annotations (30s timeout) |

### Project Context

Set a project in the side panel so MCP knows which codebase to route feedback to:

- **Slug** — Machine identifier like `journeys-app` or `renderdraw-engine`
- **Name** — Display name like "Journeys App"
- **Repo** — Optional Git URL like `github.com/renderdraw/journeys`

Every annotation and MCP payload includes the project context. Claude Code uses the slug to know which repo it's working in.

### REST & SSE

The bridge also exposes standard REST endpoints:

```bash
# Health check
curl http://localhost:4848/health

# All pending annotations
curl http://localhost:4848/annotations/pending

# All sessions
curl http://localhost:4848/sessions

# Real-time event stream
curl http://localhost:4848/events
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Chrome Extension (Manifest V3)                      │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Content Script│  │ Side Panel   │  │  Popup    │ │
│  │              │  │              │  │           │ │
│  │ • Selection  │  │ • Ann. list  │  │ • Toggle  │ │
│  │ • Highlight  │  │ • Export     │  │ • Mode    │ │
│  │ • Annotation │  │ • Project    │  │ • Panel   │ │
│  │   popup      │  │   context    │  │   opener  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                │       │
│         └─────────┬───────┴────────────────┘       │
│                   │                                 │
│          ┌────────┴────────┐                        │
│          │ Service Worker  │                        │
│          │                 │                        │
│          │ • IndexedDB     │                        │
│          │ • Session mgmt  │                        │
│          │ • Tab capture   │                        │
│          │ • MCP relay     │                        │
│          └────────┬────────┘                        │
└───────────────────┼─────────────────────────────────┘
                    │
           ┌────────┴────────┐
           │ MCP Bridge      │
           │ (port 4848)     │
           │                 │
           │ • HTTP/REST     │
           │ • SSE stream    │
           │ • Long-poll     │
           │ • Tool dispatch │
           └────────┬────────┘
                    │
           ┌────────┴────────┐
           │ Claude Code     │
           └─────────────────┘
```

### Source Layout

```
src/
├── background/
│   ├── service-worker.ts    # Session persistence, messaging, tab capture
│   └── mcp-server.ts        # In-extension MCP tool handler
├── content/
│   ├── content.ts           # Main content script entry
│   ├── selector-engine.ts   # DOM targeting, CSS/XPath generation
│   ├── annotation-popup.ts  # On-page annotation form
│   └── styles.ts            # Injected CSS (Journeys dark theme)
├── sidepanel/
│   ├── index.html
│   ├── sidepanel.ts         # Annotation list, export, project context
│   └── sidepanel.css
├── popup/
│   ├── index.html
│   ├── popup.ts             # Mode toggle, side panel opener
│   └── popup.css
├── shared/
│   ├── raf-schema.ts        # RenderDraw Annotation Format types
│   ├── constants.ts         # Design tokens, message types
│   ├── serializers.ts       # Markdown, JSON, Remotion, Playwright exporters
│   └── storage.ts           # IndexedDB wrapper
├── mcp-bridge/
│   └── server.ts            # Standalone HTTP server for Claude Code
└── icons/
    └── generate-icons.ts    # SVG → PNG icon generator
```

### RenderDraw Annotation Format (RAF)

Every annotation follows the RAF schema (`src/shared/raf-schema.ts`):

- **Target Descriptor** — Selector, bounding box, viewport position, tag, classes, computed styles, component tree, shadow DOM host, nearby text
- **Classification** — Intent (fix/change/question/approve/direct/assert), severity (blocking/important/suggestion/cosmetic), status (pending/acknowledged/in_progress/resolved/dismissed)
- **Thread** — Message history for async conversations between browser and Claude Code
- **Video Direction** — Sequence order, action, duration, easing, camera states, narration
- **QA Assertion** — Assertion type, expected value, Playwright selector, snapshot data

### Design System

All UI matches the Journeys dark theme:

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0f` | Primary dark background |
| Panel | `#12121a` | Side panel, cards |
| Gold | `#FFD700` | Primary accent, active states |
| Teal | `#14B8A6` | Secondary accent, video mode |
| Amber | `#f59e0b` | Warnings, QA mode |
| Border | `#2a2a3a` | Card borders, dividers |
| Text | `#ffffff` / `#a0a0b0` / `#606070` | Primary / secondary / muted |
| Font | DM Sans | Body text |
| Mono | JetBrains Mono | Code, selectors, keys |

## Development

```bash
# Watch mode — rebuilds on file changes
npm run dev

# Type check
npm run typecheck

# Production build
npm run build
```

After building, reload the extension in `chrome://extensions` (click the refresh icon on the extension card).

### Build System

Vite with a custom `inlineContentScript` plugin that:
1. Builds all entry points as standard ES modules
2. Post-build, inlines shared chunk imports into `content.js` and `background.js`
3. Wraps `content.js` in an IIFE to avoid global scope pollution

This is necessary because Chrome MV3 content scripts don't support ES module imports.

## License

MIT — see [LICENSE](./LICENSE)
