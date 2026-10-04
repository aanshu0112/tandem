import React from "react";
import { AbsoluteFill } from "remotion";
import { Bubble, Phone, Typing } from "../components/Phone";
import { RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C } from "../constants";
import { fitView, POP, tw, useT } from "../lib";
import { A, ALL, B } from "../route";
import { TIMING } from "../timing";
import { Glow, REQUEST_TEXT } from "./TurnScene";

const S = "request";

export const RequestScene: React.FC = () => {
  const t = useT();
  const dur = TIMING[S].duration;
  const tSend = 0.7;
  const tTap = 1.9;
  const tTyping = 2.5;
  const tReply = 3.5;
  const tOut = dur - 1.5;
  const out = tw(t, tOut, 0.9);
  const view = fitView(ALL, 1920, 1080, 200);

  return (
    <Scene id={S}>
      <Glow />
      <AbsoluteFill style={{ opacity: out * 0.9 }}>
        <RouteMap w={1920} h={1080} view={view} theme="dark">
          <RouteLine points={A} color={C.accent} width={9} progress={tw(t, tOut + 0.1, 1.2)} k={view.scale} />
          <RouteLine points={B} color={C.purple} width={9} progress={tw(t, tOut + 0.3, 1.2)} k={view.scale} />
        </RouteMap>
      </AbsoluteFill>
      <Phone
        scale={1.6}
        input={t < tSend ? REQUEST_TEXT : undefined}
        style={{ position: "absolute", left: (1920 - 672) / 2 - out * 120, top: -410, opacity: 1 - out, scale: String(1 - 0.12 * out) }}
      >
        <Bubble from="me" appear={tw(t, tSend, 0.3)} tapback={tw(t, tTap, 0.35, POP)}>
          {REQUEST_TEXT}
        </Bubble>
        {t >= tSend + 0.3 && t < tTyping ? <div style={{ alignSelf: "flex-end", color: "#8a8f9c", fontSize: 12, marginTop: -4 }}>Delivered</div> : null}
        {t >= tTyping && t < tReply ? <Typing t={t} /> : null}
        <Bubble from="them" appear={tw(t, tReply, 0.3)}>
          Walking it for you now, give me a minute 🚶
        </Bubble>
      </Phone>
    </Scene>
  );
};
