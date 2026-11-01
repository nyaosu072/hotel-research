// Leaflet map. Pin colour = research status (--st-* tokens). Tile layer is greyed via CSS (style.css).
import { statusOf } from "./filters.js";
import { h } from "./dom.js";

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const VIEW = { JP: [[36.2, 138.2], 5], KR: [[36.4, 127.8], 7] };

export function createMap(el, country, onPick) {
  const L = globalThis.L;
  const map = L.map(el, { zoomControl: false }).setView(...VIEW[country] ?? VIEW.JP);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
  const pins = new Map(); // id -> { marker, hotel }
  let hot = null;
  let lastPts = [];
  const fit = () => { if (lastPts.length) map.fitBounds(lastPts, { padding: [48, 48], maxZoom: 14 }); };

  const style = (id, p) => {
    p.marker.setStyle({ fillColor: cssVar(`--st-${statusOf(p.hotel)}`) || "#888" });
    p.marker.setRadius(id === hot ? 11 : 7);
  };

  return {
    setHotels(list, nameOf) {
      for (const p of pins.values()) p.marker.remove();
      pins.clear();
      const pts = [];
      for (const hotel of list) {
        if (hotel.lat == null || hotel.lng == null) continue;
        const marker = L.circleMarker([hotel.lat, hotel.lng], { radius: 7, weight: 2, color: "#fff", fillOpacity: 1 })
          .addTo(map).bindTooltip(h("span", null, nameOf(hotel)));
        marker.on("click", () => onPick(hotel.id));
        pins.set(hotel.id, { marker, hotel });
        style(hotel.id, pins.get(hotel.id));
        pts.push([hotel.lat, hotel.lng]);
      }
      lastPts = pts;
      fit();
    },
    recolor() { for (const [id, p] of pins) style(id, p); },
    highlight(id) { hot = id; for (const [i, p] of pins) p.marker.setRadius(i === id ? 11 : 7); },
    focus(id) {
      const p = pins.get(id);
      if (p) { map.panTo(p.marker.getLatLng()); this.highlight(id); }
    },
    invalidate() { map.invalidateSize(); fit(); },
    destroy() { map.remove(); },
  };
}
