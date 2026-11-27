import { useEffect, useRef, useState, type FormEvent } from "react";
import { GameControls } from "./InteriorProps";
import { keys, touch } from "../core/input";
import { runtime } from "../core/store";
import {
  localShelf,
  writingDraftSession,
  type LocalPiece,
} from "../core/writingDraft";
import {
  WRITING_LIMITS,
  validateWriting,
  type WritingDraft,
  type WritingPost,
} from "../../shared/writing";
import { ApiUnavailable, apiUrl, readJson } from "../../shared/api";
import { useApiAvailable } from "../ui/useApiAvailable";
import "./writing-room.css";

const tokensKey = "joshua-writing-tokens-v1";
const blank = { title: "", author: "", body: "" };
/** Shown on the Read tab whenever there is no shared shelf to read. */
export const OFFLINE_LINE =
  "The shared shelf is offline. What you write stays on this device.";
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function postId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** A failure with copy written for visitors (never a raw error message). */
class WritingFailure extends Error {}
function failureCopy(status: number) {
  if (status === 429) return "That’s a lot of posting. Try again in a little while.";
  if (status === 400 || status === 413)
    return "Check the name, title and text, then try again.";
  if (status === 401 || status === 403 || status === 404)
    return "That post can’t be changed from here.";
  return "Couldn’t reach the shelf. Your draft is kept.";
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(apiUrl(`/api/writing${path}`), {
      ...init,
      signal: controller.signal,
    });
    // 503: the Worker exists but its database does not; same as offline.
    if (response.status === 503) throw new ApiUnavailable();
    const data = await readJson<T>(response);
    if (!response.ok) throw new WritingFailure(failureCopy(response.status));
    return data;
  } catch (error) {
    if (error instanceof ApiUnavailable || error instanceof WritingFailure)
      throw error;
    throw new WritingFailure("Connection lost. Your draft is kept.");
  } finally {
    clearTimeout(timeout);
  }
}
const visitorCopy = (error: unknown) =>
  error instanceof WritingFailure
    ? error.message
    : "Couldn’t reach the shelf. Your draft is kept.";

function WritingDialog({
  close,
  draft,
  setDraft,
  draftStored,
  online,
}: {
  close: () => void;
  draft: WritingDraft;
  setDraft: (draft: WritingDraft) => void;
  draftStored: boolean;
  /** null while the backend probe runs. */
  online: boolean | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Offline once the probe says so, or as soon as a request proves it.
  const [lostShelf, setLostShelf] = useState(false);
  const local = online === false || lostShelf;
  const [posts, setPosts] = useState<WritingPost[]>([]);
  const [pieces, setPieces] = useState<LocalPiece[]>(localShelf.list);
  const [selected, setSelected] = useState<WritingPost | LocalPiece | null>(
    null,
  );
  const [mode, setMode] = useState<"read" | "write">(
    online === false ? "write" : "read",
  );
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(online !== false);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [stored, setStored] = useState(true);
  const deleteTokens = useRef<Record<string, string>>(readLocal(tokensKey, {}));
  const pending = useRef<{ id: string; deleteToken: string } | null>(null);
  const alive = useRef(true);
  function goLocal() {
    setLostShelf(true);
    setError("");
    setLoading(false);
    setPosts([]);
    setNext(null);
    setSelected(null);
  }
  async function load(cursor?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ posts: WritingPost[]; next: string | null }>(
        cursor ? `?before=${encodeURIComponent(cursor)}` : "",
      );
      if (!alive.current) return;
      const list = Array.isArray(result?.posts) ? result.posts : [];
      setPosts((old) => (cursor ? [...old, ...list] : list));
      setNext(typeof result?.next === "string" ? result.next : null);
      if (!cursor)
        setSelected(
          (old) => list.find((p) => p.id === old?.id) ?? list[0] ?? null,
        );
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiUnavailable) goLocal();
      else setError(visitorCopy(error));
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    keys.clear();
    touch.x = 0;
    touch.z = 0;
    runtime.path = [];
    runtime.target = null;
    // Removing the focused post/button can leave focus on the document body.
    // Catch Escape before the game's window listener, regardless of focus;
    // a modal's other keys must never become movement or interaction inputs.
    const escape = (event: KeyboardEvent) => {
      // Escape cancels an IME candidate before it dismisses the dialog.
      // Some browsers report composition only through the legacy 229 code.
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229)
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const contain = (event: KeyboardEvent) => event.stopPropagation();
    window.addEventListener("keydown", escape, true);
    document.addEventListener("keydown", contain);
    document.addEventListener("keyup", contain);
    return () => {
      alive.current = false;
      keys.clear();
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("keydown", contain);
      document.removeEventListener("keyup", contain);
    };
  }, []);
  // The shared shelf loads only once the probe has said it exists.
  useEffect(() => {
    if (online === true) void load();
    else if (online === false) setLoading(false);
  }, [online]);
  function change(key: keyof WritingDraft, value: string) {
    pending.current = null;
    setDraft({ ...draft, [key]: value });
    setStatus("");
  }
  function rememberToken(id: string, token: string) {
    deleteTokens.current = {
      ...readLocal<Record<string, string>>(tokensKey, {}),
      ...deleteTokens.current,
      [id]: token,
    };
    try {
      localStorage.setItem(tokensKey, JSON.stringify(deleteTokens.current));
    } catch {
      setStored(false);
    }
  }
  function keepLocally() {
    const clean = validateWriting(draft);
    if (!clean) return;
    const piece = localShelf.add(clean);
    setPieces(localShelf.list());
    setSelected(piece);
    setMode("read");
    setDraft({ ...blank, author: draft.author });
    setStatus(
      localShelf.isStored()
        ? "Kept on this device."
        : "Kept until you close this tab (this browser blocks saving).",
    );
  }
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (busy || !validateWriting(draft)) return;
    if (local) return keepLocally();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      pending.current ??= { id: postId(), deleteToken: secret() };
      rememberToken(pending.current.id, pending.current.deleteToken);
      const { post } = await api<{ post: WritingPost }>("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, ...pending.current }),
      });
      if (!alive.current) return;
      setPosts((old) => [post, ...old.filter((p) => p.id !== post.id)]);
      setSelected(post);
      setMode("read");
      setDraft({ ...blank, author: draft.author });
      pending.current = null;
      setStatus("Published.");
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiUnavailable) {
        // The shelf vanished mid-session: keep the piece here instead.
        goLocal();
        keepLocally();
      } else setError(visitorCopy(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function removePost(post: WritingPost) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${post.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${deleteTokens.current[post.id]}` },
      });
      if (!alive.current) return;
      setPosts((old) => old.filter((p) => p.id !== post.id));
      setSelected(null);
      setStatus("Post removed.");
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiUnavailable) goLocal();
      else setError(visitorCopy(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function removePiece(piece: LocalPiece) {
    localShelf.remove(piece.id);
    setPieces(localShelf.list());
    setSelected(null);
    setStatus("Removed from this device.");
  }
  const notice = [
    error || status,
    !stored || !draftStored ? "Your draft lasts until you reload." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const shown: (WritingPost | LocalPiece)[] = local ? pieces : posts;
  const isPiece = (p: WritingPost | LocalPiece | null): p is LocalPiece =>
    !!p && "savedAt" in p;
  return (
    <dialog
      ref={dialog}
      className="writing-dialog"
      data-shelf={local ? "local" : online ? "shared" : "checking"}
      aria-labelledby="writing-heading"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="writing-frame">
        <header className="writing-header">
          <h2 id="writing-heading">Writing room</h2>
          <button type="button" aria-label="Close writing room" onClick={close}>
            ×
          </button>
        </header>
        <nav className="writing-toolbar" aria-label="Writing room views">
          <button
            type="button"
            aria-pressed={mode === "read"}
            onClick={() => setMode("read")}
          >
            Read
          </button>
          <button
            type="button"
            aria-pressed={mode === "write"}
            onClick={() => setMode("write")}
          >
            Write
          </button>
          {online === true && !local && (
            <button
              type="button"
              className="writing-refresh"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              Refresh
            </button>
          )}
        </nav>
        {notice && (
          <p className="writing-notice" role={error ? "alert" : "status"}>
            {notice}
          </p>
        )}
        {mode === "read" ? (
          <div className={`writing-reader ${selected ? "has-selection" : ""}`}>
            <aside
              className="writing-list"
              aria-label={local ? "Your writing on this device" : "Public writing"}
            >
              {local ? (
                <p className="writing-offline">{OFFLINE_LINE}</p>
              ) : loading && !posts.length ? (
                <p role="status">Opening the shelf…</p>
              ) : !posts.length && !error ? (
                <p>No posts yet. Write the first one.</p>
              ) : null}
              {shown.map((post) => (
                <button
                  type="button"
                  key={post.id}
                  className="writing-post-link"
                  aria-current={selected?.id === post.id ? "true" : undefined}
                  onClick={() => setSelected(post)}
                >
                  <strong>{post.title}</strong>
                  <span>{post.author}</span>
                </button>
              ))}
              {!local && next && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load(next)}
                >
                  {loading ? "Loading…" : "Older posts"}
                </button>
              )}
            </aside>
            <article className="writing-page" aria-label="Selected writing">
              {selected ? (
                <>
                  <button
                    type="button"
                    className="writing-back"
                    onClick={() => setSelected(null)}
                  >
                    {local ? "Your pieces" : "All posts"}
                  </button>
                  <h3>{selected.title}</h3>
                  <p className="writing-byline">
                    {selected.author}{" "}
                    <time
                      dateTime={new Date(
                        isPiece(selected) ? selected.savedAt : selected.createdAt,
                      ).toISOString()}
                    >
                      {new Date(
                        isPiece(selected) ? selected.savedAt : selected.createdAt,
                      ).toLocaleDateString()}
                    </time>
                    {isPiece(selected) && <span>On this device</span>}
                  </p>
                  <p className="writing-body">{selected.body}</p>
                  {isPiece(selected) ? (
                    <details className="writing-remove">
                      <summary>Remove from this device</summary>
                      <button type="button" onClick={() => removePiece(selected)}>
                        Remove
                      </button>
                    </details>
                  ) : (
                    deleteTokens.current[selected.id] && (
                      <details className="writing-remove">
                        <summary>Remove my post</summary>
                        <p>This removes it for everyone.</p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removePost(selected)}
                        >
                          Remove permanently
                        </button>
                      </details>
                    )
                  )}
                </>
              ) : shown.length ? (
                <p>Choose a piece to read.</p>
              ) : local ? (
                <button
                  type="button"
                  className="writing-start"
                  onClick={() => setMode("write")}
                >
                  Write something
                </button>
              ) : null}
            </article>
          </div>
        ) : (
          <form className="writing-compose" onSubmit={publish}>
            <div className="writing-fields">
              <label>
                Name
                <input
                  autoComplete="nickname"
                  value={draft.author}
                  maxLength={WRITING_LIMITS.author}
                  required
                  disabled={busy}
                  onChange={(e) => change("author", e.target.value)}
                />
              </label>
              <label>
                Title
                <input
                  value={draft.title}
                  maxLength={WRITING_LIMITS.title}
                  required
                  disabled={busy}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
            </div>
            <label className="writing-text-label">
              Your writing
              <textarea
                value={draft.body}
                maxLength={WRITING_LIMITS.body}
                rows={10}
                required
                disabled={busy}
                onChange={(e) => change("body", e.target.value)}
              />
            </label>
            <footer>
              <span>
                {draft.body.length.toLocaleString()} / 6,000
                {local ? " · saved as you type, on this device" : ""}
              </span>
              <button
                type="submit"
                disabled={busy || online === null || !validateWriting(draft)}
              >
                {local
                  ? "Keep on this device"
                  : busy
                    ? "Publishing…"
                    : "Publish"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </dialog>
  );
}

export function WritingRoomControls() {
  const [open, setOpen] = useState(false);
  // Probe as soon as the room is entered, so the dialog opens in its
  // final mode (shared shelf or this device) without a flash.
  const online = useApiAvailable();
  // This owner stays mounted when pause hides GameControls' separate Html root.
  const [draft, setDraft] = useState(writingDraftSession.read);
  const [draftStored, setDraftStored] = useState(writingDraftSession.isStored);
  const updateDraft = (next: WritingDraft) => {
    setDraftStored(writingDraftSession.write(next));
    setDraft(next);
  };
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        setDraft(writingDraftSession.read());
        setDraftStored(writingDraftSession.isStored());
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <GameControls name="Writing room" position={[6, 0.6, 5]}>
      <button
        type="button"
        ref={trigger}
        onClick={() => {
          setDraft(writingDraftSession.read());
          setDraftStored(writingDraftSession.isStored());
          setOpen(true);
        }}
      >
        Read / Write
      </button>
      {open && (
        <WritingDialog
          close={close}
          draft={draft}
          setDraft={updateDraft}
          draftStored={draftStored}
          online={online}
        />
      )}
    </GameControls>
  );
}
