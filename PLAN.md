# Tandem: an AI route scout you text

**One-liner:** Text Tandem where you're going. It "walks" the route for you first using Street View and AI vision, then texts back the steps, missing curb ramps and steep hills it found, along with a better route. Before you leave, it checks the route again and only texts you if something changed.

- **Theme fit (navigation):** this is navigation, done for people that normal map apps don't serve well.
- **Lead persona:** a wheelchair user. Personas are just a profile field that changes which problems matter. Strollers and late-night solo walkers are slides for later.
- **Interface:** one iMessage thread through Photon. No app.
- **Team:** 3 people, 1 day.

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
| Compare alternative routes | 1 | ✅ (Directions `alternatives=true`, scout each one) | Pre-pick the alternative |
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

1. **Get the route:** Google Directions API, `mode=walking`, `alternatives=true`. Decode each route's polyline.
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
                                         ├─ Claude agent (claude-sonnet-5, tool use)
                                         │    tools: scout_route, recheck_route, report_issue, set_profile
                                         ├─ scout pipeline: Directions → sample → SV metadata/static
                                         │                  → Claude vision (parallel) → merge → score
                                         ├─ data: Elevation API, OSM Overpass, transit alerts (or mock)
                                         ├─ renderer: Google Static Maps + boxes drawn on photos (sharp/canvas)
                                         ├─ scheduler: re-check jobs (persisted)
                                         └─ SQLite: users/profiles, trips, flags, user_reports, image cache
```
- The **scout pipeline is a plain function** (`scoutRoute(from, to, persona) → flags + routes`). Person 2 can build and test it from a script without Photon or the agent.
- Use Spectrum's terminal provider so the agent can be tested without a phone.

---

## 6. One-day plan for 3 people

| | Person 1: Messaging + agent | Person 2: Scout pipeline | Person 3: Visuals + story |
|---|---|---|---|
| **Hours 0–2** | Photon hello world: text in, Claude reply out. Test sending an image, tapbacks, typing indicator | Directions → sample points → Street View metadata + images saved to disk | Pick and **walk the demo route** near the venue, photograph the real problems. Draft the video script |
| **Hours 2–6** | Agent tools + parsing "from/to/time/persona". Progress messages | Claude vision on the frames → JSON flags → merge. Tune the prompt on the demo route | Map image renderer (route + numbered pins) and boxes drawn on photos |
| **Hours 6–10** | Connect `scout_route` end to end. Send map + photos in iMessage | Elevation grades, alternative routes + scoring, OSM if time allows | Film the real street footage. Build slides |
| **Hours 10–14** | Scheduler + re-check that only texts on changes. `report_issue` → DB | Cache, speed (parallel requests), confidence threshold. Mock transit alert | **First full demo take.** Edit |
| **Hours 14+** | Polish the texts (short bubbles, emoji), fix bugs | Run a second route to show it works anywhere | Final video, pitch rehearsal, recorded backup for the live demo |

**Checkpoints:**
- **Hour 2:** Photon works. If not, switch to imessage-kit on a local Mac right away.
- **Hour 6:** one real flagged photo shows up in iMessage.
- **Hour 10:** Scene 1 works end to end.
- **Hour 14:** full video filmed once.

If the hackathon is shorter than 24h, compress the later blocks. Never cut the hour-2 and hour-6 checkpoints.

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
