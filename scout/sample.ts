// Turn a route polyline into evenly spaced points, each facing the next one.
import { decode } from "@googlemaps/polyline-codec";
import { lineString } from "@turf/helpers";
import along from "@turf/along";
import length from "@turf/length";
import bearing from "@turf/bearing";
import type { LatLng } from "../shared/types";

export type SamplePoint = LatLng & { heading: number; distM: number };

export function samplePoints(polyline: string, everyM = 15): SamplePoint[] {
  const coords = decode(polyline).map(([lat, lng]) => [lng, lat]); // turf wants [lng, lat]
  if (coords.length < 2) return [];
  const line = lineString(coords);
  const totalM = length(line, { units: "meters" });

  const at = (m: number) => along(line, Math.min(m, totalM), { units: "meters" });
  const points: SamplePoint[] = [];
  const dists: number[] = [];
  for (let d = 0; d <= totalM; d += everyM) dists.push(d);
  // Always include the destination itself: its entrance is often the problem that matters.
  if (totalM - dists.at(-1)! > 1) dists.push(totalM);

  for (const d of dists) {
    const here = at(d);
    // Face along the route. At the very end, keep facing the way we came in.
    const heading =
      d + 1 <= totalM ? bearing(here, at(d + 1)) : bearing(at(Math.max(0, d - 1)), here);
    const [lng, lat] = here.geometry.coordinates as [number, number];
    points.push({ lat, lng, heading: (heading + 360) % 360, distM: d });
  }
  return points;
}
