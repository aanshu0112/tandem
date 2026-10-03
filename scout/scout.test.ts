// Offline tests (no API keys): sampling, merging, scoring. bun run test:scout-unit
import { expect, test } from "bun:test";
import { encode } from "@googlemaps/polyline-codec";
import type { Flag, RouteResult } from "../shared/types";
import { samplePoints } from "./sample";
import { mergeFlags, metersBetween, pickRoute, scoreFlags } from "./score";
import { cleanNote, verdictToFlag } from "./vision";
import { uncheckedStretches } from "./coverage";

// ~111 m straight north, then ~75 m straight east (Seattle latitudes).
const route = encode([
  [47.61, -122.34],
  [47.611, -122.34],
  [47.611, -122.339],
]);

test("samplePoints spaces points evenly and faces along the route", () => {
  const pts = samplePoints(route, 15);
  expect(pts.length).toBeGreaterThan(10);
  for (let k = 1; k < pts.length; k++) {
    expect(metersBetween(pts[k - 1]!, pts[k]!)).toBeLessThanOrEqual(15.5);
  }
  expect(pts[0]!.heading).toBeCloseTo(0, 0); // north
  expect(pts.at(-1)!.heading).toBeCloseTo(90, 0); // east
  // starts at the origin and ends exactly at the destination
  expect(metersBetween(pts[0]!, { lat: 47.61, lng: -122.34 })).toBeLessThan(0.5);
  expect(metersBetween(pts.at(-1)!, { lat: 47.611, lng: -122.339 })).toBeLessThan(0.5);
});

const flag = (over: Partial<Flag>): Flag => ({
  id: "x",
  type: "no_curb_ramp",
  severity: 2,
  confidence: 0.5,
  location: { lat: 47.61, lng: -122.34 },
  source: "vision",
  ...over,
});

test("mergeFlags collapses nearby same-type flags, keeping the best", () => {
  const merged = mergeFlags([
    flag({ id: "a", confidence: 0.6, severity: 2 }),
    flag({ id: "b", confidence: 0.9, severity: 1, location: { lat: 47.61005, lng: -122.34 } }), // ~6 m
    flag({ id: "c", type: "steps" }), // same spot, different type
    flag({ id: "d", location: { lat: 47.6105, lng: -122.34 } }), // ~55 m away
  ]);
  expect(merged.map((f) => f.id).sort()).toEqual(["b", "c", "d"]);
  const b = merged.find((f) => f.id === "b")!;
  expect(b.severity).toBe(2); // worst severity of the pair
});

test("scoreFlags weights severity squared by confidence", () => {
  expect(scoreFlags([flag({ severity: 3, confidence: 1 }), flag({ severity: 1, confidence: 0.5 })])).toBe(9.5);
});

const result = (routeId: string, score: number, durationMin: number): RouteResult => ({
  routeId,
  polyline: "",
  durationMin,
  flags: [],
  score,
});

test("pickRoute prefers the lowest score, then the shorter route when close", () => {
  expect(pickRoute([result("r0", 9, 8), result("r1", 0, 12)]).routeId).toBe("r1");
  expect(pickRoute([result("r0", 0.5, 8), result("r1", 0, 12)]).routeId).toBe("r0");
});

test("verdictToFlag drops 'none' and low confidence, clamps the rest", () => {
  const frame = { i: 3, panoId: "p", date: "2024-06", lat: 47.6, lng: -122.3, heading: 90, distM: 0, imagePath: "x.jpg" };
  const v = { frame: 0, issue: "steps" as const, severity: 5, confidence: 1.2, box: { x: -0.1, y: 0.5, w: 0.3, h: 2 }, note: "Steps" };
  expect(verdictToFlag({ ...v, issue: "none" }, frame, "id")).toBeNull();
  expect(verdictToFlag({ ...v, issue: "not_a_street" }, frame, "id")).toBeNull();
  expect(verdictToFlag({ ...v, confidence: 0.1 }, frame, "id")).toBeNull();
  const f = verdictToFlag(v, frame, "id")!;
  expect(f).toMatchObject({ type: "steps", severity: 3, confidence: 1, photoDate: "2024-06", imagePath: "x.jpg" });
  expect(f.box).toEqual({ x: 0, y: 0.5, w: 0.3, h: 1 });
});

test("uncheckedStretches joins nearby gaps and keeps distant ones apart", () => {
  const spot = (distM: number, reason: "no_street_view" | "not_a_street" = "no_street_view") => ({
    lat: 47.61 + distM / 111_000,
    lng: -122.34,
    distM,
    reason,
  });
  expect(uncheckedStretches([])).toEqual([]);
  const s = uncheckedStretches([spot(300), spot(0), spot(15, "not_a_street"), spot(30)]);
  expect(s.length).toBe(2);
  expect(s[0]).toMatchObject({ startM: 0, lengthM: 45 });
  expect(s[0]!.reasons.sort()).toEqual(["no_street_view", "not_a_street"]);
  expect(s[1]).toMatchObject({ startM: 300, lengthM: 15, reasons: ["no_street_view"] });
});

test("cleanNote strips stray markup from model notes", () => {
  expect(cleanNote("Uneven paving slows wheelchair travel.}")).toBe("Uneven paving slows wheelchair travel.");
  expect(cleanNote("Cracked pavement near the space.</br>")).toBe("Cracked pavement near the space.");
  expect(cleanNote("  No curb ramp\n at the corner. ")).toBe("No curb ramp at the corner.");
});
