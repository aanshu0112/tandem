import React from "react";
import { FONT } from "../constants";
import { FROM, TO } from "../data";

// The ordinary map-app directions card: from, to, "9 min".
export const NavCard: React.FC<{ strike?: number; minutesScale?: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({ strike = 0, minutesScale = 1, children, style }) => (
  <div style={{ position: "absolute", left: 90, top: 90, width: 560, background: "#fff", borderRadius: 28, boxShadow: "0 18px 60px rgba(20,30,50,0.28)", padding: "30px 34px", fontFamily: FONT, color: "#1f2937", boxSizing: "border-box", ...style }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 25, fontWeight: 500 }}>
      <div style={{ width: 14, height: 14, borderRadius: 7, border: "4px solid #1a73e8" }} />
      {FROM}
    </div>
    <div style={{ width: 3, height: 18, background: "#c7ccd4", margin: "5px 0 5px 9px" }} />
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 25, fontWeight: 500 }}>
      <div style={{ width: 22, height: 22, borderRadius: 11, background: "#ea4335" }} />
      {TO}
    </div>
    <div style={{ height: 1, background: "#e5e7eb", margin: "24px 0 16px" }} />
    <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
      <div style={{ position: "relative", fontSize: 112, fontWeight: 800, letterSpacing: "-0.03em", color: strike > 0.5 ? "#9aa1ad" : "#188038", scale: String(minutesScale), transformOrigin: "0% 80%" }}>
        9 min
        <div style={{ position: "absolute", left: -6, top: "54%", height: 8, borderRadius: 4, background: "#ea4335", width: `${strike * 104}%` }} />
      </div>
      <div style={{ fontSize: 28, color: "#6b7280", fontWeight: 500 }}>walking</div>
    </div>
    {children}
  </div>
);
