// The public https address of this server (a Cloudflare tunnel), for links in iMessage.
// PUBLIC_URL in .env wins; otherwise `bun run tunnel` writes the current tunnel address to a file.
import { existsSync, readFileSync } from "node:fs";

export const PUBLIC_URL_FILE = ".cache/public-url.txt";

export function publicUrl(): string | undefined {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  if (existsSync(PUBLIC_URL_FILE)) return readFileSync(PUBLIC_URL_FILE, "utf8").trim().replace(/\/$/, "") || undefined;
  return undefined;
}
