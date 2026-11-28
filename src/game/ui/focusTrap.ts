/**
 * Modal focus helpers (Hud's Modal uses them). Plain DOM, no React.
 */
export const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Tabbable controls inside `root`, in order (hidden ones skipped). */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[hidden],[inert]") && el.getClientRects().length > 0,
  );
}

/** Tab inside a modal: wraps at both ends, and from the container itself
 * (where focus starts) Shift+Tab goes to the last control, not out. */
export function trapTab(root: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  const els = tabbables(root);
  const active = document.activeElement;
  if (!els.length) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = els[0],
    last = els[els.length - 1];
  const outside = !active || !root.contains(active);
  if (e.shiftKey && (active === first || active === root || outside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || outside)) {
    e.preventDefault();
    first.focus();
  }
}

/** On close, give focus back only if it is still ours (inside the modal or
 * lost to <body>): another modal that opened meanwhile keeps its focus. */
export function restoreFocus(root: HTMLElement | null, previous: HTMLElement | null, fallback?: () => HTMLElement | null): void {
  const active = document.activeElement;
  if (active && active !== document.body && !(root && root.contains(active))) return;
  const target = previous?.isConnected ? previous : (fallback?.() ?? null);
  target?.focus();
}
