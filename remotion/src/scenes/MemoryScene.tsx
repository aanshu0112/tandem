import React from "react";
import { Phone, Typing } from "../components/Phone";
import { Dot, Pin, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FONT } from "../constants";
import { clipAt, fitView, pointAt, POP, tw, useT, wordAt } from "../lib";
import { A, ALL, B, stairs, stairsFrac, steep } from "../route";
import { Glow } from "./TurnScene";

const S = "memory";
const PX = 800;
const PW = 1040;

// An example report, placed a little past the stairs on the direct route.
const REPORT = pointAt(A, stairsFrac + 0.09);

const bubble = (s: string, me: boolean, a: number) =>
  a > 0 ? (
    <div style={{ alignSelf: me ? "flex-end" : "flex-start", background: me ? C.imessage : "#262a33", color: "#fff", fontSize: 16, lineHeight: "21px", padding: "9px 13px", borderRadius: 19, maxWidth: 290, opacity: a, translate: `0px ${(1 - a) * 18}px` }}>{s}</div>
  ) : null;

export const MemoryScene: React.FC = () => {
  const t = useT();
  const tTell = wordAt(S, "tell") - 0.2;
  const tTyping = tTell + 1.0;
  const tThanks = tTell + 1.9;
  const tMap = clipAt(S, 1) - 0.3;
  const tPin = wordAt(S, "report");
  const view = fitView(ALL, PW, 640, 120);
  const k = view.scale;
  const reported = t >= tPin;
  const stats: [number, string][] = [
    [reported ? 3 : 2, "barriers"],
    [1, "scout"],
    [reported ? 1 : 0, reported ? "user report" : "user reports"],
  ];

  return (
    <Scene id={S}>
      <Glow />
      <Phone scale={1.5} style={{ position: "absolute", left: 110, top: -345 }}>
        {bubble("Here's the walk before you take it 🎬", false, 1)}
        {bubble("made it! the path just past the Libe Slope steps is all torn up", true, tw(t, tTell, 0.3))}
        {t >= tTyping && t < tThanks ? <Typing t={t} /> : null}
        {bubble("Thanks, added it. That helps the next person 🙏", false, tw(t, tThanks, 0.3))}
      </Phone>

      <div style={{ position: "absolute", left: PX, top: 50, width: PW, opacity: tw(t, tMap, 0.5), translate: `${(1 - tw(t, tMap, 0.5)) * 40}px 0px` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
          <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Campus barrier map</div>
          <div style={{ fontFamily: FONT, fontSize: 24, color: C.soft }}>
            {stats.map(([n, w], i) => (
              <span key={w}>
                {i ? <span style={{ color: C.dim }}> · </span> : null}
                <b style={{ color: C.text }}>{n}</b> {w}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, margin: "18px 0 20px", fontFamily: FONT, fontSize: 22, fontWeight: 600 }}>
          {[
            ["Stairs", C.red],
            ["Steep grade", C.orange],
            ["User reports", C.accent],
          ].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, color: C.soft, background: C.card, border: `1px solid ${C.line2}`, borderRadius: 24, padding: "7px 18px" }}>
              <div style={{ width: 13, height: 13, borderRadius: 7, background: color }} />
              {label}
            </div>
          ))}
        </div>
        <RouteMap w={PW} h={640} view={view} theme="dark" style={{ borderRadius: 24, border: `1px solid ${C.line2}` }}>
          <RouteLine points={A} color={C.dim} width={5} k={k} />
          <RouteLine points={B} color={C.dim} width={5} k={k} />
          <Pin at={[steep.x, steep.y]} color={C.orange} label="!" appear={tw(t, tMap + 0.5, 0.4, POP)} k={k} />
          <Pin at={[stairs.x, stairs.y]} color={C.red} label="!" appear={tw(t, tMap + 0.35, 0.4, POP)} k={k} size={25} />
          <Pin at={REPORT} color={C.accent} label="+" appear={tw(t, tPin, 0.45, POP)} pulse={(t - tPin) / 1.1} k={k} size={25} />
          {t < tPin ? <Dot at={REPORT} color={C.accent} k={k} r={0} opacity={0} /> : null}
        </RouteMap>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.muted, marginTop: 14 }}>The report shown here is an example.</div>
      </div>
    </Scene>
  );
};
