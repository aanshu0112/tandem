// Google Maps Platform calls: walking routes, Street View metadata, Street View images.
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { LatLng } from "../shared/types";

const KEY = () => {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) throw new Error("GOOGLE_MAPS_API_KEY is not set (copy .env.example to .env)");
  return k;
};

export const CACHE_DIR = ".cache";

// Google returns occasional 500s and 429s under parallel load. Retry those with backoff.
async function fetchRetry(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if ((res.status < 500 && res.status !== 429) || attempt >= tries) return res;
    await Bun.sleep(300 * 2 ** attempt + Math.random() * 200);
  }
}

export type RouteInfo = { routeId: string; polyline: string; durationMin: number; distanceM: number };

// Routes API (the Directions API is Legacy and often can't be enabled on new projects).
// With `via` points, Google returns a single route through them (no alternatives).
export async function getRoutes(from: string, to: string, via: LatLng[] = []): Promise<RouteInfo[]> {
  const res = await fetchRetry("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY(),
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { address: from },
      destination: { address: to },
      travelMode: "WALK",
      ...(via.length
        ? {
            intermediates: via.map((p) => ({
              via: true,
              location: { latLng: { latitude: p.lat, longitude: p.lng } },
            })),
          }
        : { computeAlternativeRoutes: true }),
    }),
  });
  if (!res.ok) throw new Error(`Routes API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    routes?: { duration: string; distanceMeters: number; polyline: { encodedPolyline: string } }[];
  };
  if (!data.routes?.length) throw new Error(`No walking route found from "${from}" to "${to}"`);
  return data.routes.map((r, i) => ({
    routeId: `r${i}`,
    polyline: r.polyline.encodedPolyline,
    durationMin: Math.round(parseInt(r.duration) / 60),
    distanceM: r.distanceMeters,
  }));
}

export type PanoMeta = { panoId: string; date?: string; location: LatLng };

async function metaAt(p: LatLng, radius: number) {
  const url =
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${p.lat},${p.lng}` +
    `&radius=${radius}&source=outdoor&key=${KEY()}`;
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`Street View metadata ${res.status}`);
  const m = (await res.json()) as {
    status: string;
    pano_id?: string;
    date?: string;
    location?: LatLng;
    copyright?: string;
  };
  if (m.status !== "OK" || !m.pano_id || !m.location) return null;
  return m as Required<typeof m>;
}

// ~1 m in degrees at Seattle-ish latitudes; plenty accurate for nudging a lookup point.
const M_LAT = 1 / 111_320;
const mLng = (lat: number) => 1 / (111_320 * Math.cos((lat * Math.PI) / 180));

// Free, no quota cost. Returns null when there's no Google pano within `radius` meters.
// The nearest pano is often a user upload (shop interiors, old 360 tours) even with
// source=outdoor, so only accept "© Google" captures and try nearby points if needed.
export async function streetViewMeta(p: LatLng, radius = 15): Promise<PanoMeta | null> {
  const nudge = 8;
  const tries = [
    p,
    { lat: p.lat + nudge * M_LAT, lng: p.lng },
    { lat: p.lat - nudge * M_LAT, lng: p.lng },
    { lat: p.lat, lng: p.lng + nudge * mLng(p.lat) },
    { lat: p.lat, lng: p.lng - nudge * mLng(p.lat) },
  ];
  for (const q of tries) {
    const m = await metaAt(q, radius);
    if (!m) continue;
    if (m.copyright.includes("Google")) return { panoId: m.pano_id, date: m.date, location: m.location };
  }
  return null;
}

export type ViewParams = { heading: number; pitch?: number; fov?: number };

// Downloads one Street View frame, cached on disk by pano + view. Returns the file path.
export async function streetViewImage(panoId: string, v: ViewParams): Promise<string> {
  const heading = Math.round(v.heading);
  const pitch = v.pitch ?? -15;
  const fov = v.fov ?? 90;
  const dir = `${CACHE_DIR}/sv`;
  const path = `${dir}/${panoId}_h${heading}_p${pitch}_f${fov}.jpg`;
  if (existsSync(path)) return path;

  const url =
    `https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=${panoId}` +
    `&heading=${heading}&pitch=${pitch}&fov=${fov}&return_error_code=true&key=${KEY()}`;
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`Street View image ${res.status} for pano ${panoId}`);
  await mkdir(dir, { recursive: true });
  await Bun.write(path, await res.arrayBuffer());
  return path;
}
