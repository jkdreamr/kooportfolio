import { create } from "zustand";

/**
 * Short notices, bottom-centre above the dock. At most two at once (a third
 * pushes the oldest out), each for 4 s unless sticky, and the clock stops
 * while the pointer rests on a toast. Pure queue logic is exported for tests.
 */
export const TOAST_MS = 4000;
export const TOAST_MAX = 2;

export type Toast = {
  id: number;
  text: string;
  /** Stays until dismissed (storage problems, a save conflict). */
  sticky?: boolean;
  /** Milliseconds left on its clock. */
  left: number;
};

export function pushToast(list: readonly Toast[], toast: Toast, max = TOAST_MAX): Toast[] {
  const rest = list.filter((t) => t.text !== toast.text);
  return [...rest, toast].slice(-max);
}

/** Advances every unpaused clock by `dt`; drops toasts whose time is up. */
export function tickToasts(list: readonly Toast[], dt: number, paused: boolean): Toast[] {
  if (paused || dt <= 0) return list as Toast[];
  let changed = false;
  const next: Toast[] = [];
  for (const t of list) {
    if (t.sticky) {
      next.push(t);
      continue;
    }
    changed = true;
    const left = t.left - dt;
    if (left > 0) next.push({ ...t, left });
  }
  return changed ? next : (list as Toast[]);
}

let nextId = 1;
type ToastState = {
  toasts: Toast[];
  paused: boolean;
  show: (text: string, options?: { sticky?: boolean }) => number;
  dismiss: (id: number) => void;
  setPaused: (paused: boolean) => void;
  tick: (dt: number) => void;
};
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  paused: false,
  show(text, options) {
    const id = nextId++;
    set({ toasts: pushToast(get().toasts, { id, text, sticky: options?.sticky, left: TOAST_MS }) });
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  setPaused(paused) {
    if (get().paused !== paused) set({ paused });
  },
  tick(dt) {
    const next = tickToasts(get().toasts, dt, get().paused);
    if (next !== get().toasts) set({ toasts: next });
  },
}));
export const showToast = (text: string, options?: { sticky?: boolean }) =>
  useToasts.getState().show(text, options);
