import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { NavCard } from "../components/NavCard";
import { Photo } from "../components/Photo";
import { Dot, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FRAMES, MONO } from "../constants";
import { clipAt, fitView, POP, tw, useT, wordAt } from "../lib";
import { A, END, START, stairs } from "../route";
import { TIMING } from "../timing";

const S = "hook";

export const navView = (zoom = 1) => {
  const v = fitView(A, 1920, 1080, 170);
  return { x: v.x - 270 / v.scale, y: v.y, scale: v.scale * zoom };
};

export const HookScene: React.FC = () => {
  const t = useT();
  const cut = clipAt(S, 1) - 0.25;
  const boxAt = wordAt(S, "fourteen") - 0.05;
  const view = navView(1 + 0.03 * (t / cut));
  const k = view.scale;
  const nine = wordAt(S, "nine");
  const pulse = tw(t, nine, 0.25, POP) - tw(t, nine + 0.3, 0.4);
  const push = (t - cut) / (TIMING[S].duration - cut);

  return (
    <Scene id={S}>
      {t < cut ? (
        <AbsoluteFill>
          <RouteMap w={1920} h={1080} view={view} theme="light">
            <RouteLine points={A} color={C.navBlue} casing="#fff" width={11} progress={tw(t, 0.5, 1.3)} k={k} />
            <Dot at={START} color="#fff" ring={C.navBlue} k={k} />
            <Dot at={END} color="#ea4335" k={k} r={13} opacity={tw(t, 1.5, 0.3)} />
          </RouteMap>
          <NavCard minutesScale={1 + 0.07 * pulse} style={{ opacity: tw(t, 0.2, 0.5), translate: `0px ${(1 - tw(t, 0.2, 0.6)) * 30}px` }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: "#000" }}>
          <Img src={staticFile(FRAMES.stairs)} style={{ position: "absolute", inset: -80, width: 2080, height: 1240, objectFit: "cover", filter: "blur(50px) brightness(0.4)" }} />
          <div style={{ position: "absolute", left: (1920 - 820) / 2, top: 80, scale: String(1 + 0.045 * push) }}>
            <Photo src={FRAMES.stairs} size={820} radius={22} box={stairs.box} draw={tw(t, boxAt, 0.4)} label="14 STEPS" style={{ boxShadow: "0 30px 100px rgba(0,0,0,0.7)" }}>
              <div style={{ position: "absolute", left: 18, top: 18, fontFamily: MONO, fontSize: 19, color: "#fff", background: "rgba(5,8,15,0.7)", padding: "6px 12px", borderRadius: 8 }}>Libe Slope · Street View, Jul 2009</div>
            </Photo>
          </div>
        </AbsoluteFill>
      )}
    </Scene>
  );
};
