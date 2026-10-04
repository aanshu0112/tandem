# Person 3 (Salloni): Live "mission control" dashboard (`dashboard/`)

A web page on the big screen next to the phone. When someone texts Tandem a route, the judges watch the agent work **in real time**:
- the routes draw on a map
- Street View photos flick by as Claude checks them, each getting a ✅ or a red box with a label
- counters tick up
- the winning route turns green

It shows the AI actually looking at the street, which the iMessage thread alone can't.

**You own `dashboard/`.** It's plain HTML/CSS/JS with no build step, served by Person 1's server.

---

## How it gets data
- Person 1's server (`bun run dashboard`, port 3000) serves this folder at `/` and streams events at **`GET /events`** (server-sent events).
- Each message is one JSON `ScoutEvent`. The exact shapes are in [`shared/types.ts`](../shared/types.ts):
  `start → routes → frame / verdict (many) → flag (several) → progress → done → flythrough`
- On connect, the server first **replays the latest scout's events**, so a page refresh catches up.
- Images: `<img src="/files/${event.imagePath}">`.
- **Until the real scout emits events:** `bun run dashboard:demo` (http://localhost:3001) replays a recorded demo scout (Noyes → Goldwin Smith) on a loop at real speed. Build entirely against that.

```js
const es = new EventSource("/events");
es.onmessage = (m) => {
  const e = JSON.parse(m.data);
  switch (e.type) {
    case "start":   /* reset the page, show "Noyes → Goldwin Smith · wheelchair" */ break;
    case "routes":  /* draw each polyline on the map (decode Google's encoded polyline) */ break;
    case "frame":   /* add the photo to the feed, move that route's walker dot to e.location */ break;
    case "verdict": /* stamp the photo: ✅ for none, red box (e.box, fractions 0–1) + e.note otherwise */ break;
    case "flag":    /* numbered pin on the map + a row in the problems list */ break;
    case "progress":/* counters + progress bar */ break;
    case "done":    /* turn e.result.recommendedRouteId green, dim the rest, show the winner banner */ break;
    case "flythrough": /* optional: play /files/<gifPath> in a corner */ break;
  }
};
```

---

## Layout (designed for a 1920×1080 projector)
```
┌───────────────────────────────────────────────┬───────────────────────────┐
│  TANDEM  · Noyes → Goldwin Smith · ♿          │  📷 112 checked  ⚠ 3  ⏱ 41s│
├───────────────────────────────────────────────┼───────────────────────────┤
│                                               │  [ current photo, large ]  │
│        MAP (Leaflet + OSM tiles)              │  red box animates in       │
│   routes drawn, walker dots moving,           │  "14 steps, no ramp"       │
│   pins drop as flags arrive                   ├───────────────────────────┤
│                                               │  photo strip (last ~12)    │
│                                               │  ✅ ✅ 🟥 ✅ ✅ …           │
├───────────────────────────────────────────────┴───────────────────────────┤
│  Route A  9 min  ████████░░  score 9   🔴 14 steps                         │
│  Route B 10 min  ██████████  score 2   ✅ recommended                      │
└───────────────────────────────────────────────────────────────────────────┘
```

## Your rounds
### Round 5a (about 1.5h): it works
- [ ] `index.html`, `app.js`, `style.css`. Leaflet from a CDN with OSM tiles, plus the "© OpenStreetMap contributors" credit
- [ ] Decode polylines (about 15 lines of JS, or `@mapbox/polyline` from a CDN), draw routes, move a walker dot per route on `frame`
- [ ] Photo feed: the large current photo plus a strip of recent photos; `verdict` stamps ✅ or draws the red box (CSS absolutely positioned from `box`)
- [ ] Counters from `progress`; pins and a problems list from `flag`; green winner on `done`

**Done when:** `bun run dashboard:demo`, opened at http://localhost:3001, plays the whole Noyes scout start to finish without a page refresh.

### Round 5b (about 1h): it looks great
- [ ] Animations: photos slide in, the box "draws" itself, pins drop, the winner banner
- [ ] Dark theme that reads on a projector; big type (judges are 3m away)
- [ ] Idle state between scouts: "Text (xxx) xxx-xxxx to try it", with a QR code if there's time
- [ ] Test at 1920×1080 in full screen

### Stretch: campus barrier map
A second view (`/map.html`) with every flag and user report Tandem has found, as a heatmap. It needs Person 1's Round 3 database, so do it last.

## Resources
- Leaflet: https://leafletjs.com/examples/quick-start/
- Server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- Polyline decoding: https://github.com/mapbox/polyline
- OSM tile policy (attribution required): https://operations.osmfoundation.org/policies/tiles/

## Watch out for
- Lots of events arrive close together (photos checked 8 at a time). Queue them and play photos at about 6–8 per second so the feed is watchable rather than a blur.
- Several scouts can happen at once. Show the latest `scoutId` and ignore older ones.
- Every image has to load through `/files/…`. Don't hard-code paths.
