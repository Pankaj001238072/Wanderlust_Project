const axios = require("axios");
const ExpressError = require("../utils/ExpressError");

const mapToken = process.env.MAP_TOKEN;

if (!mapToken) {
  console.error("MAP_TOKEN missing in environment variables");
  process.exit(1);
}

async function validateLocation(countryInput, locationInput) {

  let countryResponse;
  try {
    countryResponse = await axios.get(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(countryInput)}.json`,
      { params: { key: mapToken, types: "country", limit: 1 } }
    );
  } catch (err) {
    throw new ExpressError(503, "Location service unavailable");
  }

  const countryFeatures = countryResponse.data.features || [];
  if (countryFeatures.length === 0) {
    throw new ExpressError(400, "Invalid country");
  }

  const apiCountryName = countryFeatures[0].text.toLowerCase();

  let locationResponse;
  try {
    locationResponse = await axios.get(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(locationInput)}.json`,
      { params: { key: mapToken, limit: 1 } }
    );
  } catch (err) {
    throw new ExpressError(503, "Location service unavailable");
  }

  const locationFeatures = locationResponse.data.features || [];
  if (locationFeatures.length === 0) {
    throw new ExpressError(400, "Invalid location");
  }

  const feature = locationFeatures[0];

  const featureCountry = feature.context?.find(c =>
    c.id.startsWith("country")
  )?.text?.toLowerCase();

  if (featureCountry !== apiCountryName) {
    throw new ExpressError(
      400,
      "Location does not belong to selected country"
    );
  }

  return {
    geometry: {
      type: "Point",
      coordinates: feature.geometry.coordinates
    }
  };
}

module.exports = { validateLocation };