# Tandem: an AI route scout you text

**One-liner:** Text Tandem where you're going. It "walks" the route for you first using Street View and AI vision, then texts back the steps, missing curb ramps and steep hills it found, along with a better route. Before you leave, it checks the route again and only texts you if something changed.

- **Theme fit (navigation):** this is navigation, done for people that normal map apps don't serve well.
- **Lead persona:** a wheelchair user. Personas are just a profile field that changes which problems matter. Strollers and late-night solo walkers are slides for later.
- **Interface:** one iMessage thread through Photon. No app.
- **Team:** 3 people, 1 day.

---

## Now: Round 5, the visual layer
Judges see more than a text thread:
1. **A live "mission control" dashboard** on the big screen. The routes draw, Street View photos flick by as Claude checks each one (✅ or a red box), counters tick, the winner turns green.
2. **A flythrough GIF** in iMessage: the walk played as photos, stopping on each problem.

| Who | Builds | Folder | First milestone |
|---|---|---|---|
| Monisha (P1) | Dashboard server (`/events`, `/files`), demo event replay, flythrough + link in iMessage | `messaging/` | `bun run dashboard:demo` streams the demo scout |
| Anshu (P2) | Live `ScoutEvent`s from the scout, `makeFlythrough()` GIF; photo access + Ithaca tuning | `scout/` | Real events from `test:route --events` |
| Salloni (P3) | The dashboard page (map, photo feed, counters, animations) | `dashboard/` | Plays the whole demo replay |

Contract: `ScoutEvent`, `OnScoutEvent` and `MakeFlythrough` in `shared/types.ts`. Each folder's README has the details.
**Order of merges:** (1) server + demo replay → Salloni's page plays it; (2) Anshu's events replace the replay, so the dashboard shows real scouts; (3) the flythrough lands in iMessage.
**On hold:** Round 3 (SQLite, re-check, reports) and the demo script.

---

## 1. Why text (Photon) and not voice or an app

- **Walking a route takes the agent 30–60s.** That's awkward on a call and normal in a text thread. Tandem can send updates while it works ("halfway there, 1 problem so far").
- **Photos and maps.** The proof is visual, like "here's the curb with no ramp."
- **The agent can text first.** It re-checks your route before you leave and messages you only when something changed. This is the other half of the product.
- **Nothing to install.** The judges' line: *"No app. No download. Just a text."*

### What Photon gives you
- **Spectrum** (`spectrum-ts`) is the current SDK. Sign up at app.photon.codes to get a project ID and secret. It supports iMessage through **Spectrum Cloud** (hosted) or a local Mac. It also has a **terminal provider**, so you can test without a phone.
- Photon's older, deprecated **advanced-imessage-kit** documented typing indicators, tapbacks, attachments, scheduled messages and group chats. **Check which of these Spectrum exposes** at docs.photon.codes.
- **imessage-kit** is the self-hosted fallback (macOS only, needs Full Disk Access). It can send and receive text and images but has no tapbacks or typing indicators.
- **If Photon has a booth at the hackathon, ask:** are there hackathon credits for Spectrum Cloud? Can it send image attachments and typing indicators?

---

## 2. The demo (about 2:00), written first

Most of the video is a **screen recording of one iMessage thread**, cut together with the Street View frames the agent looked at and **real footage of the actual spot**.

> **Pick a demo route near the hackathon venue** that has a real problem on it: a curb with no ramp, steps at an entrance, a steep block. Film the real spot, then put it next to the agent's photo. That's more convincing than any city dataset.

**0:00–0:15. Hook**
- Footage of a wheelchair user's view of a curb with no ramp, or steps at a "accessible" entrance.
- Voiceover: *"Google Maps says this is a 6-minute walk. It doesn't say you can't get up this curb."*

**0:15–1:05. Scene 1: The scout (main feature)**
> **You:** heading from [station] to [hotel] tonight ~10pm. I use a wheelchair
> **Tandem:** 👍 *(tapback)* Walking it for you now, give me a minute 🚶
> *(video: quick montage of Street View frames along the route, problems boxed in red)*
> **Tandem:** Halfway there. One problem so far.
> **Tandem:** *[map image: route with 3 numbered pins]*
> **Tandem:** 1️⃣ Steps at the hotel's main entrance *[photo]*
> 2️⃣ No curb ramp at 2nd & Bell *[photo]*
> 3️⃣ That block of Bell is a steep 9% grade
> **Tandem:** This route avoids all three and adds 3 min *[map image]*. Use the side entrance on Bell St, it's level.
- Cut to real footage of the actual curb, matching the agent's photo.

**1:05–1:30. Scene 2: The automatic re-check (why texting matters)**
> **Tandem** *(9:40pm, without being asked):* Re-checked your route before you leave. The elevator at [station] is out of service tonight, so use the Pine St exit instead. Everything else still looks good ✅
- Voiceover: *"Tandem keeps watching your route. It only texts when something changes."*

**1:30–1:50. Scene 3: Arrival, and making the map better**
> **You:** made it!
> **Tandem:** 🎉 Anything I missed on the way?
> **You:** sidewalk torn up outside the Starbucks on 3rd
> **Tandem:** Got it, added. The next person on this route will hear about it.
- This shows the network effect: every trip improves the data for the next person.

**1:50–2:00. Close**
- *"Tandem. It walks the route before you do."* Then roadmap: more personas (stroller, low vision, late-night solo walker), check-ins with a trusted contact, verifying hotel accessibility.

---

## 3. Working backwards: shots → features

| Feature | Scene | Build for real? | Fallback or fake |
|---|---|---|---|
| Photon ⇄ Claude agent loop (text, images, tapback, typing) | all | ✅ **must** | Plain text plus image links if rich features fail |
| Parse "from X to Y, around time T, persona P" | 1 | ✅ must (Claude tool call) | n/a |
| **Route scout pipeline** (route → Street View frames → vision flags) | 1 | ✅ **must, the core** | Pre-cache the demo route's results, but still run it live |
| Grade check (Elevation API) | 1 | ✅ easy win | n/a |
| OSM curb and steps data | 1 | ✅ nice to have | Skip if short on time |
| Compare alternative routes | 1 | ✅ (Routes API `computeAlternativeRoutes: true`, scout each one) | Pre-pick the alternative |
| Map image with numbered pins + route lines | 1 | ✅ must (Google Static Maps) | n/a |
| Problem photo with a box drawn on it | 1 | ✅ | Draw the box by hand for the video if the AI's coordinates are off |
| Progress messages ("halfway…") | 1 | ✅ easy | n/a |
| Scheduled re-check + only text when something changed | 2 | ✅ must | Trigger it by hand during filming |
| Elevator outage data | 2 | ⚠️ real feed if one exists | **Mock it**, and say so if asked |
| User reports a problem → saved for future routes | 3 | ✅ (SQLite row, merged into future scouts) | n/a |
| Check-ins and escalation to a trusted contact | roadmap | ❌ cut | Slide |
| Vetting hotel listings, calling hotels, crime data | roadmap | ❌ cut | Slide |

---

## 4. How the route scout works

1. **Get the route:** Google Routes API (`computeRoutes`), `travelMode: "WALK"`, `computeAlternativeRoutes: true`. Decode each route's encoded polyline.
2. **Sample points:** one every ~15–20m along the route (turf.js `along`). That's about 50–70 points per km.
3. **Fetch photos:**
   - First call the **Street View metadata endpoint** (free) for each point. It gives the `pano_id` and the photo **date**.
   - Skip duplicate panoramas.
   - Then fetch a **Street View Static** image (`640x640`, `fov=90`, `pitch≈-15` to look down at the ground) facing the next point. For curbs, also grab a frame angled toward the sidewalk side.
4. **Have Claude look at the photos:** send 4–6 frames per request, in parallel. Ask for structured JSON per frame:
   `{frame, issue: steps|no_curb_ramp|broken_sidewalk|obstruction|construction|none, severity, confidence, rough_location_in_image}`.
   The prompt changes based on the persona.
5. **Merge:** the same problem seen in neighboring frames counts as one flag. Drop flags below a confidence threshold.
6. **Add data:**
   - **Grade:** Elevation API along the path, flag segments over 5%. ADA guidance treats more than 5% as a ramp and 8.33% as the maximum for a ramp.
   - **OSM via Overpass:** `highway=steps`, `kerb=raised|lowered|flush`, `incline`, `surface`.
   - **Past user reports** saved in our DB.
   - Possibly **Project Sidewalk**, which has crowdsourced curb ramp data in some cities, including Seattle. Check whether it covers the demo city.
7. **Score and pick:** add up severity-weighted flags for each route. Recommend the best one and say how many minutes it adds.
8. **Reply:** one map image, a photo for each serious problem, and a 2–3 bubble summary.

**The re-check** runs about 20 minutes before departure. It re-runs only the cheap checks (transit alerts, new user reports) and compares them to the last result. **If nothing changed, it says nothing.** At most it sends one ✅ "still good" message.

### Limits to state honestly, and how to answer judges
- **Street View is taken from the road and can be years old.** Show the photo date ("photo from Jun 2024") and include the image so the person can judge for themselves.
- **AI vision makes mistakes.** Present results as "flagged, here's the photo," not as certain. Lean toward flagging when unsure: a false alarm costs 30 seconds, while a missed curb can strand someone.
- **No coverage** in alleys, parks and campuses. Say "couldn't check this stretch" rather than pretending.
- **Night conditions** like lighting don't show up in daytime photos. That's a roadmap item (OSM `lit` tags, city streetlight data).

### Cost and speed
- About 60 frames per km. Fewer once duplicate panoramas are skipped. Check the Google Maps Platform free tier per API, and **cache everything** by `pano_id`.
- Target times: first reply (tapback + "walking it") in under 2s, finished result in under 60s for a route around 1km. Run vision requests in parallel.

---

## 5. Architecture

```
iPhone ⇄ iMessage ⇄ Photon Spectrum ⇄ Bun/TS server
                                         ├─ Claude agent (claude-sonnet-5-5, tool use)
                                         │    tools: scout_route, recheck_route, report_issue, set_profile
                                         ├─ scout pipeline: Routes API → sample → SV metadata/static
                                         │                  → Claude vision (parallel) → merge → score
                                         ├─ data: Elevation API, OSM Overpass, transit alerts (or mock)
                                         ├─ renderer: Google Static Maps + boxes drawn on photos (sharp/canvas)
                                         ├─ scheduler: re-check jobs (persisted)
                                         └─ SQLite: users/profiles, trips, flags, user_reports, image cache
```
- The **scout pipeline is a plain function** (`scoutRoute(from, to, persona) → flags + routes`). Person 2 can build and test it from a script without Photon or the agent.
- Use Spectrum's terminal provider so the agent can be tested without a phone.

---

## 6. One-day plan: 1-hour sprints, then merge

Each round is **45 min building and testing alone in your own folder, then 15 min merging together**. Then repeat. Two things let the three of you work separately and still merge cleanly:

1. **Shared types, agreed in Round 0.** Everyone codes against the same function signatures, so a merge is mostly plugging pieces together.
2. **Fixtures.** A hand-written fake `ScoutResult` lets Person 1 and Person 3 build and test before Person 2's real pipeline exists.

### Repo layout
```
tandem/
├─ shared/types.ts           # the contract. Change it only with all 3 agreeing
├─ fixtures/demo-scout.json  # fake ScoutResult for the demo route (hand-written in Round 0)
├─ fixtures/demo-frames/     # saved Street View frames (Person 2 adds these in Round 1)
├─ messaging/   (Person 1)   # Photon, Claude agent, scheduler, SQLite
├─ scout/       (Person 2)   # route → Street View → vision → flags → scoring
├─ visuals/     (Person 3)   # map images, boxes on photos, elevation, alerts, message wording
└─ smoke.ts                  # the combined test run at every merge
```
**Rules:**
- Only edit your own folder.
- Every module has a test script you can run on its own (`bun run test:scout`, etc.) that produces output you can see.
- Share `.env` with each other directly, never commit it.

### The contract (`shared/types.ts`)
```ts
export type LatLng = { lat: number; lng: number };
export type Persona = "wheelchair" | "stroller" | "night_solo";

export type Flag = {
  id: string;
  type: "steps" | "no_curb_ramp" | "steep_grade" | "broken_sidewalk"
      | "obstruction" | "construction" | "transit_outage";
  severity: 1 | 2 | 3;
  confidence: number;                 // 0–1
  location: LatLng;
  source: "vision" | "elevation" | "osm" | "user" | "alert";
  imagePath?: string;                 // Street View frame on disk
  box?: { x: number; y: number; w: number; h: number }; // 0–1, rough
  photoDate?: string;                 // "2024-06"
  note?: string;                      // "No curb ramp at 2nd & Bell"
};

export type RouteResult = {
  routeId: string; polyline: string; durationMin: number;
  flags: Flag[]; score: number;       // lower is better
};

export type ScoutResult = {
  from: string; to: string; persona: Persona;
  routes: RouteResult[]; recommendedRouteId: string;
};

// scout/   (Person 2)
export type ScoutRoute = (from: string, to: string, persona: Persona,
  onProgress?: (pct: number, flagsSoFar: Flag[]) => void) => Promise<ScoutResult>;
// visuals/ (Person 3)
export type RenderRouteMap = (r: ScoutResult) => Promise<string>;   // png path
export type AnnotatePhoto  = (f: Flag) => Promise<string>;          // png path
export type GradeFlags     = (polyline: string) => Promise<Flag[]>;
export type GetAlerts      = (polyline: string) => Promise<Flag[]>; // mocked
```

---

### Round 0: setup (30 min, all together)
- [ ] Repo, Bun, folders, `shared/types.ts` written as above.
- [ ] API keys working:
  - Anthropic
  - Photon (app.photon.codes)
  - Google Maps Platform, with **Routes API, Street View Static, Elevation and Maps Static** all enabled
- [ ] Pick the demo route (start, end, and the 2–3 real problems on it), and write down where each problem is.
- [ ] Write `fixtures/demo-scout.json` by hand using that route and problems. A rough version is fine.

### Round 1: each piece works on its own
| | Build | Test: done when… |
|---|---|---|
| **P1 Photon** | Echo bot through Spectrum. Send an image, a tapback, a typing indicator | Text the bot from a phone and get back text **and an image**. Write down the reply time and which features worked |
| **P2 Street View** | `getRoutes()` → sample points → metadata (`pano_id`, date) → save images to `fixtures/demo-frames/` | `bun run test:scout` saves the frames. **Flip through them**: do they show the sidewalk along the route? Are duplicates skipped? |
| **P3 Visuals** | `renderRouteMap(fixture)`: route line + numbered pins (Google Static Maps) | Running it on the fixture gives a PNG you'd be happy to put in the video |
| **Merge 1** | The bot replies to any text with P3's map image from the fixture | 📱 **First iMessage with a map image** |

### Round 2: the real logic, behind fake inputs
| | Build | Test: done when… |
|---|---|---|
| **P1 Agent** | Claude agent with a `scout_route` tool that **returns the fixture after 5s**, plus progress messages | 5 differently worded requests ("going from X to Y at 10pm, I use a wheelchair", "X → Y stroller", …) all pull out the right from/to/persona. The "walking it…" and "halfway" messages arrive in the right order |
| **P2 Vision** | `classifyFrames()`: Claude vision on batches of 5 frames → `Flag[]` | Run on the demo frames and compare to the real problems written down in Round 0: **it catches all 2–3**, and print how many false flags it gives |
| **P3 Photos + grade** | `annotatePhoto(flag)` draws a box; `gradeFlags(polyline)` uses the Elevation API | The boxed photos look right. The known steep block gets flagged, and flat blocks don't |
| **Merge 2** | Swap the fake tool for P2's real `scoutRoute` plus P3's grade flags and photos | 📱 **Scene 1 works live end to end** (slow is fine) |

### Round 3: alternatives, re-check, reports
| | Build | Test: done when… |
|---|---|---|
| **P1 Re-check** | Scheduler + compare-to-last-result logic. `report_issue` → SQLite | A re-check scheduled 1 min out with **no change** sends nothing (or one ✅). With a fake alert added, it **sends** the right message. A reported problem shows up in the DB |
| **P2 Routes** | `alternatives=true`, scoring, merging repeat flags, cache by `pano_id`, `p-limit` | The recommended route avoids the known problems. First run < 60s, **second run < 5s** (cached) |
| **P3 Data + wording** | `getAlerts()` mock, user reports read back as flags, final message wording | The mock alert shows up as a flag. Message wording reviewed against the demo script |
| **Merge 3** | Everything connected | 📱 **Scenes 1–3 all work.** Person 3 starts filming the first take |

### Round 4+: harden and film
- **Swap and break it:** each person spends 15 min trying to break someone else's part with weird requests, a route with no Street View, or someone texting mid-scout. Fix what breaks.
- P2 runs a **second route** to prove it isn't hard-coded.
- P3 finishes the video and slides. Record a **backup screen recording** of the full demo in case the live one fails.

### The 15-min merge, every round
1. (3 min) Each person shows their test output. If it isn't "done", that piece **stays on the fixture** this round. Don't merge something broken.
2. (5 min) Merge branches into `main` one at a time. Changes are in separate folders, so conflicts should only happen in `shared/types.ts`.
3. (5 min) Run `bun run smoke`: the demo route through the terminal provider, then once on a real phone.
4. (2 min) Agree on next round's goals. If the contract changed, update the fixture now.

**If you fall behind:** cut Round 3's alternative routes first (pre-pick the alternative instead), then the re-check (trigger it by hand while filming). Never cut Merge 2: Scene 1 working live is the demo.

---

## 7. Decisions to make now

1. **Demo route:** which route near the venue, and does it have 2–3 real problems? (Person 3, first hour.)
2. **Spectrum Cloud or a local Mac:** Cloud if there are credits. A local Mac needs a **dedicated Apple ID** and a Mac that stays awake on stable wifi.
3. **Lead persona:** wheelchair user (recommended, since it's the clearest visual proof).

---

## 8. Questions judges will probably ask

- *"Isn't Street View outdated?"* We show the photo date, users add fresh reports, and the re-check uses live data.
- *"What if the AI is wrong?"* Every flag comes with its photo. We lean toward flagging, and we say when a stretch couldn't be checked.
- *"Why not just use Google Maps' wheelchair routing?"* It covers transit stations, not curbs, steps or slopes on the walk itself.
- *"Why text and not an app?"* No install, the agent can text you first, and photos are the proof.
- *"Privacy?"* We store only the trip's start and end points, deleted after the trip. User reports are anonymous.
