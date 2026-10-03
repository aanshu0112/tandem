// The contract between messaging/, scout/ and visuals/.
// Change only with all 3 people agreeing, and update fixtures/demo-scout.json in the same commit.

export type LatLng = { lat: number; lng: number };
export type Persona = "wheelchair" | "stroller" | "night_solo";

export type FlagType =
  | "steps"
  | "no_curb_ramp"
  | "steep_grade"
  | "broken_sidewalk"
  | "obstruction"
  | "construction"
  | "transit_outage";

export type Flag = {
  id: string;
  type: FlagType;
  severity: 1 | 2 | 3; // 3 = blocks the route for this persona
  confidence: number; // 0–1
  location: LatLng;
  source: "vision" | "elevation" | "osm" | "user" | "alert";
  imagePath?: string; // Street View frame on disk
  box?: { x: number; y: number; w: number; h: number }; // 0–1 fractions of the image, rough
  photoDate?: string; // "2024-06", from Street View metadata
  note?: string; // human-readable, e.g. "No curb ramp at 2nd & Bell"
};

export type RouteResult = {
  routeId: string;
  polyline: string; // Google encoded polyline
  durationMin: number;
  flags: Flag[];
  score: number; // lower is better
};

export type ScoutResult = {
  from: string;
  to: string;
  persona: Persona;
  routes: RouteResult[];
  recommendedRouteId: string;
};

// scout/ (Person 2)
export type ScoutRoute = (
  from: string,
  to: string,
  persona: Persona,
  onProgress?: (pct: number, flagsSoFar: Flag[]) => void,
) => Promise<ScoutResult>;

// visuals/ (Person 3)
export type RenderRouteMap = (r: ScoutResult) => Promise<string>; // png path
export type AnnotatePhoto = (f: Flag) => Promise<string>; // png path
export type GradeFlags = (polyline: string) => Promise<Flag[]>;
export type GetAlerts = (polyline: string) => Promise<Flag[]>; // mocked for the demo

// ---- Live scout events (Round 5) ----
// scout/ emits these while it works, messaging/ relays them to the browser at GET /events
// (server-sent events, one JSON ScoutEvent per message), dashboard/ draws them.
// Image paths are repo-relative (".cache/sv/…jpg", "fixtures/…", "out/…"); the server serves
// them at /files/<imagePath>.

export type Verdict = FlagType | "none" | "not_a_street";

export type ScoutEvent =
  | { type: "start"; scoutId: string; from: string; to: string; persona: Persona; at: number }
  | { type: "routes"; scoutId: string; routes: { routeId: string; polyline: string; durationMin: number }[] }
  // a Street View photo is ready to be checked
  | { type: "frame"; scoutId: string; routeId: string; frameId: string; location: LatLng; heading: number; distM: number; imagePath: string; photoDate?: string }
  // Claude's answer for that photo (sent again with secondLook: true if it took a second look)
  | { type: "verdict"; scoutId: string; routeId: string; frameId: string; verdict: Verdict; severity?: 1 | 2 | 3; confidence: number; box?: Flag["box"]; note?: string; secondLook?: boolean }
  // a final, merged flag (vision, OSM, elevation, alerts, user reports)
  | { type: "flag"; scoutId: string; routeId: string; flag: Flag }
  | { type: "progress"; scoutId: string; pct: number; photosChecked: number; photosTotal: number }
  | { type: "done"; scoutId: string; result: ScoutResult }
  | { type: "flythrough"; scoutId: string; routeId: string; gifPath: string }
  | { type: "error"; scoutId: string; message: string };

export type OnScoutEvent = (e: ScoutEvent) => void;

// scout/ (Person 2): an animated GIF "walking" one route, pausing on each serious problem.
export type MakeFlythrough = (scoutId: string, routeId: string) => Promise<string>; // gif path
