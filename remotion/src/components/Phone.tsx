import React from "react";
import { C, FONT } from "../constants";

// iPhone mockup with an iMessage thread to Tandem. 420×860 before `scale`.
export const Phone: React.FC<{ children?: React.ReactNode; scale?: number; input?: React.ReactNode; style?: React.CSSProperties }> = ({ children, scale = 1, input, style }) => (
  <div style={{ width: 420 * scale, height: 860 * scale, ...style }}>
    <div
      style={{
        width: 420,
        height: 860,
        transform: `scale(${scale})`,
        transformOrigin: "0 0",
        borderRadius: 64,
        background: "#000",
        border: "3px solid #2a3040",
        boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px #000",
        padding: 12,
        fontFamily: FONT,
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, overflow: "hidden", background: "#000", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", top: 12, left: "50%", marginLeft: -55, width: 110, height: 30, borderRadius: 16, background: "#000", border: "1px solid #15181f", zIndex: 2 }} />
        <div style={{ paddingTop: 56, paddingBottom: 10, background: "#12151b", borderBottom: "1px solid #1f232c", textAlign: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, margin: "0 auto", background: `linear-gradient(160deg, ${C.accent}, #2a6fd6)`, color: "#04121f", fontWeight: 900, fontSize: 22, lineHeight: "46px" }}>T</div>
          <div style={{ color: "#fff", fontSize: 14, marginTop: 5, fontWeight: 500 }}>Tandem</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, padding: "12px 14px", overflow: "hidden" }}>{children}</div>
        <div style={{ padding: "8px 14px 26px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: "#1c1f27", color: "#8a8f9c", fontSize: 24, lineHeight: "30px", textAlign: "center" }}>+</div>
          <div style={{ flex: 1, minHeight: 36, borderRadius: 18, border: "1px solid #2a2e38", color: "#fff", fontSize: 16, lineHeight: 1.3, padding: "7px 14px", boxSizing: "border-box" }}>
            {input ?? <span style={{ color: "#5b606c" }}>iMessage</span>}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// `appear` is 0→1. Bubbles that haven't appeared aren't laid out, so new ones push the thread up.
export const Bubble: React.FC<{ from: "me" | "them"; appear: number; children: React.ReactNode; tapback?: number; wide?: boolean }> = ({ from, appear, children, tapback = 0, wide }) => {
  if (appear <= 0) return null;
  const me = from === "me";
  return (
    <div style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: wide ? "86%" : "78%", position: "relative", opacity: appear, translate: `0px ${(1 - appear) * 22}px`, scale: String(0.9 + 0.1 * appear), transformOrigin: me ? "100% 100%" : "0% 100%", marginTop: tapback > 0 ? 18 : 0 }}>
      <div style={{ background: me ? C.imessage : "#262a33", color: "#fff", fontSize: 17, lineHeight: 1.3, padding: "9px 14px", borderRadius: 20, overflow: "hidden" }}>{children}</div>
      {tapback > 0 ? (
        <div style={{ position: "absolute", top: -20, left: -12, width: 36, height: 36, borderRadius: 18, background: "#262a33", border: "2px solid #000", fontSize: 18, lineHeight: "34px", textAlign: "center", scale: String(tapback) }}>👍</div>
      ) : null}
    </div>
  );
};

export const Typing: React.FC<{ t: number }> = ({ t }) => (
  <div style={{ alignSelf: "flex-start", background: "#262a33", borderRadius: 20, padding: "13px 15px", display: "flex", gap: 5 }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ width: 9, height: 9, borderRadius: 5, background: "#9aa0ad", opacity: 0.4 + 0.6 * Math.max(0, Math.sin(t * 7 - i * 0.9)) }} />
    ))}
  </div>
);
