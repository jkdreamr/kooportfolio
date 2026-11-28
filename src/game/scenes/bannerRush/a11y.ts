/**
 * One polite live region, throttled to a message per 1.5 s; tower and clock
 * messages (priority ≥ 3) jump the queue (§6.9).
 */
import { useRushHud } from "./store";

export class A11y {
  private queue: { text: string; priority: number }[] = [];
  private last = 0;
  private timer = 0;
  say(text: string, priority = 1) {
    if (!text) return;
    if (priority >= 3) this.queue.unshift({ text, priority });
    else {
      if (this.queue.length > 4) this.queue.pop();
      this.queue.push({ text, priority });
    }
    this.pump();
  }
  private pump() {
    if (this.timer) return;
    const wait = Math.max(0, 1500 - (performance.now() - this.last));
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      const next = this.queue.shift();
      if (!next) return;
      this.last = performance.now();
      useRushHud.setState((s) => ({ live: next.text, liveKey: s.liveKey + 1 }));
      if (this.queue.length) this.pump();
    }, wait);
  }
  dispose() {
    window.clearTimeout(this.timer);
    this.queue = [];
  }
}
