// ============================================================
// MCP Server — HTTP server in service worker for Claude Code
// Exposes lens_get_pending, lens_acknowledge, lens_resolve, etc.
// ============================================================

import type { RAFAnnotation, AnnotationSession } from "../shared/raf-schema";
import { MCP_PORT } from "../shared/constants";

// In-memory store (IndexedDB used for persistence, this for fast access)
let sessions: Map<string, AnnotationSession> = new Map();
let sseClients: Array<(data: string) => void> = [];
let pendingWatchers: Array<(annotations: RAFAnnotation[]) => void> = [];

export function updateSession(session: AnnotationSession) {
  sessions.set(session.id, session);
  // Notify SSE clients
  const event = JSON.stringify({
    type: "annotation:created",
    session_id: session.id,
    annotation_count: session.annotations.length,
    latest: session.annotations[session.annotations.length - 1],
  });
  for (const send of sseClients) {
    send(`data: ${event}\n\n`);
  }
  // Resolve any watchers
  const pending = getPendingAnnotations();
  if (pending.length > 0 && pendingWatchers.length > 0) {
    for (const resolve of pendingWatchers) {
      resolve(pending);
    }
    pendingWatchers = [];
  }
}

function getPendingAnnotations(): RAFAnnotation[] {
  const pending: RAFAnnotation[] = [];
  for (const session of sessions.values()) {
    for (const ann of session.annotations) {
      if (ann.status === "pending") pending.push(ann);
    }
  }
  return pending;
}

function findAnnotation(id: string): { session: AnnotationSession; annotation: RAFAnnotation; index: number } | null {
  for (const session of sessions.values()) {
    const idx = session.annotations.findIndex((a) => a.id === id);
    if (idx !== -1) return { session, annotation: session.annotations[idx], index: idx };
  }
  return null;
}

// MCP Tool definitions (for tool listing)
export const MCP_TOOLS = [
  {
    name: "lens_get_pending",
    description: "Get all pending annotations across all sessions. Each annotation includes the project context if one was set.",
    inputSchema: {
      type: "object",
      properties: {
        project_slug: { type: "string", description: "Optional: filter by project slug (e.g. 'journeys-app')" },
      },
    },
  },
  {
    name: "lens_get_session",
    description: "Get a specific annotation session by ID or URL. Includes project context (slug, name, repo) for routing to the correct codebase.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID" },
        url: { type: "string", description: "Page URL to find session for" },
      },
    },
  },
  {
    name: "lens_acknowledge",
    description: "Acknowledge an annotation (set status to acknowledged)",
    inputSchema: {
      type: "object",
      properties: { annotation_id: { type: "string" } },
      required: ["annotation_id"],
    },
  },
  {
    name: "lens_resolve",
    description: "Resolve an annotation",
    inputSchema: {
      type: "object",
      properties: {
        annotation_id: { type: "string" },
        resolved_by: { type: "string" },
        message: { type: "string" },
      },
      required: ["annotation_id"],
    },
  },
  {
    name: "lens_dismiss",
    description: "Dismiss an annotation",
    inputSchema: {
      type: "object",
      properties: { annotation_id: { type: "string" } },
      required: ["annotation_id"],
    },
  },
  {
    name: "lens_reply",
    description: "Reply to an annotation thread",
    inputSchema: {
      type: "object",
      properties: {
        annotation_id: { type: "string" },
        message: { type: "string" },
        author: { type: "string" },
      },
      required: ["annotation_id", "message"],
    },
  },
  {
    name: "lens_watch",
    description: "Long-poll for new pending annotations (blocks until new annotations arrive)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// Handle MCP tool calls
export function handleToolCall(toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case "lens_get_pending": {
      let pending = getPendingAnnotations();
      const projectSlug = args.project_slug as string | undefined;
      if (projectSlug) {
        // Filter: only return annotations from sessions matching this project
        const matchingSessions = new Set<string>();
        for (const session of sessions.values()) {
          if (session.project?.slug === projectSlug) {
            for (const ann of session.annotations) matchingSessions.add(ann.id);
          }
        }
        pending = pending.filter((a) => matchingSessions.has(a.id));
      }
      // Enrich each annotation with its session's project context
      const enriched = pending.map((ann) => {
        const session = findAnnotation(ann.id)?.session;
        return { ...ann, _project: session?.project || null };
      });
      return { annotations: enriched };
    }

    case "lens_get_session": {
      if (args.session_id) {
        const session = sessions.get(args.session_id as string);
        return session || { error: "Session not found" };
      }
      if (args.url) {
        for (const session of sessions.values()) {
          if (session.url === args.url) return session;
        }
        return { error: "No session found for URL" };
      }
      return { error: "Provide session_id or url" };
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
      return { ok: true, annotation: found.annotation };
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

    case "lens_watch":
      // This is handled via long-polling in the HTTP handler
      return { annotations: getPendingAnnotations() };

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// HTTP request handler (called from service worker fetch event)
export function handleHTTPRequest(url: URL, method: string, body?: unknown): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") {
    return { status: 204, headers: corsHeaders, body: "" };
  }

  const path = url.pathname;

  // MCP protocol endpoints
  if (path === "/mcp/tools/list" || path === "/tools/list") {
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ tools: MCP_TOOLS }),
    };
  }

  if (path === "/mcp/tools/call" || path === "/tools/call") {
    const req = body as { name: string; arguments: Record<string, unknown> } | undefined;
    if (!req?.name) {
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing tool name" }),
      };
    }
    const result = handleToolCall(req.name, req.arguments || {});
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    };
  }

  // Convenience REST endpoints
  if (path === "/annotations/pending" && method === "GET") {
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(getPendingAnnotations()),
    };
  }

  if (path === "/sessions" && method === "GET") {
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(Array.from(sessions.values())),
    };
  }

  if (path === "/health") {
    const projects = new Set<string>();
    for (const session of sessions.values()) {
      if (session.project?.slug) projects.add(session.project.slug);
    }
    return {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "ok",
        sessions: sessions.size,
        projects: Array.from(projects),
      }),
    };
  }

  return {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Not found" }),
  };
}
