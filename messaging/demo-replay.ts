// Replays a realistic Noyes → Goldwin Smith scout as ScoutEvents, on a loop, so the dashboard can be
// built and rehearsed without running the real scout. Run: bun run dashboard:demo
import fixture from "../fixtures/demo-scout.json";
import type { Flag, ScoutEvent, ScoutResult } from "../shared/types";
import { decodePolyline, distanceM, sampleAlong } from "../visuals/polyline";
import { publish, startServer } from "./server";

const result = fixture as unknown as ScoutResult;
const FRAME_EVERY_M = 15;
const FRAME_GAP_MS = 90; // a new photo every ~90ms across all routes
const VERDICT_LAG_MS = 1400; // Claude answers in batches, a beat behind the photos
const BATCH = 5;
const PAUSE_BETWEEN_RUNS_MS = 10_000;

// The Ithaca photos we have. Frames without a flag cycle through the clear ones.
const flagPhotos = new Set(result.routes.flatMap((r) => r.flags.map((f) => f.imagePath).filter(Boolean)));
// P5-9ho… is a staircase off both routes (see the fixture's _comment), so it can't pose as a clear path.
const NOT_CLEAR = ["fixtures/demo-frames/P5-9hoVUFxI8OACnJzcl-A.jpg"];
const clearPhotos = [...new Bun.Glob("fixtures/demo-frames/*.jpg").scanSync(".")]
  .filter((p) => !flagPhotos.has(p) && !NOT_CLEAR.includes(p))
  .sort();

type Timed = { t: number; e: ScoutEvent };

function timeline(scoutId: string): Timed[] {
  const out: Timed[] = [];
  const at = (t: number, e: ScoutEvent) => out.push({ t, e });

  at(0, { type: "start", scoutId, from: result.from, to: result.to, persona: result.persona, at: Date.now() });
  at(900, { type: "routes", scoutId, routes: result.routes.map(({ routeId, polyline, durationMin }) => ({ routeId, polyline, durationMin })) });

  // Frames along each route, interleaved so all routes "walk" at once.
  const perRoute = result.routes.map((r) => {
    const points = sampleAlong(decodePolyline(r.polyline), FRAME_EVERY_M);
    let distM = 0;
    return points.map((p, i) => {
      if (i > 0) distM += distanceM(points[i - 1]!, p);
      const visionFlag = r.flags.find((f) => f.source === "vision" && f.imagePath && distanceM(f.location, p) < FRAME_EVERY_M / 2 + 3);
      const mappedFlag = r.flags.find((f) => f.source === "osm" && f.imagePath && distanceM(f.location, p) < FRAME_EVERY_M / 2 + 3);
      const flag = visionFlag ?? mappedFlag;
      return {
        routeId: r.routeId,
        frameId: `${r.routeId}-${i}`,
        location: p,
        heading: 0,
        distM: Math.round(distM),
        imagePath: flag?.imagePath ?? clearPhotos[(i + r.routeId.charCodeAt(0)) % clearPhotos.length]!,
        flag,
      };
    });
  });
  const frames = interleave(perRoute);
  const total = frames.length;
  const start = 1500;
  frames.forEach((f, k) => {
    const t = start + k * FRAME_GAP_MS;
    at(t, { type: "frame", scoutId, routeId: f.routeId, frameId: f.frameId, location: f.location, heading: f.heading, distM: f.distM, imagePath: f.imagePath, photoDate: "2009-07" });
  });

  // Verdicts land in batches, with progress after each batch.
  for (let k = 0; k < total; k += BATCH) {
    const batch = frames.slice(k, k + BATCH);
    const t = start + (k + BATCH - 1) * FRAME_GAP_MS + VERDICT_LAG_MS;
    batch.forEach((f, j) => {
      const flag = f.flag;
      at(t + j * 40, flag
        ? { type: "verdict", scoutId, routeId: f.routeId, frameId: f.frameId, verdict: flag.type, severity: flag.severity, confidence: flag.confidence, box: flag.box ?? { x: 0.3, y: 0.5, w: 0.4, h: 0.35 }, note: flag.note }
        : { type: "verdict", scoutId, routeId: f.routeId, frameId: f.frameId, verdict: "none", confidence: 0.9 });
    });
    const checked = Math.min(total, k + BATCH);
    at(t + BATCH * 40, { type: "progress", scoutId, pct: Math.round(30 + (65 * checked) / total), photosChecked: checked, photosTotal: total });
  }

  // Final merged flags per route, then the result.
  const end = Math.max(...out.map((x) => x.t)) + 800;
  result.routes.forEach((r, i) => r.flags.forEach((flag: Flag, j) => at(end + i * 300 + j * 150, { type: "flag", scoutId, routeId: r.routeId, flag })));
  at(end + 1500, { type: "progress", scoutId, pct: 100, photosChecked: total, photosTotal: total });
  at(end + 1700, { type: "done", scoutId, result });
  return out.sort((a, b) => a.t - b.t);
}

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) {
    for (const l of lists) {
      const item = l[i];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}

async function play() {
  for (let run = 1; ; run++) {
    const events = timeline(`demo-${run}`);
    const t0 = Date.now();
    for (const { t, e } of events) {
      const wait = t0 + t - Date.now();
      if (wait > 0) await Bun.sleep(wait);
      publish(e);
    }
    console.log(`demo run ${run}: ${events.length} events in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await Bun.sleep(PAUSE_BETWEEN_RUNS_MS);
  }
}

startServer();
play();
