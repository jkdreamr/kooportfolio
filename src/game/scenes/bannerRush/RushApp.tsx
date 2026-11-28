/**
 * Lazy chunk root (§8.1): profile, screen router (tutorial, lobby, versus,
 * match, result), the stage and the DOM overlay.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARDS, STARTER_DECKS, validDeck, type CardId } from "../../core/bannerRush/cards";
import { PH_OVER } from "../../core/bannerRush/constants";
import { CARD_IDS } from "../../core/bannerRush/cards";
import {
  applyRibbons,
  dailyConfig,
  dailyScore,
  dayNumber,
  freshProfile,
  groundFor,
  MODIFIER_TEXT,
  nextUnlock,
  OPPONENTS,
  ownedCards,
  parseProfile,
  pickOpponent,
  PROFILE_KEY,
  ribbonDelta,
  stampsFor,
  TIER_NAMES,
  tierFor,
  unlockedBy,
  type Opponent,
  type Profile,
} from "../../core/bannerRush/meta";
import { awardStamp } from "../../core/bannerRush/stamps";
import type { AiTier, MatchConfig, Modifier } from "../../core/bannerRush/types";
import { rivalColour } from "../../core/bannerRush/viewModel";
import { engine } from "./engineApi";
import { A11y } from "./a11y";
import { GROUND_NAMES, type Ground } from "./ArenaSet";
import { CardArt, EMOTES } from "./cardArt";
import { Director, type MatchEnd } from "./director";
import { Hud } from "./Hud";
import type { RushKit } from "./kit";
import { RushRuntime } from "./runtime";
import { Stage, camMove } from "./Stage";
import { callout, useRushHud, type ResultInfo } from "./store";
import { commanderLook, rivalCommanderLook } from "./troopLooks";
import { RushView, type Tier } from "./view";
import { screenOut, tileToScreen } from "./camera";
import "./banner-rush.css";

type Match = {
  key: number;
  rt: RushRuntime;
  view: RushView;
  director: Director;
  a11y: A11y;
  opponent: Opponent;
  ground: Ground;
  tier: AiTier;
  tutorial: boolean;
  daily: number | null;
};

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadProfile(): Profile {
  try {
    return parseProfile(localStorage.getItem(PROFILE_KEY));
  } catch {
    return freshProfile();
  }
}
function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* private mode: the session keeps it */
  }
}

const TUTORIAL_HAND: CardId[] = ["runners", "shieldbearer", "slinger", "smash", "haycart"];
const TUTORIAL_BEATS = [
  "Drag or tap <b>Runners</b>, then tap your side of the river.",
  "Ground troops cross at the <b>bridges</b>. Flying troops go straight over.",
  "They are coming. Your <b>Lookouts</b> shoot: place the <b>Shieldbearer</b> in their way.",
  "Spells land anywhere. <b>Smash</b> the group.",
  "Knock down a Lookout to win a <b>banner</b>. Send the <b>Hay Cart</b>: it only goes for buildings.",
  "Take the <b>Keep</b> and you win at once. It sleeps until hit or a Lookout falls.",
  "That is the whole game. Glow fills over time: spend it well.",
];

const useThree: import("./engineApi").EngineApi["useThree"] = ((sel: never) => engine().useThree(sel)) as import("./engineApi").EngineApi["useThree"];

export default function RushApp({ kit, onExit, hidden }: { kit: RushKit; onExit: () => void; hidden: boolean }) {
  const gl = useThree((s) => s.gl);
  const portal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const [profile, setProfile] = useState(loadProfile);
  const screen = useRushHud((s) => s.screen);
  const [match, setMatch] = useState<Match | null>(null);
  const [lobbyGround, setLobbyGround] = useState<Ground>(() => groundFor(profile.ribbons));
  const tutorialBeat = useRef(0);
  const avatar = kit.avatar();
  const team = useMemo<[string, string]>(() => [avatar.color, rivalColour(avatar.color)], [avatar.color]);
  const tier: Tier = useMemo(() => {
    try {
      const t = new URLSearchParams(location.search).get("tier");
      if (t === "high" || t === "medium" || t === "low") return t;
    } catch {
      /* default */
    }
    return (document.querySelector<HTMLElement>(".game-shell")?.dataset.tier as Tier) || "medium";
  }, []);

  const update = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((p) => {
      const n = fn(p);
      saveProfile(n);
      return n;
    });
  }, []);

  /** Build a match (runtime, view, director) for a config. */
  const start = useCallback(
    (opts: { opponent?: Opponent; tier?: AiTier; ground?: Ground; tutorial?: boolean; daily?: boolean; seed?: number; deck?: CardId[] }) => {
      const p = profile;
      const daily = opts.daily ? dailyConfig(dayNumber(new Date())) : null;
      const t = opts.tutorial ? "sprout" : daily ? "captain" : (opts.tier ?? tierFor(p.ribbons, p.lossStreak));
      const opponent = opts.tutorial
        ? { id: "neighbor", name: "Training post", tier: "sprout" as AiTier, deck: [...STARTER_DECKS.lawnRush.cards] }
        : (daily?.opponent ?? opts.opponent ?? pickOpponent(t, p.seedCounter * 7919, p.lastOpponent));
      const ground = opts.tutorial ? "home" : (daily?.ground ?? opts.ground ?? groundFor(p.ribbons));
      const deck = opts.deck ?? daily?.deck ?? (validDeck(p.decks[p.activeDeck], ownedCards(p.wins)) ? p.decks[p.activeDeck] : [...STARTER_DECKS.lawnRush.cards]);
      const modifiers: Modifier[] = opts.tutorial
        ? [
            { kind: "fixedHand", side: 0, cards: TUTORIAL_HAND },
            { kind: "glowStart", side: 0, glow: 10 },
            { kind: "glowRate", side: 0, mult: 2 },
            { kind: "towerHp", hp: [0, 0, 0, 700, 700, 900] },
            { kind: "unbreakable", side: 0 },
          ]
        : (daily?.modifiers ?? []);
      const seed = opts.seed ?? (daily ? daily.seed : (p.seedCounter * 2654435761) | 0);
      const config: MatchConfig = { seed, decks: [deck, opponent.deck], ai: [null, opts.tutorial ? null : t], modifiers };
      const rt = new RushRuntime(config);
      rt.relaxed = p.settings.relaxed;
      const npc = engine().villagers.find((v) => v.id === opponent.id) ?? engine().villagers[0];
      const view = new RushView(rt, {
        tier,
        team,
        commander: [commanderLook(avatar.color, avatar.hat), rivalCommanderLook(npc)],
        palace: ground === "palace",
        reducedMotion: reduced,
      });
      view.showNumbers = p.settings.numbers;
      view.highContrast = p.settings.highContrast;
      const a11y = new A11y();
      const director = new Director(rt, view, kit, a11y);
      director.tutorial = !!opts.tutorial;
      director.hints.cap = p.matches >= 3;
      director.hints.air = p.matches >= 3;
      if (!opts.tutorial) update((q) => ({ ...q, seedCounter: q.seedCounter + 1, lastOpponent: opponent.id }));
      setMatch((m) => ({ key: (m?.key ?? 0) + 1, rt, view, director, a11y, opponent, ground, tier: t, tutorial: !!opts.tutorial, daily: daily ? daily.day : null }));
      tutorialBeat.current = 0;
      useRushHud.setState({
        screen: opts.tutorial ? "tutorial" : "versus",
        selected: -1,
        result: null,
        paused: false,
        banners: [0, 0],
        prompt: opts.tutorial ? TUTORIAL_BEATS[0] : "",
        vs: { name: opponent.name, tier: TIER_NAMES[t], ground: GROUND_NAMES[ground] },
        dealt: 0,
        towers: Array.from(rt.state.hp.subarray(0, 6)),
        towerMax: Array.from(rt.state.maxHp.subarray(0, 6)),
      });
    },
    [profile, tier, team, avatar.color, avatar.hat, kit, update],
  );

  // Versus card → "Rush!" → deal → clock starts (§5.6).
  useEffect(() => {
    if (!match) return;
    const rt = match.rt;
    const s = useRushHud.getState().screen;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, reduced() ? Math.min(ms, 200) : ms));
    rt.held = true;
    if (!reduced()) {
      camMove.flatten = 3;
      camMove.push = -0.06;
      const t0 = performance.now();
      const ease = () => {
        const t = Math.min(1, (performance.now() - t0) / 900);
        const e = 1 - (1 - t) * (1 - t) * (1 - t);
        camMove.flatten = 3 * (1 - e);
        camMove.push = -0.06 * (1 - e);
        if (t < 1) requestAnimationFrame(ease);
      };
      requestAnimationFrame(ease);
    }
    kit.cue("ui-open");
    match.view.cmdMood[0] = match.view.cmdMood[1] = 3;
    match.view.cmdUntil[0] = match.view.cmdUntil[1] = rt.now + 1600;
    const begin = s === "tutorial" ? 300 : 1600;
    later(begin, () => {
      if (s !== "tutorial") useRushHud.setState((h) => ({ screen: "match", rush: h.rush + 1 }));
      kit.sound("whistle", { gain: 0.6 });
    });
    for (let k = 0; k < 4; k++)
      later(begin + 300 + k * 70, () => {
        useRushHud.setState({ dealt: k + 1 });
        kit.sound("card", { gain: 0.6 });
      });
    later(begin + 600, () => {
      rt.held = false;
      kit.setEscapeHandler(() => {
        togglePauseRef.current(!useRushHud.getState().paused);
        return true;
      });
      if (match.rt.config.ai[1] && profile.settings.emotes === "on") emote(1, 0);
    });
    match.director.onEnd = (end) => onEnd(match, end);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      kit.setEscapeHandler(null);
      match.a11y.dispose();
      camMove.push = camMove.flatten = 0;
    };
  }, [match]);

  // Hidden tab, pause menu or blur > 500 ms: the sim holds.
  useEffect(() => {
    const vis = () => {
      if (document.hidden && match && !match.rt.state.winner && useRushHud.getState().screen === "match") togglePause(true);
    };
    let blurTimer = 0;
    const blur = () => (blurTimer = window.setTimeout(() => vis(), 500));
    const focus = () => window.clearTimeout(blurTimer);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    };
  });
  useEffect(() => {
    if (match && (screen === "match" || screen === "tutorial")) match.rt.held = hidden || useRushHud.getState().paused;
  }, [hidden, match, screen]);

  const togglePauseRef = useRef<(on: boolean) => void>(() => {});
  const togglePause = (on: boolean) => {
    if (!match) return;
    const rt = match.rt;
    if (on) {
      rt.held = true;
      useRushHud.setState({ paused: true });
      kit.cue("ui-open");
      return;
    }
    useRushHud.setState({ paused: false, countdown: reduced() ? 0 : 3 });
    if (reduced()) {
      rt.held = false;
      return;
    }
    let n = 3;
    const id = window.setInterval(() => {
      n--;
      useRushHud.setState({ countdown: n });
      if (n <= 0) {
        window.clearInterval(id);
        rt.held = false;
      }
    }, 600);
  };

  togglePauseRef.current = togglePause;
  const emoteAt = useRef(0);
  const emote = (side: 0 | 1, i: number) => {
    if (side === 0) {
      if (performance.now() - emoteAt.current < 4000) return;
      emoteAt.current = performance.now();
    } else if (profile.settings.emotes !== "on") return;
    useRushHud.setState((s) => ({ emote: { side, text: EMOTES[i], key: (s.emote?.key ?? 0) + 1 } }));
    if (match) {
      match.view.cmdMood[side] = 3;
      match.view.cmdUntil[side] = match.rt.now + 1200;
    }
  };

  // Tutorial script: beats advance on the player's actions and on events.
  useEffect(() => {
    if (!match?.tutorial) return;
    const rt = match.rt;
    const s = rt.state;
    const enemySend = (card: CardId, x: number, y: number) => {
      s.cards[8] = CARD_IDS.indexOf(card);
      s.glow[1] = 1680;
      rt.enemyInput = { side: 1, slot: 0, x, y };
    };
    rt.sinks.push((_r, type, a) => {
      if (type === 10 && a >= 3) {
        if (tutorialBeat.current < 5) set(5);
      }
    });
    const set = (b: number) => {
      tutorialBeat.current = b;
      useRushHud.setState({ prompt: TUTORIAL_BEATS[b] });
      kit.sound("chime", { gain: 0.5 });
    };
    let beatAt = performance.now();
    const id = window.setInterval(() => {
      const plays = s.stats[2];
      const b = tutorialBeat.current;
      const since = performance.now() - beatAt;
      if (b === 0 && plays >= 1) {
        set(1);
        beatAt = performance.now();
      } else if (b === 1 && since > 6000) {
        set(2);
        beatAt = performance.now();
        enemySend("runners", 13.5, 4.5);
      } else if (b === 2 && (plays >= 2 || since > 15000)) {
        set(3);
        beatAt = performance.now();
        window.setTimeout(() => enemySend("kites", 7.5, 5.5), 600);
      } else if (b === 3 && (plays >= 3 || since > 9000)) {
        set(4);
        beatAt = performance.now();
      } else if (b === 4 && since > 40000) set(5);
      else if (b === 5 && (s.phase === PH_OVER || since > 30000)) {
        set(6);
        window.setTimeout(() => finishTutorial(), 2200);
        window.clearInterval(id);
      }
    }, 200);
    return () => {
      window.clearInterval(id);
    };
  }, [match]);

  const matchRef = useRef<Match | null>(null);
  matchRef.current = match;
  const finishTutorial = () => {
    if (!matchRef.current?.tutorial || useRushHud.getState().screen !== "tutorial") return;
    update((p) => ({ ...p, tutorialDone: true }));
    useRushHud.setState({ prompt: "", screen: "result", result: tutorialResult() });
    kit.setEscapeHandler(null);
  };

  const onEnd = (m: Match, end: MatchEnd) => {
    if (m.tutorial) {
      window.setTimeout(finishTutorial, 1200);
      return;
    }
    kit.setEscapeHandler(null);
    const won = end.winner === 0;
    const lost = end.winner === 1;
    const v = m.view;
    const now = m.rt.now;
    // Ceremony (§5.6).
    if (won) {
      v.cmdMood[0] = 1;
      v.cmdUntil[0] = now + 3400;
      v.cmdMood[1] = 2;
      v.cmdUntil[1] = now + 3400;
      const s = m.rt.state;
      for (let i = 6; i < 72; i++)
        if (s.alive[i] && s.side[i] === 1) {
          const slot = i;
          window.setTimeout(() => {
            if (!s.alive[slot]) return;
            v.ghost(s.kind[slot], 1, s.x[slot], s.y[slot], 0, m.rt.now);
            s.alive[slot] = 0;
          }, (28 - s.y[i]) * 60);
        }
      window.setTimeout(() => kit.sound("cheer", { intensity: 1 }), 200);
      window.setTimeout(() => kit.juice.confetti(36), 400);
      window.setTimeout(() => kit.juice.confetti(24), 1000);
      window.setTimeout(() => kit.sound("win"), 600);
      m.director.sfx.haptic("win");
    } else if (lost) {
      v.cmdMood[0] = 2;
      v.cmdUntil[0] = now + 2600;
      v.cmdMood[1] = 1;
      v.cmdUntil[1] = now + 2600;
      kit.sound("lose");
      m.director.sfx.haptic("loss");
    } else kit.sound("chime");
    if (profile.settings.emotes === "on") window.setTimeout(() => emote(1, 5), 800);
    // Profile, Ribbons, bests, stamps.
    const before = profile;
    const daily = m.daily !== null;
    const delta = daily ? 0 : ribbonDelta(won ? "win" : lost ? "loss" : "draw", end.banners[0] - end.banners[1], m.tier);
    const rib = applyRibbons(before.ribbons, before.bestRibbons, delta);
    const myHp = [0, 1, 2].reduce((a, t) => a + (m.rt.state.alive[t] ? m.rt.state.hp[t] : 0), 0);
    let dailyInfo: ResultInfo["daily"] = null;
    const after: Profile = {
      ...before,
      ribbons: rib.ribbons,
      bestRibbons: rib.best,
      wins: before.wins + (won ? 1 : 0),
      losses: before.losses + (lost ? 1 : 0),
      draws: before.draws + (!won && !lost ? 1 : 0),
      streak: won ? before.streak + 1 : 0,
      lossStreak: lost ? before.lossStreak + 1 : 0,
      matches: before.matches + 1,
    };
    if (daily) {
      const score = dailyScore(end.banners[0], end.banners[1], myHp, won, end.seconds);
      const entries = after.daily.filter((d) => d.day !== m.daily);
      const prev = before.daily.find((d) => d.day === m.daily);
      const entry = { day: m.daily!, bestScore: Math.max(prev?.bestScore ?? 0, score), attempts: (prev?.attempts ?? 0) + 1, won: (prev?.won ?? false) || won, relaxed: before.settings.relaxed };
      after.daily = [...entries, entry].slice(-30);
      dailyInfo = { score, best: entry.bestScore, attempts: entry.attempts };
      kit.recordBest("banner-rush.daily.best", score, "max");
      if (won) kit.countBest("banner-rush.daily.wins");
      kit.reportRun?.("banner-rush", { daily: true, won, score });
    }
    let newBest = false;
    if (won) {
      newBest = !!kit.countBest("banner-rush.wins")?.improved;
      kit.countBest(`banner-rush.wins.${m.tier}`);
      if (end.banners[0] >= 3) kit.countBest("banner-rush.three-banners");
      kit.recordBest("banner-rush.fastest-win", end.seconds, "min");
      kit.recordBest("banner-rush.streak", after.streak, "max");
    }
    kit.recordBest("banner-rush.ribbons", after.ribbons, "max");
    let stamp = false;
    for (const id of stampsFor(before, after, { won, banners: end.banners[0], daily })) stamp = (kit.stamp ? kit.stamp(id) : awardStamp(id)) || stamp;
    update(() => after);
    const unlocked = unlockedBy(before.wins, after.wins);
    const tip = lost
      ? end.lowestTheirs > 0 && end.lowestTheirs < 400
        ? `So close: one of their towers had ${end.lowestTheirs} HP left.`
        : TIPS[(before.matches + end.seconds) % TIPS.length]
      : "";
    window.setTimeout(
      () =>
        useRushHud.setState({
          screen: "result",
          result: {
            winner: end.winner,
            reason: end.reason,
            banners: end.banners,
            seconds: end.seconds,
            ribbonsBefore: before.ribbons,
            ribbonsAfter: after.ribbons,
            unlocked,
            tip,
            tutorial: false,
            daily: dailyInfo,
            stamp,
            newBest,
          },
        }),
      reduced() ? 600 : won ? 3400 : 2600,
    );
  };

  const readBoard = () => {
    if (!match) return "";
    const s = match.rt.state;
    const t = (i: number) => (s.alive[i] ? s.hp[i] : "down");
    const hand = [0, 1, 2, 3].map((k) => (s.cards[k] >= 0 ? CARDS[CARD_IDS[s.cards[k]]].name : "")).join(", ");
    return `Banners: you ${s.banners[0]}, them ${s.banners[1]}. ${Math.ceil(useRushHud.getState().seconds)} seconds. Your towers: left ${t(0)}, right ${t(1)}, Keep ${t(2)}. Theirs: left ${t(4)}, right ${t(3)}, Keep ${t(5)}. Glow ${Math.floor(s.glow[0] / 168)}. Hand: ${hand}.`;
  };

  // QA handles (§8.5, R2-18).
  useEffect(() => {
    const api = {
      state: () => {
        const s = match?.rt.state;
        if (!s) return { screen: useRushHud.getState().screen };
        const units = [];
        for (let i = 6; i < 72; i++) if (s.alive[i]) units.push({ kind: s.kind[i], side: s.side[i], x: s.x[i], y: s.y[i], hp: s.hp[i] });
        return { screen: useRushHud.getState().screen, tick: s.tick, phase: s.phase, banners: [s.banners[0], s.banners[1]], glow: [s.glow[0] / 168, s.glow[1] / 168], towers: Array.from(s.hp.subarray(0, 6)).map((h, i) => (s.alive[i] ? h : 0)), units, hand: [0, 1, 2, 3].map((k) => CARD_IDS[s.cards[k]]), winner: s.winner };
      },
      open: (scr: "lobby" | "match" | "tutorial", o: { seed?: number; tier?: AiTier; deck?: CardId[]; ground?: Ground } = {}) => {
        if (scr === "lobby") useRushHud.setState({ screen: "lobby" });
        else start({ tutorial: scr === "tutorial", seed: o.seed, tier: o.tier, deck: o.deck, ground: o.ground });
      },
      deploy: (slot: number, x: number, y: number) => match?.rt.deploy(slot, x, y),
      spawn: (kind: number, side: 0 | 1, x: number, y: number) => {
        const s = match?.rt.state;
        if (!s) return;
        for (let i = 6; i < 72; i++)
          if (!s.alive[i]) {
            spawnRaw(s, i, kind, side, x, y);
            return;
          }
      },
      setGlow: (side: 0 | 1, g: number) => match && (match.rt.state.glow[side] = Math.round(g * 168)),
      speed: (m: number) => {
        if (!match) return;
        match.rt.speed = m;
        match.rt.maxTicksPerFrame = Math.max(4, Math.ceil(m * 3));
      },
      autoplay: (bot: "mirror" | "pusher" | null) => match && (match.rt.autoBot = bot),
      tileToScreen: (x: number, y: number) => {
        tileToScreen(x, y);
        return [screenOut.x, screenOut.y];
      },
      perf: () => match?.rt.perf(),
      resetPerf: () => match?.rt.resetPerf(),
      hold: (on: boolean) => match && (match.rt.held = on),
    };
    kit.expose({ bannerRush: api });
    kit.registerGameQa?.("banner-rush", { state: api.state, act: (name, ...args) => (api as Record<string, (...a: unknown[]) => unknown>)[name]?.(...args) });
  });

  useEffect(() => {
    if (!profile.tutorialDone && screen === "lobby" && !match) start({ tutorial: true });
  }, []);

  const inMatch = !!match && (screen === "match" || screen === "versus" || screen === "tutorial" || screen === "result");
  const ground = match && inMatch ? match.ground : lobbyGround;
  // An idle stage behind the lobby.
  const idle = useMemo(() => {
    const rt = new RushRuntime({ seed: 1, decks: [STARTER_DECKS.lawnRush.cards, STARTER_DECKS.lawnRush.cards], ai: [null, null] });
    const view = new RushView(rt, { tier, team, commander: [commanderLook(avatar.color, avatar.hat), rivalCommanderLook(engine().villagers[0])], palace: false, reducedMotion: reduced });
    return { rt, view };
  }, [tier, team]);
  const live = inMatch && match ? match : idle;
  const directorFrame = useCallback(
    (dt: number) => {
      live.rt.advance(dt * (kit.qaScale?.() ?? 1));
      if (inMatch && match) match.director.frame();
    },
    [live, inMatch, match, kit],
  );

  const s = profile.settings;
  const Html = engine().Html;
  return (
    <>
      <Stage key={inMatch && match ? `m${match.key}` : `idle-${ground}`} rt={live.rt} view={live.view} ground={ground} onFrame={directorFrame} safeExtra={() => ({ top: 0, bottom: 0 })} />
      <Html fullscreen portal={portal} position={[0, 1002, 0]} zIndexRange={[80, 0]} style={{ pointerEvents: "none" }} onOcclude={() => undefined} calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]}>
        <div className={`br-root ${hidden ? "hidden" : ""} text-${s.textSize} ${s.highContrast ? "hc" : ""}`} style={{ "--team": team[0], "--rival": team[1] } as React.CSSProperties}>
          {(screen === "match" || screen === "tutorial") && match && (
            <Hud
              key={match.key}
              rt={match.rt}
              view={match.view}
              director={match.director}
              opponent={{ name: match.opponent.name, tier: TIER_NAMES[match.tier] }}
              team={team}
              keepSelected={s.keepSelected}
              onPause={() => togglePause(true)}
              onEmote={(i) => emote(0, i)}
              tutorial={match.tutorial}
              onSkip={finishTutorial}
              readBoard={readBoard}
            />
          )}
          {screen === "versus" && match && <Versus match={match} avatarColor={team[0]} />}
          {screen === "lobby" && <Lobby profile={profile} ground={lobbyGround} setGround={setLobbyGround} update={update} onBattle={(o) => start(o)} onTutorial={() => start({ tutorial: true })} onExit={onExit} />}
          {screen === "result" && <Result kit={kit} onReplay={() => start(match?.tutorial ? {} : { opponent: match?.opponent, tier: match?.tier, ground: match?.ground, daily: match?.daily !== null })} onNew={() => start({})} onLobby={() => useRushHud.setState({ screen: "lobby" })} onExit={onExit} />}
          <PauseDialog match={match} profile={profile} update={update} onResume={() => togglePause(false)} onLeave={() => leave()} onRestart={() => restart()} />
          <Countdown />
        </div>
      </Html>
    </>
  );

  function leave() {
    useRushHud.setState({ paused: false });
    if (match && !match.tutorial && match.rt.state.winner === -2) {
      const started = [0, 1, 2, 3, 4, 5].some((t) => match.rt.state.hp[t] < match.rt.state.maxHp[t]);
      if (started) update((p) => ({ ...p, ...applyRibbonsLoss(p, match.tier), losses: p.losses + 1, lossStreak: p.lossStreak + 1, streak: 0, matches: p.matches + 1 }));
    }
    kit.setEscapeHandler(null);
    setMatch(null);
    useRushHud.setState({ screen: "lobby", prompt: "" });
  }
  function restart() {
    useRushHud.setState({ paused: false });
    if (match) start({ opponent: match.opponent, tier: match.tier, ground: match.ground, tutorial: match.tutorial });
  }
}

const applyRibbonsLoss = (p: Profile, tier: AiTier) => {
  const r = applyRibbons(p.ribbons, p.bestRibbons, ribbonDelta("loss", 0, tier));
  return { ribbons: r.ribbons, bestRibbons: r.best };
};
const tutorialResult = (): ResultInfo => ({ winner: 0, reason: "tutorial", banners: [0, 0], seconds: 0, ribbonsBefore: 0, ribbonsAfter: 0, unlocked: null, tip: "", tutorial: true, daily: null, stamp: false, newBest: false });

const TIPS = [
  "Kites flew over your ground troops? Slingers, Hoop Shooters and Beekeepers can reach them.",
  "A Telescope in the middle pulls Hay Carts across both Lookouts.",
  "Send a cheap troop to stop a charging Rower Duo.",
  "Go Stone resets a Telescope's beam and a Rower's charge.",
  "Save Glow before the final minute: Double Glow doubles your plays.",
  "Smash a group of Runners or Kites: it hits each one once.",
];

import { initEntity } from "../../core/bannerRush/state";
import type { MatchState } from "../../core/bannerRush/types";
function spawnRaw(s: MatchState, i: number, kind: number, side: 0 | 1, x: number, y: number) {
  initEntity(s, i, kind, side, x, y, 0);
}
function Versus({ match, avatarColor }: { match: Match; avatarColor: string }) {
  const vs = useRushHud((s) => s.vs);
  if (!vs) return null;
  return (
    <div className="br-versus" role="status">
      <div className="br-vs-side mine">
        <span className="br-vs-chip" style={{ background: avatarColor }} />
        <b>You</b>
      </div>
      <div className="br-vs-mid">
        <span className="br-vs-word">vs</span>
        <small>{vs.ground}</small>
      </div>
      <div className="br-vs-side theirs">
        <span className="br-vs-chip theirs">{vs.name.slice(0, 1)}</span>
        <b>{vs.name}</b>
        <small>{vs.tier} tier</small>
      </div>
      <Rush />
      {match.tutorial && null}
    </div>
  );
}
function Rush() {
  return <div className="br-rush">Rush!</div>;
}

function Countdown() {
  const n = useRushHud((s) => s.countdown);
  if (!n) return null;
  return (
    <div className="br-countdown" key={n} aria-live="assertive">
      {n}
    </div>
  );
}

function Lobby({
  profile,
  ground,
  setGround,
  update,
  onBattle,
  onTutorial,
  onExit,
}: {
  profile: Profile;
  ground: Ground;
  setGround: (g: Ground) => void;
  update: (fn: (p: Profile) => Profile) => void;
  onBattle: (o: { daily?: boolean; ground?: Ground }) => void;
  onTutorial: () => void;
  onExit: () => void;
}) {
  const [tab, setTab] = useState<"battle" | "deck" | "trail" | "daily" | "stats">("battle");
  const battle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => battle.current?.focus());
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onExit();
    };
    window.addEventListener("keydown", esc, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", esc, true);
    };
  }, [onExit]);
  const owned = ownedCards(profile.wins);
  const tierName = TIER_NAMES[tierFor(profile.ribbons, profile.lossStreak)];
  const next = nextUnlock(profile.wins);
  const deck = profile.decks[profile.activeDeck];
  const today = dailyConfig(dayNumber(new Date()));
  const todayEntry = profile.daily.find((d) => d.day === today.day);
  const earned: Ground[] = ["home", ...(profile.bestRibbons >= 300 ? ["palace" as const] : []), ...(profile.bestRibbons >= 700 ? ["quad" as const] : [])];
  return (
    <div className="br-lobby" role="dialog" aria-label="Banner Rush">
      <header className="br-lobby-head">
        <h1>Banner Rush</h1>
        <span className="br-ribbons" aria-label={`${profile.ribbons} Ribbons`}>
          <span className="br-ribbon-icon" aria-hidden="true" /> {profile.ribbons}
        </span>
      </header>
      <nav className="br-tabs" role="tablist">
        {(["battle", "deck", "trail", "daily", "stats"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "battle" ? "Battle" : t === "deck" ? "Deck" : t === "trail" ? "Trail" : t === "daily" ? "Daily" : "Stats"}
          </button>
        ))}
      </nav>
      <div className="br-lobby-body">
        {tab === "battle" && (
          <>
            <p className="br-lead">
              Next opponent: a <b>{tierName}</b> on <b>{GROUND_NAMES[ground]}</b>.
            </p>
            <div className="br-deck-row" aria-label="Your deck">
              {deck.map((c) => (
                <span key={c} className="br-mini" title={CARDS[c].name}>
                  <CardArt id={c} />
                  <i>{CARDS[c].cost}</i>
                </span>
              ))}
            </div>
            {earned.length > 1 && (
              <div className="br-grounds" role="radiogroup" aria-label="Ground">
                {earned.map((g) => (
                  <button key={g} role="radio" aria-checked={g === ground} onClick={() => setGround(g)}>
                    {GROUND_NAMES[g]}
                  </button>
                ))}
              </div>
            )}
            <button ref={battle} className="br-primary" onClick={() => onBattle({ ground })}>
              Battle
            </button>
            <div className="br-row">
              <button onClick={onTutorial}>How to play</button>
              <button onClick={onExit}>Back to the hall</button>
            </div>
          </>
        )}
        {tab === "deck" && <DeckTab profile={profile} owned={owned} update={update} />}
        {tab === "trail" && (
          <div className="br-trail">
            {(["home", "palace", "quad"] as Ground[]).map((g, i) => (
              <div key={g} className={`br-trail-stop ${profile.bestRibbons >= [0, 300, 700][i] ? "on" : ""}`}>
                <b>{GROUND_NAMES[g]}</b>
                <small>{[0, 300, 700][i]}+ Ribbons</small>
              </div>
            ))}
            <p>{next ? `${next.wins - profile.wins} more win${next.wins - profile.wins === 1 ? "" : "s"}: ${CARDS[next.card].name}` : "Every card unlocked."}</p>
            <p>You will face: {tierName} tier.</p>
          </div>
        )}
        {tab === "daily" && (
          <div className="br-daily">
            <p className="br-lead">Today's challenge</p>
            <p>
              Against the <b>{today.opponent.name}</b> (Captain) on {GROUND_NAMES[today.ground]}. {MODIFIER_TEXT[today.modifier]}.
            </p>
            <div className="br-deck-row">
              {today.deck.map((c) => (
                <span key={c} className="br-mini" title={CARDS[c].name}>
                  <CardArt id={c} />
                  <i>{CARDS[c].cost}</i>
                </span>
              ))}
            </div>
            <p>{todayEntry ? `Today's best: ${todayEntry.bestScore.toLocaleString()} (${todayEntry.attempts} attempt${todayEntry.attempts === 1 ? "" : "s"})` : "Not played yet today."}</p>
            <button className="br-primary" onClick={() => onBattle({ daily: true })}>
              Play today's challenge
            </button>
            <h3>On this device</h3>
            <ul className="br-history">
              {[...profile.daily].reverse().slice(0, 7).map((d) => (
                <li key={d.day}>
                  Day {d.day}: {d.bestScore.toLocaleString()}
                  {d.won ? " · won" : ""}
                  {d.relaxed ? " · relaxed" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === "stats" && (
          <dl className="br-stats">
            <dt>Wins</dt>
            <dd>{profile.wins}</dd>
            <dt>Losses</dt>
            <dd>{profile.losses}</dd>
            <dt>Draws</dt>
            <dd>{profile.draws}</dd>
            <dt>Best Ribbons</dt>
            <dd>{profile.bestRibbons}</dd>
            <dt>Win streak</dt>
            <dd>{profile.streak}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function DeckTab({ profile, owned, update }: { profile: Profile; owned: CardId[]; update: (fn: (p: Profile) => Profile) => void }) {
  const deck = profile.decks[profile.activeDeck];
  const [pick, setPick] = useState<CardId | null>(null);
  const setDeck = (d: CardId[]) =>
    update((p) => {
      const decks = p.decks.map((x, i) => (i === p.activeDeck ? d : x));
      return { ...p, decks };
    });
  const avg = deck.reduce((a, c) => a + CARDS[c].cost, 0) / 8;
  const ready = Object.values(STARTER_DECKS).filter((d) => d.cards.every((c) => owned.includes(c)));
  return (
    <div className="br-deckb">
      <div className="br-row">
        {[0, 1, 2].map((i) => (
          <button key={i} aria-pressed={profile.activeDeck === i} onClick={() => update((p) => ({ ...p, activeDeck: i }))}>
            {profile.deckNames[i]}
          </button>
        ))}
      </div>
      <p className="br-lead">
        Average cost {avg.toFixed(1)}. {pick ? `Tap a deck card to swap in ${CARDS[pick].name}.` : "Tap a card below, then a deck card to swap."}
      </p>
      <div className="br-deck-grid">
        {deck.map((c) => (
          <button
            key={c}
            className="br-mini big"
            aria-label={`${CARDS[c].name}, cost ${CARDS[c].cost}${pick ? `: swap for ${CARDS[pick].name}` : ""}`}
            onClick={() => {
              if (!pick) return;
              setDeck(deck.map((x) => (x === c ? pick : x)));
              setPick(null);
            }}
          >
            <CardArt id={c} />
            <i>{CARDS[c].cost}</i>
            <span>{CARDS[c].name}</span>
          </button>
        ))}
      </div>
      <div className="br-deck-grid coll">
        {CARD_IDS.map((c) => {
          const has = owned.includes(c);
          const inDeck = deck.includes(c);
          return (
            <button key={c} className={`br-mini ${pick === c ? "picked" : ""}`} disabled={!has || inDeck} aria-label={`${CARDS[c].name}, cost ${CARDS[c].cost}${!has ? ", locked" : inDeck ? ", in deck" : ""}`} onClick={() => setPick(c)} title={CARDS[c].special}>
              <CardArt id={c} />
              <i>{CARDS[c].cost}</i>
              <span>{has ? CARDS[c].name : "Locked"}</span>
            </button>
          );
        })}
      </div>
      <div className="br-row">
        {ready.map((d) => (
          <button key={d.name} onClick={() => setDeck([...d.cards])}>
            Use {d.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Result({ kit, onReplay, onNew, onLobby, onExit }: { kit: RushKit; onReplay: () => void; onNew: () => void; onLobby: () => void; onExit: () => void }) {
  const r = useRushHud((s) => s.result);
  if (!r) return null;
  const ResultCard = kit.ResultCard;
  const word = r.tutorial ? "Tutorial complete" : r.winner === 0 ? "Victory" : r.winner === 1 ? "Defeat" : "Draw";
  const delta = r.ribbonsAfter - r.ribbonsBefore;
  return (
    <div className={`br-result ${r.winner === 0 ? "win" : r.winner === 1 ? "loss" : "draw"}`} role="dialog" aria-label={word}>
      <h2 className="br-result-word">{word}</h2>
      {!r.tutorial && (
        <div className="br-result-banners" aria-label={`${r.banners[0]} banners to ${r.banners[1]}`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`br-pennant mine big ${i < r.banners[0] ? "won" : ""}`} style={{ animationDelay: `${600 + i * 250}ms` }} />
          ))}
        </div>
      )}
      <ResultCard
        score={r.tutorial ? undefined : r.banners[0]}
        unit="banners"
        detail={r.tutorial ? "You know the whole game. Battle when you are ready." : r.daily ? `Today's score ${r.daily.score.toLocaleString()} · best ${r.daily.best.toLocaleString()} (${r.daily.attempts} attempt${r.daily.attempts === 1 ? "" : "s"})` : `Ribbons ${r.ribbonsAfter} (${delta >= 0 ? "+" : ""}${delta})${r.tip ? ` · ${r.tip}` : ""}`}
        best={r.newBest}
        onReplay={r.tutorial ? onLobby : onReplay}
        onBack={onExit}
        backLabel="Back to the hall"
      />
      {r.unlocked && (
        <div className="br-unlock">
          <CardArt id={r.unlocked} />
          <span>
            New card: <b>{CARDS[r.unlocked].name}</b>
          </span>
        </div>
      )}
      {r.stamp && <div className="br-stamp">Stamp earned</div>}
      {!r.tutorial && (
        <div className="br-row">
          <button onClick={onNew}>New opponent</button>
          <button onClick={onLobby}>Edit deck</button>
        </div>
      )}
    </div>
  );
}

function PauseDialog({ match, profile, update, onResume, onLeave, onRestart }: { match: Match | null; profile: Profile; update: (fn: (p: Profile) => Profile) => void; onResume: () => void; onLeave: () => void; onRestart: () => void }) {
  const paused = useRushHud((s) => s.paused);
  const resume = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<"" | "leave" | "restart">("");
  useEffect(() => {
    if (!paused) return;
    setConfirm("");
    const id = requestAnimationFrame(() => resume.current?.focus());
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onResume();
    };
    window.addEventListener("keydown", esc, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", esc, true);
    };
  }, [paused, onResume]);
  if (!paused || !match) return null;
  const s = profile.settings;
  const toggle = (k: "keepSelected" | "relaxed" | "numbers" | "highContrast") => {
    update((p) => ({ ...p, settings: { ...p.settings, [k]: !p.settings[k] } }));
    if (k === "relaxed") match.rt.relaxed = !s.relaxed;
    if (k === "numbers") match.view.showNumbers = !s.numbers;
    if (k === "highContrast") match.view.highContrast = !s.highContrast;
  };
  return (
    <div className="br-pause-dialog" role="dialog" aria-modal="true" aria-label="Paused">
      <h2>Paused</h2>
      {confirm ? (
        <>
          <p>{confirm === "leave" ? "Leave the match? It counts as a loss once a tower is hit." : "Restart the match? It counts as a loss once a tower is hit."}</p>
          <button className="br-primary" onClick={confirm === "leave" ? onLeave : onRestart}>
            {confirm === "leave" ? "Leave" : "Restart"}
          </button>
          <button onClick={() => setConfirm("")}>Cancel</button>
        </>
      ) : (
        <>
          <button ref={resume} className="br-primary" onClick={onResume}>
            Resume
          </button>
          <button onClick={() => setConfirm("restart")}>Restart match</button>
          <button onClick={() => setConfirm("leave")}>Leave match</button>
          <fieldset className="br-settings">
            <legend>Settings</legend>
            {(
              [
                ["numbers", "Show damage numbers"],
                ["keepSelected", "Keep card selected"],
                ["relaxed", "Relaxed speed"],
                ["highContrast", "High-contrast field"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={s[k]} onChange={() => toggle(k)} /> {label}
              </label>
            ))}
            <label>
              Emotes{" "}
              <select value={s.emotes} onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, emotes: e.target.value as Profile["settings"]["emotes"] } }))}>
                <option value="on">On</option>
                <option value="mute">Mute opponent</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label>
              Text size{" "}
              <select value={s.textSize} onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, textSize: +e.target.value as 100 | 115 | 130 } }))}>
                <option value={100}>100%</option>
                <option value={115}>115%</option>
                <option value={130}>130%</option>
              </select>
            </label>
          </fieldset>
        </>
      )}
    </div>
  );
}

export { OPPONENTS, callout };
