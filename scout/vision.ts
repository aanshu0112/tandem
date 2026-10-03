// Claude vision over Street View frames → Flag[].
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import pLimit from "p-limit";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Flag, FlagType, Persona } from "../shared/types";
import { CACHE_DIR } from "./google";
import type { Frame } from "./frames";

const MODEL = process.env.SCOUT_MODEL ?? "claude-sonnet-5-5";
const BATCH_SIZE = 5;
export const MIN_CONFIDENCE = Number(process.env.SCOUT_MIN_CONFIDENCE ?? 0.5);
// Bump when the prompt changes so cached answers from the old prompt aren't reused.
const PROMPT_VERSION = 3;

const ISSUES = ["none", "not_a_street", "steps", "no_curb_ramp", "broken_sidewalk", "obstruction", "construction"] as const;

const FrameVerdict = z.object({
  frame: z.number().int(),
  issue: z.enum(ISSUES),
  severity: z.number().int(), // 1–3, clamped below
  confidence: z.number(), // 0–1, clamped below
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  note: z.string(),
});
const BatchVerdict = z.object({ frames: z.array(FrameVerdict) });
export type FrameVerdict = z.infer<typeof FrameVerdict>;

const PERSONA_TEXT: Record<Persona, string> = {
  wheelchair:
    "someone who uses a wheelchair. Steps and curbs with no ramp usually block them completely (severity 3).",
  stroller:
    "someone pushing a stroller. They care about the same barriers, but can often get past with effort, so use lower severity unless the path is truly blocked.",
  night_solo:
    "someone walking alone at night. Focus on obstructions and construction that force them into the road or a narrow, hidden path.",
};

function prompt(persona: Persona, n: number) {
  return `You are checking street-level photos along a walking route for ${PERSONA_TEXT[persona]}
There are ${n} images, numbered 0..${n - 1} in the order shown. For EACH image, report the most important
physical barrier on the sidewalk or path ahead: steps or stairs, a curb with no curb ramp at a crossing,
broken/uneven sidewalk, obstructions (poles, signs, parked scooters blocking the path), construction.
Only report something if it is ON the path this person would use and makes it hard or impossible to get
through. Do NOT report:
- signs, cones or barriers on the road, a median or a planter
- scooters, bikes, poles or furniture at the edge of a sidewalk that still leaves a clear path
- parked cars that are in a lane or parking space, not on the sidewalk

If an image is not an outdoor street view at all (inside a building, shop or market hall, a road tunnel,
or a photo of a wall), use issue "not_a_street". Never report barriers you see indoors.

Return one entry per image. Use issue "none" when nothing blocks the path.
- severity: 1 (slows them down), 2 (hard to get past), 3 (this person likely cannot get past)
- confidence: 0.0-1.0. If unsure, still report it with a lower confidence.
- box: the barrier's rough location as fractions (0-1) of the image width/height, or null
- note: a short description a person would understand, e.g. "No curb ramp at the corner"`;
}

const client = new Anthropic();
const visionLimit = pLimit(Number(process.env.SCOUT_VISION_CONCURRENCY ?? 8));

const cachePath = (f: Frame, persona: Persona) =>
  `${CACHE_DIR}/vision/${MODEL}/v${PROMPT_VERSION}/${f.panoId}_h${f.heading}_${persona}.json`;

async function classifyBatch(batch: Frame[], persona: Persona): Promise<FrameVerdict[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const [k, f] of batch.entries()) {
    const data = Buffer.from(await Bun.file(f.imagePath).arrayBuffer()).toString("base64");
    content.push({ type: "text", text: `Image ${k}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  content.push({ type: "text", text: prompt(persona, batch.length) });

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(BatchVerdict) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) {
    throw new Error(`Vision batch failed (stop_reason: ${res.stop_reason})`);
  }
  return res.parsed_output.frames;
}

// Returns one verdict per frame (same order), using the on-disk cache where possible.
async function verdictsFor(frames: Frame[], persona: Persona, onBatch?: () => void) {
  const out = new Map<Frame, FrameVerdict>();
  const todo: Frame[] = [];
  for (const f of frames) {
    const p = cachePath(f, persona);
    if (existsSync(p)) out.set(f, await Bun.file(p).json());
    else todo.push(f);
  }

  const batches: Frame[][] = [];
  for (let k = 0; k < todo.length; k += BATCH_SIZE) batches.push(todo.slice(k, k + BATCH_SIZE));

  await mkdir(`${CACHE_DIR}/vision/${MODEL}/v${PROMPT_VERSION}`, { recursive: true });
  await Promise.all(
    batches.map((batch) =>
      visionLimit(async () => {
        const verdicts = await classifyBatch(batch, persona);
        for (const v of verdicts) {
          const f = batch[v.frame];
          if (!f || out.has(f)) continue;
          out.set(f, v);
          await Bun.write(cachePath(f, persona), JSON.stringify(v));
        }
        onBatch?.();
      }),
    ),
  );
  return { verdicts: frames.map((f) => out.get(f)), batches: batches.length };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function verdictToFlag(v: FrameVerdict, f: Frame, id: string): Flag | null {
  // "not_a_street": Google sometimes serves an indoor or tunnel pano for a street point.
  // That spot is unchecked, not clear and not blocked.
  if (v.issue === "none" || v.issue === "not_a_street" || v.confidence < MIN_CONFIDENCE) return null;
  const box = v.box
    ? {
        x: clamp(v.box.x, 0, 1),
        y: clamp(v.box.y, 0, 1),
        w: clamp(v.box.w, 0, 1),
        h: clamp(v.box.h, 0, 1),
      }
    : undefined;
  return {
    id,
    type: v.issue as FlagType,
    severity: clamp(Math.round(v.severity), 1, 3) as Flag["severity"],
    confidence: clamp(v.confidence, 0, 1),
    location: { lat: f.lat, lng: f.lng },
    source: "vision",
    imagePath: f.imagePath,
    box,
    photoDate: f.date,
    note: v.note,
  };
}

export async function classifyFrames(
  frames: Frame[],
  persona: Persona,
  opts: { idPrefix?: string; onBatch?: () => void } = {},
): Promise<Flag[]> {
  const { verdicts } = await verdictsFor(frames, persona, opts.onBatch);
  const flags: Flag[] = [];
  verdicts.forEach((v, k) => {
    const f = frames[k]!;
    const flag = v && verdictToFlag(v, f, `${opts.idPrefix ?? "v"}-${f.i}`);
    if (flag) flags.push(flag);
  });
  return flags;
}

// How many Claude requests classifyFrames would make (for progress reporting).
export function batchCount(frames: Frame[], persona: Persona) {
  const todo = frames.filter((f) => !existsSync(cachePath(f, persona))).length;
  return Math.ceil(todo / BATCH_SIZE);
}
