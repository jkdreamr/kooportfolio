export const WORLD_TIME_ZONES = {
  pacific: "America/Los_Angeles",
  korea: "Asia/Seoul",
} as const;

export type WorldTimeZone =
  (typeof WORLD_TIME_ZONES)[keyof typeof WORLD_TIME_ZONES];

export const TIME_ZONE_LABELS: Record<WorldTimeZone, string> = {
  "America/Los_Angeles": "PT",
  "Asia/Seoul": "KST",
};

const clocks = new Map(
  Object.values(WORLD_TIME_ZONES).map((timeZone) => [
    timeZone,
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  ]),
);

/** Civil time in the destination, independent of the visitor's own timezone. */
export function readWorldHour(timeZone: WorldTimeZone, now = new Date()) {
  const parts = clocks.get(timeZone)!.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)!.value);
  return (
    part("hour") +
    part("minute") / 60 +
    part("second") / 3600 +
    now.getMilliseconds() / 3_600_000
  );
}
