// Turns "outside the Starbucks on College Ave" into a point, for user reports. Uses OpenStreetMap's
// Nominatim (free, 1 request/second, needs a User-Agent) because Geocoding isn't enabled on our
// Google key. Searches near a known point (the user's last trip) so "the Starbucks" means the nearby one.
import type { LatLng } from "../shared/types";

const BOX_DEG = 0.02; // ~2 km around the hint

// Nominatim is strict: "Uris Library, Cornell University, Ithaca NY" finds nothing while
// "Uris Library, Ithaca NY" works. Try the full name, then shorter ones.
export async function geocodeNear(query: string, near?: LatLng): Promise<LatLng | undefined> {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  const tries = [...new Set([query, parts.length > 2 ? `${parts[0]}, ${parts.at(-1)}` : "", parts[0] ?? ""])].filter(Boolean);
  for (const [i, q] of tries.entries()) {
    if (i > 0) await Bun.sleep(1100); // Nominatim allows 1 request per second
    const hit = await search(q, near);
    if (hit) return hit;
  }
  return undefined;
}

async function search(query: string, near?: LatLng): Promise<LatLng | undefined> {
  const params = new URLSearchParams({ q: query, format: "json", limit: "1" });
  if (near) {
    params.set("viewbox", [near.lng - BOX_DEG, near.lat + BOX_DEG, near.lng + BOX_DEG, near.lat - BOX_DEG].join(","));
    params.set("bounded", "1");
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "Tandem/0.1 (hackathon route scout)" },
      signal: AbortSignal.timeout(8000),
    });
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : undefined;
  } catch (err) {
    console.error("geocode failed:", err);
    return undefined;
  }
}
