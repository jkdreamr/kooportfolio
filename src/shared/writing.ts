export const WRITING_LIMITS = { title: 80, author: 32, body: 6000 } as const;
export type WritingPost = {
  id: string;
  title: string;
  author: string;
  body: string;
  createdAt: number;
};
export type WritingDraft = Pick<WritingPost, "title" | "author" | "body">;
export function validateWriting(value: unknown): WritingDraft | null {
  if (!value || typeof value !== "object") return null;
  const post = value as Record<string, unknown>;
  const clean: Record<string, string> = {};
  for (const key of ["title", "author", "body"] as const) {
    if (typeof post[key] !== "string") return null;
    const text = post[key].trim().replace(/\r\n?/g, "\n");
    if (
      !text ||
      text.length > WRITING_LIMITS[key] ||
      Array.from(text).some((char) => {
        const code = char.charCodeAt(0);
        return (code < 32 && code !== 9 && code !== 10) || code === 127;
      })
    )
      return null;
    clean[key] = text;
  }
  return clean as WritingDraft;
}

// ── Public text: a first, client-side filter (the server must check too) ──
/** Words kept out of the public wall and shelf, ROT13 so the source stays
 * readable. Matched as whole words after undoing common letter swaps. */
const BLOCKED_ROT13 = [
  "shpx", "fuvg", "phag", "ovgpu", "nffubyr", "qvpx", "chffl", "fyhg", "jubber",
  "onfgneq", "zbgureshpxre", "snttbg", "snt", "avttre", "avttn", "ergneq", "pbpx",
  "jnaxre", "gjng", "qbhpur", "xvxr", "fcvp", "puvax", "erggneq", "encr", "encvfg",
];
const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const BLOCKED = new Set(BLOCKED_ROT13.map(rot13));
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };
/** Plural and verb forms of a blocked stem count too ("…s", "…ed", "…ing"). */
const stems = (word: string) => [word, word.replace(/(ing|ers|er|ed|es|s)$/, "")];

/** Links of any kind: schemes, www., and bare domains like name.com. */
const LINK =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}(?:\.|\s?\(dot\)\s?|\s?\[dot\]\s?)(?:com|net|org|io|co|xyz|app|dev|me|gg|ly|ru|cn|info|biz|tk|link|site|online|shop|tv)\b/i;

export type TextCheck = { ok: true } | { ok: false; reason: "link" | "language" };

export function checkPublicText(text: string): TextCheck {
  if (LINK.test(text)) return { ok: false, reason: "link" };
  const normal = text
    .toLowerCase()
    .replace(/[01345@$!7]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, "$1$1");
  for (const word of normal.split(/[^a-z]+/))
    if (word && stems(word).some((w) => BLOCKED.has(w))) return { ok: false, reason: "language" };
  // Letters spaced out to dodge the filter: "f u c k".
  const squeezed = normal.replace(/\b([a-z])\s(?=[a-z]\b)/g, "$1");
  for (const word of squeezed.split(/[^a-z]+/))
    if (word.length > 3 && BLOCKED.has(word)) return { ok: false, reason: "language" };
  return { ok: true };
}

/** Visitor-facing copy for a failed check. */
export const textCheckCopy = (reason: "link" | "language") =>
  reason === "link"
    ? "Links can’t go on the public wall. Take it out and try again."
    : "Let’s keep the shared space friendly. Try different words.";

// ── Cooldown between public posts (per browser; the server limits too) ──
export const POST_COOLDOWN_MS = 60_000;
export type PostKind = "writing" | "booth";
const cooldownKey = "joshua-post-cooldown-v1";
type CooldownStorage = Pick<Storage, "getItem" | "setItem">;

function readCooldowns(storage: () => CooldownStorage): Partial<Record<PostKind, number>> {
  try {
    const raw: unknown = JSON.parse(storage().getItem(cooldownKey) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Partial<Record<PostKind, number>>) : {};
  } catch {
    return memoryCooldowns;
  }
}
let memoryCooldowns: Partial<Record<PostKind, number>> = {};

/** Milliseconds until another post of this kind is allowed (0 = now). */
export function cooldownLeft(
  kind: PostKind,
  now = Date.now(),
  storage: () => CooldownStorage = () => localStorage,
): number {
  const last = readCooldowns(storage)[kind];
  if (typeof last !== "number" || last > now) return 0;
  return Math.max(0, last + POST_COOLDOWN_MS - now);
}

export function notePost(
  kind: PostKind,
  now = Date.now(),
  storage: () => CooldownStorage = () => localStorage,
): void {
  const next = { ...readCooldowns(storage), [kind]: now };
  memoryCooldowns = next;
  try {
    storage().setItem(cooldownKey, JSON.stringify(next));
  } catch {
    /* Blocked storage: the cooldown lasts for this page. */
  }
}

export const cooldownCopy = (ms: number) =>
  `One moment: you can post again in ${Math.max(1, Math.ceil(ms / 1000))} s.`;
