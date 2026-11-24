import type { NpcPicture } from "../core/npcTopics";

const pictures = {
  campus: {
    caption: "Hoover Tower",
    alt: "A red-roofed tower behind the arches of the Stanford quad.",
    art: (
      <>
        <path fill="#7c9273" d="M0 97 43 64 94 92 162 58 240 99v46H0Z" />
        <path
          fill="#dec292"
          d="M96 34h42v97H96zM20 88h75v43H20zM141 88h78v43h-78z"
        />
        <path
          fill="#a3523d"
          d="m91 35 26-24 26 24ZM15 88l13-13h60l12 13ZM136 88l14-13h60l14 13Z"
        />
        <path
          fill="#72554a"
          d="M110 62V49a7 7 0 0 1 14 0v13ZM111 95V80a6 6 0 0 1 12 0v15Z"
        />
        {[36, 59, 82, 157, 180, 203].map((x) => (
          <path
            key={x}
            fill="#72554a"
            d={`M${x - 6} 132v-21a6 6 0 0 1 12 0v21Z`}
          />
        ))}
        <path fill="#a1a07b" d="M0 131h240v14H0z" />
      </>
    ),
  },
  oar: {
    caption: "Between the buoys",
    alt: "A narrow rowing shell steers between two dotted lines of orange buoys.",
    art: (
      <>
        <path fill="#537d82" d="M0 0h240v145H0z" />
        <path
          stroke="#a2b5a3"
          fill="none"
          d="M113 95q-11 12-10 40m24-40q11 12 10 40M22 42h33m138 51h32M12 104h34m142-70h29"
        />
        <path
          stroke="#e3ac75"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="1 24"
          d="M72 15v117m96-117v117"
        />
        <path fill="#ebd6a3" d="M120 19q-20 47 0 89 20-43 0-89Z" />
        <path
          stroke="#2e4548"
          strokeWidth="3"
          d="m91 65 49-10m9 24-45-9M91 83l45 7"
        />
      </>
    ),
  },
  go: {
    caption: "One liberty left",
    alt: "Three white stones surround a black stone. A dashed ring marks its last empty neighboring point.",
    art: (
      <>
        <path fill="#c69e62" d="M0 0h240v145H0z" />
        <path
          stroke="#725730"
          fill="none"
          d="M60 13v119m30-119v119m30-119v119m30-119v119m30-119v119M60 13h120M60 43h120M60 73h120M60 103h120M60 132h120"
        />
        <circle cx="120" cy="73" r="13" fill="#343936" />
        {[
          [90, 73],
          [120, 43],
          [150, 73],
        ].map(([x, y]) => (
          <circle
            key={x + y}
            cx={x}
            cy={y}
            r="13"
            fill="#f5e8c8"
            stroke="#a58459"
          />
        ))}
        <circle
          cx="120"
          cy="103"
          r="8"
          fill="none"
          stroke="#704433"
          strokeWidth="2"
          strokeDasharray="3 3"
        />
      </>
    ),
  },
  river: {
    caption: "Han River",
    alt: "Bridge arches span the river under a blocky Seoul skyline.",
    art: (
      <>
        <path
          fill="#a7aaa0"
          d="M29 68V43h15v25h7V32h18v36h7V49h22v19h9V32h16v36h8V41h16v27h5V24h5v44h10V46h22v22h15V38h17v30Z"
        />
        <path fill="#628887" d="M0 72h240v73H0z" />
        <path
          stroke="#e3ce9f"
          strokeWidth="6"
          fill="none"
          d="M0 80h240M5 112q22-56 45 0 23-56 46 0 23-56 46 0 23-56 46 0 23-56 46 0"
        />
        <path
          stroke="#c2c3a3"
          fill="none"
          d="M16 123h56m25-5h18m22 15h74m-39-14h55"
        />
      </>
    ),
  },
  booth: {
    caption: "A photo booth strip",
    alt: "Three booth pictures of the same visitor waving, smiling and cheering.",
    art: (
      <>
        <path fill="#738d80" d="M0 0h240v145H0z" />
        <path fill="#f0dfbb" d="M31 36h178v76H31z" />
        {[42, 97, 152].map((x, index) => (
          <g key={x} transform={`translate(${x} 45)`}>
            <path fill="#9caca0" d="M0 0h46v49H0z" />
            <path
              stroke="#a05e48"
              strokeWidth="6"
              fill="none"
              d={
                [
                  "m13 43-8-16m28 16 7 6",
                  "m13 42-7 7m27-7 7 7",
                  "m13 43-8-16m28 16 8-16",
                ][index]
              }
            />
            <path fill="#b77858" d="M12 15h22v20H12z" />
            <path
              fill="#573f36"
              d="M10 11h26v8H10zM17 23h3v3h-3zm9 0h3v3h-3z"
            />
            <path fill="#a05e48" d="M13 35h20v14H13z" />
          </g>
        ))}
      </>
    ),
  },
};

export function NpcIllustration({ picture }: { picture: NpcPicture }) {
  const { art, alt, caption } = pictures[picture];
  return (
    <figure className="npc-picture">
      <svg viewBox="0 0 240 145" role="img" aria-label={alt}>
        <path fill="#d9d0a8" d="M0 0h240v145H0z" />
        {art}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
