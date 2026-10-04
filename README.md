# Tandem

An AI route scout you text. It walks your route first with Street View and Claude vision, then texts back the steps, missing curb ramps and steep blocks it found, plus a better route.

- **Plan, demo script, sprint rounds:** [PLAN.md](PLAN.md)
- **Person 1, messaging + agent (Photon):** [messaging/](messaging/README.md)
- **Person 2, route scout pipeline (Street View + vision):** [scout/](scout/README.md)
- **Person 3, visuals + live dashboard:** [visuals/](visuals/README.md), [dashboard/](dashboard/README.md)
- **The contract between folders:** [shared/types.ts](shared/types.ts)
- **Fake scout result for building before the real pipeline exists:** [fixtures/demo-scout.json](fixtures/demo-scout.json)

Setup: copy `.env.example` to `.env` and fill in the keys. Never commit `.env`.

## Running the demo
1. `bun run bot`: the iMessage bot, plus the live dashboard at http://localhost:3000
2. `bun run tunnel` (needs `brew install cloudflared`): a public https address so the bot can text trip links. The address changes on every restart; the bot picks it up automatically.
3. Pages: `/` live dashboard (big screen) · `/trip/<id>` trip details (linked in iMessage) · `/map` campus barrier map
4. `bun run dashboard:demo`: a looping demo scout on http://localhost:3001, for rehearsing without texting

Data lives in `data/tandem.sqlite` (users, trips, reports). It isn't committed.
