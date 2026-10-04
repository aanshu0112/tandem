// Night mode (persona night_solo): what daytime Street View can't show. From OpenStreetMap:
// which stretches have street lights, which run on footpaths away from roads, and the good
// things along the way (blue-light emergency phones, places open right now). Framed as facts
// about the path, never as labels about a neighborhood.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import opening_hours from "opening_hours";
import type { Flag, Highlight, LatLng } from "../shared/types";
import { CACHE_DIR } from "./google";
import { overpass, type OsmElement } from "./overpass";
import { samplePoints } from "./sample";
import { metersBetween } from "./score";

export const STEP_M = 10; // sample spacing along the route
const WAY_NEAR_M = 12; // the way a route point is "on"
const ROAD_NEAR_M = 25; // a road this close means you're not cut off from traffic and people
const POI_NEAR_M = 40; // phones and open places this close are "on the way"
const MIN_UNLIT_M = 40;
const LONG_UNLIT_M = 200;
const MIN_ISOLATED_M = 60;
const MAX_OPEN_PLACES = 5;

const LIT_YES = new Set(["yes", "24/7", "automatic", "sunset-sunrise", "dusk-dawn", "interval", "limited"]);
const PATHS = new Set(["footway", "path", "track", "steps", "cycleway", "bridleway"]);
const ROADS = /^(primary|secondary|tertiary|residential|unclassified|service|living_street|trunk)(_link)?$/;

export type Light = "lit" | "unlit" | "unknown";
export type RoutePoint = LatLng & { distM: number; light: Light; isolated: boolean; name?: string };
export type NightInfo = { flags: Flag[]; highlights: Highlight[]; litFraction: number };

type Way = { tags: Record<string, string>; pts: LatLng[] };

// ---- geometry: point-to-polyline distance in a local flat projection (fine at these scales) ----
const M_PER_DEG_LAT = 110_540;
function distToWay(p: LatLng, way: LatLng[]): number {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: LatLng) => [(q.lng - p.lng) * kx, (q.lat - p.lat) * M_PER_DEG_LAT] as const;
  let best = Infinity;
  for (let i = 0; i < way.length; i++) {
    const [ax, ay] = xy(way[i]!);
    if (way.length === 1) return Math.hypot(ax, ay);
    if (i === 0) continue;
    const [bx, by] = xy(way[i - 1]!);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function lightOf(tags: Record<string, string>): Light {
  const lit = tags.lit?.toLowerCase();
  if (!lit) return "unknown";
  if (lit === "no") return "unlit";
  if (LIT_YES.has(lit) || /^\d/.test(lit) || lit.includes(":")) return "lit"; // "lit=18:00-01:00" style hours count as lit
  return "unknown";
}

const isPath = (tags: Record<string, string>) =>
  PATHS.has(tags.highway ?? "") && tags.footway !== "sidewalk" && tags.footway !== "crossing";

// Each sample point: the way it's on (nearest within WAY_NEAR_M), its lighting, and whether it's
// a footpath with no road nearby.
export function classifyPoints(pts: (LatLng & { distM: number })[], ways: Way[]): RoutePoint[] {
  return pts.map((p) => {
    let on: Way | undefined;
    let onD = WAY_NEAR_M;
    let roadNear = false;
    for (const w of ways) {
      const d = distToWay(p, w.pts);
      if (d <= onD) [on, onD] = [w, d];
      if (d <= ROAD_NEAR_M && ROADS.test(w.tags.highway ?? "")) roadNear = true;
    }
    return {
      lat: p.lat,
      lng: p.lng,
      distM: p.distM,
      light: on ? lightOf(on.tags) : "unknown",
      isolated: !!on && isPath(on.tags) && !roadNear,
      ...(on?.tags.name && { name: on.tags.name }),
    };
  });
}

// A lone unmapped point between two lit ones (a short crossing or a gap in the tagging) is lit.
export function smoothLight(points: RoutePoint[]): RoutePoint[] {
  return points.map((p, i) =>
    p.light === "unknown" && points[i - 1]?.light === "lit" && points[i + 1]?.light === "lit" ? { ...p, light: "lit" } : p,
  );
}

const isDark = (p: RoutePoint) => p.light === "unlit" || (p.light === "unknown" && p.isolated);

// Runs of consecutive points matching `pick`, bridging single-point gaps.
function runs(points: RoutePoint[], pick: (p: RoutePoint) => boolean): RoutePoint[][] {
  const out: RoutePoint[][] = [];
  let cur: RoutePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (pick(p)) cur.push(p);
    else if (cur.length && points[i + 1] && pick(points[i + 1]!)) cur.push(p); // a one-point gap
    else if (cur.length) (out.push(cur), (cur = []));
  }
  if (cur.length) out.push(cur);
  return out;
}

const spanOf = (run: RoutePoint[]) => ({
  startM: Math.round(run[0]!.distM),
  lengthM: Math.round(run.at(-1)!.distM - run[0]!.distM + STEP_M),
});
const about = (m: number) => `About ${m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50} m`;
function nameOf(run: RoutePoint[]): string | undefined {
  const counts = new Map<string, number>();
  for (const p of run) if (p.name) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
const onName = (name?: string) => (name ? ` on ${name}` : "");
const overlap = (a: { startM: number; lengthM: number }, b: { startM: number; lengthM: number }) =>
  Math.max(0, Math.min(a.startM + a.lengthM, b.startM + b.lengthM) - Math.max(a.startM, b.startM));

// Unlit and isolated stretches → flags. A stretch that is both becomes one "unlit" flag that
// says it's also away from roads.
export function buildStretches(points: RoutePoint[], idPrefix = "night"): Flag[] {
  const flags: Flag[] = [];
  const unlit = runs(points, isDark)
    .map((run) => ({ run, span: spanOf(run) }))
    .filter((s) => s.span.lengthM >= MIN_UNLIT_M);
  const isolated = runs(points, (p) => p.isolated)
    .map((run) => ({ run, span: spanOf(run) }))
    .filter((s) => s.span.lengthM >= MIN_ISOLATED_M);

  for (const { run, span } of unlit) {
    const mapped = run.filter((p) => p.light === "unlit").length;
    const confirmed = mapped * 2 >= run.length; // mostly tagged lit=no, not inferred
    const alsoIsolated = isolated.some((s) => overlap(s.span, span) >= Math.min(s.span.lengthM, span.lengthM) / 2);
    const mid = run[Math.floor(run.length / 2)]!;
    const name = nameOf(run);
    const note = confirmed
      ? `${about(span.lengthM)} with no street lights${onName(name)}${alsoIsolated ? ", on a footpath away from roads" : ""}`
      : `${about(span.lengthM)} on a footpath away from roads, with no street lights mapped${onName(name)}`;
    flags.push({
      id: `${idPrefix}-unlit-${span.startM}`,
      type: "unlit",
      severity: span.lengthM >= LONG_UNLIT_M ? 3 : 2,
      confidence: confirmed ? 0.85 : 0.6,
      location: { lat: mid.lat, lng: mid.lng },
      source: "osm",
      note,
      stretch: span,
    });
  }
  for (const { run, span } of isolated) {
    // Already said as part of an unlit flag.
    if (unlit.some((u) => overlap(u.span, span) >= span.lengthM / 2)) continue;
    const mid = run[Math.floor(run.length / 2)]!;
    flags.push({
      id: `${idPrefix}-isolated-${span.startM}`,
      type: "isolated",
      severity: 2,
      confidence: 0.7,
      location: { lat: mid.lat, lng: mid.lng },
      source: "osm",
      note: `${about(span.lengthM)} on a footpath away from roads${onName(nameOf(run))}`,
      stretch: span,
    });
  }
  return flags;
}

export const litFractionOf = (points: RoutePoint[]) =>
  points.length ? Math.round((points.filter((p) => p.light === "lit").length / points.length) * 100) / 100 : 0;

// "2am", "11:30pm"
const clock = (d: Date) => {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""}${d.getHours() < 12 ? "am" : "pm"}`;
};

// The opening_hours library evaluates in this machine's local time zone.
export function openNote(hours: string, at: number): string | undefined {
  if (hours.trim() === "24/7") return "open 24 hours";
  try {
    const oh = new opening_hours(hours, null, { mode: 0 } as never);
    const when = new Date(at);
    if (!oh.getState(when)) return undefined;
    const next = oh.getNextChange(when, new Date(at + 24 * 3600_000));
    return next ? `open until ${clock(next)}` : "open 24 hours";
  } catch {
    return undefined; // hours we can't read: don't claim it's open
  }
}

function highlightsFrom(elements: OsmElement[], pts: LatLng[], at: number): Highlight[] {
  const near = (loc: LatLng) => Math.min(...pts.map((p) => metersBetween(p, loc)));
  const where = (el: OsmElement): LatLng | undefined =>
    el.lat !== undefined && el.lon !== undefined
      ? { lat: el.lat, lng: el.lon }
      : el.center && { lat: el.center.lat, lng: el.center.lon };

  const phones: Highlight[] = [];
  const open: (Highlight & { d: number })[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const loc = where(el);
    if (!loc) continue;
    const phone = tags.emergency === "phone" || tags.amenity === "emergency_phone";
    if (phone) {
      if (near(loc) > POI_NEAR_M || phones.some((h) => metersBetween(h.location, loc) < 15)) continue;
      phones.push({ type: "blue_light_phone", location: loc, note: "Blue-light emergency phone" });
    } else if (tags.opening_hours && tags.name) {
      const d = near(loc);
      if (d > POI_NEAR_M) continue;
      const status = openNote(tags.opening_hours, at);
      if (status) open.push({ type: "open_place", location: loc, note: `${tags.name}, ${status}`, d });
    }
  }
  const places = open
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_OPEN_PLACES)
    .map(({ d, ...h }) => h);
  return [...phones, ...places];
}

async function fetchElements(polyline: string, line: string): Promise<OsmElement[]> {
  const cachePath = `${CACHE_DIR}/night/${createHash("sha1").update(polyline).digest("hex")}.json`;
  if (existsSync(cachePath)) return Bun.file(cachePath).json();
  // Ways out to the road check distance, plus phones and anything with opening hours.
  const query = `[out:json][timeout:25];
way["highway"](around:${ROAD_NEAR_M},${line})->.ways;
.ways out tags geom;
(
  node["emergency"="phone"](around:${POI_NEAR_M},${line});
  node["amenity"="emergency_phone"](around:${POI_NEAR_M},${line});
  nwr["opening_hours"]["amenity"](around:${POI_NEAR_M},${line});
  nwr["opening_hours"]["shop"](around:${POI_NEAR_M},${line});
  nwr["opening_hours"]["leisure"](around:${POI_NEAR_M},${line});
)->.pois;
.pois out tags center;`;
  const { elements } = await overpass(query, 30_000);
  await mkdir(`${CACHE_DIR}/night`, { recursive: true });
  await Bun.write(cachePath, JSON.stringify(elements));
  return elements;
}

export async function nightFlags(polyline: string, at: number): Promise<NightInfo> {
  const pts = samplePoints(polyline, STEP_M);
  if (pts.length < 2) return { flags: [], highlights: [], litFraction: 0 };
  const line = samplePoints(polyline, 20)
    .map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
    .join(",");
  const elements = await fetchElements(polyline, line);

  const ways: Way[] = elements
    .filter((el) => el.type === "way" && el.geometry?.length && el.tags?.highway)
    .map((el) => ({ tags: el.tags!, pts: el.geometry!.map((g) => ({ lat: g.lat, lng: g.lon })) }));
  const points = smoothLight(classifyPoints(pts, ways));
  return {
    flags: buildStretches(points),
    highlights: highlightsFrom(elements.filter((el) => !el.tags?.highway || el.type === "node"), pts, at),
    litFraction: litFractionOf(points),
  };
}
