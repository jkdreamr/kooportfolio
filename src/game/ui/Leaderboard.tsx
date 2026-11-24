import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  fetchLeaderboard,
  readLocalLeaderboard,
  readPendingRun,
  saveLocalLeaderboardEntry,
  submitLeaderboardEntry,
} from "../core/leaderboard";
import {
  formatLeaderboardScore,
  LEADERBOARD_NAME_LIMIT,
  readLeaderboardEntry,
  scoreboards,
  type LeaderboardEntry,
  type Scoreboard,
} from "../../shared/leaderboard";
import { Icon } from "./Icon";
import "./leaderboard.css";

const boards = Object.keys(scoreboards) as Scoreboard[];

export function Leaderboard({
  onClose,
  initialBoard = "rowing-sprint",
}: {
  onClose: () => void;
  initialBoard?: Scoreboard;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const nameId = useId();
  const [board, setBoard] = useState<Scoreboard>(initialBoard);
  const [shared, setShared] = useState<LeaderboardEntry[] | null>();
  const [local, setLocal] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const pending = readPendingRun(board);
  const showLocal = local || shared === null;
  const entries = showLocal ? readLocalLeaderboard(board) : shared;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLeaderboard(board, controller.signal).then((entries) => {
      if (!controller.signal.aborted) setShared(entries);
    });
    return () => controller.abort();
  }, [board]);

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || posting) return;
    const entry = readLeaderboardEntry({ ...pending, name });
    if (!entry) {
      setMessage("Enter a display name.");
      return;
    }
    closeButton.current?.focus();
    setPosting(true);
    setMessage("");
    try {
      const destination = showLocal
        ? "local"
        : await submitLeaderboardEntry(entry);
      saveLocalLeaderboardEntry(entry);
      if (destination === "shared") {
        const updated = await fetchLeaderboard(board);
        if (updated) setShared(updated);
        else setLocal(true);
        setMessage("Score posted.");
      } else {
        setLocal(true);
        setMessage(
          readLocalLeaderboard(board).some((item) => item.id === entry.id)
            ? "Saved locally."
            : "Outside the local top 10.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not post score.",
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="game-modal leaderboard"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="leaderboard-header">
        <h2 id={titleId}>Leaderboard</h2>
        <button
          ref={closeButton}
          className="close-button"
          type="button"
          aria-label="Close leaderboard"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <label className="leaderboard-picker">
        Event
        <select
          value={board}
          disabled={posting}
          onChange={(event) => {
            setShared(undefined);
            setBoard(event.currentTarget.value as Scoreboard);
            setMessage("");
          }}
        >
          {boards.map((key) => (
            <option key={key} value={key}>
              {scoreboards[key].label}
            </option>
          ))}
        </select>
      </label>
      <div className="leaderboard-caption">
        <span>
          {showLocal
            ? "Local scores"
            : shared
              ? "Shared · unverified"
              : "Connecting…"}
        </span>
        {shared && (
          <button
            type="button"
            className="quiet-button"
            disabled={posting}
            onClick={() => {
              setLocal((value) => !value);
              setMessage("");
            }}
          >
            {showLocal ? "Shared scores" : "Local scores"}
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {!entries?.length ? (
            <tr>
              <td colSpan={3} className="leaderboard-empty">
                {entries ? "No scores yet." : "Loading scores…"}
              </td>
            </tr>
          ) : (
            entries.map((entry, index) => (
              <tr key={entry.id}>
                <td>{String(index + 1).padStart(2, "0")}</td>
                <td>{entry.name}</td>
                <td>{formatLeaderboardScore(entry.board, entry.score)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pending ? (
        <form className="leaderboard-submit" onSubmit={post}>
          <p>Your score · {formatLeaderboardScore(board, pending.score)}</p>
          <label htmlFor={nameId} className="leaderboard-sr-only">
            Display name
          </label>
          <div>
            <input
              id={nameId}
              placeholder="Display name"
              maxLength={LEADERBOARD_NAME_LIMIT}
              value={name}
              required
              disabled={posting}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <button
              className="primary-button"
              disabled={posting || !entries}
              type="submit"
            >
              {posting ? "Saving…" : showLocal ? "Save" : "Post score"}
            </button>
          </div>
        </form>
      ) : (
        !message && (
          <p className="leaderboard-instruction">
            {scoreboards[board].instruction}
          </p>
        )
      )}
      {message && (
        <p className="leaderboard-instruction" role="status">
          {message}
        </p>
      )}
    </dialog>
  );
}
