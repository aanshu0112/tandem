# Tandem: text-first travel safety agent (Photon + iMessage)

Working name "Tandem": the travel buddy that rides along with you. Scope: **Seattle**, three jobs (vet, verify, watch my back), all done in **one iMessage thread**.

---

## 1. What changes when it's text instead of voice

| Original (voice) | Text-first version | Effect |
|---|---|---|
| Agent calls *you* for check-ins | Agent texts you; you reply or go quiet | Simpler, and it works in places where you can't talk |
| Say a codeword on a call | **Text a harmless-looking codeword** ("did you feed the cat?"). The agent replies normally and alerts your friend in the background | Stronger: works with someone looking over your shoulder |
| "Fake call" escape | A **fake incoming text** ("Mom: are you close? call me now"), or a real Twilio call as a stretch goal | Covers most of it |
| Agent calls the hotel to verify | **Decide now** (see section 6). The user only ever texts, but the agent's channel to the hotel can still be a call, an email or a WhatsApp message | This was your "wow" moment, so replace it on purpose |
| Talking to a trusted contact | Agent **creates a group chat** with you and your friend, then posts location, map and plan | Very visual, so it works well on video |

Text also gives you things voice can't: **images** (map cards, Street View photos), **link previews**, **tapbacks**, **typing indicators**, **polls**, and a thread you can scroll back through later.

### What Photon actually gives you
- **Spectrum** (`spectrum-ts`) is the current, recommended SDK. Sign up at app.photon.codes to get a project ID and secret. It supports iMessage through Spectrum Cloud (hosted) or a local Mac. It's multi-channel: iMessage, WhatsApp, SMS through WhatsApp Business, Slack, Telegram, and a terminal provider for testing without a phone.
- **advanced-imessage-kit** (now deprecated in favor of Spectrum) documented features we want: typing indicators, tapbacks, effects, polls, **group chat creation**, scheduled messages, attachments, and **Find My location sharing with live location events**. Before building on any of these, check which ones Spectrum exposes at docs.photon.codes.
- **imessage-kit** is the self-hosted fallback: macOS only, needs Full Disk Access. Supports send, receive, attachments and scheduling. No tapbacks, typing indicators or edits.
- **Ask the Photon sponsor booth** (if they're there): do they give hackathon credits for Spectrum Cloud, and is Find My location supported in Spectrum?

---

## 2. Demo video (about 2:30), written first

Each shot lists the features it needs. Film it as a **split screen: the user's phone on the left, the friend's phone or the real-world street on the right.** Use cuts to skip waiting time, but leave the real timestamps visible.

**0:00–0:15. Hook (your Seattle hostel story)**
- Listing photos vs. the real block at 11pm. Voiceover: *"The listing said 'great location.' It didn't say what that location is like at 11pm."*

**0:15–0:55. Job 1: Vet before you book**
- The user texts Tandem a Hostelworld or Booking link: *"Landing 10:40pm Friday, solo. Is this ok?"*
- Typing indicator → three short bubbles, like a friend would send:
  1. *"Honest take: the room's fine, but getting there at 11pm isn't great 😬"*
  2. **Map card image**: the walk from the light rail stop, with a lit/unlit route, places open at 11pm marked, and late-night incident density shown as a heat layer
  3. *"Why: 9-min walk, 2 blocks with no streetlights, nothing open after 10, front desk closes at 10 (3 reviews mention it). Better pick: [link preview], same price, 2 min from the station, 24h desk."*
- **Fast persona switch (10s)**: *"what if I'm in a wheelchair?"* → the agent sends the **Street View photo of the entrance** with the steps circled: *"3 steps at the entrance, no ramp visible. Google lists it as accessible. That's wrong."*
- Needs: link parsing, area-at-time analysis, review mining, a static map renderer, Street View plus vision, an alternative-pick search

**0:55–1:20. Job 2: Verify**
- *"Want me to confirm the 24h desk and step-free entrance with them?"* → the user taps 👍
- Cut → *"✅ Confirmed with front desk at 2:14pm: staffed 24h, side entrance is step-free. Saved for the next traveler."*
- Show a small "Verified by Tandem" counter in the DB/dashboard: *"14 travelers have used this answer."* That's the network-effect beat.
- Needs: an outreach channel (see section 6), a verified-facts DB

**1:20–2:10. Job 3: Watch my back (the climax)**
- Friday night. *"walking back from dinner, ~20 min"*
- *"Got it. I'll check in at 10:25. Want to share your location?"* → the user shares through Find My, or drops a pin
- (Optional reroute beat) *"Heads up: the Westlake elevator is out tonight (mock), and the last 4 blocks aren't lit. A $9 Lyft gets you there in 6 min. Want the link?"*
- **Climax, Option A (missed check-in):** 10:25, *"you good?"* … no reply … 10:30, the agent creates a **group chat with the user and Priya**: *"Hi Priya, I'm Tandem, Alex's travel check-in assistant. Alex missed a 10:25 check-in. Last location 10:21 [map], plan was walking to Green Tortoise Hostel. Can you try calling?"* The friend's phone lights up on the right side of the screen.
- **Climax, Option B (codeword, stronger):** the user texts *"did you feed the cat?"* → the agent replies *"Yep, fed her at 8 🐱"* (cover message) → the friend's phone **at the same moment** gets the alert with a live location. Voiceover: *"Even if someone's watching your screen."*
- Recommendation: **show B, and mention A in voiceover.** B is the more surprising moment.
- Needs: check-in scheduler, location intake, escalation via group chat, codeword detection, cover replies

**2:10–2:30. Close**
- *"No app. No download. Just a text."* Then roadmap: more cities, more personas (parent with a stroller), a shared verified-facts network.

---

## 3. Working backwards: shots → features

| Feature | Shot | Build for real | Fake for the demo |
|---|---|---|---|
| Photon iMessage loop + Claude agent | all | ✅ **must** | n/a |
| Check-in timer + "you good?" | 1:20 | ✅ must | n/a |
| Codeword → silent alert + cover reply | 1:50 | ✅ must | n/a |
| Group chat escalation with trusted contact | 1:50 | ✅ must | Fall back to a 1:1 text to the friend if group creation doesn't work |
| Location intake (pin or Find My) | 1:25 | ✅ pin; Find My is a stretch goal | A typed address is the last-resort fallback |
| Static map card image | 0:30, 1:50 | ✅ (Google Static Maps / Mapbox) | Annotations can be simpler than the shot |
| Area-at-time analysis (SPD crime by hour, OSM `lit`, Places hours) | 0:30 | ✅ for 2–3 pre-chosen listings | Pre-cache the data for those listings |
| Review mining | 0:30 | ✅ Claude over the reviews we can get | Hand-paste reviews for the demo listings (the Places API returns only ~5) |
| Street View entrance + vision | 0:45 | ✅ | Pick an entrance that clearly has steps |
| Link parsing (Booking / Hostelworld) | 0:15 | ⚠️ scraping is fragile | Map the demo URLs to pre-scraped data |
| "Better pick" alternative | 0:35 | ⚠️ | Pre-pick it, and have the agent explain why it chose it |
| Hotel verification | 0:55 | Depends on the section 6 decision | The reply can arrive "later" through a cut |
| Elevator outage reroute | 1:30 | ❌ | Mock data, and say so if asked |
| Ride link | 1:30 | Deep link to the Lyft/Uber app with the destination filled in | n/a |
| Persona profiles | 0:45 | ✅ just a field on the user that changes the prompt and scoring | n/a |

---

## 4. Details and considerations to settle

**Onboarding (by text, no app)**
- First message: *"Hey! I'm Tandem. Who should I contact if something's off?"* → they share a contact card → the agent texts that friend for consent (*"Alex added you as a trusted contact. Reply YES to accept."*). **Consent matters**, and judges may ask about it.
- Ask for their persona and their codeword in the same conversation. The codeword should be phrased so it reads naturally in any chat.

**Location**
- A dropped pin in iMessage most likely arrives as a `.loc.vcf` attachment containing an Apple Maps URL that you parse for lat/lng. **Test this in hour 1.**
- Find My live sharing needs an Apple ID on the server account. It's powerful but risky, so it's a stretch goal.
- Location needs to update during a walk. With pins only, the "last location" is wherever they last pinned, so say so honestly in the escalation message.

**Check-in logic**
- States: `active → due → nudged → escalated → resolved`. Persist them (SQLite is enough) so a server restart doesn't lose a check-in.
- Escalation ladder: at ETA, nudge → 5 min grace → second nudge → escalate. Shorten the timings for the demo with an env var.
- "I'm safe" detection: any reply counts, a 👍 tapback counts, "home" counts. **False alarms are worse than late alarms** for user trust, but for safety lean toward escalating. Say that tradeoff out loud in the pitch.
- Never pose as emergency services. When the situation calls for it, the escalation message to the friend should suggest calling 911.

**Codeword**
- Match it exactly or fuzzily against the user's own phrase. Don't rely on Claude alone to classify it, since it has to be fast and deterministic. Run the match **before** calling the LLM.
- The cover reply has to look natural, so pre-write it at onboarding time, or have Claude generate it from the codeword.

**Feeling like a texting buddy**
- Split replies into 2–3 short bubbles, show typing indicators, and use tapbacks to acknowledge messages (👍 on "walking back"). Don't send long paragraphs.
- Latency: show typing within about 1 second, run tool calls in parallel, and pre-cache the Seattle data. A target is under 8 seconds to the first useful bubble.

**Safety scoring framing** (from init.md; keep it)
- Show the factors (lighting, what's open, desk hours, the types and times of incidents), not "bad neighborhood." Filter SPD data to the **hour window you'll be there** and to incident types relevant to someone walking. Expect the "isn't crime data biased?" question, and answer it by pointing to the factor breakdown.

**Privacy**
- Delete location history 24 hours after a check-in resolves. Only the trusted contact sees location, and only on escalation. Put this on one slide.

---

## 5. Architecture (small on purpose)

```
iPhone ⇄ iMessage ⇄ Photon Spectrum ⇄ Bun/TS server
                                         ├─ router: codeword check (deterministic) → else Claude agent
                                         ├─ Claude (claude-sonnet-5, tool use, vision for Street View)
                                         │    tools: vet_listing, area_at_time, entrance_check,
                                         │           find_alternative, start_checkin, resolve_checkin,
                                         │           escalate, request_verification, render_map
                                         ├─ scheduler (check-in timers, persisted)
                                         ├─ SQLite: users, personas, contacts, checkins, verified_facts, cache
                                         └─ data: SPD Socrata API, OSM Overpass, Google Places/Street View/Static Maps
```
- Use Spectrum's **terminal provider** so people working on backend/AI can test without a phone.
- Optional: a tiny web dashboard of `verified_facts` for the network-effect shot.

---

## 6. Decisions the team needs to make now

1. **How do we verify with the hotel without voice?** Options:
   - **(a) Keep an outbound AI call to the hotel** (Vapi/Retell). The user still only texts; the call happens behind the scenes. This is still the strongest wow moment, and a teammate can play the front desk live. *Recommended if anyone has spare time.*
   - (b) The agent emails or WhatsApps the hotel and parses the reply. Fully text-based, but slow and less impressive; it needs a cut in the video.
   - (c) Ask past guests through reviews and Q&A only. Weakest.
2. **Which persona leads the demo?** The solo traveler arriving late fits your Seattle story best. Accessibility gets the 10-second Street View beat.
3. **Spectrum Cloud or a local Mac?** Cloud is faster to set up if there are credits. A local Mac needs a **dedicated Apple ID** (not someone's personal one) and a Mac that stays awake on reliable wifi.

---

## 7. Build order (riskiest first)

1. **Hour 0–2: Photon end to end.** Text in, Claude reply out, plus a test of sending an image, receiving a pin, typing indicators and creating a group chat. *If this doesn't work, nothing else matters.*
2. **Watch my back.** Check-in, nudge, escalation group chat, codeword with cover reply. Needs the least external data, and it's the climax.
3. **Map card renderer.** Used in two shots.
4. **Vet.** Get the area-at-time analysis and the Street View check working for the 2–3 demo listings, then make it general if there's time.
5. **Verify** (depends on the section 6 decision) and the verified-facts DB.
6. **Film early.** Record a full take as soon as steps 1–3 work, then re-film as features improve. Keep a recorded backup for the live demo.

**Split (adjust to team size):** one person on Photon and infra, one on the agent, prompts and tools, one on data (SPD/OSM/Places, the map renderer), and one on the video, pitch and the hotel-call side quest.
