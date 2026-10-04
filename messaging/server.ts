// Dashboard server: serves dashboard/, streams live ScoutEvents at /events, serves images at /files/.
// Run alone with `bun run dashboard`; bot.ts also starts it so real scouts show up live.
import { normalize } from "node:path";
import fixture from "../fixtures/demo-scout.json";
import type { Flag, ScoutEvent, ScoutResult } from "../shared/types";
import { metersBetween } from "../scout/score";
import { ago, allReports, allTrips, getTrip, type Trip } from "./db";
import { publicUrl } from "./public-url";

const PORT = Number(process.env.DASHBOARD_PORT ?? 3000);
const KEEP_SCOUTS = 5;
const FILE_ROOTS = [".cache/", "fixtures/", "out/"];
const encoder = new TextEncoder();

const buffers = new Map<string, ScoutEvent[]>(); // scoutId → its events, oldest scout first
let latestScoutId: string | undefined;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

// Called by scout-flow.ts (and the demo replay) for every event.
export function publish(e: ScoutEvent) {
  if (e.type === "start") {
    latestScoutId = e.scoutId;
    buffers.set(e.scoutId, []);
    while (buffers.size > KEEP_SCOUTS) buffers.delete(buffers.keys().next().value!);
  }
  buffers.get(e.scoutId)?.push(e);
  const chunk = sse(e);
  for (const c of clients) {
    try {
      c.enqueue(chunk);
    } catch {
      clients.delete(c);
    }
  }
}

export function startServer(port = PORT) {
  const server = Bun.serve({
    port,
    idleTimeout: 0, // event streams stay open
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/events") return events();
      if (url.pathname.startsWith("/files/")) return file(decodeURIComponent(url.pathname.slice("/files/".length)));
      if (url.pathname.startsWith("/api/trip/")) return tripJson(url.pathname.slice("/api/trip/".length));
      if (url.pathname.startsWith("/trip/")) return tripPage(req, url.pathname.slice("/trip/".length));
      if (url.pathname === "/api/barriers") return Response.json(barriers());
      if (url.pathname === "/map") return dashboardFile("map.html");
      if (url.pathname === "/api/config") return Response.json(config());
      return dashboardFile(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
    },
  });
  console.log(`Dashboard on http://localhost:${server.port}`);
  return server;
}

function events() {
  let ping: Timer;
  let self: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      self = controller;
      clients.add(controller);
      // Catch a new or refreshed page up on the latest scout.
      for (const e of (latestScoutId && buffers.get(latestScoutId)) || []) controller.enqueue(sse(e));
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);
    },
    cancel() {
      clearInterval(ping);
      clients.delete(self);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

function sse(e: ScoutEvent) {
  return encoder.encode(`data: ${JSON.stringify(e)}\n\n`);
}

// Images only from the cache, fixtures and generated output. Never anything outside the repo.
async function file(path: string) {
  const clean = normalize(path).replace(/\\/g, "/"); // Windows normalize() uses backslashes
  if (clean.includes("..") || !FILE_ROOTS.some((root) => clean.startsWith(root))) return new Response("Forbidden", { status: 403 });
  const f = Bun.file(clean);
  return (await f.exists()) ? new Response(f, { headers: { "Cache-Control": "max-age=3600" } }) : new Response("Not found", { status: 404 });
}

// What the idle screen shows judges: the number to text (TANDEM_PHONE in .env, e.g. "+16287896792").
function config() {
  const phone = process.env.TANDEM_PHONE;
  if (!phone) return {};
  const digits = phone.replace(/[^\d+]/g, "");
  const pretty = digits.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
  return { phone: pretty, sms: `sms:${digits}&body=${encodeURIComponent("Noyes to Goldwin Smith, I use a wheelchair")}` };
}

// ---- trip pages ----

// "demo" is the saved Noyes → Goldwin Smith route, so the page can be built without a real scout.
function demoTrip(): Trip {
  const result = fixture as unknown as ScoutResult;
  return { id: "demo", scoutId: "demo", from: result.from, to: result.to, persona: result.persona, directRouteId: "A", result, unchecked: {}, createdAt: Date.now() };
}

function findTrip(id: string) {
  return id === "demo" ? demoTrip() : /^[a-f0-9]{20}$/.test(id) ? getTrip(id) : undefined;
}

function tripJson(id: string) {
  const trip = findTrip(id);
  return trip ? Response.json({ ...trip, userId: undefined }) : Response.json({ error: "not found" }, { status: 404 });
}

// The page is static HTML, but iMessage builds link previews from the raw HTML, so the
// Open Graph tags (title, summary, map image) are filled in here at the <!--OG--> marker.
async function tripPage(req: Request, id: string) {
  const trip = findTrip(id);
  const html = Bun.file("dashboard/trip.html");
  if (!(await html.exists())) return new Response("Trip not found", { status: 404 });
  // Unknown id: the page itself shows a friendly "not found" when its API call 404s.
  if (!trip) return new Response((await html.text()).replace("<!--OG-->", "<title>Trip not found · Tandem</title>"), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  const origin = publicUrl() ?? new URL(req.url).origin;
  const direct = trip.result.routes.find((r) => r.routeId === trip.directRouteId);
  const serious = direct?.flags.filter((f) => f.severity >= 2).length ?? 0;
  const title = `${short(trip.from)} → ${short(trip.to)}`;
  const description = serious
    ? `${serious} problem${serious === 1 ? "" : "s"} on the direct route · Tandem found a better way`
    : "The direct route looks clear · checked by Tandem";
  const og = [
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:site_name" content="Tandem">`,
    trip.mapImage ? `<meta property="og:image" content="${attr(`${origin}/files/${trip.mapImage}`)}">` : "",
    `<title>${attr(title)} · Tandem</title>`,
  ].join("\n    ");
  return new Response((await html.text()).replace("<!--OG-->", og), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const short = (place: string) => place.split(",")[0]!.trim();
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// ---- campus barrier map ----

type Barrier = Pick<Flag, "type" | "severity" | "note" | "location" | "source" | "imagePath" | "photoDate" | "box"> & {
  seenAt: number;
  sightings: number;
  ago: string;
  // No trip ids here: this list is public, and a trip id is the only key to someone's trip page.
};

// Every serious problem from every saved trip plus every user report, merged by type and place.
function barriers(): { barriers: Barrier[]; trips: number; reports: number } {
  const out: Barrier[] = [];
  const add = (f: Omit<Barrier, "sightings" | "ago">) => {
    const twin = out.find((b) => b.type === f.type && metersBetween(b.location, f.location) <= 20);
    if (!twin) return void out.push({ ...f, sightings: 1, ago: ago(f.seenAt) });
    twin.sightings++;
    if (f.seenAt > twin.seenAt) Object.assign(twin, { seenAt: f.seenAt, ago: ago(f.seenAt) });
    if (!twin.imagePath && f.imagePath) Object.assign(twin, { imagePath: f.imagePath, photoDate: f.photoDate, box: f.box });
  };
  const trips = allTrips();
  const reports = allReports();
  for (const r of reports) add({ type: r.type, severity: r.type === "steps" || r.type === "no_curb_ramp" ? 3 : 2, note: r.note, location: r.location, source: "user", seenAt: r.createdAt });
  for (const t of trips) {
    for (const route of t.result.routes) {
      for (const f of route.flags) {
        if (f.severity < 2 || f.source === "user") continue;
        add({ type: f.type, severity: f.severity, note: f.note, location: f.location, source: f.source, imagePath: f.imagePath, photoDate: f.photoDate, box: f.box, seenAt: t.createdAt });
      }
    }
  }
  return { barriers: out, trips: trips.length, reports: reports.length };
}

async function dashboardFile(path: string) {
  const clean = normalize(path).replace(/\\/g, "/"); // Windows normalize() uses backslashes
  if (clean.includes("..")) return new Response("Forbidden", { status: 403 });
  const f = Bun.file(`dashboard/${clean}`);
  if (await f.exists()) return new Response(f);
  if (clean === "index.html") {
    return new Response("<h1>Tandem dashboard</h1><p>dashboard/index.html isn't built yet. Events stream at <a href='/events'>/events</a>.</p>", {
      headers: { "Content-Type": "text/html" },
    });
  }
  return new Response("Not found", { status: 404 });
}

if (import.meta.main) startServer();
