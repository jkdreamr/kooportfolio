import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { Box } from "../world/Models";

type MarkProps = {
  p: [number, number, number];
  size: [number, number];
};

function CognitionMark({
  p,
  size: [width, height],
  variant,
}: MarkProps & { variant: "wordmark" | "badge" | "screen" }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round((1024 * height) / width);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = variant === "screen" ? "#101b24" : "#263747";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = variant === "screen" ? "#a6b8c9" : "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(canvas.height * (variant === "screen" ? 0.28 : 0.8))}px Arial, sans-serif`;
    const text = variant === "wordmark" ? "Cognition" : "C";
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
  }, [width, height, variant]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={p}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function CognitionPlaque({
  p,
  size: [width, height],
  depth = 0.14,
}: MarkProps & { depth?: number }) {
  const rim = Math.min(0.12, height * 0.11);
  return (
    <group position={p}>
      <Box s={[width + rim, height + rim, depth]} c="#687888" />
      <CognitionMark
        p={[0, 0, depth / 2 + 0.006]}
        size={[width, height]}
        variant="wordmark"
      />
    </group>
  );
}

export function CognitionDeskBadge({ p, size: [width, height] }: MarkProps) {
  return (
    <group position={p}>
      <Box
        p={[0, 0.04, -0.04]}
        s={[width, 0.08, 0.15]}
        c="#394c5b"
      />
      <group position={[0, height * 0.47, 0]} rotation={[-0.42, 0, 0]}>
        <Box s={[width + 0.035, height + 0.035, 0.045]} c="#687888" />
        <CognitionMark p={[0, 0, 0.028]} size={[width, height]} variant="badge" />
      </group>
    </group>
  );
}

export function CognitionScreen(props: MarkProps) {
  return <CognitionMark {...props} variant="screen" />;
}
