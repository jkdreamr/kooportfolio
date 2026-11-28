import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PointerEvent } from "react";
import { useGame } from "../core/store";
import { endGameMode, useGameMode } from "../core/gameMode";
import {
  borders,
  CAPTION_LIMIT,
  captureShot,
  drawStrip,
  filters,
  SHOT_COUNT,
  stickers,
  stripBlob,
  wallJpeg,
} from "../core/photoStrip";
import type { Border, Filter, Mark, Point, Sticker } from "../core/photoStrip";
import { STRIP_HEIGHT, STRIP_WIDTH } from "../../shared/booth";
import {
  ApiUnavailable,
  readJson,
  reportRequest,
  wallListRequest,
  wallPostRequest,
  type ApiStatus,
} from "../../shared/api";
import { createLocalWall, wallStrips } from "../../shared/booth";
import {
  checkPublicText,
  cooldownCopy,
  cooldownLeft,
  notePost,
  textCheckCopy,
} from "../../shared/writing";
import { useApiStatus } from "./useApiAvailable";
import { takeBoothLauncher } from "./photoBoothLauncher";
import { cue } from "../core/audio/cues";
import type { WallStrip } from "../../shared/booth";
import "./photo-booth.css";

export { openPhotoBooth } from "./photoBoothLauncher";

function closePhotoBooth() {
  endGameMode();
}

type Shoot = { shots: HTMLCanvasElement[]; date: Date };

function Camera({
  autoStart,
  onCameraRequested,
  onShoot,
  onWall,
}: {
  autoStart: boolean;
  onCameraRequested: () => void;
  onShoot: (shoot: Shoot) => void;
  onWall: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef(0);
  const timer = useRef(0);
  const stopCamera = useRef<(() => void) | undefined>(undefined);
  const [state, setState] = useState<"idle" | "opening" | "live">("idle");
  const [sequence, setSequence] = useState<{ shot: number; seconds: number }>();
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      session.current++;
      window.clearTimeout(timer.current);
      stopCamera.current?.();
    },
    [],
  );

  const enable = useCallback(async () => {
    const view = video.current;
    if (!view) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      {
        setError("Camera needs HTTPS or localhost.");
        cue("ui-error");
      }
      return;
    }
    const id = ++session.current;
    setState("opening");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const tracks = stream.getTracks();
      if (session.current !== id) {
        tracks.forEach((track) => track.stop());
        return;
      }
      function ended() {
        if (session.current !== id) return;
        session.current++;
        window.clearTimeout(timer.current);
        stopCamera.current?.();
        setSequence(undefined);
        setState("idle");
        {
          setError("Camera disconnected.");
          cue("ui-error");
        }
      }
      for (const track of tracks) track.addEventListener("ended", ended);
      stopCamera.current = () => {
        for (const track of tracks) {
          track.removeEventListener("ended", ended);
          track.stop();
        }
        view.srcObject = null;
        stopCamera.current = undefined;
      };
      view.srcObject = stream;
      await view.play();
      if (session.current === id) setState("live");
    } catch (failure) {
      if (session.current !== id) return;
      stopCamera.current?.();
      setState("idle");
      if (
        failure instanceof DOMException &&
        failure.name === "NotAllowedError"
      ) {
        {
          setError("Camera blocked. Allow it in your browser settings.");
          cue("ui-error");
        }
      } else if (
        failure instanceof DOMException &&
        failure.name === "NotFoundError"
      ) {
        {
          setError("No camera found.");
          cue("ui-error");
        }
      } else {
        {
          setError("Couldn’t open camera.");
          cue("ui-error");
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    const start = window.setTimeout(() => void enable(), 0);
    return () => window.clearTimeout(start);
  }, [autoStart, enable]);

  function takePhotos() {
    if (!video.current || sequence) return;
    const view = video.current;
    const shots: HTMLCanvasElement[] = [];
    const date = new Date();
    let end = performance.now() + 3000;
    setError("");
    setSequence({ shot: 1, seconds: 3 });
    function tick() {
      const seconds = Math.ceil((end - performance.now()) / 1000);
      if (seconds > 0) {
        setSequence({ shot: shots.length + 1, seconds });
      } else {
        try {
          shots.push(captureShot(view));
        } catch {
          setSequence(undefined);
          {
            setError("Couldn’t take photo. Try again.");
            cue("ui-error");
          }
          return;
        }
        if (shots.length === SHOT_COUNT) {
          onShoot({ shots, date });
          return;
        }
        end = performance.now() + 3000;
        setSequence({ shot: shots.length + 1, seconds: 3 });
      }
      timer.current = window.setTimeout(tick, 100);
    }
    timer.current = window.setTimeout(tick, 100);
  }

  return (
    <>
      <div className="photo-booth-preview">
        <video
          ref={video}
          hidden={state !== "live"}
          autoPlay
          muted
          playsInline
          aria-label="Camera preview"
        />
        {state !== "live" && (
          <span>
            {state === "opening"
              ? "Opening camera…"
              : "4 photos · 3 seconds each"}
          </span>
        )}
        {sequence && (
          <div className="photo-booth-countdown" role="status">
            <span>
              Photo {sequence.shot} / {SHOT_COUNT}
            </span>
            <strong>{sequence.seconds}</strong>
          </div>
        )}
      </div>
      {error && (
        <p className="photo-booth-error" role="alert">
          {error}
        </p>
      )}
      <div className="photo-booth-actions">
        {state === "live" ? (
          <button
            type="button"
            className="photo-booth-primary"
            disabled={Boolean(sequence)}
            onClick={takePhotos}
          >
            Take 4 photos
          </button>
        ) : (
          <button
            type="button"
            className="photo-booth-primary"
            disabled={state === "opening"}
            onClick={() => {
              onCameraRequested();
              void enable();
            }}
          >
            Enable camera
          </button>
        )}
        <button type="button" disabled={Boolean(sequence)} onClick={onWall}>
          Wall
        </button>
      </div>
    </>
  );
}

function Decorate({
  shoot,
  posted,
  onRetake,
  onScrap,
  onPosted,
  wall,
}: {
  shoot: Shoot;
  posted: boolean;
  /** Whether the shared wall is live; without it posting keeps the strip
   * on this device. */
  wall: boolean;
  onRetake: () => void;
  onScrap: () => void;
  onPosted: () => void;
}) {
  const [border, setBorder] = useState<Border>("slate");
  const [filter, setFilter] = useState<Filter>("none");
  const [caption, setCaption] = useState("");
  const [tool, setTool] = useState<Sticker | "pen">("Star");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<number | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context)
      drawStrip(
        context,
        shoot.shots,
        border,
        shoot.date.toLocaleDateString(),
        caption,
        marks,
        filter,
      );
  }, [border, caption, filter, marks, shoot]);

  function position(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * STRIP_WIDTH) / rect.width,
      y: ((event.clientY - rect.top) * STRIP_HEIGHT) / rect.height,
    };
  }

  function startMark(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || event.button !== 0 || stroke.current !== null) return;
    const point = position(event);
    if (tool === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      stroke.current = event.pointerId;
      setMarks((previous) => [...previous, { kind: "pen", points: [point] }]);
    } else {
      setMarks((previous) => [...previous, { kind: tool, point }]);
    }
  }

  function drawMark(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current !== event.pointerId) return;
    const point = position(event);
    setMarks((previous) => {
      const last = previous.at(-1);
      return last?.kind === "pen"
        ? [
            ...previous.slice(0, -1),
            { kind: "pen", points: [...last.points, point] },
          ]
        : previous;
    });
  }

  function finishMark(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current === event.pointerId) stroke.current = null;
  }

  async function save(post: boolean) {
    const image = canvas.current;
    if (!image || pending.current) return;
    if (post && wall) {
      const check = checkPublicText(caption);
      if (!check.ok) {
        setError(textCheckCopy(check.reason));
        cue("ui-error");
        return;
      }
      const wait = cooldownLeft("booth");
      if (wait > 0) {
        setError(cooldownCopy(wait));
        cue("ui-error");
        return;
      }
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      if (post) {
        // Compressed to the wall's size cap (about 160 KB of JPEG).
        const jpeg = await wallJpeg(image);
        if (!wall) {
          localWall.add({
            id: `local-${Date.now()}`,
            jpeg: await toBase64(jpeg),
          });
          if (!controller.signal.aborted) onPosted();
          return;
        }
        const { url, init } = wallPostRequest(jpeg);
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
        if (response.status === 429) {
          if (!controller.signal.aborted) {
            setError("That’s a lot of posting. Try again in a little while.");
            cue("ui-error");
          }
          return;
        }
        if (!response.ok) throw new Error("Wall unavailable.");
        await readJson(response);
        notePost("booth");
        if (!controller.signal.aborted) onPosted();
      } else {
        const blob = await stripBlob(image, "image/png");
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "photo-strip.png";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      if (!controller.signal.aborted) {
        setError(
          post
            ? "Couldn’t post to the wall just now. Save strip still works."
            : "Couldn’t save strip.",
        );
        cue("ui-error");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="photo-booth-editor">
      <canvas
        ref={canvas}
        className="photo-booth-strip"
        width={STRIP_WIDTH}
        height={STRIP_HEIGHT}
        aria-label="Your four-photo strip"
        tabIndex={0}
        onKeyDown={(event) => {
          if (busy || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          const point = {
            x: STRIP_WIDTH / 2,
            y: 139 + (marks.length % SHOT_COUNT) * 258,
          };
          setMarks((previous) => [
            ...previous,
            tool === "pen"
              ? { kind: "pen", points: [point] }
              : { kind: tool, point },
          ]);
        }}
        onPointerDown={startMark}
        onPointerMove={drawMark}
        onPointerUp={finishMark}
        onPointerCancel={finishMark}
        onLostPointerCapture={finishMark}
      />
      <div className="photo-booth-tools">
        <fieldset disabled={busy}>
          <legend>Border</legend>
          {(Object.keys(borders) as Border[]).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={border === choice}
              onClick={() => setBorder(choice)}
            >
              {choice[0].toUpperCase() + choice.slice(1)}
            </button>
          ))}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Filter</legend>
          {(Object.keys(filters) as Filter[]).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={filter === choice}
              onClick={() => setFilter(choice)}
            >
              {filters[choice].label}
            </button>
          ))}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Decorate</legend>
          {(Object.keys(stickers) as Sticker[]).map((choice) => (
            <button
              key={choice}
              type="button"
              title={choice}
              aria-label={choice}
              aria-pressed={tool === choice}
              onClick={() => setTool(choice)}
            >
              {stickers[choice]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            type="button"
            disabled={!marks.length}
            onClick={() => setMarks((previous) => previous.slice(0, -1))}
          >
            Undo
          </button>
          <p>Tap to place a sticker or draw with the pen.</p>
        </fieldset>
        <label>
          Caption
          <input
            value={caption}
            maxLength={CAPTION_LIMIT}
            disabled={busy}
            onChange={(event) => setCaption(event.target.value)}
          />
        </label>
        {error && (
          <p className="photo-booth-error" role="alert">
            {error}
          </p>
        )}
        <div className="photo-booth-actions">
          <button type="button" disabled={busy} onClick={onRetake}>
            Retake
          </button>
          <button type="button" disabled={busy} onClick={onScrap}>
            Scrap
          </button>
          <button
            type="button"
            className="photo-booth-primary"
            disabled={busy}
            aria-describedby="booth-save-note"
            onClick={() => void save(false)}
          >
            Save strip
          </button>
          <button
            type="button"
            disabled={busy || posted}
            aria-describedby="booth-public"
            onClick={() => void save(true)}
          >
            {posted ? "Posted" : "Post to wall"}
          </button>
        </div>
        <p id="booth-save-note">Save strip downloads a PNG to this device.</p>
        <p id="booth-public">
          {wall
            ? "Posted strips are visible to everyone."
            : "The shared wall opens soon. Until then, posting keeps your strip on this device."}
        </p>
      </div>
    </div>
  );
}

const localWall = createLocalWall();
async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
/** The live wall's copy of what it showed when it could not load. */
const WALL_LOCAL_LINE =
  "The shared wall opens soon. Your strips are saved on this device.";

function Wall({
  onBack,
  posted,
  status,
}: {
  onBack: () => void;
  posted: boolean;
  status: ApiStatus;
}) {
  const live = status.live;
  const [strips, setStrips] = useState<WallStrip[] | undefined>(() =>
    live ? undefined : localWall.list(),
  );
  const [fellBack, setFellBack] = useState(false);
  const [reported, setReported] = useState<Record<string, "sent" | "failed">>(
    {},
  );
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    const { url, init } = wallListRequest();
    void fetch(url, { ...init, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new ApiUnavailable();
        const result = await readJson<{ strips?: unknown }>(response);
        const list = wallStrips(result?.strips);
        if (!list) throw new ApiUnavailable();
        setStrips(list);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Never a raw error: show this device's strips instead.
        setFellBack(true);
        setStrips(localWall.list());
      });
    return () => controller.abort();
  }, [live]);
  const local = !live || fellBack;
  async function report(id: string) {
    try {
      const { url, init } = reportRequest("strip", id);
      const response = await fetch(url, init);
      if (!response.ok) throw new ApiUnavailable();
      setReported((r) => ({ ...r, [id]: "sent" }));
    } catch {
      setReported((r) => ({ ...r, [id]: "failed" }));
      cue("ui-error");
    }
  }

  return (
    <>
      {posted && (
        <p role="status">
          {local ? "Saved on this device." : "Posted to the wall."}
        </p>
      )}
      {local && <p className="photo-booth-note">{WALL_LOCAL_LINE}</p>}
      {strips ? (
        strips.length ? (
          <div
            className="photo-booth-wall"
            aria-label={local ? "Your strips on this device" : "Posted strips"}
          >
            {strips.map(({ id, jpeg }) => (
              <figure key={id} className="photo-booth-wall-item">
                <img
                  src={`data:image/jpeg;base64,${jpeg}`}
                  alt={local ? "Your photo strip" : "Posted photo strip"}
                  width={STRIP_WIDTH}
                  height={STRIP_HEIGHT}
                />
                {!local && status.features.report && (
                  <button
                    type="button"
                    className="photo-booth-report"
                    disabled={!!reported[id]}
                    onClick={() => void report(id)}
                  >
                    {reported[id] === "sent"
                      ? "Reported"
                      : reported[id] === "failed"
                        ? "Couldn’t report"
                        : "Report"}
                  </button>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <p>
            {local
              ? "No strips on this device yet."
              : "No strips yet. Be the first."}
          </p>
        )
      ) : (
        <p role="status">Loading the wall…</p>
      )}
      <div className="photo-booth-actions">
        <button type="button" onClick={onBack}>
          {posted ? "Back to strip" : "Back to booth"}
        </button>
      </div>
    </>
  );
}

function BoothSession({ paused }: { paused: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Live: the shared wall. Not live (or still probing): this device.
  const status = useApiStatus();
  const wallOnline = status?.live === true;
  const [shoot, setShoot] = useState<Shoot>();
  const [wall, setWall] = useState(false);
  const [posted, setPosted] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(false);
  useLayoutEffect(() => {
    const modal = dialog.current;
    if (!paused) modal?.showModal();
    return () => modal?.close();
  }, [paused]);

  useEffect(
    () => () => {
      if (useGameMode.getState().active?.id === "photo-booth") return;
      const launcher = takeBoothLauncher();
      requestAnimationFrame(() => {
        if (launcher?.isConnected && !useGameMode.getState().active)
          launcher.focus({ preventScroll: true });
      });
    },
    [],
  );

  function reset() {
    setShoot(undefined);
    setWall(false);
    setPosted(false);
    setCameraRequested(false);
  }

  return (
    <dialog
      ref={dialog}
      className="photo-booth-dialog"
      aria-labelledby="photo-booth-title"
      onCancel={(event) => {
        event.preventDefault();
        closePhotoBooth();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.repeat) event.preventDefault();
        event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePhotoBooth();
      }}
    >
      <section className="photo-booth-card">
        <header>
          <h2 id="photo-booth-title">{wall ? "Photo wall" : "Photo booth"}</h2>
          <button
            type="button"
            aria-label="Close photo booth"
            className="photo-booth-close"
            onClick={closePhotoBooth}
          >
            ×
          </button>
        </header>
        {wall && (
          <Wall
            key={wallOnline ? "live" : "local"}
            status={status ?? { live: false, features: {} }}
            onBack={() => (shoot ? setWall(false) : reset())}
            posted={posted}
          />
        )}
        {shoot && (
          <div hidden={wall}>
            <Decorate
              shoot={shoot}
              posted={posted}
              wall={wallOnline}
              onRetake={() => {
                setShoot(undefined);
                setPosted(false);
                setCameraRequested(true);
              }}
              onScrap={reset}
              onPosted={() => {
                setPosted(true);
                setWall(true);
              }}
            />
          </div>
        )}
        {!paused && !wall && !shoot && (
          <Camera
            autoStart={cameraRequested}
            onCameraRequested={() => setCameraRequested(true)}
            onShoot={setShoot}
            onWall={() => setWall(true)}
          />
        )}
      </section>
    </dialog>
  );
}

export function PhotoBoothDialog() {
  const playing = useGameMode((state) => state.active?.id === "photo-booth");
  const paused = useGame((game) => game.paused);
  return playing ? <BoothSession paused={paused} /> : null;
}
