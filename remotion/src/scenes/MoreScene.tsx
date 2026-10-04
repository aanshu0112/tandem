import React from "react";
import { Scene } from "../components/Scene";
import { C, FONT } from "../constants";
import { clipAt, POP, tw, useT, wordAt } from "../lib";
import { Glow } from "./TurnScene";

const S = "more";

// Features that don't get their own scene. Each tile lands when the narration reaches it.
const TILES: { title: string; body: string; cue: () => number }[] = [
  { title: "A trip page", body: "Every problem, photo and route comparison, at one link.", cue: () => wordAt(S, "page") - 0.4 },
  { title: "Stroller mode", body: "The same scout, tuned for wheels of a different kind.", cue: () => wordAt(S, "stroller") - 0.3 },
  { title: "Drop a pin", body: "Share your location and Tandem starts from there.", cue: () => wordAt(S, "pin") - 0.3 },
  { title: "It remembers you", body: "Say how you get around once. It won't ask again.", cue: () => wordAt(S, "remembers") - 0.3 },
  { title: "Open late", body: "At night, it points out places still open on the way.", cue: () => wordAt(S, "open") - 0.3 },
  { title: "Honest gaps", body: "If it couldn't see a stretch, it says so.", cue: () => wordAt(S, "couldnt") - 0.4 },
];

export const MoreScene: React.FC = () => {
  const t = useT();
  return (
    <Scene id={S}>
      <Glow />
      <div style={{ position: "absolute", left: 110, top: 86, fontFamily: FONT, fontSize: 76, fontWeight: 800, letterSpacing: "-0.02em", color: C.text, opacity: tw(t, clipAt(S, 0) - 0.3, 0.5) }}>
        And there&apos;s <span style={{ color: C.accent }}>more</span>.
      </div>
      <div style={{ position: "absolute", left: 110, top: 240, width: 1700, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
        {TILES.map((tile, i) => {
          const a = tw(t, tile.cue(), 0.45, POP);
          return (
            <div key={tile.title} style={{ height: 300, boxSizing: "border-box", background: C.card, border: `1px solid ${C.line2}`, borderRadius: 24, padding: "34px 36px", opacity: Math.min(1, a * 1.6), scale: String(0.9 + 0.1 * a) }}>
              <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: C.accent, letterSpacing: "0.16em" }}>0{i + 1}</div>
              <div style={{ fontFamily: FONT, fontSize: 50, fontWeight: 800, color: C.text, marginTop: 12, letterSpacing: "-0.01em" }}>{tile.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 29, fontWeight: 500, color: C.soft, marginTop: 14, lineHeight: 1.3 }}>{tile.body}</div>
            </div>
          );
        })}
      </div>
    </Scene>
  );
};
