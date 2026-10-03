// Combined test run at every merge (PLAN.md section 6).
// Fill in as pieces land: start with the fixture, swap in real modules one by one.
import fixture from "./fixtures/demo-scout.json";
import type { ScoutResult } from "./shared/types";

const result = fixture as unknown as ScoutResult;

// TODO Merge 1: const map = await renderRouteMap(result)            (visuals/)
// TODO Merge 2: const result = await scoutRoute(from, to, persona)  (scout/)
// TODO Merge 2: send through the Spectrum terminal provider          (messaging/)

const rec = result.routes.find((r) => r.routeId === result.recommendedRouteId);
console.log(`Scout ${result.from} -> ${result.to} (${result.persona})`);
for (const r of result.routes) console.log(`  ${r.routeId}: ${r.durationMin} min, ${r.flags.length} flags, score ${r.score}`);
console.log(`Recommended: ${rec?.routeId}`);
