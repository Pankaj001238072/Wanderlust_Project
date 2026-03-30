maptilersdk.config.apiKey = mapToken;          // Replace with your MapTiler API key

const map = new maptilersdk.Map({
  container: 'map',
  style: maptilersdk.MapStyle.STREETS,
  center: listing.geometry.coordinates , // longitude, latitude [77.209, 28.6139] pehle use kiya tha for new delhi fix center coordinates k liye ab hmm current location ke coordinates use karenge
   zoom: 9
});

// Add a marker to the map at the specified coordinates
const marker = new maptilersdk.Marker({color:"red"})
  .setLngLat(listing.geometry.coordinates) // longitude, latitude [77.209, 28.6139] pehle use kiya tha for new delhi fix center coordinates k liye ab hmm current location ke coordinates use karenge
  .setPopup(
    new maptilersdk.Popup({ offset: 25 }).setHTML(
      `<h4>${listing.title}</h4><p>Exact Location will be provided after booking</p>`
    ) 
  )
  .addTo(map);

  // (Circle Layer) Add a circle layer to highlight the listing location

map.on("load", () => {

  // GeoJSON source for circle
  map.addSource("listing-location", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: listing.geometry.coordinates
      }
    }
  });

  // 🔴 Responsive Circle Layer
  map.addLayer({
    id: "listing-circle",
    type: "circle",
    source: "listing-location",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5, 20,
        10, 60,
        15, 120
      ],
      "circle-color": "#fe424d",
      "circle-opacity": 0.25
    }
  });

});