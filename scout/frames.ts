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
  imagePath: string;
};

export type FrameSet = {
  frames: Frame[];
  sampled: number; // points along the route
  uncovered: { lat: number; lng: number }[]; // points with no Street View nearby
};

const httpLimit = pLimit(16);

export async function collectFrames(polyline: string, everyM = 15): Promise<FrameSet> {
  const points = samplePoints(polyline, everyM);
  const metas = await Promise.all(points.map((p) => httpLimit(() => streetViewMeta(p))));

  // Neighboring points often snap to the same pano. Keep the first sighting of each.
  const seen = new Set<string>();
  const unique: { meta: NonNullable<(typeof metas)[number]>; heading: number }[] = [];
  const uncovered: FrameSet["uncovered"] = [];
  metas.forEach((meta, k) => {
    const here = points[k]!;
    if (!meta) return void uncovered.push({ lat: here.lat, lng: here.lng });
    if (seen.has(meta.panoId)) return;
    seen.add(meta.panoId);
    // The pano can sit off to the side of the route, so aim from the pano itself at a
    // point a couple of samples ahead. Using the route's own heading can face a wall.
    const ahead = points[Math.min(k + 2, points.length - 1)]!;
    const heading =
      ahead === here
        ? here.heading
        : bearing(point([meta.location.lng, meta.location.lat]), point([ahead.lng, ahead.lat]));
    unique.push({ meta, heading: (heading + 360) % 360 });
  });

  const fetched = await Promise.all(
    unique.map(({ meta, heading }) =>
      httpLimit(async () => {
        try {
          return { meta, heading, imagePath: await streetViewImage(meta.panoId, { heading }) };
        } catch (e) {
          // One bad photo shouldn't sink the whole scout. Count the spot as unchecked.
          console.warn(`[scout] ${(e as Error).message}`);
          uncovered.push(meta.location);
          return null;
        }
      }),
    ),
  );
  const frames: Frame[] = fetched
    .filter((f) => f !== null)
    .map(({ meta, heading, imagePath }, i) => ({
      i,
      panoId: meta.panoId,
      date: meta.date,
      lat: meta.location.lat,
      lng: meta.location.lng,
      heading: Math.round(heading),
      imagePath,
    }));
  return { frames, sampled: points.length, uncovered };
}
