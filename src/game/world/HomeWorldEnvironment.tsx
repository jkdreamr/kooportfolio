import { WorldSceneryParts } from "./WorldSceneryParts";
import { HomeCommunity } from "./CommunityScenery";
import { HomeGardens } from "./HomeGardens";
import { HomeWindowLighting } from "./HomeBuildingArt";
import { HOME_PATH_FOOTPRINTS, HOME_PATH_PARTS } from "./env/homePaths";

export { HOME_PATH_FOOTPRINTS };

/** Home yard dressing only: no duplicate rooms, ground, travel or telescope. */
export function HomeWorldEnvironment() {
  return (
    <group name="home-environment">
      <HomeWindowLighting />
      <HomeGardens />
      <WorldSceneryParts parts={HOME_PATH_PARTS} />
      <HomeCommunity />
    </group>
  );
}
