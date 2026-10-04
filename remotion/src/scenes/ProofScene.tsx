import React from "react";
import { Img, staticFile } from "remotion";
import { Photo } from "../components/Photo";
import { Scene } from "../components/Scene";
import { C, FONT, FRAMES, MONO } from "../constants";
import { clipAt, tw, useT, wordAt } from "../lib";
import { stairs } from "../route";
import { TIMING } from "../timing";
import { Glow } from "./TurnScene";

const S = "proof";
const FLY = [FRAMES.lot, FRAMES.crossing, FRAMES.fork, FRAMES.path, FRAMES.steep, FRAMES.cracked, FRAMES.quad];

const Card: React.FC<{ left: number; width: number; label: string; appear: number; children: React.ReactNode }> = ({ left, width, label, appear, children }) => (
  <div style={{ position: "absolute", left, top: 236, width, height: 640, boxSizing: "border-box", background: C.card, border: `1px solid ${C.line2}`, borderRadius: 24, padding: 22, opacity: appear, translate: `0px ${(1 - appear) * 40}px` }}>
    <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, letterSpacing: "0.16em", color: C.muted, marginBottom: 16 }}>{label}</div>
    {children}
  </div>
);

export const ProofScene: React.FC = () => {
  const t = useT();
  const tPhoto = wordAt(S, "photo");
  const tTaken = wordAt(S, "taken") - 0.5;
  const tPreview = wordAt(S, "preview") - 0.2;
  const fly = Math.max(0, t - tPreview) / 0.42;
  const i = Math.floor(fly) % FLY.length;

  return (
    <Scene id={S}>
      <Glow />
      <div style={{ position: "absolute", left: 110, top: 96, fontFamily: FONT, fontSize: 76, fontWeight: 800, color: C.text, letterSpacing: "-0.02em", opacity: tw(t, clipAt(S, 0) - 0.2, 0.5) }}>
        Every flag comes with its <span style={{ color: C.accent }}>evidence</span>.
      </div>
      <Card left={110} width={584} label="THE PHOTO IT FLAGGED" appear={tw(t, tPhoto - 0.15, 0.5)}>
        <Photo src={FRAMES.stairs} size={540} box={stairs.box} draw={tw(t, tPhoto + 0.35, 0.4)} label="14 STEPS" />
      </Card>
      <Card left={724} width={420} label="WHEN IT WAS TAKEN" appear={tw(t, tTaken, 0.5)}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: 540 }}>
          <div style={{ fontFamily: MONO, fontSize: 104, fontWeight: 700, color: C.text, lineHeight: 1 }}>Jul</div>
          <div style={{ fontFamily: MONO, fontSize: 104, fontWeight: 700, color: C.accent, lineHeight: 1.1 }}>2009</div>
          <div style={{ fontFamily: FONT, fontSize: 26, color: C.soft, marginTop: 26, lineHeight: 1.35 }}>
            Street View capture date,
            <br />
            shown so you can judge it.
          </div>
        </div>
      </Card>
      <Card left={1174} width={636} label="A PREVIEW OF THE WALK" appear={tw(t, tPreview, 0.5)}>
        <div style={{ position: "relative", width: 592, height: 500, borderRadius: 16, overflow: "hidden" }}>
          {FLY.map((f, n) => (
            <Img key={f} src={staticFile(f)} style={{ position: "absolute", inset: 0, width: 592, height: 500, objectFit: "cover", opacity: n === i ? 1 : 0, scale: String(1 + 0.06 * (fly % 1)) }} />
          ))}
        </div>
        <div style={{ height: 8, borderRadius: 4, background: C.line, marginTop: 20 }}>
          <div style={{ height: 8, borderRadius: 4, background: C.accent, width: `${Math.min(1, (t - tPreview) / (TIMING[S].duration - tPreview)) * 100}%` }} />
        </div>
      </Card>
    </Scene>
  );
};
