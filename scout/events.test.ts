// Live ScoutEvents and the flythrough GIF, offline: Google, OSM and grades are mocked, and the
// Seattle demo frames (fixtures/demo-frames/r0) use verdicts already in .cache/vision, so no
// API calls are made. Skipped if that cache isn't on this machine.
import { expect, mock, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import type { ScoutEvent } from "../shared/types";
import type { Frame } from "./frames";
import * as google from "./google";
import * as visuals from "../visuals";

const MODEL = process.env.SCOUT_MODEL ?? "claude-sonnet-5-5";
const cached = (f: Frame, suffix = "") =>
  `${google.CACHE_DIR}/vision/${MODEL}/v3/${f.panoId}_h${f.heading}_wheelchair${suffix}.json`;

// Frames whose first look (and second look, if it would need one) is already cached.
const all: Frame[] = await Bun.file("fixtures/demo-frames/r0/frames.json").json();
const frames = all
  .filter((f) => existsSync(cached(f)))
  .filter((f) => {
    const v = JSON.parse(readFileSync(cached(f), "utf8"));
    const unsure = v.issue !== "none" && v.issue !== "not_a_street" && v.confidence >= 0.4 && v.confidence < 0.7;
    return !unsure || existsSync(cached(f, "_look2v2"));
  })
  .slice(0, 24);

let failRoutes = false;
mock.module("./google", () => ({
  ...google,
  getRoutes: async () => {
    if (failRoutes) throw new Error("Routes API 500");
    return [{ routeId: "r0", polyline: "_p~iF~ps|U_ulLnnqC", durationMin: 7, distanceM: 500 }];
  },
}));
mock.module("./frames", () => ({
  collectFrames: async (_polyline: string, _everyM?: number, onFrame?: (f: Frame) => void) => {
    frames.forEach((f) => onFrame?.(f));
    return { frames, sampled: frames.length, uncovered: [] };
  },
}));
mock.module("./osm", () => ({ osmFlags: async () => [] }));
mock.module("../visuals/index.ts", () => ({ ...visuals, gradeFlags: async () => [] }));

const { scoutRouteDetailed, makeFlythrough } = await import("./index");
const enough = frames.length >= 10;

let scoutId = "";
test.skipIf(!enough)("scoutRouteDetailed emits start, routes, frames, verdicts, flags, progress, done in order", async () => {
  const events: (ScoutEvent & { t: number })[] = [];
  let thrown = 0;
  const onEvent = (e: ScoutEvent) => {
    events.push({ ...e, t: performance.now() });
    // A broken listener must not break the scout.
    if (e.type === "start" || (e.type === "verdict" && !thrown++)) throw new Error("listener bug");
  };
  const details = await scoutRouteDetailed("A", "B", "wheelchair", undefined, { scoutId: "test1", onEvent });
  scoutId = details.scoutId;
  expect(scoutId).toBe("test1");
  expect(events.every((e) => e.scoutId === "test1")).toBe(true);

  const types = events.map((e) => e.type);
  expect(types[0]).toBe("start");
  expect(types[1]).toBe("routes");
  expect(types.at(-1)).toBe("done");

  const frameEvents = events.filter((e) => e.type === "frame");
  expect(frameEvents.length).toBe(frames.length);
  expect(new Set(frameEvents.map((e) => e.frameId)).size).toBe(frames.length);
  expect(frameEvents[0]).toMatchObject({ routeId: "r0", frameId: `r0-${frames[0]!.i}`, imagePath: frames[0]!.imagePath, photoDate: frames[0]!.date });

  // One first-look verdict per frame, each after its frame.
  const firstLooks = events.filter((e) => e.type === "verdict" && !e.secondLook);
  expect(firstLooks.length).toBe(frames.length);
  for (const v of firstLooks) {
    const frame = frameEvents.find((f) => v.type === "verdict" && f.type === "frame" && f.frameId === v.frameId);
    expect(frame).toBeDefined();
    expect(events.indexOf(frame!)).toBeLessThan(events.indexOf(v));
  }

  // Final flags match the result and come before done.
  const flagEvents = events.filter((e) => e.type === "flag");
  expect(flagEvents.length).toBe(details.result.routes[0]!.flags.length);

  const last = events.filter((e) => e.type === "progress").at(-1)!;
  expect(last).toMatchObject({ pct: 100, photosChecked: frames.length, photosTotal: frames.length });

  // Cached frames are paced so the dashboard animates.
  const gaps = frameEvents.slice(1).map((e, k) => e.t - frameEvents[k]!.t);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8);
}, 30_000);

test.skipIf(!enough)("makeFlythrough writes a small 480x480 GIF of the recorded frames", async () => {
  const gif = await makeFlythrough(scoutId, "r0");
  expect(gif).toBe("out/flythrough/test1-r0.gif");
  const meta = await sharp(gif, { animated: true }).metadata();
  expect(meta.width).toBe(480);
  expect(meta.pageHeight).toBe(480);
  const forward = frames.filter((f) => !f.corner).length;
  expect(meta.pages).toBe(Math.min(forward, 38) + 2); // title + photos + end card
  expect(Bun.file(gif).size).toBeLessThan(3_000_000);
  expect(makeFlythrough("nope", "r0")).rejects.toThrow();
}, 60_000);

test("scoutRouteDetailed emits error and rethrows when the scout fails", async () => {
  failRoutes = true;
  const events: ScoutEvent[] = [];
  await expect(scoutRouteDetailed("A", "B", "wheelchair", undefined, { onEvent: (e) => events.push(e) })).rejects.toThrow("Routes API 500");
  failRoutes = false;
  expect(events.map((e) => e.type)).toEqual(["start", "error"]);
  expect(events[0]!.scoutId.length).toBeGreaterThan(0);
});
