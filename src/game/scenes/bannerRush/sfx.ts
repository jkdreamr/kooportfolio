/**
 * Event → sound (§5.7), with the limiter of §5.2 and the fallback map used
 * until the br-* palette recipes land. Haptics go through the juice kit
 * [R2-17].
 */
import type { RushKit } from "./kit";
import type { SoundKind } from "../../core/sound";

const FALLBACK: Record<string, SoundKind> = {
  "br-deploy": "stone",
  "br-hit": "tap",
  "br-tower": "paper",
  "br-poof": "paper",
  "br-crumble": "kick",
  "br-wake": "chime",
  "br-glow": "tap",
  "br-tick": "tap",
  "br-sting": "whistle",
};

export class Sfx {
  private lastHit = -1e9;
  private window0 = 0;
  private windowCount = 0;
  private poofs = 0;
  private poofWindow = 0;
  private towerSecond = 0;
  private towerCount = 0;
  private glowSecond = 0;
  private glowCount = 0;
  dragging = false;
  constructor(private kit: RushKit) {}
  // @hot
  play(name: string, now: number, x = 8, gain = 1, intensity = 1, side = 0) {
    if (now - this.window0 > 100) {
      this.window0 = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= 6) return;
    if (name === "br-hit") {
      if (now - this.lastHit < 60) return;
      this.lastHit = now;
    } else if (name === "br-poof") {
      if (now - this.poofWindow > 100) {
        this.poofWindow = now;
        this.poofs = 0;
      }
      if (++this.poofs > 3) return;
    } else if (name === "br-tower") {
      if (now - this.towerSecond > 1000) {
        this.towerSecond = now;
        this.towerCount = 0;
      }
      if (++this.towerCount > 4) return;
    } else if (name === "br-glow") {
      if (this.dragging) return;
      if (now - this.glowSecond > 1000) {
        this.glowSecond = now;
        this.glowCount = 0;
      }
      if (++this.glowCount > 4) return;
    }
    this.windowCount++;
    const pan = Math.max(-1, Math.min(1, (x - 8) / 8)) * 0.6;
    const kind = (name.startsWith("br-") && !this.kit.hasSound(name) ? FALLBACK[name] : name) as SoundKind;
    this.kit.sound(kind, { pan, gain: gain * (side === 0 ? 1 : 0.85), intensity });
  }
  haptic(kind: "tap" | "score" | "win" | "tower" | "overtime" | "loss") {
    if (this.kit.vibration && !this.kit.vibration()) return;
    // The tower / overtime / loss patterns arrive with WS-J's kit table [R2-17].
    const k = kind === "tower" || kind === "overtime" || kind === "loss" ? "score" : kind;
    this.kit.juice.haptic(k);
  }
}
