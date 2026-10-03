import type { LatLng } from "../shared/types";

// Google encoded polyline → points.
export function decodePolyline(str: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let b: number, shift = 0, result = 0;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000, rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * R;
}

// Points every `stepM` meters along the line, always including both ends.
export function sampleAlong(line: LatLng[], stepM: number): LatLng[] {
  const out: LatLng[] = [line[0]!];
  let carry = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!, seg = distanceM(a, b);
    let t = stepM - carry;
    while (t <= seg) {
      const f = t / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
      t += stepM;
    }
    carry = seg - (t - stepM);
  }
  const last = line[line.length - 1]!;
  if (distanceM(out[out.length - 1]!, last) > 1) out.push(last);
  return out;
}
