# RenderDraw Lens

Chrome extension for universal visual feedback, video direction, and QA assertions across the RenderDraw stack.

## Architecture

- **Manifest V3** Chrome extension with content script, service worker, side panel, and popup
- **Content Script** (`src/content/`): Element selection engine, annotation popup, hover/click overlay
- **Service Worker** (`src/background/`): Session persistence (IndexedDB), MCP message relay, tab capture
- **Side Panel** (`src/sidepanel/`): Annotation list, project context, export (Markdown/JSON/Playwright/Remotion/clipboard)
- **Popup** (`src/popup/`): Lens toggle, mode selector, side panel opener
- **MCP Bridge** (`src/mcp-bridge/`): Standalone HTTP server (port 4848) for Claude Code integration
- **Shared** (`src/shared/`): RAF schema, constants, storage, serializers

## Build

```bash
npm install
npm run build       # Build extension to dist/
npm run dev         # Watch mode
npm run typecheck   # Type checking
npm run mcp         # Start MCP bridge server on port 4848
```

Load `dist/` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

### Build System

Vite with `inlineContentScript` plugin. Post-build, shared chunk imports are inlined into `content.js` (wrapped in IIFE) and `background.js` because Chrome MV3 content scripts don't support ES module imports.

## RAF Schema

All annotations use the RenderDraw Annotation Format (RAF) defined in `src/shared/raf-schema.ts`. Three modes:
- **Feedback**: Visual bug reports with element selection, computed styles, component trees
- **Video Direction**: Cinematic sequences with actions (zoom, pan, highlight), timing, narration
- **QA Assertion**: Visual regression specs with Playwright selectors and expected values

## Styling

All UI uses the **Journeys dark theme**: `#0a0a0f` background, `#FFD700` gold accents, `#14B8A6` teal secondary, DM Sans typography. Design tokens in `src/shared/constants.ts`.

## Content Script Injection

Content scripts auto-inject on new page loads via `manifest.json`. For pages open **before** extension install, both the popup and service worker use `chrome.scripting.executeScript()` as a fallback — try messaging, catch the error, inject programmatically, retry.

## MCP Integration

The MCP bridge exposes these tools for Claude Code:
- `lens_get_pending` — Get all pending annotations (filter by `project_slug`)
- `lens_get_session` — Get session by ID or URL (includes project context)
- `lens_acknowledge` — Mark annotation seen
- `lens_resolve` — Mark annotation fixed
- `lens_dismiss` — Dismiss annotation
- `lens_reply` — Reply to annotation thread
- `lens_watch` — Long-poll for new annotations (30s timeout)

### Project Context

Sessions include an optional `ProjectContext` with `slug`, `name`, and `repo`. Set via the side panel. MCP payloads include project context so Claude Code knows which codebase to route feedback to.

### Clipboard Export

When MCP isn't running, use the `C` shortcut or side panel Copy button. Annotations export as structured Markdown grouped by severity with emoji indicators, element selectors, component trees, and thread history.

## Key Patterns

- **Message passing**: All inter-component communication uses `chrome.runtime.sendMessage` with typed `MSG` constants
- **Session persistence**: IndexedDB via `src/shared/storage.ts` with 30-day auto-eviction
- **Serializers**: `src/shared/serializers.ts` handles Markdown, JSON, Remotion manifest, Playwright test, and clipboard formats
- **No external dependencies** in the extension itself — only `ulid` for ID generation and dev tooling
