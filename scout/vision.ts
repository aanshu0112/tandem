// Claude vision over Street View frames → Flag[].
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import pLimit from "p-limit";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Flag, FlagType, Persona } from "../shared/types";
import { CACHE_DIR, streetViewImage } from "./google";
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
const SecondLook = FrameVerdict.omit({ frame: true });
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

// Flags in this confidence band get a second look from two more angles.
// Bump `version` when the second-look prompt changes.
const SECOND_LOOK = { min: 0.4, max: 0.7, turnDeg: 30, version: 2 };

function secondLookPrompt(persona: Persona, v: FrameVerdict) {
  return `You are double-checking one spot on a walking route for ${PERSONA_TEXT[persona]}
Image 0 is the original view. Images 1 and 2 show the same spot, turned ${SECOND_LOOK.turnDeg} degrees left and right.
A first check suspected: ${v.issue} (${v.note}).

Look at all three images and decide whether that barrier is really ON the path this person would use.
Use the same rules as before: ignore things on the road, a median or a planter, ignore anything at the
edge of a sidewalk that still leaves a clear path, and use "not_a_street" for indoor or tunnel views.
If the barrier isn't confirmed, use issue "none". Give the box in image 0's coordinates, or null.
- severity: 1 (slows them down), 2 (hard to get past), 3 (this person likely cannot get past)
- confidence: 0.0-1.0 after seeing all three angles
- note: ONE short sentence (under 15 words) a person would understand, e.g. "No curb ramp at the corner".
  It is sent as a text message, so don't describe the images or your reasoning.`;
}

const client = new Anthropic();
const visionLimit = pLimit(Number(process.env.SCOUT_VISION_CONCURRENCY ?? 8));

const cachePath = (f: Frame, persona: Persona, suffix = "") =>
  `${CACHE_DIR}/vision/${MODEL}/v${PROMPT_VERSION}/${f.panoId}_h${f.heading}_${persona}${suffix}.json`;

const imageBlock = async (path: string): Promise<Anthropic.ImageBlockParam> => ({
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg",
    data: Buffer.from(await Bun.file(path).arrayBuffer()).toString("base64"),
  },
});

async function classifyBatch(batch: Frame[], persona: Persona): Promise<FrameVerdict[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (const [k, f] of batch.entries()) {
    content.push({ type: "text", text: `Image ${k}:` });
    content.push(await imageBlock(f.imagePath));
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

const needsSecondLook = (v: FrameVerdict) =>
  v.issue !== "none" &&
  v.issue !== "not_a_street" &&
  v.confidence >= SECOND_LOOK.min &&
  v.confidence < SECOND_LOOK.max;

// Re-check one uncertain frame with two more angles of the same pano. Cached like the first pass.
async function secondLook(f: Frame, v: FrameVerdict, persona: Persona): Promise<FrameVerdict> {
  const p = cachePath(f, persona, `_look2v${SECOND_LOOK.version}`);
  if (existsSync(p)) return { ...(await Bun.file(p).json()), frame: v.frame };

  const turn = SECOND_LOOK.turnDeg;
  let sides: string[];
  try {
    sides = await Promise.all(
      [-turn, turn].map((d) => streetViewImage(f.panoId, { heading: (f.heading + d + 360) % 360 })),
    );
  } catch (e) {
    // No extra angles (quota, outage): keep the first answer rather than failing the scout.
    console.warn(`[scout] second look skipped: ${(e as Error).message}`);
    return v;
  }
  const content: Anthropic.ContentBlockParam[] = [];
  for (const [k, path] of [f.imagePath, ...sides].entries()) {
    content.push({ type: "text", text: `Image ${k}:` });
    content.push(await imageBlock(path));
  }
  content.push({ type: "text", text: secondLookPrompt(persona, v) });

  const res = await visionLimit(() =>
    client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(SecondLook) },
    }),
  );
  if (res.stop_reason === "refusal" || !res.parsed_output) return v; // keep the first answer
  await Bun.write(p, JSON.stringify(res.parsed_output));
  return { ...res.parsed_output, frame: v.frame };
}

// Notes go straight into a text message. Drop stray markup the model sometimes leaves at the end.
export const cleanNote = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/[{}\[\]`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
    note: cleanNote(v.note),
  };
}

export type ClassifyOpts = { idPrefix?: string; onBatch?: () => void; secondLook?: boolean };

// Flags, plus the frames that turned out not to show a street (indoor or tunnel panos).
export async function classifyFramesDetailed(frames: Frame[], persona: Persona, opts: ClassifyOpts = {}) {
  const { verdicts } = await verdictsFor(frames, persona, opts.onBatch);
  const final = await Promise.all(
    verdicts.map((v, k) =>
      v && opts.secondLook !== false && needsSecondLook(v) ? secondLook(frames[k]!, v, persona) : v,
    ),
  );

  const flags: Flag[] = [];
  const notAStreet: Frame[] = [];
  final.forEach((v, k) => {
    const f = frames[k]!;
    if (v?.issue === "not_a_street") notAStreet.push(f);
    const flag = v && verdictToFlag(v, f, `${opts.idPrefix ?? "v"}-${f.i}`);
    if (flag) flags.push(flag);
  });
  return { flags, notAStreet, secondLooks: final.filter((v, k) => v !== verdicts[k]).length };
}

export async function classifyFrames(frames: Frame[], persona: Persona, opts: ClassifyOpts = {}) {
  return (await classifyFramesDetailed(frames, persona, opts)).flags;
}

// How many Claude requests classifyFrames would make (for progress reporting).
export function batchCount(frames: Frame[], persona: Persona) {
  const todo = frames.filter((f) => !existsSync(cachePath(f, persona))).length;
  return Math.ceil(todo / BATCH_SIZE);
}
