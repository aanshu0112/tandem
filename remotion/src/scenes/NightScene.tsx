import React from "react";
import { Dot, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FONT } from "../constants";
import { MAP } from "../data";
import { NIGHT, PHONES, PHONES_ON_ROUTE } from "../extras";
import { clipAt, fitView, POP, toD, tw, useT, wordAt } from "../lib";

const BLUE = "#3d8bff"; // the dashboard's blue-light phone colour
import { ALL, END, START } from "../route";

const S = "night";
const VIOLET = "#8b80ff"; // the dashboard's night-mode colour
const TONE: Record<string, string> = { lit: C.yellow, unlit: VIOLET, unknown: "#6f7c98" };

const Stat: React.FC<{ name: string; pct: number; appear: number; pop: number }> = ({ name, pct, appear, pop }) => (
  <div style={{ background: "rgba(13,16,38,0.92)", border: `1px solid ${VIOLET}55`, borderRadius: 22, padding: "20px 28px", marginTop: 18, opacity: appear, translate: `${(appear - 1) * 40}px 0px` }}>
    <div style={{ fontFamily: FONT, fontSize: 21, fontWeight: 700, letterSpacing: "0.16em", color: "#b9b3e6" }}>{name}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <div style={{ fontFamily: FONT, fontSize: 110, fontWeight: 800, letterSpacing: "-0.03em", color: C.yellow, lineHeight: 1.1, scale: String(1 + 0.1 * pop), transformOrigin: "0% 70%" }}>{pct}%</div>
      <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, color: "#ddd8ff" }}>mapped as lit</div>
    </div>
    <div style={{ height: 10, borderRadius: 5, background: "#23264a", marginTop: 6 }}>
      <div style={{ height: 10, borderRadius: 5, background: C.yellow, width: `${pct * appear}%` }} />
    </div>
  </div>
);

export const NightScene: React.FC = () => {
  const t = useT();
  const tTitle = clipAt(S, 0) - 0.3;
  const tLights = wordAt(S, "street") - 0.3;
  const tA = clipAt(S, 2);
  const tB = clipAt(S, 3);
  const tPhones = wordAt(S, "bluelight") - 0.4;
  // Start on the two routes, then pull back to take in the blue-light phones north of the Arts Quad
  const near = fitView(ALL, 1920, 1080, 190);
  const far = fitView([...ALL, ...PHONES], 1920, 1080, 110);
  const z = tw(t, tPhones, 1.4);
  const mix = (a: number, b: number) => a + (b - a) * z;
  const scale = mix(near.scale, far.scale);
  const view = { x: mix(near.x, far.x) - 300 / scale, y: mix(near.y, far.y), scale };
  const k = view.scale;
  const lights = tw(t, tLights, 1.4);
  const popAt = (at: number) => tw(t, at, 0.2, POP) - tw(t, at + 0.35, 0.4);

  return (
    <Scene id={S}>
      <RouteMap w={1920} h={1080} view={view} theme="dark">
        <rect x={0} y={0} width={MAP.w} height={MAP.h} fill="#0a0626" opacity={0.55} />
        {(["A", "B"] as const).map((id) =>
          NIGHT[id].segments.map((seg, i) => {
            const on = seg.light === "lit";
            return (
              <g key={`${id}${i}`} opacity={on ? lights : 0.55 + 0.4 * lights}>
                {on ? <path d={toD(seg.points)} fill="none" stroke={C.yellow} strokeOpacity={0.28} strokeWidth={26 / k} strokeLinecap="round" strokeLinejoin="round" /> : null}
                <path d={toD(seg.points)} fill="none" stroke={lights > 0.05 ? TONE[seg.light] : "#5d6a85"} strokeWidth={(on ? 9 : 7) / k} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          }),
        )}
        <Dot at={START} color={C.bg} ring={C.text} k={k} r={9} />
        <Dot at={END} color={C.text} ring={C.bg} k={k} r={10} />
        {PHONES.map((p, i) => {
          const a = tw(t, tPhones + 0.5 + i * 0.2, 0.4, POP);
          return (
            <g key={i} opacity={Math.min(1, a * 2)}>
              <circle cx={p[0]} cy={p[1]} r={(30 + 6 * Math.sin(t * 4 + i)) / k} fill={BLUE} opacity={0.25} />
              <circle cx={p[0]} cy={p[1]} r={(13 * a) / k} fill={BLUE} stroke="#fff" strokeWidth={3 / k} />
              <text x={p[0] + 24 / k} y={p[1]} dominantBaseline="central" fontFamily={FONT} fontWeight={700} fontSize={22 / k} fill="#cfe1ff">
                Blue-light phone
              </text>
            </g>
          );
        })}
      </RouteMap>
      <div style={{ position: "absolute", left: 90, top: 80, width: 600 }}>
        <div style={{ opacity: tw(t, tTitle, 0.5), translate: `0px ${(1 - tw(t, tTitle, 0.5)) * 20}px` }}>
          <div style={{ display: "inline-block", fontFamily: FONT, fontSize: 24, fontWeight: 700, color: "#ddd8ff", background: "rgba(139,128,255,0.15)", border: "1px solid rgba(139,128,255,0.5)", borderRadius: 30, padding: "8px 20px" }}>🌙 Walking alone at night</div>
          <div style={{ fontFamily: FONT, fontSize: 84, fontWeight: 800, letterSpacing: "-0.02em", color: C.text, marginTop: 16, lineHeight: 1.05 }}>Night mode</div>
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 22, fontFamily: FONT, fontSize: 23, fontWeight: 600, color: C.soft, opacity: tw(t, tLights + 0.3, 0.5) }}>
          {[
            ["lit", "Street lights"],
            ["unlit", "No lights"],
            ["unknown", "Not mapped"],
          ].map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 26, height: 7, borderRadius: 4, background: TONE[key] }} />
              {label}
            </div>
          ))}
        </div>
        <Stat name="GOOGLE MAPS' ROUTE" pct={NIGHT.A.litPct} appear={tw(t, tA, 0.5)} pop={popAt(wordAt(S, "two"))} />
        <Stat name="THE ALTERNATIVE" pct={NIGHT.B.litPct} appear={tw(t, tB, 0.5)} pop={popAt(tB + 0.7)} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: FONT, fontSize: 23, fontWeight: 600, color: "#cfe1ff", marginTop: 18, opacity: tw(t, tPhones + 0.8, 0.5) }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: BLUE, boxShadow: `0 0 14px ${BLUE}` }} />
          {PHONES.length} blue-light phones mapped nearby, {PHONES_ON_ROUTE || "none"} on these routes
        </div>
      </div>
    </Scene>
  );
};
