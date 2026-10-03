// Merge repeat sightings into one flag, then score and pick a route.
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Flag, LatLng, RouteResult } from "../shared/types";

export const metersBetween = (a: LatLng, b: LatLng) =>
  distance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: "meters" });

// Flags of the same type within `withinM` of each other become one: the most confident
// sighting wins, and it keeps the worst severity any sighting reported.
export function mergeFlags(flags: Flag[], withinM = 15): Flag[] {
  const sorted = [...flags].sort((a, b) => b.confidence - a.confidence);
  const kept: Flag[] = [];
  for (const f of sorted) {
    const twin = kept.find((k) => k.type === f.type && metersBetween(k.location, f.location) <= withinM);
    if (twin) twin.severity = Math.max(twin.severity, f.severity) as Flag["severity"];
    else kept.push({ ...f });
  }
  return kept;
}

// A flag that likely stops this person outright: stairs, no curb ramp, a closed sidewalk.
export const BLOCKING_MIN_CONFIDENCE = 0.6;
export const isBlocking = (f: Flag) => f.severity === 3 && f.confidence >= BLOCKING_MIN_CONFIDENCE;

// The flag to route around first: most severe, then most confident.
export const worstFlag = (flags: Flag[]) =>
  [...flags].sort((a, b) => b.severity - a.severity || b.confidence - a.confidence)[0];

export const scoreFlags = (flags: Flag[]) =>
  flags.reduce((s, f) => s + f.severity ** 2 * f.confidence, 0);

// Lowest score wins. If two routes are within `closeBy` points, the shorter one wins.
export function pickRoute(routes: RouteResult[], closeBy = 1): RouteResult {
  return [...routes].sort((a, b) =>
    Math.abs(a.score - b.score) <= closeBy ? a.durationMin - b.durationMin : a.score - b.score,
  )[0]!;
}
