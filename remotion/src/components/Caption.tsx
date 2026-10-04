import React from "react";
import { C, FONT } from "../constants";
import { tw, useT } from "../lib";
import { TIMING } from "../timing";

// Plain sentence captions. Emphasis lives in the scenes, not here.
export const Caption: React.FC<{ scene: string }> = ({ scene }) => {
  const t = useT();
  const cap = TIMING[scene].captions.find((c) => t >= c.s - 0.08 && t <= c.e + 0.3);
  if (!cap) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 32,
          fontWeight: 500,
          color: C.text,
          background: "rgba(5,8,15,0.78)",
          padding: "10px 24px",
          borderRadius: 12,
          opacity: tw(t, cap.s - 0.08, 0.15),
        }}
      >
        {cap.text}
      </div>
    </div>
  );
};
