import { dailyThree, dayNumber } from "../core/daily";
import { useGame } from "../core/store";
import { openPassport } from "./Passport";
import "./passport.css";

/** "Daily ●●○": today's Daily Three at a glance; opens the Passport's Daily page. */
export function DailyChip() {
  const daily = useGame((s) => s.save.daily);
  const day = dayNumber();
  const tasks = dailyThree(day);
  const done = daily && daily.day === day ? daily.done : [];
  const n = tasks.filter((t) => done.includes(t.id)).length;
  return (
    <button className="daily-chip" data-cue="ui-open" onClick={() => openPassport("daily")} aria-label={`Daily Three: ${n} of 3 done. Open the Passport`}>
      <span>Daily</span>
      <span aria-hidden="true">
        {tasks.map((t) => (
          <i key={t.id} className={done.includes(t.id) ? "is-done" : ""} />
        ))}
      </span>
    </button>
  );
}
