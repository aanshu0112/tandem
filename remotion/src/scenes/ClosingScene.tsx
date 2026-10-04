import React from "react";
import { AbsoluteFill } from "remotion";
import { NavCard } from "../components/NavCard";
import { Dot, Pin, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { Wordmark } from "../components/Wordmark";
import { C, FONT } from "../constants";
import { clipAt, POP, tw, useT } from "../lib";
import { A, B, END, START, stairs, steep } from "../route";
import { navView } from "./HookScene";
import { Glow } from "./TurnScene";

const S = "closing";

export const ClosingScene: React.FC = () => {
  const t = useT();
  const tSwap = clipAt(S, 1) - 0.1;
  const tDark = clipAt(S, 2) - 0.75;
  const tMark = clipAt(S, 2) - 0.15;
  const tTag = clipAt(S, 3) - 0.1;
  const view = navView(1.03 + 0.004 * t);
  const k = view.scale;
  const swap = tw(t, tSwap, 0.6);

  return (
    <Scene id={S} captionsUntil={tDark}>
      <RouteMap w={1920} h={1080} view={view} theme="light">
        <RouteLine points={A} color="#9aa3b2" dashed width={9} opacity={swap} k={k} />
        <RouteLine points={A} color={C.navBlue} casing="#fff" width={11} opacity={1 - swap} k={k} />
        <RouteLine points={B} color="#0f9d58" casing="#fff" width={12} progress={tw(t, tSwap + 0.2, 1.3)} k={k} />
        <Dot at={START} color="#fff" ring={C.navBlue} k={k} />
        <Dot at={END} color="#ea4335" k={k} r={13} />
        <Pin at={[stairs.x, stairs.y]} color={C.red} label="1" appear={tw(t, tSwap, 0.4, POP)} k={k} />
        <Pin at={[steep.x, steep.y]} color={C.orange} label="2" appear={tw(t, tSwap + 1.1, 0.4, POP)} k={k} />
      </RouteMap>
      <NavCard strike={swap}>
        <div style={{ opacity: tw(t, tSwap + 0.4, 0.5), marginTop: 18, paddingTop: 18, borderTop: "1px solid #e5e7eb", fontFamily: FONT }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.16em", color: "#6b7280" }}>CHECKED BY TANDEM</div>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.03em", color: "#0f9d58", lineHeight: 1.15 }}>9.5 min</div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f7a45", background: "#e3f5ea", borderRadius: 20, padding: "5px 14px" }}>No staircase</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#a45200", background: "#fdeedd", borderRadius: 20, padding: "5px 14px" }}>Steep climb ahead</div>
          </div>
        </div>
      </NavCard>
      <AbsoluteFill style={{ opacity: tw(t, tDark, 0.6), background: C.bg }}>
        <Glow />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Wordmark t={t} at={tMark} size={170} />
          <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 500, color: C.soft, marginTop: 30, opacity: tw(t, tTag, 0.6), translate: `0px ${(1 - tw(t, tTag, 0.6)) * 16}px` }}>It walks the route before you do.</div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Scene>
  );
};
