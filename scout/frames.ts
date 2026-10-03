// Route → sampled points → unique Street View panos → frames on disk.
import pLimit from "p-limit";
import bearing from "@turf/bearing";
import { point } from "@turf/helpers";
import { samplePoints } from "./sample";
import { streetViewImage, streetViewMeta } from "./google";

export type Frame = {
  i: number;
  panoId: string;
  date?: string;
  lat: number; // snapped pano location
  lng: number;
  heading: number;
  distM: number; // how far along the route this view is
  corner?: boolean; // extra view angled toward the curb at a turn
  imagePath: string;
};

export type FrameSet = {
  frames: Frame[];
  sampled: number; // points along the route
  uncovered: { lat: number; lng: number; distM: number }[]; // points with no usable Street View
};

const httpLimit = pLimit(16);

// Where the route turns by at least this much, it's probably an intersection.
const TURN_DEG = 35;
// Corner views look this far left and right of the route, toward the curb ramps.
const CORNER_DEG = 45;

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

export async function collectFrames(polyline: string, everyM = 15): Promise<FrameSet> {
  const points = samplePoints(polyline, everyM);
  const metas = await Promise.all(points.map((p) => httpLimit(() => streetViewMeta(p))));

  // Neighboring points often snap to the same pano. Keep the first sighting of each.
  const seen = new Set<string>();
  type Meta = NonNullable<(typeof metas)[number]>;
  const views: { meta: Meta; heading: number; distM: number; corner?: boolean }[] = [];
  const cornered = new Set<string>();
  const uncovered: FrameSet["uncovered"] = [];
  metas.forEach((meta, k) => {
    const here = points[k]!;
    if (!meta) return void uncovered.push({ lat: here.lat, lng: here.lng, distM: here.distM });
    const isNew = !seen.has(meta.panoId);
    const prev = points[Math.max(0, k - 1)]!;
    const next = points[Math.min(k + 1, points.length - 1)]!;
    const isTurn = angleDiff(prev.heading, next.heading) >= TURN_DEG;
    if (!isNew && !(isTurn && !cornered.has(meta.panoId))) return;

    // The pano can sit off to the side of the route, so aim from the pano itself at a
    // point a couple of samples ahead. Using the route's own heading can face a wall.
    const ahead = points[Math.min(k + 2, points.length - 1)]!;
    const aim =
      ahead === here
        ? here.heading
        : (bearing(point([meta.location.lng, meta.location.lat]), point([ahead.lng, ahead.lat])) + 360) % 360;

    if (isNew) {
      seen.add(meta.panoId);
      views.push({ meta, heading: aim, distM: here.distM });
    }
    // At a turn, also look toward both corners, where the curb ramps should be.
    if (isTurn && !cornered.has(meta.panoId)) {
      cornered.add(meta.panoId);
      for (const d of [-CORNER_DEG, CORNER_DEG]) {
        views.push({ meta, heading: (aim + d + 360) % 360, distM: here.distM, corner: true });
      }
    }
  });

  const fetched = await Promise.all(
    views.map((v) =>
      httpLimit(async () => {
        try {
          return { ...v, imagePath: await streetViewImage(v.meta.panoId, { heading: v.heading }) };
        } catch (e) {
          // One bad photo shouldn't sink the whole scout. Count the spot as unchecked.
          console.warn(`[scout] ${(e as Error).message}`);
          uncovered.push({ ...v.meta.location, distM: v.distM });
          return null;
        }
      }),
    ),
  );
  const frames: Frame[] = fetched
    .filter((f) => f !== null)
    .map(({ meta, heading, distM, corner, imagePath }, i) => ({
      i,
      panoId: meta.panoId,
      date: meta.date,
      lat: meta.location.lat,
      lng: meta.location.lng,
      heading: Math.round(heading),
      distM: Math.round(distM),
      ...(corner && { corner }),
      imagePath,
    }));
  return { frames, sampled: points.length, uncovered };
}
