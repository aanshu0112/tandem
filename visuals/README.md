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
- [x] `renderRouteMap(result) → png path` in [`map.ts`](map.ts). **It uses OpenStreetMap tiles through the `staticmaps` npm package, not the Google Maps Static API**, which can't be enabled on our key. It draws:
  - other routes in red and the recommended route in green on top
  - numbered pins for flags, colored by severity, plus a start ring and an end dot, drawn as an SVG overlay with `sharp`
  - the image at 1280×1280 (640×640 at 2x), so it's sharp on phones
  - "© OpenStreetMap contributors" in the corner, which the OSM tile policy requires
- [x] `bun run test:visuals` writes `out/map.png` and `out/photos/<flagId>.png` from the fixture. Add `--no-grades` to skip the slow elevation lookups.

**Done when:** you'd be happy to put the PNG in the video.
**Merge 1:** Person 1 sends your map image in iMessage. 📱

### Round 2: Boxed photos + grades
- [x] `annotatePhoto(flag) → png path` in [`photo.ts`](photo.ts). It loads `flag.imagePath` and draws a rounded red box from `flag.box` (fractions 0–1) using `sharp` with an SVG overlay. It writes `out/photos/<flagId>.png`.
  - The caption ("📷 Jul 2009 · Steps…") goes in a bar at the **top**, wrapped to 2 lines. Street View's Google logo and copyright sit in the bottom corners and must stay visible.
  - A flag with no `box` gets just the caption. A flag with no `imagePath` throws an error.
  - Tested on scout's vision output for the Ithaca frames: both staircases were boxed correctly.
- [x] `gradeFlags(polyline) → Flag[]` in [`grades.ts`](grades.ts). It samples the path every 20m and looks up elevation with the **USGS Elevation Point Query Service** (1m lidar in Ithaca). If USGS fails, it falls back to **OpenTopoData `ned10m`**. It does **not** use the Google Elevation API, which can't be enabled on our key. USGS is slow and sometimes fails, so a ~500m route takes 20–35s even with all requests in parallel. For each segment, `grade = Δelevation / distance`:
  - more than 5% → severity 1
  - more than 8.33% → severity 2
  - more than 12% → severity 3

  (ADA guidance treats more than 5% as a ramp; 8.33% is the maximum for a ramp.) Merge neighboring steep segments into one flag, and drop steep runs shorter than 35m, because elevation data is too coarse to judge them.
- [x] Test on the demo route: each route gets exactly one flag, for the Libe Slope climb. Route A is 25% over about 200m (at the stairs) and Route B is 18–20% over about 190m. The flat start and West Ave aren't flagged.
- [ ] `gradeFlags` isn't exported from [`index.ts`](index.ts) yet. `scout/index.ts` picks it up from there automatically, and at 20–35s per route it would slow every scout. Export it once it's faster.

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
- staticmaps (OSM map rendering): https://github.com/StephanGeorg/staticmaps
- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- USGS Elevation Point Query Service: https://epqs.nationalmap.gov/v1/docs
- OpenTopoData ned10m (fallback): https://www.opentopodata.org/datasets/ned/
- Mapbox Static Images (alternative look): https://docs.mapbox.com/api/maps/static-images/
- sharp (image compositing): https://sharp.pixelplumbing.com/api-composite
- ADA ramp and slope basics: https://www.access-board.gov/ada/guides/chapter-4-ramps-and-curb-ramps/

## Watch out for
- OSM tiles are free but rate-limited, and requests need a real User-Agent. Don't render maps in a loop; render once per result.
- `staticmaps` pins `sharp@0.33`, which has no Windows ARM build, so `package.json` overrides `sharp` to 0.34.
- Elevation data is coarse: USGS is 1m here, but `ned10m` is 10m. It's fine for "this block is steep," not for a single curb.
- Make sure the video **shows the mock alert as a demo setup** if anyone asks. Judges respect honesty about mocks.
- Your demo route is the whole show. Walk it again in the afternoon, because construction and parked cars change.
