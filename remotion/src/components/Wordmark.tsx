import React from "react";
import { C, FONT } from "../constants";
import { POP, tw } from "../lib";

// TANDEM, lettered like the dashboard header. Letters rise in from `at`.
export const Wordmark: React.FC<{ t: number; at: number; size?: number }> = ({ t, at, size = 150 }) => (
  <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: size, letterSpacing: "0.22em", color: C.text, display: "flex", marginRight: "-0.22em" }}>
    {"TANDEM".split("").map((ch, i) => {
      const a = tw(t, at + i * 0.045, 0.5, POP);
      return (
        <span key={i} style={{ display: "inline-block", opacity: Math.min(1, a * 1.5), translate: `0px ${(1 - a) * size * 0.35}px` }}>
          {ch}
        </span>
      );
    })}
  </div>
);
