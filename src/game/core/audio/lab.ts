/**
 * QA-only audio lab (`/play?audio-lab=1` in a QA build): one button per
 * palette sound and per loop, for a reviewer to audition the real engine in
 * the real game. Plain DOM, mounted once; never part of the normal build.
 */
import { audio, loop, play } from "./live";
import { PALETTE_NAMES, type LoopHandle, type LoopName } from "./palette";

const LOOPS: LoopName[] = ["sizzle", "wheels", "crowd", "fountain-bed"];

export function mountAudioLab() {
  if (document.getElementById("audio-lab")) return;
  const panel = document.createElement("div");
  panel.id = "audio-lab";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Audio lab");
  Object.assign(panel.style, {
    position: "fixed", left: "8px", bottom: "8px", zIndex: "99999", maxWidth: "min(560px, 96vw)",
    maxHeight: "46vh", overflow: "auto", padding: "10px", display: "flex", flexWrap: "wrap", gap: "6px",
    background: "rgba(20,24,22,0.86)", borderRadius: "10px", font: "13px system-ui, sans-serif", color: "#fff",
  });
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, { minHeight: "32px", padding: "4px 10px", borderRadius: "6px", border: "1px solid #5a6", background: "#26302a", color: "#fff", font: "inherit", cursor: "pointer" });
    b.addEventListener("click", onClick);
    panel.append(b);
    return b;
  };
  for (const name of PALETTE_NAMES) button(name, () => play(name, name === "flight" ? { duration: 4.6 } : {}));
  const running = new Map<LoopName, LoopHandle>();
  for (const name of LOOPS) {
    const b = button(`loop: ${name}`, () => {
      const on = running.get(name);
      if (on) {
        on.stop();
        running.delete(name);
        b.style.background = "#26302a";
      } else {
        const handle = loop(name);
        if (!handle) return;
        handle.set(0.8);
        running.set(name, handle);
        b.style.background = "#3c6a4a";
      }
    });
  }
  const status = document.createElement("output");
  status.style.flexBasis = "100%";
  panel.prepend(status);
  setInterval(() => {
    status.textContent = `context: ${audio.ctx?.state ?? "none (tap anywhere)"} · voices: ${audio.pool.active(audio.ctx?.currentTime ?? 0).length} · built: ${audio.built} · muted: ${audio.isMuted}`;
  }, 250);
  document.body.append(panel);
}
