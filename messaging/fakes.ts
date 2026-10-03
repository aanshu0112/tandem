// Stand-ins for scout/ (Person 2) and visuals/ (Person 3) until Merge 2.
// Same signatures as shared/types.ts, so swapping in the real modules is an import change in scout-flow.ts.
import fixture from "../fixtures/demo-scout.json";
import type { AnnotatePhoto, RenderRouteMap, ScoutResult, ScoutRoute } from "../shared/types";

const PLACEHOLDER_IMAGE = "fixtures/placeholder.jpg";

// Returns the fixture's routes and flags, but keeps the user's real from/to so replies name their places.
export const scoutRoute: ScoutRoute = async (from, to, persona, onProgress) => {
  const result = { ...(structuredClone(fixture) as unknown as ScoutResult), from, to, persona };
  const allFlags = result.routes.flatMap((r) => r.flags);

  await Bun.sleep(2500);
  onProgress?.(50, allFlags.slice(0, 1));
  await Bun.sleep(2500);
  onProgress?.(100, allFlags);
  return result;
};

export const renderRouteMap: RenderRouteMap = async () => PLACEHOLDER_IMAGE;

export const annotatePhoto: AnnotatePhoto = async (flag) => flag.imagePath && (await Bun.file(flag.imagePath).exists())
  ? flag.imagePath
  : PLACEHOLDER_IMAGE;
