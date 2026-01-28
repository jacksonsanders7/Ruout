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
let currentRouteLine = null;

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
    ]
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
    drawRoutePolyline(data);
    updateETAORS(data);
  } catch (err) {
    console.error("ORS request error:", err);
  }
}

// ===================== DRAW ROUTE =====================
function drawRoutePolyline(geojson) {
  if (currentRouteLine) map.removeLayer(currentRouteLine);

  const coords = geojson.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
  currentRouteLine = L.polyline(coords, { color: "blue", weight: 8, opacity: 0.9 }).addTo(map);

  map.fitBounds(currentRouteLine.getBounds());
}

// ===================== ETA =====================
function updateETAORS(geojson) {
  let eta = geojson.features[0].properties.summary.duration;

  allTrafficLights.forEach(light => {
    if (light.state === "red") eta += 30; // add 30s per red light
  });

  document.getElementById("etaValue").innerText = (eta / 60).toFixed(1) + " min";
}

// ===================== CLICK HANDLING =====================
map.on("click", e => {
  if (clickStage === 0) {
    resetAll();
    startPoint = L.latLng(e.latlng.lat, e.latlng.lng);
    startMarker = L.marker(startPoint).addTo(map).bindPopup("Start").openPopup();
    clickStage = 1;
  } else {
    endPoint = L.latLng(e.latlng.lat, e.latlng.lng);
    endMarker = L.marker(endPoint).addTo(map).bindPopup("Destination").openPopup();
    buildRouteORS(startPoint, endPoint);
    clickStage = 0;
  }
});

// ===================== RESET =====================
function resetAll() {
  if (startMarker) map.removeLayer(startMarker);
  startMarker = null;

  if (endMarker) map.removeLayer(endMarker);
  endMarker = null;

  if (currentRouteLine) map.removeLayer(currentRouteLine);
  currentRouteLine = null;
}
