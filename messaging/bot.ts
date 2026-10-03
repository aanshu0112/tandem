// Round 1 test harness: checks every Photon feature the demo needs.
// Run: bun run bot   (terminal-only if Photon keys are missing)
// Text the line one of: "img", "multi", "react", "later", or a location pin. Anything else gets an echo.
import { Spectrum, attachment } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const hasPhoton = !!(process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PROJECT_SECRET);

const photonApp = hasPhoton
  ? await Spectrum({
      projectId: process.env.PHOTON_PROJECT_ID!,
      projectSecret: process.env.PHOTON_PROJECT_SECRET!,
      providers: [imessage.config(), terminal.config()],
    })
  : null;
const app = photonApp ?? (await Spectrum({ providers: [terminal.config()] }));

console.log(`Tandem bot up (${hasPhoton ? "iMessage + terminal" : "terminal only, no Photon keys"})`);

const TEST_IMAGE = (await Bun.file("out/map.png").exists())
  ? "out/map.png"
  : new URL("https://maps.googleapis.com/maps/api/staticmap?center=Seattle&zoom=14&size=640x640&key=" + (process.env.GOOGLE_MAPS_API_KEY ?? ""));

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound") continue;

  const started = Date.now();
  console.log(`[${message.platform}] from=${message.sender?.id} type=${message.content.type}`, message.content);

  // Don't block the loop: each message is handled on its own.
  handle().catch((err) => console.error("handler failed:", err));

  async function handle() {
    if (message.content.type === "attachment") {
      // Location pins probably land here (a .vcf with an Apple Maps link). Log it so we know the shape.
      const body = Buffer.from(await message.content.read()).toString("utf8");
      console.log(`attachment name=${message.content.name} mime=${message.content.mimeType}\n${body.slice(0, 500)}`);
      await space.send(`Got attachment: ${message.content.name} (${message.content.mimeType})`);
      return;
    }
    if (message.content.type !== "text") return;

    const cmd = message.content.text.trim().toLowerCase();
    switch (cmd) {
      case "img":
        await space.responding(async () => {
          await space.send(attachment(TEST_IMAGE as string));
        });
        break;
      case "multi":
        await message.react("👍");
        await space.send("Walking it for you now, give me a minute 🚶");
        await Bun.sleep(3000);
        await space.send("Halfway there. One problem so far.");
        await Bun.sleep(3000);
        await space.send("Done ✅");
        break;
      case "react":
        await message.react("❤️");
        break;
      case "later": {
        // Texting first: open a fresh space to this user and send without an inbound message.
        await space.send("OK, I'll text you first in 10s.");
        await Bun.sleep(10_000);
        if (photonApp && message.platform === "imessage" && message.sender) {
          const im = imessage(photonApp);
          const dm = await im.space.create(await im.user(message.sender.id));
          await dm.send("Re-checked your route before you leave. Everything still looks good ✅");
        } else {
          await space.send("(terminal) proactive send would happen here");
        }
        break;
      }
      default:
        await message.react("👍");
        await space.responding(async () => {
          await message.reply(`echo: ${message.content.type === "text" ? message.content.text : ""}`);
        });
    }
    console.log(`handled "${cmd}" in ${Date.now() - started}ms`);
  }
}
