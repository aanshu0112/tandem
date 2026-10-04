// Dashboard server: serves dashboard/, streams live ScoutEvents at /events, serves images at /files/.
// Run alone with `bun run dashboard`; bot.ts also starts it so real scouts show up live.
import { normalize } from "node:path";
import type { ScoutEvent } from "../shared/types";

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
