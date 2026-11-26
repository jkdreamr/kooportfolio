declare module "n8ao" {
  import type { Camera, Color, Scene } from "three";
  import { Pass } from "postprocessing";
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    camera: Camera;
    configuration: {
      aoSamples: number;
      aoRadius: number;
      denoiseSamples: number;
      denoiseRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: Color;
      gammaCorrection: boolean;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      screenSpaceRadius: boolean;
      [key: string]: unknown;
    };
    setQualityMode(mode: "Performance" | "Low" | "Medium" | "High" | "Ultra"): void;
  }
}
