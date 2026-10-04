# Tandem demo video

A ~2.5 minute Remotion video built from `fixtures/demo-scout.json`, the saved frames in `fixtures/demo-frames/` and OpenStreetMap data. It calls no Google APIs.

- `npm install`, then `npm run dev`: open Remotion Studio to preview (composition `TandemDemo`)
- `npm run render`: write `out/tandem-demo.mp4`
- `npm run voiceover`: re-time the video after editing the lines in `scripts/vo.json` (needs `pip install edge-tts`). It rewrites `src/timing.ts`, which sets every scene's length, and `SCRIPT.md`.
- The narration is an Edge TTS voice (`en-GB-RyanNeural`, set in `scripts/vo.json`) with captions. `SCRIPT.md` has every line with its start and end time, in case you record a real voiceover instead.
- `npm run assets`: re-copy the frames, rebuild the OpenStreetMap basemap, and rewrite `src/data.ts` and `src/extras.ts`

Scenes are in `src/scenes/`. Visual cues are tied to narration words with `wordAt()` in `src/lib.ts`, so they follow the voice if the script changes.

What is real and what is mocked:
- Routes, flags, durations and photos come from the fixture. The dashboard and the iMessage thread are recreated, with the bot's own message wording from `messaging/scout-flow.ts`.
- The entrance note and the night-mode lighting are computed from `scripts/osm/area.json` (a one-time OpenStreetMap download) with the same rules as `scout/entrance.ts` and `scout/night.ts`.
- The weather scene uses the app's demo values (`TANDEM_WEATHER=icy`) and shows no specific bus line, because the bus lookup needs the Google Routes API.
