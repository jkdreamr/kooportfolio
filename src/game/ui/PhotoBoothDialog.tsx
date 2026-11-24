import { useEffect, useRef, useState } from "react";
import { runtime, useGame } from "../core/store";
import { keys, touch } from "../core/input";
import {
  beginPhoto,
  clearPhoto,
  requestPhoto,
  usePhotoBooth,
} from "../core/photoBooth";
import type { PhotoPose, PostcardFrame } from "../core/postcard";
import "./photo-booth.css";

export function openPhotoBooth() {
  const game = useGame.getState();
  if (
    game.scene !== "hub" ||
    game.paused ||
    game.build ||
    game.panel !== "none"
  )
    return;
  runtime.target = null;
  runtime.path = [];
  keys.clear();
  touch.x = 0;
  touch.z = 0;
  beginPhoto(runtime.x, runtime.z);
  useGame.setState({ panel: "photo" });
}
function closePhotoBooth() {
  clearPhoto();
  useGame.setState({ panel: "none" });
}

function BoothSession() {
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = usePhotoBooth();
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    // Re-request after the StrictMode setup/cleanup probe too: its cleanup
    // deliberately invalidates pending encodes and releases preview URLs.
    requestPhoto();
    return () => {
      modal?.close();
      clearPhoto();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!countdown) return;
    const timer = window.setTimeout(() => {
      setCountdown(countdown - 1);
      if (countdown === 1) requestPhoto(true);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);
  const busy = photo.stage === "countdown";
  const ready = photo.stage === "ready";
  function choose(pose: PhotoPose, frame: PostcardFrame) {
    usePhotoBooth.setState({ pose, frame, stage: "posing" });
    requestPhoto();
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
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePhotoBooth();
      }}
    >
      <section className="photo-booth-card">
        <header>
          <h2 id="photo-booth-title">Photo booth</h2>
          <button
            type="button"
            aria-label="Close photo booth"
            className="photo-booth-close"
            onClick={closePhotoBooth}
          >
            ×
          </button>
        </header>
        <div className="photo-booth-preview" aria-busy={Boolean(photo.request)}>
          {photo.card ? (
            <img
              src={photo.card.url}
              alt="Your village postcard"
              width="1568"
              height="1152"
            />
          ) : (
            <span>Framing your shot…</span>
          )}
          {busy && (
            <strong
              className="photo-booth-countdown"
              role="status"
              aria-live="polite"
            >
              {countdown || "Click!"}
            </strong>
          )}
        </div>
        <div className="photo-booth-options">
          {!ready && (
            <>
              <fieldset disabled={busy}>
                <legend>Pose</legend>
                {(
                  [
                    ["wave", "Wave"],
                    ["smile", "Smile"],
                    ["cheer", "Cheer"],
                  ] as const
                ).map(([pose, label]) => (
                  <button
                    type="button"
                    key={pose}
                    aria-pressed={photo.pose === pose}
                    onClick={() => choose(pose, photo.frame)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <fieldset disabled={busy}>
                <legend>Border</legend>
                {(
                  [
                    ["cream", "Cream"],
                    ["pine", "Pine"],
                  ] as const
                ).map(([frame, label]) => (
                  <button
                    type="button"
                    key={frame}
                    aria-pressed={photo.frame === frame}
                    onClick={() => choose(photo.pose, frame)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            </>
          )}
          {photo.error && (
            <p className="photo-booth-error" role="alert">
              {photo.error}
            </p>
          )}
          <div className="photo-booth-actions">
            {ready && photo.card ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    usePhotoBooth.setState({ stage: "posing" });
                    requestPhoto();
                  }}
                >
                  Again
                </button>
                <a
                  className="primary-button"
                  href={photo.card.url}
                  download={photo.card.filename}
                >
                  Save postcard
                </a>
              </>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={busy || Boolean(photo.request)}
                onClick={() => {
                  usePhotoBooth.setState({ stage: "countdown" });
                  setCountdown(3);
                }}
              >
                Take photo
              </button>
            )}
          </div>
        </div>
      </section>
    </dialog>
  );
}

export function PhotoBoothDialog() {
  const visible = useGame(
    (game) =>
      game.scene === "hub" && String(game.panel) === "photo" && !game.paused,
  );
  return visible ? <BoothSession /> : null;
}
