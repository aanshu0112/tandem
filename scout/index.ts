// scoutRoute(): walk every candidate route with Street View + Claude vision, return flags
// and a recommended route. A plain async function, not an agent.
import type { Flag, Persona, RouteResult, ScoutResult, ScoutRoute } from "../shared/types";
import { getRoutes } from "./google";
import { collectFrames } from "./frames";
import { batchCount, classifyFramesDetailed } from "./vision";
import { mergeFlags, metersBetween, pickRoute, scoreFlags } from "./score";
import { osmFlags } from "./osm";
import type { Frame } from "./frames";
import { uncheckedStretches, type UncheckedStretch } from "./coverage";

export { getRoutes } from "./google";
export { samplePoints } from "./sample";
export { collectFrames } from "./frames";
export { classifyFrames } from "./vision";
export { mergeFlags, metersBetween, pickRoute, scoreFlags } from "./score";
export { uncheckedStretches, type UncheckedStretch } from "./coverage";

// Non-vision flag sources, run per route polyline: grades and alerts from visuals/,
// user reports from messaging/ (register with addFlagSource).
export type FlagSource = (polyline: string) => Promise<Flag[]>;
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
    if (typeof v.gradeFlags === "function") addFlagSource(v.gradeFlags);
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

async function extraFlags(polyline: string): Promise<Flag[]> {
  const results = await Promise.allSettled(sources.map((fn) => fn(polyline)));
  return results.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    console.warn("[scout] flag source failed:", r.reason);
    return [];
  });
}

// Everything scoutRoute returns, plus the stretches of each route that couldn't be checked
// (no Street View, or only indoor/tunnel panos). ScoutResult has no field for these yet,
// so messaging/ can call this directly until shared/types.ts gains one.
export type ScoutDetails = {
  result: ScoutResult;
  unchecked: Record<string, UncheckedStretch[]>; // by routeId
};

export const scoutRoute: ScoutRoute = async (from, to, persona, onProgress) =>
  (await scoutRouteDetailed(from, to, persona, onProgress)).result;

export async function scoutRouteDetailed(
  from: string,
  to: string,
  persona: Persona,
  onProgress?: (pct: number, flagsSoFar: Flag[]) => void,
): Promise<ScoutDetails> {
  await loadVisualsSources();
  const routes = await getRoutes(from, to);
  onProgress?.(5, []);

  // Frames for every route in parallel. Repeat panos across routes hit the image cache.
  const frameSets = await Promise.all(routes.map((r) => collectFrames(r.polyline)));
  onProgress?.(30, []);

  const totalBatches = frameSets.reduce((n, fs) => n + batchCount(fs.frames, persona), 0);
  let doneBatches = 0;
  const flagsSoFar: Flag[] = [];
  const tick = () => {
    doneBatches++;
    onProgress?.(30 + Math.round((65 * doneBatches) / Math.max(1, totalBatches)), flagsSoFar);
  };

  const unchecked: ScoutDetails["unchecked"] = {};
  const results: RouteResult[] = await Promise.all(
    routes.map(async (r, k) => {
      const fs = frameSets[k]!;
      const [vision, extra] = await Promise.all([
        classifyFramesDetailed(fs.frames, persona, { idPrefix: r.routeId, onBatch: tick }),
        extraFlags(r.polyline),
      ]);
      const flags = mergeFlags([...vision.flags, ...extra.map((f) => withNearestPhoto(f, fs.frames))]);
      flagsSoFar.push(...flags);
      unchecked[r.routeId] = uncheckedStretches([
        ...fs.uncovered.map((u) => ({ ...u, reason: "no_street_view" as const })),
        ...vision.notAStreet
          .filter((f) => !f.corner) // a sideways corner view facing a wall doesn't mean the path is unchecked
          .map((f) => ({ lat: f.lat, lng: f.lng, distM: f.distM, reason: "not_a_street" as const })),
      ]);
      return {
        routeId: r.routeId,
        polyline: r.polyline,
        durationMin: r.durationMin,
        flags,
        score: Math.round(scoreFlags(flags) * 100) / 100,
      };
    }),
  );

  const best = pickRoute(results);
  onProgress?.(100, best.flags);
  return {
    result: { from, to, persona, routes: results, recommendedRouteId: best.routeId },
    unchecked,
  };
}
