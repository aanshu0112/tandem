import type { Flag, GradeFlags, LatLng } from "../shared/types";
import { decodePolyline, distanceM, sampleAlong } from "./polyline";

// Elevation: USGS Elevation Point Query Service (3DEP, best available resolution),
// with OpenTopoData's ned10m dataset as a fallback. Neither needs an API key.
const SAMPLE_M = 20;
// Ignore steep runs shorter than this: one 20m segment is within the noise of coarse elevation data.
const MIN_RUN_M = 35;

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

async function openTopoData(points: LatLng[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    if (i > 0) await Bun.sleep(1100); // public API: 1 request/second, 100 locations each
    const locs = points.slice(i, i + 100).map((p) => `${p.lat},${p.lng}`).join("|");
    const res = await fetch(`https://api.opentopodata.org/v1/ned10m?locations=${locs}`);
    const j: any = await res.json();
    if (j.status !== "OK") throw new Error(`OpenTopoData: ${j.error ?? j.status}`);
    out.push(...j.results.map((r: any) => r.elevation as number));
  }
  return out;
}

export async function elevations(points: LatLng[]): Promise<{ values: number[]; source: string }> {
  try {
    // All points at once: each request is slow (~8s) but they run fine in parallel.
    return { values: await Promise.all(points.map((p) => usgs(p))), source: "USGS EPQS" };
  } catch (e) {
    console.warn(`USGS elevation failed (${(e as Error).message}), using OpenTopoData ned10m`);
    return { values: await openTopoData(points), source: "OpenTopoData ned10m" };
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
  let run: { start: number; end: number; maxGrade: number; at: LatLng } | null = null;
  const close = () => {
    if (!run) return;
    const lengthM = Math.round(run.end - run.start);
    if (lengthM < MIN_RUN_M) return void (run = null);
    flags.push({
      id: `grade-${flags.length + 1}`,
      type: "steep_grade",
      severity: severityFor(run.maxGrade) as 1 | 2 | 3,
      confidence: 0.8, // elevation data is coarse: right about blocks, not single curbs
      location: run.at,
      source: "elevation",
      note: `Steep ${(run.maxGrade * 100).toFixed(0)}% grade for about ${lengthM}m`,
    });
    run = null;
  };
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distanceM(pts[i]!, pts[i + 1]!);
    const grade = d > 0 ? Math.abs(values[i + 1]! - values[i]!) / d : 0;
    if (severityFor(grade) > 0) {
      const mid = { lat: (pts[i]!.lat + pts[i + 1]!.lat) / 2, lng: (pts[i]!.lng + pts[i + 1]!.lng) / 2 };
      if (!run) run = { start: along, end: along + d, maxGrade: grade, at: mid };
      run.end = along + d;
      if (grade > run.maxGrade) Object.assign(run, { maxGrade: grade, at: mid });
    } else close();
    along += d;
  }
  close();
  return flags;
};
