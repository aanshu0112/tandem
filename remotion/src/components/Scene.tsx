import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../constants";
import { clamp } from "../lib";
import { CROSSFADE } from "../timing";
import { Caption } from "./Caption";

// One scene: fades in over the previous one and shows its captions. The video itself is silent:
// the team records the voiceover from SCRIPT.md, which lists when each line is on screen.
export const Scene: React.FC<{ id: string; children: React.ReactNode; background?: string; captionsUntil?: number }> = ({ id, children, background = C.bg, captionsUntil = Infinity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background, opacity: interpolate(frame, [0, CROSSFADE * fps], [0, 1], clamp) }}>
      {children}
      {frame / fps < captionsUntil ? <Caption scene={id} /> : null}
    </AbsoluteFill>
  );
};
