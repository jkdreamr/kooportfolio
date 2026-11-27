import { StaticBatch } from "../world/StaticBatch";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Html, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { create } from "zustand";
import { Box, Cylinder, Sign } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { useLauncher, useLauncherHosted } from "../core/launchers";
import { cue } from "../core/audio/cues";
import { useSoundLoop } from "./useSoundLoop";
import {
  loadTheaterProgram,
  warmTheaterProgram,
  youtubeEmbedUrl,
  type TheaterFilm,
  type TheaterKind,
} from "../core/theaterProgram";
import { doorsInWorld } from "../core/world";
import {
  THEATER_EYE,
  THEATER_PLAYER_HEIGHT,
  THEATER_PLAYER_WIDTH,
  THEATER_SCREEN,
  THEATER_SCREEN_HEIGHT,
  THEATER_SCREEN_WIDTH,
  THEATER_SEAT_X,
  THEATER_SEAT_Z,
  theaterFov,
} from "../core/theaterScreen";
import { GameControls } from "./InteriorProps";
import "./movie-theater.css";

type TheaterState = {
  seated: boolean;
  filmId: string | null;
  sit: () => void;
  stand: () => void;
};
export const useTheater = create<TheaterState>((set) => ({
  seated: false,
  filmId: null,
  sit: () => {
    runtime.target = null;
    runtime.path = [];
    runtime.moving = false;
    set({ seated: true, filmId: null });
  },
  stand: () => set({ seated: false, filmId: null }),
}));

export function MovieTheaterBuilding({
  p = [-38, 0, -39],
  korean = false,
}: {
  p?: [number, number, number];
  korean?: boolean;
}) {
  // Start fetching the catalogue as the visitor walks up to the doors.
  const near = useRef(0);
  useFrame((_, dt) => {
    near.current += dt;
    if (near.current < 0.5) return;
    near.current = 0;
    const state = useGame.getState();
    if (state.scene !== "hub") return;
    const door = doorsInWorld(state.world).find((d) => d.id === "theater");
    if (door && Math.hypot(runtime.x - door.x, runtime.z - door.z) < 14) void warmTheaterProgram().catch(() => {});
  });
  return (
    <StaticBatch id="MovieTheaterBuilding">
      <group position={p}>
        <Box p={[0, 0.35, 0]} s={[10.4, 0.7, 8.4]} c="#afa184" />
        <Box p={[0, 2.8, 0]} s={[9.4, 5, 7.5]} c="#bca888" />
        <Box p={[0, 5.2, 0]} s={[10.2, 0.6, 8.1]} c="#77443d" />
        <Box p={[0, 5.75, -0.6]} s={[8, 0.7, 5.5]} c="#974a3e" />
        <Box p={[0, 6.3, -0.6]} s={[5.7, 0.45, 4.7]} c="#b26045" />
        {[-4.35, 4.35].map((x) => (
          <group key={x}>
            <Box p={[x, 2.8, 3.8]} s={[0.72, 5.2, 0.6]} c="#d8c5a1" />
            <Box p={[x, 5.5, 3.8]} s={[1, 0.35, 0.85]} c="#ead8ae" />
          </group>
        ))}
        <Box p={[0, 1.8, 3.8]} s={[2.8, 3, 0.16]} c="#3c3540" />
        {[-0.72, 0.72].map((x) => (
          <Box key={x} p={[x, 1.9, 3.91]} s={[1.2, 2.4, 0.08]} c="#71443c" />
        ))}
        <Box p={[0, 1.9, 4]} s={[0.12, 2.6, 0.1]} c="#d6af5e" />
        <Box p={[0, 3.8, 4.15]} s={[7.8, 0.8, 1.8]} c="#985441" />
        <Box p={[0, 4.22, 4.15]} s={[8.2, 0.16, 2]} c="#d1ac62" />
        <Sign
          text={korean ? "서울 극장" : "THE PICTURE HOUSE"}
          p={[0, 3.85, 5.08]}
          size={[6.8, 0.6]}
        />
        {[-3.4, -2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55, 3.4].map((x) => (
          <mesh key={x} position={[x, 3.32, 4.75]}>
            <sphereGeometry args={[0.1, 6, 4]} />
            <meshBasicMaterial color="#ffe9a0" />
          </mesh>
        ))}
        {[-3.1, 3.1].map((x) => (
          <group key={x}>
            <Box p={[x, 1.9, 3.88]} s={[1.3, 2.1, 0.15]} c="#b89959" />
            <Box p={[x, 1.9, 3.98]} s={[1.1, 1.85, 0.08]} c="#314b55" />
            <Cylinder
              p={[x, 2.1, 4.05]}
              s={[0.35, 0.04, 0.35]}
              r={[Math.PI / 2, 0, 0]}
              c="#d4b879"
            />
          </group>
        ))}
        <Box p={[0, 0.35, 4.7]} s={[3.6, 0.36, 1.4]} c="#cbbb9a" />
      </group>
    </StaticBatch>
  );
}

function TheaterSeat({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.3, 0]} s={[0.75, 0.6, 0.7]} c="#4b3431" />
      <Box p={[0, 0.68, 0]} s={[0.85, 0.28, 0.8]} c="#9b433d" />
      <Box
        p={[0, 1.13, 0.35]}
        s={[0.9, 1, 0.3]}
        c="#893a37"
        r={[-0.09, 0, 0]}
      />
      {[-0.52, 0.52].map((dx) => (
        <Box key={dx} p={[dx, 0.88, 0.06]} s={[0.16, 0.18, 0.95]} c="#b49458" />
      ))}
    </group>
  );
}

/** Most item buttons a program view renders before asking for more. */
const PROGRAM_PAGE = 60;

const KIND_NOUN: Record<TheaterFilm["kind"], string> = {
  "Full episode": "episode",
  "Full movie": "movie",
  "Short film": "short",
  Trailer: "trailer",
};

function countLabel(films: readonly TheaterFilm[]) {
  const kinds = new Set(films.map((film) => film.kind));
  const noun = kinds.size === 1 ? KIND_NOUN[films[0].kind] : "video";
  return `${films.length} ${noun}${films.length === 1 ? "" : "s"}`;
}

function channelLabel(films: readonly TheaterFilm[]) {
  const channels = [...new Set(films.map((film) => film.channel))];
  return channels.length > 1
    ? `${channels[0]} + ${channels.length - 1} more`
    : channels[0];
}

/**
 * Drill-down program: shows → episodes, or a flat search. Lives inside the
 * Html DOM root (not the R3F root) so the controlled search input updates in
 * the same React root that owns it; it mounts each time the panel opens.
 */
function ProgramPanel({
  program,
  filmId,
  onPick,
}: {
  program: readonly TheaterFilm[];
  filmId: string | null;
  onPick: (film: TheaterFilm) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, TheaterFilm[]>();
    for (const film of program) {
      const films = map.get(film.title);
      if (films) films.push(film);
      else map.set(film.title, [film]);
    }
    return map;
  }, [program]);
  const playing = program.find((film) => film.id === filmId);
  const [query, setQuery] = useState("");
  const [openTitle, setOpenTitle] = useState<string | null>(() =>
    playing && (groups.get(playing.title)?.length ?? 0) > 1
      ? playing.title
      : null,
  );
  // Open far enough to include the film that is playing.
  const [limit, setLimit] = useState(() => {
    const index = openTitle
      ? (groups.get(openTitle) ?? []).findIndex((film) => film.id === filmId)
      : 0;
    return Math.ceil((Math.max(index, 0) + 1) / PROGRAM_PAGE) * PROGRAM_PAGE;
  });
  // Focus requests, honoured by callback refs once the target node mounts.
  const revealPlaying = useRef(filmId);
  const focusBack = useRef(false);
  const focusShow = useRef<string | null>(null);
  const focusIndex = useRef<number | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? program.filter((film) =>
            `${film.title} ${film.episode}`.toLowerCase().includes(needle),
          )
        : [],
    [needle, program],
  );
  const episodes = openTitle ? (groups.get(openTitle) ?? []) : [];

  const toTop = (from: Element) =>
    from.closest("#cinema-program")?.scrollTo({ top: 0 });
  const openShow = (title: string, from: Element) => {
    toTop(from);
    focusBack.current = true;
    setOpenTitle(title);
    setLimit(PROGRAM_PAGE);
  };
  const allShows = () => {
    focusShow.current = openTitle;
    const index = openTitle ? [...groups.keys()].indexOf(openTitle) : 0;
    setOpenTitle(null);
    setLimit(Math.ceil((Math.max(index, 0) + 1) / PROGRAM_PAGE) * PROGRAM_PAGE);
  };
  const showMore = () => {
    focusIndex.current = limit;
    setLimit(limit + PROGRAM_PAGE);
  };
  const itemRef =
    (index: number, id?: string) => (button: HTMLButtonElement | null) => {
      if (button && focusIndex.current === index) {
        focusIndex.current = null;
        button.focus();
      }
      if (button && id && revealPlaying.current === id) {
        revealPlaying.current = null;
        button.scrollIntoView({ block: "nearest" });
      }
    };
  // Inside a show the title is implied; name the kind only when it varies.
  const mixedKinds = new Set(episodes.map((film) => film.kind)).size > 1;
  const filmButton = (film: TheaterFilm, index: number, inShow: boolean) => (
    <button
      key={film.id}
      ref={itemRef(index, film.id)}
      aria-pressed={filmId === film.id}
      onClick={() => onPick(film)}
    >
      <strong>{inShow ? film.episode : film.title}</strong>
      {(!inShow || mixedKinds) && (
        <span>{inShow ? film.kind : film.episode}</span>
      )}
    </button>
  );
  const moreButton = (total: number, noun: string) =>
    total > limit && (
      <button className="cinema-more" onClick={showMore}>
        Show {Math.min(PROGRAM_PAGE, total - limit)} more {noun}
        <span>
          {limit} of {total} shown
        </span>
      </button>
    );

  let status: string;
  let body: ReactNode;
  if (program.length === 0) {
    status = "The program is being prepared.";
    body = <p className="cinema-note">The program is being prepared.</p>;
  } else if (needle) {
    status = matches.length
      ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} for “${query.trim()}”`
      : `No matches for “${query.trim()}”`;
    body = (
      <>
        {matches
          .slice(0, PROGRAM_PAGE)
          .map((film, index) => filmButton(film, index, false))}
        {matches.length > PROGRAM_PAGE && (
          <p className="cinema-note">
            {matches.length - PROGRAM_PAGE} more — refine search
          </p>
        )}
        {matches.length === 0 && (
          <p className="cinema-note">
            Try a show, an episode name or a number.
          </p>
        )}
      </>
    );
  } else if (openTitle && episodes.length) {
    status = `${openTitle}: ${countLabel(episodes)}`;
    body = (
      <>
        <button
          className="cinema-back"
          ref={(button) => {
            if (button && focusBack.current) {
              focusBack.current = false;
              button.focus();
            }
          }}
          onClick={allShows}
        >
          <span aria-hidden="true">←</span> All shows
        </button>
        {episodes
          .slice(0, limit)
          .map((film, index) => filmButton(film, index, true))}
        {moreButton(episodes.length, KIND_NOUN[episodes[0].kind] + "s")}
      </>
    );
  } else {
    const shows = [...groups];
    status = `${shows.length} ${shows.length === 1 ? "show" : "shows"} · ${countLabel(program)}`;
    body = (
      <>
        {shows.slice(0, limit).map(([title, films], index) => {
          const single = films.length === 1 ? films[0] : null;
          const ref = (button: HTMLButtonElement | null) => {
            itemRef(index)(button);
            if (button && focusShow.current === title) {
              focusShow.current = null;
              button.focus();
            }
          };
          // A one-film show plays straight away; anything else drills in.
          return single ? (
            <button
              key={title}
              ref={ref}
              aria-pressed={filmId === single.id}
              onClick={() => onPick(single)}
            >
              <strong>{title}</strong>
              <span>{single.episode}</span>
            </button>
          ) : (
            <button
              key={title}
              ref={ref}
              className="cinema-show"
              aria-current={playing?.title === title || undefined}
              onClick={(event) => openShow(title, event.currentTarget)}
            >
              <strong>{title}</strong>
              <span>
                {countLabel(films)} · {channelLabel(films)}
              </span>
            </button>
          );
        })}
        {moreButton(shows.length, "shows")}
      </>
    );
  }

  return (
    <>
      <div className="cinema-program-bar">
        <input
          type="search"
          className="cinema-search"
          aria-label="Search program"
          aria-controls="cinema-program-list"
          placeholder="Search shows & episodes"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(event) => {
            toTop(event.target);
            setQuery(event.target.value);
            setLimit(PROGRAM_PAGE);
          }}
          onKeyDown={(event) => {
            // Keep typed letters (WASD, E…) away from the game's listeners.
            event.stopPropagation();
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
        />
        <p className="cinema-status" role="status" aria-live="polite">
          {status}
        </p>
      </div>
      <div
        id="cinema-program-list"
        className="cinema-program"
        aria-label="Program"
      >
        {body}
      </div>
    </>
  );
}

function TheaterViewer({
  program,
  title,
  onClose,
}: {
  program: readonly TheaterFilm[];
  title: string;
  onClose: () => void;
}) {
  const filmId = useTheater((s) => s.filmId);
  const hidden = useGame((s) => s.paused || s.panel !== "none");
  const selected = program.find((film) => film.id === filmId);
  const [showProgram, setShowProgram] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const player = useRef<HTMLIFrameElement>(null);
  // Html owns a separate DOM root; focus when its button actually mounts.
  const focusClose = useCallback((button: HTMLButtonElement | null) => {
    close.current = button;
    button?.focus();
  }, []);
  const dialog = useRef<HTMLElement>(null);
  const getControls = useCallback(
    () =>
      dialog.current?.querySelectorAll<HTMLElement>(
        ".cinema-controls button, .cinema-controls a[href], #cinema-program:not([hidden]) :is(button, input)",
      ),
    [],
  );
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  useEffect(() => {
    if (hidden) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // A search with text owns its first Escape: ProgramPanel clears it.
        const target = event.target as HTMLInputElement;
        if (target.matches?.(".cinema-search") && target.value) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const controls = getControls();
        if (!controls?.length) return;
        const first = player.current ?? controls[0],
          last = controls[controls.length - 1];
        if (
          document.activeElement !== player.current &&
          !dialog.current?.contains(document.activeElement)
        ) {
          (event.shiftKey ? last : first).focus();
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          last.focus();
          event.preventDefault();
        }
        if (!event.shiftKey && document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("interior-game-close", onClose);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("interior-game-close", onClose);
    };
  }, [getControls, hidden, onClose]);
  if (hidden) return null;
  return (
    <>
      {selected && (
        <Html
          transform
          prepend
          position={THEATER_SCREEN}
          distanceFactor={(THEATER_SCREEN_WIDTH * 400) / THEATER_PLAYER_WIDTH}
          portal={portal}
          zIndexRange={[20, 0]}
        >
          <span
            className="cinema-focus-guard"
            tabIndex={0}
            onFocus={() => {
              const controls = getControls();
              controls?.item(controls.length - 1)?.focus();
            }}
          />
          <iframe
            ref={player}
            id="cinema-player"
            className="cinema-screen"
            key={selected.id}
            width={THEATER_PLAYER_WIDTH}
            height={THEATER_PLAYER_HEIGHT}
            title={`${selected.title} — ${selected.episode}`}
            src={youtubeEmbedUrl(selected.id)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onPointerDown={(event) => event.stopPropagation()}
          />
        </Html>
      )}
      <Html
        fullscreen
        calculatePosition={(_object, _camera, size) => [
          size.width / 2,
          size.height / 2,
        ]}
        onOcclude={() => undefined}
        portal={portal}
        zIndexRange={[80, 0]}
        style={{ pointerEvents: "none" }}
      >
        <section
          ref={dialog}
          className="cinema-viewer theater-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          aria-owns={selected ? "cinema-player" : undefined}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <header className="cinema-controls">
            <button ref={focusClose} onClick={onClose}>
              Leave seat
            </button>
            <button
              aria-expanded={showProgram}
              aria-controls="cinema-program"
              onClick={() => setShowProgram((open) => !open)}
            >
              Program
            </button>
            {selected && (
              <>
                <button
                  onClick={() => {
                    useTheater.setState({ filmId: null });
                    close.current?.focus();
                  }}
                >
                  Stop
                </button>
                <a
                  href={`https://www.youtube.com/watch?v=${selected.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  YouTube ↗
                </a>
              </>
            )}
          </header>
          <div id="cinema-program" hidden={!showProgram}>
            {showProgram && (
              <ProgramPanel
                program={program}
                filmId={filmId}
                onPick={(film) => {
                  useTheater.setState({ filmId: film.id });
                  setShowProgram(false);
                  close.current?.focus();
                }}
              />
            )}
          </div>
        </section>
      </Html>
    </>
  );
}

export function MovieTheaterInterior({
  kind = "home",
  title = "The picture house",
}: { kind?: TheaterKind; title?: string } = {}) {
  // Loaded on entry (usually already warm from the walk up). Until then, or
  // if the chunk cannot load, the screen shows its idle card, never an error.
  const [program, setProgram] = useState<readonly TheaterFilm[]>([]);
  useEffect(() => {
    let live = true;
    loadTheaterProgram(kind)
      .then((films) => live && setProgram(films))
      .catch(() => live && setProgram([]));
    return () => {
      live = false;
    };
  }, [kind]);
  const seated = useTheater((s) => s.seated);
  const playing = useTheater((s) => !!s.filmId);
  const { width, height } = useThree((s) => s.size);
  const restoreSeatFocus = useRef(false);
  const leaveSeat = useCallback(() => {
    restoreSeatFocus.current = true;
    useTheater.getState().stand();
  }, []);
  const sit = useCallback(() => {
    cue("ui-confirm");
    useTheater.getState().sit();
  }, []);
  const hosted = useLauncherHosted("theater");
  useLauncher("theater", "theater-seat", "Take a seat", sit, { enabled: !seated, hint: "Enter" });
  // The hall is never dead quiet: faint air and ventilation under the film.
  useSoundLoop("room-tone");
  const seatButton = useCallback((button: HTMLButtonElement | null) => {
    if (button && restoreSeatFocus.current) {
      restoreSeatFocus.current = false;
      button.focus();
    }
  }, []);
  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) useTheater.setState({ filmId: null });
    };
    const unsubscribe = useGame.subscribe((state) => {
      if (state.paused || state.panel !== "none")
        useTheater.setState({ filmId: null });
    });
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", stopWhenHidden);
      useTheater.getState().stand();
    };
  }, []);
  return (
    <group name="picture-house-interior">
      {seated && (
        <PerspectiveCamera
          makeDefault
          position={THEATER_EYE}
          fov={theaterFov(width / height, height)}
          near={0.1}
          far={100}
          onUpdate={(camera) => camera.lookAt(...THEATER_SCREEN)}
        />
      )}
      <Box p={[0, 0.06, -1]} s={[20.8, 0.1, 23.5]} c="#473638" />
      <Box p={[0, 0.15, -0.5]} s={[2.5, 0.08, 22]} c="#9b4942" />
      <Box p={[0, 3.75, -12.35]} s={[21, 7.5, 0.25]} c="#543936" />
      {seated && (
        <group>
          <Box p={[0, 7.55, -1]} s={[21, 0.16, 23]} c="#36282a" />
          {[-10.3, 10.3].map((x) => (
            <Box key={x} p={[x, 3.75, -1]} s={[0.24, 7.5, 23]} c="#543936" />
          ))}
        </group>
      )}
      <Box
        p={[0, THEATER_SCREEN[1], -10.7]}
        s={[THEATER_SCREEN_WIDTH + 0.45, THEATER_SCREEN_HEIGHT + 0.45, 0.5]}
        c="#b39a61"
      />
      <Box
        p={[0, THEATER_SCREEN[1], THEATER_SCREEN[2] - 0.11]}
        s={[THEATER_SCREEN_WIDTH, THEATER_SCREEN_HEIGHT, 0.2]}
        c={playing ? "#121013" : "#e8dfc8"}
      />
      <Box p={[0, 0.3, -9.7]} s={[19.5, 0.5, 3.3]} c="#795b49" />
      {[-1, 1].flatMap((side) =>
        [0, 1, 2].map((i) => (
          <Cylinder
            key={`${side}:${i}`}
            p={[side * (8.5 + i * 0.55), 2.9, -10.25]}
            s={[0.42, 5.5, 0.42]}
            c={i % 2 ? "#853b36" : "#a24b3f"}
          />
        )),
      )}
      <Sign
        text={title.toUpperCase()}
        p={[0, 7.02, -10.3]}
        size={[6.5, 0.45]}
      />
      {[-5.2, -1.6, 2, THEATER_SEAT_Z].flatMap((z) =>
        [-7.5, -5.8, -THEATER_SEAT_X, THEATER_SEAT_X, 5.8, 7.5].map((x) => (
          <TheaterSeat key={`${x}:${z}`} x={x} z={z} />
        )),
      )}
      {[-9.8, 9.8].flatMap((x) =>
        [-7, 0, 7].map((z) => (
          <group key={`${x}:${z}`}>
            <Box p={[x, 2.4, z]} s={[0.3, 0.9, 0.55]} c="#b59b5d" />
            <Box p={[x * 0.98, 2.4, z]} s={[0.35, 0.55, 0.33]} c="#f3d997" />
          </group>
        )),
      )}
      <Sign text="EXIT ↓" p={[0, 3, 10.6]} size={[2, 0.55]} />
      {!seated && !hosted && (
        <GameControls
          name="Picture house seating"
          position={[0, 1, 7]}
          mobileSheet
        >
          <h2>{title}</h2>
          <button ref={seatButton} onClick={sit}>
            Take a seat
          </button>
        </GameControls>
      )}
      {seated && (
        <TheaterViewer program={program} title={title} onClose={leaveSeat} />
      )}
    </group>
  );
}
