import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { C, SLATE_SECONDS } from "./constants";
import { BetterScene } from "./scenes/BetterScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { HookScene } from "./scenes/HookScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ProofScene } from "./scenes/ProofScene";
import { RequestScene } from "./scenes/RequestScene";
import { ScoutScene } from "./scenes/ScoutScene";
import { SlateScene } from "./scenes/SlateScene";
import { TurnScene } from "./scenes/TurnScene";
import { CROSSFADE, TIMING, VO_TOTAL } from "./timing";

export const SLATE_START = VO_TOTAL - CROSSFADE;
export const TOTAL_SECONDS = SLATE_START + SLATE_SECONDS;

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
      <Sequence {...at("proof")}>
        <ProofScene />
      </Sequence>
      <Sequence {...at("better")}>
        <BetterScene />
      </Sequence>
      <Sequence {...at("closing")}>
        <ClosingScene />
      </Sequence>
      <Sequence name="slate" from={Math.round(SLATE_START * fps)} durationInFrames={Math.round(SLATE_SECONDS * fps)} premountFor={fps}>
        <SlateScene />
      </Sequence>
    </AbsoluteFill>
  );
};
