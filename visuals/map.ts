import StaticMaps from "staticmaps";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import type { Flag, RenderRouteMap } from "../shared/types";
import { decodePolyline } from "./polyline";

// OpenStreetMap tiles via the `staticmaps` package (Google Maps Static isn't enabled on our key).
// OSM tile policy: identify the app in the User-Agent and show the attribution.
const SIZE = 1280; // 640x640 at 2x, sharp on phones
const RED = "#E5484D";
const GREEN = "#30A46C";
const SEVERITY_COLOR: Record<Flag["severity"], string> = { 3: "#D13438", 2: "#E8730C", 1: "#C79A00" };

const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

export const renderRouteMap: RenderRouteMap = async (r) => {
  const map: any = new StaticMaps({
    width: SIZE,
    height: SIZE,
    paddingX: 140,
    paddingY: 140,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileRequestHeader: { "User-Agent": "Tandem/0.1 (hackathon demo; route map renderer)" },
    zoomRange: { max: 19 },
  });

  // Other routes in red first, the recommended route in green on top.
  const ordered = [...r.routes].sort(
    (a, b) => Number(a.routeId === r.recommendedRouteId) - Number(b.routeId === r.recommendedRouteId),
  );
  for (const route of ordered) {
    const coords = decodePolyline(route.polyline).map((p) => [p.lng, p.lat]);
    const color = route.routeId === r.recommendedRouteId ? GREEN : RED;
    map.addLine({ coords, color: "#FFFFFFCC", width: 16 }); // halo so lines read over tiles
    map.addLine({ coords, color: color + "FF", width: 10 });
  }
  await map.render();

  const px = (lat: number, lng: number) => [map.xToPx(lonToX(lng, map.zoom)), map.yToPx(latToY(lat, map.zoom))];
  const flags = r.routes.flatMap((route) => route.flags);
  const first = decodePolyline(r.routes[0]!.polyline);
  const [sx, sy] = px(first[0]!.lat, first[0]!.lng);
  const last = first[first.length - 1]!;
  const [ex, ey] = px(last.lat, last.lng);

  const pins = flags
    .map((f, i) => {
      const [x, y] = px(f.location.lat, f.location.lng);
      return `<g transform="translate(${x},${y})">
        <circle r="30" fill="${SEVERITY_COLOR[f.severity]}" stroke="#fff" stroke-width="6"/>
        <text y="12" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#fff">${i + 1}</text>
      </g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <circle cx="${sx}" cy="${sy}" r="16" fill="#fff" stroke="#1C2024" stroke-width="8"/>
    <circle cx="${ex}" cy="${ey}" r="18" fill="#1C2024" stroke="#fff" stroke-width="6"/>
    ${pins}
    <rect x="${SIZE - 420}" y="${SIZE - 44}" width="420" height="44" fill="#FFFFFFD9"/>
    <text x="${SIZE - 14}" y="${SIZE - 14}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#333">© OpenStreetMap contributors</text>
  </svg>`;

  await mkdir("out", { recursive: true });
  const path = "out/map.png";
  const base = await map.image.buffer("image/png");
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(path);
  return path;
};
