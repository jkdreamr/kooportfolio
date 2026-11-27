/**
 * The peephole conductor: input → spring → paper frame → tear → flight →
 * game. Three-free (it lives in the portfolio entry chunk); the WebGL sheet
 * is a `PaperSink` plugged in once the engine chunk has loaded.
 *
 * Phases: rest (DOM page; the "o" is a spring toy until the world is warm,
 * then its counter is a live window) → peek (the page is a WebGL sheet,
 * deforming) → tearing → flying → game. Everything below the commit is
 * reversible.
 */
import { create } from "zustand";
import { useWorldView, type WorldViewMode } from "../../game/core/worldView";
import { HERO_SPOTS } from "../../game/core/heroSpots";
import { cameraRig, flightObstacles, revealHud, useCameraRig, useStage, type CameraPose } from "../contract";
import { exposeQa, qaEnabled } from "../qa";
import { clearFlightPath, flightPoses, peekPose, TIMELINE, type PeekScene } from "./flight";
import { markEntered, readEnvironment, visitPolicy, type VisitEnvironment, type VisitPolicy } from "./policy";
import { letterField, rasterizePage, type PageRaster } from "./raster";
import {
  PeepholeSim,
  clamp,
  loadingProgress,
  rampTension,
  LOADING_MAX_T,
  handDistanceForTension,
  pullLength,
  smoothstep,
} from "./spring";
import {
  buildSeam,
  crackFronts,
  curlClearAxis,
  easeOutCubic,
  tearFronts,
  toSeamFrame,
  type Seam,
} from "./tear";

export type PaperFrameOut = {
  mode: "off" | "counter" | "sheet";
  letterX: number;
  letterY: number;
  angle: number;
  scale: number;
  pullX: number;
  pullY: number;
  tension: number;
  relax: number;
  holeOpen: number;
  gap: number;
  fronts: { back: number; front: number };
  creaseFronts: { back: number; front: number };
  crease: number;
  axisPlus: number;
  axisMinus: number;
  curlR: number;
};

export interface PaperSink {
  setRaster(raster: PageRaster): void;
  setSeam(seam: Seam | null): void;
  update(frame: PaperFrameOut): void;
}

export type Phase = "rest" | "peek" | "tearing" | "flying" | "game";

type UiState = {
  phase: Phase;
  /** World warm, sheet ready: the hole is live and the tear can happen. */
  armed: boolean;
  playLabel: "Play" | "Continue";
  announce: string;
  /** Skip affordance visible (tear/flight). */
  skippable: boolean;
};
export const usePeephole = create<UiState>(() => ({
  phase: "rest",
  armed: false,
  playLabel: "Play",
  announce: "",
  skippable: false,
}));

const FALLBACK_SCENE: PeekScene = { subject: [-6, 0, -18], approach: [70, 85, 95] };
const AUTO_DIR = 0.42;
/** The sheet shows less travel than the spring's hand: paper resists. */
const VISUAL = 0.62; // radians: the natural down-right tug
const AUTO_SECONDS = 1.2;
/** World zoom the flight settles into: close behind the player (the game's
 * own default, 1, is the whole-island overview). */
const ENTRY_ZOOM = 4.5;
const ENTER_ANNOUNCE = "You are in the village. Use the arrow keys or W A S D to walk, E to interact.";
const LOADING_ANNOUNCE = "Opening… the world is loading.";
/** Pointer this close to the heading (CSS px) counts as intent. */
const NEAR_HEADING = 160;
/** Seconds after load for the one-time "loose letter" tell. */
const TELL_DELAY_MS = 2500;

/** Ask the game's audio for a cue without importing it (core/audio/cues.ts
 * listens for this event). */
function dispatchCue(name: "tear" | "flight" | "land") {
  window.dispatchEvent(new CustomEvent("stage-cue", { detail: { name } }));
}

function setThemeColor(color: string) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

function now() {
  return performance.now() / 1000;
}

export class PeepholeController {
  env: VisitEnvironment | null = null;
  policy: VisitPolicy | null = null;
  sim = new PeepholeSim(200);
  private button: HTMLButtonElement | null = null;
  private root: HTMLElement | null = null;
  private sink: PaperSink | null = null;
  private raster: PageRaster | null = null;
  private rasterScroll = 0;
  private seam: Seam | null = null;
  private phase: Phase = "rest";
  private ready = false;
  private armedFlag = false;
  private counterOpen = 0;
  private sheetFrames = 0;
  private restSince = -1;
  private pointerId: number | null = null;
  private auto: { start: number; held: boolean; key: string | null } | null = null;
  private tearT = 0;
  private timeScale = 1;
  private flightStarted = false;
  private paperDone = false;
  private peek: CameraPose | null = null;
  private scene: PeekScene = FALLBACK_SCENE;
  private raf = 0;
  private lastTick = 0;
  private lastExternal = -1;
  private resizeTimer = 0;
  private interest = new Set<() => void>();
  private originPath = "/";
  private unsub: (() => void)[] = [];
  /** Engine requested at (s), and whether its module has arrived. */
  private loadStartedAt = -1;
  private engineIn = false;
  /** The "o" fills with sky as the world loads (0..1, monotonic). */
  private loadShown = 0;
  private fillReady = false;
  private tellTimer = 0;
  private heading: HTMLElement | null = null;
  private headingRect: DOMRect | null = null;

  /* ------------------------------------------------------------ lifecycle */

  init() {
    if (this.env) return;
    this.env = readEnvironment();
    this.policy = visitPolicy(this.env);
    usePeephole.setState({ playLabel: this.policy.playLabel });
    this.resetSim();
    this.unsub.push(
      useStage.subscribe((s, prev) => {
        if (s.ready && !prev.ready) this.onStageReady();
      }),
    );
    if (useStage.getState().ready) this.onStageReady();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onWindowKey, true);
    window.addEventListener("popstate", this.onPopState);
    this.loop();
  }

  attach(root: HTMLElement, button: HTMLButtonElement) {
    this.init();
    this.root = root;
    this.button = button;
    this.originPath = location.pathname;
    button.addEventListener("pointerdown", this.onPointerDown);
    button.addEventListener("pointermove", this.onPointerMove);
    button.addEventListener("pointerup", this.onPointerUp);
    button.addEventListener("pointercancel", this.onPointerUp);
    button.addEventListener("lostpointercapture", this.onPointerUp);
    button.addEventListener("keydown", this.onKeyDown);
    button.addEventListener("keyup", this.onKeyUp);
    button.addEventListener("click", this.onClick);
    button.addEventListener("pointerenter", this.onHover);
    button.addEventListener("focus", this.wantEngine);
    // Wider intent: the pointer near the heading, a touch on it.
    this.heading = button.closest("h1");
    this.heading?.addEventListener("touchstart", this.wantEngine, { passive: true });
    if (!this.armedFlag && this.loadStartedAt < 0) {
      document.addEventListener("pointermove", this.onNearHeading, { passive: true });
      window.addEventListener("scroll", this.forgetHeadingRect, { passive: true });
    }
    // Once per page view: the letter settles a little, so a first-time
    // visitor (on touch too) sees that it is loose.
    window.clearTimeout(this.tellTimer);
    this.tellTimer = window.setTimeout(() => {
      if (!this.policy?.physical || this.armedFlag || this.phase !== "rest" || this.sim.held || document.hidden) return;
      this.sim.impulse(Math.random() < 0.5 ? -18 : 18, -12);
    }, TELL_DELAY_MS);
    if (this.ready) this.prepareSheet();
  }

  detach() {
    const b = this.button;
    if (b) {
      b.removeEventListener("pointerdown", this.onPointerDown);
      b.removeEventListener("pointermove", this.onPointerMove);
      b.removeEventListener("pointerup", this.onPointerUp);
      b.removeEventListener("pointercancel", this.onPointerUp);
      b.removeEventListener("lostpointercapture", this.onPointerUp);
      b.removeEventListener("keydown", this.onKeyDown);
      b.removeEventListener("keyup", this.onKeyUp);
      b.removeEventListener("click", this.onClick);
      b.removeEventListener("pointerenter", this.onHover);
      b.removeEventListener("focus", this.wantEngine);
    }
    this.heading?.removeEventListener("touchstart", this.wantEngine);
    this.stopNearHeading();
    window.clearTimeout(this.tellTimer);
    this.heading = null;
    this.button = null;
    this.root = null;
  }

  /** Called when the visitor shows intent (Save-Data: load only then). */
  onInterest(fn: () => void) {
    this.interest.add(fn);
    return () => void this.interest.delete(fn);
  }
  private wantEngine = () => {
    if (this.loadStartedAt < 0) this.loadStartedAt = now();
    this.stopNearHeading();
    for (const fn of this.interest) fn();
    this.interest.clear();
  };
  /** Intent from outside the letter (the Play link's hover or focus). */
  intent() {
    this.wantEngine();
  }
  /** The engine module has arrived (Stage); warm-up progress follows. */
  engineLoaded() {
    this.engineIn = true;
  }
  private onNearHeading = (e: PointerEvent) => {
    if (!this.heading) return;
    this.headingRect ??= this.heading.getBoundingClientRect();
    const r = this.headingRect;
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    if (dx * dx + dy * dy <= NEAR_HEADING * NEAR_HEADING) this.wantEngine();
  };
  private forgetHeadingRect = () => {
    this.headingRect = null;
  };
  private stopNearHeading() {
    document.removeEventListener("pointermove", this.onNearHeading);
    window.removeEventListener("scroll", this.forgetHeadingRect);
  }

  private invalidate: (() => void) | null = null;
  private pumpAt = 0;
  /** Engine hook: one frame on demand (the resting counter is pumped). */
  setInvalidate(fn: () => void) {
    this.invalidate = fn;
  }
  /** While resting, the counter needs only a gentle frame rate, and none
   * at all when the "o" is off-screen or the tab is hidden. */
  private pump() {
    if (!this.invalidate || this.phase !== "rest" || !this.armedFlag) return;
    const t = now();
    const rect = this.glyphRect();
    const onScreen = !!rect && rect.y + rect.height > 0 && rect.y < innerHeight && !document.hidden;
    const rate = this.counterOpen < 1 || this.sheetFrames > 0 ? 60 : 30;
    if (onScreen && t - this.pumpAt >= 1 / rate - 0.002) {
      this.pumpAt = t;
      this.invalidate();
    }
  }

  attachSink(sink: PaperSink) {
    this.sink = sink;
    if (this.raster) sink.setRaster(this.raster);
    if (this.ready) this.prepareSheet();
  }

  private resetSim() {
    const L = pullLength(innerWidth, innerHeight, this.env?.returning) ;
    this.sim = new PeepholeSim(L, {
      commitT: this.armedFlag ? 1 : Infinity,
      flickT: this.armedFlag ? 0.85 : Infinity,
      maxT: this.armedFlag ? Infinity : LOADING_MAX_T,
    });
    this.sim.on((e) => {
      if (e === "commit") this.onCommit();
    });
  }

  /* ---------------------------------------------------------- warm & arm */

  private onStageReady() {
    this.ready = true;
    this.prepareSheet();
  }

  /** Rasterise the page and arm once the fonts and the sheet exist. */
  private prepareSheet() {
    if (!this.root || !this.button || !this.sink || this.armedFlag) return;
    const go = () => {
      if (!this.root || !this.button || !this.sink || this.armedFlag) return;
      // A pull may be under way (the visitor grabbed the letter while the
      // world loaded): measure at rest, then put the pulled letter back in
      // the same task, so no frame shows it jump.
      const held = this.sim.held;
      const pulled = this.button.style.transform;
      if (!this.rebuildRaster()) return;
      this.button.style.transform = held ? pulled : "";
      this.armedFlag = true;
      this.sim.tune.commitT = 1;
      this.sim.tune.flickT = 0.85;
      // The counter was already full of sky: open it at once under a held pull.
      this.counterOpen = held ? 1 : 0;
      this.loadShown = 1;
      delete this.button.dataset.loading;
      this.button.style.setProperty("--pp-load", "1");
      usePeephole.setState({ armed: true, ...(held ? { announce: "" } : {}) });
      this.root.classList.add("pp-live");
      this.applyCounterMask();
      this.aimPeek(0);
      if (this.phase === "rest") {
        // Hand the same drag to the sheet: the spring, hand and tension
        // carry straight on; only the ceiling lifts, gradually (tick).
        if (held) this.enterPeek();
        else this.restStage();
      }
    };
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(cb, { timeout: 600 })
        : setTimeout(cb, 60);
    void document.fonts.ready.then(() => idle(go));
  }

  private rebuildRaster() {
    if (!this.root || !this.button) return false;
    // Lay the letter out at rest before measuring.
    this.button.style.transform = "";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const raster = rasterizePage(this.root, this.button, dpr);
    if (!raster.letter) return false;
    this.raster = raster;
    this.rasterScroll = scrollY;
    this.sink?.setRaster(raster);
    if (this.seam && this.raster.letter) {
      this.seam = this.makeSeam(Math.atan2(this.seam.dir.y, this.seam.dir.x), this.seam.seed);
      this.sink?.setSeam(this.seam);
    }
    return true;
  }

  private applyCounterMask() {
    const L = this.raster?.letter;
    if (!L || !this.root) return;
    const r = this.root.getBoundingClientRect();
    const s = this.root.style;
    s.setProperty("--pp-mask", `url("${L.counterMask}")`);
    s.setProperty("--pp-mx", `${L.box.x - r.left}px`);
    s.setProperty("--pp-my", `${L.box.y - r.top}px`);
    s.setProperty("--pp-mw", `${L.box.width}px`);
    s.setProperty("--pp-mh", `${L.box.height}px`);
  }

  /** The look-down pose that frames the village in the hole. */
  private aimPeek(blend: number) {
    const L = this.raster?.letter;
    if (!L) return;
    const live = cameraRig.livePose();
    if (live) {
      const approach = [
        live.position[0] - live.target[0],
        live.position[1] - live.target[1],
        live.position[2] - live.target[2],
      ] as const;
      this.scene = { subject: live.target, approach };
    }
    const scroll = scrollY - this.rasterScroll;
    this.peek = peekPose(this.scene, { x: L.center.x, y: L.center.y - scroll }, { width: innerWidth, height: innerHeight });
    cameraRig.pose(this.peek, blend);
  }

  private glyphRect() {
    const L = this.raster?.letter;
    if (!L) return null;
    const scroll = scrollY - this.rasterScroll;
    return { x: L.box.x, y: L.box.y - scroll, width: L.box.width, height: L.box.height };
  }

  private restStage() {
    const st = useStage.getState();
    st.setMode("site");
    // With an engine hook the counter is pumped on demand (see pump());
    // without one the engine renders continuously while the world shows.
    st.setWorldVisible(!this.invalidate);
    st.setWorldScissor(this.glyphRect());
  }

  /* ------------------------------------------------------------- input */

  private onPointerDown = (e: PointerEvent) => {
    this.wantEngine();
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (this.phase !== "rest" && this.phase !== "peek") return;
    e.preventDefault();
    if (this.policy && !this.policy.physical) return; // reduced motion: click activates
    try {
      this.button?.setPointerCapture(e.pointerId);
    } catch {
      /* already captured elsewhere */
    }
    this.pointerId = e.pointerId;
    this.auto = null;
    this.sim.grab(e.clientX, e.clientY);
    if (!this.armedFlag) this.showLoadingFill();
    this.enterPeek();
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    // Coalesced events give the spring the real hand path on fast drags.
    const events = e.getCoalescedEvents?.() ?? [];
    const last = events.length ? events[events.length - 1] : e;
    this.sim.drag(last.clientX, last.clientY);
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    try {
      this.button?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    this.sim.release();
  };
  private onHover = () => {
    this.wantEngine();
    // Before the world is warm the letter is just a little loose.
    if (!this.armedFlag && this.phase === "rest" && this.policy?.physical) {
      this.sim.impulse((Math.random() - 0.5) * 60, -40);
    }
  };
  private onClick = (e: MouseEvent) => {
    // Pointer drags are handled by pointer events; keyboard by keydown. A
    // detail-0 click without a key is assistive tech "activate": open it.
    // Reduced motion: any activation dissolves straight into the world.
    if (this.policy && !this.policy.physical) {
      e.preventDefault();
      this.activate();
      return;
    }
    if (e.detail !== 0 || this.auto || now() - this.lastKey < 0.5) return;
    e.preventDefault();
    this.activate();
  };
  /** Keyboard activation also fires a detail-0 click; remember the key. */
  private lastKey = -1;
  private onKeyDown = (e: KeyboardEvent) => {
    this.lastKey = now();
    this.wantEngine();
    if (this.phase !== "rest" && this.phase !== "peek") return;
    const k = e.key;
    const L = this.sim.L;
    const kick = 1.15 * L * 4;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (arrows[k]) {
      e.preventDefault();
      if (this.policy && !this.policy.physical) return;
      this.sim.impulse(arrows[k][0] * kick * 0.25, arrows[k][1] * kick * 0.25);
      this.enterPeek();
      return;
    }
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      if (e.repeat) return;
      if (this.policy && !this.policy.physical) {
        this.activate();
        return;
      }
      this.startAutoPull(true, k);
      return;
    }
    if (k === "Escape") {
      e.preventDefault();
      this.auto = null;
      this.sim.reseal();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.lastKey = now();
    if (this.auto?.held && this.auto.key === e.key) {
      e.preventDefault();
      this.auto = null;
      this.sim.release();
    }
  };
  private onWindowKey = (e: KeyboardEvent) => {
    if (this.phase !== "tearing" && this.phase !== "flying") return;
    if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.skip();
  };

  /** First pull before the world is ready: the counter becomes a progress
   * gauge (exact counter shape, filled with sky from the bottom). */
  private showLoadingFill() {
    const b = this.button;
    if (!b) return;
    if (!this.fillReady) {
      const field = letterField(b);
      if (field) {
        const prev = b.style.transform;
        b.style.transform = "none";
        const r = b.getBoundingClientRect();
        b.style.transform = prev;
        b.style.setProperty("--pp-fill-mask", `url("${field.counterMask}")`);
        b.style.setProperty("--pp-fx", `${field.box.x - r.left}px`);
        b.style.setProperty("--pp-fy", `${field.box.y - r.top}px`);
        b.style.setProperty("--pp-fw", `${field.box.width}px`);
        b.style.setProperty("--pp-fh", `${field.box.height}px`);
        this.fillReady = true;
      }
    }
    b.dataset.loading = "true";
    usePeephole.setState({ announce: LOADING_ANNOUNCE });
  }

  private startAutoPull(held: boolean, key: string | null) {
    this.auto = { start: now(), held, key };
    this.sim.grab(0, 0);
    this.sim.setHand(0, 0);
    this.enterPeek();
  }

  /**
   * The Play / Continue link. Returns true when it handled the navigation
   * (an auto-tear), false to let the browser follow the link.
   */
  playLink(): boolean {
    this.wantEngine();
    if (!this.armedFlag || this.phase !== "rest") return false;
    if (this.policy && !this.policy.physical) {
      this.dissolveToGame();
      return true;
    }
    this.startAutoPull(false, null);
    return true;
  }

  /** Non-physical activation: AT click, reduced motion. */
  activate() {
    if (!this.armedFlag) {
      location.assign("/play");
      return;
    }
    if (this.policy && !this.policy.physical) this.dissolveToGame();
    else if (this.phase === "rest") this.startAutoPull(false, null);
  }

  /* -------------------------------------------------------------- phases */

  private savedZoom: number | null = null;
  private savedView: WorldViewMode | null = null;
  /** Move the (hidden) gameplay camera to its entry framing while the peek
   * pose owns the screen, so the live pose has settled behind the player by
   * the time the flight hands over to it. First-time visitors land in the
   * explore view (the hero frame behind the character); returning visitors
   * land in the view their save holds (the diorama at ENTRY_ZOOM). */
  private stageEntryZoom() {
    if (this.savedZoom !== null) return;
    const view = useWorldView.getState();
    this.savedZoom = view.zoom;
    this.savedView = view.view;
    const landing = view.savedView ?? "explore";
    // A first visit (no saved view) lands on the composed hero framing; the
    // spot's position and heading are the game's (heroSpots.ts, read only).
    if (view.savedView === null) useWorldView.setState({ exploreDistance: HERO_SPOTS.home.exploreDistance });
    if (landing === "explore") useWorldView.setState({ view: "explore" });
    else {
      useWorldView.setState({ view: "diorama" });
      if (this.savedZoom < ENTRY_ZOOM) useWorldView.setState({ zoom: ENTRY_ZOOM });
    }
  }
  private restoreZoom() {
    if (this.savedZoom === null) return;
    useWorldView.setState({
      zoom: this.savedZoom,
      view: this.savedView ?? useWorldView.getState().view,
    });
    this.savedZoom = null;
    this.savedView = null;
  }

  private enterPeek() {
    if (!this.armedFlag || this.phase !== "rest") return;
    this.stageEntryZoom();
    this.phase = "peek";
    this.sheetFrames = 0;
    this.restSince = -1;
    useStage.getState().setMode("peek");
    usePeephole.setState({ phase: "peek" });
  }

  private leavePeek() {
    this.phase = "rest";
    this.restoreZoom();
    this.root?.classList.remove("pp-paper");
    usePeephole.setState({ phase: "rest" });
    // Let the DOM fade back in over the sheet before the sheet stops drawing.
    window.setTimeout(() => {
      if (this.phase !== "rest") return;
      this.sheetFrames = 0;
      if (this.button) this.button.style.transform = "";
      if (this.sim.crease < 0.02) {
        this.seam = null;
        this.sink?.setSeam(null);
      }
      this.restStage();
    }, 180);
  }

  private onCommit() {
    if (!this.armedFlag) return;
    this.phase = "tearing";
    this.tearT = 0;
    this.timeScale = 1;
    this.flightStarted = false;
    this.paperDone = false;
    this.auto = null;
    navigator.vibrate?.(8);
    if (!this.seam) {
      this.seam = this.makeSeam(Math.atan2(this.sim.commitDirY, this.sim.commitDirX));
      this.sink?.setSeam(this.seam);
    }
    const st = useStage.getState();
    st.setMode("tearing");
    st.setWorldScissor(null);
    dispatchCue("tear");
    usePeephole.setState({ phase: "tearing", skippable: true, announce: "The page tears open." });
  }

  private startFlight() {
    this.flightStarted = true;
    useStage.getState().setMode("flying");
    this.phase = "flying";
    usePeephole.setState({ phase: "flying" });
    const peek = this.peek ?? cameraRig.renderedPose();
    const live = cameraRig.livePose();
    if (!peek || !live) {
      this.finishEntry();
      cameraRig.live(0.6);
      return;
    }
    const poses = flightPoses(peek, live, this.scene);
    const duration = this.policy?.flightSeconds ?? 4.6;
    // Resampled and lifted over tall props (pergolas, roofs): the camera
    // never flies through anything on its way down.
    const points = clearFlightPath(duration < 3 ? [poses[0], poses[1], poses[3], poses[4]] : poses, flightObstacles());
    dispatchCue("flight");
    cameraRig.path({
      // The last control point is replaced by the moving live pose.
      points,
      duration,
      // One curve for the whole flight: no velocity step at either end.
      ease: "smootherstep",
      blendToLive: 0.6,
      onBlendStart: () => this.finishEntry(),
      onDone: () => {
        cameraRig.setTimeScale(1);
        useStage.getState().setWorldScissor(null);
        usePeephole.setState({ skippable: false });
      },
    });
    if (this.timeScale > 1) cameraRig.setTimeScale(this.timeScale);
  }

  /** First playable frame: input, HUD, URL. */
  private finishEntry() {
    if (this.phase === "game") return;
    this.phase = "game";
    this.savedZoom = null;
    this.savedView = null;
    const st = useStage.getState();
    st.setMode("game");
    revealHud();
    dispatchCue("land");
    markEntered();
    if (location.pathname !== "/play") history.pushState({ stage: "play", from: this.originPath }, "", "/play");
    document.documentElement.classList.add("in-game");
    setThemeColor(document.documentElement.style.getPropertyValue("--sky").trim() || "#dce5c7");
    usePeephole.setState({ phase: "game", announce: ENTER_ANNOUNCE, skippable: false });
  }

  skip() {
    if (this.phase !== "tearing" && this.phase !== "flying") return;
    this.timeScale = 6;
    cameraRig.setTimeScale(6);
  }

  /** Reduced motion (or forward navigation): a 400 ms dissolve, never a cut. */
  dissolveToGame() {
    if (this.phase === "game") return;
    // No zoom change here: a camera glide after the dissolve is motion. The
    // landing view still applies (a first visit lands in explore); its
    // reduced-motion blend is 150 ms, inside the dissolve.
    if (this.savedZoom === null && useWorldView.getState().savedView === null)
      useWorldView.setState({ view: "explore" });
    this.phase = "flying";
    cameraRig.live(0);
    const st = useStage.getState();
    st.setMode("game");
    st.setWorldScissor(null);
    this.root?.classList.add("pp-dissolve");
    this.finishEntry();
    window.setTimeout(() => this.root?.classList.add("pp-gone"), 420);
  }

  /** Back to the portfolio (popstate). */
  returnToSite() {
    if (this.phase !== "game" && this.phase !== "flying") return;
    this.phase = "rest";
    this.seam = null;
    this.sink?.setSeam(null);
    this.paperDone = false;
    this.flightStarted = false;
    this.resetSim();
    this.sim.tune.commitT = this.armedFlag ? 1 : Infinity;
    this.sim.tune.flickT = this.armedFlag ? 0.85 : Infinity;
    document.documentElement.classList.remove("in-game");
    setThemeColor("#fbfbf9");
    const st = useStage.getState();
    st.setMode("site");
    st.setWorldVisible(true);
    st.setWorldScissor(null);
    this.counterOpen = 1;
    if (this.button) this.button.style.transform = "";
    this.aimPeek(0.8);
    const root = this.root;
    usePeephole.setState({ phase: "rest", skippable: false, announce: "" });
    if (!root) return;
    root.classList.remove("pp-gone", "pp-paper", "pp-dissolve", "pp-returning");
    // The HUD leaves first (120 ms, style.css: it is hidden whenever the
    // stage is not in the game), then the page fades in over the world
    // (160 ms): the dock never sits on the page, nothing shows through the "o".
    const reduce = !this.policy?.physical;
    const fade = root.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduce ? 150 : 160,
      delay: reduce ? 0 : 120,
      fill: "backwards",
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
    fade.onfinish = () => {
      if (this.phase === "rest") this.restStage();
    };
  }

  private onPopState = () => {
    const play = /^\/play(\/|$)/.test(location.pathname);
    if (!play && (this.phase === "game" || this.phase === "flying")) this.returnToSite();
    else if (play && this.phase === "rest" && this.armedFlag) this.dissolveToGame();
  };

  private onResize = () => {
    window.clearTimeout(this.resizeTimer);
    const apply = () => {
      const L = pullLength(innerWidth, innerHeight, this.env?.returning);
      this.sim.resize(L);
      if (this.armedFlag && this.phase !== "game") {
        this.rebuildRaster();
        this.applyCounterMask();
        if (this.phase === "rest" || this.phase === "peek") this.aimPeek(0);
        if (this.phase === "rest") useStage.getState().setWorldScissor(this.glyphRect());
      }
    };
    // Mid-drag the sheet must follow the new layout immediately.
    if (this.phase === "peek") apply();
    else this.resizeTimer = window.setTimeout(apply, 120);
  };

  /* ---------------------------------------------------------------- seam */

  private makeSeam(angle: number, seed = (Math.random() * 1e9) | 0) {
    const L = this.raster!.letter!;
    return buildSeam({
      origin: L.center,
      dir: { x: Math.cos(angle), y: Math.sin(angle) },
      width: this.raster!.width,
      height: this.raster!.height,
      rim: (L.radius.x + L.radius.y) / 2,
      seed,
      amplitude: clamp(Math.min(innerWidth, innerHeight) * 0.016, 7, 16),
    });
  }

  /* ---------------------------------------------------------------- tick */

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = now();
    const dt = this.lastTick ? t - this.lastTick : 0;
    this.lastTick = t;
    this.pump();
    // The engine's paper pass drives ticks while it renders (zero latency).
    // Outside rest it is the only clock: long frames must not double-tick.
    if (this.lastExternal > 0 && (this.phase !== "rest" || t - this.lastExternal < 0.1)) return;
    this.tick(dt);
  };

  /** Advance and publish one frame. Called by the paper pass each render. */
  externalTick(dt: number) {
    this.lastExternal = now();
    this.tick(dt);
  }

  private tick(dt: number) {
    const sim = this.sim;
    if (this.auto) {
      const u = clamp((now() - this.auto.start) / AUTO_SECONDS, 0, 1);
      const e = u * u * (3 - 2 * u);
      const d = handDistanceForTension(1.22, sim.L) * e;
      sim.setHand(Math.cos(AUTO_DIR) * d, Math.sin(AUTO_DIR) * d);
    }
    if (this.phase === "rest" || this.phase === "peek") sim.advance(dt);
    if (this.armedFlag && this.policy) {
      const fade = Math.max(0.05, this.policy.counterFade);
      this.counterOpen = Math.min(1, this.counterOpen + dt / fade);
    }
    // While the world loads the DOM letter itself is pulled, drawn exactly
    // as the sheet will draw it (same travel, angle and scale), and it keeps
    // following through a hand-off into the peek until the sheet covers it.
    if (this.button && ((!this.armedFlag && this.phase === "rest") || this.phase === "peek")) {
      this.button.style.transform = sim.atRest
        ? ""
        : `translate(${(sim.x * VISUAL).toFixed(2)}px, ${(sim.y * VISUAL).toFixed(2)}px) rotate(${sim.angle.toFixed(4)}rad) scale(${this.letterScale().toFixed(4)})`;
    }
    if (!this.armedFlag) this.loadTick();
    // After a hand-off the tension ceiling lifts over ~0.8 s, never at once.
    else if (Number.isFinite(sim.tune.maxT)) sim.setMaxTension(rampTension(sim.tune.maxT, dt));
    if (this.phase === "peek") this.peekTick();
    if (this.phase === "tearing" || this.phase === "flying") this.tearTick(dt);
    this.publish();
  }

  /** The loading gauge in the counter: engine download, then warm-up. */
  private loadTick() {
    if (this.loadStartedAt < 0 || !this.button) return;
    const p = loadingProgress(now() - this.loadStartedAt, this.engineIn, useStage.getState().warmProgress);
    if (p > this.loadShown + 0.002) {
      this.loadShown = p;
      this.button.style.setProperty("--pp-load", p.toFixed(3));
    }
  }

  private peekTick() {
    const sim = this.sim;
    this.sheetFrames++;
    // One frame of sheet drawn under the DOM, then the DOM steps aside.
    if (this.sheetFrames === 2) this.root?.classList.add("pp-paper");
    // Crack preview: build its seam the moment the page starts to give.
    if (sim.crack > 0.012 && this.raster?.letter) {
      const angle = Math.atan2(sim.y, sim.x);
      const stale =
        this.seam && sim.crack < 0.06 && Math.abs(angleDelta(angle, Math.atan2(this.seam.dir.y, this.seam.dir.x))) > 0.9;
      if (!this.seam || stale) {
        this.seam = this.makeSeam(angle);
        this.sink?.setSeam(this.seam);
      }
    }
    const rect = this.peekScissor();
    if (rect) useStage.getState().setWorldScissor(rect);
    if (!sim.held && !this.auto && sim.atRest) {
      if (this.restSince < 0) this.restSince = now();
      else if (now() - this.restSince > 0.25) this.leavePeek();
    } else this.restSince = -1;
  }

  /** Bounding box of everything that can show the world while peeking. */
  private peekScissor() {
    const L = this.raster?.letter;
    if (!L) return null;
    const sim = this.sim;
    const scale = this.letterScale();
    const half = (Math.max(L.box.width, L.box.height) / 2) * scale * 1.25 + 10;
    const cx = L.center.x + sim.x * VISUAL;
    const cy = L.center.y + sim.y * VISUAL;
    let x0 = cx - half;
    let y0 = cy - half;
    let x1 = cx + half;
    let y1 = cy + half;
    if (this.seam && sim.crack > 0.005) {
      const f = crackFronts(this.seam, sim.crack, sim.L);
      for (const s of [f.back, f.front]) {
        // The slit rides on the stretched sheet: pad generously.
        const px = this.seam.origin.x + this.seam.dir.x * s;
        const py = this.seam.origin.y + this.seam.dir.y * s;
        x0 = Math.min(x0, px - 40 + Math.min(0, sim.x));
        y0 = Math.min(y0, py - 40 + Math.min(0, sim.y));
        x1 = Math.max(x1, px + 40 + Math.max(0, sim.x));
        y1 = Math.max(y1, py + 40 + Math.max(0, sim.y));
      }
    }
    x0 = clamp(x0, 0, innerWidth);
    y0 = clamp(y0, 0, innerHeight);
    x1 = clamp(x1, 0, innerWidth);
    y1 = clamp(y1, 0, innerHeight);
    return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0) };
  }

  private letterScale() {
    const T = this.sim.tension;
    return 1 + 0.42 * T + 0.2 * T * T;
  }

  private curl() {
    const R = clamp(Math.min(innerWidth, innerHeight) * 0.075, 38, 78);
    return R;
  }

  private flapReach(side: 1 | -1) {
    const seam = this.seam!;
    let m = 0;
    for (const p of [
      { x: 0, y: 0 },
      { x: innerWidth, y: 0 },
      { x: 0, y: innerHeight },
      { x: innerWidth, y: innerHeight },
    ]) {
      m = Math.max(m, side * toSeamFrame(seam, p).t);
    }
    return m + 30;
  }

  private tearTick(dt: number) {
    // Hitches slow the tear down rather than skip frames of it (as the rig).
    this.tearT += Math.min(dt, 1 / 24) * this.timeScale;
    if (!this.flightStarted && this.tearT >= TIMELINE.cameraStart) this.startFlight();
    const t = this.tearT;
    const uPlus = clamp((t - TIMELINE.curlStart) / TIMELINE.curl, 0, 1);
    const uMinus = clamp((t - TIMELINE.curlStart - 0.07) / TIMELINE.curl, 0, 1);
    if (!this.paperDone && uPlus >= 1 && uMinus >= 1) {
      this.paperDone = true;
      this.root?.classList.add("pp-gone");
    }
  }

  private frameOut(): PaperFrameOut {
    const sim = this.sim;
    const base: PaperFrameOut = {
      mode: "off",
      letterX: sim.x * VISUAL,
      letterY: sim.y * VISUAL,
      angle: sim.angle,
      scale: this.letterScale(),
      pullX: sim.px * VISUAL,
      pullY: sim.py * VISUAL,
      tension: sim.tension,
      relax: 1,
      holeOpen: this.counterOpen,
      gap: 0,
      fronts: { back: 0, front: 0 },
      creaseFronts: { back: 0, front: 0 },
      crease: 0,
      // No peel before the commit: the fold sits far outside the paper.
      axisPlus: -1e5,
      axisMinus: -1e5,
      curlR: this.curl(),
    };
    if (!this.armedFlag || !this.raster) return base;
    if (this.phase === "rest") {
      base.mode = this.sheetFrames > 0 ? "sheet" : "counter";
      return base;
    }
    if (this.phase === "game" || this.paperDone) return base;
    base.mode = "sheet";
    const seam = this.seam;
    if (seam) {
      const crack = crackFronts(seam, sim.crack, sim.L);
      base.creaseFronts = crackFronts(seam, sim.crease, sim.L);
      base.crease = smoothstep(0, 0.25, sim.crease) * (1 - sim.crack);
      if (this.phase === "peek") {
        base.fronts = sim.crack > 0.004 ? crack : { back: 0, front: 0 };
        base.gap = sim.crack * (1.5 + 5 * sim.crack);
      } else {
        const t = this.tearT;
        base.tension = sim.tension * (1 - smoothstep(0.1, 0.8, t));
        const full = tearFronts(seam, clamp(t / TIMELINE.seam, 0, 1));
        base.fronts = { back: Math.min(full.back, crack.back), front: Math.max(full.front, crack.front) };
        base.gap = sim.crack * (1.5 + 5 * sim.crack) + 12 * easeOutCubic(clamp(t / 0.55, 0, 1));
        const R = base.curlR;
        const endPlus = curlClearAxis(this.flapReach(1), R) * 1.18;
        const endMinus = curlClearAxis(this.flapReach(-1), R) * 1.18;
        const uPlus = clamp((t - TIMELINE.curlStart) / TIMELINE.curl, 0, 1);
        const uMinus = clamp((t - TIMELINE.curlStart - 0.07) / TIMELINE.curl, 0, 1);
        // Peel: slow lift, then the sheet rolls away and accelerates off.
        const ease = (u: number) => (u < 0.35 ? 0.5 * (u / 0.35) ** 2 * 0.35 : 0.175 + (u - 0.35) * (0.825 / 0.65));
        base.axisPlus = -R * 0.6 + (endPlus + R * 0.6) * ease(uPlus);
        base.axisMinus = -R * 0.6 + (endMinus + R * 0.6) * ease(uMinus);
      }
    }
    return base;
  }

  private publish() {
    this.sink?.update(this.frameOut());
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.detach();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onWindowKey, true);
    window.removeEventListener("popstate", this.onPopState);
    this.unsub.forEach((u) => u());
  }
}

function angleDelta(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The one controller for the page. */
export const peephole = new PeepholeController();

if (typeof window !== "undefined" && qaEnabled()) {
  (window as unknown as Record<string, unknown>).__peephole = { peephole, useStage, cameraRig };
  exposeQa({ peephole, useStage, cameraRig, useCameraRig, useWorldView });
}
