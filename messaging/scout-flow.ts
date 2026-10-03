// What the user sees when the agent calls scout_route. Our code sends these messages, not Claude,
// so they match the demo script exactly and arrive fast. Claude gets a short summary back for follow-ups.
import { attachment, type Space } from "spectrum-ts";
import type { Flag, Persona, RouteResult } from "../shared/types";
// Merge 2: point these at scout/ and visuals/.
import { annotatePhoto, renderRouteMap, scoutRoute } from "./fakes";

const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ScoutInput = { from: string; to: string; persona: Persona };

export async function runScoutFlow(space: Space, input: ScoutInput): Promise<string> {
  await space.send("Walking it for you now, give me a minute 🚶");

  let halfway: Promise<unknown> = Promise.resolve();
  let sentHalfway = false;
  const result = await scoutRoute(input.from, input.to, input.persona, (pct, flagsSoFar) => {
    if (sentHalfway || pct < 50) return;
    sentHalfway = true;
    halfway = space.send(halfwayText(flagsSoFar.length)).catch((err) => console.error("halfway send failed:", err));
  });
  await halfway; // keep message order: "halfway" must land before the results

  const fastest = minBy(result.routes, (r) => r.durationMin);
  const recommended = result.routes.find((r) => r.routeId === result.recommendedRouteId) ?? fastest;
  if (!fastest || !recommended) {
    await space.send("I couldn't find a walking route between those two places 😕 Can you give me a more exact address?");
    return "No walking route found.";
  }

  const problems = fastest.flags.filter((f) => f.severity >= 2).slice(0, NUMBERS.length);
  const minor = fastest.flags.length - problems.length;

  await space.send(attachment(await renderRouteMap(result)));

  if (problems.length === 0) {
    await space.send(`Good news: the direct route looks clear for you ✅ About ${fastest.durationMin} min.`);
    return summary(input, fastest, recommended, problems);
  }

  await space.send(`The direct route (${fastest.durationMin} min) has ${count(problems.length, "problem")}:`);
  for (const [i, flag] of problems.entries()) {
    const line = `${NUMBERS[i]} ${flag.note ?? flag.type.replaceAll("_", " ")}${photoDate(flag)}`;
    if (flag.imagePath) await space.send(line, attachment(await annotatePhoto(flag)));
    else await space.send(line);
  }

  if (recommended.routeId !== fastest.routeId) {
    const extra = recommended.durationMin - fastest.durationMin;
    const avoids = recommended.flags.some((f) => f.severity >= 2) ? "avoids most of them" : problems.length > 1 ? "avoids all of them" : "avoids it";
    await space.send(`This other route ${avoids} and adds ${extra > 0 ? `${extra} min` : "no time"} 👆 (green on the map)`);
  } else {
    await space.send("That's still the best option I found. Want me to look for a different way?");
  }
  if (minor > 0) await space.send(`Also ${count(minor, "smaller thing")} to watch for. Ask me if you want details.`);

  return summary(input, fastest, recommended, problems);
}

function halfwayText(n: number) {
  return n === 0 ? "Halfway there. Looks clear so far." : `Halfway there. ${capitalize(count(n, "problem"))} so far.`;
}

function photoDate(flag: Flag) {
  if (!flag.photoDate) return "";
  const [year, month] = flag.photoDate.split("-");
  const name = month ? MONTHS[Number(month) - 1] : undefined;
  return ` (photo from ${name ? `${name} ` : ""}${year})`;
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
function summary(input: ScoutInput, fastest: RouteResult, recommended: RouteResult, problems: Flag[]) {
  return JSON.stringify({
    instructions:
      "The user ALREADY received the map, every problem with its photo, and the route recommendation. Do NOT summarize or repeat any of it. " +
      "Reply with exactly NONE, or with ONE short sentence (under 15 words) that adds something new, like a question about their departure time.",
    from: input.from,
    to: input.to,
    persona: input.persona,
    directRoute: { minutes: fastest.durationMin, problems: fastest.flags.map((f) => ({ type: f.type, severity: f.severity, note: f.note, photoDate: f.photoDate })) },
    recommendedRoute: { minutes: recommended.durationMin, sameAsDirect: recommended.routeId === fastest.routeId, problems: recommended.flags.map((f) => f.note ?? f.type) },
    seriousProblemsShown: problems.length,
  });
}
