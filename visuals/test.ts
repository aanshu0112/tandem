// bun run test:visuals: renders out/map.png and out/photos/<flagId>.png from the fixture,
// then prints grade flags per route (add --no-grades to skip the slow elevation lookups).
import fixture from "../fixtures/demo-scout.json";
import type { ScoutResult } from "../shared/types";
import { renderRouteMap } from "./map";
import { annotatePhoto } from "./photo";
import { gradeFlags } from "./grades";

const result = fixture as unknown as ScoutResult;
console.log("map:", await renderRouteMap(result));
for (const f of result.routes.flatMap((r) => r.flags)) {
  if (f.imagePath) console.log("photo:", await annotatePhoto(f));
}
if (!process.argv.includes("--no-grades")) {
  for (const r of result.routes) {
    const flags = await gradeFlags(r.polyline);
    console.log(`grades ${r.routeId}:`, flags.map((f) => `sev${f.severity} ${f.note}`).join(" | ") || "none");
  }
}
