// SQLite: users (persona + conversation), trips (each scout's full result, for trip pages) and
// user reports (which become flags on future scouts). One file, data/tandem.sqlite.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import type { Flag, FlagType, LatLng, Persona, ScoutResult } from "../shared/types";

mkdirSync("data", { recursive: true });
const db = new Database(process.env.TANDEM_DB ?? "data/tandem.sqlite", { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  persona TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,           -- long random id, used in the public /trip/<id> link
  scout_id TEXT NOT NULL,
  user_id TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  persona TEXT NOT NULL,
  direct_route_id TEXT NOT NULL,
  result TEXT NOT NULL,          -- ScoutResult JSON
  unchecked TEXT NOT NULL,       -- { routeId: UncheckedStretch[] } JSON
  map_image TEXT,
  flythrough TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT,
  user_id TEXT,
  type TEXT NOT NULL,
  note TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// ---- users ----

export type StoredUser = { persona?: Persona; history: unknown[] };

export function loadUser(id: string): StoredUser {
  const row = db.query<{ persona: string | null; history: string }, [string]>("SELECT persona, history FROM users WHERE id = ?").get(id);
  return row ? { persona: (row.persona as Persona) ?? undefined, history: JSON.parse(row.history) } : { history: [] };
}

export function saveUser(id: string, user: StoredUser) {
  db.query(
    `INSERT INTO users (id, persona, history, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(id) DO UPDATE SET persona = ?2, history = ?3, updated_at = ?4`,
  ).run(id, user.persona ?? null, JSON.stringify(user.history), Date.now());
}

// ---- trips ----

export type Trip = {
  id: string;
  scoutId: string;
  userId?: string;
  from: string;
  to: string;
  persona: Persona;
  directRouteId: string;
  result: ScoutResult;
  unchecked: Record<string, unknown[]>;
  mapImage?: string;
  flythrough?: string;
  createdAt: number;
};

export function newTripId() {
  // Unguessable: the link is the only access control on a trip page.
  return crypto.randomUUID().replaceAll("-", "").slice(0, 20);
}

export function saveTrip(t: Trip) {
  db.query(
    `INSERT OR REPLACE INTO trips (id, scout_id, user_id, origin, destination, persona, direct_route_id, result, unchecked, map_image, flythrough, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(t.id, t.scoutId, t.userId ?? null, t.from, t.to, t.persona, t.directRouteId, JSON.stringify(t.result), JSON.stringify(t.unchecked), t.mapImage ?? null, t.flythrough ?? null, t.createdAt);
}

export function setTripFlythrough(id: string, gifPath: string) {
  db.query("UPDATE trips SET flythrough = ? WHERE id = ?").run(gifPath, id);
}

type TripRow = {
  id: string; scout_id: string; user_id: string | null; origin: string; destination: string; persona: string;
  direct_route_id: string; result: string; unchecked: string; map_image: string | null; flythrough: string | null; created_at: number;
};

function toTrip(r: TripRow): Trip {
  return {
    id: r.id, scoutId: r.scout_id, userId: r.user_id ?? undefined, from: r.origin, to: r.destination, persona: r.persona as Persona,
    directRouteId: r.direct_route_id, result: JSON.parse(r.result), unchecked: JSON.parse(r.unchecked),
    mapImage: r.map_image ?? undefined, flythrough: r.flythrough ?? undefined, createdAt: r.created_at,
  };
}

export function getTrip(id: string): Trip | undefined {
  const row = db.query<TripRow, [string]>("SELECT * FROM trips WHERE id = ?").get(id);
  return row ? toTrip(row) : undefined;
}

export function latestTripFor(userId: string): Trip | undefined {
  const row = db.query<TripRow, [string]>("SELECT * FROM trips WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId);
  return row ? toTrip(row) : undefined;
}

export function allTrips(limit = 500): Trip[] {
  return db.query<TripRow, [number]>("SELECT * FROM trips ORDER BY created_at DESC LIMIT ?").all(limit).map(toTrip);
}

// ---- reports ----

export type Report = { id: number; tripId?: string; type: FlagType; note: string; location: LatLng; createdAt: number };

export function addReport(r: Omit<Report, "id" | "createdAt"> & { userId?: string }): Report {
  const createdAt = Date.now();
  const res = db.query("INSERT INTO reports (trip_id, user_id, type, note, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(r.tripId ?? null, r.userId ?? null, r.type, r.note, r.location.lat, r.location.lng, createdAt);
  return { id: Number(res.lastInsertRowid), tripId: r.tripId, type: r.type, note: r.note, location: r.location, createdAt };
}

export function allReports(): Report[] {
  return db
    .query<{ id: number; trip_id: string | null; type: string; note: string; lat: number; lng: number; created_at: number }, []>("SELECT * FROM reports ORDER BY created_at DESC")
    .all()
    .map((r) => ({ id: r.id, tripId: r.trip_id ?? undefined, type: r.type as FlagType, note: r.note, location: { lat: r.lat, lng: r.lng }, createdAt: r.created_at }));
}

// Reports as flags, for scout/'s addFlagSource. The scout keeps the ones near each route.
export function reportFlags(): Flag[] {
  return allReports().map((r) => ({
    id: `report-${r.id}`,
    type: r.type,
    severity: r.type === "steps" || r.type === "no_curb_ramp" ? 3 : 2,
    confidence: 0.9,
    location: r.location,
    source: "user",
    note: `${r.note} (reported by a Tandem user ${ago(r.createdAt)})`,
  }));
}

export function ago(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 60) return min <= 1 ? "just now" : `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
