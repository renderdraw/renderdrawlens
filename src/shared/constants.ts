// ============================================================
// Journeys-matched Design Tokens
// ============================================================

export const COLORS = {
  // Backgrounds
  bgDark: "#0a0a0f",
  bgPanel: "#12121a",
  bgCard: "#1a1a24",
  bgCardHover: "#22222e",
  bgOverlay: "rgba(10, 10, 15, 0.85)",

  // Borders
  border: "#2a2a3a",
  borderLight: "rgba(255, 255, 255, 0.08)",
  borderFocus: "rgba(245, 158, 11, 0.7)",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#a0a0b0",
  textMuted: "#606070",

  // Brand: Gold
  gold: "#FFD700",
  goldDim: "rgba(255, 215, 0, 0.15)",
  amber500: "#f59e0b",
  amber600: "#d97706",

  // Brand: Teal
  teal: "#14B8A6",
  tealDim: "rgba(20, 184, 166, 0.15)",

  // Severity
  blocking: "#ef4444",
  important: "#f59e0b",
  suggestion: "#14B8A6",
  cosmetic: "#606070",

  // Status
  pending: "#f59e0b",
  acknowledged: "#3b82f6",
  inProgress: "#8b5cf6",
  resolved: "#22c55e",
  dismissed: "#606070",
} as const;

export const FONTS = {
  family: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
} as const;

export const MCP_PORT = 4848;

export const EXTENSION_ID = "renderdraw-lens";

export const STORAGE_KEYS = {
  sessions: "lens_sessions",
  settings: "lens_settings",
  activeMode: "lens_active_mode",
} as const;

// Message types between content script, service worker, and UI
export const MSG = {
  // Content → Background
  ANNOTATION_CREATED: "annotation:created",
  ANNOTATION_UPDATED: "annotation:updated",
  ANNOTATION_DELETED: "annotation:deleted",
  SESSION_UPDATED: "session:updated",

  // Background → Content
  TOGGLE_LENS: "lens:toggle",
  SET_MODE: "lens:set_mode",
  CLEAR_ANNOTATIONS: "lens:clear",

  // Content → Popup/SidePanel
  STATE_CHANGED: "state:changed",

  // Video Director
  CAPTURE_START: "capture:start",
  CAPTURE_STOP: "capture:stop",
  CAPTURE_SEGMENT: "capture:segment",

  // MCP
  MCP_PUSH: "mcp:push",
} as const;
