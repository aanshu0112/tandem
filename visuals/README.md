# Person 3: Visuals, data + the demo (`visuals/`)

You own **what the judges see**:
- the map images and boxed problem photos sent in iMessage
- the small data sources (elevation grades, mock transit alerts)
- the exact wording of the messages
- the **demo route, video and pitch**

You **export** `renderRouteMap()`, `annotatePhoto()`, `gradeFlags()` and `getAlerts()` with the signatures in [`shared/types.ts`](../shared/types.ts). Build and test everything against `fixtures/demo-scout.json` until Person 2's real output exists.

Full context: [PLAN.md](../PLAN.md), section 2 (demo script) and section 8 (judge Q&A).

---

## Your rounds

### Round 0 (with everyone): the demo route
- [ ] Pick a walking route **near the venue**, 5–10 min long, with **2–3 real problems**: a curb with no ramp, steps at an entrance, a steep block, broken sidewalk
- [ ] **Walk it.** Photograph each problem and write down its exact location (drop a pin, copy the lat/lng)
- [ ] Check that Street View covers those spots (open Google Maps, drag Pegman there). If the problem isn't visible in Street View, pick a different one
- [ ] Update `fixtures/demo-scout.json` with the real start/end, polylines (or leave them for Person 2) and flags

### Round 1: Map renderer
- [ ] `renderRouteMap(result) → png path`, using the **Google Maps Static API**:
  - the route as a path: `path=color:0xE5484Dff|weight:6|enc:<polyline>`
  - the recommended route in a second color (green)
  - numbered pins for flags: `markers=color:red|label:1|lat,lng` (labels are a single character, 0–9 / A–Z)
  - `size=640x640&scale=2` for a sharp image on phones
- [ ] Optional: a cleaner style with the `style=` params, or a Mapbox Static Images version if Google looks too plain
- [ ] `bun run test:visuals` writes `out/map.png` from the fixture

**Done when:** you'd be happy to put the PNG in the video.
**Merge 1:** Person 1 sends your map image in iMessage. 📱

### Round 2: Boxed photos + grades
- [ ] `annotatePhoto(flag) → png path`: load `flag.imagePath` and draw a rounded red box from `flag.box` (fractions 0–1) using `sharp` with an SVG overlay. Add a small label at the bottom ("📷 Jun 2024 · No curb ramp")
- [ ] `gradeFlags(polyline) → Flag[]`: **Elevation API** along the path (`path=enc:<polyline>&samples=N`, roughly one sample every 20m). For each segment, `grade = Δelevation / distance`:
  - more than 5% → severity 1
  - more than 8.33% → severity 2
  - more than 12% → severity 3

  (ADA guidance treats more than 5% as a ramp; 8.33% is the maximum for a ramp.) Merge neighboring steep segments into one flag.
- [ ] Test on the demo route: the known steep block is flagged, flat blocks aren't

**Done when:** the boxed photos look right on Person 2's real frames, and the grade flags match reality.
**Merge 2:** 📱 Scene 1 works live.

### Round 3: Alerts, reports, wording
- [ ] `getAlerts(polyline) → Flag[]`: **mocked**. Read `visuals/mock-alerts.json`, which you can edit during filming to "turn on" the elevator outage. Optional: look up whether the local transit agency publishes a real alerts feed (GTFS-realtime), but don't spend more than 15 min on it
- [ ] Write **every message Tandem sends**, word for word from the demo script (PLAN.md section 2), in `visuals/copy.ts` so Person 1 can import it. Keep each bubble to 1–2 sentences
- [ ] **Merge 3:** Scenes 1–3 all work. **Start filming the first take**

### Round 4+: Video + pitch
- [ ] Film the real street shots of each problem, matching the Street View angle
- [ ] Screen-record the iMessage thread (QuickTime, with the iPhone connected to a Mac, gives clean recordings)
- [ ] Edit to about 2:00: hook → scout → re-check → arrival → close. Cut out waiting, but **keep real timestamps visible**
- [ ] Montage: 1–2 seconds of Street View frames flicking by with boxes, while the "walking it…" message is on screen
- [ ] Slides: problem, demo, how it works (one diagram), limits we're honest about, roadmap
- [ ] Rehearse the judge Q&A (PLAN.md section 8)
- [ ] Record a **backup video of the full live demo**

---

## Resources
- Maps Static API: https://developers.google.com/maps/documentation/maps-static/start
- Static map styling: https://developers.google.com/maps/documentation/maps-static/styling
- Elevation API: https://developers.google.com/maps/documentation/elevation/requests-elevation
- Mapbox Static Images (alternative look): https://docs.mapbox.com/api/maps/static-images/
- sharp (image compositing): https://sharp.pixelplumbing.com/api-composite
- ADA ramp and slope basics: https://www.access-board.gov/ada/guides/chapter-4-ramps-and-curb-ramps/

## Watch out for
- Static map URLs max out around 16k characters. Always use encoded polylines (`enc:`), never lists of points.
- `scale=2` doubles the pixels but not the map area, so set the zoom (or let it auto-fit) with that in mind.
- Elevation data is coarse (about 10–30m). It's fine for "this block is steep," not for a single curb.
- Make sure the video **shows the mock alert as a demo setup** if anyone asks. Judges respect honesty about mocks.
- Your demo route is the whole show. Walk it again in the afternoon, because construction and parked cars change.
