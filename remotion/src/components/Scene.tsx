import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../constants";
import { clamp } from "../lib";
import { CROSSFADE, TIMING } from "../timing";
import { Caption } from "./Caption";

// One narrated scene: fades in over the previous one, plays its voiceover clips, shows captions.
export const Scene: React.FC<{ id: string; children: React.ReactNode; background?: string; captionsUntil?: number }> = ({ id, children, background = C.bg, captionsUntil = Infinity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background, opacity: interpolate(frame, [0, CROSSFADE * fps], [0, 1], clamp) }}>
      {children}
      {TIMING[id].clips.map((c) => (
        <Sequence key={c.file} from={Math.round(c.start * fps)} layout="none">
          <Audio src={staticFile(c.file)} />
        </Sequence>
      ))}
      {frame / fps < captionsUntil ? <Caption scene={id} /> : null}
    </AbsoluteFill>
  );
};
