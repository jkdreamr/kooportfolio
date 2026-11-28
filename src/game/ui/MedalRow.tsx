import { MEDALS, medalFor, nextMedal, tierName, type MedalGame, type MedalTier } from "../core/medals";
import { useGame } from "../core/store";
import "./passport.css";

const TIER_CLASS = ["", "bronze", "silver", "gold", "top"] as const;

/** One ring per tier (bronze, silver, gold, the named top tier), the held
 * ones filled, and what the next one needs. Reads the save's bests. */
export function MedalRow({ game, variant, compact }: { game: MedalGame; variant?: string; compact?: boolean }) {
  const bests = useGame((s) => s.save.bests);
  const held = medalFor(game, bests, variant);
  const next = nextMedal(game, bests, variant);
  const spec = MEDALS[game];
  return (
    <div className={`medal-row${compact ? " is-compact" : ""}`} aria-label={held ? `${spec.name}: ${tierName(game, held)} medal` : `${spec.name}: no medal yet`}>
      <span className="medal-rings" aria-hidden="true">
        {([1, 2, 3, 4] as MedalTier[]).map((t) => (
          <i key={t} className={`medal-ring medal-${TIER_CLASS[t]}${held >= t ? " is-held" : ""}`} title={`${tierName(game, t)}: ${spec.tiers[t - 1].need}`} />
        ))}
      </span>
      {!compact && (
        <span className="medal-text">
          {held ? <b>{tierName(game, held)}</b> : null}
          {next ? (
            <span>
              {held ? " · " : ""}Next: {next.name}, {next.need.charAt(0).toLowerCase() + next.need.slice(1)}
            </span>
          ) : (
            <span> · every medal held</span>
          )}
        </span>
      )}
    </div>
  );
}
