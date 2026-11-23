export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10H3Z" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
    build: (
      <>
        <path d="m14 4 6 6-3 3-2-2-9 10-3-3 10-9-2-2Z" />
        <path d="m4 4 4 4" />
      </>
    ),
    memories: (
      <>
        <path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3Z" />
        <path d="M12 6v15" />
      </>
    ),
    avatar: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-.7 3-2.8.8L3 9l2 3-2 3 2.5 2.2 2.8.8.7 3h6l.7-3 2.8-.8L21 15l-2-3 2-3-2.5-2.2-2.8-.8L15 3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    sound: (
      <>
        <path d="M3 9h4l5-5v16l-5-5H3Z" />
        <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    muted: (
      <>
        <path d="M3 9h4l5-5v16l-5-5H3Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </>
    ),
    back: (
      <>
        <path d="m10 5-7 7 7 7M3 12h18" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    coin: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14 7h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-10v14" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-3-5.6 3 1.1-6.1L3 9.5l6.2-.9Z" />
    ),
    pause: (
      <>
        <path d="M8 4v16M16 4v16" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m4 12 5 5L20 6" />,
    oar: (
      <>
        <path d="m4 20 8-9m0 0 2-7 3-1 3 3-1 3-7 2Z" />
      </>
    ),
    ball: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m5.6 5.6 12.8 12.8M5.6 18.4 18.4 5.6M3 12c5 1 8 4 9 9m0-18c1 5 4 8 9 9" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.star}
    </svg>
  );
}
