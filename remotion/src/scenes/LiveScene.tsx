import React from "react";
import { AbsoluteFill } from "remotion";
import { Scene } from "../components/Scene";
import { C, FONT } from "../constants";
import { clipAt, tw, useT } from "../lib";
import { TIMING } from "../timing";
import { Glow } from "./TurnScene";

const S = "live";

// Hand-off to the recorded end-to-end demo: ends on black so the recording can be cut in straight after.
export const LiveScene: React.FC = () => {
  const t = useT();
  const dur = TIMING[S].duration;
  const tIn = clipAt(S, 0) - 0.4;
  const a = tw(t, tIn, 0.6);
  const out = tw(t, dur - 0.7, 0.6);

  return (
    <Scene id={S} captionsUntil={0}>
      <Glow />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: a, scale: String(1 + 0.35 * out) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: FONT, fontSize: 30, fontWeight: 800, letterSpacing: "0.3em", color: C.text, border: `2px solid ${C.red}`, borderRadius: 40, padding: "10px 28px 10px 24px" }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: C.red, opacity: 0.55 + 0.45 * Math.sin(t * 7) }} />
          LIVE DEMO
        </div>
        <div style={{ fontFamily: FONT, fontSize: 104, fontWeight: 800, letterSpacing: "-0.02em", color: C.text, marginTop: 34, translate: `0px ${(1 - a) * 24}px` }}>Now, watch it work for real.</div>
        <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 500, color: C.soft, marginTop: 18, opacity: tw(t, tIn + 0.7, 0.6) }}>One text, end to end, on a real phone.</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: out }} />
    </Scene>
  );
};
