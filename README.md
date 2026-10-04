# Tandem

An AI route scout you text. It walks your route first with Street View and Claude vision, then texts back the steps, missing curb ramps and steep blocks it found, plus a better route.

- **Plan, demo script, sprint rounds:** [PLAN.md](PLAN.md)
- **Person 1, messaging + agent (Photon):** [messaging/](messaging/README.md)
- **Person 2, route scout pipeline (Street View + vision):** [scout/](scout/README.md)
- **Person 3, visuals + live dashboard:** [visuals/](visuals/README.md), [dashboard/](dashboard/README.md)
- **The contract between folders:** [shared/types.ts](shared/types.ts)
- **Fake scout result for building before the real pipeline exists:** [fixtures/demo-scout.json](fixtures/demo-scout.json)
- **Demo video:** the `demo-video` branch, `remotion/` (rendered to `remotion/out/tandem-demo.mp4`)

Setup: copy `.env.example` to `.env` and fill in the keys. Never commit `.env`.

## What it does
You text where you're going ("Noyes to Goldwin Smith, I use a wheelchair"). About a minute later Tandem texts back:
- **The scout:** every candidate walking route, checked photo by photo with Street View and Claude vision. It cross-checks OpenStreetMap (stairs, curbs) and elevation data (steep grades). Each problem comes with its photo, a red box and the photo's date. It also says which stretches it couldn't check.
- **Google vs Tandem:** how Google Maps' own route compares with the one Tandem recommends, in minutes and problems.
- **The entrance:** the last 20 meters. Which door of the destination building to use, from OpenStreetMap entrance data, with a Street View photo of it. If the map doesn't say which door is step-free, Tandem says so instead of guessing.
- **Weather and the bus:** the forecast for when you're leaving (Open-Meteo). If walking looks bad (icy hills, snow, cold rain, stairs on every route, a long unlit stretch at night), it offers a TCAT bus option from the Google Routes API.
- **A flythrough GIF:** the walk played as photos, pausing on each problem.
- **A trip page:** a private `/trip/<id>` link with the map, numbered problems, photos, flythrough, route comparison, entrance, weather and bus.

How you get around changes what it checks:
- **Wheelchair:** steps, curbs with no ramp, steep grades, broken sidewalk.
- **Stroller:** the same barriers, weighted lower (a few steps can be carried).
- **Walking alone at night:** street lights (OpenStreetMap `lit`), isolated footpaths away from roads, blue-light emergency phones and places open at that hour, instead of stairs.

It also remembers:
- **Your profile:** it saves how you get around, so it asks only once.
- **Your location:** you can drop an iMessage location pin as your start.
- **Your reports:** after a trip, tell it what it missed ("sidewalk torn up outside the Starbucks"). Reports are saved and show up as flags on future scouts nearby, and on the campus barrier map at `/map`.

Not built yet: the scheduled re-check before you leave (PLAN.md section 4).

## Running the demo
1. `bun run bot`: the iMessage bot, plus the live dashboard at http://localhost:3000
2. `bun run tunnel`: a public https address so the bot can text trip links. The address changes on every restart; the bot picks it up automatically. Needs `cloudflared`: `brew install cloudflared` on a Mac, or `winget install Cloudflare.cloudflared` on Windows.
3. Pages: `/` live dashboard (big screen) · `/trip/<id>` trip details (linked in iMessage; `/trip/demo` shows the saved demo route) · `/map` campus barrier map
4. `bun run dashboard:demo`: a looping demo scout on http://localhost:3001, for rehearsing without texting. On Windows, that script's syntax doesn't work; in PowerShell run `$env:DASHBOARD_PORT=3001; bun messaging/demo-replay.ts`.
5. Before presenting, set `TANDEM_PHONE` in `.env` so the idle screen shows the number and a QR code. To rehearse the icy-hill bus offer on a dry day, set `TANDEM_WEATHER=icy` (the texts label it "(demo)").

Data lives in `data/tandem.sqlite` (users, trips, reports). It isn't committed.
