// Tandem's iMessage bot. Run: bun run bot   (terminal-only if Photon keys are missing)
// The Round 1 feature tests live in photon-test.ts.
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { runAgent, scouting } from "./agent";

const hasPhoton = !!(process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PROJECT_SECRET);

const photonApp = hasPhoton
  ? await Spectrum({
      projectId: process.env.PHOTON_PROJECT_ID!,
      projectSecret: process.env.PHOTON_PROJECT_SECRET!,
      providers: [imessage.config(), terminal.config()],
    })
  : null;
const app = photonApp ?? (await Spectrum({ providers: [terminal.config()] }));

console.log(`Tandem up (${hasPhoton ? "iMessage + terminal" : "terminal only, no Photon keys"})`);

// One job at a time per user, in arrival order. Different users run in parallel.
const queues = new Map<string, Promise<void>>();

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound" || message.content.type !== "text") continue;

  const userId = message.sender?.id ?? "unknown";
  const text = toAgentText(message.content.text);
  console.log(`[${message.platform}] ${userId}: ${text}`);

  // Acknowledge right away, before any slow work.
  message.react("👍").catch((err) => console.error("react failed:", err));

  if (scouting.has(userId)) {
    space.send("Still walking it, almost done 🚶").catch((err) => console.error("send failed:", err));
  }

  const job = async () => {
    const started = Date.now();
    try {
      await space.responding(() => runAgent(userId, text, space));
    } catch (err) {
      console.error("agent failed:", err);
      await space.send("Sorry, something broke on my end 😕 Try that again?").catch(() => {});
    }
    console.log(`[done] ${userId} in ${Date.now() - started}ms`);
  };
  // Don't await: a 60s scout must not block other users.
  const next = (queues.get(userId) ?? Promise.resolve()).then(job);
  queues.set(userId, next);
}

// Dropped pins arrive as an Apple Maps link. Turn them into something the agent can use.
function toAgentText(text: string) {
  const pin = text.match(/maps\.apple\.com\/\S*coordinate=(-?[\d.]+),(-?[\d.]+)/);
  return pin ? text.replace(/https?:\/\/maps\.apple\.com\/\S+/, `[shared location: ${pin[1]},${pin[2]}]`) : text;
}
