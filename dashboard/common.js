// Shared helpers for the trip page (trip.js), the campus barrier map (map.js) and the live dashboard (app.js).
"use strict";

const T = (() => {
  const SEV_COLOR = { 1: "#ffd23f", 2: "#ff9a3d", 3: "#ff4d5e" };
  const TYPE_LABEL = {
    steps: "Stairs", no_curb_ramp: "No curb ramp", steep_grade: "Steep grade", broken_sidewalk: "Broken sidewalk",
    obstruction: "Obstruction", construction: "Construction", transit_outage: "Transit outage",
    unlit: "No street lights", isolated: "Away from roads",
  };
  // Night-mode problems get their own colour (overlays, chips); severity colours still mark pins.
  const NIGHT_TYPES = new Set(["unlit", "isolated"]);
  const TYPE_COLOR = { unlit: "#8b80ff", isolated: "#ff8fd1" };
  const HIGHLIGHT_LABEL = { blue_light_phone: "Blue-light phone", open_place: "Open late" };
  const HIGHLIGHT_COLOR = { blue_light_phone: "#3d8bff", open_place: "#ffc960" };
  const SOURCE_LABEL = {
    vision: "Spotted in Street View", osm: "OpenStreetMap", elevation: "Elevation data",
    user: "Reported by a Tandem user", alert: "Transit alert",
  };
  const PERSONA_NAME = { wheelchair: "Wheelchair", stroller: "Stroller", night_solo: "Walking alone at night" };
  const PERSONA_ICON = { wheelchair: "♿", stroller: "👶", night_solo: "🌙" };
  const PERSONA = Object.fromEntries(Object.keys(PERSONA_NAME).map((k) => [k, `${PERSONA_ICON[k]} ${PERSONA_NAME[k]}`]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Small white glyphs, one per barrier type (24×24 viewBox, stroked).
  const GLYPH = {
    steps: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
    no_curb_ramp: '<path d="M3 15h7v5h11"/><path d="M14 4l6 6M20 4l-6 6"/>',
    steep_grade: '<path d="M3 20L21 6v14z"/>',
    broken_sidewalk: '<path d="M4 5l5 6-3 3 5 6M14 4l2 5-3 3 4 4"/>',
    obstruction: '<circle cx="12" cy="12" r="8"/><path d="M7 12h10"/>',
    construction: '<path d="M12 3l-6 17h12z"/><path d="M8.5 13h7M10 8.5h4"/>',
    transit_outage: '<rect x="5" y="4" width="14" height="13" rx="2"/><path d="M5 11h14M8 20l1-3M16 20l-1-3"/>',
    // street lamp, struck through
    unlit: '<path d="M9 21V8a4 4 0 014-4h3"/><path d="M14 4v3h5V4"/><path d="M6 21h6"/><path d="M3 3l18 18"/>',
    // a tree: a path through the woods, away from the road
    isolated: '<path d="M12 3l-6 9h3.5L6 17h12l-3.5-5H18z"/><path d="M12 17v4"/>',
    // highlights + entrances
    blue_light_phone: '<rect x="8" y="2.5" width="8" height="6" rx="1.5"/><path d="M12 8.5V21M8.5 21h7M10 13h4"/>',
    open_place: '<path d="M3 10l2-6h14l2 6M3 10h18M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    door: '<path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18"/><circle cx="14.5" cy="12.5" r="0.6" fill="currentColor"/>',
    bus: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M8 21v-3M16 21v-3"/><circle cx="8.5" cy="14.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="14.5" r=".6" fill="currentColor"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  };
  const glyph = (type, size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[type] || '<circle cx="12" cy="12" r="3"/>'}</svg>`;

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
  const typeLabel = (t) => TYPE_LABEL[t] || String(t || "Problem").replaceAll("_", " ");

  function photoDate(d) {
    if (!d) return "";
    const [year, month] = String(d).split("-");
    const name = month ? MONTHS[Number(month) - 1] : undefined;
    return name ? `${name} ${year}` : year;
  }

  function ago(ms) {
    const min = Math.round((Date.now() - ms) / 60_000);
    if (min < 60) return min <= 1 ? "just now" : `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  }

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

  // Same formula as scout/score.ts metersBetween (haversine).
  function meters(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // The part of a decoded polyline ([lat, lng] points) between a and b metres from its start.
  function sliceByDistance(pts, a, b) {
    const out = [];
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const len = meters({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] });
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

  // Night stretches (unlit / isolated flags with a stretch) as a hatched overlay on a route.
  function drawStretch(layer, pts, f, { weight = 6 } = {}) {
    if (!f.stretch || !NIGHT_TYPES.has(f.type)) return null;
    const seg = sliceByDistance(pts, f.stretch.startM, f.stretch.startM + f.stretch.lengthM);
    if (seg.length < 2) return null;
    const color = TYPE_COLOR[f.type];
    L.polyline(seg, { color, weight: weight + 9, opacity: 0.38, lineCap: "butt", interactive: false }).addTo(layer);
    L.polyline(seg, { color: "#05070d", weight: weight - 1, opacity: 0.95, dashArray: "5 6", lineCap: "butt", interactive: false }).addTo(layer);
    return seg;
  }

  // A round map marker for a night highlight (blue-light phone, open place) with a popup.
  function highlightMarker(h, size = 26) {
    const color = HIGHLIGHT_COLOR[h.type] || "#5cc8ff";
    const icon = L.divIcon({
      className: `hl hl-${h.type}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div class="hl-dot" style="background:${color};color:${h.type === "open_place" ? "#2a1b02" : "#fff"}">${glyph(h.type, Math.round(size * 0.58))}</div>`,
    });
    return L.marker([h.location.lat, h.location.lng], { icon, zIndexOffset: 700, title: HIGHLIGHT_LABEL[h.type] || "" })
      .bindPopup(`<div class="hl-pop"><b>${esc(HIGHLIGHT_LABEL[h.type] || "")}</b>${h.note ? `<span>${esc(h.note)}</span>` : ""}</div>`, { closeButton: false, offset: [0, -size / 2 + 4] });
  }

  // Dark Leaflet map with darkened OSM tiles, same look as the live dashboard.
  function darkMap(id, opts = {}) {
    const map = L.map(id, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, ...opts });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "dark-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    return map;
  }

  // A Street View photo with the problem's box drawn on top (box = 0–1 fractions of the image).
  function photoFigure(imagePath, { box, severity = 3, label, caption } = {}) {
    const fig = el("figure", "photo");
    const frame = el("div", "photo-frame");
    const img = el("img");
    img.loading = "lazy";
    img.alt = label ? `Street View photo: ${label}` : "Street View photo";
    img.src = fileUrl(imagePath);
    img.onerror = () => fig.remove();
    frame.appendChild(img);
    if (box && [box.x, box.y, box.w, box.h].every((v) => typeof v === "number")) {
      const clamp = (v) => Math.max(0, Math.min(1, v));
      const x = clamp(box.x), y = clamp(box.y);
      const b = el("div", `photo-box s${severity}`);
      Object.assign(b.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${clamp(box.w) * 100}%`, height: `${clamp(box.h) * 100}%` });
      if (label) b.appendChild(el("span", `photo-box-label ${y < 0.14 ? "below" : ""}`, esc(label)));
      frame.appendChild(b);
    }
    fig.appendChild(frame);
    if (caption) fig.appendChild(el("figcaption", "", esc(caption)));
    return fig;
  }

  function streetViewCaption(d) {
    const date = photoDate(d);
    return date ? `Street View · ${date}` : "Street View";
  }

  return { SEV_COLOR, TYPE_LABEL, TYPE_COLOR, NIGHT_TYPES, HIGHLIGHT_LABEL, HIGHLIGHT_COLOR, SOURCE_LABEL, PERSONA, PERSONA_NAME, PERSONA_ICON, glyph, sliceByDistance, drawStretch, highlightMarker, $, el, esc, fileUrl, placeName, typeLabel, photoDate, ago, decodePolyline, meters, darkMap, photoFigure, streetViewCaption };
})();
