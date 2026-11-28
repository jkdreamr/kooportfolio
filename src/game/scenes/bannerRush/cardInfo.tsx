/**
 * Card info: the plain-language back of a card, read straight from the stats
 * table in core/bannerRush/cards.ts. Used by the deck builder's flip card and
 * the in-match info sheet.
 */
import { useEffect, useState } from "react";
import {
  CARDS,
  SPELLS,
  T_ALL,
  T_BUILDINGS,
  UNIT_SPECS,
  type CardId,
} from "../../core/bannerRush/cards";
import { DEPLOY_TICKS, TICK_HZ } from "../../core/bannerRush/constants";
import { useRushHud } from "./store";

/** Soft hyphens in the long single words, so names wrap instead of clipping on small cards. */
export const softName = (n: string) =>
  n
    .replace("Shieldbearer", "Shield\u00adbearer")
    .replace("Badminton", "Bad\u00adminton");

const INFO_EVENT = "br-card-info";
/** Open the in-match info sheet for a card (the "i" corner on a hand card). */
export const openCardInfo = (id: CardId) =>
  window.dispatchEvent(new CustomEvent<CardId>(INFO_EVENT, { detail: id }));

const num = (n: number) => (Math.round(n * 10) / 10).toString();
const targetWord = (t: number) =>
  t === T_BUILDINGS ? "Buildings" : t === T_ALL ? "Ground & air" : "Ground";
const speedWord = (tps: number) =>
  tps >= 1.8 ? "Very fast" : tps >= 1.4 ? "Fast" : tps >= 1 ? "Medium" : "Slow";

export type CardFacts = {
  role: string;
  stats: [string, string][];
  special: string;
};

export function cardFacts(id: CardId): CardFacts {
  const c = CARDS[id];
  if (c.type === "spell") {
    const sp = SPELLS[id as keyof typeof SPELLS];
    const area =
      "radius" in sp
        ? `${num(sp.radius)} tiles`
        : `${num(sp.length)} × ${num(sp.width)} tiles`;
    const stats: [string, string][] = [
      ["Damage", `${sp.dmg}`],
      ["To towers", `${sp.tower}`],
      ["Area", area],
      ["Hits", "Ground & air"],
    ];
    if ("stun" in sp) stats.push(["Stun", `${num(sp.stun / TICK_HZ)} s`]);
    if ("delay" in sp && sp.delay)
      stats.push(["Lands after", `${num(sp.delay / TICK_HZ)} s`]);
    return {
      role: "Spell · hits everything in its area",
      stats,
      special: c.special,
    };
  }
  const u = UNIT_SPECS[c.unit];
  const kind =
    c.type === "building" ? "Building" : u.air ? "Air troop" : "Ground troop";
  const fights = u.dmg > 0;
  const stats: [string, string][] = [["HP", `${u.hp}`]];
  if (fights) {
    stats.push(
      ["Damage", `${u.dmg}`],
      ["Hits per second", num(TICK_HZ / u.hit)],
    );
  }
  if (c.type === "troop") {
    const tps = u.speed * TICK_HZ;
    stats.push(["Speed", `${speedWord(tps)} (${num(tps)})`]);
  }
  if (fights)
    stats.push(
      ["Range", u.range <= 1 ? "Melee" : `${num(u.range)} tiles`],
      ["Targets", targetWord(u.targets)],
    );
  if (c.count > 1) stats.push(["Count", `×${c.count}`]);
  stats.push(["Deploy time", `${num(DEPLOY_TICKS / TICK_HZ)} s`]);
  const role = fights
    ? `${kind} · targets ${targetWord(u.targets).toLowerCase()}`
    : `${kind} · does not attack`;
  return { role, stats, special: c.special };
}

/** The back of a card: role line, stats and the special in one sentence. */
export function CardFactsView({ id, unlock }: { id: CardId; unlock?: string }) {
  const f = cardFacts(id);
  return (
    <div className="br-facts">
      <p className="br-facts-role">{f.role}</p>
      <dl className="br-facts-stats">
        {f.stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="br-facts-special">{f.special}</p>
      {unlock && <p className="br-facts-unlock">{unlock}</p>}
    </div>
  );
}

/**
 * In-match card info: long-press a hand card to open a small, non-blocking
 * sheet with the same facts. The match keeps running; tap the sheet or let go
 * and tap elsewhere to close it.
 */
export function CardInfoSheet() {
  const [id, setId] = useState<CardId | null>(null);
  useEffect(() => {
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    const cancel = () => {
      window.clearTimeout(timer);
      start = null;
    };
    const down = (e: PointerEvent) => {
      const el =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>(".br-card[data-slot]")
          : null;
      if (!el) {
        if (
          !(
            e.target instanceof Element &&
            e.target.closest(".br-info-sheet, .br-info")
          )
        )
          setId(null);
        return;
      }
      const slot = Number(el.dataset.slot);
      start = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const card = useRushHud.getState().hand[slot];
        if (card) setId(card);
      }, 420);
    };
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10)
        cancel();
    };
    const open = (e: Event) => setId((e as CustomEvent<CardId>).detail);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !document.querySelector(".br-info-sheet"))
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setId(null);
    };
    window.addEventListener(INFO_EVENT, open);
    window.addEventListener("keydown", esc, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", cancel, true);
    document.addEventListener("pointercancel", cancel, true);
    return () => {
      cancel();
      window.removeEventListener(INFO_EVENT, open);
      window.removeEventListener("keydown", esc, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", cancel, true);
      document.removeEventListener("pointercancel", cancel, true);
    };
  }, []);
  if (!id) return null;
  const c = CARDS[id];
  return (
    <div
      className="br-info-sheet"
      role="dialog"
      aria-label={`${c.name} card info`}
    >
      <header>
        <span className="br-cost" aria-hidden="true">
          {c.cost}
        </span>
        <h4>{c.name}</h4>
        <button
          className="br-info-close"
          aria-label="Close card info"
          onClick={() => setId(null)}
        >
          &times;
        </button>
      </header>
      <CardFactsView id={id} />
    </div>
  );
}
