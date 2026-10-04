// Night mode, offline: lighting, stretches, opening hours and night scoring. bun test scout
import { expect, test } from "bun:test";
import type { Flag, Highlight } from "../shared/types";
import { buildStretches, classifyPoints, lightOf, litFractionOf, openNote, smoothLight, type Light, type RoutePoint } from "./night";
import { pickRoute, scoreFlags, scoreRoute } from "./score";

// A straight route north, one point every 10 m. `spec` is one character per point:
// L lit, D lit=no, u unknown, I unknown + isolated, l lit + isolated.
function route(spec: string, name?: string): RoutePoint[] {
  return [...spec].map((c, i) => ({
    lat: 42.44 + (i * 10) / 111_000,
    lng: -76.48,
    distM: i * 10,
    light: ({ L: "lit", l: "lit", D: "unlit", u: "unknown", I: "unknown" } as Record<string, Light>)[c]!,
    isolated: c === "I" || c === "l",
    ...(name && { name }),
  }));
}

test("lightOf reads OSM lit tags", () => {
  expect(lightOf({ lit: "yes" })).toBe("lit");
  expect(lightOf({ lit: "24/7" })).toBe("lit");
  expect(lightOf({ lit: "automatic" })).toBe("lit");
  expect(lightOf({ lit: "no" })).toBe("unlit");
  expect(lightOf({})).toBe("unknown");
});

test("a short dark patch isn't flagged, a long one is", () => {
  expect(buildStretches(route("LLLDDDLLL"))).toEqual([]); // 30 m
  const flags = buildStretches(route("LLLDDDDDDLLL", "Libe Slope")); // 60 m
  expect(flags.length).toBe(1);
  expect(flags[0]).toMatchObject({ type: "unlit", severity: 2, confidence: 0.85, stretch: { startM: 30, lengthM: 60 } });
  expect(flags[0]!.note).toBe("About 60 m with no street lights on Libe Slope");
  // located in the middle of the stretch
  expect(flags[0]!.location.lat).toBeCloseTo(42.44 + 60 / 111_000, 6);
});

test("200 m or more of darkness is severity 3", () => {
  const [f] = buildStretches(route("L" + "D".repeat(20) + "L"));
  expect(f).toMatchObject({ type: "unlit", severity: 3, stretch: { startM: 10, lengthM: 200 } });
});

test("unknown lighting counts as dark only on an isolated footpath, with lower confidence", () => {
  expect(buildStretches(route("LuuuuuuuuuL"))).toEqual([]); // an untagged sidewalk next to a road
  const flags = buildStretches(route("L" + "I".repeat(8) + "L"));
  expect(flags.length).toBe(1); // unlit and isolated together: one flag
  expect(flags[0]).toMatchObject({ type: "unlit", confidence: 0.6 });
  expect(flags[0]!.note).toContain("away from roads");
});

test("a lone gap doesn't break a stretch", () => {
  const flags = buildStretches(route("LDDDLDDDL")); // 30 m + one lit point + 30 m
  expect(flags.length).toBe(1);
  expect(flags[0]!.stretch).toEqual({ startM: 10, lengthM: 70 });
  // a lone unmapped point inside a lit run is lit
  const smoothed = smoothLight(route("LLLuLLL"));
  expect(smoothed.every((p) => p.light === "lit")).toBe(true);
  expect(litFractionOf(smoothed)).toBe(1);
  expect(litFractionOf(smoothLight(route("LLuuLL")))).toBeCloseTo(0.67, 2);
});

test("a lit footpath away from roads is flagged isolated, not unlit", () => {
  expect(buildStretches(route("LllllL"))).toEqual([]); // 40 m: under the isolated minimum
  const flags = buildStretches(route("L" + "l".repeat(25) + "L"));
  expect(flags.length).toBe(1);
  expect(flags[0]).toMatchObject({ type: "isolated", severity: 2, stretch: { startM: 10, lengthM: 250 } });
  expect(flags[0]!.note).toBe("About 250 m on a footpath away from roads");
});

test("a dark stretch inside a longer isolated one gives both, without repeating the overlap", () => {
  const flags = buildStretches(route("L" + "l".repeat(10) + "D".repeat(5) + "l".repeat(10) + "L"));
  // the isolated stretch splits around the dark part (those points aren't isolated here)
  expect(flags.filter((f) => f.type === "unlit").length).toBe(1);
  expect(flags.filter((f) => f.type === "isolated").length).toBe(2);
});

test("classifyPoints finds the way each point is on and whether a road is near", () => {
  const pts = route("LLLLL").map(({ lat, lng, distM }) => ({ lat, lng, distM }));
  const footway = { tags: { highway: "footway", lit: "no", name: "Gorge Trail" }, pts: [pts[0]!, pts.at(-1)!] };
  const far = (m: number) => pts.map((p) => ({ lat: p.lat, lng: p.lng + m / 82_000 })); // ~m meters east
  const out = classifyPoints(pts, [footway]);
  expect(out.every((p) => p.light === "unlit" && p.isolated && p.name === "Gorge Trail")).toBe(true);
  // a road 20 m away: not isolated
  expect(classifyPoints(pts, [footway, { tags: { highway: "residential" }, pts: far(20) }]).some((p) => p.isolated)).toBe(false);
  // a sidewalk is never isolated
  expect(classifyPoints(pts, [{ ...footway, tags: { highway: "footway", footway: "sidewalk" } }]).some((p) => p.isolated)).toBe(false);
  // nothing within 12 m: unknown
  expect(classifyPoints(pts, [{ ...footway, pts: far(30) }])[0]).toMatchObject({ light: "unknown", isolated: false });
});

test("openNote evaluates opening hours at the given time", () => {
  const at = (h: number) => new Date(2026, 9, 3, h, 0).getTime(); // Saturday, local time
  expect(openNote("24/7", at(23))).toBe("open 24 hours");
  expect(openNote("Mo-Su 07:00-02:00", at(23))).toBe("open until 2am");
  expect(openNote("Mo-Su 07:00-21:30", at(20))).toBe("open until 9:30pm");
  expect(openNote("Mo-Fr 08:00-17:00", at(23))).toBeUndefined();
  expect(openNote("not hours at all", at(23))).toBeUndefined();
});

const flag = (over: Partial<Flag>): Flag => ({
  id: "x",
  type: "unlit",
  severity: 2,
  confidence: 0.85,
  location: { lat: 42.44, lng: -76.48 },
  source: "osm",
  ...over,
});
const phone: Highlight = { type: "blue_light_phone", location: { lat: 42.44, lng: -76.48 }, note: "Blue-light emergency phone" };

test("night scoring: phones help a little, extra minutes cost a little", () => {
  const flags = [flag({}), flag({ type: "steps", severity: 3, confidence: 1 })];
  // wheelchair and stroller: unchanged, problems only
  expect(scoreRoute({ flags, durationMin: 20, highlights: [phone] }, "wheelchair", 10)).toBe(scoreFlags(flags));
  expect(scoreRoute({ flags, durationMin: 20 }, "stroller", 10)).toBe(scoreFlags(flags));
  // night: 0.5 per phone, at most 2
  const f = [flag({})]; // 4 * 0.85 = 3.4
  expect(scoreRoute({ flags: f, durationMin: 10, highlights: [phone, phone] }, "night_solo", 10)).toBe(2.4);
  expect(scoreRoute({ flags: f, durationMin: 10, highlights: Array(9).fill(phone) }, "night_solo", 10)).toBe(1.4);
  // night: 0.3 per minute over the fastest route
  expect(scoreRoute({ flags: [], durationMin: 15 }, "night_solo", 10)).toBe(1.5);
});

test("night scoring: a much longer route doesn't win just for being lit", () => {
  const dark = [flag({ severity: 2, confidence: 0.6 })]; // 2.4
  const r = (routeId: string, flags: Flag[], durationMin: number) => ({
    routeId,
    polyline: "",
    durationMin,
    flags,
    score: scoreRoute({ flags, durationMin }, "night_solo", 10),
  });
  // 2 minutes longer and fully lit: the lit route wins
  expect(pickRoute([r("r0", dark, 10), r("r1", [], 12)]).routeId).toBe("r1");
  // 15 minutes longer: the short one wins
  expect(pickRoute([r("r0", dark, 10), r("r1", [], 25)]).routeId).toBe("r0");
  // a long unlit stretch (sev 3) is worth a fair detour
  expect(pickRoute([r("r0", [flag({ severity: 3 })], 10), r("r1", [], 25)]).routeId).toBe("r1");
});
