import React from "react";
import { Img, staticFile } from "remotion";
import { C, FONT } from "../constants";

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

// A Street View frame with an optional detection box that draws itself (`draw` 0→1).
export const Photo: React.FC<{
  src: string;
  size: number;
  box?: Box | null;
  draw?: number;
  color?: string;
  label?: string;
  radius?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ src, size, box, draw = 0, color = C.red, label, radius = 16, style, children }) => (
  <div style={{ position: "relative", width: size, height: size, borderRadius: radius, overflow: "hidden", ...style }}>
    <Img src={staticFile(src)} style={{ width: size, height: size, display: "block" }} />
    {box && draw > 0 ? (
      <>
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <rect x={box.x * size} y={box.y * size} width={box.w * size} height={box.h * size} fill={color} fillOpacity={0.14 * draw} />
          <rect
            x={box.x * size}
            y={box.y * size}
            width={box.w * size}
            height={box.h * size}
            rx={6}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(4, size / 110)}
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - draw}
          />
        </svg>
        {label ? (
          <div
            style={{
              position: "absolute",
              left: box.x * size,
              top: box.y * size - size * 0.075,
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: size * 0.044,
              letterSpacing: "0.06em",
              color: "#fff",
              background: color,
              padding: `${size * 0.008}px ${size * 0.02}px`,
              borderRadius: 6,
              opacity: draw,
            }}
          >
            {label}
          </div>
        ) : null}
      </>
    ) : null}
    {children}
  </div>
);
