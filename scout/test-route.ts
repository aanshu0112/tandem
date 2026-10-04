// Full scout on any route. bun run test:route ["from" "to"] [persona] [--events]
// --events prints the live ScoutEvent stream, then builds the flythrough GIF.
import fixture from "../fixtures/demo-scout.json";
import type { Persona, ScoutEvent } from "../shared/types";
import { makeFlythrough, scoutRouteDetailed } from "./index";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const showEvents = process.argv.includes("--events");
const from = args[0] ?? fixture.from;
const to = args[1] ?? fixture.to;
const persona = (args[2] ?? "wheelchair") as Persona;

const t0 = performance.now();
const ms = () => `${Math.round(performance.now() - t0)}`.padStart(6) + "ms";
// One line per event: the type and the fields worth eyeballing.
function line(e: ScoutEvent): string {
  switch (e.type) {
    case "start": return `start ${e.scoutId} ${e.from} -> ${e.to} (${e.persona})`;
    case "routes": return `routes ${e.routes.map((r) => `${r.routeId} ${r.durationMin}min`).join(", ")}`;
    case "frame": return `frame ${e.frameId} ${e.distM}m h${e.heading} ${e.photoDate ?? "?"} ${e.imagePath}`;
    case "verdict": return `verdict ${e.frameId} ${e.verdict}${e.severity ? ` sev${e.severity}` : ""} conf ${e.confidence.toFixed(2)}${e.secondLook ? " (second look)" : ""} ${e.note ?? ""}`;
    case "flag": return `flag ${e.routeId} ${e.flag.source} ${e.flag.type} sev${e.flag.severity} ${e.flag.note ?? ""}${e.flag.imagePath ? " [photo]" : ""}`;
    case "progress": return `progress ${e.pct}% ${e.photosChecked}/${e.photosTotal}`;
    case "done": return `done recommended ${e.result.recommendedRouteId}`;
    case "flythrough": return `flythrough ${e.routeId} ${e.gifPath}`;
    case "error": return `error ${e.message}`;
  }
}
const onEvent = showEvents ? (e: ScoutEvent) => console.log(`${ms()} ${line(e)}`) : undefined;

let ticks = 0;
const { result, unchecked, scoutId } = await scoutRouteDetailed(from, to, persona, () => ticks++, { onEvent });
const secs = ((performance.now() - t0) / 1000).toFixed(1);

console.log(`${from} -> ${to} (${persona}): ${secs}s, ${ticks} progress updates\n`);
for (const r of result.routes) {
  const star = r.routeId === result.recommendedRouteId ? " <- recommended" : "";
  console.log(`${r.routeId}: ${r.durationMin} min, score ${r.score}, ${r.flags.length} flags${star}`);
  for (const f of [...r.flags].sort((a, b) => b.severity - a.severity || b.confidence - a.confidence)) {
    console.log(
      `  sev ${f.severity} conf ${f.confidence.toFixed(2)} ${f.type.padEnd(15)} ${f.note ?? ""}` +
        (f.imagePath ? `  [${f.imagePath}]` : ""),
    );
  }
  for (const s of unchecked[r.routeId] ?? []) {
    console.log(`  couldn't check ${s.lengthM} m starting ${s.startM} m in (${s.reasons.join(", ")})`);
  }
}

if (showEvents) {
  // The recommended route, or the direct one (r0) if the recommended one has no photos.
  for (const routeId of new Set([result.recommendedRouteId, "r0"])) {
    try {
      const gif = await makeFlythrough(scoutId, routeId);
      console.log(`\nflythrough ${routeId}: ${gif} (${(Bun.file(gif).size / 1e6).toFixed(2)} MB)`);
      break;
    } catch (e) {
      console.log(`\nno flythrough for ${routeId}: ${(e as Error).message}`);
    }
  }
}
