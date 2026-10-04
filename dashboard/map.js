// Campus barrier map: /map. Every serious problem any scout found plus every user report.
// Data: GET /api/barriers → { barriers, trips, reports }. No trip ids here, ever: they're private.
"use strict";

const { $, el, esc } = T;
const CAMPUS = [42.4475, -76.484];
const REFRESH_MS = 30_000;
const CHIPS = [
  { key: "steps", label: "Stairs" },
  { key: "no_curb_ramp", label: "No curb ramp" },
  { key: "steep_grade", label: "Steep grade" },
  { key: "broken_sidewalk", label: "Broken sidewalk" },
  { key: "obstruction", label: "Obstruction" },
  { key: "construction", label: "Construction" },
  { key: "unlit", label: "No street lights", night: true },
  { key: "isolated", label: "Away from roads", night: true },
  { key: "user", label: "User reports" },
];
const SEV_LABEL = { 3: "Blocks the way", 2: "Serious", 1: "Minor" };

const map = T.darkMap("map", { zoomControl: false }).setView(CAMPUS, 16);
L.control.zoom({ position: "bottomright" }).addTo(map);
const layer = L.layerGroup().addTo(map);

const off = new Set(); // chip keys switched off
let data = { barriers: [], trips: 0, reports: 0 };
let markers = []; // { b, m }
let selected = null; // barrier key
let fitted = false;
let loaded = false;

const keyOf = (b) => `${b.type}|${b.location.lat.toFixed(5)}|${b.location.lng.toFixed(5)}|${b.source}`;
const visible = (b) => !off.has(b.type) && !(b.source === "user" && off.has("user"));

async function load() {
  try {
    const r = await fetch("/api/barriers", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const next = await r.json();
    const changed = JSON.stringify(next.barriers) !== JSON.stringify(data.barriers) || next.trips !== data.trips || next.reports !== data.reports;
    data = { barriers: next.barriers || [], trips: next.trips || 0, reports: next.reports || 0 };
    if (changed || !loaded) render();
    loaded = true;
  } catch (err) {
    console.warn("barriers load failed:", err.message);
    if (!data.barriers.length) $("stats").textContent = "Couldn't load barriers. Retrying…";
  }
}

function render() {
  const { barriers, trips, reports } = data;
  const n = (k, w) => `<b>${k}</b> ${w}${k === 1 ? "" : "s"}`;
  $("stats").innerHTML = [n(barriers.length, "barrier"), n(trips, "scout"), n(reports, "user report")].join('<span class="sep">·</span>');
  $("empty").classList.toggle("hidden", barriers.length > 0);
  renderChips();
  renderMarkers();
  if (!fitted && barriers.length) {
    fitted = true;
    fit();
  }
  if (selected) {
    const b = barriers.find((x) => keyOf(x) === selected);
    if (b) showDetail(b, false);
    else closeDetail();
  }
}

function fit() {
  const pts = data.barriers.filter(visible).map((b) => [b.location.lat, b.location.lng]);
  if (!pts.length) return;
  if (pts.length === 1) return map.setView(pts[0], 17);
  const wide = window.innerWidth >= 900;
  map.fitBounds(L.latLngBounds(pts), {
    paddingTopLeft: wide ? [460, 60] : [30, 260],
    paddingBottomRight: wide ? [60, 60] : [30, 40],
    maxZoom: 18,
  });
}

function renderChips() {
  const count = (k) => data.barriers.filter((b) => (k === "user" ? b.source === "user" : b.type === k)).length;
  const box = $("chips");
  box.innerHTML = "";
  const night = CHIPS.some((c) => c.night && count(c.key));
  $("lg-night").classList.toggle("hidden", !night);
  for (const c of CHIPS) {
    const k = count(c.key);
    if (c.night && !k && !off.has(c.key)) continue; // night chips only once a night scout found something
    const chip = el("button", `chip ${off.has(c.key) ? "off" : ""} ${k ? "" : "zero"} ${c.key === "user" ? "user" : ""} ${c.night ? "night" : ""}`,
      `<span class="chip-ico">${c.key === "user" ? '<span class="mini-ring"></span>' : T.glyph(c.key, 13)}</span>${esc(c.label)}<span class="chip-n">${k}</span>`);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(!off.has(c.key)));
    chip.onclick = () => {
      off.has(c.key) ? off.delete(c.key) : off.add(c.key);
      renderChips();
      renderMarkers();
    };
    box.appendChild(chip);
  }
}

function renderMarkers() {
  layer.clearLayers();
  markers = [];
  // Most serious on top.
  const list = data.barriers.filter(visible).slice().sort((a, b) => a.severity - b.severity);
  const size = window.innerWidth >= 900 ? 44 : 34; // bigger on the projector
  for (const b of list) {
    const sev = b.severity >= 3 ? 3 : b.severity === 2 ? 2 : 1;
    const user = b.source === "user";
    const icon = L.divIcon({
      className: `bm ${user ? "user" : ""} ${T.NIGHT_TYPES.has(b.type) ? "night" : ""} ${selected === keyOf(b) ? "active" : ""}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div class="bm-dot sev${sev}">${T.glyph(b.type, Math.round(size / 2))}</div>${b.sightings > 1 ? `<span class="bm-n">${b.sightings}</span>` : ""}`,
    });
    const m = L.marker([b.location.lat, b.location.lng], { icon, title: T.typeLabel(b.type), zIndexOffset: sev * 100 + (user ? 50 : 0), riseOnHover: true }).addTo(layer);
    m.on("click", () => showDetail(b, true));
    markers.push({ b, m });
  }
}

function showDetail(b, pan) {
  selected = keyOf(b);
  for (const { b: x, m } of markers) m.getElement()?.classList.toggle("active", keyOf(x) === selected);
  const sev = b.severity >= 3 ? 3 : b.severity === 2 ? 2 : 1;
  const body = $("detail-body");
  body.innerHTML =
    `<div class="d-head"><div class="d-ico sev${sev}">${T.glyph(b.type, 20)}</div>` +
    `<div><div class="d-title">${esc(T.typeLabel(b.type))}</div>` +
    `<div class="d-sev s${sev}">${esc(SEV_LABEL[sev])}${b.source === "user" ? '<span class="d-user">User report</span>' : ""}</div></div></div>` +
    (b.note ? `<p class="d-note">${esc(b.note)}</p>` : "") +
    `<div class="d-meta">` +
    `<div><span>Source</span><b>${esc(T.SOURCE_LABEL[b.source] || b.source)}</b></div>` +
    `<div><span>Seen</span><b>${b.sightings === 1 ? "once" : `${b.sightings} times`}</b></div>` +
    `<div><span>Last seen</span><b>${esc(b.ago || T.ago(b.seenAt))}</b></div>` +
    `</div>`;
  if (b.imagePath) body.appendChild(T.photoFigure(b.imagePath, { box: b.box, severity: sev, label: T.typeLabel(b.type), caption: T.streetViewCaption(b.photoDate) }));
  $("detail").classList.remove("hidden");
  if (pan) {
    const wide = window.innerWidth >= 900;
    // Keep the pin clear of the card: on desktop the card is on the right, on a phone it's at the bottom.
    const pt = map.project([b.location.lat, b.location.lng], Math.max(map.getZoom(), 17));
    const shift = wide ? L.point(190, 0) : L.point(0, window.innerHeight * 0.22);
    map.flyTo(map.unproject(pt.add(shift), Math.max(map.getZoom(), 17)), Math.max(map.getZoom(), 17), { duration: 0.6 });
  }
}

function closeDetail() {
  selected = null;
  $("detail").classList.add("hidden");
  for (const { m } of markers) m.getElement()?.classList.remove("active");
}

$("detail-close").onclick = closeDetail;
map.on("click", closeDetail);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDetail());

load();
setInterval(load, REFRESH_MS);
