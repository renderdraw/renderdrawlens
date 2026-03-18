// ============================================================
// Injected Styles — Journeys Dark Theme
// All styles scoped to .rdl- prefix to avoid page conflicts
// ============================================================

export const LENS_STYLES = `
  /* ── Base Reset for Lens Elements ─────────── */
  .rdl-root,
  .rdl-root * {
    box-sizing: border-box;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ── Hover Highlight Overlay ──────────────── */
  .rdl-highlight {
    position: fixed;
    pointer-events: none;
    z-index: 2147483640;
    border: 2px solid #FFD700;
    background: rgba(255, 215, 0, 0.06);
    border-radius: 3px;
    transition: all 0.1s ease-out;
  }

  .rdl-highlight::after {
    content: attr(data-tag);
    position: absolute;
    top: -22px;
    left: -1px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    background: #FFD700;
    color: #0a0a0f;
    border-radius: 3px 3px 0 0;
    white-space: nowrap;
    text-transform: uppercase;
  }

  /* ── Selected Element ─────────────────────── */
  .rdl-selected {
    position: fixed;
    pointer-events: none;
    z-index: 2147483639;
    border: 2px solid #14B8A6;
    background: rgba(20, 184, 166, 0.08);
    border-radius: 3px;
  }

  /* ── Annotation Markers ───────────────────── */
  .rdl-marker {
    position: fixed;
    z-index: 2147483641;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #12121a;
    border: 2px solid #FFD700;
    color: #FFD700;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    user-select: none;
  }

  .rdl-marker:hover {
    transform: scale(1.2);
    background: #1a1a24;
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
  }

  .rdl-marker--blocking { border-color: #ef4444; color: #ef4444; }
  .rdl-marker--important { border-color: #f59e0b; color: #f59e0b; }
  .rdl-marker--suggestion { border-color: #14B8A6; color: #14B8A6; }
  .rdl-marker--cosmetic { border-color: #606070; color: #606070; }

  .rdl-marker--resolved {
    opacity: 0.4;
    border-style: dashed;
  }

  /* ── Annotation Popup ─────────────────────── */
  .rdl-popup {
    position: fixed;
    z-index: 2147483645;
    width: 380px;
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
    overflow: hidden;
    animation: rdl-popup-in 0.15s ease-out;
  }

  @keyframes rdl-popup-in {
    from { opacity: 0; transform: translateY(8px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .rdl-popup__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a3a;
    background: #0a0a0f;
  }

  .rdl-popup__title {
    font-size: 12px;
    font-weight: 600;
    color: #FFD700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .rdl-popup__target-tag {
    font-size: 11px;
    color: #a0a0b0;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .rdl-popup__body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── Textarea ─────────────────────────────── */
  .rdl-textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px 12px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    color: #ffffff;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
  }

  .rdl-textarea:focus {
    border-color: rgba(245, 158, 11, 0.7);
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
  }

  .rdl-textarea::placeholder {
    color: #606070;
  }

  /* ── Select Rows ──────────────────────────── */
  .rdl-row {
    display: flex;
    gap: 8px;
  }

  .rdl-select-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rdl-label {
    font-size: 10px;
    font-weight: 600;
    color: #606070;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .rdl-select {
    width: 100%;
    padding: 6px 10px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #ffffff;
    font-size: 12px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23606070' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
  }

  .rdl-select:focus {
    border-color: rgba(245, 158, 11, 0.7);
  }

  .rdl-select option {
    background: #12121a;
    color: #ffffff;
  }

  /* ── Video Direction Fields ───────────────── */
  .rdl-video-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: rgba(20, 184, 166, 0.05);
    border: 1px solid rgba(20, 184, 166, 0.15);
    border-radius: 8px;
  }

  .rdl-video-fields__title {
    font-size: 11px;
    font-weight: 600;
    color: #14B8A6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .rdl-input {
    width: 100%;
    padding: 6px 10px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    color: #ffffff;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }

  .rdl-input:focus {
    border-color: rgba(245, 158, 11, 0.7);
  }

  .rdl-input::placeholder {
    color: #606070;
  }

  /* ── QA Assertion Fields ──────────────────── */
  .rdl-qa-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: rgba(245, 158, 11, 0.05);
    border: 1px solid rgba(245, 158, 11, 0.15);
    border-radius: 8px;
  }

  .rdl-qa-fields__title {
    font-size: 11px;
    font-weight: 600;
    color: #f59e0b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ── Action Buttons ───────────────────────── */
  .rdl-popup__footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #2a2a3a;
    background: #0a0a0f;
  }

  .rdl-btn {
    flex: 1;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .rdl-btn--primary {
    background: linear-gradient(135deg, #FFD700, #f59e0b);
    color: #0a0a0f;
  }

  .rdl-btn--primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
  }

  .rdl-btn--secondary {
    background: #1a1a24;
    color: #a0a0b0;
    border: 1px solid #2a2a3a;
  }

  .rdl-btn--secondary:hover {
    background: #22222e;
    color: #ffffff;
  }

  .rdl-btn--danger {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .rdl-btn--danger:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  /* ── Tags Input ───────────────────────────── */
  .rdl-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 10px;
    background: #0a0a0f;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    min-height: 32px;
    align-items: center;
  }

  .rdl-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 4px;
    font-size: 11px;
    color: #FFD700;
  }

  .rdl-tag__remove {
    cursor: pointer;
    opacity: 0.6;
    font-size: 14px;
    line-height: 1;
  }

  .rdl-tag__remove:hover {
    opacity: 1;
  }

  .rdl-tags__input {
    border: none;
    background: transparent;
    color: #ffffff;
    font-size: 12px;
    font-family: inherit;
    outline: none;
    flex: 1;
    min-width: 60px;
  }

  .rdl-tags__input::placeholder {
    color: #606070;
  }

  /* ── Lens Active Indicator ────────────────── */
  .rdl-active-badge {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #12121a;
    border: 1px solid #2a2a3a;
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    font-size: 11px;
    font-weight: 600;
    color: #FFD700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .rdl-active-badge:hover {
    background: #1a1a24;
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.15);
  }

  .rdl-active-badge__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #FFD700;
    animation: rdl-pulse 2s ease-in-out infinite;
  }

  .rdl-active-badge--video .rdl-active-badge__dot {
    background: #ef4444;
  }

  .rdl-active-badge--video {
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .rdl-active-badge--qa {
    border-color: rgba(245, 158, 11, 0.3);
    color: #f59e0b;
  }

  .rdl-active-badge--qa .rdl-active-badge__dot {
    background: #f59e0b;
  }

  @keyframes rdl-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* ── Styles Accordion ─────────────────────── */
  .rdl-accordion {
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    overflow: hidden;
  }

  .rdl-accordion__trigger {
    width: 100%;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border: none;
    color: #a0a0b0;
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .rdl-accordion__trigger:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #ffffff;
  }

  .rdl-accordion__content {
    padding: 8px 10px;
    border-top: 1px solid #2a2a3a;
    font-size: 11px;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    color: #a0a0b0;
    max-height: 200px;
    overflow-y: auto;
  }

  .rdl-accordion__content::-webkit-scrollbar {
    width: 6px;
  }

  .rdl-accordion__content::-webkit-scrollbar-track {
    background: #12121a;
  }

  .rdl-accordion__content::-webkit-scrollbar-thumb {
    background: #2a2a3a;
    border-radius: 3px;
  }

  .rdl-style-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }

  .rdl-style-row__key {
    color: #14B8A6;
  }

  .rdl-style-row__val {
    color: #a0a0b0;
  }

  /* ── Recording Indicator ──────────────────── */
  .rdl-recording {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    color: #ef4444;
  }

  .rdl-recording__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    animation: rdl-pulse 1s ease-in-out infinite;
  }
`;
