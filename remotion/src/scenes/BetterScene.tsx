import React from "react";
import { interpolate } from "remotion";
import { Dot, Pin, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FONT } from "../constants";
import { ROUTES } from "../data";
import { clamp, fitView, pointAt, POP, tw, useT, wordAt } from "../lib";
import { A, ALL, B, END, START, cracked, stairs, steep } from "../route";
import { TIMING } from "../timing";

const S = "better";
const MW = 1090;
const MH = 850;

const Chip: React.FC<{ color: string; children: React.ReactNode; scale?: number; opacity?: number }> = ({ color, children, scale = 1, opacity = 1 }) => (
  <div style={{ fontFamily: FONT, fontSize: 25, fontWeight: 700, color, border: `2px solid ${color}`, borderRadius: 30, padding: "7px 18px", scale: String(scale), opacity, whiteSpace: "nowrap" }}>{children}</div>
);

const RouteCard: React.FC<{ top: number; height: number; name: string; minutes: number; color: string; appear: number; pop: number; dim?: number; badge?: number; children?: React.ReactNode }> = ({ top, height, name, minutes, color, appear, pop, dim = 0, badge = 0, children }) => (
  <div style={{ position: "absolute", left: 1210, top, width: 640, height, boxSizing: "border-box", background: C.card, border: `2px solid ${badge > 0.5 ? C.green : C.line2}`, borderRadius: 24, padding: "24px 30px", opacity: appear * (1 - 0.6 * dim), translate: `${(1 - appear) * 50}px 0px`, scale: String(1 - 0.04 * dim), transformOrigin: "100% 50%" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: color }} />
      <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 700, letterSpacing: "0.16em", color: C.muted }}>{name}</div>
      <div style={{ flex: 1 }} />
      {badge > 0 ? <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, letterSpacing: "0.1em", color: C.bg, background: C.green, borderRadius: 8, padding: "5px 12px", scale: String(badge) }}>RECOMMENDED</div> : null}
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
      <div style={{ fontFamily: FONT, fontSize: 132, fontWeight: 800, letterSpacing: "-0.03em", color: C.text, lineHeight: 1.1, scale: String(1 + 0.1 * pop), transformOrigin: "0% 70%" }}>{minutes}</div>
      <div style={{ fontFamily: FONT, fontSize: 36, fontWeight: 600, color: C.soft }}>min</div>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>{children}</div>
  </div>
);

export const BetterScene: React.FC = () => {
  const t = useT();
  const tA = wordAt(S, "direct") - 0.3;
  const tA94 = wordAt(S, "nine");
  const tStairs = wordAt(S, "stairs") - 0.25;
  const tB = wordAt(S, "alternative") - 0.3;
  const tB95 = wordAt(S, "nine", 1);
  const tAvoid = wordAt(S, "avoids");
  const tSteep = wordAt(S, "steep");
  const view = fitView(ALL, MW, MH, 110);
  const k = view.scale;
  const pick = tw(t, tAvoid, 0.7);
  const popAt = (at: number) => tw(t, at, 0.2, POP) - tw(t, at + 0.35, 0.4);
  const warn = popAt(tSteep);
  const hot = tw(t, tStairs, 0.4);
  const walker = pointAt(B, interpolate(t, [tAvoid + 0.3, TIMING[S].duration], [0, 1], clamp));

  return (
    <Scene id={S}>
      <RouteMap w={MW} h={MH} view={view} theme="dark" style={{ position: "absolute", left: 70, top: 56, borderRadius: 24, border: `1px solid ${C.line2}` }}>
        <RouteLine points={A} color={hot > 0.5 ? C.red : C.accent} width={9} opacity={1 - 0.72 * pick} progress={tw(t, tA, 1.1)} k={k} />
        <RouteLine points={B} color={pick > 0.5 ? C.green : C.purple} width={9 + 4 * pick} progress={tw(t, tB, 1.1)} k={k} />
        <Dot at={START} color={C.bg} ring={C.text} k={k} r={9} />
        <Dot at={END} color={C.text} ring={C.bg} k={k} r={10} />
        <Pin at={[steep.x, steep.y]} color={C.orange} label="2" appear={tw(t, tB + 0.7, 0.4, POP)} pulse={(t - tSteep) / 0.9} k={k} />
        <Pin at={[cracked.x, cracked.y]} color={C.yellow} label="3" appear={tw(t, tB + 0.9, 0.4, POP)} k={k} />
        <Pin at={[stairs.x, stairs.y]} color={C.red} label="1" appear={tw(t, tStairs, 0.4, POP)} pulse={(t - tStairs) / 0.9} k={k} size={25} />
        {t > tAvoid + 0.3 ? <Dot at={walker} color={C.green} k={k} r={12} /> : null}
      </RouteMap>
      <RouteCard top={56} height={360} name="ROUTE A" minutes={ROUTES.A.durationMin} color={hot > 0.5 ? C.red : C.accent} appear={tw(t, tA, 0.5)} pop={popAt(tA94)} dim={pick}>
        <Chip color={C.red} scale={tw(t, tStairs, 0.35, POP)}>
          14 steps, no ramp
        </Chip>
      </RouteCard>
      <RouteCard top={446} height={460} name="ROUTE B" minutes={ROUTES.B.durationMin} color={pick > 0.5 ? C.green : C.purple} appear={tw(t, tB, 0.5)} pop={popAt(tB95)} badge={tw(t, tAvoid + 0.25, 0.35, POP)}>
        <Chip color={C.green} scale={tw(t, tAvoid, 0.35, POP)}>
          Avoids the staircase
        </Chip>
        <Chip color={C.orange} scale={1 + 0.1 * warn}>
          Steep climb ahead
        </Chip>
        <Chip color={C.yellow}>Cracked path</Chip>
      </RouteCard>
    </Scene>
  );
};
