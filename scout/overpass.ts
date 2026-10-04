// A small Overpass (OpenStreetMap) client shared by osm.ts and night.ts. The public servers
// return 429/504 when busy, so each is tried in turn. They also allow only a couple of requests
// at once per client, so all of ours (osm.ts + night.ts, every route) go through one small queue.
import pLimit from "p-limit";

const limit = pLimit(2);
const OVERPASS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export type OsmElement = {
  type: "way" | "node" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number }; // ways and relations with `out center`
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

export const overpass = (query: string, timeoutMs = 20_000) => limit(() => overpassNow(query, timeoutMs));

async function overpassNow(query: string, timeoutMs: number): Promise<{ elements: OsmElement[] }> {
  let lastErr: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": "Tandem/0.1 (hackathon route scout)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} from ${new URL(url).host}`);
      return (await res.json()) as { elements: OsmElement[] };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
