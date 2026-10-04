// Trip details page: /trip/<id>, opened from the link Tandem texts after a scout.
// Data: GET /api/trip/<id> (the Trip type in messaging/db.ts).
"use strict";

const { $, el, esc } = T;
const RED = "#ff4d5e";
const GREEN = "#3ee08f";
const GREY = "#8792a8";
const BUS = "#ffb547";
const SERIOUS = 2; // same threshold as messaging/scout-flow.ts
const TWIN_M = 25; // same as scout-flow.ts: a shared problem keeps the direct route's number
const PERSONA_PHRASE = { wheelchair: "for a wheelchair", stroller: "for a stroller", night_solo: "for walking alone at night" };

const tripId = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
let map;
const pins = new Map(); // number → Leaflet marker
const cards = new Map(); // number → card element
const entranceMarkers = {}; // "main" | "accessible" → Leaflet marker

fetch(`/api/trip/${encodeURIComponent(tripId)}`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then(render)
  .catch((err) => {
    console.warn("trip load failed:", err.message);
    $("loading").classList.add("hidden");
    $("notfound").classList.remove("hidden");
    document.title = "Trip not found · Tandem";
  });

// ─── Numbering (must match the iMessage text, see messaging/scout-flow.ts) ─────
// Serious flags (severity ≥ 2) get numbers: the direct route's first, in array order, then the
// recommended route's. A recommended-route flag of the same type within 25 m of a direct-route flag
// is the same problem: it reuses that number and gets no pin of its own.
function numberProblems(direct, rec) {
  const items = [];
  const directSerious = direct.flags.filter((f) => f.severity >= SERIOUS);
  for (const f of directSerious) items.push({ num: items.length + 1, flag: f, onDirect: true, onRec: rec === direct });
  if (rec !== direct) {
    for (const f of rec.flags.filter((g) => g.severity >= SERIOUS)) {
      const twinIdx = directSerious.findIndex((d) => d.type === f.type && T.meters(d.location, f.location) <= TWIN_M);
      if (twinIdx >= 0) items[twinIdx].onRec = true;
      else items.push({ num: items.length + 1, flag: f, onDirect: false, onRec: true });
    }
  }
  return items;
}

// Severity-1 flags on the routes we talk about, without numbers (shared ones listed once).
function smallerThings(direct, rec) {
  const out = [];
  for (const [route, isDirect] of rec === direct ? [[direct, true]] : [[direct, true], [rec, false]]) {
    for (const f of route.flags.filter((g) => g.severity < SERIOUS)) {
      const twin = out.find((o) => o.flag.type === f.type && T.meters(o.flag.location, f.location) <= TWIN_M);
      if (twin) twin[isDirect ? "onDirect" : "onRec"] = true;
      else out.push({ flag: f, onDirect: isDirect, onRec: !isDirect || rec === direct });
    }
  }
  return out;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(trip) {
  const routes = trip.result?.routes || [];
  const direct = routes.find((r) => r.routeId === trip.directRouteId) || routes.slice().sort((a, b) => a.durationMin - b.durationMin)[0];
  if (!direct) throw new Error("no routes");
  const rec = routes.find((r) => r.routeId === trip.result.recommendedRouteId) || direct;
  const same = rec === direct;
  const problems = numberProblems(direct, rec);
  const small = smallerThings(direct, rec);
  const google = routes.find((r) => r.routeId === trip.result.googleDefaultRouteId);
  const night = trip.persona === "night_solo";
  const ctx = { trip, routes, direct, rec, same, problems, small, google, night, extras: trip.extras || {} };

  $("loading").classList.add("hidden");
  $("page").classList.remove("hidden");
  if (!document.title) document.title = `${T.placeName(trip.from)} → ${T.placeName(trip.to)} · Tandem`;

  renderHeader(ctx);
  renderVerdict(ctx);
  renderGoogle(ctx);
  renderMap(ctx);
  renderConditions(ctx);
  renderProblems(ctx);
  renderSmall(ctx);
  renderUnchecked(ctx);
  renderEntrance(ctx);
  renderFlythrough(ctx);
  renderCompare(ctx);
  if (night) renderNightHow();
}

// Same colours as the map: the route to take is green, the direct one red, the rest grey.
const routeColor = (r, { rec, direct }) => (r === rec ? GREEN : r === direct ? RED : GREY);
const blueLights = (r) => (r.highlights || []).filter((h) => h.type === "blue_light_phone").length;
const openPlaces = (r) => (r.highlights || []).filter((h) => h.type === "open_place").length;
const stretchM = (r, type) => r.flags.filter((f) => f.type === type && f.stretch).reduce((s, f) => s + f.stretch.lengthM, 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function renderHeader({ trip }) {
  $("from").textContent = T.placeName(trip.from);
  $("to").textContent = T.placeName(trip.to);
  $("from").title = trip.from;
  $("to").title = trip.to;
  $("persona").textContent = T.PERSONA[trip.persona] || trip.persona || "";
  $("persona").classList.toggle("night", trip.persona === "night_solo");
  const tick = () => ($("checked").textContent = `Checked ${T.ago(trip.createdAt)}`);
  tick();
  setInterval(tick, 60_000);
}

const minutes = (m) => `${Math.max(1, Math.round(m))} min`;

function stepCount(f) {
  const m = /(\d+)\s*(steps|stairs)/i.exec(f.note || "");
  return m ? Number(m[1]) : null;
}

function avoidPhrase(f) {
  if (f.type === "steps") {
    const n = stepCount(f);
    return n ? `${n} steps` : "the stairs";
  }
  if (f.type === "unlit") return f.stretch ? `${Math.round(f.stretch.lengthM)} m with no street lights` : "an unlit stretch";
  if (f.type === "isolated") return f.stretch ? `${Math.round(f.stretch.lengthM)} m away from roads` : "a stretch away from roads";
  return {
    no_curb_ramp: "a missing curb ramp", steep_grade: "a steep grade", broken_sidewalk: "broken sidewalk",
    obstruction: "an obstruction", construction: "construction", transit_outage: "a transit outage",
  }[f.type] || "a problem";
}

// Short chip text for one problem type on a route: "14 steps", "steep grade", "240 m unlit".
function shortPhrase(type, flags) {
  if (type === "steps") {
    const n = flags.reduce((s, f) => s + (stepCount(f) || 0), 0);
    return n ? `${n} steps` : flags.length > 1 ? `${flags.length} stairways` : "stairs";
  }
  const m = flags.reduce((s, f) => s + (f.stretch?.lengthM || 0), 0);
  if (type === "unlit") return m ? `${Math.round(m)} m unlit` : "unlit stretch";
  if (type === "isolated") return m ? `${Math.round(m)} m off-road` : "away from roads";
  const label = T.typeLabel(type).toLowerCase();
  return flags.length > 1 ? `${flags.length}× ${label}` : label;
}
const NO_PHRASE = { steps: "no steps", no_curb_ramp: "curb ramps OK", steep_grade: "no steep grade", broken_sidewalk: "smooth sidewalk", obstruction: "nothing in the way", construction: "no construction", unlit: "lit the whole way", isolated: "stays near roads" };

// Serious problems on a route, grouped by type, worst first.
function seriousByType(r) {
  const groups = new Map();
  for (const f of r.flags.filter((g) => g.severity >= SERIOUS).sort((a, b) => b.severity - a.severity)) {
    if (!groups.has(f.type)) groups.set(f.type, []);
    groups.get(f.type).push(f);
  }
  return groups;
}

function joinAnd(parts) {
  const u = [...new Set(parts)];
  return u.length <= 1 ? u.join("") : `${u.slice(0, -1).join(", ")} and ${u.at(-1)}`;
}

function renderVerdict({ trip, direct, rec, same, problems }) {
  const box = $("verdict");
  const directProblems = problems.filter((p) => p.onDirect);
  const who = PERSONA_PHRASE[trip.persona] ? ` ${PERSONA_PHRASE[trip.persona]}` : "";
  let title, sub, kind;
  if (!same) {
    const recSerious = rec.flags.filter((f) => f.severity >= SERIOUS);
    const avoided = directProblems.filter((p) => !recSerious.some((g) => g.type === p.flag.type));
    const extra = rec.durationMin - direct.durationMin;
    const time = extra >= 0.75 ? `adds about ${minutes(extra)}` : extra <= -0.75 ? `and it's ${minutes(-extra)} faster` : "about the same time";
    const what = avoided.length ? `Avoids ${joinAnd(avoided.map((p) => avoidPhrase(p.flag)))}` : "Avoids the worst of it";
    title = "Take the green route";
    sub = `${what}, ${time} (${minutes(rec.durationMin)}).`;
    if (trip.persona === "night_solo") {
      const why = nightReasons(direct, rec);
      if (why.length) {
        const cap = (x) => x.replace(/^./, (c) => c.toUpperCase());
        sub = `${cap(why.join(", "))}. ${cap(time.replace(/^and /, ""))} (${minutes(rec.durationMin)}).`;
        const left = problems.filter((p) => p.onRec);
        if (left.length) sub += ` Heads up: it still has ${joinAnd(left.map((p) => `${avoidPhrase(p.flag)} (#${p.num})`))}.`;
      }
    }
    const left = problems.filter((p) => p.onRec);
    if (left.length) sub += ` Heads up: it still has ${joinAnd(left.map((p) => `${avoidPhrase(p.flag)} (#${p.num})`))}.`;
    kind = "go";
  } else if (directProblems.length === 0) {
    title = "The direct route looks clear";
    sub = `About ${minutes(direct.durationMin)}. No serious problems${who}.`;
    if (trip.persona === "night_solo") {
      title = "The direct route looks OK tonight";
      const bits = [typeof direct.litFraction === "number" ? `${pct(direct.litFraction)} lit` : "", blueLights(direct) ? plural(blueLights(direct), "blue-light phone") : ""].filter(Boolean);
      sub = `About ${minutes(direct.durationMin)}${bits.length ? `, ${bits.join(", ")}` : ""}. It stays near roads and street lights.`;
    }
    kind = "go";
  } else {
    title = "The direct route is your best option";
    sub = `About ${minutes(direct.durationMin)}, with ${directProblems.length} problem${directProblems.length === 1 ? "" : "s"} listed below. Tandem didn't find a clearer way.`;
    kind = "warn";
  }
  box.classList.add(kind);
  $("verdict-icon").textContent = kind === "go" ? "✓" : "!";
  $("verdict-title").textContent = title;
  $("verdict-sub").textContent = sub;
}

// Why the green route is better at night: "better lit", "stays near roads", "2 blue-light phones".
function nightReasons(direct, rec) {
  const out = [];
  const dl = direct.litFraction, rl = rec.litFraction;
  if (typeof dl === "number" && typeof rl === "number" && rl - dl >= 0.05) out.push("better lit");
  else if (stretchM(rec, "unlit") < stretchM(direct, "unlit")) out.push("better lit");
  const di = direct.flags.filter((f) => f.type === "isolated").length, ri = rec.flags.filter((f) => f.type === "isolated").length;
  if (ri < di || stretchM(rec, "isolated") < stretchM(direct, "isolated")) out.push("stays near roads");
  const b = blueLights(rec);
  if (b) out.push(plural(b, "blue-light phone"));
  const o = openPlaces(rec);
  if (o && out.length < 3) out.push(`passes ${o === 1 ? "a place" : `${o} places`} open late`);
  return out;
}

// ─── Google vs Tandem ─────────────────────────────────────────────────────────
function renderGoogle(ctx) {
  const { google, rec, night } = ctx;
  if (!google) return;
  const sec = $("google-sec");
  sec.classList.remove("hidden");
  if (google === rec) {
    sec.innerHTML = `<div class="agree"><span class="g-logo">G</span><span><b>Tandem agrees with Google's route.</b> It's also Tandem's pick ${PERSONA_PHRASE[ctx.trip.persona] || "for you"}.</span></div>`;
    return;
  }
  const gTypes = seriousByType(google), rTypes = seriousByType(rec);
  const chips = (r, own, other) => {
    const out = [`<span class="gchip time">${minutes(r.durationMin)}</span>`];
    if (night && typeof r.litFraction === "number") out.push(`<span class="gchip ${r.litFraction >= 0.7 ? "good" : "bad"}">${pct(r.litFraction)} lit</span>`);
    for (const [type, flags] of own) out.push(`<span class="gchip ${flags[0].severity >= 3 ? "bad" : "warn"}">${T.glyph(type, 13)}${esc(shortPhrase(type, flags))}</span>`);
    const clearOf = (type) => !r.flags.some((f) => f.type === type) && !(type === "unlit" && typeof r.litFraction === "number" && r.litFraction < 0.95);
    if (other) for (const type of other.keys()) if (!own.has(type) && NO_PHRASE[type] && (!T.NIGHT_TYPES.has(type) || clearOf(type))) out.push(`<span class="gchip good">✓ ${esc(NO_PHRASE[type])}</span>`);
    if (night && blueLights(r)) out.push(`<span class="gchip blue">${T.glyph("blue_light_phone", 13)}${plural(blueLights(r), "blue-light phone")}</span>`);
    if (!own.size && !(other && other.size)) out.push(`<span class="gchip good">✓ no problems</span>`);
    return out.join("");
  };
  sec.innerHTML =
    `<h2 class="eyebrow">Google Maps vs Tandem</h2>` +
    `<div class="gvt card">` +
    `<div class="gside google"><i style="background:${routeColor(google, ctx)}"></i><div><div class="glabel"><span class="g-logo">G</span>Google Maps would send you this way</div><div class="gchips">${chips(google, gTypes, null)}</div></div></div>` +
    `<div class="gvs">vs</div>` +
    `<div class="gside tandem"><i style="background:${GREEN}"></i><div><div class="glabel"><span class="logo-dot"></span>Tandem's way</div><div class="gchips">${chips(rec, rTypes, gTypes)}</div></div></div>` +
    `</div>`;
}

// ─── Map ──────────────────────────────────────────────────────────────────────
function renderMap(ctx) {
  const { routes, direct, rec, same, problems, trip, google, extras } = ctx;
  map = T.darkMap("map", { scrollWheelZoom: false, tap: true });
  const all = [];
  const draw = (r, color, { weight = 6, opacity = 1, glow = true } = {}) => {
    const pts = T.decodePolyline(r.polyline || "");
    if (pts.length < 2) return pts;
    all.push(...pts);
    if (glow) L.polyline(pts, { color, weight: weight + 10, opacity: 0.16, lineCap: "round", lineJoin: "round", interactive: false }).addTo(map);
    L.polyline(pts, { color, weight, opacity, lineCap: "round", lineJoin: "round", interactive: false }).addTo(map);
    return pts;
  };
  for (const r of routes) if (r !== direct && r !== rec) draw(r, GREY, { weight: 4, opacity: 0.4, glow: false });
  // When the direct route is also the recommended one, it's the route to take: draw it green.
  const directPts = draw(direct, same ? GREEN : RED, { weight: same ? 7 : 6, opacity: same ? 1 : 0.9 });
  const recPts = same ? directPts : draw(rec, GREEN, { weight: 7 });

  // Night: unlit / away-from-road stretches as a hatched overlay on the routes we talk about.
  const nightTypes = new Set();
  for (const [r, pts] of same ? [[direct, directPts]] : [[direct, directPts], [rec, recPts]]) {
    for (const f of r.flags) if (T.drawStretch(map, pts, f, { weight: r === rec ? 7 : 6 })) nightTypes.add(f.type);
  }

  // Bus alternative.
  const busPts = extras.transit?.polyline ? T.decodePolyline(extras.transit.polyline) : [];
  if (busPts.length >= 2) {
    all.push(...busPts);
    L.polyline(busPts, { color: BUS, weight: 10, opacity: 0.14, lineCap: "round", interactive: false }).addTo(map);
    L.polyline(busPts, { color: BUS, weight: 4, opacity: 0.95, dashArray: "1 9", lineCap: "round", interactive: false }).addTo(map);
  }

  // Stretches of the recommended route the scout couldn't see in Street View.
  for (const s of trip.unchecked?.[rec.routeId] || []) {
    const seg = sliceByDistance(recPts, s.startM, s.startM + s.lengthM);
    if (seg.length >= 2) L.polyline(seg, { color: "#e8edf5", weight: 3, opacity: 0.9, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(map);
  }

  const startPt = directPts[0] || recPts[0];
  const endPt = directPts.at(-1) || recPts.at(-1);
  if (startPt) endpoint(startPt, "start", `Start · ${T.placeName(trip.from)}`);
  if (endPt) endpoint(endPt, "end", `End · ${T.placeName(trip.to)}`);

  // Night highlights along the routes (blue-light phones, places open late), shared ones once.
  const hls = [];
  for (const r of same ? [rec] : [rec, direct]) {
    for (const h of r.highlights || []) if (h.location && !hls.some((x) => x.type === h.type && T.meters(x.location, h.location) < 15)) hls.push(h);
  }
  for (const h of hls) T.highlightMarker(h, 28).addTo(map);

  // Destination entrances: a door, green if it's the accessible one.
  const ent = extras.entrance;
  const doors = [];
  if (ent?.main?.location) doors.push({ e: ent.main, kind: ent.accessible ? "main" : ent.main.wheelchair === "yes" ? "ok" : "main", label: "Main entrance", key: "main" });
  if (ent?.accessible?.location) doors.push({ e: ent.accessible, kind: "ok", label: "Accessible entrance", key: "accessible" });
  for (const d of doors) {
    const icon = L.divIcon({ className: `door ${d.kind}`, iconSize: [30, 30], iconAnchor: [15, 15], html: `<div class="door-dot">${T.glyph("door", 17)}</div>` });
    const m = L.marker([d.e.location.lat, d.e.location.lng], { icon, zIndexOffset: 800, title: d.label }).addTo(map);
    m.bindTooltip(`${d.label}${d.e.side ? ` · ${d.e.side}` : ""}`, { direction: "top", offset: [0, -14] });
    entranceMarkers[d.key] = m;
    all.push([d.e.location.lat, d.e.location.lng]);
  }

  for (const p of problems.slice().reverse()) {
    const f = p.flag;
    if (!f.location) continue;
    const icon = L.divIcon({
      className: "pin",
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      html: `<div class="pin-shadow"></div><div class="pin-body sev${f.severity}"></div><div class="pin-num">${p.num}</div>`,
    });
    const m = L.marker([f.location.lat, f.location.lng], { icon, zIndexOffset: 1000 - p.num, keyboard: true, title: `${p.num}. ${T.typeLabel(f.type)}` }).addTo(map);
    m.on("click", () => focusProblem(p.num, "map"));
    pins.set(p.num, m);
  }

  if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [28, 28], maxZoom: 18 });
  else map.setView([42.4475, -76.484], 16);

  const legend = [];
  const gOther = google && google !== direct && google !== rec;
  if (!same) legend.push(`<span><i style="background:${RED}"></i>${google === direct ? "Google's route" : "Direct"}</span>`, `<span><i style="background:${GREEN}"></i>Green route${google === rec ? " (Google's too)" : ""}</span>`);
  else legend.push(`<span><i style="background:${GREEN}"></i>Your route${google === rec ? " (Google's too)" : ""}</span>`);
  if (routes.length > (same ? 1 : 2)) legend.push(`<span><i style="background:${GREY};opacity:.6"></i>${gOther && routes.length === (same ? 2 : 3) ? "Google's route" : gOther ? "Other (incl. Google's)" : "Other"}</span>`);
  if ((trip.unchecked?.[rec.routeId] || []).length) legend.push(`<span><i class="dash"></i>Not seen</span>`);
  for (const t of nightTypes) legend.push(`<span><i class="hatch" style="--c:${T.TYPE_COLOR[t]}"></i>${esc(T.typeLabel(t))}</span>`);
  for (const type of new Set(hls.map((h) => h.type))) legend.push(`<span><b class="lg-dot" style="background:${T.HIGHLIGHT_COLOR[type]}"></b>${esc(T.HIGHLIGHT_LABEL[type])}</span>`);
  if (doors.length) legend.push(`<span><b class="lg-dot" style="background:${GREEN}"></b>Entrance</span>`);
  if (busPts.length >= 2) legend.push(`<span><i class="dots" style="--c:${BUS}"></i>Bus</span>`);
  $("legend").innerHTML = legend.join("");
}

function endpoint(pt, kind, label) {
  const icon = L.divIcon({ className: `endpoint ${kind}`, iconSize: [22, 22], iconAnchor: [11, 11], html: kind === "end" ? "<span>★</span>" : "" });
  L.marker(pt, { icon, zIndexOffset: 500, keyboard: false }).bindTooltip(label, { direction: "top", offset: [0, -10] }).addTo(map);
}

const sliceByDistance = T.sliceByDistance;

// ─── Problem cards ────────────────────────────────────────────────────────────
function routeTag(p, same) {
  if (same) return "";
  if (p.onDirect && p.onRec) return `<span class="rtag both">Both routes</span>`;
  return p.onDirect ? `<span class="rtag direct">Direct route</span>` : `<span class="rtag green">Green route</span>`;
}

function metaLine(f) {
  const parts = [T.SOURCE_LABEL[f.source] || f.source];
  if (f.stretch?.lengthM) parts.push(`${Math.round(f.stretch.lengthM)} m stretch`);
  if (typeof f.confidence === "number") parts.push(`${Math.round(f.confidence * 100)}% sure`);
  return parts.filter(Boolean).map(esc).join(" · ");
}

function renderProblems({ problems, same }) {
  if (!problems.length) return;
  $("problems-sec").classList.remove("hidden");
  $("problems-count").textContent = problems.length;
  const list = $("problems");
  for (const p of problems) {
    const f = p.flag;
    const li = el("li", `problem card psev${f.severity}`);
    li.tabIndex = 0;
    li.innerHTML =
      `<div class="problem-head">` +
      `<div class="num sev${f.severity}">${p.num}</div>` +
      `<div class="problem-text">` +
      `<div class="problem-title"><span class="glyph"${T.TYPE_COLOR[f.type] ? ` style="color:${T.TYPE_COLOR[f.type]}"` : ""}>${T.glyph(f.type, 15)}</span>${esc(T.typeLabel(f.type))}${routeTag(p, same)}</div>` +
      (f.note ? `<div class="problem-note">${esc(f.note)}</div>` : "") +
      `<div class="problem-meta">${metaLine(f)}</div>` +
      `</div></div>`;
    if (f.imagePath) li.appendChild(T.photoFigure(f.imagePath, { box: f.box, severity: f.severity, label: T.typeLabel(f.type), caption: T.streetViewCaption(f.photoDate) }));
    li.addEventListener("click", () => focusProblem(p.num, "card"));
    li.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), focusProblem(p.num, "card")));
    list.appendChild(li);
    cards.set(p.num, li);
  }
}

function renderSmall({ small, same }) {
  if (!small.length) return;
  $("small-sec").classList.remove("hidden");
  const list = $("small");
  for (const s of small) {
    const f = s.flag;
    const li = el("li", "small-item");
    li.innerHTML =
      `<span class="dot sev1"></span>` +
      `<div><div class="small-title">${esc(T.typeLabel(f.type))}${routeTag(s, same)}</div>` +
      (f.note ? `<div class="problem-note">${esc(f.note)}</div>` : "") +
      `<div class="problem-meta">${metaLine(f)}${f.photoDate ? ` · photo from ${esc(T.photoDate(f.photoDate))}` : ""}</div></div>`;
    if (f.location) {
      li.classList.add("tappable");
      li.addEventListener("click", () => {
        showMap();
        map.flyTo([f.location.lat, f.location.lng], Math.max(map.getZoom(), 18), { duration: 0.6 });
      });
    }
    list.appendChild(li);
  }
}

function focusProblem(num, from) {
  for (const [n, c] of cards) c.classList.toggle("active", n === num);
  for (const [n, m] of pins) m.getElement()?.classList.toggle("active", n === num);
  const pin = pins.get(num);
  if (from === "card" && pin) {
    showMap();
    map.flyTo(pin.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.6 });
  } else if (from === "map") {
    cards.get(num)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// On a phone the map scrolls away; bring it back before panning so the move is visible.
function showMap() {
  const r = $("map-card").getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) $("map-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Unchecked, flythrough, comparison ────────────────────────────────────────
function renderUnchecked({ trip, rec, same }) {
  const stretches = trip.unchecked?.[rec.routeId] || [];
  if (!stretches.length) return;
  const m = Math.max(10, Math.round(stretches.reduce((s, x) => s + (x.lengthM || 0), 0) / 10) * 10);
  const n = $("unchecked");
  n.classList.remove("hidden");
  n.innerHTML = `<span class="note-ico">👁</span><div><b>Couldn't see about ${m} m ${same ? "of the route" : "of the green route"} in Street View.</b> That part wasn't checked, so keep an eye out there. It's dotted on the map.</div>`;
}

function renderFlythrough({ trip }) {
  if (!trip.flythrough) return;
  $("fly-sec").classList.remove("hidden");
  const img = $("fly-img");
  img.onerror = () => $("fly-sec").classList.add("hidden");
  img.src = T.fileUrl(trip.flythrough);
}

function renderCompare({ routes, direct, rec, same, problems, google, night }) {
  const order = [direct, ...(same ? [] : [rec]), ...routes.filter((r) => r !== direct && r !== rec)];
  const rows = order.map((r, i) => {
    const isRec = r === rec;
    const color = isRec ? GREEN : r === direct ? RED : GREY;
    const name = r === direct ? (same ? "Direct route" : "Direct route") : isRec ? "Green route" : `Route ${esc(r.routeId)}`;
    const serious = r.flags.filter((f) => f.severity >= SERIOUS);
    const minor = r.flags.length - serious.length;
    const nums = serious.map((f) => {
      const p = problems.find((x) => x.flag === f) ||
        (r === rec ? problems.find((x) => x.onDirect && x.flag.type === f.type && T.meters(x.flag.location, f.location) <= TWIN_M) : null);
      return `<span class="num mini sev${f.severity}">${p ? p.num : "•"}</span>`;
    });
    const probs = serious.length ? nums.join("") : `<span class="none">None</span>`;
    const lit = typeof r.litFraction === "number" ? Math.max(0, Math.min(1, r.litFraction)) : null;
    const litRow = night && lit != null
      ? `<div class="clit"><span class="clit-bar"><span style="width:${lit * 100}%"></span></span><b>${pct(lit)} lit</b>` +
        (blueLights(r) ? `<span class="clit-hl" style="color:${T.HIGHLIGHT_COLOR.blue_light_phone}">${T.glyph("blue_light_phone", 12)}${blueLights(r)}</span>` : "") +
        (openPlaces(r) ? `<span class="clit-hl" style="color:${T.HIGHLIGHT_COLOR.open_place}">${T.glyph("open_place", 12)}${openPlaces(r)}</span>` : "") +
        `</div>`
      : "";
    const tags = (isRec ? `<small>Recommended</small>` : "") + (r === google ? `<small class="gpick">Google's pick</small>` : "");
    return (
      `<div class="crow ${isRec ? "win" : ""}">` +
      `<div class="cname"><i style="background:${color}"></i><span>${name}${tags}</span></div>` +
      `<div class="ctime">${Math.max(1, Math.round(r.durationMin))}<small>min</small></div>` +
      `<div class="cprobs">${probs}${minor ? `<span class="minor">+${minor} minor</span>` : ""}</div>` +
      `<div class="cscore">${Math.round(r.score * 10) / 10}</div>` +
      litRow +
      `</div>`
    );
  });
  $("compare").innerHTML =
    `<div class="crow chead"><div>Route</div><div>Time</div><div>Problems</div><div>Score</div></div>` + rows.join("");
}

// ─── Weather + bus ────────────────────────────────────────────────────────────
function weatherIcon(w, night) {
  if (w.snow) return "❄️";
  if (w.precipitation) return "🌧️";
  if (/cloud|overcast/i.test(w.summary || "")) return "☁️";
  return night ? "🌙" : "☀️";
}

function renderConditions({ extras, night }) {
  const w = extras.weather, b = extras.transit;
  if (!w && !b) return;
  const sec = $("cond-sec");
  sec.classList.remove("hidden");
  $("cond-title").textContent = w && b ? "Weather & bus" : w ? "Weather" : "Bus option";
  let html = "";
  if (w) {
    const chips = [];
    if (w.icy) chips.push(`<span class="wchip icy">⚠ Icy</span>`);
    else if (w.snow) chips.push(`<span class="wchip">Snow</span>`);
    else if (w.precipitation) chips.push(`<span class="wchip">Wet</span>`);
    const hint = w.icy ? "Hills, ramps and stairs may be slippery." : w.snow ? "Paths may not be cleared yet." : w.precipitation ? "Paths will be wet." : "";
    html +=
      `<div class="wx"><div class="wx-ico">${weatherIcon(w, night)}</div>` +
      `<div class="wx-main"><div class="wx-line"><b class="wx-temp">${Math.round(w.tempF)}°F</b><span class="wx-sum">${esc(w.summary)}</span>${chips.join("")}</div>` +
      (hint ? `<div class="wx-hint">${esc(hint)}</div>` : "") +
      `</div></div>`;
  }
  if (b) {
    const lines = (b.lines || []).map((l) => `<span class="bline">${T.glyph("bus", 13)}${esc(l)}</span>`).join("");
    const depart = b.departStop || b.departAt
      ? `<div class="bus-dep">Leave from <b>${esc(b.departStop || "the nearest stop")}</b>${b.departAt ? ` at <b>${esc(b.departAt)}</b>` : ""}</div>`
      : "";
    html +=
      `<div class="bus ${w ? "split" : ""}">` +
      `<div class="bus-head"><span class="bus-title">Or take the bus</span><span class="bus-lines">${lines}</span></div>` +
      `<div class="bus-stats"><div><b>${Math.max(1, Math.round(b.minutes))}</b><small>min door to door</small></div><div><b>${Math.max(0, Math.round(b.walkMinutes))}</b><small>min walking</small></div></div>` +
      depart +
      (b.reason ? `<div class="bus-why">Suggested because of <b>${esc(b.reason)}</b>${b.polyline ? ". Dotted on the map." : "."}</div>` : "") +
      `</div>`;
  }
  $("cond").innerHTML = html;
}

// ─── Entrance ─────────────────────────────────────────────────────────────────
const WHEEL = {
  yes: ["ok", "Step-free"],
  limited: ["warn", "Limited access"],
  no: ["bad", "Not accessible"],
  unknown: ["unk", "Not mapped"],
};

function renderEntrance({ extras }) {
  const ent = extras.entrance;
  if (!ent) return;
  $("ent-sec").classList.remove("hidden");
  $("ent-title").textContent = `Getting in · ${ent.building}`;
  const box = $("ent");
  box.innerHTML = `<p class="ent-note">${esc(ent.note)}</p>`;
  const rows = [];
  if (ent.main) rows.push({ e: ent.main, label: ent.main.name || "Main entrance", main: true });
  if (ent.accessible) rows.push({ e: ent.accessible, label: ent.accessible.name || "Accessible entrance", main: false });
  const list = el("div", "doors");
  rows.forEach((r) => {
    const [cls, text] = WHEEL[r.e.wheelchair] || WHEEL.unknown;
    const best = !r.main || (!ent.accessible && r.e.wheelchair === "yes");
    const row = el("div", `door-row ${best ? "best" : ""}`,
      `<span class="door-ico ${best ? "ok" : ""}">${T.glyph("door", 16)}</span>` +
      `<div class="door-text"><div class="door-name">${esc(r.label)}${r.main && ent.accessible && !/main/i.test(r.label) ? `<small>Main</small>` : ""}${best ? `<small class="use">Use this one</small>` : ""}</div>` +
      (r.e.side ? `<div class="door-side">${esc(r.e.side.replace(/^./, (c) => c.toUpperCase()))}</div>` : "") +
      `</div><span class="wchair ${cls}">${esc(text)}</span>`);
    const m = entranceMarkers[r.main ? "main" : "accessible"];
    if (m && r.e.location) {
      row.classList.add("tappable");
      row.tabIndex = 0;
      const go = () => { showMap(); map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 18), { duration: 0.6 }); m.openTooltip(); };
      row.addEventListener("click", go);
      row.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
    }
    list.appendChild(row);
  });
  box.appendChild(list);
  if (ent.photo?.imagePath) {
    const aimed = ent.accessible ? (ent.accessible.name || "accessible entrance") : (ent.main?.name || "main entrance");
    box.appendChild(T.photoFigure(ent.photo.imagePath, { caption: `${T.streetViewCaption(ent.photo.photoDate)} · aimed at the ${aimed.toLowerCase()}` }));
  }
}

// ─── Night wording for the "how" footer ───────────────────────────────────────
function renderNightHow() {
  const how = document.querySelectorAll("#foot .how li");
  if (how[1]) how[1].innerHTML = "<b>Checks the lights and the company.</b> Street lights from OpenStreetMap, and whether a path stays near roads and buildings or cuts through empty ground.";
  if (how[2]) how[2].innerHTML = "<b>Finds help along the way.</b> Blue-light emergency phones and places that are open late, close to each route.";
  if (how[3]) how[3].innerHTML = "<b>Picks the one that feels safest.</b> Better lit and closer to people beats a couple of minutes saved.";
}
