// OpenStreetMap barriers along a route: mapped stairs and raised curbs. These catch what
// old or missing Street View photos can't. Registered as a flag source in index.ts.
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Flag, LatLng, Persona } from "../shared/types";
import { overpass, type OsmElement } from "./overpass";
import { CACHE_DIR } from "./google";
import { samplePoints } from "./sample";
import { metersBetween } from "./score";

const STEPS_M = 8; // a stairway this close to the route line is on it
const KERB_M = 4; // a route that crosses at the curb passes within a few meters; one running alongside is farther
const START_SKIP_M = 15; // you're already standing at the start, so barriers right there don't count

// Stairs and curbs matter for wheels, not for someone walking alone at night (night.ts covers that).
// A stroller can usually be carried up a few steps or bumped over a curb, so those weigh less.
export async function osmFlags(polyline: string, ctx?: { persona: Persona }): Promise<Flag[]> {
  const persona = ctx?.persona ?? "wheelchair";
  if (persona === "night_solo") return [];
  const stroller = persona === "stroller";
  const pts = samplePoints(polyline, 10);
  if (pts.length < 2) return [];

  const cachePath = `${CACHE_DIR}/osm/${createHash("sha1").update(polyline).digest("hex")}.json`;
  let elements: OsmElement[];
  if (existsSync(cachePath)) {
    elements = await Bun.file(cachePath).json();
  } else {
    const line = pts.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(",");
    const query = `[out:json][timeout:20];
(
  way["highway"="steps"](around:${STEPS_M},${line});
  node["kerb"~"^(raised|rolled)$"](around:${KERB_M},${line});
);
out geom tags;`;
    const res = await overpass(query);
    elements = res.elements;
    await mkdir(`${CACHE_DIR}/osm`, { recursive: true });
    await Bun.write(cachePath, JSON.stringify(elements));
  }

  const flags: Flag[] = [];
  const start = pts[0]!;
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "way" && el.geometry?.length) {
      const hasRamp = tags.ramp === "yes" || tags["ramp:wheelchair"] === "yes";
      const count = Number(tags.step_count);
      const location = closestTo(el.geometry.map((g) => ({ lat: g.lat, lng: g.lon })), pts);
      if (metersBetween(location, start) < START_SKIP_M) continue;
      flags.push({
        id: `osm-steps-${el.id}`,
        type: "steps",
        severity: hasRamp ? 1 : stroller ? 2 : 3,
        confidence: 0.95, // mapped by people who walked it
        location,
        source: "osm",
        note: `${Number.isFinite(count) && count > 0 ? `${count} steps` : "Stairs"} on the path${hasRamp ? " (has a ramp)" : ", no ramp"}`,
      });
    } else if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      const location = { lat: el.lat, lng: el.lon };
      if (metersBetween(location, start) < START_SKIP_M) continue;
      if (!pts.some((p) => metersBetween(p, location) <= KERB_M)) continue;
      flags.push({
        id: `osm-kerb-${el.id}`,
        type: "no_curb_ramp",
        severity: stroller ? 1 : tags.kerb === "raised" ? 3 : 2,
        confidence: 0.85,
        location,
        source: "osm",
        note: tags.kerb === "raised" ? "Raised curb with no ramp at the crossing" : "Rolled curb at the crossing",
      });
    }
  }
  return flags;
}

// The point of the stairway nearest the route, so the pin lands where the walker meets it.
function closestTo(candidates: LatLng[], route: LatLng[]): LatLng {
  let best = candidates[0]!;
  let bestD = Infinity;
  for (const c of candidates) {
    for (const r of route) {
      const d = metersBetween(c, r);
      if (d < bestD) [best, bestD] = [c, d];
    }
  }
  return best;
}
