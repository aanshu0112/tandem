// scoutRoute(): walk every candidate route with Street View + Claude vision, return flags
// and a recommended route. A plain async function, not an agent.
import { decode } from "@googlemaps/polyline-codec";
import type { Flag, LatLng, Persona, RouteResult, ScoutResult, ScoutRoute } from "../shared/types";
import { getRoutes, type RouteInfo } from "./google";
import { collectFrames, type FrameSet } from "./frames";
import { batchCount, classifyFramesDetailed } from "./vision";
import { isBlocking, mergeFlags, metersBetween, pickRoute, scoreFlags, worstFlag } from "./score";
import { uncheckedStretches, type UncheckedStretch } from "./coverage";
import { detourWaypoints } from "./detour";

export { getRoutes } from "./google";
export { samplePoints } from "./sample";
export { collectFrames } from "./frames";
export { classifyFrames } from "./vision";
export { isBlocking, mergeFlags, pickRoute, scoreFlags } from "./score";
export { detourWaypoints } from "./detour";
export { uncheckedStretches, type UncheckedStretch } from "./coverage";

// Non-vision flag sources, run per route polyline: grades and alerts from visuals/,
// user reports from messaging/ (register with addFlagSource).
export type FlagSource = (polyline: string) => Promise<Flag[]>;
const sources: FlagSource[] = [];
export const addFlagSource = (fn: FlagSource) => void sources.push(fn);

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

async function extraFlags(polyline: string): Promise<Flag[]> {
  const results = await Promise.allSettled(sources.map((fn) => fn(polyline)));
  return results.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    console.warn("[scout] flag source failed:", r.reason);
    return [];
  });
}

// Everything scoutRoute returns, plus details ScoutResult has no field for yet, so
// messaging/ can call this directly until shared/types.ts gains them.
export type ScoutDetails = {
  result: ScoutResult;
  // Stretches of each route that couldn't be checked (no Street View, or indoor/tunnel panos).
  unchecked: Record<string, UncheckedStretch[]>; // by routeId
  // Waypoints each detour route goes through (routeIds starting with "d").
  via: Record<string, LatLng[]>;
  // True when every route, detours included, still has a blocking flag (e.g. stairs for a
  // wheelchair). The recommended route is then only the least bad one; say so to the user.
  allBlocked: boolean;
};

// Detour search: rounds of waypoints around the worst blocker, and how much longer than the
// fastest route a detour may be before it isn't worth suggesting.
const DETOUR_ROUNDS = 2;
const maxDetourMin = (fastestMin: number) => fastestMin * 2 + 10;

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
  const via: ScoutDetails["via"] = {};

  const scoutOne = async (r: RouteInfo, frames: FrameSet, onBatch?: () => void): Promise<RouteResult> => {
    const [vision, extra] = await Promise.all([
      classifyFramesDetailed(frames.frames, persona, { idPrefix: r.routeId, onBatch }),
      extraFlags(r.polyline),
    ]);
    const flags = mergeFlags([...vision.flags, ...extra]);
    flagsSoFar.push(...flags);
    unchecked[r.routeId] = uncheckedStretches([
      ...frames.uncovered.map(({ failed, ...u }) => ({
        ...u,
        reason: failed ? ("photo_failed" as const) : ("no_street_view" as const),
      })),
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
  };

  const results: RouteResult[] = await Promise.all(routes.map((r, k) => scoutOne(r, frameSets[k]!, tick)));

  // Every route is blocked: steer around the worst blocker on the best route so far, one or
  // two blocks to either side, and scout those routes too. Repeat once from the best detour.
  const isClear = (r: RouteResult) => !r.flags.some(isBlocking);
  const seen = new Set(results.map((r) => r.polyline));
  const fastest = Math.min(...results.map((r) => r.durationMin));
  let base = pickRoute(results);
  for (let round = 0; round < DETOUR_ROUNDS && !results.some(isClear); round++) {
    const blocker = worstFlag(base.flags.filter(isBlocking));
    if (!blocker) break;
    const start = decode(base.polyline)[0]!;
    const fromStart = (p: LatLng) => metersBetween(p, { lat: start[0], lng: start[1] });
    const candidates = detourWaypoints(base.polyline, blocker).map((w) =>
      [...(via[base.routeId] ?? []), w].sort((a, b) => fromStart(a) - fromStart(b)),
    );

    const found = await Promise.all(
      candidates.map((v) =>
        getRoutes(from, to, v)
          .then((rs) => (rs[0] ? { route: rs[0], via: v } : null))
          .catch(() => null), // a waypoint in the water or on a highway just has no route
      ),
    );
    const detours = found
      .filter((d) => d !== null)
      .filter((d) => d.route.durationMin <= maxDetourMin(fastest))
      .filter((d) => !seen.has(d.route.polyline) && seen.add(d.route.polyline));
    if (!detours.length) break;

    const scored = await Promise.all(
      detours.map(async (d, k) => {
        const r = { ...d.route, routeId: `d${round}${k}` };
        via[r.routeId] = d.via;
        return scoutOne(r, await collectFrames(r.polyline));
      }),
    );
    results.push(...scored);
    base = pickRoute(scored);
    onProgress?.(95 + round * 2, flagsSoFar);
  }

  const clear = results.filter(isClear);
  const best = pickRoute(clear.length ? clear : results);
  onProgress?.(100, best.flags);
  return {
    result: { from, to, persona, routes: results, recommendedRouteId: best.routeId },
    unchecked,
    via,
    allBlocked: !clear.length,
  };
}
