// ===================== MAP =====================
const map = L.map("map").setView([35.7796, -78.6382], 12);
setTimeout(() => {
  map.invalidateSize(true);
}, 0);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

map.on("click", e => {
  alert("Map click detected");
});

// ===================== STATE =====================
let clickStage = 0;
let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;

const allTrafficLights = [];

let availableRoutes = [];
let activeRouteIndex = null;
let routeLines = [null, null]; // store polylines for Route 1 and Route 2

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

// ===================== LOAD TRAFFIC LIGHTS =====================
fetch("./data/raleigh_traffic_lights.geojson")
  .then(res => res.json())
  .then(data => {
    data.features.forEach(feature => {
      const [lng, lat] = feature.geometry.coordinates;
      allTrafficLights.push(new TrafficLight(lat, lng));
    });
    console.log("Traffic lights loaded:", allTrafficLights.length);
  })
  .catch(err => console.error("Failed to load traffic lights:", err));

// ===================== GLOBAL LIGHT TIMER (30s) =====================
setInterval(() => {
  allTrafficLights.forEach(light => light.toggle());

  // Update ETA for active route if selected
  if (activeRouteIndex !== null && availableRoutes[activeRouteIndex]) {
    const eta = calculateRouteETA(availableRoutes[activeRouteIndex]);
    document.getElementById("etaValue").innerText = eta + " min";
    updateRouteOptions();
  }
}, 30000);

// ===================== OPENROUTESERVICE API =====================
const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImFlMWYwNTMzZTQ2MzQxMmM5NDgzNDAyMDcwZGNlN2FkIiwiaCI6Im11cm11cjY0In0=";

async function buildRouteORS(start, end) {
  if (!start || !end) return;

  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const body = {
    coordinates: [
      [start.lng, start.lat],
      [end.lng, end.lat]
    ],
    alternative_routes: {
      share_factor: 0.6,
      target_count: 2
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error("ORS request failed:", await res.text());
      return;
    }

    const data = await res.json();
    availableRoutes = data.features;
    updateRouteOptions();

    // Automatically draw first route
    activateRoute(0);

  } catch (err) {
    console.error("ORS request error:", err);
  }
}

// ===================== DRAW ROUTE =====================
function drawRoutePolyline(routeIndex) {
  if (!availableRoutes[routeIndex]) return;

  // Remove old polyline for this route if exists
  if (routeLines[routeIndex]) map.removeLayer(routeLines[routeIndex]);

  const coords = availableRoutes[routeIndex].geometry.coordinates.map(c => [c[1], c[0]]);
  const color = routeIndex === activeRouteIndex ? "blue" : "gray";

  routeLines[routeIndex] = L.polyline(coords, { color, weight: 8, opacity: 0.9 }).addTo(map);

  // Fit map to active route only
  if (routeIndex === activeRouteIndex) {
    map.fitBounds(routeLines[routeIndex].getBounds());
  }
}

// ===================== ETA CALCULATION =====================
function metersToMiles(m) { return m / 1609.34; }
function secondsToMinutes(s) { return s / 60; }

function getSpeedLimit(step) {
  const name = step.name?.toLowerCase() || "";
  if (name.includes("i-") || name.includes("interstate") || name.includes("hwy")) return 70;
  return 35;
}

function countRedLightsOnRoute(routeCoords) {
  let delay = 0;
  allTrafficLights.forEach(light => {
    const lightLatLng = L.latLng(light.lat, light.lng);
    routeCoords.forEach(coord => {
      if (lightLatLng.distanceTo(coord) < 25 && light.state === "red") delay += 30;
    });
  });
  return delay;
}

function calculateRouteETA(feature) {
  const steps = feature.properties.segments[0].steps;
  let totalSeconds = 0;

  steps.forEach(step => {
    const miles = metersToMiles(step.distance);
    const speed = getSpeedLimit(step);
    totalSeconds += (miles / speed) * 3600;
  });

  const coords = feature.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
  totalSeconds += countRedLightsOnRoute(coords);

  return secondsToMinutes(totalSeconds).toFixed(1);
}

// ===================== UPDATE ROUTE OPTIONS UI =====================
function updateRouteOptions() {
  if (availableRoutes.length < 2) return;

  const eta1 = calculateRouteETA(availableRoutes[0]);
  const eta2 = calculateRouteETA(availableRoutes[1]);

  document.getElementById("route1Eta").innerText = `Route 1: ${eta1} min`;
  document.getElementById("route2Eta").innerText = `Route 2: ${eta2} min`;
}

// ===================== ACTIVATE ROUTE (GO BUTTON) =====================
function activateRoute(index) {
  activeRouteIndex = index;

  // Draw both routes so inactive is gray, active is blue
  for (let i = 0; i < availableRoutes.length; i++) {
    drawRoutePolyline(i);
  }

  const eta = calculateRouteETA(availableRoutes[index]);
  document.getElementById("etaValue").innerText = eta + " min";
}

// ===================== CLICK HANDLING =====================
map.on("click", e => {
  console.log("CLICK:", e.latlng);

  if (clickStage === 0) {
    resetAll();
    startPoint = e.latlng;
    startMarker = L.marker(startPoint).addTo(map).bindPopup("Start").openPopup();
    clickStage = 1;
  } else {
    endPoint = e.latlng;
    endMarker = L.marker(endPoint).addTo(map).bindPopup("Destination").openPopup();
    clickStage = 0;
    buildRouteORS(startPoint, endPoint);
  }
});

// ===================== RESET =====================
function resetAll() {
  if (startMarker) map.removeLayer(startMarker);
  startMarker = null;

  if (endMarker) map.removeLayer(endMarker);
  endMarker = null;

  routeLines.forEach(line => { if (line) map.removeLayer(line); });
  routeLines = [null, null];

  availableRoutes = [];
  activeRouteIndex = null;

  document.getElementById("route1Eta").innerText = "Route 1: --";
  document.getElementById("route2Eta").innerText = "Route 2: --";
  document.getElementById("etaValue").innerText = "--";
}
