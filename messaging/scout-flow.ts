// What the user sees when the agent calls scout_route. Our code sends these messages, not Claude,
// so they match the demo script exactly and arrive fast. Claude gets a short summary back for follow-ups.
import { attachment, group, type Space } from "spectrum-ts";
import type { Flag, Persona, RouteResult, ScoutResult } from "../shared/types";
import { metersBetween, scoutRouteDetailed, type UncheckedStretch } from "../scout";
import { annotatePhoto, renderRouteMap } from "../visuals";
import { scoutRoute as fakeScoutRoute } from "./fakes";

// Without a Google key, fall back to the fixture so the conversation can still be tested.
const LIVE = !!process.env.GOOGLE_MAPS_API_KEY && process.env.SCOUT_MODE !== "fake";
const SERIOUS = 2; // severity at or above this gets a number, a pin and a photo
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_PHOTOS = 4;

export type ScoutInput = { from: string; to: string; persona: Persona };

type Details = { result: ScoutResult; unchecked: Record<string, UncheckedStretch[]> };

async function scout(input: ScoutInput, onProgress: (pct: number, flags: Flag[]) => void): Promise<Details> {
  if (LIVE) return scoutRouteDetailed(input.from, input.to, input.persona, onProgress);
  return { result: await fakeScoutRoute(input.from, input.to, input.persona, onProgress), unchecked: {} };
}

export async function runScoutFlow(space: Space, input: ScoutInput): Promise<string> {
  await space.send("Walking it for you now, give me a minute 🚶");

  // Progress messages go out in order, never after the results.
  let progress: Promise<unknown> = Promise.resolve();
  const said = new Set<string>();
  const say = (key: string, text: string) => {
    if (said.has(key)) return;
    said.add(key);
    progress = progress.then(() => space.send(text)).catch((err) => console.error("progress send failed:", err));
  };
  const { result: raw, unchecked } = await scout(input, (pct, flagsSoFar) => {
    if (pct >= 30) say("photos", "Got the routes. Now looking at the Street View photos 👀");
    if (pct >= 60) {
      const n = flagsSoFar.filter((f) => f.severity >= SERIOUS).length;
      say("halfway", n === 0 ? "Halfway there. Looks clear so far." : `Halfway there. ${capitalize(count(n, "problem"))} so far.`);
    }
  });
  await progress;

  // The map shows only the routes we talk about (direct, then recommended) and only serious flags,
  // so its pin numbers match the numbers in our messages.
  const serious = (r: RouteResult) => ({ ...r, flags: r.flags.filter((f) => f.severity >= SERIOUS) });
  const direct = minBy(raw.routes, (r) => r.durationMin);
  const best = raw.routes.find((r) => r.routeId === raw.recommendedRouteId) ?? direct;
  if (!direct || !best) {
    await space.send("I couldn't find a walking route between those two places 😕 Can you give me a more exact address?");
    return "No walking route found.";
  }
  const shown = (best.routeId === direct.routeId ? [direct] : [direct, best]).map(serious);
  const directShown = shown[0]!;
  const recommended = shown.at(-1)!;

  // A problem both routes share (same type, same spot) keeps the direct route's number and gets one pin.
  const twinOf = new Map<Flag, Flag>();
  for (const f of recommended === directShown ? [] : recommended.flags) {
    const twin = directShown.flags.find((d) => d.type === f.type && metersBetween(d.location, f.location) <= 25);
    if (twin) twinOf.set(f, twin);
  }
  const mapRoutes = shown.map((r) => (r === directShown ? r : { ...r, flags: r.flags.filter((f) => !twinOf.has(f)) }));
  const result: ScoutResult = { ...raw, routes: mapRoutes };
  // Keyed by the flag itself: ids like "grade-1" repeat across routes.
  const pinNumber = new Map(mapRoutes.flatMap((r) => r.flags).map((f, i) => [f, i + 1]));
  for (const [f, twin] of twinOf) pinNumber.set(f, pinNumber.get(twin)!);
  const label = (f: Flag) => `${NUMBERS[(pinNumber.get(f) ?? 1) - 1] ?? "•"} ${f.note ?? f.type.replaceAll("_", " ")}`;

  try {
    await space.send(attachment(await renderRouteMap(result)));
  } catch (err) {
    console.error("map render failed:", err);
  }

  if (directShown.flags.length === 0) {
    await space.send(`Good news: the direct route looks clear for you ✅ About ${minutes(directShown.durationMin)}.`);
  } else {
    await space.send(
      `The direct route (${minutes(directShown.durationMin)}${shown.length > 1 ? ", red on the map" : ""}) has ${count(directShown.flags.length, "problem")}:\n` +
        directShown.flags.map((f) => `${label(f)}${photoDate(f)}`).join("\n"),
    );
    await sendPhotos(space, directShown.flags);

    if (recommended.routeId !== directShown.routeId) {
      const avoided = directShown.flags.filter((f) => !recommended.flags.some((g) => g.type === f.type)).length;
      const what = avoided === directShown.flags.length ? (avoided === 1 ? "avoids that" : "avoids all of them") : "avoids the worst of it";
      const extra = recommended.durationMin - directShown.durationMin;
      await space.send(`The green route ${what} and ${extra >= 0.75 ? `adds about ${minutes(extra)}` : "takes about the same time"} 👆`);
      if (recommended.flags.length > 0) {
        const shared = recommended.flags.every((f) => twinOf.has(f));
        await space.send(`Heads up, ${shared ? "both routes share" : "it still has"}:\n${recommended.flags.map(label).join("\n")}`);
      }
    } else {
      await space.send("That's still the best option I found. Want me to look for a different way?");
    }
  }

  const gap = uncheckedMeters(unchecked[recommended.routeId]);
  if (gap >= 50) await space.send(`I couldn't see about ${gap} m of it in Street View, so I couldn't check that part.`);

  return summary(input, directShown, recommended, gap, raw);
}

async function sendPhotos(space: Space, flags: Flag[]) {
  const photos = await Promise.all(
    flags.filter((f) => f.imagePath).slice(0, MAX_PHOTOS).map((f) => annotatePhoto(f).catch(() => f.imagePath!)),
  );
  const [first, second, ...rest] = photos.map((p) => attachment(p));
  if (first && second) await space.send(group(first, second, ...rest)); // one album, not a message per photo
  else if (first) await space.send(first);
}

function minutes(m: number) {
  const n = Math.max(1, Math.round(m));
  return `${n} min`;
}

function photoDate(flag: Flag) {
  if (!flag.photoDate) return "";
  const [year, month] = flag.photoDate.split("-");
  const name = month ? MONTHS[Number(month) - 1] : undefined;
  return ` (photo from ${name ? `${name} ` : ""}${year})`;
}

function uncheckedMeters(stretches: UncheckedStretch[] | undefined) {
  return Math.round((stretches ?? []).reduce((m, s) => m + s.lengthM, 0) / 10) * 10;
}

function count(n: number, word: string) {
  return `${n === 1 ? "one" : n} ${word}${n === 1 ? "" : "s"}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function minBy<T>(items: T[], key: (t: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, t) => (best === undefined || key(t) < key(best) ? t : best), undefined);
}

// What Claude sees, so it can answer "what about the steps?" without re-running the scout.
function summary(input: ScoutInput, direct: RouteResult, recommended: RouteResult, uncheckedM: number, raw: ScoutResult) {
  const describe = (r: RouteResult) => raw.routes.find((x) => x.routeId === r.routeId)?.flags.map((f) => ({ type: f.type, severity: f.severity, note: f.note, photoDate: f.photoDate, source: f.source })) ?? [];
  return JSON.stringify({
    instructions:
      "The user ALREADY received the map, every problem with its photo, and the route recommendation. Do NOT summarize or repeat any of it. " +
      "Reply with exactly NONE, or with ONE short sentence (under 15 words) that adds something new, like a question about their departure time.",
    from: input.from,
    to: input.to,
    persona: input.persona,
    directRoute: { minutes: Math.round(direct.durationMin), problems: describe(direct) },
    recommendedRoute: { minutes: Math.round(recommended.durationMin), sameAsDirect: recommended.routeId === direct.routeId, problems: describe(recommended) },
    metersNotCheckedOnRecommended: uncheckedM,
  });
}
