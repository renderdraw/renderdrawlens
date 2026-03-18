// ============================================================
// RenderDraw Annotation Format (RAF) — Full TypeScript Schema
// ============================================================

export type AnnotationMode = "feedback" | "video_direction" | "qa_assertion";
export type Intent = "fix" | "change" | "question" | "approve" | "direct" | "assert";
export type Severity = "blocking" | "important" | "suggestion" | "cosmetic";
export type Status = "pending" | "acknowledged" | "in_progress" | "resolved" | "dismissed";
export type OutputTier = "minimal" | "standard" | "detailed" | "forensic";

export type TargetType =
  | "dom_element"
  | "shadow_element"
  | "text_selection"
  | "area_selection"
  | "threejs_object";

export type VideoAction =
  | "zoom_in"
  | "zoom_out"
  | "pan_to"
  | "highlight"
  | "crossfade"
  | "hold"
  | "track"
  | "reveal";

export type AssertionType =
  | "exists"
  | "visible"
  | "text_equals"
  | "style_matches"
  | "layout_within";

// ── Target Descriptor ──────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentNode {
  name: string;
  type: string;
  props?: Record<string, unknown>;
  source?: string;
}

export interface TargetDescriptor {
  type: TargetType;
  selector: string;
  bounding_box: BoundingBox;
  viewport_position: { x: number; y: number };
  element_tag: string;
  classes: string[];
  computed_styles?: Record<string, string>;
  component_tree?: ComponentNode[];
  shadow_host?: string;
  selected_text?: string;
  nearby_text?: string;
  source_file?: string;
}

// ── Video Direction ────────────────────────────

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation?: number;
}

export interface CaptureConfig {
  width: number;
  height: number;
  fps: number;
  crop_region?: BoundingBox;
}

export interface VideoDirectionFields {
  sequence_order: number;
  action: VideoAction;
  duration_ms: number;
  easing: string;
  camera_start?: CameraState;
  camera_end?: CameraState;
  narration?: string;
  capture_config?: CaptureConfig;
}

// ── QA Assertion ───────────────────────────────

export interface QAAssertionFields {
  assertion_type: AssertionType;
  expected_value: string;
  snapshot_data?: string;
  playwright_selector: string;
}

// ── Thread / Classification ────────────────────

export interface ThreadMessage {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

// ── Core Annotation ────────────────────────────

export interface RAFAnnotation {
  id: string;
  comment: string;
  target: TargetDescriptor;
  timestamp: number;
  mode: AnnotationMode;
  source_url: string;

  // Classification
  intent: Intent;
  severity: Severity;
  status: Status;
  assignee?: string;
  thread: ThreadMessage[];
  resolved_by?: string;
  resolved_at?: string;
  tags: string[];

  // Mode-specific
  video_direction?: VideoDirectionFields;
  qa_assertion?: QAAssertionFields;
}

// ── Project Context ────────────────────────────

export interface ProjectContext {
  slug: string;       // e.g. "journeys-app", "renderdraw-engine"
  name: string;       // Display name
  repo?: string;      // e.g. "github.com/renderdraw/journeys"
}

// ── Session ────────────────────────────────────

export interface AnnotationSession {
  id: string;
  url: string;
  title: string;
  created_at: number;
  updated_at: number;
  annotations: RAFAnnotation[];
  mode: AnnotationMode;
  project?: ProjectContext;
}

// ── ID Generation ──────────────────────────────

let _counter = 0;
export function generateRAFId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  _counter++;
  return `raf_${ts}_${rand}_${_counter}`;
}
