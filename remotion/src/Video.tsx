import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { C } from "./constants";
import { ClosingScene } from "./scenes/ClosingScene";
import { HookScene } from "./scenes/HookScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { LiveScene } from "./scenes/LiveScene";
import { MemoryScene } from "./scenes/MemoryScene";
import { MoreScene } from "./scenes/MoreScene";
import { NightScene } from "./scenes/NightScene";
import { ReplyScene } from "./scenes/ReplyScene";
import { RequestScene } from "./scenes/RequestScene";
import { ScoutScene } from "./scenes/ScoutScene";
import { TurnScene } from "./scenes/TurnScene";
import { TIMING, VO_TOTAL } from "./timing";

export const TOTAL_SECONDS = VO_TOTAL;

// Each scene starts CROSSFADE seconds before the previous one ends and fades in over it.
export const DemoVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  const at = (id: string) => ({ from: Math.round(TIMING[id].start * fps), durationInFrames: Math.round(TIMING[id].duration * fps), premountFor: fps, name: id });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence {...at("hook")}>
        <HookScene />
      </Sequence>
      <Sequence {...at("problem")}>
        <ProblemScene />
      </Sequence>
      <Sequence {...at("turn")}>
        <TurnScene />
      </Sequence>
      <Sequence {...at("request")}>
        <RequestScene />
      </Sequence>
      <Sequence {...at("scout")}>
        <ScoutScene />
      </Sequence>
      <Sequence {...at("reply")}>
        <ReplyScene />
      </Sequence>
      <Sequence {...at("memory")}>
        <MemoryScene />
      </Sequence>
      <Sequence {...at("night")}>
        <NightScene />
      </Sequence>
      <Sequence {...at("more")}>
        <MoreScene />
      </Sequence>
      <Sequence {...at("closing")}>
        <ClosingScene />
      </Sequence>
      <Sequence {...at("live")}>
        <LiveScene />
      </Sequence>
    </AbsoluteFill>
  );
};
