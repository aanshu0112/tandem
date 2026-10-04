import React from "react";
import { Img, staticFile } from "remotion";
import { C, FONT } from "../constants";
import { MAP } from "../data";
import { toD, type View } from "../lib";

type Pt = readonly [number, number];

// The stitched OSM basemap with an SVG layer in map pixels. `view` is the map point at the centre and the zoom.
export const RouteMap: React.FC<{
  w: number;
  h: number;
  view: View;
  theme: "light" | "dark";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ w, h, view, theme, children, style }) => (
  <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: theme === "dark" ? C.bg2 : "#e8e4dc", ...style }}>
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: MAP.w,
        height: MAP.h,
        transformOrigin: "0 0",
        transform: `translate(${w / 2 - view.x * view.scale}px, ${h / 2 - view.y * view.scale}px) scale(${view.scale})`,
      }}
    >
      <Img
        src={staticFile(theme === "dark" ? "map-dark.jpg" : "map.png")}
        style={{ width: MAP.w, height: MAP.h, display: "block" }}
      />
      <svg width={MAP.w} height={MAP.h} viewBox={`0 0 ${MAP.w} ${MAP.h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {children}
      </svg>
    </div>
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        padding: "3px 10px",
        fontFamily: FONT,
        fontSize: 13,
        borderTopLeftRadius: 8,
        color: theme === "dark" ? C.muted : "#555",
        background: theme === "dark" ? "rgba(5,8,15,0.7)" : "rgba(255,255,255,0.75)",
      }}
    >
      © OpenStreetMap contributors
    </div>
  </div>
);

// A route line that draws from 0 to `progress`. Sizes are in screen pixels: pass the view scale as `k`.
export const RouteLine: React.FC<{
  points: readonly Pt[];
  color: string;
  progress?: number;
  width?: number;
  opacity?: number;
  casing?: string;
  dashed?: boolean;
  k: number;
}> = ({ points, color, progress = 1, width = 8, opacity = 1, casing, dashed, k }) => {
  const d = toD(points);
  const common = { d, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (dashed) return <path {...common} stroke={color} strokeWidth={width / k} strokeDasharray={`${(width * 0.4) / k} ${(width * 2) / k}`} opacity={opacity} />;
  return (
    <g opacity={opacity}>
      {casing ? <path {...common} stroke={casing} strokeWidth={(width + 6) / k} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} /> : null}
      <path {...common} stroke={color} strokeWidth={width / k} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} />
    </g>
  );
};

export const Dot: React.FC<{ at: Pt; color: string; r?: number; k: number; ring?: string; opacity?: number }> = ({ at, color, r = 11, k, ring = "#fff", opacity = 1 }) => (
  <circle cx={at[0]} cy={at[1]} r={r / k} fill={color} stroke={ring} strokeWidth={4 / k} opacity={opacity} />
);

// A numbered pin that drops in. `appear` is 0→1.
export const Pin: React.FC<{ at: Pt; color: string; label: string; appear: number; k: number; size?: number; pulse?: number }> = ({ at, color, label, appear, k, size = 22, pulse = 0 }) => {
  if (appear <= 0) return null;
  const s = size / k;
  return (
    <g transform={`translate(${at[0]} ${at[1] - (1 - appear) * 60 / k})`} opacity={Math.min(1, appear * 2)}>
      {pulse > 0 && pulse < 1 ? <circle r={s * (1 + pulse * 2.2)} fill="none" stroke={color} strokeWidth={3 / k} opacity={1 - pulse} /> : null}
      <circle r={s} fill={color} stroke="#fff" strokeWidth={3.5 / k} />
      <text textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontWeight={800} fontSize={s * 1.05} fill="#0a0f1a">
        {label}
      </text>
    </g>
  );
};
