// Round 2: vision on the saved demo frames, scored against scout/ground-truth.json.
// bun run test:vision [routeId] [persona]
import type { Persona } from "../shared/types";
import type { Frame } from "./frames";
import { classifyFrames } from "./vision";
import { mergeFlags, metersBetween } from "./score";

type Truth = { type: string; lat: number; lng: number; note?: string };

const routeId = process.argv[2] ?? "r0";
const persona = (process.argv[3] ?? "wheelchair") as Persona;
const MATCH_M = 25;

const frames: Frame[] = await Bun.file(`fixtures/demo-frames/${routeId}/frames.json`).json();
const truth: Truth[] = (await Bun.file("scout/ground-truth.json").json()).problems;

const t0 = performance.now();
const flags = mergeFlags(await classifyFrames(frames, persona, { idPrefix: routeId }));
console.log(`${frames.length} frames -> ${flags.length} flags in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);

const matched = new Set<string>();
for (const t of truth) {
  const hit = flags.find(
    (f) => f.type === t.type && metersBetween(f.location, t) <= MATCH_M && !matched.has(f.id),
  );
  if (hit) matched.add(hit.id);
  console.log(
    `${hit ? "HIT " : "MISS"}  ${t.type.padEnd(16)} ${t.note ?? ""}` +
      (hit ? `  (conf ${hit.confidence.toFixed(2)}, ${hit.imagePath})` : ""),
  );
}

const extra = flags.filter((f) => !matched.has(f.id));
console.log(`\n${matched.size}/${truth.length} known problems caught, ${extra.length} other flags:`);
for (const f of extra) {
  console.log(`  ${f.type.padEnd(16)} sev ${f.severity} conf ${f.confidence.toFixed(2)}  ${f.note}  ${f.imagePath}`);
}
