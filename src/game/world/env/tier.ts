import { useStage, TIER_BUDGETS, type Tier } from "../../../stage/contract";
import { useGame } from "../../core/store";

/** The engine's warm-chosen tier, or (before the engine picks one / in tests)
 * the legacy quality switch. Never flips materials: callers scale counts. */
export function useEnvTier(): Tier {
  const tier = useStage((s) => s.tier);
  const quality = useGame((s) => s.quality);
  return tier ?? (quality === "high" ? "high" : "low");
}
export const envBudget = (tier: Tier) => TIER_BUDGETS[tier];
/** Fraction of each environment layer kept on a tier. */
export const ENV_DENSITY: Record<Tier, { leaves: number; grass: number; detail: number }> = {
  high: { leaves: 1, grass: 1, detail: 1 },
  medium: { leaves: 0.6, grass: 1, detail: 0.7 },
  low: { leaves: 0.45, grass: 1, detail: 0.4 },
};
