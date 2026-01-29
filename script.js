// ================= MAP =================
const map = L.map("map").setView([35.7796, -78.6382], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// ensure correct sizing after load
setTimeout(() => map.invalidateSize(), 0);

// ================= STATE =================
let clickStage = 0;
let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;

let availableRoutes = [];
let activeRouteIndex = null;
let routeLines = [null, null];

const allTrafficLights = [];
let lightsLoaded = false;

// ================= TRAFFIC LIGHT CLASS =================
class TrafficLight {
  constructor(lat, lng) {
    this.lat = lat;
    this.lng = lng;
    this.state = Math.random() > 0.5 ? "red" : "green";

    this.marker = L.circleMarker([lat, lng], {
      radius: 5,
      color: this.state,
      fillColor: this.state,
      fillOpacity: 1
    }).addTo(map);
  }

  toggle() {
    this.state = this.state === "red" ? "green" : "red";
    this.marker.setStyle({ color: this.state, fillColor: this.state });
  }
}

// ================= LOAD TRAFFIC LIGHTS =================
fetch("./data/raleigh_traffic_lights.geojson")
  .then(r => r.json())
  .then(data => {
    data.features.forEach(f => {
      const [lng, lat] = f.geometry.coordinates;
      allTrafficLights.push(new TrafficLight(lat, lng));
    });
    lightsLoaded = true;
    console.log("Traffic lights loaded:", allTrafficLights.length);
  });

// toggle lights every 30s and refresh ETA
setInterval(() => {
  if (!lightsLoaded) return;

  allTrafficLights.forEach(l => l.toggle());

  if (activeRouteIndex !== null && availableRoutes[activeRouteIndex]) {
    const eta = calculateRouteETA(availableRoutes[activeRouteIndex]);
    document.getElementById("etaValue").innerText = eta + " min";
    updateRouteOptions();
  }
}, 30000);

// ================= ORS ROUTING =================
const ORS_API_KEY = "YOUR_ORS_API_KEY_HERE";

async function buildRouteORS(start, end) {
  const body = {
    coordinates: [
      [start.lng, start.lat],
      [end.lng, end.lat]
    ],
    alternative_routes: { share_factor: 0.6, target_count: 2 }
  };

  const res = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      method: "POST",
      headers: {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await res.json();
  availableRoutes = data.features;
  updateRouteOptions();
  activateRoute(0);
}

// ================= DRAW ROUTES =================
function drawRoute(index) {
  if (routeLines[index]) map.removeLayer(routeLines[index]);

  const coords = availableRoutes[index].geometry.coordinates.map(c => [c[1], c[0]]);
  const color = index === activeRouteIndex ? "blue" : "gray";

  routeLines[index] = L.polyline(coords, {
    color,
    weight: 7,
    opacity: index === activeRouteIndex ? 0.95 : 0.5
  }).addTo(map);

  if (index === activeRouteIndex) {
    map.fitBounds(routeLines[index].getBounds());
  }
}

function activateRoute(index) {
  activeRouteIndex = index;
  for (let i = 0; i < availableRoutes.length; i++) drawRoute(i);

  const eta = calculateRouteETA(availableRoutes[index]);
  document.getElementById("etaValue").innerText = eta + " min";
}

// ================= ETA LOGIC =================
function metersToMiles(m) { return m / 1609.34; }

function getSpeedLimit(step) {
  const n = (step.name || "").toLowerCase();
  if (n.includes("i-") || n.includes("hwy") || n.includes("interstate")) return 70;
  return 35;
}

function countRedLights(coords) {
  let delay = 0;
  allTrafficLights.forEach(light => {
    if (light.state !== "red") return;

    const ll = L.latLng(light.lat, light.lng);
    for (let i = 0; i < coords.length; i += 5) {
      if (ll.distanceTo(coords[i]) < 25) {
        delay += 30;
        break;
      }
    }
  });
  return delay;
}

function calculateRouteETA(feature) {
  let seconds = 0;
  feature.properties.segments[0].steps.forEach(step => {
    const miles = metersToMiles(step.distance);
    seconds += (miles / getSpeedLimit(step)) * 3600;
  });

  const coords = feature.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
  seconds += countRedLights(coords);

  return (seconds / 60).toFixed(1);
}

function updateRouteOptions() {
  if (availableRoutes.length < 2) return;
  document.getElementById("route1Eta").innerText =
    `Route 1: ${calculateRouteETA(availableRoutes[0])} min`;
  document.getElementById("route2Eta").innerText =
    `Route 2: ${calculateRouteETA(availableRoutes[1])} min`;
}

// ================= CLICK TO SET START/END =================
map.on("click", e => {
  if (clickStage === 0) {
    reset();
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

// ================= RESET =================
function reset() {
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  routeLines.forEach(l => { if (l) map.removeLayer(l); });

  routeLines = [null, null];
  availableRoutes = [];
  activeRouteIndex = null;

  document.getElementById("route1Eta").innerText = "Route 1: --";
  document.getElementById("route2Eta").innerText = "Route 2: --";
  document.getElementById("etaValue").innerText = "--";
}
