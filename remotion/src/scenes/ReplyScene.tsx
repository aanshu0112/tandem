import React from "react";
import { Img, staticFile } from "remotion";
import { Phone } from "../components/Phone";
import { Photo } from "../components/Photo";
import { Dot, Pin, RouteLine, RouteMap } from "../components/RouteMap";
import { Scene } from "../components/Scene";
import { C, FONT, FRAMES, MONO } from "../constants";
import { ROUTES } from "../data";
import { ENTRANCE, WEATHER_DEMO } from "../extras";
import { clipAt, fitView, POP, toD, tw, useT, wordAt } from "../lib";
import { A, ALL, B, END, START, cracked, stairs, steep } from "../route";
import { TIMING } from "../timing";
import { Glow, REQUEST_TEXT } from "./TurnScene";

const S = "reply";
const dur = TIMING[S].duration;

// Narration cues
const tMap = wordAt(S, "texts") - 0.2;
const tFound = clipAt(S, 1);
const tPhoto = wordAt(S, "photo") - 0.25;
const tTaken = wordAt(S, "taken") - 0.5;
const tGoogle = clipAt(S, 2) - 0.3;
const tStairs = wordAt(S, "stairs") - 0.2;
const tTandem = clipAt(S, 3) - 0.2;
const tAvoid = wordAt(S, "avoids");
const tWarn = wordAt(S, "warning");
const tDoor = clipAt(S, 5) - 0.3;
const tWeather = clipAt(S, 7) - 0.3;
const tIcy = wordAt(S, "icy");
const tLink = clipAt(S, 9) - 0.3;
const tWalk = wordAt(S, "walk");

// ---- the thread: every message Tandem sends, in the bot's own wording (messaging/scout-flow.ts) ----
const GAP = 8;
type Msg = { at: number; h: number; me?: boolean; node: React.ReactNode };
const text = (s: React.ReactNode, me = false) => (
  <div style={{ background: me ? C.imessage : "#262a33", color: "#fff", fontSize: 16, lineHeight: "21px", padding: "9px 13px", borderRadius: 19, maxWidth: 290, whiteSpace: "pre-line" }}>{s}</div>
);
const FLY = [FRAMES.lot, FRAMES.crossing, FRAMES.fork, FRAMES.path, FRAMES.steep, FRAMES.cracked, FRAMES.quad];
const miniView = fitView(ALL, 270, 190, 26);

const MiniMap: React.FC = () => (
  <RouteMap w={270} h={190} view={miniView} theme="light" style={{ borderRadius: 18 }}>
    <RouteLine points={A} color="#e5383b" width={5} k={miniView.scale} />
    <RouteLine points={B} color="#0f9d58" width={5} k={miniView.scale} />
    <Pin at={[steep.x, steep.y]} color={C.orange} label="2" appear={1} k={miniView.scale} size={10} />
    <Pin at={[cracked.x, cracked.y]} color={C.yellow} label="3" appear={1} k={miniView.scale} size={10} />
    <Pin at={[stairs.x, stairs.y]} color={C.red} label="1" appear={1} k={miniView.scale} size={11} />
  </RouteMap>
);

const busText = `🚌 It'll be ${WEATHER_DEMO.tempF}°F, ${WEATHER_DEMO.summary.toLowerCase()}, so those hills will be slippery. Want the bus instead?`;

const MESSAGES: Msg[] = [
  { at: -9, h: 60, me: true, node: text(REQUEST_TEXT, true) },
  { at: -9, h: 60, node: text("Walking it for you now, give me a minute 🚶") },
  { at: -9, h: 60, node: text("Got the routes. Now looking at the Street View photos 👀") },
  { at: -9, h: 39, node: text("Halfway there. 1 problem so far.") },
  { at: tMap, h: 190, node: <MiniMap /> },
  { at: tFound + 0.9, h: 123, node: text("Google Maps' route (9 min, red on the map) has 1 problem:\n1️⃣ 14 steps on the Libe Slope path, no ramp") },
  { at: tPhoto, h: 200, node: <Photo src={FRAMES.stairs} size={200} radius={18} box={stairs.box} draw={1} /> },
  { at: tAvoid - 0.2, h: 60, node: text("The green route avoids that and takes about the same time 👆") },
  { at: tWarn - 0.2, h: 123, node: text("Heads up, it still has:\n2️⃣ Steep climb up Libe Slope.\n3️⃣ Cracked, uneven path partway up Libe Slope.") },
  ...(ENTRANCE ? [{ at: tDoor, h: ENTRANCE.note.length > 95 ? 123 : ENTRANCE.note.length > 62 ? 102 : 81, node: text(`🚪 ${ENTRANCE.note}`) }] : []),
  { at: tIcy - 0.3, h: 102, node: text(busText) },
  { at: tLink, h: 60, node: text("All the details, photos and the full walk 👇") },
  {
    at: tLink + 0.5,
    h: 74,
    node: (
      <div style={{ background: "#262a33", borderRadius: 19, width: 270, height: 74, display: "flex", alignItems: "center", gap: 12, padding: "0 12px", boxSizing: "border-box", color: "#fff" }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: `linear-gradient(160deg, ${C.accent}, #2a6fd6)`, color: "#04121f", fontWeight: 900, fontSize: 26, lineHeight: "50px", textAlign: "center" }}>T</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Noyes → Goldwin Smith</div>
          <div style={{ fontSize: 13, color: "#9aa0ad" }}>Tandem trip page</div>
        </div>
      </div>
    ),
  },
  { at: tWalk - 0.3, h: 60, node: text("Here's the walk before you take it 🎬") },
];

const Thread: React.FC<{ t: number }> = ({ t }) => {
  // Everything is laid out; messages that haven't arrived yet are pushed below the fold.
  const below = MESSAGES.reduce((sum, m) => sum + (m.h + GAP) * (1 - tw(t, m.at, 0.35)), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GAP, translate: `0px ${below}px` }}>
      {MESSAGES.map((m, i) => {
        const a = tw(t, m.at, 0.35);
        return (
          <div key={i} style={{ height: m.h, flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: m.me ? "flex-end" : "flex-start", opacity: a, scale: String(0.92 + 0.08 * a), transformOrigin: m.me ? "100% 100%" : "0% 100%" }}>
            {m.node}
          </div>
        );
      })}
    </div>
  );
};

// ---- the right side: whatever the newest message is about, enlarged ----
const PX = 800;
const PW = 1040;
const PH = 870;
const Panel: React.FC<{ t: number; from: number; to: number; label: string; children: React.ReactNode }> = ({ t, from, to, label, children }) => {
  const a = tw(t, from, 0.5) - tw(t, to, 0.35);
  if (a <= 0) return null;
  return (
    <div style={{ position: "absolute", left: PX, top: 50, width: PW, height: PH, opacity: a, translate: `${(1 - tw(t, from, 0.5)) * 40}px 0px` }}>
      <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: "0.18em", color: C.muted, marginBottom: 16 }}>{label}</div>
      {children}
    </div>
  );
};

const Chip: React.FC<{ color: string; children: React.ReactNode; scale?: number }> = ({ color, children, scale = 1 }) => (
  <div style={{ fontFamily: FONT, fontSize: 27, fontWeight: 700, color, border: `2px solid ${color}`, borderRadius: 30, padding: "7px 20px", scale: String(scale), whiteSpace: "nowrap" }}>{children}</div>
);

const RouteCard: React.FC<{ who: string; minutes: number; color: string; appear: number; pop: number; dim?: number; badge?: number; children?: React.ReactNode }> = ({ who, minutes, color, appear, pop, dim = 0, badge = 0, children }) => (
  <div style={{ height: 390, boxSizing: "border-box", background: C.card, border: `2px solid ${badge > 0.5 ? C.green : C.line2}`, borderRadius: 24, padding: "26px 34px", marginBottom: 24, opacity: appear * (1 - 0.55 * dim), translate: `${(1 - appear) * 50}px 0px` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 16, height: 16, borderRadius: 8, background: color }} />
      <div style={{ fontFamily: FONT, fontSize: 25, fontWeight: 700, letterSpacing: "0.16em", color: C.soft }}>{who}</div>
      <div style={{ flex: 1 }} />
      {badge > 0 ? <div style={{ fontFamily: FONT, fontSize: 21, fontWeight: 800, letterSpacing: "0.1em", color: C.bg, background: C.green, borderRadius: 8, padding: "5px 13px", scale: String(badge) }}>RECOMMENDED</div> : null}
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 4 }}>
      <div style={{ fontFamily: FONT, fontSize: 150, fontWeight: 800, letterSpacing: "-0.03em", color: C.text, lineHeight: 1.1, scale: String(1 + 0.1 * pop), transformOrigin: "0% 70%" }}>{minutes}</div>
      <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 600, color: C.soft }}>min</div>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>{children}</div>
  </div>
);

export const ReplyScene: React.FC = () => {
  const t = useT();
  const bigView = fitView(ALL, PW, PH - 40, 110);
  const k = bigView.scale;
  const popAt = (at: number) => tw(t, at, 0.2, POP) - tw(t, at + 0.35, 0.4);
  const pick = tw(t, tAvoid, 0.6);
  const fly = Math.max(0, t - tWalk) / 0.42;
  const doorView = ENTRANCE ? fitView(ENTRANCE.building, PW, 560, 120) : bigView;
  const END_ALL = 99;

  return (
    <Scene id={S}>
      <Glow />
      <Phone scale={1.5} style={{ position: "absolute", left: 110, top: -345 }}>
        <Thread t={t} />
      </Phone>

      <Panel t={t} from={tMap + 0.2} to={tPhoto} label="THE MAP IT SENDS">
        <RouteMap w={PW} h={PH - 40} view={bigView} theme="dark" style={{ borderRadius: 24, border: `1px solid ${C.line2}` }}>
          <RouteLine points={A} color={C.red} width={9} progress={tw(t, tMap + 0.4, 1)} k={k} />
          <RouteLine points={B} color={C.green} width={9} progress={tw(t, tMap + 0.6, 1)} k={k} />
          <Dot at={START} color={C.bg} ring={C.text} k={k} r={9} />
          <Dot at={END} color={C.text} ring={C.bg} k={k} r={10} />
          <Pin at={[steep.x, steep.y]} color={C.orange} label="2" appear={tw(t, tFound + 0.5, 0.4, POP)} k={k} />
          <Pin at={[cracked.x, cracked.y]} color={C.yellow} label="3" appear={tw(t, tFound + 0.65, 0.4, POP)} k={k} />
          <Pin at={[stairs.x, stairs.y]} color={C.red} label="1" appear={tw(t, tFound + 0.35, 0.4, POP)} k={k} size={25} />
        </RouteMap>
      </Panel>

      <Panel t={t} from={tPhoto} to={tGoogle} label="THE PHOTO IT FLAGGED">
        <div style={{ display: "flex", gap: 30 }}>
          <Photo src={FRAMES.stairs} size={640} radius={24} box={stairs.box} draw={tw(t, tPhoto + 0.45, 0.4)} label="14 STEPS" />
          <div style={{ opacity: tw(t, tTaken, 0.5), translate: `0px ${(1 - tw(t, tTaken, 0.5)) * 30}px`, paddingTop: 150 }}>
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: "0.18em", color: C.muted }}>PHOTO TAKEN</div>
            <div style={{ fontFamily: MONO, fontSize: 104, fontWeight: 700, color: C.text, lineHeight: 1.05, marginTop: 10 }}>Jul</div>
            <div style={{ fontFamily: MONO, fontSize: 104, fontWeight: 700, color: C.accent, lineHeight: 1.05 }}>2009</div>
            <div style={{ fontFamily: FONT, fontSize: 26, color: C.soft, marginTop: 22, lineHeight: 1.35, width: 330 }}>The date is on every photo, so you can judge it yourself.</div>
          </div>
        </div>
      </Panel>

      <Panel t={t} from={tGoogle} to={tDoor} label="GOOGLE MAPS VS TANDEM">
        <RouteCard who="GOOGLE MAPS' ROUTE" minutes={ROUTES.A.durationMin} color={C.red} appear={tw(t, tGoogle, 0.5)} pop={popAt(wordAt(S, "nine"))} dim={pick}>
          <Chip color={C.red} scale={tw(t, tStairs, 0.35, POP)}>
            14 steps, no ramp
          </Chip>
        </RouteCard>
        <RouteCard who="TANDEM'S ROUTE" minutes={ROUTES.B.durationMin} color={C.green} appear={tw(t, tTandem, 0.5)} pop={popAt(wordAt(S, "nine", 1))} badge={tw(t, tAvoid + 0.2, 0.35, POP)}>
          <Chip color={C.green} scale={tw(t, tAvoid, 0.35, POP)}>
            Avoids the staircase
          </Chip>
          <Chip color={C.orange} scale={tw(t, tWarn, 0.35, POP) + 0.08 * popAt(wordAt(S, "steep"))}>
            Steep climb ahead
          </Chip>
          <Chip color={C.yellow} scale={tw(t, tWarn + 0.15, 0.35, POP)}>
            Cracked path
          </Chip>
        </RouteCard>
      </Panel>

      {ENTRANCE ? (
        <Panel t={t} from={tDoor} to={tWeather} label="THE LAST 20 METERS">
          <RouteMap w={PW} h={560} view={doorView} theme="dark" style={{ borderRadius: 24, border: `1px solid ${C.line2}` }}>
            <path d={`${toD(ENTRANCE.building)} Z`} fill={C.accent} fillOpacity={0.13} stroke={C.accent} strokeWidth={3 / doorView.scale} />
            <RouteLine points={B} color={C.green} width={8} k={doorView.scale} />
            {ENTRANCE.doors.map((d, i) => {
              const a = tw(t, tDoor + 0.6 + i * 0.12, 0.4, POP);
              const color = d.kind === "accessible" ? C.green : d.kind === "steps" ? C.red : C.muted;
              return <circle key={i} cx={d.x} cy={d.y} r={((d.kind === "other" ? 8 : 15) * a) / doorView.scale} fill={color} stroke="#fff" strokeWidth={(d.kind === "other" ? 2 : 4) / doorView.scale} />;
            })}
          </RouteMap>
          <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 700, color: C.text, lineHeight: 1.25, marginTop: 28, opacity: tw(t, tDoor + 0.8, 0.5) }}>{ENTRANCE.note}</div>
          <div style={{ display: "flex", gap: 26, marginTop: 18, fontFamily: FONT, fontSize: 24, color: C.soft, opacity: tw(t, tDoor + 1, 0.5) }}>
            {ENTRANCE.legend.map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: l.kind === "accessible" ? C.green : l.kind === "steps" ? C.red : C.muted }} />
                {l.label}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel t={t} from={tWeather} to={tLink} label="THE WEATHER WHEN YOU LEAVE">
        <div style={{ background: C.card, border: `1px solid ${C.line2}`, borderRadius: 24, padding: "40px 44px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 26 }}>
            <div style={{ fontFamily: FONT, fontSize: 190, fontWeight: 800, letterSpacing: "-0.04em", color: C.accent, lineHeight: 1 }}>{WEATHER_DEMO.tempF}°F</div>
            <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 700, color: C.text }}>{WEATHER_DEMO.summary}</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 21, color: C.muted, marginTop: 14 }}>example: an icy day (the app's demo weather)</div>
        </div>
        <div style={{ background: C.card, border: `2px solid ${C.orange}`, borderRadius: 24, padding: "34px 44px", marginTop: 24, opacity: tw(t, tIcy - 0.2, 0.5), translate: `0px ${(1 - tw(t, tIcy - 0.2, 0.5)) * 30}px` }}>
          <div style={{ fontFamily: FONT, fontSize: 46, fontWeight: 800, color: C.orange }}>Icy + a steep climb</div>
          <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 600, color: C.text, marginTop: 10, opacity: tw(t, wordAt(S, "bus") - 0.2, 0.4) }}>🚌 Tandem offers the bus instead</div>
        </div>
      </Panel>

      <Panel t={t} from={tLink} to={END_ALL} label="THE WHOLE WALK, BEFORE YOU TAKE IT">
        <div style={{ position: "relative", width: PW, height: 700, borderRadius: 24, overflow: "hidden", border: `1px solid ${C.line2}`, background: C.card }}>
          {FLY.map((f, n) => (
            <Img key={f} src={staticFile(f)} style={{ position: "absolute", inset: 0, width: PW, height: 700, objectFit: "cover", opacity: n === Math.floor(fly) % FLY.length ? 1 : 0, scale: String(1 + 0.05 * (fly % 1)) }} />
          ))}
        </div>
        <div style={{ height: 8, borderRadius: 4, background: C.line, marginTop: 22 }}>
          <div style={{ height: 8, borderRadius: 4, background: C.accent, width: `${Math.min(1, Math.max(0, (t - tWalk) / (dur - tWalk))) * 100}%` }} />
        </div>
      </Panel>
    </Scene>
  );
};
