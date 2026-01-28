// ===================== MAP =====================
const map = L.map("map").setView([35.7796, -78.6382], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// ===================== STATE =====================
let clickStage = 0;
let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;
let bestRouteLine = null;
let rejectedRouteLines = [];
let etaMarkers = [];

const allTrafficLights = [];

// ===================== TRAFFIC LIGHT =====================
class TrafficLight {
  constructor(lat, lng) {
    this.lat = lat;
    this.lng = lng;
    this.state = Math.random() > 0.5 ? "red" : "green";

    this.marker = L.circleMarker([lat, lng], {
      radius: 6,
      color: this.state,
      fillColor: this.state,
      fillOpacity: 1
    }).addTo(map);
  }

  toggle() {
    this.state = this.state === "red" ? "green" : "red";
    this.marker.setStyle({
      color: this.state,
      fillColor: this.state
    });
  }
}

// ===================== LOAD LIGHTS =====================
fetch("./data/raleigh_traffic_lights.geojson")
  .then(r => r.json())
  .then(data => {
    data.features.forEach(f => {
      const [lng, lat] = f.geometry.coordinates;
      allTrafficLights.push(new TrafficLight(lat, lng));
    });
    console.log("Lights loaded:", allTrafficLights.length);
  });

// ===================== GLOBAL LIGHT TIMER =====================
setInterval(() => {
  allTrafficLights.forEach(l => l.toggle());
}, 30000);

// ===================== OPENROUTESERVICE =====================
const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImFlMWYwNTMzZTQ2MzQxMmM5NDgzNDAyMDcwZGNlN2FkIiwiaCI6Im11cm11cjY0In0=";

async function buildRouteORS(start, end) {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const body = {
    coordinates: [
      [start.lng, start.lat],
      [end.lng, end.lat]
    ],
    alternative_routes: { target_count: 3 }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": ORS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  chooseBestRoute(data);
}

// ===================== ROUTE LOGIC =====================
function chooseBestRoute(geojson) {
  clearRoutes();

  let scored = [];

  geojson.features.forEach(feature => {
    const base = feature.properties.summary.duration;
    const coords = feature.geometry.coordinates;

    let redCount = 0;

    coords.forEach(c => {
      const lat = c[1];
      const lng = c[0];

      allTrafficLights.forEach(light => {
        const dLat = lat - light.lat;
        const dLng = lng - light.lng;
        if (Math.sqrt(dLat * dLat + dLng * dLng) < 0.0008) {
          if (light.state === "red") redCount++;
        }
      });
    });

    const total = base + redCount * 30;
    scored.push({ feature, total });
  });

  scored.sort((a, b) => a.total - b.total);

  drawBestRoute(scored[0]);
  drawRejectedRoutes(scored.slice(1));
}

// ===================== DRAW ROUTES =====================
function drawBestRoute(route) {
  const coords = route.feature.geometry.coordinates.map(c => [c[1], c[0]]);
  bestRouteLine = L.polyline(coords, {
    color: "blue",
    weight: 8,
    opacity: 0.9
  }).addTo(map);

  map.fitBounds(bestRouteLine.getBounds());

  addETABubble(coords, route.total, true);
  document.getElementById("etaValue").innerText =
    (route.total / 60).toFixed(1) + " min";
}

function drawRejectedRoutes(routes) {
  routes.forEach(r => {
    const coords = r.feature.geometry.coordinates.map(c => [c[1], c[0]]);
    const line = L.polyline(coords, {
      color: "#888",
      weight: 4,
      opacity: 0.6,
      dashArray: "6,6"
    }).addTo(map);

    rejectedRouteLines.push(line);
    addETABubble(coords, r.total, false);
  });
}

// ===================== ETA BUBBLES =====================
function addETABubble(coords, seconds, isBest) {
  const mid = coords[Math.floor(coords.length / 2)];

  const marker = L.marker(mid, {
    icon: L.divIcon({
      className: "eta-bubble",
      html: `<div style="
        background:${isBest ? "#1e90ff" : "#777"};
        color:white;
        padding:4px 8px;
        border-radius:12px;
        font-size:12px;
        font-weight:bold;
        white-space:nowrap;
      ">${(seconds / 60).toFixed(1)} min</div>`
    })
  }).addTo(map);

  etaMarkers.push(marker);
}

// ===================== CLICK HANDLING =====================
map.on("click", e => {
  if (clickStage === 0) {
    resetAll();
    startPoint = e.latlng;
    startMarker = L.marker(startPoint).addTo(map).bindPopup("Start").openPopup();
    clickStage = 1;
  } else {
    endPoint = e.latlng;
    endMarker = L.marker(endPoint).addTo(map).bindPopup("Destination").openPopup();
    buildRouteORS(startPoint, endPoint);
    clickStage = 0;
  }
});

// ===================== CLEANUP =====================
function clearRoutes() {
  if (bestRouteLine) map.removeLayer(bestRouteLine);
  rejectedRouteLines.forEach(r => map.removeLayer(r));
  etaMarkers.forEach(m => map.removeLayer(m));
  rejectedRouteLines = [];
  etaMarkers = [];
}

function resetAll() {
  clearRoutes();
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  startMarker = null;
  endMarker = null;
}
