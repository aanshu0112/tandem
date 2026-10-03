# Person 2: Route scout pipeline (`scout/`)

You own the **core of the product**: given a start, an end and a persona, "walk" every candidate route with Street View and Claude vision, and return flagged problems plus a recommended route.

You **export** `scoutRoute()` with the exact signature in [`shared/types.ts`](../shared/types.ts). It's a **plain async function, not an agent**. Use `Promise.all` and `p-limit` for parallelism. Build and test it from a script, without Photon.

Full context: [PLAN.md](../PLAN.md), section 4 (how the scout works).

---

## Your rounds

### Round 1: Routes → frames on disk
- [ ] `getRoutes(from, to)`: walking routes with alternatives (see the Google API note below). Returns `{ routeId, polyline, durationMin }[]`
- [ ] `samplePoints(polyline, everyM = 15)`: decode with `@googlemaps/polyline-codec`, then step along the line with `@turf/along` and `@turf/length`. For each point, compute the **heading to the next point** with `@turf/bearing`
- [ ] For each point, call **Street View metadata** (free) to get `pano_id`, `date` and the snapped location. **Skip duplicate `pano_id`s**
- [ ] For each unique pano, call **Street View Static** and save to `fixtures/demo-frames/<routeId>/<i>.jpg` plus a `frames.json` with `{ i, panoId, date, lat, lng, heading }`
- [ ] `bun run test:scout` runs this on the demo route

**Done when:** you flip through the frames and **they show the sidewalk along the route**, with no long runs of identical images. Commit the demo frames; everyone uses them.
**Merge 1:** frames committed. Person 3 can start drawing boxes on real photos.

### Round 2: Vision → flags
- [ ] `classifyFrames(frames, persona) → Flag[]`: send **batches of 5 images** per Claude request, with batches running in parallel through `p-limit` (start with 8 at once)
- [ ] Ask for **JSON only**: one object per frame (prompt below)
- [ ] Turn the answers into `Flag`s with `location`, `imagePath`, `photoDate` and `box` filled in
- [ ] Build a ground-truth list: in `scout/ground-truth.json`, write down which frames contain the 2–3 real problems found in Round 0
- [ ] `bun run test:vision` prints hits and misses against the ground truth, plus the false-flag count

**Done when:** it catches **all 2–3 known problems**. A few false flags are fine. Tune the prompt, the `pitch`/`fov`, and the confidence threshold until it does.
**Merge 2:** the real `scoutRoute()` (routes → frames → vision, plus Person 3's `gradeFlags()`) replaces the fixture. 📱 Scene 1 works live.

### Round 3: Alternatives, scoring, speed
- [ ] Scout **every** alternative route in parallel
- [ ] `mergeFlags()`: flags of the same type within ~15m of each other become one, keeping the highest confidence
- [ ] Merge in `gradeFlags(polyline)` and `getAlerts(polyline)` from Person 3, plus user reports near the route (a function from Person 1, or read SQLite directly)
- [ ] `score = Σ severity² × confidence` (severity 3 = blocking). Recommend the lowest score; if two are close, pick the shorter one
- [ ] Cache images and vision results by `pano_id + heading + persona` in `.cache/`
- [ ] Call `onProgress(pct, flagsSoFar)` as batches finish

**Done when:** the recommended route avoids the known problems; the first run takes **< 60s**; the second run (cached) takes **< 5s**.

### Round 4+
- **Second look at uncertain flags:** if confidence is between 0.4 and 0.7, fetch 2 more angles (heading ±30°, or `fov=60` to zoom in) and ask Claude again
- Run on a **second route** to show it isn't hard-coded
- "Couldn't check": stretches with no Street View coverage should come back as a note, not silently count as fine

---

## Vision prompt (starting point)

```
You are checking street-level photos along a walking route for someone who uses a {persona}.
For EACH image (they are numbered 0..N-1), report physical barriers on the sidewalk or path
ahead: steps or stairs, a curb with no curb ramp at a crossing, broken/uneven sidewalk,
obstructions (poles, signs, parked scooters blocking the path), construction.
Ignore things on the road that don't block the sidewalk.

Return ONLY JSON:
[{"frame": 0, "issue": "none" | "steps" | "no_curb_ramp" | "broken_sidewalk" | "obstruction" | "construction",
  "severity": 1|2|3, "confidence": 0.0-1.0,
  "box": {"x":0-1,"y":0-1,"w":0-1,"h":0-1} | null,
  "note": "short description a person would understand"}]
Severity 3 = this person likely cannot get past. If unsure, still report it with lower confidence.
```
Adjust per persona: a stroller cares about the same things with lower severity; `night_solo` is mostly a roadmap item.

Model: `claude-sonnet-5-5`. A 640×640 image costs about 550 input tokens.

## Google API calls

**Routes.** Use the **Routes API**, not the legacy Directions API (Google lists Directions as *Legacy*, and new projects may not be able to enable it):
```
POST https://routes.googleapis.com/directions/v2:computeRoutes
Headers: X-Goog-Api-Key, X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline
Body: { origin: {address}, destination: {address}, travelMode: "WALK", computeAlternativeRoutes: true }
```
Walking alternatives aren't always returned. If you only get one route, make an alternative by adding a waypoint that steers around the worst flag.

**Street View metadata** (free, no quota cost):
`https://maps.googleapis.com/maps/api/streetview/metadata?location=LAT,LNG&radius=15&source=outdoor&key=…`
Returns `status`, `pano_id`, `date`, `location`. Skip anything that isn't `status: "OK"`.

**Street View Static:**
`https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=PANO_ID&heading=H&pitch=-15&fov=90&return_error_code=true&key=…`
- `pitch` between -10 and -20 looks down at the ground, where curbs are
- For curb ramps at intersections, add a frame at `heading ± 45°`

## Resources
- Routes API: https://developers.google.com/maps/documentation/routes/compute_route_directions
- Street View Static: https://developers.google.com/maps/documentation/streetview/request-streetview
- Street View metadata: https://developers.google.com/maps/documentation/streetview/metadata
- Claude vision: https://docs.claude.com/en/docs/build-with-claude/vision
- npm: `@googlemaps/polyline-codec`, `@turf/along`, `@turf/length`, `@turf/bearing`, `@turf/distance`, `p-limit`
- OpenStreetMap curb/steps data (optional, Round 3+): try queries at https://overpass-turbo.eu for `highway=steps` and `kerb=*` near the route
- Project Sidewalk, crowdsourced curb and sidewalk data in some cities (optional; check coverage for the demo city): https://projectsidewalk.org

## Watch out for
- **Street View's camera is on the road**, so sidewalks show up at an angle, and parked cars can hide curbs. The angled frames help.
- **Photos can be years old.** Always pass `photoDate` through so the user sees it.
- The metadata call snaps to the nearest pano, which can be on a different street at corners. Keep `radius` small (10–20m).
- If you hit rate limits, lower the `p-limit` concurrency before anything else.
- **Cache from the first run.** Re-fetching images while tuning prompts wastes time and quota.
