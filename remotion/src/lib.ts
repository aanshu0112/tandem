import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TIMING } from "./timing";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const POP = Easing.out(Easing.back(1.7));

// 0→1 over `dur` seconds starting at `start`
export const tw = (t: number, start: number, dur = 0.6, easing: (n: number) => number = OUT) =>
  interpolate(t, [start, start + dur], [0, 1], { ...clamp, easing });

export const useT = () => useCurrentFrame() / useVideoConfig().fps;

// When the narrator says a word, in seconds from the scene start. Throws if the script changed and the word is gone.
export const wordAt = (scene: string, word: string, nth = 0) => {
  const hits = TIMING[scene].words.filter((w) => w.t.toLowerCase().replace(/[^a-z0-9]/g, "") === word);
  if (!hits[nth]) throw new Error(`"${word}" #${nth} is not in the ${scene} narration`);
  return hits[nth].s;
};
export const clipAt = (scene: string, i: number) => TIMING[scene].clips[i].start;

type Pt = readonly [number, number];
export const toD = (pts: readonly Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");

export const pointAt = (pts: readonly Pt[], f: number): Pt => {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = Math.min(Math.max(f, 0), 1) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) {
      const k = seg[i] ? left / seg[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    left -= seg[i];
  }
  return pts[pts.length - 1];
};

export const fracNear = (pts: readonly Pt[], x: number, y: number) => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 500; i++) {
    const p = pointAt(pts, i / 500);
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bestD) [best, bestD] = [i / 500, d];
  }
  return best;
};

export type View = { x: number; y: number; scale: number };
export const fitView = (pts: readonly Pt[], w: number, h: number, pad: number): View => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, scale: Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0)) };
};
