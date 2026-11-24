import { useEffect, useRef, useState, type FormEvent } from "react";
import { GameControls } from "./InteriorProps";
import { keys, touch } from "../core/input";
import { runtime } from "../core/store";
import { writingDraftSession } from "../core/writingDraft";
import {
  WRITING_LIMITS,
  validateWriting,
  type WritingDraft,
  type WritingPost,
} from "../../shared/writing";
import "./writing-room.css";

const tokensKey = "joshua-writing-tokens-v1";
const blank = { title: "", author: "", body: "" };
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
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/writing${path}`, {
      ...init,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        response.status === 503
          ? "Public writing unavailable."
          : (data.error ?? "Couldn’t load the writing room."),
      );
    return data as T;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name !== "AbortError" &&
      !(error instanceof TypeError)
    )
      throw error;
    throw new Error("Connection lost. Draft kept.");
  } finally {
    clearTimeout(timeout);
  }
}

function WritingDialog({
  close,
  draft,
  setDraft,
  draftStored,
}: {
  close: () => void;
  draft: WritingDraft;
  setDraft: (draft: WritingDraft) => void;
  draftStored: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [posts, setPosts] = useState<WritingPost[]>([]);
  const [selected, setSelected] = useState<WritingPost | null>(null);
  const [mode, setMode] = useState<"read" | "write">("read");
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [stored, setStored] = useState(true);
  const deleteTokens = useRef<Record<string, string>>(readLocal(tokensKey, {}));
  const pending = useRef<{ id: string; deleteToken: string } | null>(null);
  const alive = useRef(true);
  async function load(cursor?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ posts: WritingPost[]; next: string | null }>(
        cursor ? `?before=${encodeURIComponent(cursor)}` : "",
      );
      if (!alive.current) return;
      setPosts((old) => (cursor ? [...old, ...result.posts] : result.posts));
      setNext(result.next);
      if (!cursor)
        setSelected(
          (old) =>
            result.posts.find((p) => p.id === old?.id) ??
            result.posts[0] ??
            null,
        );
    } catch (error) {
      if (alive.current) setError((error as Error).message);
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
    void load();
    return () => {
      alive.current = false;
      keys.clear();
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("keydown", contain);
      document.removeEventListener("keyup", contain);
    };
  }, []);
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
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (busy || !validateWriting(draft)) return;
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
      if (alive.current) setError((error as Error).message);
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
      if (alive.current) setError((error as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const notice = [
    error || status,
    !stored || !draftStored ? "Draft lasts until reload." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <dialog
      ref={dialog}
      className="writing-dialog"
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
          <button
            type="button"
            className="writing-refresh"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </nav>
        {notice && (
          <p className="writing-notice" role={error ? "alert" : "status"}>
            {notice}
          </p>
        )}
        {mode === "read" ? (
          <div className={`writing-reader ${selected ? "has-selection" : ""}`}>
            <aside className="writing-list" aria-label="Public writing">
              {loading && !posts.length ? (
                <p role="status">Loading…</p>
              ) : !posts.length && !error ? (
                <p>No posts yet. Write the first one.</p>
              ) : null}
              {posts.map((post) => (
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
              {next && (
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
                    All posts
                  </button>
                  <h3>{selected.title}</h3>
                  <p className="writing-byline">
                    {selected.author}{" "}
                    <time dateTime={new Date(selected.createdAt).toISOString()}>
                      {new Date(selected.createdAt).toLocaleDateString()}
                    </time>
                  </p>
                  <p className="writing-body">{selected.body}</p>
                  {deleteTokens.current[selected.id] && (
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
                  )}
                </>
              ) : posts.length ? (
                <p>Choose a post.</p>
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
              <span>{draft.body.length.toLocaleString()} / 6,000</span>
              <button type="submit" disabled={busy || !validateWriting(draft)}>
                {busy ? "Publishing…" : "Publish"}
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
        />
      )}
    </GameControls>
  );
}
