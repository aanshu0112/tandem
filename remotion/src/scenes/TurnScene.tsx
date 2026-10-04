import React from "react";
import { AbsoluteFill } from "remotion";
import { Phone } from "../components/Phone";
import { Scene } from "../components/Scene";
import { Wordmark } from "../components/Wordmark";
import { C, FONT } from "../constants";
import { clipAt, POP, tw, useT, wordAt } from "../lib";

const S = "turn";
export const REQUEST_TEXT = "Noyes to Goldwin Smith. I use a wheelchair.";

export const Glow: React.FC = () => <AbsoluteFill style={{ background: `radial-gradient(1100px 700px at 50% 42%, #10203c 0%, ${C.bg} 70%)` }} />;

export const TurnScene: React.FC = () => {
  const t = useT();
  const tMark = clipAt(S, 0) - 0.45;
  const tWalks = wordAt(S, "walks");
  const tAccess = wordAt(S, "accessibility");
  const tNo = clipAt(S, 1);
  const tText = wordAt(S, "text");
  const shift = tw(t, tNo - 0.1, 0.8);
  const typed = REQUEST_TEXT.slice(0, Math.round(tw(t, tText, 1.3, (n) => n) * REQUEST_TEXT.length));

  return (
    <Scene id={S}>
      <Glow />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 960, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", translate: `${-330 * shift}px 0px` }}>
        <Wordmark t={t} at={tMark} size={150} />
        <div style={{ fontFamily: FONT, fontSize: 50, fontWeight: 500, color: C.soft, marginTop: 26, opacity: tw(t, tWalks - 0.25, 0.5) }}>
          It{" "}
          <span style={{ color: C.text, fontWeight: 700, backgroundImage: `linear-gradient(${C.accent}, ${C.accent})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 92%", backgroundSize: `${tw(t, tWalks, 0.55) * 100}% 0.14em`, paddingBottom: 6 }}>walks the route</span>{" "}
          before you do.
        </div>
        <div style={{ height: 150, marginTop: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.green, border: `2px solid ${C.line2}`, background: C.card, borderRadius: 40, padding: "12px 30px", scale: String(tw(t, tAccess, 0.4, POP)), opacity: tw(t, tAccess, 0.2) }}>
            Checked for accessibility barriers
          </div>
          <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.accent, border: `2px solid ${C.line2}`, background: C.card, borderRadius: 40, padding: "12px 30px", scale: String(tw(t, tNo, 0.4, POP)), opacity: tw(t, tNo, 0.2) }}>
            No new app. Just a text.
          </div>
        </div>
      </div>
      <Phone scale={0.98} style={{ position: "absolute", left: 1330, top: 70 + (1 - shift) * 1050 }} input={typed ? typed : undefined} />
    </Scene>
  );
};
