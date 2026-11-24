import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Ball, Box, Cylinder, Sign } from "./Models";
import { useGame } from "../core/store";
import { failPhoto, finishPhoto, usePhotoBooth } from "../core/photoBooth";
import {
  composePostcard,
  PHOTO_HEIGHT,
  PHOTO_WIDTH,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  postcardBlob,
  type PhotoPose,
} from "../core/postcard";

/** Origin-local; placement and collision belong to the village. Front faces +Z. */
export function PhotoBooth() {
  return (
    <group>
      <Box p={[0, 0.18, 0]} s={[2.4, 0.28, 1.6]} c="#a58f68" />
      <Box p={[0, 0.35, 0]} s={[2.2, 0.12, 1.4]} c="#c6ac78" />
      {[-1.02, 1.02].map((x) => (
        <group key={x}>
          <Box p={[x, 1.65, -0.48]} s={[0.13, 2.7, 0.15]} c="#72513a" />
          <Box p={[x, 2.83, 0]} s={[0.19, 0.18, 1.6]} c="#72513a" />
        </group>
      ))}
      <Box p={[0, 2.97, 0]} s={[2.5, 0.17, 1.85]} c="#9b563c" />
      {[-0.9, -0.3, 0.3, 0.9].map((x) => (
        <Box key={x} p={[x, 3.065, 0]} s={[0.22, 0.035, 1.81]} c="#e0be83" />
      ))}
      <Box p={[0, 2.58, 0.79]} s={[2.2, 0.43, 0.13]} c="#284a3c" />
      <Sign
        text="PHOTO"
        p={[0, 2.59, 0.863]}
        size={[1.7, 0.35]}
        color="#284a3c"
        ink="#f6e7bb"
      />
      <Box p={[0, 0.75, -0.3]} s={[1.65, 0.2, 0.55]} c="#78583b" />
      {[-0.63, 0.63].map((x) => (
        <Box key={x} p={[x, 0.51, -0.3]} s={[0.13, 0.5, 0.4]} c="#72513a" />
      ))}
      <Cylinder p={[0, 1.12, 0.38]} s={[0.055, 1.45, 0.055]} c="#b49659" />
      <Box p={[0, 1.86, 0.38]} s={[0.77, 0.48, 0.36]} c="#34433b" />
      <Cylinder
        p={[0, 1.86, 0.62]}
        s={[0.2, 0.23, 0.2]}
        r={[Math.PI / 2, 0, 0]}
        c="#b49659"
      />
      <Cylinder
        p={[0, 1.86, 0.75]}
        s={[0.14, 0.035, 0.14]}
        r={[Math.PI / 2, 0, 0]}
        c="#172c2d"
      />
      <Box p={[0.23, 2.14, 0.36]} s={[0.22, 0.12, 0.18]} c="#f4dfb1" />
    </group>
  );
}

function PhotoAvatar({ pose }: { pose: PhotoPose }) {
  const { color, hat } = useGame((state) => state.save);
  const raised = pose === "wave" || pose === "cheer";
  return (
    <group scale={0.65}>
      {[-0.16, 0.16].map((x) => (
        <group key={x} position={[x, 0.42, 0]}>
          <Box p={[0, -0.18, 0]} s={[0.23, 0.4, 0.24]} c="#384648" />
          <Box p={[0, -0.36, 0.07]} s={[0.25, 0.14, 0.38]} c="#f5e9d3" />
        </group>
      ))}
      <Box p={[0, 0.77, 0]} s={[0.65, 0.67, 0.4]} c={color} />
      <Box p={[0, 0.91, 0.213]} s={[0.16, 0.1, 0.02]} c="#e7d3a7" />
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.4, 0.98, 0]}
          rotation={[
            0,
            0,
            side === -1 && raised
              ? -2.3
              : side === 1 && pose === "cheer"
                ? 2.3
                : side * 0.12,
          ]}
        >
          <Box p={[0, -0.15, 0]} s={[0.2, 0.4, 0.25]} c={color} />
          <Ball p={[0, -0.38, 0]} s={[0.115, 0.13, 0.115]} c="#efc5a0" />
        </group>
      ))}
      <group rotation={[0, 0, pose === "wave" ? -0.08 : 0]}>
        <Box p={[0, 1.47, 0.025]} s={[0.78, 0.68, 0.67]} c="#efc5a0" />
        <Box p={[0, 1.8, 0]} s={[0.82, 0.24, 0.7]} c="#3e3936" />
        {[-0.34, 0.34].map((x) => (
          <Box
            key={x}
            p={[x, 1.58, -0.07]}
            s={[0.16, 0.36, 0.62]}
            c="#3e3936"
          />
        ))}
        {[-0.16, 0.16].map((x) => (
          <Ball
            key={x}
            p={[x, 1.47, 0.366]}
            s={[0.043, 0.065, 0.025]}
            c="#383330"
          />
        ))}
        <Box p={[0, 1.29, 0.37]} s={[0.16, 0.03, 0.02]} c="#a47362" />
        {hat && (
          <>
            <Box p={[0, 1.93, 0]} s={[0.9, 0.2, 0.78]} c="#d88960" />
            <Box p={[0, 1.86, 0.4]} s={[0.87, 0.065, 0.48]} c="#d88960" />
            <Box p={[0, 2.03, 0]} s={[0.6, 0.07, 0.6]} c="#e4a275" />
          </>
        )}
      </group>
    </group>
  );
}

/** No preserveDrawingBuffer, DOM screenshots, extra WebGL contexts, or uploads. */
export function PhotoBoothCamera() {
  const avatar = useRef<THREE.Group>(null);
  const handled = useRef(0);
  const pose = usePhotoBooth((state) => state.pose);
  const active = useGame(
    (state) =>
      state.scene === "hub" && state.panel === "photo" && !state.paused,
  );
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!active) return;
    // Game owns demand/live rendering and suspends performance sampling while
    // the modal is open; new capture requests still need a fresh canvas frame.
    invalidate();
    return usePhotoBooth.subscribe((state, before) => {
      if (state.request?.id !== before.request?.id) invalidate();
    });
  }, [active, invalidate]);
  // While the opaque modal is open, render only its offscreen capture. A second
  // full-viewport world render behind it would erase the preview speedup.
  useFrame(
    ({ gl, scene }) => {
      const request = usePhotoBooth.getState().request;
      const game = useGame.getState();
      if (
        !request ||
        request.id === handled.current ||
        !avatar.current ||
        game.scene !== "hub" ||
        String(game.panel) !== "photo"
      )
        return;
      handled.current = request.id;
      const player = scene.getObjectByName("village-player");
      if (!player || gl.getContext().isContextLost()) {
        failPhoto(request.id);
        return;
      }
      const camera = new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 180);
      camera.position.set(request.x + 11, 15, request.z + 20);
      camera.lookAt(request.x + 1, 0.7, request.z - 5);
      avatar.current.position.set(request.x, 0.18, request.z);
      avatar.current.rotation.y = Math.atan2(11, 20);
      const playerVisible = player.visible;
      const previousTarget = gl.getRenderTarget();
      const previousColorSpace = gl.outputColorSpace;
      const previousShadows = gl.shadowMap.enabled;
      const full = request.resolution === "full";
      const width = full ? PHOTO_WIDTH : PREVIEW_WIDTH;
      const height = full ? PHOTO_HEIGHT : PREVIEW_HEIGHT;
      const linear = new THREE.WebGLRenderTarget(width, height, {
        type: gl.extensions.has("EXT_color_buffer_float")
          ? THREE.HalfFloatType
          : THREE.UnsignedByteType,
      });
      const output = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: false,
      });
      const outputPass = new OutputPass();
      try {
        player.visible = false;
        avatar.current.visible = true;
        if (!full) gl.shadowMap.enabled = false;
        gl.setRenderTarget(linear);
        gl.render(scene, camera);
        // Offscreen world passes are linear/HDR. Apply the same tone mapping and
        // display transfer as the live canvas before reading ordinary PNG bytes.
        gl.outputColorSpace = THREE.SRGBColorSpace;
        outputPass.render(gl, output, linear, 0, false);
        const pixels = new Uint8Array(width * height * 4);
        gl.readRenderTargetPixels(output, 0, 0, width, height, pixels);
        const card = composePostcard(
          pixels,
          request.frame,
          request.date,
          width,
          height,
        );
        void postcardBlob(card)
          .then((blob) => finishPhoto(request.id, blob))
          .catch(() => failPhoto(request.id));
      } catch {
        failPhoto(request.id);
      } finally {
        player.visible = playerVisible;
        avatar.current.visible = false;
        gl.outputColorSpace = previousColorSpace;
        gl.shadowMap.enabled = previousShadows;
        gl.setRenderTarget(previousTarget);
        linear.dispose();
        output.dispose();
        outputPass.dispose();
      }
    },
    active ? 1 : 0,
  );
  return (
    <group ref={avatar} visible={false}>
      <PhotoAvatar pose={pose} />
    </group>
  );
}
