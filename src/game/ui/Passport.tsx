/**
 * The Village Passport panel (PLAN_GAMES §3.1–3.2, J1), its stamp announcer
 * and the Daily Three page (J4). All local: it reads the save and writes
 * nothing but the `passport:opened` memory and Daily Three progress.
 */
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { STAMPS, STAMP_COLOURS, stampsEarned, type Stamp, type StampWorld } from "../core/passport";
import { type MedalGame } from "../core/medals";
import { dailyThree, dayNumber, onRun, secondsToNextDay } from "../core/daily";
import { useGame } from "../core/store";
import { useGameMode } from "../core/gameMode";
import { cue } from "../core/audio/cues";
import { juice } from "../scenes/juice/Juice";
import { showToast } from "./toasts";
import { MedalRow } from "./MedalRow";
import { Icon } from "./Icon";
import "./passport.css";

export type PassportPage = StampWorld | "daily";
const PAGES: readonly { id: PassportPage; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "stanford", label: "Stanford" },
  { id: "korea", label: "Korea" },
  { id: "village", label: "Village" },
  { id: "daily", label: "Daily" },
];
/** Stamps that belong to a game with medals: the stamp carries its ring. */
const STAMP_GAME: Readonly<Record<string, MedalGame>> = {
  "home.toss": "paper-toss",
  "home.kitchen": "kitchen",
  "home.go": "go",
  "home.kick": "stadium",
  "home.beat": "music",
  "stanford.hoops": "basketball",
  "stanford.shuttle": "badminton",
  "stanford.crew": "rowing",
  "stanford.skate": "skate",
  "stanford.lights": "math",
  "stanford.bench": "gym",
  "stanford.kappa": "pong",
};
const OPENED = "passport:opened";

type PassportStore = {
  open: boolean;
  page: PassportPage;
  /** Stamps earned during a game mode, waiting for its result card. */
  queue: string[];
  /** Queued stamps a result card has shown (cleared when it closes). */
  shown: string[];
};
export const usePassport = create<PassportStore>(() => ({ open: false, page: "home", queue: [], shown: [] }));
export function openPassport(page?: PassportPage) {
  const world = useGame.getState().world as StampWorld;
  usePassport.setState({ open: true, page: page ?? (world in STAMP_COLOURS ? world : "home") });
}
export const closePassport = () => usePassport.setState({ open: false });

const nameOf = (id: string) => STAMPS.find((s) => s.id === id)?.name ?? id;
function toastStamp(id: string) {
  showToast(`Stamp: ${nameOf(id)}`);
  cue("toast");
  juice.haptic("score");
}

/**
 * Announces newly earned stamps once (comparing the earned set before and
 * after every save write), holds them during a game mode for its result
 * card, and marks Daily Three tasks done from reported runs. Mount once.
 */
export function usePassportAnnouncer() {
  useEffect(() => {
    let earned = stampsEarned(useGame.getState().save);
    const unsubscribeSave = useGame.subscribe((state, previous) => {
      if (state.save === previous.save) return;
      const now = stampsEarned(state.save);
      for (const id of now) {
        if (earned.has(id)) continue;
        if (useGameMode.getState().active) usePassport.setState((s) => ({ queue: [...s.queue, id] }));
        else toastStamp(id);
      }
      earned = now;
    });
    const unsubscribeMode = useGameMode.subscribe((state, previous) => {
      if (!previous.active || state.active) return;
      // The mode ended: whatever no result card showed is toasted now.
      const { queue, shown } = usePassport.getState();
      for (const id of queue) if (!shown.includes(id)) toastStamp(id);
      usePassport.setState({ queue: [], shown: [] });
    });
    const unsubscribeRuns = onRun((report) => {
      for (const task of dailyThree(report.day))
        if (task.done(report, report.day)) useGame.getState().recordDaily(task.id, 3, report.day);
    });
    return () => {
      unsubscribeSave();
      unsubscribeMode();
      unsubscribeRuns();
    };
  }, []);
}

/** On a result card: the stamps this run earned ("Stamp: Line Run"). */
export function QueuedStamps() {
  const queue = usePassport((s) => s.queue);
  useEffect(() => {
    if (!queue.length) return;
    cue("toast");
    usePassport.setState((s) => ({ shown: [...new Set([...s.shown, ...queue])] }));
  }, [queue]);
  useEffect(
    () => () => {
      const { queue: q, shown } = usePassport.getState();
      usePassport.setState({ queue: q.filter((id) => !shown.includes(id)), shown: [] });
    },
    [],
  );
  if (!queue.length) return null;
  return (
    <p className="queued-stamps" role="status">
      {queue.map((id) => (
        <b key={id}>Stamp: {nameOf(id)}</b>
      ))}
    </p>
  );
}

/** A stamp's badge: a ring in the world colour, inked when earned. */
function StampBadge({ stamp, earned }: { stamp: Stamp; earned: boolean }) {
  const colour = STAMP_COLOURS[stamp.world];
  const initials = stamp.name
    .replace(/[^A-Za-z0-9 -]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <svg className="stamp-badge" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill={earned ? colour : "none"} stroke={colour} strokeWidth="2.5" strokeDasharray={earned ? undefined : "4 3"} />
      <circle cx="24" cy="24" r="16" fill="none" stroke={earned ? "#fff8e6" : colour} strokeOpacity={earned ? 0.7 : 0.45} strokeWidth="1.2" />
      <text x="24" y="29" textAnchor="middle" fontSize="14" fontWeight="700" fill={earned ? "#fff8e6" : colour} opacity={earned ? 1 : 0.7}>
        {initials}
      </text>
    </svg>
  );
}

function StampCard({ stamp, earned }: { stamp: Stamp; earned: boolean }) {
  const game = STAMP_GAME[stamp.id];
  return (
    <li className={`stamp-card${earned ? " is-earned" : ""}`} tabIndex={0} aria-label={`${stamp.name}: ${earned ? "earned" : stamp.how}`}>
      <StampBadge stamp={stamp} earned={earned} />
      <span className="stamp-text">
        <b>{stamp.name}</b>
        <small>{earned ? "Earned" : stamp.how}</small>
      </span>
      {game && <MedalRow game={game} compact />}
    </li>
  );
}

function useCountdown() {
  const [left, setLeft] = useState(() => secondsToNextDay());
  useEffect(() => {
    const id = setInterval(() => setLeft(secondsToNextDay()), 30_000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(left / 3600),
    m = Math.floor((left % 3600) / 60);
  return `${h} h ${m} m`;
}

function DailyPage() {
  const daily = useGame((s) => s.save.daily);
  const day = dayNumber();
  const tasks = dailyThree(day);
  const done = daily && daily.day === day ? daily.done : [];
  const countdown = useCountdown();
  return (
    <section className="passport-daily" aria-label="Daily Three">
      <ol>
        {tasks.map((t) => (
          <li key={t.id} className={done.includes(t.id) ? "is-done" : ""}>
            <i style={{ borderColor: STAMP_COLOURS[t.world], background: done.includes(t.id) ? STAMP_COLOURS[t.world] : undefined }} aria-hidden="true" />
            <span>
              <small>{t.world === "home" ? "Home" : t.world === "stanford" ? "Stanford" : "Korea"}</small>
              {t.label}
            </span>
            <b>{done.includes(t.id) ? "Done" : ""}</b>
          </li>
        ))}
      </ol>
      <p className="passport-note">
        {daily?.streak ? `Streak ${daily.streak} ${daily.streak === 1 ? "day" : "days"} · ` : ""}New set in {countdown} (00:00 UTC)
      </p>
    </section>
  );
}

/** The Passport: stamps by world, medals on game stamps, and the Daily page. */
export function PassportPanel() {
  const { open, page } = usePassport();
  const save = useGame((s) => s.save);
  const world = useGame((s) => s.world);
  const ref = useRef<HTMLDivElement>(null);
  const [firstOpen, setFirstOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const old = document.activeElement as HTMLElement | null;
    const g = useGame.getState();
    setFirstOpen(!g.save.memories.includes(OPENED));
    g.remember(OPENED);
    ref.current?.focus();
    cue("ui-open");
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closePassport();
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      cue("ui-close");
      old?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const earned = stampsEarned(save);
  const stamps = page === "daily" ? [] : STAMPS.filter((s) => s.world === page);
  const here = (world in STAMP_COLOURS ? world : "home") as StampWorld;
  const tryFirst = firstOpen ? STAMPS.filter((s) => s.world === here && !earned.has(s.id)).slice(0, 3) : [];
  return (
    <div className="modal-scrim passport-scrim" onPointerDown={(e) => e.target === e.currentTarget && closePassport()}>
      <div className="game-modal passport" role="dialog" aria-modal="true" aria-label="Passport" tabIndex={-1} ref={ref} onKeyDown={(e) => e.key === " " && e.stopPropagation()}>
        <button className="close-button" aria-label="Close passport" onClick={closePassport}>
          <Icon name="close" />
        </button>
        <h2>
          Passport <small>{earned.size} / {STAMPS.length} stamps</small>
        </h2>
        <nav className="passport-tabs" role="tablist" aria-label="Passport pages">
          {PAGES.map((p) => (
            <button key={p.id} role="tab" aria-selected={page === p.id} onClick={() => usePassport.setState({ page: p.id })}>
              {p.label}
            </button>
          ))}
        </nav>
        {tryFirst.length > 0 && page !== "daily" && (
          <section className="passport-first" aria-label="Try these first">
            <h3>Try these first</h3>
            <ul className="stamp-grid">
              {tryFirst.map((s) => (
                <StampCard key={s.id} stamp={s} earned={false} />
              ))}
            </ul>
          </section>
        )}
        {page === "daily" ? (
          <DailyPage />
        ) : (
          <ul className="stamp-grid" aria-label={`${PAGES.find((p) => p.id === page)?.label} stamps`}>
            {stamps.map((s) => (
              <StampCard key={s.id} stamp={s} earned={earned.has(s.id)} />
            ))}
          </ul>
        )}
        {page === "village" && <p className="passport-note">Kept on this device.</p>}
      </div>
    </div>
  );
}

/** `P` opens and closes the Passport outside game modes. */
export function usePassportKey() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "p" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (useGameMode.getState().active) return;
      const g = useGame.getState();
      if (usePassport.getState().open) closePassport();
      else if (!g.paused && g.panel === "none" && !g.overlayLocked) openPassport();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);
}
