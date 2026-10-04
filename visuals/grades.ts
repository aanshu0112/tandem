import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Flag, GradeFlags, LatLng } from "../shared/types";
import { decodePolyline, distanceM, sampleAlong } from "./polyline";

// Elevation: OpenTopoData's ned10m dataset (100 points per request, about 1s), with the USGS
// Elevation Point Query Service (1m lidar here, but ~8s per point) as a fallback. Results are cached
// in .cache/elevation/. Neither needs an API key.
const SAMPLE_M = 20;
// Ignore steep runs shorter than this: one 20m segment is within the noise of coarse elevation data.
const MIN_RUN_M = 35;
// A 20 m piece steeper than this is a data artifact, almost always a bridge or overpass where the
// elevation model measures the ground below (Cascadilla Gorge). Real stairs come from OSM instead.
const MAX_REAL_GRADE = 0.3;

// EPQS is slow (~8s per point) and sometimes times out or returns an empty body, so retry once.
async function usgs(p: LatLng, retries = 1): Promise<number> {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${p.lng}&y=${p.lat}&wkid=4326&units=Meters&includeDate=false`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`USGS ${res.status}`);
    const v = Number(((await res.json()) as any)?.value);
    if (!Number.isFinite(v) || v < -1000) throw new Error("USGS: no data");
    return v;
  } catch (e) {
    if (retries > 0) return usgs(p, retries - 1);
    throw e;
  }
}

// The free API allows 1 request per second, and the scout grades 2-3 routes at once,
// so every request goes through one queue spaced 1.1 s apart.
let topoQueue: Promise<unknown> = Promise.resolve();
function topoRequest(locs: string): Promise<number[]> {
  const run = async (): Promise<number[]> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://api.opentopodata.org/v1/ned10m?locations=${locs}`, { signal: AbortSignal.timeout(15_000) });
      const j: any = await res.json();
      if (j.status === "OK") return j.results.map((r: any) => r.elevation as number);
      if (attempt >= 1 || !String(j.error ?? "").toLowerCase().includes("rate limit")) throw new Error(`OpenTopoData: ${j.error ?? j.status}`);
      await Bun.sleep(1100);
    }
  };
  const result = topoQueue.then(run);
  topoQueue = result.catch(() => {}).then(() => Bun.sleep(1100));
  return result;
}

async function openTopoData(points: LatLng[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const locs = points.slice(i, i + 100).map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|");
    out.push(...(await topoRequest(locs)));
  }
  return out;
}

export async function elevations(points: LatLng[]): Promise<{ values: number[]; source: string }> {
  const cachePath = `.cache/elevation/${createHash("sha1").update(JSON.stringify(points)).digest("hex")}.json`;
  if (existsSync(cachePath)) return Bun.file(cachePath).json();
  const result = await fetchElevations(points);
  await mkdir(".cache/elevation", { recursive: true });
  await Bun.write(cachePath, JSON.stringify(result));
  return result;
}

async function fetchElevations(points: LatLng[]): Promise<{ values: number[]; source: string }> {
  // OpenTopoData answers 100 points in about a second; USGS takes ~8s per point, so it's the fallback.
  try {
    return { values: await openTopoData(points), source: "OpenTopoData ned10m" };
  } catch (e) {
    console.warn(`OpenTopoData failed (${(e as Error).message}), using USGS EPQS`);
    const values: number[] = new Array(points.length);
    for (let i = 0; i < points.length; i += 10) {
      const batch = points.slice(i, i + 10);
      (await Promise.all(batch.map((p) => usgs(p)))).forEach((v, k) => (values[i + k] = v));
    }
    return { values, source: "USGS EPQS" };
  }
}

// ADA: over 5% counts as a ramp, 8.33% is the max for a ramp (visuals/README.md, Round 2).
function severityFor(grade: number): 0 | 1 | 2 | 3 {
  if (grade > 0.12) return 3;
  if (grade > 0.0833) return 2;
  if (grade > 0.05) return 1;
  return 0;
}

export const gradeFlags: GradeFlags = async (polyline) => {
  const pts = sampleAlong(decodePolyline(polyline), SAMPLE_M);
  const { values } = await elevations(pts);
  const flags: Flag[] = [];
  // A run of consecutive steep pieces. Its grade is the overall climb over the whole run, not the
  // steepest 20 m piece, which is mostly noise in 10 m elevation data.
  let run: { startM: number; endM: number; startElev: number; endElev: number; at: LatLng } | null = null;
  const close = () => {
    if (!run) return;
    const lengthM = run.endM - run.startM;
    if (lengthM < MIN_RUN_M) return void (run = null);
    const grade = Math.abs(run.endElev - run.startElev) / lengthM;
    const severity = severityFor(grade);
    if (severity > 0) {
      flags.push({
        id: `grade-${flags.length + 1}`,
        type: "steep_grade",
        severity: severity as 1 | 2 | 3,
        confidence: 0.8, // elevation data is coarse: right about blocks, not single curbs
        location: run.at,
        source: "elevation",
        note: `Steep ${(grade * 100).toFixed(0)}% grade for about ${Math.round(lengthM / 10) * 10}m`,
      });
    }
    run = null;
  };
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distanceM(pts[i]!, pts[i + 1]!);
    const grade = d > 0 ? Math.abs(values[i + 1]! - values[i]!) / d : 0;
    if (grade > MAX_REAL_GRADE) {
      close(); // bridge or bad data: end any run here and skip this piece
    } else if (severityFor(grade) > 0) {
      const mid = { lat: (pts[i]!.lat + pts[i + 1]!.lat) / 2, lng: (pts[i]!.lng + pts[i + 1]!.lng) / 2 };
      run ??= { startM: along, endM: along, startElev: values[i]!, endElev: values[i]!, at: mid };
      run.endM = along + d;
      run.endElev = values[i + 1]!;
    } else close();
    along += d;
  }
  close();
  return flags;
};
