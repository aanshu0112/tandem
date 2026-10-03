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
| `visuals/` | Person 3 | Maps, photo boxes, demo assets |

Each folder's `README.md` has that person's task list and API notes. Read it before working in the folder, and stay inside the folder you were asked to work on.

## The contract: `shared/types.ts`

- `shared/types.ts` is the only interface between the three folders.
- Change it only when all 3 people agree.
- Any change to it must update `fixtures/demo-scout.json` in the **same commit**, so the fixture always matches the types.

## Building and testing

- Until the real modules exist, build against `fixtures/demo-scout.json` instead of calling another folder's code.
- `smoke.ts` is the combined run. Run it at every merge with `bun smoke.ts`. As each real module lands, replace the fixture with that module, following the TODOs in the file.
- `package.json` has `bun run bot` (the Photon test bot in `messaging/bot.ts`) and `bun run smoke`. The `test:scout`, `test:vision` and `test:visuals` scripts in the READMEs don't exist yet. Whoever writes each test should add its script to `package.json`.

## Rules

- **Never commit `.env`.** Copy `.env.example` to `.env` for local keys. `.env` is already in `.gitignore`.
- **Use the Google Routes API** (`POST https://routes.googleapis.com/directions/v2:computeRoutes`), not the legacy Directions API. `scout/README.md` has the request details.

## Bun

- Use Bun, not Node: `bun <file>`, `bun test`, `bun install`, `bunx`.
- Bun loads `.env` automatically, so don't use dotenv.
- Use `bun:sqlite` for SQLite, `Bun.file` for files, and `Bun.$` for shell commands.
