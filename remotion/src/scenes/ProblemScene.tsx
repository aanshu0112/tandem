import React from "react";
import { interpolate } from "remotion";
import { NavCard } from "../components/NavCard";
import { Dot, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FONT } from "../constants";
import { MAP } from "../data";
import { clamp, OUT, pointAt, POP, tw, useT, wordAt } from "../lib";
import { A, END, START, cracked, stairs, stairsFrac, steep } from "../route";
import { TIMING } from "../timing";
import { navView } from "./HookScene";

const S = "problem";

// A red barrier marker with a label, in map space.
const Barrier: React.FC<{ x: number; y: number; label: string; appear: number; k: number; side: "left" | "right" }> = ({ x, y, label, appear, k, side }) => {
  if (appear <= 0) return null;
  const r = 20 / k;
  const fs = 27 / k;
  const w = (label.length * 15.5 + 34) / k;
  const h = 46 / k;
  const lx = side === "right" ? r + 10 / k : -r - 10 / k - w;
  return (
    <g transform={`translate(${x} ${y}) scale(${appear})`} opacity={Math.min(1, appear * 1.6)}>
      <rect x={lx} y={-h / 2} width={w} height={h} rx={h / 2} fill="#fff" stroke={C.red} strokeWidth={3 / k} />
      <text x={lx + w / 2} y={1 / k} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontWeight={700} fontSize={fs} fill="#b3122a">
        {label}
      </text>
      <circle r={r} fill={C.red} stroke="#fff" strokeWidth={4 / k} />
      <text textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontWeight={900} fontSize={r * 1.25} fill="#fff">
        !
      </text>
    </g>
  );
};

export const ProblemScene: React.FC = () => {
  const t = useT();
  const dur = TIMING[S].duration;
  const tStairs = wordAt(S, "still");
  const tSteep = wordAt(S, "unusable");
  const tUneven = wordAt(S, "person");
  const tThere = wordAt(S, "already");
  const base = navView(1.03);
  const zoom = interpolate(t, [0, dur], [1, 1.12], { ...clamp, easing: OUT });
  const view = { x: base.x + (zoom - 1) * 500, y: base.y, scale: base.scale * zoom };
  const k = view.scale;
  const brk = tw(t, tStairs, 0.5);
  const walker = pointAt(A, interpolate(t, [0.5, tThere + 0.5], [0, stairsFrac - 0.035], clamp));
  const stuck = tw(t, tThere + 0.5, 0.4);
  const ring = ((t - tThere - 0.5) * 1.1) % 1;

  return (
    <Scene id={S}>
      <RouteMap w={1920} h={1080} view={view} theme="light">
        <rect x={0} y={0} width={MAP.w} height={MAP.h} fill="#0b1220" opacity={0.42 * tw(t, tStairs, 1.5)} />
        <RouteLine points={A} color="#9aa3b2" dashed width={9} opacity={brk} k={k} />
        <RouteLine points={A} color={C.navBlue} casing="#fff" width={11} opacity={1 - brk} k={k} />
        <RouteLine points={A} color={C.navBlue} casing="#fff" width={11} progress={stairsFrac} opacity={brk} k={k} />
        <Dot at={START} color="#fff" ring={C.navBlue} k={k} />
        <Dot at={END} color="#ea4335" k={k} r={13} />
        <Barrier x={steep.x} y={steep.y} label="Steep grade" appear={tw(t, tSteep, 0.4, POP)} k={k} side="left" />
        <Barrier x={cracked.x} y={cracked.y} label="Uneven path" appear={tw(t, tUneven, 0.4, POP)} k={k} side="left" />
        <Barrier x={stairs.x} y={stairs.y} label="Stairs" appear={tw(t, tStairs, 0.4, POP)} k={k} side="right" />
        {stuck > 0 && t > tThere + 0.5 ? <circle cx={walker[0]} cy={walker[1]} r={(16 + ring * 46) / k} fill="none" stroke={C.red} strokeWidth={4 / k} opacity={(1 - ring) * stuck} /> : null}
        <Dot at={walker} color={C.navBlue} k={k} r={15} />
      </RouteMap>
      <NavCard strike={tw(t, tSteep, 0.45)}>
        <div style={{ marginTop: 14, fontSize: 28, fontWeight: 700, color: "#c5221f", opacity: tw(t, tThere + 0.4, 0.4), height: 34 }}>Stairs ahead. No way through.</div>
      </NavCard>
    </Scene>
  );
};
