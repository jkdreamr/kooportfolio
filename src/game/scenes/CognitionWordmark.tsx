import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { Box } from "../world/Models";

type MarkProps = {
  p: [number, number, number];
  size: [number, number];
};

export function CognitionWordmark({ p, size: [width, height] }: MarkProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * height) / width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#263747";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(canvas.height * 0.8)}px Arial, sans-serif`;
    const text = "Cognition";
    const { actualBoundingBoxAscent, actualBoundingBoxDescent } =
      ctx.measureText(text);
    ctx.fillText(
      text,
      canvas.width / 2,
      (canvas.height + actualBoundingBoxAscent - actualBoundingBoxDescent) / 2,
      canvas.width * 0.91,
    );
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, [width, height]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={p}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function CognitionPlaque({ p, size: [width, height] }: MarkProps) {
  return (
    <group position={p}>
      <Box s={[width + 0.12, height + 0.12, 0.14]} c="#687888" />
      <CognitionWordmark p={[0, 0, 0.076]} size={[width, height]} />
    </group>
  );
}

export function CognitionDeskTent({ p, size }: MarkProps) {
  return (
    <group position={p}>
      <Box
        p={[0, 0.14, -0.14]}
        s={[size[0] - 0.12, 0.28, 0.36]}
        c="#394c5b"
      />
      <group position={[0, size[1] * 0.43, 0]} rotation={[-0.42, 0, 0]}>
        <CognitionPlaque p={[0, 0, 0]} size={size} />
      </group>
    </group>
  );
}
