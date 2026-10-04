// An animated GIF "walking" one route: forward-facing frames in order, holding on each
// serious problem with the red box from visuals/. Built from what scoutRouteDetailed kept
// in memory, so nothing is re-fetched.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import type { Flag, MakeFlythrough, ScoutResult } from "../shared/types";
import { annotatePhoto } from "../visuals";
import type { Frame } from "./frames";
import { verdictToFlag, type FrameVerdict } from "./vision";
import { metersBetween } from "./score";

export type RouteRecord = {
  frames: Frame[];
  verdicts: Map<Frame, FrameVerdict>; // latest answer per frame (second look wins)
  flags: Flag[]; // final, merged
};
export type ScoutRecord = {
  from: string;
  to: string;
  routes: Map<string, RouteRecord>; // by routeId
  result?: ScoutResult;
};

// The last few scouts, by scoutId.
const KEEP = 5;
const recent = new Map<string, ScoutRecord>();

export function rememberScout(scoutId: string, from: string, to: string): ScoutRecord {
  const rec: ScoutRecord = { from, to, routes: new Map() };
  recent.delete(scoutId);
  recent.set(scoutId, rec);
  while (recent.size > KEEP) recent.delete(recent.keys().next().value!);
  return rec;
}

export function routeRecord(rec: ScoutRecord, routeId: string): RouteRecord {
  let r = rec.routes.get(routeId);
  if (!r) rec.routes.set(routeId, (r = { frames: [], verdicts: new Map(), flags: [] }));
  return r;
}

const SIZE = 480;
const MAX_FRAMES = 40; // with 128 colours, keeps the GIF under ~3 MB
const MAX_HOLDS = 6;
const FLAG_WITHIN_M = 20;
const DELAY = { step: 250, hold: 1500, title: 1200, end: 2000 };

// The serious problem (severity 2+) shown in this frame, if any: a final flag that uses this
// photo, else Claude's own verdict on it.
function problemAt(f: Frame, route: RouteRecord, id: string): Flag | null {
  const v = route.verdicts.get(f);
  const seen = v ? verdictToFlag(v, f, id) : null;
  const vision = seen && seen.severity >= 2 ? seen : null;
  const flag = route.flags.find(
    (fl) => fl.severity >= 2 && fl.imagePath === f.imagePath && metersBetween(fl.location, f) <= FLAG_WITHIN_M,
  );
  if (!flag) return vision;
  // Map and elevation flags have no box. Borrow Claude's if it saw something here too.
  return { ...flag, id, imagePath: f.imagePath, photoDate: f.date, box: flag.box ?? vision?.box };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cut = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const place = (s: string) => cut(s.split(",")[0]!.trim());

// A plain text card. No emoji: the SVG renderer has no emoji font.
function card(lines: { text: string; size: number; color?: string }[]): Promise<Buffer> {
  const gap = 18;
  const total = lines.reduce((h, l) => h + l.size + gap, -gap);
  let y = (SIZE - total) / 2;
  const text = lines
    .map((l) => {
      y += l.size;
      const t = `<text x="${SIZE / 2}" y="${y}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${l.size}" font-weight="600" fill="${l.color ?? "#fff"}">${esc(l.text)}</text>`;
      y += gap;
      return t;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="#111"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Every k-th plain frame so the total stays under MAX_FRAMES. Problem frames always stay.
function sample<T>(items: T[], keep: (t: T) => boolean, max: number): T[] {
  const kept = items.filter(keep).length;
  const plain = items.length - kept;
  const step = Math.max(1, plain / Math.max(1, max - kept));
  let next = 0;
  let k = 0;
  return items.filter((t) => {
    if (keep(t)) return true;
    const take = k++ >= next;
    if (take) next += step;
    return take;
  });
}

export const makeFlythrough: MakeFlythrough = async (scoutId, routeId) => {
  const rec = recent.get(scoutId);
  if (!rec) throw new Error(`makeFlythrough: no recent scout ${scoutId}`);
  const route = rec.routes.get(routeId);
  const frames = (route?.frames ?? []).filter((f) => !f.corner).sort((a, b) => a.distM - b.distM || a.i - b.i);
  if (!route || !frames.length) throw new Error(`makeFlythrough: no photos for route ${routeId} of ${scoutId}`);

  // Hold on the worst few problems only, so the GIF stays short.
  const found = frames
    .map((f) => ({ f, flag: problemAt(f, route, `fly-${scoutId}-${routeId}-${f.i}`) }))
    .filter((p): p is { f: Frame; flag: Flag } => p.flag !== null);
  const holds = new Map(
    found
      .sort((a, b) => b.flag.severity - a.flag.severity || a.f.distM - b.f.distM)
      .slice(0, MAX_HOLDS)
      .map((p) => [p.f, p.flag]),
  );
  const shown = sample(frames, (f) => holds.has(f), MAX_FRAMES - 2);

  const fit = (input: string | Buffer) => sharp(input).resize(SIZE, SIZE, { fit: "cover" }).png().toBuffer();
  const photos = await Promise.all(
    shown.map(async (f) => {
      const flag = holds.get(f);
      return fit(flag ? await annotatePhoto(flag) : f.imagePath);
    }),
  );

  const r = rec.result?.routes.find((x) => x.routeId === routeId);
  const title = await card([
    { text: place(rec.from), size: 30 },
    { text: "to", size: 22, color: "#aaa" },
    { text: place(rec.to), size: 30 },
    ...(r ? [{ text: `${r.durationMin} min walk`, size: 22, color: "#aaa" }] : []),
  ]);
  const n = (r?.flags ?? route.flags).filter((f) => f.severity >= 2).length;
  const recommended = rec.result?.recommendedRouteId;
  const end = await card([
    { text: n ? `${n} serious problem${n === 1 ? "" : "s"}` : "No serious problems", size: 34, color: n ? "#E5484D" : "#30A46C" },
    ...(recommended
      ? [{ text: recommended === routeId ? "This is the route to take" : "Take the recommended route", size: 24 }]
      : []),
  ]);

  const out = `out/flythrough/${scoutId}-${routeId}.gif`;
  await mkdir("out/flythrough", { recursive: true });
  const delay = [DELAY.title, ...shown.map((f) => (holds.has(f) ? DELAY.hold : DELAY.step)), DELAY.end];
  await sharp([title, ...photos, end], { join: { animated: true } }).gif({ delay, loop: 0, colours: 128 }).toFile(out);
  return out;
};
