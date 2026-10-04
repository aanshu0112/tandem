// bun scout/test-entrance.ts "Goldwin Smith Hall" 42.4491 -76.4853
// Looks up the building's entrances and prints the EntranceInfo plus the photo path.
import { checkEntrance } from "./entrance";

const [name, lat, lng] = process.argv.slice(2);
if (!name || !lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
  console.error('usage: bun scout/test-entrance.ts "<building name>" <lat> <lng>');
  process.exit(1);
}

const t0 = Date.now();
const info = await checkEntrance({ lat: Number(lat), lng: Number(lng) }, name);
console.log(JSON.stringify(info, null, 2));
console.log(info?.photo ? `photo: ${info.photo.imagePath}` : "photo: none");
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
