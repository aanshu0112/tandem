// What visuals/ exports to messaging/ and scout/ (signatures in shared/types.ts).
// gradeFlags isn't exported yet: scout/index.ts picks it up from here automatically, and
// at 20-35s per route it would slow every scout. Add it once it's faster.
export { renderRouteMap } from "./map";
export { annotatePhoto } from "./photo";
