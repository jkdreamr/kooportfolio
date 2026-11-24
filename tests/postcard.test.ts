import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginPhoto,
  clearPhoto,
  failPhoto,
  finishPhoto,
  requestPhoto,
  usePhotoBooth,
} from "../src/game/core/photoBooth";
import { postcardFilename, uprightPixels } from "../src/game/core/postcard";

describe("postcard readback", () => {
  it("keeps RGBA channels intact while flipping asymmetric rows upright", () => {
    const bottom = [12, 23, 34, 255, 45, 56, 67, 128];
    const top = [78, 89, 90, 255, 100, 110, 120, 0];
    const source = new Uint8Array([...bottom, ...top]);
    expect([...uprightPixels(source, 2, 2)]).toEqual([...top, ...bottom]);
    expect([...source]).toEqual([...bottom, ...top]);
    expect(() => uprightPixels(source, 3, 2)).toThrow();
  });
  it("generates a portable PNG filename without time punctuation", () => {
    expect(postcardFilename(new Date("2026-11-23T16:32:07.123Z"))).toBe(
      "joshua-village-2026-11-23T16-32-07-123Z.png",
    );
  });
});

describe("photo booth asynchronous captures", () => {
  beforeEach(() => {
    let nextUrl = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:photo-${++nextUrl}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    beginPhoto(-6, -4.4);
  });
  afterEach(() => {
    clearPhoto();
    vi.restoreAllMocks();
  });
  it("does not let an older pose encoding replace a newer pose or a closed booth", () => {
    const old = usePhotoBooth.getState().request!;
    usePhotoBooth.setState({ pose: "cheer" });
    requestPhoto();
    const latest = usePhotoBooth.getState().request!;
    expect(latest.pose).toBe("cheer");
    expect([latest.x, latest.z]).toEqual([-6, -4.4]);
    finishPhoto(old.id, new Blob());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    finishPhoto(latest.id, new Blob());
    expect(usePhotoBooth.getState().card?.url).toBe("blob:photo-1");
    requestPhoto(true);
    const pending = usePhotoBooth.getState().request!;
    clearPhoto();
    finishPhoto(pending.id, new Blob());
    expect(usePhotoBooth.getState().card).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-1");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
  it("keeps previews distinct from a finished printable shot and releases replaced URLs", () => {
    finishPhoto(usePhotoBooth.getState().request!.id, new Blob());
    expect(usePhotoBooth.getState().stage).toBe("posing");
    requestPhoto(true);
    finishPhoto(usePhotoBooth.getState().request!.id, new Blob());
    expect(usePhotoBooth.getState().stage).toBe("ready");
    expect(usePhotoBooth.getState().card?.url).toBe("blob:photo-2");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo-1");
  });
  it("recovers from a failed final shot and ignores failures from stale requests", () => {
    const initial = usePhotoBooth.getState().request!;
    requestPhoto(true);
    usePhotoBooth.setState({ stage: "countdown" });
    failPhoto(initial.id);
    expect(usePhotoBooth.getState().stage).toBe("countdown");
    failPhoto(usePhotoBooth.getState().request!.id);
    expect(usePhotoBooth.getState().stage).toBe("posing");
    expect(usePhotoBooth.getState().error).not.toBe("");
    requestPhoto();
    expect(usePhotoBooth.getState().error).toBe("");
  });
});
