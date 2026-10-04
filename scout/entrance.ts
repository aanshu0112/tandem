// checkEntrance(): the last 20 meters. Finds the destination building in OpenStreetMap, its
// mapped entrances (entrance=* nodes, wheelchair=*, ramp, automatic_door), picks the main one and
// the best wheelchair-friendly one, and aims a Street View photo at the entrance that matters.
// Never throws: network trouble logs and returns undefined (or info without a photo).
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import bearing from "@turf/bearing";
import { point } from "@turf/helpers";
import type { CheckEntrance, Entrance, EntranceInfo, LatLng } from "../shared/types";
import { annotatePhoto } from "../visuals";
import { CACHE_DIR, streetViewImage, streetViewMeta } from "./google";
import { metersBetween } from "./score";

const OVERPASS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const NEAR_M = 60; // an unnamed building this close to the pin counts as the destination
const NAMED_M = 300; // a building whose name matches can be this far (geocoded pins are often off)
const ENTRANCE_M = 25; // entrance nodes this close to the outline, when none sit on it
const ON_OUTLINE_M = 1.5;

type OsmTags = Record<string, string>;
type Geo = { lat: number; lon: number };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: OsmTags;
  geometry?: Geo[];
  members?: { type: string; role: string; geometry?: Geo[] }[];
};
type Building = { type: "way" | "relation"; id: number; tags: OsmTags; rings: LatLng[][]; center: LatLng; dist: number };
type Candidate = Entrance & { id: number; tags: OsmTags; onOutline: boolean; distToPin: number };

export const checkEntrance: CheckEntrance = async (destination, buildingName) => {
  try {
    const building = await findBuilding(destination, buildingName);
    if (!building) {
      console.warn(`[entrance] no building found near ${destination.lat},${destination.lng} for "${buildingName}"`);
      return undefined;
    }
    const name = building.tags.name ?? buildingName;
    const candidates = await findEntrances(building, destination);
    const main = pickMain(candidates);
    const accessible = pickAccessible(candidates, main);
    const info: EntranceInfo = {
      building: name,
      ...(main && { main: strip(main) }),
      ...(accessible && { accessible: strip(accessible) }),
      note: writeNote(name, building.tags, main, accessible),
    };
    const target = accessible ?? main;
    const photo = await entrancePhoto(building, target, caption(name, target, accessible === target)).catch((err) => {
      console.warn(`[entrance] photo failed: ${err instanceof Error ? err.message : err}`);
      return undefined;
    });
    if (photo) info.photo = photo;
    return info;
  } catch (err) {
    console.warn(`[entrance] lookup failed: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
};

// ---- building ----

async function findBuilding(dest: LatLng, wanted: string): Promise<Building | undefined> {
  const at = `${dest.lat.toFixed(6)},${dest.lng.toFixed(6)}`;
  const query = `[out:json][timeout:20];
(
  way["building"](around:${NEAR_M},${at});
  relation["building"](around:${NEAR_M},${at});
  way["building"]["name"](around:${NAMED_M},${at});
  relation["building"]["name"](around:${NAMED_M},${at});
);
out tags geom;`;
  const elements = await overpassCached(query);
  const buildings: Building[] = [];
  for (const el of elements) {
    if (el.type === "node") continue;
    const rings =
      el.type === "way"
        ? [toLatLng(el.geometry ?? [])]
        : (el.members ?? []).filter((m) => m.type === "way" && m.role !== "inner" && m.geometry?.length).map((m) => toLatLng(m.geometry!));
    if (!rings.length || !rings[0]!.length) continue;
    buildings.push({ type: el.type, id: el.id, tags: el.tags ?? {}, rings, center: centerOf(rings), dist: distToBuilding(dest, rings) });
  }
  if (!buildings.length) return undefined;

  // A name match wins (nearest first); otherwise the building the pin sits in, or the nearest one.
  const named = buildings.filter((b) => nameScore(wanted, b.tags) >= 0.99).sort((a, b) => a.dist - b.dist);
  if (named.length) return named[0];
  const partial = buildings
    .map((b) => ({ b, s: nameScore(wanted, b.tags) }))
    .filter((x) => x.s >= 0.5 && x.b.dist <= NAMED_M)
    .sort((a, b) => b.s - a.s || a.b.dist - b.b.dist);
  if (partial.length) return partial[0]!.b;
  const near = buildings.filter((b) => b.dist <= NEAR_M).sort((a, b) => a.dist - b.dist);
  return near[0];
}

const GENERIC = new Set(["the", "of", "and", "hall", "building", "center", "centre", "library", "cornell", "university", "at"]);
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

// 1 = every distinctive word of the wanted name appears in the building's name; 0 = none do.
function nameScore(wanted: string, tags: OsmTags): number {
  const want = words(wanted);
  const key = want.filter((w) => !GENERIC.has(w));
  const target = key.length ? key : want;
  if (!target.length) return 0;
  let best = 0;
  for (const n of [tags.name, tags.alt_name, tags.short_name, tags.official_name, tags.old_name]) {
    if (!n) continue;
    const have = new Set(words(n));
    if (words(n).join(" ") === want.join(" ")) return 1;
    best = Math.max(best, target.filter((w) => have.has(w)).length / target.length);
  }
  return best;
}

// ---- entrances ----

async function findEntrances(b: Building, dest: LatLng): Promise<Candidate[]> {
  const sel = b.type === "way" ? `way(id:${b.id})->.b;` : `relation(id:${b.id});way(r)->.b;`;
  const query = `[out:json][timeout:20];
${sel}
(
  node(w.b)["entrance"];
  node["entrance"](around.b:${ENTRANCE_M});
);
out;`;
  const elements = await overpassCached(query);
  const all: Candidate[] = [];
  for (const el of elements) {
    if (el.type !== "node" || el.lat === undefined || el.lon === undefined) continue;
    const tags = el.tags ?? {};
    const location = { lat: el.lat, lng: el.lon };
    const d = distToOutline(location, b.rings);
    if (d > ENTRANCE_M) continue;
    const side = sideOf(b.center, location);
    all.push({
      id: el.id,
      tags,
      location,
      wheelchair: wheelchairOf(tags.wheelchair),
      name: entranceName(tags, side),
      side,
      onOutline: d <= ON_OUTLINE_M,
      distToPin: metersBetween(location, dest),
    });
  }
  const on = all.filter((c) => c.onOutline);
  return on.length ? on : all;
}

const NOT_A_DOOR_IN = new Set(["service", "emergency", "exit", "staircase", "garage", "backstage", "no"]);

function pickMain(cs: Candidate[]): Candidate | undefined {
  const byPin = (a: Candidate, b: Candidate) => a.distToPin - b.distToPin;
  const mains = cs.filter((c) => c.tags.entrance === "main").sort(byPin);
  if (mains.length) return mains[0];
  const usable = cs.filter((c) => !NOT_A_DOOR_IN.has(c.tags.entrance ?? "") && !isPrivate(c)).sort(byPin);
  return usable[0] ?? [...cs].sort(byPin)[0];
}

function accessScore(c: Candidate): number {
  const t = c.tags;
  if (c.wheelchair === "no" || t.entrance === "emergency" || t.entrance === "no") return 0;
  if (c.wheelchair === "yes") return 4;
  if (c.wheelchair === "limited") return 3;
  if (hasRamp(t)) return 2;
  if (t.automatic_door && t.automatic_door !== "no") return 1;
  return 0;
}

function pickAccessible(cs: Candidate[], main: Candidate | undefined): Candidate | undefined {
  const ranked = cs
    .map((c) => ({ c, s: accessScore(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(isPrivate(a.c)) - Number(isPrivate(b.c)) || a.c.distToPin - b.c.distToPin);
  const best = ranked[0];
  if (!best) return undefined;
  // The main entrance is already the best one: nothing different to suggest.
  if (main && (best.c.id === main.id || accessScore(main) >= best.s)) return undefined;
  return best.c;
}

const hasRamp = (t: OsmTags) => t.ramp === "yes" || t["ramp:wheelchair"] === "yes";
const isPrivate = (c: Candidate) => c.tags.access === "private" || c.tags.access === "no";

function wheelchairOf(v?: string): Entrance["wheelchair"] {
  return v === "yes" || v === "no" || v === "limited" ? v : v === "designated" ? "yes" : "unknown";
}

function entranceName(tags: OsmTags, side?: string): string {
  if (tags.name) return tags.name;
  if (tags.entrance === "main") return "Main entrance";
  const dir = side?.split(" ")[0];
  const base = dir ? `${dir[0]!.toUpperCase()}${dir.slice(1)} entrance` : "Side entrance";
  return tags.ref ? `${base} (${tags.ref})` : base;
}

function strip(c: Candidate): Entrance {
  return { location: c.location, wheelchair: c.wheelchair, ...(c.name && { name: c.name }), ...(c.side && { side: c.side }) };
}

// ---- the sentence ----

function lower(name?: string) {
  return name ? name.replace(/^(Main|East|West|North|South|Side)\b/, (m) => m.toLowerCase()) : "side entrance";
}

function accessiblePhrase(a: Candidate): string {
  // Generated names already say the side ("East entrance"); a mapped name may not.
  const where = `the ${lower(a.name)}${a.tags.name && a.side ? ` on the ${a.side}` : ""}`;
  if (a.wheelchair === "yes") return `Use ${where}, it's step-free.`;
  if (a.wheelchair === "limited") return `Try ${where}, it has limited wheelchair access.`;
  if (hasRamp(a.tags)) return `Try ${where}, it has a ramp.`;
  return `Try ${where}, it has an automatic door.`;
}

function writeNote(building: string, btags: OsmTags, main?: Candidate, acc?: Candidate): string {
  const callAhead = "worth calling ahead";
  if (!main) {
    if (btags.wheelchair === "yes") return `OpenStreetMap lists ${building} as wheelchair accessible but doesn't map its entrances, so it's ${callAhead} to ask which door to use.`;
    if (btags.wheelchair === "limited") return `OpenStreetMap lists ${building} as having limited wheelchair access and doesn't map its entrances, so it's ${callAhead}.`;
    if (btags.wheelchair === "no") return `OpenStreetMap lists ${building} as not wheelchair accessible, so it's ${callAhead}.`;
    return `OpenStreetMap doesn't map ${building}'s entrances, so it's ${callAhead} to ask which one is accessible.`;
  }
  // Only call it "the main entrance" when OpenStreetMap does; otherwise name the door we picked.
  const mainWhere =
    main.tags.entrance === "main" ? (main.side ? `The main entrance (${main.side})` : "The main entrance") : `The ${lower(main.name)}`;
  if (acc) {
    const first =
      main.wheelchair === "no"
        ? `${mainWhere} has steps (no wheelchair access).`
        : main.wheelchair === "limited"
          ? `${mainWhere} has limited wheelchair access.`
          : "";
    return `${first} ${accessiblePhrase(acc)}`.trim();
  }
  if (main.wheelchair === "yes") return `${mainWhere} is wheelchair accessible.`;
  if (main.wheelchair === "limited") return `${mainWhere} has limited wheelchair access, so it's ${callAhead}.`;
  if (main.wheelchair === "no") return `${mainWhere} has steps (no wheelchair access) and OpenStreetMap doesn't list an accessible one, so it's ${callAhead}.`;
  if (btags.wheelchair === "yes") return `OpenStreetMap lists ${building} as wheelchair accessible but doesn't say which entrance to use, so it's ${callAhead}.`;
  return `OpenStreetMap doesn't say which entrance is accessible, so it's ${callAhead}.`;
}

function caption(building: string, target: Candidate | undefined, isAccessible: boolean): string {
  if (!target) return `${building}, entrances not mapped`;
  const label = target.name ?? "Entrance";
  if (target.wheelchair === "yes") return `${label}, step-free`;
  if (target.wheelchair === "limited") return `${label}, limited access`;
  if (target.wheelchair === "no") return `${label}, has steps`;
  if (isAccessible && hasRamp(target.tags)) return `${label}, has a ramp`;
  if (isAccessible) return `${label}, automatic door`;
  return `${building}, ${lower(label)}`;
}

// ---- photo ----

// A Google pano that can see the door: search from points pushed out from the building
// through the entrance, and reject panos whose line of sight runs through the building.
async function entrancePhoto(b: Building, target: Candidate | undefined, note: string) {
  const goal = target?.location ?? b.center;
  const out = target ? outwardBearing(goal, b) : 0;
  const pano = target ? await panoFacingDoor(b, goal, out) : await panoNearBuilding(b);
  if (!pano) return undefined;

  const dist = metersBetween(pano.location, goal);
  // Aim a few meters behind the door, into the building: from a pano right beside the door
  // (common on campus paths) the bearing to the door node alone points along the wall.
  const aim = target ? offset(goal, out + 180, 6) : goal;
  const heading = (bearingOf(pano.location, aim) + 360) % 360;
  // Keep the door a readable size; with no door to frame, show the whole facade.
  const fov = !target || dist < 12 ? 90 : dist < 30 ? 70 : 50;
  const pitch = !target || dist < 12 ? 10 : 0;
  const imagePath = await streetViewImage(pano.panoId, { heading, pitch, fov });
  const id = `entrance-${b.type}${b.id}-${target?.id ?? "bldg"}`;
  const annotated = await annotatePhoto({
    id,
    type: "obstruction", // AnnotatePhoto takes a Flag; only imagePath/photoDate/note are drawn
    severity: 1,
    confidence: 1,
    location: goal,
    source: "osm",
    imagePath,
    photoDate: pano.date,
    note,
  });
  return { imagePath: annotated, ...(pano.date && { photoDate: pano.date }) };
}

type Pano = { panoId: string; date?: string; location: LatLng };

async function panoFacingDoor(b: Building, door: LatLng, out: number): Promise<Pano | undefined> {
  const tries = [
    { at: offset(door, out, 12), radius: 20 },
    { at: offset(door, out, 25), radius: 25 },
    { at: door, radius: 40 },
    { at: offset(door, out + 45, 20), radius: 30 },
    { at: offset(door, out - 45, 20), radius: 30 },
  ];
  const seen = new Set<string>();
  for (const t of tries) {
    const m = await streetViewMeta(t.at, t.radius);
    if (!m || seen.has(m.panoId)) continue;
    seen.add(m.panoId);
    if (metersBetween(m.location, door) <= 60 && !blocked(m.location, door, b.rings)) return m;
  }
  return undefined;
}

// No mapped entrance: any Google pano around the building that shows it. The nearest pano to
// the center is often a user upload from inside, so look from 8 points around the outside.
async function panoNearBuilding(b: Building): Promise<Pano | undefined> {
  const reach = Math.max(...b.rings.flat().map((p) => metersBetween(p, b.center))) + 15;
  const found = await Promise.all(
    [0, 45, 90, 135, 180, 225, 270, 315].map((dir) => streetViewMeta(offset(b.center, dir, reach), 30).catch(() => null)),
  );
  const ok = found
    .filter((m): m is Pano => !!m && !b.rings.some((r) => inside(m.location, r)))
    .map((m) => ({ m, d: distToOutline(m.location, b.rings) }))
    .filter((x) => x.d <= 80)
    .sort((x, y) => Number(x.d < 8) - Number(y.d < 8) || x.d - y.d); // close, but far enough to fit the facade
  return ok[0]?.m;
}

// True when the straight line from the pano to the door passes through the building.
function blocked(from: LatLng, door: LatLng, rings: LatLng[][]): boolean {
  const d = metersBetween(from, door);
  if (d < 3) return false;
  const steps = Math.ceil(d / 1.5);
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    if (d * (1 - f) < 2.5) break; // the last couple of meters are the door itself
    const p = { lat: from.lat + (door.lat - from.lat) * f, lng: from.lng + (door.lng - from.lng) * f };
    if (rings.some((r) => inside(p, r))) return true;
  }
  return false;
}

// ---- geometry (local flat-earth meters; buildings are small) ----

const M_LAT = 111_320;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
const toLatLng = (g: Geo[]) => g.map((p) => ({ lat: p.lat, lng: p.lon }));
const bearingOf = (a: LatLng, b: LatLng) => bearing(point([a.lng, a.lat]), point([b.lng, b.lat]));

function offset(p: LatLng, bearingDeg: number, meters: number): LatLng {
  const r = (bearingDeg * Math.PI) / 180;
  return { lat: p.lat + (Math.cos(r) * meters) / M_LAT, lng: p.lng + (Math.sin(r) * meters) / mLng(p.lat) };
}

// Direction straight out of the building at this point on its outline (the wall's normal).
function outwardBearing(p: LatLng, b: Building): number {
  let best = Infinity, seg: [LatLng, LatLng] | undefined;
  for (const ring of b.rings)
    for (let i = 1; i < ring.length; i++) {
      const d = distToOutline(p, [[ring[i - 1]!, ring[i]!]]);
      if (d < best) [best, seg] = [d, [ring[i - 1]!, ring[i]!]];
    }
  const fromCenter = bearingOf(b.center, p);
  if (!seg) return fromCenter;
  const along = bearingOf(seg[0], seg[1]);
  for (const n of [along + 90, along - 90]) {
    const probe = offset(p, n, 2);
    if (!b.rings.some((r) => inside(probe, r))) return n;
  }
  return fromCenter;
}

function centerOf(rings: LatLng[][]): LatLng {
  const pts = rings.flat();
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

function sideOf(center: LatLng, p: LatLng): string | undefined {
  if (metersBetween(center, p) < 3) return undefined;
  const b = (bearingOf(center, p) + 360) % 360;
  return b < 45 || b >= 315 ? "north side" : b < 135 ? "east side" : b < 225 ? "south side" : "west side";
}

function inside(p: LatLng, ring: LatLng[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, c = ring[j]!;
    if (a.lat > p.lat !== c.lat > p.lat && p.lng < ((c.lng - a.lng) * (p.lat - a.lat)) / (c.lat - a.lat) + a.lng) hit = !hit;
  }
  return hit;
}

function distToOutline(p: LatLng, rings: LatLng[][]): number {
  let best = Infinity;
  const kx = mLng(p.lat);
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!, b = ring[i]!;
      const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * M_LAT;
      const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * M_LAT;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

const distToBuilding = (p: LatLng, rings: LatLng[][]) => (rings.some((r) => inside(p, r)) ? 0 : distToOutline(p, rings));

// ---- Overpass, cached by query ----

async function overpassCached(query: string): Promise<OsmElement[]> {
  const dir = `${CACHE_DIR}/entrance`;
  const path = `${dir}/${createHash("sha1").update(query).digest("hex")}.json`;
  if (existsSync(path)) return Bun.file(path).json();
  const elements = await overpass(query);
  await mkdir(dir, { recursive: true });
  await Bun.write(path, JSON.stringify(elements));
  return elements;
}

async function overpass(query: string): Promise<OsmElement[]> {
  let lastErr: unknown;
  // The main server is usually quickest and its busy spells are brief, so give it a second try.
  const urls = OVERPASS.length > 1 ? [OVERPASS[0]!, OVERPASS[0]!, ...OVERPASS.slice(1)] : OVERPASS;
  for (const [i, url] of urls.entries()) {
    if (i === 1) await Bun.sleep(1000);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": "Tandem/0.1 (hackathon route scout)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} from ${new URL(url).host}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
