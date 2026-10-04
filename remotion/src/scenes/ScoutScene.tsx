import React from "react";
import { interpolate } from "remotion";
import { Photo } from "../components/Photo";
import { Dot, Pin, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FONT, FRAMES, MONO } from "../constants";
import { ROUTES } from "../data";
import { clamp, clipAt, fitView, pointAt, POP, tw, useT, wordAt } from "../lib";
import { A, ALL, B, END, START, cracked, crackedFrac, stairs, stairsFrac, steep, steepFrac } from "../route";

const S = "scout";

// Narration cues
const tIntro = clipAt(S, 0);
const tClear = [clipAt(S, 1), clipAt(S, 2), clipAt(S, 3)];
const tThen = clipAt(S, 4);
const tFourteen = wordAt(S, "fourteen");
const tNoRamp = clipAt(S, 5);
const tRamp = wordAt(S, "ramp");
const tRelease = tRamp + 1.1;
const tAlso = clipAt(S, 6);
const tElevation = wordAt(S, "elevation");
const tShow = wordAt(S, "show");
const tTradeoffs = wordAt(S, "tradeoffs");

type Kind = "clear" | "stairs" | "steep" | "cracked";
const SHOTS: { img: string; arrive: number; verdict: number; kind: Kind }[] = [
  { img: FRAMES.lot, arrive: wordAt(S, "street") - 0.1, verdict: tClear[0], kind: "clear" },
  { img: FRAMES.crossing, arrive: tClear[0] + 0.38, verdict: tClear[1], kind: "clear" },
  { img: FRAMES.fork, arrive: tClear[1] + 0.38, verdict: tClear[2], kind: "clear" },
  { img: FRAMES.stairs, arrive: tClear[2] + 0.6, verdict: tFourteen, kind: "stairs" },
  { img: FRAMES.path, arrive: tRelease + 0.15, verdict: tRelease + 0.85, kind: "clear" },
  { img: FRAMES.steep, arrive: tAlso + 0.25, verdict: tElevation, kind: "steep" },
  { img: FRAMES.cracked, arrive: tShow, verdict: tTradeoffs, kind: "cracked" },
];
const TONE: Record<Kind, string> = { clear: C.green, stairs: C.red, steep: C.orange, cracked: C.yellow };

const W = 1740;
const H = 900;
const MAP_W = 1040;
const MAP_H = 634;

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = C.text }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
    <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, letterSpacing: "0.16em", color: C.muted }}>{label}</span>
    <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color }}>{value}</span>
  </div>
);

const Row: React.FC<{ name: string; color: string; minutes: number; progress: number; status: React.ReactNode }> = ({ name, color, minutes, progress, status }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 22, height: 62, fontFamily: FONT }}>
    <div style={{ width: 14, height: 14, borderRadius: 7, background: color }} />
    <div style={{ width: 120, fontSize: 26, fontWeight: 700, color: C.text }}>{name}</div>
    <div style={{ width: 130, fontFamily: MONO, fontSize: 24, color: C.soft }}>{minutes} min</div>
    <div style={{ width: 420, height: 10, borderRadius: 5, background: C.line }}>
      <div style={{ width: `${progress * 100}%`, height: 10, borderRadius: 5, background: color }} />
    </div>
    <div style={{ fontSize: 24, fontWeight: 600 }}>{status}</div>
  </div>
);

export const ScoutScene: React.FC = () => {
  const t = useT();
  const view = fitView(ALL, MAP_W, MAP_H, 80);
  const k = view.scale;
  const cur = SHOTS.reduce((acc, s, i) => (t >= s.arrive ? i : acc), -1);
  const shot = cur >= 0 ? SHOTS[cur] : null;
  const judged = shot ? t >= shot.verdict : false;
  const checked = SHOTS.filter((s) => t >= s.verdict).length;
  const flags = [tFourteen, tElevation, tTradeoffs].filter((x) => t >= x).length;

  // The stop: everything but the photo dims while the stairs are on screen
  const stop = tw(t, tThen - 0.1, 0.3) - tw(t, tRelease, 0.5);

  const fracA = interpolate(t, [SHOTS[0].arrive, SHOTS[1].arrive, SHOTS[2].arrive, SHOTS[3].arrive + 0.4], [0.06, stairsFrac * 0.4, stairsFrac * 0.72, stairsFrac], clamp);
  const fracB = interpolate(t, [SHOTS[4].arrive, SHOTS[5].arrive + 0.5, SHOTS[6].arrive + 0.5], [0.05, steepFrac, crackedFrac], clamp);
  const pinA = tw(t, tRamp + 0.45, 0.45, POP);

  const arrive = shot ? tw(t, shot.arrive, 0.28) : 0;
  const scanning = shot && !judged && !(shot.kind === "stairs" && t >= tThen);
  const v = shot ? tw(t, shot.verdict, 0.35, POP) : 0;

  return (
    <Scene id={S}>
      <div style={{ position: "absolute", left: (1920 - W) / 2, top: 34, width: W, height: H, borderRadius: 18, overflow: "hidden", border: `1px solid ${C.line2}`, background: C.bg, boxShadow: "0 30px 90px rgba(0,0,0,0.6)", scale: String(1 + 0.012 * (t / 22)) }}>
        {/* browser bar */}
        <div style={{ height: 44, background: "#131a29", display: "flex", alignItems: "center", gap: 9, padding: "0 18px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
          ))}
          <div style={{ marginLeft: 22, flex: 1, maxWidth: 560, height: 28, borderRadius: 14, background: C.bg2, color: C.muted, fontFamily: MONO, fontSize: 15, lineHeight: "28px", padding: "0 16px" }}>localhost:3000</div>
        </div>
        {/* dashboard header */}
        <div style={{ height: 72, display: "flex", alignItems: "center", padding: "0 28px", borderBottom: `1px solid ${C.line}`, gap: 26 }}>
          <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 30, letterSpacing: "0.22em", color: C.text }}>TANDEM</div>
          <div style={{ fontFamily: FONT, fontSize: 24, color: C.soft, fontWeight: 500 }}>Noyes → Goldwin Smith</div>
          <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 600, color: C.accent, border: `1px solid ${C.line2}`, borderRadius: 20, padding: "4px 14px" }}>wheelchair</div>
          <div style={{ flex: 1 }} />
          <Stat label="PHOTOS" value={String(checked)} />
          <Stat label="FLAGS" value={String(flags)} color={flags ? C.red : C.text} />
          <Stat label="TIME" value={`${Math.max(0, Math.floor(t - tIntro + 1.2))}s`} />
        </div>
        <div style={{ display: "flex", height: MAP_H }}>
          {/* map */}
          <div style={{ position: "relative" }}>
            <RouteMap w={MAP_W} h={MAP_H} view={view} theme="dark">
              <RouteLine points={B} color={C.purple} width={7} progress={tw(t, tIntro - 0.9, 1.2)} k={k} />
              <RouteLine points={A} color={C.accent} width={7} progress={tw(t, tIntro - 1.3, 1.2)} k={k} />
              <Dot at={START} color={C.bg} ring={C.text} k={k} r={8} />
              <Dot at={END} color={C.text} ring={C.bg} k={k} r={9} />
              {t >= SHOTS[4].arrive ? <Dot at={pointAt(B, fracB)} color={C.purple} k={k} r={11} /> : null}
              {t >= SHOTS[0].arrive && pinA < 0.5 ? <Dot at={pointAt(A, fracA)} color={C.accent} k={k} r={11} /> : null}
              <Pin at={[steep.x, steep.y]} color={C.orange} label="2" appear={tw(t, tElevation, 0.45, POP)} pulse={(t - tElevation) / 0.9} k={k} />
              <Pin at={[cracked.x, cracked.y]} color={C.yellow} label="3" appear={tw(t, tTradeoffs, 0.45, POP)} pulse={(t - tTradeoffs) / 0.9} k={k} />
              <Pin at={[stairs.x, stairs.y]} color={C.red} label="1" appear={pinA} pulse={(t - tRamp - 0.45) / 0.9} k={k} size={24} />
            </RouteMap>
            <div style={{ position: "absolute", inset: 0, background: C.bg, opacity: 0.6 * stop }} />
          </div>
          {/* photo feed */}
          <div style={{ position: "relative", width: W - MAP_W, borderLeft: `1px solid ${C.line}`, padding: 22, boxSizing: "border-box", background: C.bg2 }}>
            <div style={{ display: "flex", gap: 26 }}>
              <div style={{ width: 400, height: 400, flexShrink: 0, borderRadius: 14, background: C.card, border: `1px solid ${C.line}`, scale: String(1 + 0.05 * stop), transformOrigin: "100% 40%", boxShadow: stop > 0 ? `0 0 0 ${4 * stop}px ${C.red}, 0 0 60px rgba(255,77,94,${0.5 * stop})` : undefined }}>
                {shot ? (
                  <Photo
                    src={shot.img}
                    size={400}
                    radius={14}
                    box={shot.kind === "stairs" ? stairs.box : shot.kind === "cracked" ? cracked.box : null}
                    draw={tw(t, shot.verdict, 0.4)}
                    color={TONE[shot.kind]}
                    style={{ opacity: arrive, translate: `${(1 - arrive) * 36}px 0px` }}
                  >
                    {scanning ? <div style={{ position: "absolute", left: 0, right: 0, top: `${((t * 1.5) % 1) * 100}%`, height: 3, background: C.accent, boxShadow: `0 0 18px 4px ${C.accent}` }} /> : null}
                    {judged && shot.kind === "clear" ? <div style={{ position: "absolute", inset: 0, border: `5px solid ${C.green}`, borderRadius: 14, opacity: v }} /> : null}
                  </Photo>
                ) : null}
              </div>
              {/* verdict */}
              <div style={{ flex: 1, fontFamily: FONT, paddingTop: 6 }}>
                {shot && !judged ? <div style={{ fontFamily: MONO, fontSize: 19, color: C.muted, letterSpacing: "0.08em" }}>{shot.kind === "stairs" && t >= tThen ? "HOLD ON" : "CHECKING"}</div> : null}
                {shot && judged && shot.kind === "clear" ? (
                  <div style={{ scale: String(v), transformOrigin: "0 0" }}>
                    <div style={{ width: 76, height: 76, borderRadius: 38, background: C.green, color: C.bg, fontSize: 48, fontWeight: 900, textAlign: "center", lineHeight: "76px" }}>✓</div>
                    <div style={{ fontSize: 38, fontWeight: 900, color: C.green, letterSpacing: "0.08em", marginTop: 12 }}>CLEAR</div>
                  </div>
                ) : null}
                {shot?.kind === "stairs" ? (
                  <>
                    <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.05, whiteSpace: "nowrap", color: C.red, scale: String(tw(t, tFourteen, 0.35, POP)), transformOrigin: "0 50%" }}>14 STEPS</div>
                    <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.05, whiteSpace: "nowrap", color: C.text, marginTop: 10, scale: String(tw(t, tNoRamp, 0.35, POP)), transformOrigin: "0 50%" }}>NO RAMP</div>
                    <div style={{ fontFamily: MONO, fontSize: 17, color: C.muted, marginTop: 18, lineHeight: 1.5, opacity: tw(t, tRamp + 0.2, 0.4) }}>
                      Route A
                      <br />
                      Libe Slope path
                      <br />
                      photo Jul 2009
                    </div>
                  </>
                ) : null}
                {shot && judged && shot.kind === "steep" ? (
                  <div style={{ scale: String(v), transformOrigin: "0 0" }}>
                    <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.05, color: C.orange }}>STEEP CLIMB</div>
                    <div style={{ fontFamily: MONO, fontSize: 17, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
                      Route B
                      <br />
                      from elevation data
                    </div>
                  </div>
                ) : null}
                {shot && judged && shot.kind === "cracked" ? (
                  <div style={{ scale: String(v), transformOrigin: "0 0" }}>
                    <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.05, color: C.yellow }}>CRACKED PATH</div>
                    <div style={{ fontFamily: MONO, fontSize: 17, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
                      Route B
                      <br />
                      minor, uneven
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {/* strip of earlier photos */}
            <div style={{ display: "flex", gap: 12, marginTop: 22, opacity: 1 - 0.6 * stop }}>
              {SHOTS.slice(0, Math.max(cur, 0)).slice(-6).map((s) => (
                <div key={s.img} style={{ position: "relative" }}>
                  <Photo src={s.img} size={96} radius={10} />
                  <div style={{ position: "absolute", inset: 0, borderRadius: 10, border: `3px solid ${TONE[s.kind]}` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* route rows */}
        <div style={{ position: "relative", height: H - 44 - 72 - MAP_H, borderTop: `1px solid ${C.line}`, padding: "10px 28px", boxSizing: "border-box" }}>
          <Row
            name="Route A"
            color={C.accent}
            minutes={ROUTES.A.durationMin}
            progress={t >= SHOTS[0].arrive ? fracA : 0}
            status={t >= tFourteen ? <span style={{ color: C.red }}>14 steps, no ramp</span> : <span style={{ color: C.muted }}>{t >= SHOTS[0].arrive ? "scouting" : "queued"}</span>}
          />
          <Row
            name="Route B"
            color={C.purple}
            minutes={ROUTES.B.durationMin}
            progress={t >= SHOTS[4].arrive ? fracB : 0}
            status={
              t >= tElevation ? (
                <span>
                  <span style={{ color: C.orange }}>steep climb</span>
                  {t >= tTradeoffs ? <span style={{ color: C.yellow }}> · cracked path</span> : null}
                </span>
              ) : (
                <span style={{ color: C.muted }}>{t >= SHOTS[4].arrive ? "scouting" : "queued"}</span>
              )
            }
          />
          <div style={{ position: "absolute", inset: 0, background: C.bg, opacity: 0.6 * stop }} />
        </div>
      </div>
    </Scene>
  );
};
