# Tandem

An AI route scout you text. It walks your route first with Street View and Claude vision, then texts back the steps, missing curb ramps and steep blocks it found, plus a better route.

- **Plan, demo script, sprint rounds:** [PLAN.md](PLAN.md)
- **Person 1, messaging + agent (Photon):** [messaging/](messaging/README.md)
- **Person 2, route scout pipeline (Street View + vision):** [scout/](scout/README.md)
- **Person 3, visuals + live dashboard:** [visuals/](visuals/README.md), [dashboard/](dashboard/README.md)
- **The contract between folders:** [shared/types.ts](shared/types.ts)
- **Fake scout result for building before the real pipeline exists:** [fixtures/demo-scout.json](fixtures/demo-scout.json)

Setup: copy `.env.example` to `.env` and fill in the keys. Never commit `.env`.
