import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Html, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { screenOverlayNoOcclude } from "../world/screenOverlay";
import { useGame, type Scene } from "../core/store";
import { useLauncher, useLauncherHosted } from "../core/launchers";
import { claimEscape, endGameMode, startGameMode, useGameMode } from "../core/gameMode";
import { registerGameQa } from "../core/gameQa";
import { keys, touch } from "../core/input";
import { cue } from "../core/audio/cues";
import { sound } from "../core/sound";
import { isPaletteName } from "../core/audio/palette";
import { juice } from "./juice/Juice";
import { ResultCard } from "../ui/ResultCard";
import { PREWARM_ACTIVITIES } from "../engine/prewarm";
import type { RushKit } from "./bannerRush/kit";
import { exposeQa, qaEnabled } from "../../stage/qa";
import * as rig from "../world/character/rig";
import * as wardrobe from "../world/character/wardrobe";
import * as locomotion from "../world/character/locomotion";
import * as parts from "../world/character/parts";
import * as models from "../world/Models";
import * as staticBatch from "../world/StaticBatch";
import { villagers } from "../core/npcs";
import { dayNumber, reportRun } from "../core/daily";
import { GAME_STAGE_Y } from "./InteriorGameStage";
import type { EngineApi } from "./bannerRush/engineApi";
import "./banner-rush-launch.css";

// The engine modules the lazy game borrows (see bannerRush/engineApi.ts).
(globalThis as unknown as { __bannerRushEngine: EngineApi }).__bannerRushEngine = { rig, wardrobe, locomotion, parts, models, staticBatch, villagers, GAME_STAGE_Y, dayNumber, useThree, useFrame, Html, PerspectiveCamera };
if (GAME_STAGE_Y !== 1000) throw new Error("Banner Rush assumes GAME_STAGE_Y = 1000");

// The one new program (unlit instanced FX), warmed with the game-stage light
// set. engine/prewarm.ts takes this entry at merge; until then it is added here.
if (!PREWARM_ACTIVITIES.some((a) => a.id === "banner-rush"))
  PREWARM_ACTIVITIES.push({
    id: "banner-rush",
    scenes: "Banner Rush stage: unlit instanced FX",
    lights: ["key-shadow"],
    entries: [{ make: () => new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }), instanced: true, instanceColor: true }],
  });

let releaseEscape: (() => void) | null = null;
let releaseQa: (() => void) | null = null;
const kit: RushKit = {
  sound,
  cue,
  hasSound: (name) => isPaletteName(name),
  juice,
  ResultCard,
  bests: () => useGame.getState().save.bests ?? {},
  countBest: (key) => useGame.getState().countBest(key),
  recordBest: (key, value, rule) => useGame.getState().recordBest(key, value, rule),
  expose: exposeQa,
  setEscapeHandler: (fn) => {
    releaseEscape?.();
    releaseEscape = fn ? claimEscape("banner-rush", fn) : null;
  },
  stamp: (id) => useGame.getState().earnStamp(id),
  reportRun: (game, run) => reportRun(game as "banner-rush", { mode: "daily", ...run }),
  registerGameQa: (id, api) => {
    releaseQa?.();
    releaseQa = registerGameQa(id as "banner-rush", api);
  },
  avatar: () => {
    const s = useGame.getState().save;
    return { color: s.color, hat: s.hat };
  },
  muted: () => useGame.getState().muted,
};

// The game (rules, art and styles) loads on first play, in its own chunk.
const RushApp = lazy(() => import("./bannerRush/RushApp"));

/**
 * Banner Rush, launched from the Town Hall table: a real-time tower duel on a
 * 3D tabletop board. This mount owns only the launcher and the lazy game.
 * `room`: the scene whose table hosts it ("townhall"; QA builds also mount it
 * in "kappa" until the Town Hall lands).
 */
export function BannerRush({ room }: { room: Scene }) {
  const playing = useGameMode((s) => s.active?.id === "banner-rush");
  const hosted = useLauncherHosted(room);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const [round, setRound] = useState(0);
  const gl = useThree((s) => s.gl);
  const portal = { current: gl.domElement.parentElement! };
  const open = useCallback(() => {
    if (!startGameMode("banner-rush")) return;
    keys.clear();
    touch.x = touch.z = 0;
    setRound((r) => r + 1);
  }, []);
  const close = useCallback(() => {
    if (useGameMode.getState().active?.id === "banner-rush") cue("ui-close");
    kit.setEscapeHandler(null);
    endGameMode();
  }, []);
  useEffect(() => {
    window.addEventListener("interior-game-close", close);
    return () => window.removeEventListener("interior-game-close", close);
  }, [close]);
  useEffect(() => {
    if (qaEnabled()) exposeQa({ bannerRushLaunch: open });
  }, [open]);
  useLauncher(room, "banner-rush", "Play Banner Rush", open, { enabled: !playing, hint: "Enter" });
  if (playing)
    return (
      <Suspense fallback={null}>
        <RushApp key={round} kit={kit} onExit={close} hidden={hidden} />
      </Suspense>
    );
  if (hosted || hidden) return null;
  return (
    <Html onOcclude={screenOverlayNoOcclude} fullscreen portal={portal} zIndexRange={[80, 0]} calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]} style={{ pointerEvents: "none" }}>
      <div className="br-launch">
        <button className="primary-button" onClick={open}>
          Play Banner Rush
        </button>
      </div>
    </Html>
  );
}
