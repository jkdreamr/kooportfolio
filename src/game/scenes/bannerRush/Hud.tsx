/**
 * The match HUD (§1.10, §6.2): top bar, hand tray with the Glow rope,
 * callout, phase banners, tower HP labels, emotes and the pause dialog, plus
 * the pointer and keyboard input of §6.3–6.4. All per-frame motion goes
 * through the director (precomputed transforms); React re-renders only on
 * store changes.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { CARDS, UNIT_SPECS, type CardId } from "../../core/bannerRush/cards";
import { GLOW_UNIT } from "../../core/bannerRush/constants";
import { cardLabel, clockText } from "../../core/bannerRush/viewModel";
import { CardArt, EMOTES, EmoteFace } from "./cardArt";
import { screenToTile, tileToScreen, screenOut } from "./camera";
import { callout, useRushHud } from "./store";
import type { Director } from "./director";
import type { RushRuntime } from "./runtime";
import type { RushView } from "./view";

export type HudProps = {
  rt: RushRuntime;
  view: RushView;
  director: Director;
  opponent: { name: string; tier: string };
  team: [string, string];
  keepSelected: boolean;
  onPause: () => void;
  onEmote: (i: number) => void;
  tutorial?: boolean;
  onSkip?: () => void;
  readBoard: () => string;
};

const DRAG_PX = 8;
const TAP_MS = 250;

function Pennants({ side, count }: { side: 0 | 1; count: number }) {
  return (
    <div className="br-banners" data-side={side} aria-label={`${side === 0 ? "Your" : "Their"} banners: ${count}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`br-pennant ${side === 0 ? "mine" : "theirs"} ${i < count ? "won" : ""}`} />
      ))}
    </div>
  );
}

function TopBar({ opponent, onPause, tutorial, onSkip }: Pick<HudProps, "opponent" | "onPause" | "tutorial" | "onSkip">) {
  const seconds = useRushHud((s) => s.seconds);
  const banners = useRushHud((s) => s.banners);
  const phase = useRushHud((s) => s.phase);
  const late = seconds <= 10 && phase !== 4;
  const ot = phase === 2 || phase === 3;
  return (
    <div className="br-top">
      <div className="br-opp">
        <span className="br-opp-face" aria-hidden="true">
          {opponent.name.slice(0, 1)}
        </span>
        <span className="br-opp-text">
          <b>{opponent.name}</b>
          <small>{opponent.tier} tier</small>
        </span>
      </div>
      <Pennants side={0} count={banners[0]} />
      <div className={`br-timer ${late ? "late" : ""} ${ot ? "ot" : ""} ${phase === 1 ? "double" : ""}`} role="timer" aria-label={`${clockText(seconds)} left`}>
        {clockText(seconds)}
      </div>
      <Pennants side={1} count={banners[1]} />
      {tutorial ? (
        <button className="br-skip" onClick={onSkip}>
          Skip
        </button>
      ) : (
        <button className="br-pause" aria-label="Pause" onClick={onPause}>
          <span />
          <span />
        </button>
      )}
    </div>
  );
}

function GlowRope({ director }: { director: Director }) {
  const glow = useRushHud((s) => s.glow);
  const phase = useRushHud((s) => s.phase);
  return (
    <div className={`br-rope ${glow >= 10 ? "full" : ""} ${phase === 1 || phase === 2 ? "double" : phase === 3 ? "triple" : ""}`} aria-label={`Glow ${glow} of 10`}>
      <span className="br-glow-count" aria-hidden="true">
        {glow}
      </span>
      <span className="br-string" aria-hidden="true" />
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`br-lantern ${i < glow ? "lit" : ""}`} aria-hidden="true">
          <span
            className="br-lantern-fill"
            ref={(el) => {
              director.fillEls[i] = el;
              director.refill();
            }}
          />
        </span>
      ))}
      <span className="br-glow-word" aria-hidden="true">
        Glow
      </span>
    </div>
  );
}

function TowerLabels() {
  const towers = useRushHud((s) => s.towers);
  const max = useRushHud((s) => s.towerMax);
  const [pos, setPos] = useState<[number, number][]>([]);
  useLayoutEffect(() => {
    const place = () => {
      const at: [number, number, number][] = [
        [3, 20.5, -0.3],
        [13, 20.5, -0.3],
        [8, 25, -0.3],
        [13, 7.5, 4.9],
        [3, 7.5, 4.9],
        [8, 3, 6.4],
      ];
      setPos(
        at.map(([x, y, h], t) => {
          const p = tileToScreen(x, y + (t < 3 ? (t === 2 ? 2.6 : 2.1) : 0), h);
          return [p.x, p.y];
        }),
      );
    };
    place();
    window.addEventListener("resize", place);
    const id = window.setTimeout(place, 50);
    return () => {
      window.removeEventListener("resize", place);
      window.clearTimeout(id);
    };
  }, []);
  return (
    <>
      {towers.map((hp, t) =>
        hp > 0 && hp < max[t] && pos[t] ? (
          <span key={t} className={`br-tower-hp ${t < 3 ? "mine" : "theirs"}`} style={{ transform: `translate(${pos[t][0]}px, ${pos[t][1]}px)` }}>
            {hp}
          </span>
        ) : null,
      )}
    </>
  );
}

function PhaseBanner() {
  const banner = useRushHud((s) => s.banner);
  const [shown, setShown] = useState<typeof banner>(null);
  useEffect(() => {
    if (!banner) return;
    setShown(banner);
    const id = window.setTimeout(() => setShown(null), 1600);
    return () => window.clearTimeout(id);
  }, [banner]);
  if (!shown) return null;
  return (
    <div key={shown.key} className={`br-phase ${shown.tone}`} role="status">
      <b>{shown.text}</b>
      {shown.sub && <small>{shown.sub}</small>}
    </div>
  );
}

function Callout() {
  const text = useRushHud((s) => s.callout);
  const tone = useRushHud((s) => s.calloutTone);
  const key = useRushHud((s) => s.calloutKey);
  const prompt = useRushHud((s) => s.prompt);
  if (prompt)
    return (
      <div className="br-callout prompt" role="status">
        <span dangerouslySetInnerHTML={{ __html: prompt }} />
      </div>
    );
  if (!text) return null;
  return (
    <div key={key} className={`br-callout ${tone}`} role="status">
      {text}
    </div>
  );
}

function EmoteBubble() {
  const emote = useRushHud((s) => s.emote);
  const [shown, setShown] = useState<typeof emote>(null);
  useEffect(() => {
    if (!emote) return;
    setShown(emote);
    const id = window.setTimeout(() => setShown(null), 1800);
    return () => window.clearTimeout(id);
  }, [emote]);
  if (!shown) return null;
  return (
    <div key={shown.key} className={`br-bubble ${shown.side === 0 ? "mine" : "theirs"}`} aria-live="off">
      <EmoteFace i={EMOTES.indexOf(shown.text as (typeof EMOTES)[number])} />
      {shown.text}
    </div>
  );
}

/** One hand card. */
function Card({
  id,
  slot,
  glow,
  selected,
  entering,
  onDown,
  needRef,
  dealt,
}: {
  id: CardId | null;
  slot: number;
  glow: number;
  selected: boolean;
  entering: boolean;
  onDown: (slot: number, e: RPointerEvent<HTMLButtonElement>) => void;
  needRef: (el: HTMLElement | null) => void;
  dealt: boolean;
}) {
  if (!id)
    return (
      <span className="br-card empty" aria-hidden="true">
        <span className="br-card-inner" />
      </span>
    );
  const card = CARDS[id];
  const need = Math.max(0, card.cost - glow);
  return (
    <button
      className={`br-card ${selected ? "selected" : ""} ${need > 0 ? "poor" : ""} ${entering ? "entering" : ""} ${dealt ? "" : "undealt"}`}
      style={{ "--deal": slot } as CSSProperties}
      aria-label={cardLabel(id, need)}
      aria-pressed={selected}
      data-slot={slot}
      onPointerDown={(e) => onDown(slot, e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="br-card-inner">
        <span className="br-cost" aria-hidden="true">
          {card.cost}
        </span>
        <span className="br-key" aria-hidden="true">
          {slot + 1}
        </span>
        <CardArt id={id} />
        <span className="br-name">{card.name}</span>
        <span className="br-need-track" aria-hidden="true">
          <span className="br-need-fill" ref={needRef} />
        </span>
        {need > 0 && <span className="br-need">need {need}</span>}
      </span>
    </button>
  );
}

export function Hud(p: HudProps) {
  const { rt, view, director } = p;
  const hand = useRushHud((s) => s.hand);
  const next = useRushHud((s) => s.next);
  const glow = useRushHud((s) => s.glow);
  const selected = useRushHud((s) => s.selected);
  const dealt = useRushHud((s) => s.dealt);
  const live = useRushHud((s) => s.live);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [entering, setEntering] = useState(-1);
  const drag = useRef<{ slot: number; id: number; x0: number; y0: number; t0: number; moved: boolean; touch: boolean; chip: HTMLElement | null } | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const cursor = useRef({ x: 8.5, y: 18.5, shown: false });
  const emoteKey = useRef(false);

  const select = (slot: number) => {
    const s = useRushHud.getState();
    const next = s.selected === slot ? -1 : slot;
    useRushHud.setState({ selected: next });
    const card = next >= 0 ? rt.state.cards[next] : -1;
    view.selectedCard = card;
    if (next >= 0) {
      p.director.sfx.play("card", rt.now, 8, 0.7);
      director.sfx.haptic("tap");
      const c = CARDS[hand[next]!];
      if (c && window.innerHeight < 480) callout(c.name, "info", 1200);
    } else {
      view.preview.on = false;
      cursor.current.shown = false;
    }
  };
  const preview = (slot: number, x: number, y: number) => {
    const v = view.preview;
    const r = rt.check(slot, x, y);
    const nx = rt.state.cards[slot];
    const pos = { x: lastDeploy.x, y: lastDeploy.y };
    void pos;
    // checkDeploy wrote the snapped point into deployOut (via rt.check)
    const out = rtDeployOut();
    if (!v.on || out.x !== v.x || out.y !== v.y) {
      v.fromX = v.on ? v.x : out.x;
      v.fromY = v.on ? v.y : out.y;
      v.stepAt = rt.now;
    }
    v.on = true;
    v.slot = slot;
    v.card = nx;
    v.x = out.x;
    v.y = out.y;
    v.ok = r === 0 || r === 3;
    v.need = r === 3 ? 1 : 0;
  };
  const deploy = (slot: number, x: number, y: number) => {
    const r = rt.deploy(slot, x, y);
    const card = hand[slot];
    if (r === 0) {
      director.sfx.haptic("tap");
      flyCard(slot);
      setEntering(slot);
      window.setTimeout(() => setEntering(-1), 260);
      if (!p.keepSelected) {
        useRushHud.setState({ selected: -1 });
        view.selectedCard = -1;
        view.preview.on = false;
      }
      return true;
    }
    if (r !== 7) {
      const need = card ? Math.max(1, Math.ceil(CARDS[card].cost - rt.state.glow[0] / GLOW_UNIT)) : 0;
      const text = r === 3 ? `Need ${need} more Glow` : r === 4 ? "Not on their side yet" : r === 6 ? "The field is full" : r === 5 ? "Something is in the way" : "";
      if (text) callout(text, "bad", 1200);
      p.director.sfx.play("ui-error", rt.now);
      const el = document.querySelector<HTMLElement>(`.br-card[data-slot="${slot}"] .br-cost`);
      el?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 180 });
      bump(".br-rope");
    }
    return false;
  };

  /* -------------------------------------------------------------- pointer */
  const onCardDown = (slot: number, e: RPointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary || drag.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { slot, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, touch: e.pointerType === "touch", chip: chipRef.current };
    if (useRushHud.getState().selected !== slot) select(slot);
    director.sfx.dragging = true;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) {
        if (cursor.current.shown && e.pointerType === "mouse" && useRushHud.getState().selected >= 0 && !d) {
          // Mouse hover over the field previews the selected card.
          const sel = useRushHud.getState().selected;
          if (!overTray(e.clientY)) {
            const t = screenToTile(e.clientX, e.clientY);
            preview(sel, t.x, t.y);
          }
        }
        return;
      }
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_PX) d.moved = true;
      if (!d.moved) return;
      const lift = d.touch ? 56 : 0;
      const chip = d.chip;
      if (chip) {
        chip.style.transform = `translate(${e.clientX}px, ${e.clientY - lift}px)`;
        chip.dataset.on = "1";
        chip.dataset.over = overTray(e.clientY) ? "tray" : "field";
      }
      if (overTray(e.clientY)) {
        view.preview.on = false;
        return;
      }
      const t = screenToTile(e.clientX, e.clientY - lift * 0.4);
      preview(d.slot, t.x, t.y);
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      director.sfx.dragging = false;
      if (d.chip) d.chip.dataset.on = "";
      const quick = performance.now() - d.t0 < TAP_MS;
      if (!d.moved && quick) {
        // A tap on the card: selection was toggled on press; tapping a selected card deselects.
        return;
      }
      if (!d.moved) return;
      if (overTray(e.clientY)) {
        view.preview.on = false;
        return;
      }
      const lift = d.touch ? 56 : 0;
      const t = screenToTile(e.clientX, e.clientY - lift * 0.4);
      deploy(d.slot, t.x, t.y);
      view.preview.on = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });
  /** Tap on the field (tap-then-tap). */
  const fieldDown = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    // Field taps are read on the window (capture), so nothing layered over the
    // canvas can swallow them; HUD controls are excluded.
    const onControl = (t: EventTarget | null) => t instanceof Element && !!t.closest(".br-tray, .br-top, .br-emote-wrap, .br-pause-dialog, button, select, input");
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || onControl(e.target) || drag.current) return;
      onFieldDown(e as unknown as RPointerEvent<HTMLDivElement>);
    };
    const up = (e: PointerEvent) => {
      if (!e.isPrimary || onControl(e.target) || drag.current) return;
      onFieldUp(e as unknown as RPointerEvent<HTMLDivElement>);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  });
  const onFieldDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    fieldDown.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.button === 2) {
      useRushHud.setState({ selected: -1 });
      view.selectedCard = -1;
      view.preview.on = false;
    }
  };
  const onFieldUp = (e: RPointerEvent<HTMLDivElement>) => {
    const f = fieldDown.current;
    fieldDown.current = null;
    if (!f || Math.hypot(e.clientX - f.x, e.clientY - f.y) > 14) return;
    const sel = useRushHud.getState().selected;
    if (sel < 0) return;
    const t = screenToTile(e.clientX, e.clientY);
    preview(sel, t.x, t.y);
    if (!deploy(sel, t.x, t.y)) {
      // keep it selected after a refused tap; the ghost shows the reason
    }
  };

  /* ------------------------------------------------------------- keyboard */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input,textarea,select,[role=dialog]")) return;
      if (useRushHud.getState().paused) return;
      const k = e.key.toLowerCase();
      const c = cursor.current;
      let handled = true;
      if (emoteKey.current && k >= "1" && k <= "6") {
        emoteKey.current = false;
        p.onEmote(+k - 1);
      } else if (k >= "1" && k <= "4") select(+k - 1);
      else if (k === "tab") {
        const s = useRushHud.getState().selected;
        select(((s < 0 ? (e.shiftKey ? 0 : -1) : s) + (e.shiftKey ? 3 : 1)) % 4);
      } else if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        const step = e.shiftKey ? 3 : 1;
        const dx = k === "arrowleft" || k === "a" ? -step : k === "arrowright" || k === "d" ? step : 0;
        const dy = k === "arrowup" || k === "w" ? -step : k === "arrowdown" || k === "s" ? step : 0;
        if (!c.shown) c.shown = true;
        else moveCursor(dx, dy);
      } else if (k === "q") jump(3.5, 15.5);
      else if (k === "e") jump(13.5, 15.5);
      else if (k === "r") jump(c.x < 8 ? 6.5 : 9.5, 27.5);
      else if (k === "f") jump(8.5, 18.5);
      else if (k === "enter" || k === " ") {
        const sel = useRushHud.getState().selected;
        if (sel >= 0) {
          c.shown = true;
          deploy(sel, c.x, c.y);
        } else handled = false;
      } else if (k === "t") {
        emoteKey.current = true;
        setEmotesOpen(true);
      } else if (k === "i") useRushHud.setState((s) => ({ live: p.readBoard(), liveKey: s.liveKey + 1 }));
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const sel = useRushHud.getState().selected;
        if (c.shown && sel >= 0) preview(sel, c.x, c.y);
      }
    };
    const moveCursor = (dx: number, dy: number) => {
      const c = cursor.current;
      const sel = useRushHud.getState().selected;
      // With a card selected, skip across illegal tiles to the nearest legal one in that direction.
      let x = c.x + dx,
        y = c.y + dy;
      x = Math.max(0.5, Math.min(15.5, x));
      y = Math.max(0.5, Math.min(27.5, y));
      if (sel >= 0) {
        for (let n = 0; n < 28; n++) {
          const r = rt.check(sel, x, y);
          if (r === 0 || r === 3) break;
          if (r !== 4 && r !== 5) break;
          x = Math.max(0.5, Math.min(15.5, x + Math.sign(dx)));
          y = Math.max(0.5, Math.min(27.5, y + Math.sign(dy)));
          if (!dx && !dy) break;
        }
        const r = rt.check(sel, x, y);
        if (r !== 0 && r !== 3) return;
      }
      c.x = x;
      c.y = y;
    };
    const jump = (x: number, y: number) => {
      cursor.current.x = x;
      cursor.current.y = y;
      cursor.current.shown = true;
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const hidePointerCursor = () => {
    cursor.current.shown = false;
  };

  const flyCard = (slot: number) => {
    const el = document.querySelector<HTMLElement>(`.br-card[data-slot="${slot}"]`);
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    tileToScreen(view.preview.x, view.preview.y, 0);
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add("br-card-fly");
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.querySelector(".br-root")?.append(ghost);
    const dx = screenOut.x - (r.left + r.width / 2),
      dy = screenOut.y - (r.top + r.height / 2);
    ghost
      .animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
        ],
        { duration: 140, easing: "cubic-bezier(.2,.8,.2,1)" },
      )
      .finished.then(() => ghost.remove(), () => ghost.remove());
  };

  return (
    <div className={`br-hud ${p.tutorial ? "tutorial" : ""}`} onPointerMove={(e) => e.pointerType !== "mouse" || hidePointerCursor()}>
      <div className="br-field" role="application" aria-roledescription="battle field" aria-label="Battle field. Keys: 1 to 4 pick a card, arrows move the cursor, Q and E jump to your bridges, Enter places, T then 1 to 6 sends an emote, I reads the board, Escape pauses." onContextMenu={(e) => e.preventDefault()} />
      <TopBar opponent={p.opponent} onPause={p.onPause} tutorial={p.tutorial} onSkip={p.onSkip} />
      <Callout />
      <PhaseBanner />
      <TowerLabels />
      <EmoteBubble />
      <div className="br-emote-wrap">
        <button className="br-emote-btn" aria-label="Emotes" aria-expanded={emotesOpen} onClick={() => setEmotesOpen((o) => !o)}>
          <EmoteFace i={0} />
        </button>
        {emotesOpen && (
          <div className="br-emotes" role="menu">
            {EMOTES.map((t, i) => (
              <button
                key={t}
                role="menuitem"
                onClick={() => {
                  p.onEmote(i);
                  setEmotesOpen(false);
                }}
              >
                <EmoteFace i={i} />
                <span>{t}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="br-tray" onPointerDown={(e) => e.target === e.currentTarget && select(-1 === selected ? -1 : selected)}>
        <div className="br-next" aria-label={next ? `Next: ${CARDS[next].name}` : "Next card hidden"}>
          <small>Next</small>
          <span className="br-next-card">{next ? <CardArt id={next} /> : <span className="br-hidden">?</span>}</span>
          {next && <span className="br-next-cost">{CARDS[next].cost}</span>}
        </div>
        <div className="br-hand">
          {hand.map((id, slot) => (
            <Card
              key={slot}
              id={id}
              slot={slot}
              glow={glow}
              selected={selected === slot}
              entering={entering === slot}
              onDown={onCardDown}
              dealt={slot < dealt}
              needRef={(el) => {
                director.needEls[slot] = el;
                director.refill();
              }}
            />
          ))}
        </div>
        <GlowRope director={director} />
      </div>
      <SelectedPanel />
      <div className="br-drag-chip" ref={chipRef} aria-hidden="true">
        {selected >= 0 && hand[selected] ? <CardArt id={hand[selected]!} /> : null}
      </div>
      <div className="br-live" aria-live="polite">
        {live}
      </div>
    </div>
  );
}

/** Desktop: the selected card's details (bottom-left). */
function SelectedPanel() {
  const selected = useRushHud((s) => s.selected);
  const hand = useRushHud((s) => s.hand);
  const id = selected >= 0 ? hand[selected] : null;
  if (!id) return null;
  const c = CARDS[id];
  const u = c.unit >= 0 ? UNIT_SPECS[c.unit] : null;
  return (
    <aside className="br-selected" aria-hidden="true">
      <b>{c.name}</b>
      <span>
        Cost {c.cost} · {c.type === "spell" ? "spell" : c.type === "building" ? "building" : u?.proj ? "ranged" : "melee"}
        {u && u.targets === 1 ? " · hits air" : u && u.targets === 2 ? " · buildings only" : ""}
      </span>
      {u && (
        <span>
          HP {u.hp}
          {c.count > 1 ? ` ×${c.count}` : ""} · damage {u.dmg} · every {(u.hit / 20).toFixed(1)} s
        </span>
      )}
      <span>{c.special}</span>
      <small>1–4 card · arrows move · Enter place · Q/E bridges · Esc pause</small>
    </aside>
  );
}

/* helpers */
import { deployOut } from "../../core/bannerRush/field";
const lastDeploy = { x: 0, y: 0 };
const rtDeployOut = () => deployOut;
function overTray(clientY: number) {
  const tray = document.querySelector(".br-tray");
  if (!tray) return false;
  return clientY > tray.getBoundingClientRect().top;
}
function bump(sel: string) {
  document.querySelector<HTMLElement>(sel)?.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 220 });
}
