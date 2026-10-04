import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, MONO } from "../constants";
import { clamp } from "../lib";

// Short technical slate after the close.
export const SlateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", opacity: interpolate(frame, [0, 0.5 * fps, durationInFrames - 0.3 * fps, durationInFrames], [0, 1, 1, 0], clamp) }}>
      <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, letterSpacing: "0.2em", color: C.muted }}>BUILT WITH</div>
      <div style={{ fontFamily: FONT, fontSize: 50, fontWeight: 600, color: C.text, marginTop: 18 }}>Claude · Photon · Google Maps Platform</div>
      <div style={{ fontFamily: MONO, fontSize: 20, color: C.dim, marginTop: 28 }}>Map data © OpenStreetMap contributors</div>
    </AbsoluteFill>
  );
};
