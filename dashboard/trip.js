// Trip details page: /trip/<id>, opened from the link Tandem texts after a scout.
// Data: GET /api/trip/<id> (the Trip type in messaging/db.ts).
"use strict";

const { $, el, esc } = T;
const RED = "#ff4d5e";
const GREEN = "#3ee08f";
const GREY = "#8792a8";
const SERIOUS = 2; // same threshold as messaging/scout-flow.ts
const TWIN_M = 25; // same as scout-flow.ts: a shared problem keeps the direct route's number
const PERSONA_PHRASE = { wheelchair: "for a wheelchair", stroller: "for a stroller", night_solo: "for walking alone at night" };

const tripId = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
let map;
const pins = new Map(); // number → Leaflet marker
const cards = new Map(); // number → card element

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
  const ctx = { trip, routes, direct, rec, same, problems, small };

  $("loading").classList.add("hidden");
  $("page").classList.remove("hidden");
  if (!document.title) document.title = `${T.placeName(trip.from)} → ${T.placeName(trip.to)} · Tandem`;

  renderHeader(ctx);
  renderVerdict(ctx);
  renderMap(ctx);
  renderProblems(ctx);
  renderSmall(ctx);
  renderUnchecked(ctx);
  renderFlythrough(ctx);
  renderCompare(ctx);
}

function renderHeader({ trip }) {
  $("from").textContent = T.placeName(trip.from);
  $("to").textContent = T.placeName(trip.to);
  $("from").title = trip.from;
  $("to").title = trip.to;
  $("persona").textContent = T.PERSONA[trip.persona] || trip.persona || "";
  const tick = () => ($("checked").textContent = `Checked ${T.ago(trip.createdAt)}`);
  tick();
  setInterval(tick, 60_000);
}

const minutes = (m) => `${Math.max(1, Math.round(m))} min`;

function avoidPhrase(f) {
  if (f.type === "steps") {
    const m = /(\d+)\s*(steps|stairs)/i.exec(f.note || "");
    return m ? `${m[1]} steps` : "the stairs";
  }
  return {
    no_curb_ramp: "a missing curb ramp", steep_grade: "a steep grade", broken_sidewalk: "broken sidewalk",
    obstruction: "an obstruction", construction: "construction", transit_outage: "a transit outage",
  }[f.type] || "a problem";
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
    const left = problems.filter((p) => p.onRec);
    if (left.length) sub += ` Heads up: it still has ${joinAnd(left.map((p) => `${avoidPhrase(p.flag)} (#${p.num})`))}.`;
    kind = "go";
  } else if (directProblems.length === 0) {
    title = "The direct route looks clear";
    sub = `About ${minutes(direct.durationMin)}. No serious problems${who}.`;
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

// ─── Map ──────────────────────────────────────────────────────────────────────
function renderMap({ routes, direct, rec, same, problems, trip }) {
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

  // Stretches of the recommended route the scout couldn't see in Street View.
  for (const s of trip.unchecked?.[rec.routeId] || []) {
    const seg = sliceByDistance(recPts, s.startM, s.startM + s.lengthM);
    if (seg.length >= 2) L.polyline(seg, { color: "#e8edf5", weight: 3, opacity: 0.9, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(map);
  }

  const startPt = directPts[0] || recPts[0];
  const endPt = directPts.at(-1) || recPts.at(-1);
  if (startPt) endpoint(startPt, "start", `Start · ${T.placeName(trip.from)}`);
  if (endPt) endpoint(endPt, "end", `End · ${T.placeName(trip.to)}`);

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
  if (!same) legend.push(`<span><i style="background:${RED}"></i>Direct</span>`, `<span><i style="background:${GREEN}"></i>Green route</span>`);
  else legend.push(`<span><i style="background:${GREEN}"></i>Your route</span>`);
  if (routes.length > (same ? 1 : 2)) legend.push(`<span><i style="background:${GREY};opacity:.6"></i>Other</span>`);
  if ((trip.unchecked?.[rec.routeId] || []).length) legend.push(`<span><i class="dash"></i>Not seen</span>`);
  $("legend").innerHTML = legend.join("");
}

function endpoint(pt, kind, label) {
  const icon = L.divIcon({ className: `endpoint ${kind}`, iconSize: [22, 22], iconAnchor: [11, 11], html: kind === "end" ? "<span>★</span>" : "" });
  L.marker(pt, { icon, zIndexOffset: 500, keyboard: false }).bindTooltip(label, { direction: "top", offset: [0, -10] }).addTo(map);
}

function sliceByDistance(pts, a, b) {
  const out = [];
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const len = T.meters({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] });
    const s = d, e = d + len;
    if (e >= a && s <= b && len > 0) {
      const lerp = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      if (!out.length) out.push(lerp(Math.max(0, (a - s) / len)));
      out.push(lerp(Math.min(1, (b - s) / len)));
    }
    d = e;
    if (d > b) break;
  }
  return out;
}

// ─── Problem cards ────────────────────────────────────────────────────────────
function routeTag(p, same) {
  if (same) return "";
  if (p.onDirect && p.onRec) return `<span class="rtag both">Both routes</span>`;
  return p.onDirect ? `<span class="rtag direct">Direct route</span>` : `<span class="rtag green">Green route</span>`;
}

function metaLine(f) {
  const parts = [T.SOURCE_LABEL[f.source] || f.source];
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
      `<div class="problem-title"><span class="glyph">${T.glyph(f.type, 15)}</span>${esc(T.typeLabel(f.type))}${routeTag(p, same)}</div>` +
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

function renderCompare({ routes, direct, rec, same, problems }) {
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
    return (
      `<div class="crow ${isRec ? "win" : ""}">` +
      `<div class="cname"><i style="background:${color}"></i><span>${name}${isRec ? `<small>Recommended</small>` : ""}</span></div>` +
      `<div class="ctime">${Math.max(1, Math.round(r.durationMin))}<small>min</small></div>` +
      `<div class="cprobs">${probs}${minor ? `<span class="minor">+${minor} minor</span>` : ""}</div>` +
      `<div class="cscore">${Math.round(r.score * 10) / 10}</div>` +
      `</div>`
    );
  });
  $("compare").innerHTML =
    `<div class="crow chead"><div>Route</div><div>Time</div><div>Problems</div><div>Score</div></div>` + rows.join("");
}
