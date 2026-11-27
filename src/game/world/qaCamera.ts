import type * as THREE from "three";
import { useGame } from "../core/store";
import { activeNpcCrowd } from "../core/npcState";
import { outfitFor } from "./character/cast";
import { SK } from "./character/skeleton";
import { exposeQa, qaEnabled } from "../../stage/qa";

/**
 * QA-only close-up camera (QA builds; inert otherwise): frames a named
 * villager from `dist` world units in front of them (rotated by `yaw`
 * around them) at face height, with nothing in between. Screenshot tools
 * set `window.__qa.qaCam.npc = "<id>"`, and null to release the camera.
 */
export const qaCam = { npc: null as string | null, dist: 2, yaw: 0, fov: 30, lift: 0, full: false };
exposeQa({ qaCam });

const NPC_SCALE = 0.67;
export function applyQaCamera(camera: THREE.PerspectiveCamera) {
  if (!qaEnabled() || !qaCam.npc) return false;
  const entry = activeNpcCrowd(useGame.getState().world).find((e) => e.npc.id === qaCam.npc);
  if (!entry) return false;
  const { actor, npc } = entry;
  const h = (outfitFor(npc).build?.height ?? 1) * NPC_SCALE;
  const faceY = 0.2 + h * (qaCam.full ? 0.95 : SK.hip + SK.chestUp + SK.neckUp + SK.headUp + SK.headCenter * SK.headScale - 0.04);
  const a = actor.heading + qaCam.yaw;
  camera.position.set(actor.x + Math.sin(a) * qaCam.dist, faceY + qaCam.lift, actor.z + Math.cos(a) * qaCam.dist);
  camera.lookAt(actor.x, faceY, actor.z);
  if (camera.fov !== qaCam.fov) {
    camera.fov = qaCam.fov;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
  }
  return true;
}
