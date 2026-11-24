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
  skate: {
    caption: "The low bank",
    alt: "A little skateboard sits at the foot of a low concrete ramp.",
    art: (
      <>
        <path fill="#94a9aa" d="M0 0h240v145H0z" />
        <path
          fill="#72896b"
          d="m0 66 38-13 33 8 44-16 36 10 22-13 67 19v84H0Z"
        />
        <path fill="#a7a9a2" d="M0 96h43l41-31h43l32 31h81v49H0Z" />
        <path fill="#d3d0bc" d="m43 96 41-31h43l32 31Z" />
        <path
          fill="none"
          stroke="#6c6557"
          strokeWidth="2"
          d="M0 96h240m-108 25 15-25"
        />
        <path
          fill="none"
          stroke="#8c4e3f"
          strokeWidth="4"
          strokeLinecap="round"
          d="m163 107 5 4h35l5-4"
        />
        <path fill="#38464b" d="M174 112h6v6h-6zm18 0h6v6h-6z" />
      </>
    ),
  },
  shuttle: {
    caption: "One feather short",
    alt: "A shuttlecock with one missing feather lies on the green court.",
    art: (
      <>
        <path fill="#6a8877" d="M0 0h240v145H0Z" />
        <path
          fill="none"
          stroke="#d6d9bd"
          strokeWidth="3"
          d="M0 24h240M0 122h240M191 0v145"
        />
        <g transform="rotate(27 120 70)">
          <path fill="#4c6d65" d="M89 108h48l16 7h-60Z" />
          <path fill="#ddd9be" d="M105 85h25v14a12.5 12.5 0 0 1-25 0Z" />
          <path
            fill="#f0ead1"
            d="m105 88-26-51 14-9 15 54-8-49 15-6 2 52 9-51 15 4-12 48 13-29-7 37Z"
          />
          <path fill="#a85e47" d="M102 83h34v7h-34Z" />
        </g>
      </>
    ),
  },
  court: {
    caption: "Under the hoop",
    alt: "A basketball rests in front of a hoop at the end of an outdoor court.",
    art: (
      <>
        <path fill="#9caba3" d="M0 0h240v145H0Z" />
        <path fill="#6a8172" d="M0 78h240v67H0Z" />
        <path fill="#a77562" d="m53 80 134 0 53 65H0Z" />
        <path
          stroke="#ded5b7"
          fill="none"
          strokeWidth="2"
          d="m95 80-23 52h96l-23-52m-73 52c0-23 96-23 96 0M50 87h140"
        />
        <path stroke="#45585a" strokeWidth="6" d="M120 34v50" />
        <rect
          x="97"
          y="27"
          width="46"
          height="25"
          rx="2"
          fill="#d5d7bf"
          stroke="#566961"
          strokeWidth="2"
        />
        <path
          stroke="#93624f"
          fill="none"
          strokeWidth="2"
          d="M108 45h24v10h-24m0 3 6 10h12l6-10Z"
        />
        <circle cx="139" cy="113" r="10" fill="#bb7748" stroke="#754b3d" />
        <path stroke="#754b3d" fill="none" d="M129 113h20m-10-10q-7 10 0 20" />
      </>
    ),
  },
  garden: {
    caption: "Behind the leaves",
    alt: "Red tomatoes hang from plants in a wooden garden bed.",
    art: (
      <>
        <path fill="#a6b69d" d="M0 0h240v145H0Z" />
        <path fill="#889575" d="m0 98 34-18 35 10 41-9 39 11 39-8 52 5v56H0Z" />
        <path fill="#795f4c" d="m46 90 140-4 22 22-165 6Z" />
        <path fill="#ab805a" d="m43 111 164-5-10 27-143 2Z" />
        {[67, 118, 161].map((x, i) => (
          <g key={x} transform={`translate(${x} ${i === 1 ? 0 : 10})`}>
            <path stroke="#6e6048" strokeWidth="3" d="M9 26v78" />
            <path
              fill="#536f49"
              d="M8 95 3 64-16 59l-6-16 19 6 9 13 8-18 14 3-6 16-12 5 3 27Z"
            />
            <circle cx="-4" cy="61" r="7" fill="#a84f3d" />
            <circle cx="18" cy="74" r="8" fill="#b15d43" />
          </g>
        ))}
      </>
    ),
  },
  letter: {
    caption: "For the quiet house",
    alt: "A stamped envelope is addressed with a drawing of a house and its lit porch.",
    art: (
      <>
        <path fill="#809696" d="M0 0h240v145H0Z" />
        <g transform="rotate(-7 120 73)">
          <rect x="41" y="29" width="162" height="92" rx="3" fill="#4e666b" />
          <rect x="38" y="24" width="162" height="92" rx="3" fill="#dedbc2" />
          <path
            fill="none"
            stroke="#a4a58e"
            d="M43 111 95 72m99 39-55-39M43 31l69 47h12l70-47"
          />
          <path
            fill="#ac6d5b"
            stroke="#f1ead3"
            strokeDasharray="2 2"
            strokeWidth="3"
            d="M166 32h24v30h-24Z"
          />
          <path fill="#879483" d="M101 61h39v28h-39z" />
          <path fill="#7d6657" d="m95 63 25-20 26 20Z" />
          <path fill="#e8bd78" d="M116 73h9v16h-9Z" />
          <path
            fill="none"
            stroke="#8c8774"
            strokeWidth="2"
            d="M95 96h55m-43 6h31"
          />
        </g>
      </>
    ),
  },
  uprights: {
    caption: "Watch the flag",
    alt: "A flag blows to the right beside the goalposts at the end of a football field.",
    art: (
      <>
        <path fill="#98adb0" d="M0 0h240v145H0z" />
        <path fill="#838e87" d="M0 65 45 49h150l45 17v35H0Z" />
        <path fill="#6c8763" d="M0 99h240v46H0Z" />
        <path stroke="#cad2aa" strokeWidth="2" d="M0 105h240m-218 20h196" />
        <path
          stroke="#edbf69"
          strokeWidth="5"
          fill="none"
          d="M94 31v48h52V31m-26 48v26"
        />
        <path stroke="#536463" strokeWidth="2" d="M170 33v54" />
        <path fill="#a85b49" d="m171 34 24 5-24 8Z" />
        <ellipse
          cx="120"
          cy="131"
          rx="9"
          ry="4"
          fill="#854f3e"
          transform="rotate(-22 120 131)"
        />
      </>
    ),
  },
  pads: {
    caption: "Four pads",
    alt: "Four colored beat pads sit below four lanes of falling notes.",
    art: (
      <>
        <path fill="#657b86" d="M0 0h240v145H0z" />
        <rect x="47" y="15" width="146" height="115" rx="5" fill="#394c56" />
        <path stroke="#5b7079" d="M85 26v72m35-72v72m35-72v72" />
        {["#ae705f", "#c3a96d", "#7c9b82", "#869fb3"].map((color, i) => (
          <g key={color} fill={color}>
            <rect
              x={56 + 35 * i}
              y={29 + [21, 0, 42, 12][i]}
              width="21"
              height="8"
              rx="2"
            />
            <rect x={54 + 35 * i} y="99" width="26" height="21" rx="3" />
          </g>
        ))}
        <path stroke="#cbd0b0" strokeDasharray="4 4" d="M56 85h128" />
      </>
    ),
  },
  tangram: {
    caption: "Back to pieces",
    alt: "Several wooden triangles and a square lie on a workbench.",
    art: (
      <>
        <path fill="#9b9d86" d="M0 0h240v145H0Z" />
        <path fill="#b5ae93" d="m17 41 170-20 40 83-174 23Z" />
        <path
          fill="none"
          stroke="#8b8d78"
          strokeDasharray="3 3"
          d="m69 52 58-9 9 58-58 9Z"
        />
        <path fill="#8a6352" d="m69 52 8 47 40-55Z" />
        <path fill="#a77b5c" d="m80 111 48-8-8-48Z" />
        <path fill="#bd9a60" d="m144 62 26-6 6 26-26 6Z" />
        <path fill="#748c78" d="m177 96 26-2-23-25Z" />
        <path fill="#bd9a60" d="m158 41 18-3-23-15Z" />
      </>
    ),
  },
  picnic: {
    caption: "Lunch by the river",
    alt: "An orange and a lunch box with rice and side dishes sit beside a basket.",
    art: (
      <>
        <path fill="#819960" d="M0 0h240v145H0Z" />
        <path fill="#a47766" d="m21 61 162-26 36 70-166 23Z" />
        <path
          fill="none"
          stroke="#c29a7a"
          strokeWidth="3"
          d="m42 57 35 67m-3-73 35 69m-4-75 35 71m-4-76 35 72m-4-76 35 70M28 78l163-27M36 96l164-28M45 114l164-30"
        />
        <path
          fill="none"
          stroke="#755c46"
          strokeWidth="4"
          d="M155 51q4-32 27-11"
        />
        <path fill="#ac8a57" d="m144 50 48-6-4 30-33 6Z" />
        <path fill="#695648" d="m67 68 66-9 18 36-70 11Z" />
        <path fill="#ddd8b6" d="m73 72 33-5 12 31-34 4Z" />
        <path fill="#9d674c" d="m110 67 20-3 7 13-22 3Z" />
        <path fill="#82925e" d="m116 85 23-4 6 12-24 3Z" />
        <circle cx="171" cy="94" r="11" fill="#c28650" />
        <path fill="#577449" d="m168 83 5-6 7 3-8 5Z" />
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
