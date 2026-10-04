// The Claude agent: understands what the user wants, asks for anything missing, and calls tools.
import Anthropic from "@anthropic-ai/sdk";
import type { Space } from "spectrum-ts";
import type { FlagType, LatLng, Persona } from "../shared/types";
import { addReport, latestTripFor, loadUser, saveUser } from "./db";
import { geocodeNear } from "./geocode";
import { runScoutFlow } from "./scout-flow";
import { decodePolyline } from "../visuals/polyline";

const claude = new Anthropic();
const MODEL = "claude-sonnet-5-5";
const PERSONAS: Persona[] = ["wheelchair", "stroller", "night_solo"];
const MAX_HISTORY = 40;
const MAX_TOOL_ROUNDS = 5;

const REPORT_TYPES: FlagType[] = ["steps", "no_curb_ramp", "steep_grade", "broken_sidewalk", "obstruction", "construction"];

type Session = { persona?: Persona; history: Anthropic.MessageParam[]; lastPin?: LatLng };
// In memory for speed, saved to SQLite after every turn so a restart doesn't forget anyone.
const sessions = new Map<string, Session>();

function getSession(userId: string): Session {
  let session = sessions.get(userId);
  if (!session) {
    const stored = loadUser(userId);
    session = { persona: stored.persona, history: stored.history as Anthropic.MessageParam[] };
    sessions.set(userId, session);
  }
  return session;
}
export const scouting = new Set<string>();

const tools: Anthropic.Tool[] = [
  {
    name: "scout_route",
    description:
      "Walk a route ahead of time with Street View and find barriers (steps, missing curb ramps, steep grades, broken sidewalk). " +
      "Call this as soon as you know where they're starting, where they're going, and their persona. " +
      "It sends the map, photos and recommendation to the user itself and returns a summary for you.",
    input_schema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description:
            "Start, as a full place name Google Maps can find, with the city (e.g. 'Noyes Community Recreation Center, Ithaca NY'). " +
            "Expand nicknames like 'ctown' or 'GSH'. Assume Ithaca NY if they don't say. Or 'lat,lng' from a shared location.",
        },
        to: { type: "string", description: "Destination, as a full place name with the city, same rules as from" },
        persona: { type: "string", enum: PERSONAS },
        departTime: { type: "string", description: "When they're leaving, ISO 8601, if they said" },
      },
      required: ["from", "to", "persona"],
    },
  },
  {
    name: "report_issue",
    description:
      "Save a barrier the user ran into (e.g. after they arrive and you ask what you missed). " +
      "It's shown to everyone whose route passes that spot, and on the campus barrier map.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: REPORT_TYPES },
        note: { type: "string", description: "Short description in plain words, e.g. 'Sidewalk torn up for construction'" },
        near: {
          type: "string",
          description: "Where it is, as a place Google/OpenStreetMap could find, with the city (e.g. 'Starbucks, College Ave, Ithaca NY'). Omit if they shared a location pin.",
        },
      },
      required: ["type", "note"],
    },
  },
  {
    name: "set_profile",
    description: "Save how this person gets around, so you don't ask again. Call when they tell you.",
    input_schema: {
      type: "object",
      properties: { persona: { type: "string", enum: PERSONAS } },
      required: ["persona"],
    },
  },
];

function systemPrompt(session: Session) {
  return `You are Tandem, a route scout people text before they walk somewhere. You check the route ahead of time with Street View photos and point out barriers like steps, missing curb ramps, steep hills and broken sidewalk, then suggest a better way.

How you text:
- Like a helpful friend over iMessage. Each message is 1-2 short sentences. A little emoji is fine. Never write paragraphs, lists or markdown.
- If you want to send more than one message, separate them with a blank line. Never more than 3.

What to do:
- When you know start, destination and persona, call scout_route right away. Don't ask for confirmation.
- If something is missing, ask for just that, in one short message.
- Personas: wheelchair, stroller, night_solo (walking alone, e.g. at night: Tandem checks lighting, isolated paths, blue-light phones and what's open instead of stairs). When someone tells you which fits, call set_profile.
- A message like "[shared location: 42.44,-76.48]" means they dropped a pin. Use "42.44,-76.48" as their start unless they say otherwise.
- After scout_route, the user already has the map, photos and recommendation. Never summarize them. Reply NONE, or one short new sentence.
- Never say a route is definitely "safe" or "accessible". Say what you found and that the photos can be out of date.
- If someone says they made it / arrived, say congrats in a few words and ask if they ran into anything you didn't mention.
- When they describe a problem on the way, call report_issue (ask where it was only if you can't tell). Then thank them briefly: it helps the next person.
- If someone is in danger, tell them to call 911.

${session.persona ? `This person's saved persona: ${session.persona}.` : "You don't know this person's persona yet."}
Current time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}.`;
}

export async function runAgent(userId: string, text: string, space: Space) {
  const session = getSession(userId);
  const pin = text.match(/\[shared location: (-?[\d.]+),(-?[\d.]+)\]/);
  if (pin) session.lastPin = { lat: Number(pin[1]), lng: Number(pin[2]) };
  dropDanglingToolUse(session);
  session.history.push({ role: "user", content: text });
  trimHistory(session);

  try {
    await agentLoop(userId, session, space);
  } finally {
    saveUser(userId, { persona: session.persona, history: session.history });
  }
}

async function agentLoop(userId: string, session: Session, space: Space) {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await claude.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt(session),
      tools,
      messages: session.history,
    });
    session.history.push({ role: "assistant", content: res.content });

    for (const block of res.content) {
      if (block.type !== "text") continue; // skip thinking blocks
      for (const bubble of splitBubbles(block.text)) {
        if (bubble !== "NONE") await space.send(bubble);
      }
    }
    if (res.stop_reason !== "tool_use") return;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      results.push({ type: "tool_result", tool_use_id: block.id, content: await runTool(userId, session, block, space) });
    }
    session.history.push({ role: "user", content: results });
  }
}

async function runTool(userId: string, session: Session, block: Anthropic.ToolUseBlock, space: Space): Promise<string> {
  const input = block.input as Record<string, string | undefined>;
  const persona = PERSONAS.find((p) => p === input.persona);
  console.log(`[tool] ${block.name}`, input);

  switch (block.name) {
    case "set_profile":
      if (!persona) return `Unknown persona. Use one of: ${PERSONAS.join(", ")}.`;
      session.persona = persona;
      return `Saved: ${persona}.`;

    case "scout_route": {
      if (!input.from || !input.to || !persona) return "Missing from, to or persona. Ask the user for it.";
      session.persona = persona;
      scouting.add(userId);
      try {
        const at = input.departTime ? Date.parse(input.departTime) : NaN;
        return await runScoutFlow(space, { from: input.from, to: input.to, persona, at: Number.isFinite(at) ? at : Date.now() }, userId);
      } catch (err) {
        console.error("scout failed:", err);
        await space.send("Something went wrong while I was checking that route 😕 Give me a sec and try again?");
        return "The scout failed. The user was told. Don't retry unless they ask.";
      } finally {
        scouting.delete(userId);
      }
    }

    case "report_issue": {
      const type = REPORT_TYPES.find((t) => t === input.type);
      if (!type || !input.note) return `Need a type (${REPORT_TYPES.join(", ")}) and a note.`;
      const trip = latestTripFor(userId);
      const hint = trip ? endOf(trip.result.routes.find((r) => r.routeId === trip.result.recommendedRouteId)?.polyline) : undefined;
      const location = input.near ? await geocodeNear(input.near, session.lastPin ?? hint) : session.lastPin;
      if (!location) return "Couldn't place it on a map. Ask them to drop a location pin or name a nearby landmark.";
      addReport({ tripId: trip?.id, userId, type, note: input.note, location });
      return `Saved at ${location.lat.toFixed(5)},${location.lng.toFixed(5)}. Future routes through there will show it.`;
    }

    default:
      return `Unknown tool ${block.name}.`;
  }
}

// A turn that crashed mid-tool leaves a tool_use with no tool_result, which the API rejects on
// every later turn. Drop it so the conversation can continue.
function dropDanglingToolUse(session: Session) {
  const last = session.history.at(-1);
  if (last?.role === "assistant" && Array.isArray(last.content) && last.content.some((b) => b.type === "tool_use")) session.history.pop();
}

function endOf(polyline: string | undefined): LatLng | undefined {
  return polyline ? decodePolyline(polyline).at(-1) : undefined;
}

function splitBubbles(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// Drop old turns, but always start on a plain user message so tool_use/tool_result pairs stay intact.
function trimHistory(session: Session) {
  const h = session.history;
  if (h.length <= MAX_HISTORY) return;
  h.splice(0, h.length - MAX_HISTORY);
  while (h.length > 1 && !(h[0]!.role === "user" && typeof h[0]!.content === "string")) h.shift();
}
