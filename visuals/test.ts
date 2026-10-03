// bun run test:visuals: renders out/map.png from the fixture and prints grade flags per route.
import fixture from "../fixtures/demo-scout.json";
import type { ScoutResult } from "../shared/types";
import { renderRouteMap } from "./map";
import { gradeFlags } from "./grades";

const result = fixture as unknown as ScoutResult;
console.log("map:", await renderRouteMap(result));
if (!process.argv.includes("--no-grades")) {
  for (const r of result.routes) {
    const flags = await gradeFlags(r.polyline);
    console.log(`grades ${r.routeId}:`, flags.map((f) => `sev${f.severity} ${f.note}`).join(" | ") || "none");
  }
}
