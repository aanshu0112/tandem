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
