# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Tandem is

An AI route scout you reach by iMessage (through Photon Spectrum). It walks a route first with Street View and Claude vision, then texts back the obstacles it found and a better route. Before you leave, it re-checks the route and texts only if something changed.

The full plan, demo script and sprint rounds are in [PLAN.md](PLAN.md). The overview is in [README.md](README.md).

## Folder ownership

| Folder | Owner | Scope |
|---|---|---|
| `messaging/` | Person 1 | Photon Spectrum + Claude agent loop |
| `scout/` | Person 2 | Route scout pipeline (routes → Street View → vision → flags) |
| `visuals/` | Person 3 | Maps, photo boxes, grades |
| `dashboard/` | Person 3 | Plain HTML/JS pages served by `messaging/server.ts`: live dashboard (`/`), trip page (`/trip/<id>`), barrier map (`/map`) |

Each folder's `README.md` has that person's task list and API notes. Read it before working in the folder, and stay inside the folder you were asked to work on.

## The contract: `shared/types.ts`

- `shared/types.ts` is the only interface between the three folders.
- Change it only when all 3 people agree.
- Any change to it must update `fixtures/demo-scout.json` in the **same commit**, so the fixture always matches the types.

## Building and testing

- Until the real modules exist, build against `fixtures/demo-scout.json` instead of calling another folder's code.
- `smoke.ts` is the combined run. Run it at every merge with `bun smoke.ts`. As each real module lands, replace the fixture with that module, following the TODOs in the file.
- `package.json` scripts:
  - Running: `bot` (the iMessage bot plus the dashboard on :3000), `dashboard` (the server alone), `dashboard:demo` (a looping demo scout on :3001), `tunnel` (a public URL for trip links), `photon-test`.
  - Tests: `smoke`, `test:scout`, `test:vision`, `test:route`, `test:scout-unit` (`bun test scout`), and `test:visuals` (renders `out/map.png` from the fixture).
  - Whoever writes a test should add its script to `package.json`.
- `dashboard:demo` uses Mac/Linux env syntax. On Windows run `$env:DASHBOARD_PORT=3001; bun messaging/demo-replay.ts` instead.
- Settings beyond the API keys (`TANDEM_PHONE`, `PUBLIC_URL`, `TANDEM_WEATHER=icy`, `SCOUT_MODE=fake`, …) are documented in `.env.example`.

## Rules

- **Never commit `.env`.** Copy `.env.example` to `.env` for local keys. `.env` is already in `.gitignore`.
- **Use the Google Routes API** (`POST https://routes.googleapis.com/directions/v2:computeRoutes`), not the legacy Directions API. `scout/README.md` has the request details.

## Bun

- Use Bun, not Node: `bun <file>`, `bun test`, `bun install`, `bunx`.
- Bun loads `.env` automatically, so don't use dotenv.
- Use `bun:sqlite` for SQLite, `Bun.file` for files, and `Bun.$` for shell commands.
