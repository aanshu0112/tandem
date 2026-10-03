// Full scout on any route. bun run test:route ["from" "to"] [persona]
import fixture from "../fixtures/demo-scout.json";
import type { Persona } from "../shared/types";
import { scoutRouteDetailed } from "./index";

const from = process.argv[2] ?? fixture.from;
const to = process.argv[3] ?? fixture.to;
const persona = (process.argv[4] ?? "wheelchair") as Persona;

const t0 = performance.now();
let ticks = 0;
const { result, unchecked } = await scoutRouteDetailed(from, to, persona, () => ticks++);
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
