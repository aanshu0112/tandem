// scoutRoute(): walk every candidate route with Street View + Claude vision, return flags
// and a recommended route. A plain async function, not an agent.
import type { Flag, Persona, RouteResult, ScoutRoute } from "../shared/types";
import { getRoutes } from "./google";
import { collectFrames } from "./frames";
import { batchCount, classifyFrames } from "./vision";
import { mergeFlags, pickRoute, scoreFlags } from "./score";

export { getRoutes } from "./google";
export { samplePoints } from "./sample";
export { collectFrames } from "./frames";
export { classifyFrames } from "./vision";
export { mergeFlags, pickRoute, scoreFlags } from "./score";

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

export const scoutRoute: ScoutRoute = async (from, to, persona: Persona, onProgress) => {
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

  const results: RouteResult[] = await Promise.all(
    routes.map(async (r, k) => {
      const [vision, extra] = await Promise.all([
        classifyFrames(frameSets[k]!.frames, persona, { idPrefix: r.routeId, onBatch: tick }),
        extraFlags(r.polyline),
      ]);
      const flags = mergeFlags([...vision, ...extra]);
      flagsSoFar.push(...flags);
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
  return { from, to, persona, routes: results, recommendedRouteId: best.routeId };
};
