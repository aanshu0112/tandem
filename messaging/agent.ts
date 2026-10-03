// The Claude agent: understands what the user wants, asks for anything missing, and calls tools.
import Anthropic from "@anthropic-ai/sdk";
import type { Space } from "spectrum-ts";
import type { Persona } from "../shared/types";
import { runScoutFlow } from "./scout-flow";

const claude = new Anthropic();
const MODEL = "claude-sonnet-5-5";
const PERSONAS: Persona[] = ["wheelchair", "stroller", "night_solo"];
const MAX_HISTORY = 40;
const MAX_TOOL_ROUNDS = 5;

type Session = { persona?: Persona; history: Anthropic.MessageParam[] };
// Round 3: move to SQLite.
const sessions = new Map<string, Session>();
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
        from: { type: "string", description: "Start: a place name/address as the user said it, or 'lat,lng' from a shared location" },
        to: { type: "string", description: "Destination: a place name or address" },
        persona: { type: "string", enum: PERSONAS },
        departTime: { type: "string", description: "When they're leaving, ISO 8601, if they said" },
      },
      required: ["from", "to", "persona"],
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
- Personas: wheelchair, stroller, night_solo (walking alone at night). When someone tells you which fits, call set_profile.
- A message like "[shared location: 42.44,-76.48]" means they dropped a pin. Use "42.44,-76.48" as their start unless they say otherwise.
- After scout_route, the user already has the map, photos and recommendation. Never summarize them. Reply NONE, or one short new sentence.
- Never say a route is definitely "safe" or "accessible". Say what you found and that the photos can be out of date.
- If someone is in danger, tell them to call 911.

${session.persona ? `This person's saved persona: ${session.persona}.` : "You don't know this person's persona yet."}
Current time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}.`;
}

export async function runAgent(userId: string, text: string, space: Space) {
  const session = sessions.get(userId) ?? { history: [] };
  sessions.set(userId, session);
  session.history.push({ role: "user", content: text });
  trimHistory(session);

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
        return await runScoutFlow(space, { from: input.from, to: input.to, persona });
      } catch (err) {
        console.error("scout failed:", err);
        await space.send("Something went wrong while I was checking that route 😕 Give me a sec and try again?");
        return "The scout failed. The user was told. Don't retry unless they ask.";
      } finally {
        scouting.delete(userId);
      }
    }

    default:
      return `Unknown tool ${block.name}.`;
  }
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
