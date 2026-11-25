// Shared YouTube helpers for the theater catalog scripts (Node 22, no deps).
//
// Run with NODE_USE_ENV_PROXY=1 behind the agent proxy, otherwise fetch fails
// with ENOTFOUND. Every request goes through get(), which throttles to about
// one request per second per process and retries 403/429/5xx/network errors.
//
// Watch pages (/watch?v=) redirect to a captcha from this egress, so video
// facts come from the embed page (embedInfo) and oEmbed instead.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// The embed endpoint answers "Error 152 - 4 / This video is unavailable" for
// EVERY video when the Referer is youtube.com itself, and "Video player
// configuration error" with no Referer. A neutral third-party page is what a
// real embedding site looks like, so that is the default.
export const EMBED_REFERER = process.env.THEATER_EMBED_REFERER || "https://example.com/";

const MIN_GAP_MS = Number(process.env.THEATER_GAP_MS || 1000);
let nextSlot = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await sleep(wait);
}

/**
 * GET a URL as text. Throttled, 3 retries with 3–4 s backoff on
 * 403/429/5xx/network errors. Returns { status, text, url }.
 * Other non-2xx statuses (401, 404, …) are returned, not thrown.
 */
export async function get(url, { referer, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt) await sleep(3000 + Math.random() * 1000);
    await throttle();
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          // Skip the EU consent interstitial.
          Cookie: "CONSENT=YES+1; SOCS=CAI",
          ...(referer ? { Referer: referer } : {}),
          ...headers,
        },
      });
      const text = await res.text();
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        lastErr.status = res.status;
        continue;
      }
      return { status: res.status, text, url: res.url };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Read a JS string literal starting at text[start] === '"'. */
function readStringLiteral(text, start) {
  let j = start + 1;
  for (let esc = false; j < text.length; j++) {
    const c = text[j];
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === '"') break;
  }
  return JSON.parse(text.slice(start, j + 1));
}

/** Read a balanced JSON object starting at text[start] === '{'. */
function readJsonObject(text, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, j + 1));
  }
  throw new Error("unterminated JSON object");
}

/** Parse `var ytInitialData = {...};` out of a youtube.com page. */
export function ytData(html) {
  const m = /(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*/.exec(html);
  if (!m) return null;
  const start = html.indexOf("{", m.index + m[0].length - 1);
  try {
    return readJsonObject(html, start);
  } catch {
    // Fallback for the classic `= {...};</script>` shape.
    const end = html.indexOf(";</script>", start);
    return end > 0 ? JSON.parse(html.slice(start, end)) : null;
  }
}

/** Depth-first walk yielding every object that has `key`. */
export function* findAll(node, key) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const v of node) yield* findAll(v, key);
    return;
  }
  if (key in node) yield node[key];
  for (const v of Object.values(node)) yield* findAll(v, key);
}
const first = (node, key) => findAll(node, key).next().value;

export const text = (t) =>
  !t ? "" : typeof t === "string" ? t : t.simpleText ?? t.content ?? (t.runs || []).map((r) => r.text).join("");

/** "1:02:03" / "12:34" → seconds. */
export function parseClock(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(?:(\d+):)?(\d+):(\d{2})$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}

const CHANNEL_RE = /\/channel\/(UC[\w-]{22})/;

function channelFromNav(nav) {
  if (!nav) return null;
  const id = nav.browseEndpoint?.browseId;
  if (id && /^UC[\w-]{22}$/.test(id)) return id;
  const url = nav.commandMetadata?.webCommandMetadata?.url;
  return url?.match(CHANNEL_RE)?.[1] ?? null;
}

function fromVideoRenderer(v) {
  const owner = v.ownerText?.runs?.[0] || v.longBylineText?.runs?.[0] || v.shortBylineText?.runs?.[0];
  return {
    id: v.videoId,
    title: text(v.title),
    seconds: parseClock(text(v.lengthText)),
    channel: owner?.text ?? null,
    channelId: channelFromNav(owner?.navigationEndpoint),
    views: text(v.viewCountText) || null,
    published: text(v.publishedTimeText) || null,
  };
}

function fromLockup(l) {
  if (l.contentType && l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
  const id = l.contentId;
  const meta = l.metadata?.lockupMetadataViewModel;
  let seconds = null;
  for (const b of findAll(l.contentImage, "thumbnailBadgeViewModel")) {
    seconds ??= parseClock(b.text);
  }
  // In playlists/search the first metadata row is the channel (with a
  // browseEndpoint); on a channel's own tab it is just views · age.
  let channel = null;
  let channelId = null;
  const parts = [];
  for (const row of meta?.metadata?.contentMetadataViewModel?.metadataRows ?? []) {
    for (const p of row.metadataParts ?? []) {
      const ep = first(p?.text?.commandRuns, "browseEndpoint");
      if (!channelId && ep?.browseId?.startsWith("UC")) {
        channelId = ep.browseId;
        channel = p.text.content;
      } else if (p?.text?.content) parts.push(p.text.content);
    }
  }
  if (!channelId) {
    const ep = first(meta?.image, "browseEndpoint");
    if (ep?.browseId?.startsWith("UC")) channelId = ep.browseId;
  }
  return { id, title: meta?.title?.content ?? "", seconds, channel, channelId, views: parts[0] ?? null, published: parts[1] ?? null };
}

/** Extract video tiles from any browse/search ytInitialData tree. */
export function videosFromData(data) {
  const out = new Map();
  for (const v of findAll(data, "videoRenderer")) if (v?.videoId) out.set(v.videoId, fromVideoRenderer(v));
  for (const v of findAll(data, "gridVideoRenderer")) if (v?.videoId) out.set(v.videoId, fromVideoRenderer(v));
  for (const l of findAll(data, "lockupViewModel")) {
    const v = l && fromLockup(l);
    if (v?.id && !out.has(v.id)) out.set(v.id, v);
  }
  return [...out.values()];
}

/** Channel header facts from a channel page's ytInitialData. */
export function channelHeader(data) {
  const md = data?.metadata?.channelMetadataRenderer;
  const header = data?.header;
  const flat = JSON.stringify(header ?? {});
  const subs =
    flat.match(/"content":"([\d.,]+[KMB]? subscribers?)"/)?.[1] ||
    text(header?.c4TabbedHeaderRenderer?.subscriberCountText) ||
    null;
  const verified =
    /BADGE_STYLE_TYPE_VERIFIED|CHECK_CIRCLE_FILLED|AUDIO_BADGE|OFFICIAL_ARTIST_BADGE|"Verified"/.test(flat) || false;
  return {
    title: md?.title ?? text(header?.pageHeaderRenderer?.pageTitle) ?? null,
    id: md?.externalId ?? null,
    url: md?.vanityChannelUrl ?? md?.channelUrl ?? null,
    subscribers: subs,
    verified,
  };
}

const handlePath = (h) => (h.startsWith("UC") ? `channel/${h}` : h.startsWith("@") ? h : `@${h}`);

/** Uploads tab of a channel (first page, ~30 videos). Returns { channel, videos }. */
export async function listVideos(handle, tab = "videos") {
  const res = await get(`https://www.youtube.com/${handlePath(handle)}/${tab}`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${handle}/${tab}`);
  const data = ytData(res.text);
  const channel = channelHeader(data);
  const videos = videosFromData(data).map((v) => ({ ...v, channel: v.channel ?? channel.title, channelId: v.channelId ?? channel.id }));
  return { channel, videos };
}

/** Playlists tab of a channel. Returns { channel, playlists: [{ id, title, count }] }. */
export async function listPlaylists(handle) {
  const res = await get(`https://www.youtube.com/${handlePath(handle)}/playlists`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${handle}/playlists`);
  const data = ytData(res.text);
  const out = new Map();
  for (const p of findAll(data, "gridPlaylistRenderer")) {
    if (p?.playlistId) out.set(p.playlistId, { id: p.playlistId, title: text(p.title), count: text(p.videoCountText) || null });
  }
  for (const l of findAll(data, "lockupViewModel")) {
    if (!l?.contentId || !/PLAYLIST|PODCAST/.test(l.contentType || "")) continue;
    const meta = l.metadata?.lockupMetadataViewModel;
    let count = null;
    for (const b of findAll(l.contentImage, "thumbnailBadgeViewModel")) count ??= b.text;
    out.set(l.contentId, { id: l.contentId, title: meta?.title?.content ?? "", count });
  }
  return { channel: channelHeader(data), playlists: [...out.values()] };
}

/** First page (≤100) of a playlist. Returns { title, owner, videos }. */
export async function playlistVideos(listId) {
  const res = await get(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for playlist ${listId}`);
  const data = ytData(res.text);
  const videos = [];
  for (const v of findAll(data, "playlistVideoRenderer")) {
    if (!v?.videoId) continue;
    const owner = v.shortBylineText?.runs?.[0];
    videos.push({
      id: v.videoId,
      title: text(v.title),
      seconds: v.lengthSeconds ? Number(v.lengthSeconds) : parseClock(text(v.lengthText)),
      channel: owner?.text ?? null,
      channelId: channelFromNav(owner?.navigationEndpoint),
      playable: v.isPlayable !== false,
    });
  }
  const md = data?.metadata?.playlistMetadataRenderer;
  const header = data?.header;
  const ownerEp = first(header, "browseEndpoint");
  const ownerText = text(header?.playlistHeaderRenderer?.ownerText) ||
    (JSON.stringify(header ?? {}).match(/"content":"by ([^"]+)"/)?.[1] ?? null);
  return {
    title: md?.title ?? text(header?.playlistHeaderRenderer?.title) ?? header?.pageHeaderRenderer?.pageTitle ?? null,
    owner: ownerText,
    ownerId: ownerEp?.browseId?.startsWith("UC") ? ownerEp.browseId : null,
    videos: (videos.length ? videos : videosFromData(data)).slice(0, 100),
  };
}

/** YouTube search results (first page, videos only, with owner channel ID). */
export async function search(query) {
  const res = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for search`);
  const data = ytData(res.text);
  const vr = [...findAll(data, "videoRenderer")].filter((v) => v?.videoId).map(fromVideoRenderer);
  return vr.length ? vr : videosFromData(data);
}

function embeddedPlayerResponse(html) {
  const key = '"embedded_player_response":"';
  const i = html.indexOf(key);
  if (i < 0) return null;
  try {
    return JSON.parse(readStringLiteral(html, i + key.length - 1));
  } catch {
    return null;
  }
}

/**
 * Embed-page facts for one video:
 * { status, reason, channelId, channel, seconds, title, playableInEmbed }.
 *
 * status is the embed's previewPlayabilityStatus.status: OK, UNPLAYABLE
 * (embedding disabled, geo-blocked), LOGIN_REQUIRED (age-gated), ERROR
 * (removed / private / bad request), or FETCH_ERROR / PARSE_ERROR.
 *
 * channelId is the owner's ID from the overlay's channelThumbnailEndpoint
 * (falling back to the expanded/collapsed overlay endpoints). The page also
 * carries random base64 that looks like UC… ids, so we never grep blindly.
 */
export async function embedInfo(id, { referer = EMBED_REFERER } = {}) {
  let res;
  try {
    res = await get(`https://www.youtube.com/embed/${id}?hl=en`, { referer });
  } catch (err) {
    return { status: "FETCH_ERROR", reason: String(err.message || err), channelId: null, channel: null, seconds: null, title: null };
  }
  const epr = embeddedPlayerResponse(res.text);
  if (!epr) return { status: "PARSE_ERROR", reason: `HTTP ${res.status}, no embedded_player_response`, channelId: null, channel: null, seconds: null, title: null };
  const ps = epr.previewPlayabilityStatus || {};
  const preview = epr.embedPreview?.thumbnailPreviewRenderer || {};
  const overlay = preview.videoDetails?.embeddedPlayerOverlayVideoDetailsRenderer || {};
  const channelId =
    channelFromNav(overlay.channelThumbnailEndpoint) ||
    channelFromNav(first(overlay.expandedRenderer, "navigationEndpoint")) ||
    null;
  const seconds = preview.videoDurationSeconds ?? first(epr.embedPreview, "videoDurationSeconds");
  const reason = ps.reason || text(first(ps.errorScreen, "title")) || null;
  const subreason = text(first(ps.errorScreen, "description")) || text(first(ps.errorScreen, "subreason")) || null;
  return {
    status: ps.status || "UNKNOWN",
    reason: subreason && subreason !== reason ? `${reason} (${subreason})` : reason,
    playableInEmbed: ps.playableInEmbed ?? null,
    channelId,
    channel: text(overlay.expandedRenderer?.embeddedPlayerOverlayVideoDetailsExpandedRenderer?.title) || null,
    seconds: seconds != null ? Number(seconds) : null,
    title: text(preview.title) || null,
  };
}

/**
 * Classify an embedInfo result: OK | GEO | AGE | EMBED_DISABLED | GONE | UNKNOWN.
 */
export function embedClass(info) {
  if (info.status === "OK") return "OK";
  const r = `${info.reason || ""}`.toLowerCase();
  if (info.status === "LOGIN_REQUIRED" || /age|sign in to confirm your age|inappropriate/.test(r)) return "AGE";
  if (/country|region|not available in your|geo/.test(r)) return "GEO";
  if (/embed|playback on other websites|disabled by the (video )?owner|watch on youtube/.test(r)) return "EMBED_DISABLED";
  if (/unavailable|private|removed|deleted|terminated|does not exist|no longer available|copyright/.test(r)) return "GONE";
  return "UNKNOWN";
}

/**
 * oEmbed lookup. { status: 200|401|404|…, title, author, authorUrl, width, height, landscape }.
 * 401 = embedding disabled, 404 = gone/private. width < height means a Short.
 */
export async function oembed(id) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  let res;
  try {
    res = await get(url);
  } catch (err) {
    return { status: err.status ?? 0, error: String(err.message || err) };
  }
  if (res.status !== 200) return { status: res.status };
  try {
    const o = JSON.parse(res.text);
    return {
      status: 200,
      title: o.title,
      author: o.author_name,
      authorUrl: o.author_url,
      width: o.width,
      height: o.height,
      landscape: o.width >= o.height,
    };
  } catch {
    return { status: -1, error: "bad JSON" };
  }
}

export const fmtSeconds = (s) =>
  s == null ? "?" : `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Duration limits (seconds) per TheaterFilm kind. */
export const KIND_LIMITS = {
  Trailer: [30, 330],
  "Short film": [60, 1500],
  "Full episode": [360, Infinity],
  "Full movie": [2400, Infinity],
};
