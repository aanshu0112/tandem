// scoutRoute(): walk every candidate route with Street View + Claude vision, return flags
// and a recommended route. A plain async function, not an agent.
import type { Flag, OnScoutEvent, Persona, RouteResult, ScoutEvent, ScoutResult, ScoutRoute } from "../shared/types";
import { getRoutes } from "./google";
import { collectFrames } from "./frames";
import { batchCount, classifyFramesDetailed, cleanNote, type FrameVerdict } from "./vision";
import { mergeFlags, metersBetween, pickRoute, scoreRoute } from "./score";
import { osmFlags } from "./osm";
import { nightFlags, type NightInfo } from "./night";
import type { Frame } from "./frames";
import { uncheckedStretches, type UncheckedStretch } from "./coverage";
import { rememberScout, routeRecord } from "./flythrough";

export { getRoutes } from "./google";
export { samplePoints } from "./sample";
export { collectFrames } from "./frames";
export { classifyFrames } from "./vision";
export { mergeFlags, metersBetween, pickRoute, scoreFlags, scoreRoute } from "./score";
export { nightFlags } from "./night";
export { uncheckedStretches, type UncheckedStretch } from "./coverage";
export { makeFlythrough } from "./flythrough";
export { checkEntrance } from "./entrance";

// Non-vision flag sources, run per route polyline: grades and alerts from visuals/,
// user reports from messaging/ (register with addFlagSource). Each gets the persona and the time
// the route is judged for; a source that only takes the polyline still works.
export type FlagSourceCtx = { persona: Persona; at: number };
export type FlagSource = (polyline: string, ctx: FlagSourceCtx) => Promise<Flag[]>;
const sources: FlagSource[] = [];
export const addFlagSource = (fn: FlagSource) => void sources.push(fn);
addFlagSource(osmFlags); // mapped stairs and raised curbs, which old or missing photos can miss

let visualsLoaded = false;
async function loadVisualsSources() {
  if (visualsLoaded) return;
  visualsLoaded = true;
  try {
    const path = "../visuals/index.ts"; // a variable, so the type checker doesn't require it yet
    const v = await import(path);
    // Steep grades matter for wheels, not for someone walking alone at night.
    const gradeFlags = v.gradeFlags;
    if (typeof gradeFlags === "function")
      addFlagSource(async (polyline, ctx) => (ctx.persona === "night_solo" ? [] : gradeFlags(polyline)));
    if (typeof v.getAlerts === "function") addFlagSource(v.getAlerts);
  } catch {
    // visuals/ hasn't landed yet. Vision flags only.
  }
}

// Map and elevation flags have no photo. Borrow the nearest forward-facing Street View frame
// so the user can see the spot.
const PHOTO_WITHIN_M = 25;
function withNearestPhoto(flag: Flag, frames: Frame[]): Flag {
  if (flag.imagePath) return flag;
  let best: Frame | undefined;
  let bestD = PHOTO_WITHIN_M;
  for (const f of frames) {
    if (f.corner) continue;
    const d = metersBetween(flag.location, f);
    if (d <= bestD) [best, bestD] = [f, d];
  }
  return best ? { ...flag, imagePath: best.imagePath, photoDate: best.date } : flag;
}

async function extraFlags(polyline: string, ctx: FlagSourceCtx): Promise<Flag[]> {
  const results = await Promise.allSettled(sources.map(async (fn) => fn(polyline, ctx)));
  return results.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    console.warn("[scout] flag source failed:", r.reason);
    return [];
  });
}

// Night mode only: lighting, isolation and the good things along the way. A failure (Overpass down)
// leaves the route without night data rather than failing the scout.
async function nightInfo(routeId: string, polyline: string, persona: Persona, at: number): Promise<NightInfo | undefined> {
  if (persona !== "night_solo") return undefined;
  try {
    const n = await nightFlags(polyline, at);
    return { ...n, flags: n.flags.map((f) => ({ ...f, id: `${routeId}-${f.id}` })) };
  } catch (err) {
    console.warn("[scout] night data failed:", (err as Error).message ?? err);
    return undefined;
  }
}

// Live events for the dashboard. Photos and verdicts go out at most one every ~50 ms, so a
// warm-cache scout (where everything is instant) still animates. A long backlog drains
// faster, so the dashboard never lags far behind. A throwing listener never breaks the scout.
function eventQueue(onEvent?: OnScoutEvent) {
  const queue: ScoutEvent[] = [];
  let draining: Promise<void> | undefined;
  let last = 0;
  const send = (e: ScoutEvent) => {
    try {
      onEvent?.(e);
    } catch (err) {
      console.warn("[scout] onEvent failed:", err);
    }
  };
  async function drain() {
    while (queue.length) {
      const e = queue[0]!;
      if (e.type === "frame" || e.type === "verdict") {
        const gap = Math.min(50, Math.max(10, 4000 / queue.length));
        const wait = last + gap - performance.now();
        if (wait > 0) await Bun.sleep(wait);
        last = performance.now();
      }
      send(queue.shift()!);
    }
    draining = undefined;
  }
  return {
    emit(e: ScoutEvent) {
      if (!onEvent) return;
      queue.push(e);
      draining ??= Promise.resolve().then(drain); // async, so drain() can't finish before it's stored
    },
    flushed: () => draining ?? Promise.resolve(),
  };
}

const verdictFields = (v: FrameVerdict) => {
  const barrier = v.issue !== "none" && v.issue !== "not_a_street";
  const c = (n: number) => Math.min(1, Math.max(0, n));
  return {
    verdict: v.issue,
    ...(barrier && { severity: Math.min(3, Math.max(1, Math.round(v.severity))) as 1 | 2 | 3 }),
    confidence: c(v.confidence),
    ...(v.box && { box: { x: c(v.box.x), y: c(v.box.y), w: c(v.box.w), h: c(v.box.h) } }),
    ...(v.note && { note: cleanNote(v.note) }),
  };
};

// Everything scoutRoute returns, plus the stretches of each route that couldn't be checked
// (no Street View, or only indoor/tunnel panos). ScoutResult has no field for these yet,
// so messaging/ can call this directly until shared/types.ts gains one.
export type ScoutDetails = {
  result: ScoutResult;
  unchecked: Record<string, UncheckedStretch[]>; // by routeId
  scoutId: string; // for makeFlythrough
};

// `at`: when the trip happens (ms), for night mode's opening hours. Defaults to now.
export type ScoutOpts = { scoutId?: string; onEvent?: OnScoutEvent; at?: number };

export const scoutRoute: ScoutRoute = async (from, to, persona, onProgress) =>
  (await scoutRouteDetailed(from, to, persona, onProgress)).result;

export async function scoutRouteDetailed(
  from: string,
  to: string,
  persona: Persona,
  onProgress?: (pct: number, flagsSoFar: Flag[]) => void,
  opts: ScoutOpts = {},
): Promise<ScoutDetails> {
  const scoutId = opts.scoutId ?? crypto.randomUUID().slice(0, 8);
  const at = opts.at ?? Date.now();
  const ctx: FlagSourceCtx = { persona, at };
  const events = eventQueue(opts.onEvent);
  const emit = events.emit;
  const rec = rememberScout(scoutId, from, to); // for makeFlythrough
  emit({ type: "start", scoutId, from, to, persona, at: Date.now() });

  try {
    await loadVisualsSources();
    const routes = await getRoutes(from, to);
    emit({ type: "routes", scoutId, routes: routes.map(({ routeId, polyline, durationMin }) => ({ routeId, polyline, durationMin })) });
    onProgress?.(5, []);

    // Frames for every route in parallel. Repeat panos across routes hit the image cache.
    let photosTotal = 0;
    const frameSets = await Promise.all(
      routes.map((r) =>
        collectFrames(r.polyline, undefined, (f) => {
          photosTotal++;
          routeRecord(rec, r.routeId).frames.push(f);
          emit({
            type: "frame",
            scoutId,
            routeId: r.routeId,
            frameId: `${r.routeId}-${f.i}`,
            location: { lat: f.lat, lng: f.lng },
            heading: f.heading,
            distM: f.distM,
            imagePath: f.imagePath,
            ...(f.date && { photoDate: f.date }),
          });
        }),
      ),
    );
    onProgress?.(30, []);
    emit({ type: "progress", scoutId, pct: 30, photosChecked: 0, photosTotal });

    const totalBatches = frameSets.reduce((n, fs) => n + batchCount(fs.frames, persona), 0);
    let doneBatches = 0;
    let photosChecked = 0;
    const flagsSoFar: Flag[] = [];
    const tick = () => {
      doneBatches++;
      onProgress?.(30 + Math.round((65 * doneBatches) / Math.max(1, totalBatches)), flagsSoFar);
    };

    const unchecked: ScoutDetails["unchecked"] = {};
    const fastestMin = Math.min(...routes.map((r) => r.durationMin));
    const results: RouteResult[] = await Promise.all(
      routes.map(async (r, k) => {
        const fs = frameSets[k]!;
        const record = routeRecord(rec, r.routeId);
        const onVerdict = (f: Frame, v: FrameVerdict, secondLook?: boolean) => {
          record.verdicts.set(f, v);
          const frameId = `${r.routeId}-${f.i}`;
          emit({ type: "verdict", scoutId, routeId: r.routeId, frameId, ...verdictFields(v), ...(secondLook && { secondLook }) });
          if (secondLook) return;
          photosChecked++;
          const pct = 30 + Math.round((65 * photosChecked) / Math.max(1, photosTotal));
          emit({ type: "progress", scoutId, pct, photosChecked, photosTotal });
        };
        const [vision, extra, night] = await Promise.all([
          classifyFramesDetailed(fs.frames, persona, { idPrefix: r.routeId, onBatch: tick, onVerdict }),
          extraFlags(r.polyline, ctx),
          nightInfo(r.routeId, r.polyline, persona, at),
        ]);
        const flags = mergeFlags([
          ...vision.flags,
          ...[...extra, ...(night?.flags ?? [])].map((f) => withNearestPhoto(f, fs.frames)),
        ]);
        flagsSoFar.push(...flags);
        record.flags = flags;
        for (const flag of flags) emit({ type: "flag", scoutId, routeId: r.routeId, flag });
        unchecked[r.routeId] = uncheckedStretches([
          ...fs.uncovered.map((u) => ({ ...u, reason: "no_street_view" as const })),
          ...vision.notAStreet
            .filter((f) => !f.corner) // a sideways corner view facing a wall doesn't mean the path is unchecked
            .map((f) => ({ lat: f.lat, lng: f.lng, distM: f.distM, reason: "not_a_street" as const })),
        ]);
        const route: RouteResult = {
          routeId: r.routeId,
          polyline: r.polyline,
          durationMin: r.durationMin,
          flags,
          score: 0,
          ...(night && { highlights: night.highlights, litFraction: night.litFraction }),
        };
        route.score = scoreRoute(route, persona, fastestMin);
        return route;
      }),
    );

    const best = pickRoute(results);
    const result: ScoutResult = {
      from,
      to,
      persona,
      routes: results,
      recommendedRouteId: best.routeId,
      googleDefaultRouteId: routes[0]?.routeId, // Google returns its own pick first
      at,
    };
    rec.result = result;
    onProgress?.(100, best.flags);
    emit({ type: "progress", scoutId, pct: 100, photosChecked, photosTotal });
    emit({ type: "done", scoutId, result });
    await events.flushed(); // a warm-cache run returns once the dashboard has caught up
    return { result, unchecked, scoutId };
  } catch (e) {
    emit({ type: "error", scoutId, message: (e as Error).message ?? String(e) });
    await events.flushed();
    throw e;
  }
}
