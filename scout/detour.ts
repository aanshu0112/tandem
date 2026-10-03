// Waypoints that steer a route around a blocking flag, for when every route Google offers
// has stairs (or another blocker) on it.
import destination from "@turf/destination";
import { point } from "@turf/helpers";
import type { Flag, LatLng } from "../shared/types";
import { samplePoints } from "./sample";
import { metersBetween } from "./score";

// Try one and two blocks over. Seattle downtown blocks are ~110 m; staircases often climb a
// whole block, so the farther offset matters on hills.
export const DETOUR_OFFSETS_M = [150, 300];

// Points to the left and right of the route where it passes `flag`, `offsets` meters away.
export function detourWaypoints(polyline: string, flag: Flag, offsets = DETOUR_OFFSETS_M): LatLng[] {
  const pts = samplePoints(polyline, 15);
  if (!pts.length) return [];
  const nearest = pts.reduce((best, p) =>
    metersBetween(p, flag.location) < metersBetween(best, flag.location) ? p : best,
  );
  const out: LatLng[] = [];
  for (const d of offsets) {
    for (const side of [-90, 90]) {
      const bearing = (((nearest.heading + side) % 360) + 540) % 360 - 180; // turf wants -180..180
      const [lng, lat] = destination(point([flag.location.lng, flag.location.lat]), d, bearing, {
        units: "meters",
      }).geometry.coordinates as [number, number];
      out.push({ lat, lng });
    }
  }
  return out;
}
