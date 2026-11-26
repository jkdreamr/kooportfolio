# Performance check on real devices (`?perf=1`)

The container this site is built in has no GPU, so real frame rates come from
your own devices. The benchmark is built into the production site and only
appears with `?perf=1`; it costs nothing to run.

## Steps

1. Open the preview at `/play?perf=1` on a mid-range laptop (plugged in,
   browser up to date, other tabs closed).
2. Wait until the village is playable: the HUD is visible and the overlay in
   the bottom-left corner shows frame times.
3. Press **Run 60 s benchmark** and leave the mouse and keyboard alone. The
   site runs a fixed sequence on its own:
   - island overview (8 s)
   - zoom in (8 s)
   - walk view with a short walking loop (20 s)
   - three view toggles (6 s)
   - into a room and back out: the Kitchen on the Home island (10 s)
   - island overview again (8 s)
4. When it finishes, press **Copy results**. If copying is blocked, click in
   the text box under the results, select all, and copy.
5. Repeat on the same laptop with `/play?perf=1&tier=medium`.
6. Repeat on a mid-range phone with `/play?perf=1`.
7. Paste the three JSON blobs back to the developer.

## What the results mean

Each segment reports average, p95 and p99 frame time, the 1% low frame rate,
frames slower than 50 ms, the peak draw calls and triangles, the DPR range,
program links after load and lost WebGL contexts. A segment passes when its
p95 frame time is within budget (16.7 ms on the high tier, 33.3 ms on medium
and low) and no context was lost. Tier and GPU renderer are in the JSON.
