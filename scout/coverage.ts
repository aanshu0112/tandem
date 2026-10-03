// Stretches of a route the scout couldn't check, so they come back as a note instead of
// silently counting as fine.
import type { LatLng } from "../shared/types";

export type UncheckedReason = "no_street_view" | "not_a_street";
export type UncheckedSpot = LatLng & { distM: number; reason: UncheckedReason };

export type UncheckedStretch = {
  from: LatLng;
  to: LatLng;
  startM: number; // distance along the route
  lengthM: number;
  reasons: UncheckedReason[];
};

// Spots closer than `joinM` along the route join into one stretch. Each spot stands for
// about `spotM` of route, so a single missing point still reports a short stretch.
export function uncheckedStretches(spots: UncheckedSpot[], joinM = 40, spotM = 15): UncheckedStretch[] {
  const sorted = [...spots].sort((a, b) => a.distM - b.distM);
  const stretches: UncheckedStretch[] = [];
  let first: UncheckedSpot | undefined;
  let last: UncheckedSpot | undefined;
  let reasons = new Set<UncheckedReason>();

  const close = () => {
    if (!first || !last) return;
    stretches.push({
      from: { lat: first.lat, lng: first.lng },
      to: { lat: last.lat, lng: last.lng },
      startM: Math.round(first.distM),
      lengthM: Math.round(last.distM - first.distM + spotM),
      reasons: [...reasons],
    });
  };

  for (const s of sorted) {
    if (last && s.distM - last.distM > joinM) {
      close();
      first = undefined;
      reasons = new Set();
    }
    first ??= s;
    last = s;
    reasons.add(s.reason);
  }
  close();
  return stretches;
}
