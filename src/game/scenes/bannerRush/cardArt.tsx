/**
 * Card portraits and emote faces (§3.6): inline SVG in the village's chunky
 * rounded style. `var(--team)` is the owner's colour. No canvas capture.
 */
import type { ReactNode } from "react";
import type { CardId } from "../../core/bannerRush/cards";

const SKIN = "#e8bb92";
const SKIN2 = "#c8956a";
const HAIR = "#4a3426";
const INK = "#3a2e22";
const CREAM = "#f4ecd6";

function Body({ x = 24, y = 31, w = 13, h = 11, c = "var(--team)" }: { x?: number; y?: number; w?: number; h?: number; c?: string }) {
  return <path d={`M${x - w / 2} ${y + h}q0-${h} ${w / 2}-${h}q${w / 2} 0 ${w / 2} ${h}Z`} fill={c} />;
}
function Head({ x = 24, y = 19, r = 7.5, skin = SKIN, hair = HAIR }: { x?: number; y?: number; r?: number; skin?: string; hair?: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={skin} />
      <path d={`M${x - r} ${y - 0.5}a${r} ${r} 0 0 1 ${2 * r} 0q-${r} -3.5 -${2 * r} 0Z`} fill={hair} />
      <circle cx={x - 2.6} cy={y + 1} r="0.95" fill={INK} />
      <circle cx={x + 2.6} cy={y + 1} r="0.95" fill={INK} />
      <path d={`M${x - 2} ${y + 3.6}q2 1.6 4 0`} stroke={INK} strokeWidth="1" fill="none" strokeLinecap="round" />
    </>
  );
}
const Ground = () => <ellipse cx="24" cy="43" rx="13" ry="2.2" fill="#000" opacity="0.18" />;

const ART: Record<CardId, ReactNode> = {
  skater: (
    <>
      <Ground />
      <rect x="11" y="39" width="26" height="3" rx="1.5" fill="#8a603a" />
      <circle cx="15" cy="43" r="1.6" fill={INK} />
      <circle cx="33" cy="43" r="1.6" fill={INK} />
      <Body y={28} h={11} />
      <Head y={18} />
      <path d="M16 13.5q8-6 16 0l1 2h-18Z" fill="var(--team-dark)" />
      <path d="M31 14.5l6 1" stroke="var(--team-dark)" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  runners: (
    <>
      <Ground />
      <g transform="translate(-8 4) scale(0.8)">
        <Body />
        <Head hair="#5a3a26" />
      </g>
      <g transform="translate(17 4) scale(0.8)">
        <Body />
        <Head skin={SKIN2} />
      </g>
      <Body y={31} />
      <Head />
      <rect x="21" y="33" width="6" height="5" rx="1" fill={CREAM} />
      <path d="M16.5 14.5h15" stroke={CREAM} strokeWidth="2.4" />
    </>
  ),
  kites: (
    <>
      <path d="M24 5l8 9-8 9-8-9Z" fill="var(--team)" stroke={CREAM} strokeWidth="1.2" />
      <path d="M12 16l5 6-5 6-5-6Z" fill="var(--team)" opacity="0.85" />
      <path d="M37 18l5 6-5 6-5-6Z" fill="var(--team)" opacity="0.85" />
      <path d="M24 23q-3 6 1 10t-2 10" stroke={CREAM} strokeWidth="1.3" fill="none" />
      {[27, 31, 35, 39].map((y, i) => (
        <circle key={y} cx={24 + (i % 2 ? 2 : -1)} cy={y} r="1.3" fill={i % 2 ? CREAM : "var(--team)"} />
      ))}
    </>
  ),
  slinger: (
    <>
      <Ground />
      <Body c={CREAM} />
      <path d="M17 31h14l-1 11h-12Z" fill="var(--team)" />
      <Head />
      <path d="M15.5 15q8.5-6 17 0v2h-17Z" fill="var(--team-dark)" />
      <path d="M31 30l6-10" stroke={SKIN} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M37 20q4-6 6 0" stroke="#6b4a2c" strokeWidth="1.3" fill="none" />
      <circle cx="42.5" cy="18" r="2.2" fill={CREAM} stroke="#b9a27c" />
    </>
  ),
  shieldbearer: (
    <>
      <Ground />
      <Body w={16} />
      <Head />
      <path d="M15.5 16a8.5 8.5 0 0 1 17 0Z" fill="#b8bcc0" />
      <circle cx="18" cy="13" r="0.9" fill="#8a8c90" />
      <circle cx="30" cy="13" r="0.9" fill="#8a8c90" />
      <circle cx="17" cy="33" r="8" fill="#8a603a" stroke="var(--team)" strokeWidth="2.2" />
      <circle cx="17" cy="33" r="2" fill="#d9c08a" />
      <path d="M33 28l5-9" stroke="#d8c39a" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  hoop: (
    <>
      <Ground />
      <Body />
      <text x="24" y="40" fontSize="7" fontWeight="800" textAnchor="middle" fill={CREAM} fontFamily="sans-serif">23</text>
      <Head skin={SKIN2} />
      <path d="M16.5 14.5h15" stroke={CREAM} strokeWidth="2.4" />
      <path d="M31 29l5-11" stroke={SKIN2} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="37" cy="13" r="5" fill="#e07a3a" />
      <path d="M32 13h10M37 8v10" stroke="#9a4a1c" strokeWidth="0.8" />
    </>
  ),
  rowers: (
    <>
      <Ground />
      <g transform="translate(-7 2) scale(0.85)">
        <Body />
        <Head />
      </g>
      <g transform="translate(10 2) scale(0.85)">
        <Body />
        <Head skin={SKIN2} />
      </g>
      <path d="M4 34l40-6" stroke="#d8c39a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M38 26l7-1 1 5-7 1Z" fill="var(--team)" />
    </>
  ),
  lantern: (
    <>
      <Ground />
      <circle cx="35" cy="12" r="7" fill="#ffd27a" opacity="0.35" />
      <path d="M16 31h16l2 12h-20Z" fill="var(--team)" />
      <Body c={CREAM} h={9} y={29} />
      <Head />
      <path d="M33 6v32" stroke="#6b4a2c" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="31" y="9" width="7" height="8" rx="2.5" fill="#ffd27a" stroke="#8a5a1c" />
    </>
  ),
  beekeeper: (
    <>
      <Ground />
      <Body c="#f1ead6" />
      <path d="M17 33h14" stroke="var(--team)" strokeWidth="2" />
      <Head />
      <path d="M14 15h20l-2-5h-16Z" fill="#efe6cc" />
      <path d="M15 15v8h18v-8" fill="#e8e2d2" opacity="0.6" />
      {[0, 1, 2, 3, 4].map((k) => (
        <circle key={k} cx={36 + (k % 3) * 2.5} cy={12 + k * 1.8} r="1.1" fill="#3a3020" />
      ))}
    </>
  ),
  haycart: (
    <>
      <Ground />
      <rect x="9" y="27" width="24" height="7" rx="1.5" fill="#8a603a" />
      <ellipse cx="21" cy="23" rx="12" ry="7" fill="#e3c46a" />
      <path d="M12 21q9-5 18 0" stroke="#c9a24e" strokeWidth="1.2" fill="none" />
      <circle cx="14" cy="37" r="4.5" fill="#5a3e2a" />
      <circle cx="28" cy="37" r="4.5" fill="#5a3e2a" />
      <path d="M33 22v-12" stroke="#6b4a2c" strokeWidth="1.5" />
      <path d="M33 10h7l-2 2.5 2 2.5h-7Z" fill="var(--team)" />
      <Head x={39} y={26} r={4.5} />
    </>
  ),
  balloon: (
    <>
      <ellipse cx="24" cy="18" rx="12" ry="13" fill="#c89a5e" />
      <path d="M12 15q12-12 24 0q-3-10-12-10t-12 10Z" fill="var(--team)" />
      <path d="M20 30l-1 6M28 30l1 6" stroke="#6b4a2c" strokeWidth="1.2" />
      <rect x="17" y="35" width="14" height="7" rx="1.5" fill="#8a603a" />
      <path d="M14 26q-2 8 2 14" stroke="var(--team)" strokeWidth="1.5" fill="none" />
    </>
  ),
  mascot: (
    <>
      <Ground />
      <ellipse cx="24" cy="33" rx="13" ry="10" fill="#b98a52" />
      <ellipse cx="24" cy="35" rx="8" ry="6" fill="#c89a5e" />
      <Head r={8.5} y={17} skin={SKIN} hair="#6b4a2c" />
      <path d="M14 15q10-11 20 0Z" fill="#6b4a2c" />
      <path d="M24 5v3" stroke="#4a3426" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 15h18" stroke="var(--team)" strokeWidth="1.6" />
    </>
  ),
  telescope: (
    <>
      <Ground />
      <path d="M24 26l-8 16M24 26l8 16M24 26v16" stroke="#6b4a2c" strokeWidth="2" strokeLinecap="round" />
      <rect x="10" y="17" width="28" height="7" rx="3" fill="#e8c26e" transform="rotate(-18 24 21)" />
      <rect x="33" y="10" width="5" height="10" rx="2" fill="#c9a24e" transform="rotate(-18 24 21)" />
      <path d="M38 6l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2-.3Z" fill="#fff3c4" />
      <path d="M8 36v-12" stroke="#6b4a2c" strokeWidth="1.3" />
      <path d="M8 24h6l-1.5 2 1.5 2h-6Z" fill="var(--team)" />
    </>
  ),
  stall: (
    <>
      <Ground />
      <rect x="10" y="28" width="28" height="13" rx="1.5" fill="#8a603a" />
      <rect x="9" y="26" width="30" height="3" fill={CREAM} />
      {[0, 1, 2, 3, 4].map((k) => (
        <path key={k} d={`M${9 + k * 6} 13h6v6q-3 2-6 0Z`} fill={k % 2 ? CREAM : "var(--team)"} />
      ))}
      <path d="M11 19v7M37 19v7" stroke="#6b4a2c" strokeWidth="1.6" />
      <ellipse cx="28" cy="25" rx="4" ry="2.4" fill="#4a4a48" />
      <path d="M27 21q2-3 0-5M30 21q2-3 0-5" stroke="#cfc8bc" strokeWidth="1.2" fill="none" />
    </>
  ),
  gostone: (
    <>
      <ellipse cx="24" cy="31" rx="14" ry="6" fill="#000" opacity="0.15" />
      <path d="M8 16h32M8 24h32M8 32h32M16 8v32M24 8v32M32 8v32" stroke="#b9a27c" strokeWidth="0.9" />
      <ellipse cx="24" cy="25" rx="11" ry="7" fill="#22201e" />
      <ellipse cx="21" cy="22.5" rx="4" ry="1.8" fill="#5a5650" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <circle key={k} cx={24 + Math.cos((k / 8) * Math.PI * 2) * 17} cy={25 + Math.sin((k / 8) * Math.PI * 2) * 11} r="1.2" fill="#e8c26e" />
      ))}
    </>
  ),
  smash: (
    <>
      <path d="M6 38l24-24" stroke="#fff3c4" strokeWidth="5" opacity="0.5" strokeLinecap="round" />
      <path d="M30 14l8-8M30 14l11-3M30 14l3-11" stroke={CREAM} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="29" cy="15" r="3.6" fill="#f4ecd6" stroke="#b9a27c" />
      <path d="M8 40q8-2 12-8" stroke="var(--team)" strokeWidth="2" fill="none" />
    </>
  ),
  comet: (
    <>
      <path d="M40 4L22 28" stroke="#ffd27a" strokeWidth="9" opacity="0.4" strokeLinecap="round" />
      <path d="M38 7L24 26" stroke="#fff3c4" strokeWidth="4" opacity="0.7" strokeLinecap="round" />
      <circle cx="21" cy="29" r="7" fill="#7a6e62" />
      <circle cx="19" cy="27" r="2" fill="#968a7c" />
      <ellipse cx="21" cy="42" rx="12" ry="2.6" fill="#000" opacity="0.2" />
    </>
  ),
};

export function CardArt({ id }: { id: CardId }) {
  return (
    <svg className="br-art" viewBox="0 0 48 48" aria-hidden="true">
      {ART[id]}
    </svg>
  );
}

export const EMOTES = ["Good luck!", "Nice one!", "Whoa!", "Hmm…", "Thanks!", "Well played!"] as const;
const MOUTHS = ["M9 15q3 3 6 0", "M8.5 14.5q3.5 4 7 0", "M10.5 15.5a1.6 1.6 0 1 0 3 0a1.6 1.6 0 1 0-3 0", "M9 16h6", "M9 15q3 2.4 6 0", "M8.5 14q3.5 4.5 7 0"];
export function EmoteFace({ i }: { i: number }) {
  return (
    <svg className="br-face" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#ffd27a" stroke="#8a5a1c" strokeWidth="1.2" />
      <circle cx="8.5" cy="10" r="1.2" fill={INK} />
      <circle cx="15.5" cy="10" r="1.2" fill={INK} />
      <path d={MOUTHS[i % MOUTHS.length]} stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
