# Tandem demo video

A ~90 second Remotion video built from `fixtures/demo-scout.json` and the saved frames in `fixtures/demo-frames/`. It calls no Google APIs.

- `npm run dev`: open Remotion Studio to preview (composition `TandemDemo`)
- `npm run render`: write `out/tandem-demo.mp4`
- `npm run voiceover`: regenerate the narration after editing `scripts/vo.json` (needs `pip install edge-tts`). It rewrites `src/timing.ts`, which sets every scene's length.
- `npm run assets`: re-copy the frames, rebuild the OpenStreetMap basemap and `src/data.ts` from the fixture

Scenes are in `src/scenes/`. Visual cues are tied to narration words with `wordAt()` in `src/lib.ts`, so they follow the voice if the script changes.
