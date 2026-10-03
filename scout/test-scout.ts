// Round 1: routes → frames on disk. bun run test:scout ["from" "to"]
// Saves fixtures/demo-frames/<routeId>/<i>.jpg + frames.json, then flip through them.
import { copyFile, mkdir, rm } from "node:fs/promises";
import fixture from "../fixtures/demo-scout.json";
import { getRoutes } from "./google";
import { collectFrames } from "./frames";

const from = process.argv[2] ?? fixture.from;
const to = process.argv[3] ?? fixture.to;
const OUT = "fixtures/demo-frames";

const t0 = performance.now();
const routes = await getRoutes(from, to);
console.log(`${from} -> ${to}: ${routes.length} route(s)`);

for (const r of routes) {
  const { frames, sampled, uncovered } = await collectFrames(r.polyline);
  const dir = `${OUT}/${r.routeId}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const f of frames) await copyFile(f.imagePath, `${dir}/${f.i}.jpg`);
  await Bun.write(
    `${dir}/frames.json`,
    JSON.stringify(
      frames.map(({ imagePath, ...f }) => ({ ...f, imagePath: `${dir}/${f.i}.jpg` })),
      null,
      2,
    ),
  );

  const dates = [...new Set(frames.map((f) => f.date).filter(Boolean))].sort();
  console.log(
    `  ${r.routeId}: ${(r.distanceM / 1000).toFixed(2)} km, ${r.durationMin} min, ` +
      `${sampled} points -> ${frames.length} unique panos, ${uncovered.length} with no coverage` +
      (dates.length ? `, photos ${dates[0]}..${dates.at(-1)}` : ""),
  );
  console.log(`     saved to ${dir}/`);
}
console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
