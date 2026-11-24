import { create } from "zustand";
import {
  postcardFilename,
  type PhotoPose,
  type PhotoResolution,
  type PostcardFrame,
} from "./postcard";

type Capture = {
  id: number;
  final: boolean;
  resolution: PhotoResolution;
  pose: PhotoPose;
  frame: PostcardFrame;
  date: Date;
  x: number;
  z: number;
};
type PhotoState = {
  pose: PhotoPose;
  frame: PostcardFrame;
  stage: "posing" | "countdown" | "ready";
  request: Capture | null;
  card: { url: string; filename: string; resolution: PhotoResolution } | null;
  error: string;
  x: number;
  z: number;
};
let sequence = 0;
export const usePhotoBooth = create<PhotoState>(() => ({
  pose: "wave",
  frame: "slate",
  stage: "posing",
  request: null,
  card: null,
  error: "",
  x: 0,
  z: 0,
}));

export function requestPhoto(
  final = false,
  resolution: PhotoResolution = "preview",
) {
  const { pose, frame, x, z } = usePhotoBooth.getState();
  usePhotoBooth.setState({
    request: {
      id: ++sequence,
      final,
      resolution,
      pose,
      frame,
      date: new Date(),
      x,
      z,
    },
    error: "",
  });
}
export function clearPhoto() {
  const card = usePhotoBooth.getState().card;
  if (card) URL.revokeObjectURL(card.url);
  usePhotoBooth.setState({
    request: null,
    card: null,
    stage: "posing",
    error: "",
  });
}
export function beginPhoto(x: number, z: number) {
  clearPhoto();
  usePhotoBooth.setState({ x, z, pose: "wave", frame: "slate" });
  requestPhoto();
}
export function finishPhoto(id: number, blob: Blob) {
  const state = usePhotoBooth.getState();
  if (state.request?.id !== id) return;
  if (state.card) URL.revokeObjectURL(state.card.url);
  usePhotoBooth.setState({
    card: {
      url: URL.createObjectURL(blob),
      filename: postcardFilename(state.request.date),
      resolution: state.request.resolution,
    },
    stage: state.request.final ? "ready" : "posing",
    request: null,
    error: "",
  });
}
export function failPhoto(id: number) {
  if (usePhotoBooth.getState().request?.id !== id) return;
  usePhotoBooth.setState({
    request: null,
    stage: "posing",
    error: "That shot didn’t work. Try again?",
  });
}
