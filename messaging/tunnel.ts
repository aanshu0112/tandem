// Gives the local server a public https address with a free Cloudflare quick tunnel, and saves
// the address for the bot's links. Run: bun run tunnel  (needs `brew install cloudflared`)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { PUBLIC_URL_FILE } from "./public-url";

const port = Number(process.env.DASHBOARD_PORT ?? 3000);
const proc = Bun.spawn(["cloudflared", "tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdout: "pipe", stderr: "pipe" });

// cloudflared prints the address on stderr once the tunnel is up.
const decoder = new TextDecoder();
let found = false;
for await (const chunk of proc.stderr) {
  const text = decoder.decode(chunk);
  const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url && !found) {
    found = true;
    mkdirSync(".cache", { recursive: true });
    writeFileSync(PUBLIC_URL_FILE, url);
    console.log(`Public URL: ${url}  (dashboard: ${url}/  ·  barrier map: ${url}/map)`);
  }
}
rmSync(PUBLIC_URL_FILE, { force: true });
console.log(`cloudflared exited (${await proc.exited})`);
