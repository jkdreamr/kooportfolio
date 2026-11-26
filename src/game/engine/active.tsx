import { createContext, useContext } from "react";

/** False while a world subtree is mounted but hidden (e.g. the hub while an
 * interior is shown). Gate useFrame work and pointer handlers on it. */
export const WorldActiveContext = createContext(true);
export const useWorldActive = () => useContext(WorldActiveContext);
