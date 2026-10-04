// Tandem mission control: draws live ScoutEvents (see shared/types.ts) streamed at GET /events.
"use strict";

// ─── Config ───────────────────────────────────────────────────────────────────
// Fallbacks: GET /api/config ({ phone?, sms? }) overrides these when the server provides them.
const TANDEM_PHONE = "(xxx) xxx-xxxx"; // ← put the iMessage number here before the demo
const TANDEM_SMS = ""; // e.g. "+16075551234" or an Apple ID email; enables the QR code on the idle screen
const FPS = 7; // clear photos per second
const PROBLEM_HOLD_MS = 1600; // how long a photo with a problem stays up
const FLAG_PHOTO_HOLD_MS = 1300; // final flags with a photo we haven't shown yet
const VERDICT_WAIT_MS = 2600; // hold a photo back this long waiting for Claude's verdict
const STRIP_MAX = 12;
const IDLE_AFTER_DONE_MS = 45_000;
const STALE_SCOUT_MS = 3 * 60_000; // a replayed, finished scout older than this → idle right away
const REPLAY_WINDOW_MS = 450; // events this soon after connecting are replayed history: fast-forward them

const ROUTE_COLORS = ["#5cc8ff", "#c38bff", "#ff7ac6", "#e8edf5"];
const WIN = "#3ee08f";
const SEV_COLOR = { 1: "#ffd23f", 2: "#ff9a3d", 3: "#ff4d5e" };
const TYPE_LABEL = T.TYPE_LABEL; // shared with the trip page and barrier map (common.js)
const SOURCE_LABEL = {
  vision: "Spotted by Claude in Street View", osm: "OpenStreetMap", elevation: "Elevation data",
  user: "User report", alert: "Transit alert",
};
const PERSONA = T.PERSONA;

const FORCE_IDLE = new URLSearchParams(location.search).has("idle"); // ?idle previews the call-to-action screen
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fileUrl = (p) => "/files/" + String(p).split("/").map(encodeURIComponent).join("/");
const placeName = (s) => String(s || "").split(",")[0].trim();
const fmtNum = (n) => (Math.round(n * 10) / 10).toString();

// ─── Geometry ─────────────────────────────────────────────────────────────────
function decodePolyline(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}
function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const lengthM = (pts) => pts.reduce((s, p, i) => (i ? s + distM(pts[i - 1], p) : 0), 0);

// ─── Map ──────────────────────────────────────────────────────────────────────
const map = L.map("map", { zoomControl: false, attributionControl: true, zoomSnap: 0.25, fadeAnimation: true }).setView([42.4474, -76.4840], 16);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  className: "dark-tiles", // darkened with a CSS filter in style.css
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const walkerLayer = L.layerGroup().addTo(map);
const nightLayer = L.layerGroup().addTo(map); // unlit / isolated stretches + blue-light phones, drawn on done

// ─── State ────────────────────────────────────────────────────────────────────
let S = freshState();
function freshState() {
  return {
    scoutId: null, from: "", to: "", persona: "", startedAt: 0, endedAt: 0,
    routes: new Map(), // routeId → route state
    frames: new Map(), // frameId → { e, verdict, arrivedAt, shown, tile, shot }
    queue: [], // ordered playback items: { kind: "frame", rec } | { kind: "event", e }
    flags: [], flagIds: new Set(), flagNum: 0,
    problemPhotos: new Set(), // imagePaths already shown with a red box
    checked: 0, localChecked: 0, total: 0, pct: 0, problemHits: 0,
    tally: { ok: 0, bad: 0, na: 0 },
    done: false, result: null, doneAt: 0, error: null,
  };
}

let instant = false; // fast-forward (replayed history): no animations, no queue
let pumpTimer = null;
let idleTimer = null;

// ─── Event intake ─────────────────────────────────────────────────────────────
function onEvent(e) {
  if (!e || !e.type) return;
  if (e.type === "start") return handleStart(e);
  if (e.scoutId !== S.scoutId) return; // an older (or unknown) scout

  if (e.type === "verdict") return handleVerdict(e);
  if (e.type === "error") return handleError(e);
  if (e.type === "routes") return handleRoutes(e); // draw immediately, nothing to pace

  if (instant) {
    if (e.type === "frame") {
      const rec = addFrameRec(e);
      showFrame(rec);
    } else applyEvent(e);
    return;
  }
  if (e.type === "frame") S.queue.push({ kind: "frame", rec: addFrameRec(e) });
  else S.queue.push({ kind: "event", e });
  kick();
}

function addFrameRec(e) {
  const rec = { e, verdict: null, arrivedAt: performance.now(), shown: false, tile: null, shot: null, counted: false };
  S.frames.set(e.frameId, rec);
  S.total = Math.max(S.total, S.frames.size);
  return rec;
}

// ─── Playback queue ───────────────────────────────────────────────────────────
function kick() {
  if (!pumpTimer) pump();
}
function framesQueued() {
  let n = 0;
  for (const it of S.queue) if (it.kind === "frame") n++;
  return n;
}
function pump() {
  pumpTimer = null;
  while (S.queue.length) {
    const it = S.queue[0];
    if (it.kind === "frame") {
      const rec = it.rec;
      const age = performance.now() - rec.arrivedAt;
      if (!rec.verdict && age < VERDICT_WAIT_MS) {
        pumpTimer = setTimeout(pump, Math.min(80, VERDICT_WAIT_MS - age + 5));
        return;
      }
      S.queue.shift();
      showFrame(rec);
      pumpTimer = setTimeout(pump, holdFor(rec));
      return;
    }
    S.queue.shift();
    const cost = applyEvent(it.e) || 0;
    if (cost > 0) {
      pumpTimer = setTimeout(pump, cost / speedFactor());
      return;
    }
  }
}
// >1 when we are falling behind: play faster so we never lag far behind the agent.
function speedFactor() {
  const n = framesQueued();
  return n <= 10 ? 1 : Math.min(6, n / 10);
}
function holdFor(rec) {
  const f = speedFactor();
  const v = rec.verdict;
  if (v && isProblem(v.verdict)) return Math.max(650, PROBLEM_HOLD_MS / Math.sqrt(f));
  return Math.max(40, 1000 / FPS / f);
}
const isProblem = (v) => v && v !== "none" && v !== "not_a_street";

// ─── Handlers ─────────────────────────────────────────────────────────────────
function handleStart(e) {
  if (S.scoutId === e.scoutId && !instant) return; // duplicate
  resetAll();
  S.scoutId = e.scoutId;
  S.from = e.from; S.to = e.to; S.persona = e.persona;
  const sinceStart = Date.now() - (e.at || 0);
  S.startedAt = instant && e.at && sinceStart >= 0 && sinceStart < 3600_000 ? e.at : Date.now();
  $("trip-from").textContent = placeName(e.from);
  $("trip-arrow").style.display = "";
  $("trip-to").textContent = placeName(e.to);
  fitTrip();
  $("persona").textContent = PERSONA[e.persona] || e.persona || "";
  $("persona").classList.toggle("night", e.persona === "night_solo");
  setPhase("working", "Finding walking routes…");
  setConn();
  hideIdle();
}

function resetAll() {
  clearTimeout(pumpTimer); pumpTimer = null;
  clearTimeout(idleTimer); idleTimer = null;
  S = freshState();
  routeLayer.clearLayers(); pinLayer.clearLayers(); walkerLayer.clearLayers(); nightLayer.clearLayers();
  $("problems-list").innerHTML = "";
  $("problems-empty").classList.remove("hidden");
  $("problems-empty").textContent = "None yet. Watching…";
  $("problems-count").textContent = "0";
  $("banner").classList.add("hidden");
  $("fly").classList.add("hidden");
  $("strip").innerHTML = "";
  $("photo").querySelectorAll(".shot").forEach((n) => n.remove());
  $("photo-empty").classList.remove("hidden");
  $("photo-meta").textContent = "";
  $("board-rows").innerHTML = `<div class="board-empty muted">Finding routes…</div>`;
  $("board").classList.remove("many");
  $("toast").classList.add("hidden");
  setCounter("c-checked", 0); setCounter("c-problems", 0);
  $("c-total").textContent = "";
  $("c-elapsed").textContent = "0:00";
  $("pbar-fill").style.width = "0%";
  updateTally();
  document.body.classList.remove("scanning");
}

function handleRoutes(e) {
  const allPts = [];
  e.routes.forEach((r, i) => {
    if (S.routes.has(r.routeId)) return;
    const pts = decodePolyline(r.polyline);
    allPts.push(...pts);
    const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
    const glow = L.polyline(pts, { color, weight: 16, opacity: 0.12, lineCap: "round", lineJoin: "round" }).addTo(routeLayer);
    const base = L.polyline(pts, { color, weight: 5, opacity: 0.45, dashArray: "2 10", lineCap: "round" }).addTo(routeLayer);
    const trail = L.polyline([], { color, weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(routeLayer);
    const icon = L.divIcon({
      className: "walker",
      iconSize: [30, 30],
      html: `<div class="walker-ring" style="border-color:${color}"></div><div class="walker-core" style="background:${color};color:${color}"><span style="color:#0a0f18">${esc(r.routeId)}</span></div>`,
    });
    const walker = L.marker(pts[0], { icon, zIndexOffset: 1000, interactive: false }).addTo(walkerLayer);
    const R = {
      id: r.routeId, idx: i, color, pts, len: Math.max(1, lengthM(pts)), durationMin: r.durationMin,
      glow, base, trail, walker, anim: null,
      walked: 0, photos: 0, flags: [], score: 0, finalScore: null, row: null,
    };
    S.routes.set(r.routeId, R);
    R.row = buildRow(R);
  });
  $("board").classList.toggle("many", S.routes.size > 2);
  if (allPts.length) {
    const b = L.latLngBounds(allPts);
    if (instant) map.fitBounds(b, fitPad());
    else map.flyToBounds(b, { ...fitPad(), duration: 1.2 });
  }
  setPhase("working", `Walking ${e.routes.length} route${e.routes.length === 1 ? "" : "s"} in Street View…`);
  document.body.classList.add("scanning");
}
function fitPad() {
  return { paddingTopLeft: [450, 90], paddingBottomRight: [70, 70], maxZoom: 18 };
}

function handleVerdict(e) {
  const rec = S.frames.get(e.frameId);
  if (!rec) return; // verdict for a frame we never saw
  const prev = rec.verdict;
  rec.verdict = e;
  if (rec.shown) {
    stampTile(rec, prev);
    if (rec.shot && rec.shot.isConnected) stampShot(rec, !instant);
    countVerdict(rec, prev);
  } else if (!instant) kick();
}

function handleError(e) {
  S.error = e.message;
  setPhase("error", "Scout hit a problem");
  const t = $("toast");
  t.textContent = "⚠ " + (e.message || "Something went wrong");
  t.classList.remove("hidden");
  document.body.classList.remove("scanning");
  scheduleIdle(20_000);
}

// Paced events. Returns how long to pause after it (ms).
function applyEvent(e) {
  switch (e.type) {
    case "progress": {
      S.pct = e.pct;
      $("pbar-fill").style.width = Math.max(0, Math.min(100, e.pct)) + "%";
      if (e.photosTotal) S.total = Math.max(S.total, e.photosTotal);
      if (e.photosChecked > S.checked) { S.checked = e.photosChecked; setCounter("c-checked", S.checked); }
      updateTotal();
      return 0;
    }
    case "flag": return handleFlag(e);
    case "done": return handleDone(e);
    case "flythrough": {
      $("fly-title").textContent = `Flythrough · Route ${e.routeId}`;
      $("fly-img").src = fileUrl(e.gifPath);
      $("fly").classList.remove("hidden");
      return 0;
    }
  }
  return 0;
}

// ─── Frames & verdicts ────────────────────────────────────────────────────────
function showFrame(rec) {
  const e = rec.e;
  rec.shown = true;
  const R = S.routes.get(e.routeId);
  if (R) {
    R.photos++;
    R.walked = Math.max(R.walked, e.distM || 0);
    moveWalker(R, [e.location.lat, e.location.lng]);
    R.trail.addLatLng([e.location.lat, e.location.lng]);
    updateRow(R);
  }
  // Current photo
  $("photo-empty").classList.add("hidden");
  const shot = buildShot(rec);
  const box = $("photo");
  box.querySelectorAll(".shot").forEach((old) => {
    if (instant) old.remove();
    else { old.classList.add("leave"); setTimeout(() => old.remove(), 260); }
  });
  if (!instant) shot.classList.add("enter");
  box.appendChild(shot);
  rec.shot = shot;
  $("photo-meta").textContent = `Route ${e.routeId} · ${Math.round(e.distM || 0)} m`;
  if (rec.verdict) {
    stampShot(rec, !instant);
    countVerdict(rec, null);
  }
  // Strip tile
  addTile(rec);
}

function buildShot(rec) {
  const e = rec.e;
  const shot = el("div", "shot");
  const sq = el("div", "sq");
  const img = el("img");
  img.alt = "";
  img.src = fileUrl(e.imagePath);
  sq.appendChild(img);
  shot.appendChild(sq);
  shot.appendChild(el("div", "scanline"));
  const R = S.routes.get(e.routeId);
  const color = R ? R.color : "#888";
  const cap = el("div", "caption",
    `<span class="rchip" style="background:${color}">${esc(e.routeId)}</span><span>Route ${esc(e.routeId)}</span><span class="mono">${Math.round(e.distM || 0)} m along</span>` +
    `<span class="src">Street View${e.photoDate ? " · " + esc(e.photoDate) : ""}</span>`);
  shot.appendChild(cap);
  const pend = el("div", "vbadge pending", `<span class="ico"></span>Claude is looking…`);
  shot.appendChild(pend);
  positionSquare(shot, sq, null);
  return shot;
}

// The photo is square; the panel is wider than tall. Slide the square so the problem stays in view.
function positionSquare(shot, sq, box) {
  const panel = $("photo");
  const W = panel.clientWidth || 690, H = panel.clientHeight || 470;
  const cy = box ? box.y + box.h / 2 : 0.55;
  const top = Math.max(H - W, Math.min(0, H / 2 - cy * W));
  sq.style.top = top + "px";
  return { W, H, top };
}

function stampShot(rec, animate) {
  const v = rec.verdict, shot = rec.shot;
  if (!v || !shot) return;
  shot.classList.add("judged");
  shot.classList.remove("ok", "bad", "na", "s1", "s2", "s3");
  shot.querySelectorAll(".vbadge, svg, .box-label").forEach((n) => n.remove());
  const sq = shot.querySelector(".sq");
  const second = v.secondLook ? `<span class="second">2nd look</span>` : "";
  if (v.verdict === "none") {
    shot.classList.add("ok");
    shot.appendChild(el("div", "vbadge ok", `<span class="ico">✓</span>Clear path${second}`));
  } else if (v.verdict === "not_a_street") {
    shot.classList.add("na");
    shot.appendChild(el("div", "vbadge na", `<span class="ico">?</span>Can't see the path${second}`));
  } else {
    const sev = v.severity || 3;
    shot.classList.add("bad", "s" + sev);
    const label = TYPE_LABEL[v.verdict] || v.verdict;
    const night = T.NIGHT_TYPES.has(v.verdict);
    shot.appendChild(el("div", `vbadge bad ${night ? "night" : ""}`, `<span class="ico">${night ? T.glyph(v.verdict, 20) : "!"}</span>${esc(label)}${v.confidence != null ? ` · ${Math.round(v.confidence * 100)}% sure` : ""}${second}`));
    if (v.box) {
      const b = v.box;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", b.x * 100); r.setAttribute("y", b.y * 100);
      r.setAttribute("width", b.w * 100); r.setAttribute("height", b.h * 100);
      r.setAttribute("rx", 0.8);
      r.setAttribute("class", `box s${sev} ${animate ? "draw" : "static"}`);
      r.setAttribute("pathLength", "400");
      svg.appendChild(r);
      sq.appendChild(svg);
      const lab = el("div", `box-label s${sev} ${animate ? "show" : "static"}`);
      lab.textContent = v.note || label;
      if (b.x + b.w / 2 > 0.5) lab.style.right = Math.max(2, 100 - (b.x + b.w) * 100) + "%";
      else lab.style.left = Math.max(2, b.x * 100) + "%";
      // Keep the label clear of the verdict badge (top) and the caption (bottom) in the visible window.
      const { W, H, top } = positionSquare(shot, sq, b);
      const boxTop = top + b.y * W, boxBottom = top + (b.y + b.h) * W;
      if (boxTop - 56 >= 70) lab.style.top = b.y * 100 + "%";
      else if (boxBottom + 56 <= H - 56) { lab.classList.add("below"); lab.style.top = (b.y + b.h) * 100 + "%"; }
      else { lab.classList.add("below"); lab.style.top = (Math.max(b.y, (70 - top) / W)) * 100 + "%"; }
      sq.appendChild(lab);
    } else if (v.note) {
      const lab = el("div", `box-label s${sev} below ${animate ? "show" : "static"}`);
      lab.textContent = v.note;
      lab.style.left = "4%"; lab.style.top = "40%";
      sq.appendChild(lab);
    }
    S.problemPhotos.add(rec.e.imagePath);
  }
}

function addTile(rec) {
  const e = rec.e;
  const R = S.routes.get(e.routeId);
  const t = el("div", "tile");
  const img = el("img");
  img.alt = ""; img.loading = "eager"; img.src = fileUrl(e.imagePath);
  t.appendChild(img);
  t.appendChild(el("span", "rchip rt", esc(e.routeId))).style.background = R ? R.color : "#888";
  rec.tile = t;
  const strip = $("strip");
  strip.prepend(t);
  while (strip.children.length > STRIP_MAX) strip.lastChild.remove();
  if (rec.verdict) stampTile(rec, null);
}

function stampTile(rec) {
  const t = rec.tile, v = rec.verdict;
  if (!t || !v) return;
  t.classList.add("judged");
  t.classList.remove("ok", "bad", "na", "s1", "s2", "s3");
  t.querySelector(".tb")?.remove();
  if (v.verdict === "none") { t.classList.add("ok"); t.appendChild(el("span", "tb", "✓")); }
  else if (v.verdict === "not_a_street") { t.classList.add("na"); t.appendChild(el("span", "tb", "?")); }
  else { t.classList.add("bad", "s" + (v.severity || 3)); t.appendChild(el("span", "tb", "!")); }
}

function verdictKind(v) {
  return !v ? null : v.verdict === "none" ? "ok" : v.verdict === "not_a_street" ? "na" : "bad";
}
// Count each displayed frame's verdict once; a second look can move it between buckets.
function countVerdict(rec, prev) {
  const kind = verdictKind(rec.verdict);
  if (rec.counted) {
    const was = verdictKind(prev);
    if (was && was !== kind) { S.tally[was]--; S.tally[kind]++; if (kind === "bad") S.problemHits++; else if (was === "bad") S.problemHits--; }
  } else {
    rec.counted = true;
    S.tally[kind]++;
    if (kind === "bad") S.problemHits++;
    S.localChecked++;
    S.checked = Math.max(S.checked, S.localChecked);
    setCounter("c-checked", S.checked);
  }
  updateTally();
  updateTotal();
  if (!S.flags.length) {
    setCounter("c-problems", S.problemHits);
    if (S.problemHits) $("problems-empty").textContent = `${S.problemHits} possible problem${S.problemHits === 1 ? "" : "s"} spotted. Confirming…`;
  }
}
function updateTally() {
  $("t-ok").textContent = S.tally.ok; $("t-bad").textContent = S.tally.bad; $("t-na").textContent = S.tally.na;
}
function updateTotal() {
  $("c-total").textContent = S.total ? "/" + S.total : "";
}

// ─── Walkers ──────────────────────────────────────────────────────────────────
function moveWalker(R, to) {
  if (instant) { R.walker.setLatLng(to); R.anim = null; return; }
  const from = R.walker.getLatLng();
  R.anim = { from: [from.lat, from.lng], to, t0: performance.now(), dur: 320 };
  ensureRaf();
}
let rafOn = false;
function ensureRaf() {
  if (rafOn) return;
  rafOn = true;
  requestAnimationFrame(tick);
}
function tick(now) {
  let active = false;
  for (const R of S.routes.values()) {
    const a = R.anim;
    if (!a) continue;
    const k = Math.min(1, (now - a.t0) / a.dur);
    const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    R.walker.setLatLng([a.from[0] + (a.to[0] - a.from[0]) * ease, a.from[1] + (a.to[1] - a.from[1]) * ease]);
    if (k < 1) active = true; else R.anim = null;
  }
  if (active) requestAnimationFrame(tick); else rafOn = false;
}

// ─── Flags ────────────────────────────────────────────────────────────────────
function handleFlag(e) {
  const f = e.flag;
  if (!f || S.flagIds.has(f.id)) return 0;
  addFlag(e.routeId, f);
  if (S.flags.length === 1) setPhase("working", "Cross-checking OpenStreetMap, elevation & alerts…");
  // A final flag with a photo we haven't shown boxed yet (e.g. OSM stairs, steep grade): show it.
  if (!instant && f.imagePath && !S.problemPhotos.has(f.imagePath)) {
    showFlagPhoto(e.routeId, f);
    return FLAG_PHOTO_HOLD_MS;
  }
  return 380;
}

function addFlag(routeId, f) {
  S.flagIds.add(f.id);
  const num = ++S.flagNum;
  const sev = f.severity || 1;
  const rec = { routeId, f, num, sev, pin: null, li: null };
  S.flags.push(rec);
  const R = S.routes.get(routeId);
  const label = TYPE_LABEL[f.type] || f.type;

  if (f.location) {
    const icon = L.divIcon({
      className: "pin",
      iconSize: [40, 50],
      iconAnchor: [20, 50],
      html: `<div class="pin-pulse" style="border-color:${SEV_COLOR[sev]}"></div><div class="pin-shadow"></div><div class="pin-body sev${sev}"></div><div class="pin-num">${num}</div>`,
    });
    rec.pin = L.marker([f.location.lat, f.location.lng], { icon, zIndexOffset: 2000 + num, interactive: false }).addTo(pinLayer);
  }

  const li = el("li", "",
    `<div class="p-num sev${sev}">${num}</div>` +
    `<div><div class="p-title"><span class="p-glyph" style="color:${T.TYPE_COLOR[f.type] || "#c4cfe2"}">${T.glyph(f.type, 18)}</span>${esc(label)}<span class="rchip" style="background:${R ? R.color : "#888"}">${esc(routeId)}</span></div>` +
    (f.note ? `<div class="p-note">${esc(f.note)}</div>` : "") +
    `<div class="p-src">${esc(SOURCE_LABEL[f.source] || f.source || "")}${f.confidence != null ? ` · ${Math.round(f.confidence * 100)}% sure` : ""}</div></div>`);
  rec.li = li;
  const list = $("problems-list");
  list.appendChild(li);
  $("problems-empty").classList.add("hidden");
  $("problems-count").textContent = S.flags.length;
  trimProblemList();

  setCounter("c-problems", S.flags.length);
  if (R) {
    R.flags.push(rec);
    R.score += sev * sev * (f.confidence ?? 1);
    updateRow(R, rec);
  }
}

// Keep the problems card inside the map: drop the oldest low-severity rows from view if it overflows.
function trimProblemList() {
  const card = $("problems"), list = $("problems-list");
  const max = $("map-wrap").clientHeight - 36;
  const items = [...list.children];
  items.forEach((n) => (n.style.display = ""));
  const order = S.flags.slice().sort((a, b) => a.sev - b.sev || a.num - b.num);
  let i = 0;
  while (card.scrollHeight > max && i < order.length - 1) {
    order[i].li.style.display = "none";
    i++;
  }
}

function showFlagPhoto(routeId, f) {
  const R = S.routes.get(routeId);
  const fake = {
    e: { routeId, frameId: "flag-" + f.id, location: f.location, distM: 0, imagePath: f.imagePath, photoDate: f.photoDate },
    verdict: { verdict: f.type, severity: f.severity, confidence: f.confidence, box: f.box, note: f.note },
    shown: true,
  };
  $("photo-empty").classList.add("hidden");
  const shot = buildShot(fake);
  shot.querySelector(".caption .mono").textContent = SOURCE_LABEL[f.source] || "";
  $("photo").querySelectorAll(".shot").forEach((old) => { old.classList.add("leave"); setTimeout(() => old.remove(), 260); });
  shot.classList.add("enter");
  $("photo").appendChild(shot);
  fake.shot = shot;
  stampShot(fake, true);
  $("photo-meta").textContent = `Problem #${S.flagNum} · Route ${routeId}`;
  if (R) S.problemPhotos.add(f.imagePath);
}

// ─── Done ─────────────────────────────────────────────────────────────────────
function handleDone(e) {
  const res = e.result;
  S.done = true; S.result = res; S.doneAt = Date.now();
  S.endedAt = Date.now();
  document.body.classList.remove("scanning");
  // Make sure every final flag is on the map (e.g. if flag events were missed).
  for (const r of res.routes || []) {
    for (const f of r.flags || []) if (!S.flagIds.has(f.id)) addFlag(r.routeId, f);
    const R = S.routes.get(r.routeId);
    if (R) { R.finalScore = r.score; R.walked = R.len; }
  }
  const winId = res.recommendedRouteId;
  const W = S.routes.get(winId);
  for (const R of S.routes.values()) {
    const win = R.id === winId;
    R.row.classList.toggle("win", win);
    R.row.classList.toggle("lose", !win);
    R.walker.getElement()?.classList.add("finished");
    if (win) {
      R.trail.setLatLngs(R.pts);
      R.trail.setStyle({ color: WIN, weight: 9, opacity: 1 });
      R.glow.setStyle({ color: WIN, weight: 24, opacity: 0.28 });
      R.base.setStyle({ opacity: 0 });
      R.trail.bringToFront();
      R.walker.setLatLng(R.pts[R.pts.length - 1]);
    } else {
      R.trail.setStyle({ opacity: 0.35, weight: 5 });
      R.glow.setStyle({ opacity: 0.04 });
      R.base.setStyle({ opacity: 0.25 });
      R.walker.setOpacity(0.35);
    }
    updateRow(R);
  }
  for (const fr of S.flags) {
    const win = fr.routeId === winId;
    fr.li.classList.toggle("dimmed", !win);
    fr.li.classList.toggle("win", win);
    if (fr.pin) fr.pin.getElement()?.classList.toggle("dimmed", !win);
  }
  drawNight(res);
  const googleId = res.googleDefaultRouteId;
  for (const R of S.routes.values()) {
    const t = R.row.querySelector(".rname-t");
    t.querySelector(".gpick")?.remove();
    if (googleId === R.id) t.appendChild(el("small", "gpick", "Google's pick"));
  }
  // Banner
  const avoided = S.flags.filter((fr) => fr.routeId !== winId).sort((a, b) => b.sev - a.sev)[0];
  $("banner-title").textContent = `Route ${winId} recommended`;
  const parts = [];
  if (W) parts.push(`${fmtNum(W.durationMin)} min walk`);
  const night = res.persona === "night_solo" || S.persona === "night_solo";
  const wr = (res.routes || []).find((r) => r.routeId === winId);
  if (night && wr) {
    const others = (res.routes || []).filter((r) => r !== wr && typeof r.litFraction === "number");
    if (typeof wr.litFraction === "number") parts.push(others.length && others.every((r) => r.litFraction < wr.litFraction) ? `better lit (${Math.round(wr.litFraction * 100)}%)` : `${Math.round(wr.litFraction * 100)}% lit`);
    const phones = (wr.highlights || []).filter((h) => h.type === "blue_light_phone").length;
    if (phones) parts.push(`${phones} blue-light phone${phones === 1 ? "" : "s"}`);
  } else if (avoided) parts.push(`avoids ${(avoided.f.note || TYPE_LABEL[avoided.f.type] || "").replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}`);
  else if (W && !W.flags.length) parts.push("no problems found");
  $("banner-sub").textContent = parts.join(" · ");
  $("banner-google").textContent = googleId && googleId !== winId ? `Google Maps would have sent you on Route ${googleId}` : googleId === winId ? "Same route Google Maps picks" : "";
  $("banner").classList.remove("hidden");
  if (W) {
    const b = L.latLngBounds(W.pts);
    if (instant) map.fitBounds(b, fitPad()); else setTimeout(() => map.flyToBounds(b, { ...fitPad(), duration: 1.2 }), 400);
  }
  setPhase("done", `Done · recommended Route ${winId}`);
  setConn();
  $("pbar-fill").style.width = "100%";
  const stale = instant && Date.now() - S.startedAt > STALE_SCOUT_MS;
  if (stale) showIdle(); else scheduleIdle(IDLE_AFTER_DONE_MS);
  return 0;
}

// Night mode: hatched unlit / away-from-road stretches and blue-light phones, from the final result.
function drawNight(res) {
  nightLayer.clearLayers();
  const seen = [];
  for (const r of res.routes || []) {
    const R = S.routes.get(r.routeId);
    if (R) for (const f of r.flags || []) T.drawStretch(nightLayer, R.pts, f, { weight: r.routeId === res.recommendedRouteId ? 9 : 6 });
    for (const h of r.highlights || []) {
      if (!h.location || seen.some((x) => x.type === h.type && distM([x.location.lat, x.location.lng], [h.location.lat, h.location.lng]) < 15)) continue;
      seen.push(h);
      T.highlightMarker(h, 38).addTo(nightLayer);
    }
  }
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────
function buildRow(R) {
  const rows = $("board-rows");
  rows.querySelector(".board-empty")?.remove();
  const row = el("div", "brow",
    `<div class="rname"><span class="rchip" style="background:${R.color}">${esc(R.id)}</span><span class="rname-t">Route ${esc(R.id)}</span></div>` +
    `<div class="rtime">${fmtNum(R.durationMin)}<small>min</small></div>` +
    `<div class="rbar"><div class="rbar-fill" style="background:${R.color}"></div></div>` +
    `<div class="rphotos">0</div>` +
    `<div class="rprobs"><span class="none">—</span></div>` +
    `<div class="rscore">0</div>` +
    `<div class="rstatus">Scouting…</div>`);
  rows.appendChild(row);
  return row;
}
function updateRow(R, newFlag) {
  const row = R.row;
  if (!row) return;
  const pct = Math.min(100, (R.walked / R.len) * 100);
  const fill = row.querySelector(".rbar-fill");
  fill.style.width = (S.done ? 100 : pct) + "%";
  if (S.done) fill.style.background = S.result?.recommendedRouteId === R.id ? WIN : R.color;
  row.querySelector(".rphotos").textContent = R.photos;
  const probs = row.querySelector(".rprobs");
  if (newFlag) {
    probs.querySelector(".none")?.remove();
    probs.appendChild(el("span", `p-num sev${newFlag.sev}`, String(newFlag.num)));
  }
  const score = R.finalScore ?? R.score;
  row.querySelector(".rscore").textContent = fmtNum(score);
  const st = row.querySelector(".rstatus");
  const worst = R.flags.slice().sort((a, b) => b.sev - a.sev)[0];
  if (S.done && S.result?.recommendedRouteId === R.id) st.innerHTML = "✓ RECOMMENDED";
  else if (worst) st.innerHTML = `<span class="worst">${worst.sev === 3 ? "⛔" : "⚠"} ${esc(worst.f.note || TYPE_LABEL[worst.f.type])}</span>`;
  else if (S.done) st.textContent = "No problems found";
  else st.textContent = pct >= 99 ? "Checked" : `Scouting… ${Math.round(pct)}%`;
}

// Shrink the "From → To" line until it fits on one line.
function fitTrip() {
  const n = document.querySelector(".trip-route");
  let size = 44;
  n.style.fontSize = size + "px";
  while (n.scrollWidth > n.clientWidth + 1 && size > 24) n.style.fontSize = --size + "px";
}

// ─── Header bits ──────────────────────────────────────────────────────────────
function setPhase(kind, text) {
  const p = $("phase");
  p.className = "phase " + kind;
  $("phase-text").textContent = text;
}
function setCounter(id, val) {
  const n = $(id);
  const s = String(val);
  if (n.textContent === s) return;
  n.textContent = s;
  if (!instant) { n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump"); }
}
setInterval(() => {
  if (!S.scoutId) return;
  const end = S.done || S.error ? S.endedAt || Date.now() : Date.now();
  const s = Math.max(0, Math.floor((end - S.startedAt) / 1000));
  $("c-elapsed").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}, 250);

// ─── Idle ─────────────────────────────────────────────────────────────────────
function scheduleIdle(ms) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showIdle, ms);
}
function showIdle() { $("idle").classList.remove("hidden"); }
function hideIdle() { if (!FORCE_IDLE) $("idle").classList.add("hidden"); }
function setContact(phone, sms) {
  $("idle-phone").textContent = phone || "";
  $("qr").innerHTML = "";
  $("qr-wrap").classList.add("hidden");
  if (!sms || !window.QRCode) return;
  try {
    new QRCode($("qr"), { text: "sms:" + sms, width: 220, height: 220, colorDark: "#05080f", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    $("qr-wrap").classList.remove("hidden");
  } catch (err) { console.warn("QR failed:", err.message); }
}
setContact(TANDEM_PHONE, TANDEM_SMS);
// The server may know the real number: { phone?: "(607) 555-1234", sms?: "+16075551234" }.
fetch("/api/config", { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    if (!cfg || typeof cfg !== "object") return;
    const phone = typeof cfg.phone === "string" && cfg.phone.trim() ? cfg.phone.trim() : TANDEM_PHONE;
    const digits = phone.replace(/[^\d+]/g, "");
    const sms = typeof cfg.sms === "string" && cfg.sms.trim() ? cfg.sms.trim() : TANDEM_SMS || (/^\+?\d{10,15}$/.test(digits) ? digits : "");
    setContact(phone, sms);
  })
  .catch(() => {}); // no /api/config: keep the constants

// ─── Connection ───────────────────────────────────────────────────────────────
let es = null, retry = 1000, replayTimer = null, connected = false;
function setConn() {
  const c = $("conn"), t = $("conn-text");
  c.className = "conn " + (!connected ? "down" : S.scoutId && !S.done && !S.error ? "live" : "ready");
  t.textContent = !connected ? "RECONNECTING" : S.scoutId && !S.done && !S.error ? "LIVE" : "CONNECTED";
}
function beginReplay() {
  instant = true;
  document.body.classList.add("instant");
  clearTimeout(replayTimer);
  replayTimer = setTimeout(endReplay, REPLAY_WINDOW_MS);
}
function endReplay() {
  instant = false;
  // let the browser apply final styles before re-enabling animations
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("instant")));
  if (!S.scoutId) showIdle();
  setConn();
}
function connect() {
  try { es && es.close(); } catch {}
  es = new EventSource("/events");
  es.onopen = () => {
    connected = true; retry = 1000;
    beginReplay(); // the server replays the latest scout first; its "start" resets the page
    setConn();
  };
  es.onmessage = (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch { return; }
    try { onEvent(e); } catch (err) { console.error("event failed", e && e.type, err); }
    if (e && (e.type === "done" || e.type === "start" || e.type === "error")) setConn();
  };
  es.onerror = () => {
    connected = false;
    setConn();
    if (es.readyState === EventSource.CLOSED) {
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 10_000);
    }
  };
}

window.addEventListener("resize", () => { map.invalidateSize(); fitTrip(); if (S.flags.length) trimProblemList(); });
if (FORCE_IDLE) showIdle();
connect();
