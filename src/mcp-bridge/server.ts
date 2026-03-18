#!/usr/bin/env node
// ============================================================
// MCP Bridge Server — Standalone HTTP server
// Connects to the Chrome extension via Native Messaging
// and exposes MCP tools to Claude Code on port 4848
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import type { RAFAnnotation, AnnotationSession } from "../shared/raf-schema";

const PORT = parseInt(process.env.LENS_MCP_PORT || "4848");

// In-memory session store (populated via stdin from extension)
const sessions = new Map<string, AnnotationSession>();
const sseClients: ServerResponse[] = [];
const watchers: Array<{
  resolve: (value: RAFAnnotation[]) => void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

// ── MCP Tool Definitions ───────────────────────

const MCP_TOOLS = [
  {
    name: "lens_get_pending",
    description: "Get all pending Lens annotations across all sessions. Returns structured annotation data including element selectors, component trees, computed styles, and feedback comments.",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "lens_get_session",
    description: "Get a specific annotation session by ID or by page URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID" },
        url: { type: "string", description: "Page URL" },
      },
    },
  },
  {
    name: "lens_acknowledge",
    description: "Mark an annotation as acknowledged (you've seen it and will address it).",
    inputSchema: {
      type: "object" as const,
      properties: { annotation_id: { type: "string" } },
      required: ["annotation_id"],
    },
  },
  {
    name: "lens_resolve",
    description: "Mark an annotation as resolved with an optional message.",
    inputSchema: {
      type: "object" as const,
      properties: {
        annotation_id: { type: "string" },
        resolved_by: { type: "string", description: "Who resolved it (default: claude_code)" },
        message: { type: "string", description: "Resolution message" },
      },
      required: ["annotation_id"],
    },
  },
  {
    name: "lens_dismiss",
    description: "Dismiss an annotation (won't fix / not applicable).",
    inputSchema: {
      type: "object" as const,
      properties: { annotation_id: { type: "string" } },
      required: ["annotation_id"],
    },
  },
  {
    name: "lens_reply",
    description: "Add a reply to an annotation's thread.",
    inputSchema: {
      type: "object" as const,
      properties: {
        annotation_id: { type: "string" },
        message: { type: "string" },
        author: { type: "string", description: "Reply author (default: claude_code)" },
      },
      required: ["annotation_id", "message"],
    },
  },
  {
    name: "lens_watch",
    description: "Long-poll for new pending annotations. Blocks for up to 30 seconds waiting for new annotations, then returns current pending list.",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];

// ── Annotation Operations ──────────────────────

function getPendingAnnotations(): RAFAnnotation[] {
  const pending: RAFAnnotation[] = [];
  for (const session of sessions.values()) {
    for (const ann of session.annotations) {
      if (ann.status === "pending") pending.push(ann);
    }
  }
  return pending;
}

function findAnnotation(id: string) {
  for (const session of sessions.values()) {
    const idx = session.annotations.findIndex((a) => a.id === id);
    if (idx !== -1) return { session, annotation: session.annotations[idx], index: idx };
  }
  return null;
}

function handleToolCall(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "lens_get_pending":
      return { annotations: getPendingAnnotations() };

    case "lens_get_session": {
      if (args.session_id) {
        const s = sessions.get(args.session_id as string);
        return s || { error: "Session not found" };
      }
      if (args.url) {
        for (const s of sessions.values()) {
          if (s.url === args.url) return s;
        }
      }
      return { error: "No session found" };
    }

    case "lens_acknowledge": {
      const found = findAnnotation(args.annotation_id as string);
      if (!found) return { error: "Annotation not found" };
      found.annotation.status = "acknowledged";
      return { ok: true, annotation: found.annotation };
    }

    case "lens_resolve": {
      const found = findAnnotation(args.annotation_id as string);
      if (!found) return { error: "Annotation not found" };
      found.annotation.status = "resolved";
      found.annotation.resolved_by = (args.resolved_by as string) || "claude_code";
      found.annotation.resolved_at = new Date().toISOString();
      if (args.message) {
        found.annotation.thread.push({
          id: `msg_${Date.now()}`,
          author: found.annotation.resolved_by,
          content: args.message as string,
          timestamp: Date.now(),
        });
      }
      return { ok: true, annotation: found.annotation };
    }

    case "lens_dismiss": {
      const found = findAnnotation(args.annotation_id as string);
      if (!found) return { error: "Annotation not found" };
      found.annotation.status = "dismissed";
      return { ok: true };
    }

    case "lens_reply": {
      const found = findAnnotation(args.annotation_id as string);
      if (!found) return { error: "Annotation not found" };
      found.annotation.thread.push({
        id: `msg_${Date.now()}`,
        author: (args.author as string) || "claude_code",
        content: args.message as string,
        timestamp: Date.now(),
      });
      return { ok: true, thread: found.annotation.thread };
    }

    case "lens_watch": {
      // Synchronous fallback — real long-poll handled in HTTP handler
      return { annotations: getPendingAnnotations() };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── SSE Broadcast ──────────────────────────────

function broadcastSSE(data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// ── HTTP Server ────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || "GET";

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE endpoint
  if (path === "/events" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.push(res);
    req.on("close", () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // MCP tool listing
  if (path === "/mcp/tools/list" || path === "/tools/list") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tools: MCP_TOOLS }));
    return;
  }

  // MCP tool call
  if ((path === "/mcp/tools/call" || path === "/tools/call") && method === "POST") {
    const body = await readBody(req);
    let parsed: { name: string; arguments?: Record<string, unknown> };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Special handling for lens_watch (long-poll)
    if (parsed.name === "lens_watch") {
      const pending = getPendingAnnotations();
      if (pending.length > 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: { annotations: pending } }));
      } else {
        // Wait up to 30s for new annotations
        const timer = setTimeout(() => {
          const idx = watchers.findIndex((w) => w.timer === timer);
          if (idx !== -1) watchers.splice(idx, 1);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ result: { annotations: [] } }));
        }, 30000);

        watchers.push({
          resolve: (annotations) => {
            clearTimeout(timer);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ result: { annotations } }));
          },
          timer,
        });
      }
      return;
    }

    const result = handleToolCall(parsed.name, parsed.arguments || {});
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ result }));
    return;
  }

  // Session update (from extension via fetch)
  if (path === "/sessions/update" && method === "POST") {
    const body = await readBody(req);
    try {
      const session = JSON.parse(body) as AnnotationSession;
      sessions.set(session.id, session);
      broadcastSSE({
        type: "annotation:created",
        session_id: session.id,
        annotation_count: session.annotations.length,
      });
      // Resolve watchers
      const pending = getPendingAnnotations();
      if (pending.length > 0) {
        for (const w of watchers) {
          clearTimeout(w.timer);
          w.resolve(pending);
        }
        watchers.length = 0;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid session data" }));
    }
    return;
  }

  // REST endpoints
  if (path === "/annotations/pending" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getPendingAnnotations()));
    return;
  }

  if (path === "/sessions" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Array.from(sessions.values())));
    return;
  }

  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", sessions: sessions.size, port: PORT }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[RenderDraw Lens MCP] Server listening on http://localhost:${PORT}`);
  console.log(`[RenderDraw Lens MCP] Health: http://localhost:${PORT}/health`);
  console.log(`[RenderDraw Lens MCP] SSE: http://localhost:${PORT}/events`);
  console.log(`[RenderDraw Lens MCP] Tools: http://localhost:${PORT}/mcp/tools/list`);
});
