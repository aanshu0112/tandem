// Trip context beyond the scout: the weather when they'll walk, and a bus option when walking
// looks bad (icy hills, an unlit path at night, stairs on every route).
import type { LatLng, Persona, ScoutResult, TransitOption, Weather } from "../shared/types";

// ---- weather (Open-Meteo: free, no key) ----

const WEATHER_CODES: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
  82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
};
const FREEZING_CODES = new Set([48, 56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export async function weatherAt(p: LatLng, at: number): Promise<Weather | undefined> {
  // For rehearsing the icy-hill scene on a dry day. Labeled "(demo)" so it never passes for real weather.
  if (process.env.TANDEM_WEATHER === "icy") return { tempF: 29, summary: "Freezing rain (demo)", precipitation: true, snow: false, icy: true, at };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}` +
    `&hourly=temperature_2m,precipitation,snowfall,weather_code&past_hours=6&forecast_hours=48` +
    `&temperature_unit=fahrenheit&timeformat=unixtime`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const h = ((await res.json()) as { hourly: { time: number[]; temperature_2m: number[]; precipitation: number[]; snowfall: number[]; weather_code: number[] } }).hourly;
    // The hour closest to when they'll walk, and the six hours before it (wet ground freezes later).
    let i = 0;
    for (let k = 0; k < h.time.length; k++) if (Math.abs(h.time[k]! * 1000 - at) < Math.abs(h.time[i]! * 1000 - at)) i = k;
    const recent = (arr: number[]) => arr.slice(Math.max(0, i - 6), i + 1).reduce((a, b) => a + (b ?? 0), 0);
    const tempF = Math.round(h.temperature_2m[i]!);
    const code = h.weather_code[i]!;
    const snow = SNOW_CODES.has(code) || h.snowfall[i]! > 0;
    const precipitation = (h.precipitation[i] ?? 0) > 0.1 || snow;
    const icy = FREEZING_CODES.has(code) || (tempF <= 34 && (recent(h.precipitation) > 0.5 || recent(h.snowfall) > 0));
    return { tempF, summary: WEATHER_CODES[code] ?? "Unknown", precipitation, snow, icy, at: h.time[i]! * 1000 };
  } catch (err) {
    console.error("weather failed:", err);
    return undefined;
  }
}

// ---- bus option (Google Routes API, transit) ----

export async function transitOption(from: string, to: string, at: number, reason: string): Promise<TransitOption | undefined> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails",
      },
      body: JSON.stringify({
        origin: waypoint(from),
        destination: waypoint(to),
        travelMode: "TRANSIT",
        departureTime: new Date(Math.max(at, Date.now() + 60_000)).toISOString(),
        transitPreferences: { routingPreference: "LESS_WALKING" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    type Step = { travelMode: string; staticDuration: string; transitDetails?: { transitLine?: { nameShort?: string; name?: string; agencies?: { name: string }[] }; stopDetails?: { departureStop?: { name: string } }; localizedValues?: { departureTime?: { time?: { text: string } } } } };
    const data = (await res.json()) as { routes?: { duration: string; polyline?: { encodedPolyline: string }; legs: { steps: Step[] }[] }[] };
    const route = data.routes?.[0];
    if (!route) return undefined;
    const steps = route.legs.flatMap((l) => l.steps);
    const rides = steps.filter((s) => s.transitDetails);
    if (rides.length === 0) return undefined; // Google's "transit" answer was just walking
    const secs = (d: string) => parseInt(d) || 0;
    const first = rides[0]!.transitDetails!;
    return {
      minutes: Math.round(secs(route.duration) / 60),
      walkMinutes: Math.round(steps.filter((s) => s.travelMode === "WALK").reduce((t, s) => t + secs(s.staticDuration), 0) / 60),
      lines: rides.map((r) => `${agency(r.transitDetails!.transitLine?.agencies?.[0]?.name)} ${r.transitDetails!.transitLine?.nameShort ?? r.transitDetails!.transitLine?.name ?? ""}`.trim()),
      departStop: first.stopDetails?.departureStop?.name,
      departAt: first.localizedValues?.departureTime?.time?.text,
      polyline: route.polyline?.encodedPolyline,
      reason,
    };
  } catch (err) {
    console.error("transit failed:", err);
    return undefined;
  }
}

const agency = (name?: string) => (name?.includes("Tompkins") ? "TCAT" : name?.split(" ")[0] ?? "Bus");

function waypoint(place: string) {
  const m = place.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { location: { latLng: { latitude: Number(m[1]), longitude: Number(m[2]) } } } : { address: place };
}

// ---- when to offer the bus ----

// Why the recommended walk is a bad idea right now, or undefined if it's fine.
export function busReason(persona: Persona, result: ScoutResult, weather?: Weather): string | undefined {
  const best = result.routes.find((r) => r.routeId === result.recommendedRouteId);
  if (!best) return undefined;
  const has = (type: string, minSeverity = 2) => best.flags.some((f) => f.type === type && f.severity >= minSeverity);
  if (persona !== "night_solo" && weather?.icy && (has("steep_grade") || has("steps", 1))) return "icy hills";
  if (persona === "wheelchair" && weather?.snow) return "snow on the sidewalks";
  if (persona !== "night_solo" && has("steps", 3)) return "stairs on every route";
  if (persona === "night_solo" && best.flags.some((f) => (f.type === "unlit" || f.type === "isolated") && f.severity >= 3)) return "a long unlit stretch";
  if (weather && weather.precipitation && weather.tempF < 40 && persona === "wheelchair") return "cold rain";
  return undefined;
}
