import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import type { AnnotatePhoto } from "../shared/types";

// Street View frame + rounded red box around the problem + a caption bar ("Photo Jul 2009 · Steps").
const RED = "#E5484D";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function photoDate(d?: string): string | undefined {
  const m = d?.match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : undefined;
}

// Word-wrap to at most `maxLines` lines of about `width` characters, with "…" if it still doesn't fit.
function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1]!;
    lines.length = maxLines;
    lines[maxLines - 1] = (last.length > width - 1 ? last.slice(0, width - 1) : last).trimEnd() + "…";
  }
  return lines;
}

export const annotatePhoto: AnnotatePhoto = async (f) => {
  if (!f.imagePath) throw new Error(`annotatePhoto: flag ${f.id} has no imagePath`);
  const img = sharp(f.imagePath);
  const { width: W = 640, height: H = 640 } = await img.metadata();
  const u = W / 640; // scale strokes and text with the image

  let box = "";
  if (f.box) {
    const x = clamp01(f.box.x) * W, y = clamp01(f.box.y) * H;
    const w = Math.min(clamp01(f.box.w) * W, W - x), h = Math.min(clamp01(f.box.h) * H, H - y);
    const r = 14 * u;
    // dark outline under the red stroke so the box reads on both sky and pavement
    box = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="${10 * u}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${RED}" stroke-width="${6 * u}"/>`;
  }

  // Caption goes at the top: Street View's Google logo and copyright sit in the bottom
  // corners and must stay visible.
  const date = photoDate(f.photoDate);
  // No emoji here: the SVG renderer has no emoji font and draws a blank box.
  const caption = [date ? `Photo ${date}` : "", f.note ?? ""].filter(Boolean).join(" · ");
  const lines = wrap(caption, 44, 2);
  const lineH = 32 * u, padY = 12 * u;
  const barH = lines.length * lineH + padY * 2;
  const bar = lines.length
    ? `<rect x="0" y="0" width="${W}" height="${barH}" fill="#000" fill-opacity="0.62"/>` +
      lines
        .map(
          (l, i) =>
            `<text x="${18 * u}" y="${padY + (i + 1) * lineH - 9 * u}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${24 * u}" font-weight="600" fill="#fff">${esc(l)}</text>`,
        )
        .join("")
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${box}${bar}</svg>`;
  await mkdir("out/photos", { recursive: true });
  const path = `out/photos/${f.id}.png`;
  await img.composite([{ input: Buffer.from(svg) }]).png().toFile(path);
  return path;
};
