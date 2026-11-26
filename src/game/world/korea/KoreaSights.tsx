import { KoreaHeritage } from "./KoreaHeritage";
import { KoreaModernSeoul } from "./KoreaModernSeoul";

/** Mount point for the Korea sights (heritage + modern Seoul). Static only:
 * no per-frame work; night lighting comes from the shared gloss uniform. */
export function KoreaSights() {
  return (
    <group name="korea-sights">
      <KoreaHeritage />
      <KoreaModernSeoul />
    </group>
  );
}
