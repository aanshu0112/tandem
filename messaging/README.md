# Person 1: Messaging + agent (`messaging/`)

You own **everything the user touches**: the iMessage thread through Photon, the Claude agent that understands requests and calls tools, the scheduler that re-checks routes before departure, and the SQLite database.

You **call** Person 2's `scoutRoute()` and Person 3's `renderRouteMap()`, `annotatePhoto()` and `getAlerts()`. Until those exist, use `fixtures/demo-scout.json` and fake functions in their place. See [`shared/types.ts`](../shared/types.ts).

Full context: [PLAN.md](../PLAN.md), sections 2 (demo script) and 6 (rounds).

---

## Your rounds

### Round 1: Photon echo bot
- [ ] Sign up at app.photon.codes and get `PHOTON_PROJECT_ID` / `PHOTON_PROJECT_SECRET`
- [ ] `bun add spectrum-ts`, then get the minimal loop (below) replying to a real phone
- [ ] Test each rich feature and **write down what works** (others are counting on it):
  - [ ] send an **image file** (the most important; the whole demo depends on it)
  - [ ] typing indicator
  - [ ] tapback / reaction on the user's message
  - [ ] sending a second message a few seconds later (needed for "halfway there…")
  - [ ] sending **without being asked first** (needed for the re-check in Scene 2)
  - [ ] receiving a dropped location pin: what does the message/attachment look like?
- [ ] Measure the time from text sent to reply arriving

**Done when:** you text the bot from a phone and get back text **and an image**.
**Merge 1:** reply to any text with the PNG from Person 3's `renderRouteMap(fixture)`.

### Round 2: Claude agent + fake scout
- [ ] **Don't `await` the slow handler inside the `for await` loop.** A 60s scout would block every other message. Start `handle(space, message)` without awaiting it, and allow one job at a time per user
- [ ] Claude agent loop with tool use. Tools: `scout_route(from, to, persona, departTime?)`, `set_profile(persona)`
- [ ] Fake `scout_route`: wait 5s, call `onProgress(50, …)` once, return the fixture
- [ ] Message flow for a scout request:
  1. Tapback 👍 plus "Walking it for you now, give me a minute 🚶"
  2. "Halfway there. One problem so far." (from `onProgress`)
  3. Map image (`renderRouteMap`)
  4. One bubble per severe flag: emoji number, `note`, boxed photo from `annotatePhoto`
  5. "This route avoids all three and adds 3 min" + map of the recommended route
- [ ] Remember the persona per phone number so it isn't asked every time

**Done when:** 5 differently worded requests all pull out the right from/to/persona, for example:
- "going from Westlake station to the Ace Hotel tonight around 10, I use a wheelchair"
- "westlake → ace hotel, pushing a stroller"
- "can you check my walk to the Ace from Westlake?" (should ask for the persona if it isn't saved yet)
- a typo-filled version
- one that's missing the destination (should ask for it)

**Merge 2:** swap the fake for the real `scoutRoute`. 📱 Scene 1 works live.

### Round 3: Re-check + reports
- [ ] SQLite (`bun:sqlite` is built in). Tables: `users(phone, persona)`, `trips(id, phone, from, to, departAt, lastResult JSON)`, `reports(id, lat, lng, type, note, createdAt)`
- [ ] When a trip has a `departTime`, schedule a re-check for 20 minutes before (use `RECHECK_DELAY_SEC` from `.env` to shorten it for the demo)
- [ ] Re-check: call `getAlerts()` and look up new `reports` near the route, then compare with `lastResult`. **Only text if something changed.** Otherwise send nothing, or at most one "still good ✅"
- [ ] "made it!" → "🎉 Anything I missed on the way?" → their reply → `report_issue` tool → `reports` row
- [ ] Save scheduled jobs in SQLite so a restart doesn't lose them

**Done when:** a re-check with no changes sends nothing (or one ✅); a re-check with a fake alert added sends the right message; a reported problem lands in the DB.
**Merge 3:** Scenes 1–3 all work.

### Round 4+
- Tighten the wording: short bubbles, no paragraphs, matching the demo script exactly.
- Try to break it: text in the middle of a scout, send a sticker, send two requests quickly.

---

## Starting code

Checked against Photon's Spectrum docs (`spectrum-ts` 12.x). Install with `bun add spectrum-ts @anthropic-ai/sdk`.

```ts
import { Spectrum, attachment } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config(), terminal.config()],
});

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound") continue;   // skip our own echoed sends
  if (message.content.type !== "text") continue;
  await message.react("👍");                          // tapback
  await space.responding(async () => {               // typing indicator while this runs
    await space.send("Walking it for you now 🚶");
    await space.send(attachment("out/map.png"));     // path, URL or Buffer
  });
}
```

Texting someone first, with no incoming message (needed for the Scene 2 re-check):
```ts
const im = imessage(app);
const space = await im.space.create(await im.user("+15551234567"));
await space.send("Re-checked your route…");
```

Useful details:
- `message.sender?.id` is the user's ID (their phone number or email). Use it as the key for profiles and history.
- `message.content.type` can be `"text"`, `"attachment"` (`name`, `mimeType`, `read()`), `"reaction"` and others.
- To bundle several photos into one album: `group(attachment(a), attachment(b))`.
- Fallback if the cloud provider doesn't work: `@spectrum-ts/imessage-local` on a Mac. Only the provider line changes. No tapbacks, no typing indicator, no group chats.

Agent system prompt, as a starting point:
> You are Tandem, a route scout people text before walking somewhere. You text like a helpful friend: short messages, 1–2 sentences each, a little emoji, never paragraphs. When someone tells you where they're going, call `scout_route`. If you don't know their persona (wheelchair, stroller, night_solo), ask once and save it with `set_profile`. Never claim a route is "safe" or "accessible" for certain. Say what you found and show the photo.

Model: `claude-sonnet-5-5` with tool use.

---

## Resources
- Photon dashboard: https://app.photon.codes
- Photon docs: https://docs.photon.codes
- Spectrum SDK: https://github.com/photon-hq/spectrum-ts
- **Photon agent skills** (load these into Claude Code to get help with the SDK): https://github.com/photon-hq/skills
- Fallback, self-hosted on a Mac (send/receive/images, no tapbacks or typing): https://photon.codes/docs/opensource/imessage-kit
- Claude tool use: https://docs.claude.com/en/docs/build-with-claude/tool-use/overview
- Bun SQLite: https://bun.sh/docs/api/sqlite

## Watch out for
- **If Photon isn't working by the end of Round 1**, switch to `imessage-kit` on a local Mac right away. Use a **dedicated Apple ID**, not anyone's personal one.
- **On the Free/Pro plan, register each team phone number as a project user in the Photon dashboard.** Otherwise texting someone first fails with `Target not allowed for this project`. There's also a limit of 50 new conversations per line per day.
- If Photon has a booth, ask about hackathon credits.
- A brand-new Apple ID that sends lots of messages can get flagged. Only text your own team's phones.
- A location pin probably arrives as a `.loc.vcf` attachment containing an Apple Maps URL with `ll=lat,lng`. Check this. If it's painful, have people type addresses instead; the demo uses typed place names anyway.
- Show the tapback or typing indicator **within 1–2s**. The scout takes 30–60s, and the progress messages make that wait feel fine.
