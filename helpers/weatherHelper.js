/**
 * Weather Helper – wttr.in (no API key needed) + OpenWeatherMap fallback
 * Server-side cache: 10 minutes per city (shared across all users)
 */

const axios = require("axios");

const API_KEY = process.env.OPENWEATHER_API_KEY;
const OWM_BASE = "https://api.openweathermap.org/data/2.5";

// ─── Server-side in-memory cache ─────────────────────────────────────────────
const _serverCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(city) {
  const key  = city.toLowerCase().trim();
  const item = _serverCache.get(key);
  if (item && (Date.now() - item.ts) < CACHE_TTL_MS) return item.data;
  _serverCache.delete(key); // expired
  return null;
}
function setCache(city, data) {
  _serverCache.set(city.toLowerCase().trim(), { data, ts: Date.now() });
  // Limit cache size to 200 cities
  if (_serverCache.size > 200) {
    const firstKey = _serverCache.keys().next().value;
    _serverCache.delete(firstKey);
  }
}

// Weather condition codes for wttr.in
const WTTR_CODE_MAP = {
  113: { main: "Clear",        desc: "Sunny",              icon: "☀️" },
  116: { main: "Clouds",       desc: "Partly Cloudy",      icon: "⛅" },
  119: { main: "Clouds",       desc: "Cloudy",             icon: "☁️" },
  122: { main: "Clouds",       desc: "Overcast",           icon: "☁️" },
  143: { main: "Mist",         desc: "Mist",               icon: "🌫️" },
  176: { main: "Rain",         desc: "Light rain showers", icon: "🌦️" },
  179: { main: "Snow",         desc: "Light snow showers", icon: "🌨️" },
  182: { main: "Drizzle",      desc: "Sleet showers",      icon: "🌧️" },
  185: { main: "Drizzle",      desc: "Freezing drizzle",   icon: "🌧️" },
  200: { main: "Thunderstorm", desc: "Thundery showers",   icon: "⛈️" },
  227: { main: "Snow",         desc: "Blowing snow",       icon: "❄️" },
  230: { main: "Snow",         desc: "Blizzard",           icon: "❄️" },
  248: { main: "Fog",          desc: "Fog",                icon: "🌫️" },
  260: { main: "Fog",          desc: "Freezing fog",       icon: "🌫️" },
  263: { main: "Drizzle",      desc: "Light drizzle",      icon: "🌧️" },
  266: { main: "Drizzle",      desc: "Drizzle",            icon: "🌧️" },
  281: { main: "Drizzle",      desc: "Freezing drizzle",   icon: "🌧️" },
  284: { main: "Drizzle",      desc: "Heavy freezing",     icon: "🌧️" },
  293: { main: "Rain",         desc: "Light rain",         icon: "🌧️" },
  296: { main: "Rain",         desc: "Light rain",         icon: "🌧️" },
  299: { main: "Rain",         desc: "Moderate rain",      icon: "🌧️" },
  302: { main: "Rain",         desc: "Moderate rain",      icon: "🌧️" },
  305: { main: "Rain",         desc: "Heavy rain",         icon: "🌧️" },
  308: { main: "Rain",         desc: "Heavy rain",         icon: "🌧️" },
  311: { main: "Drizzle",      desc: "Light sleet",        icon: "🌧️" },
  314: { main: "Drizzle",      desc: "Moderate sleet",     icon: "🌧️" },
  317: { main: "Drizzle",      desc: "Light sleet",        icon: "🌧️" },
  320: { main: "Snow",         desc: "Light snow",         icon: "🌨️" },
  323: { main: "Snow",         desc: "Light snow",         icon: "🌨️" },
  326: { main: "Snow",         desc: "Light snow",         icon: "🌨️" },
  329: { main: "Snow",         desc: "Moderate snow",      icon: "❄️" },
  332: { main: "Snow",         desc: "Moderate snow",      icon: "❄️" },
  335: { main: "Snow",         desc: "Heavy snow",         icon: "❄️" },
  338: { main: "Snow",         desc: "Heavy snow",         icon: "❄️" },
  350: { main: "Hail",         desc: "Ice pellets",        icon: "🌨️" },
  353: { main: "Rain",         desc: "Light showers",      icon: "🌦️" },
  356: { main: "Rain",         desc: "Heavy showers",      icon: "🌧️" },
  359: { main: "Rain",         desc: "Torrential rain",    icon: "🌧️" },
  362: { main: "Drizzle",      desc: "Light sleet",        icon: "🌧️" },
  365: { main: "Drizzle",      desc: "Moderate sleet",     icon: "🌧️" },
  368: { main: "Snow",         desc: "Light snow showers", icon: "🌨️" },
  371: { main: "Snow",         desc: "Moderate snow",      icon: "❄️" },
  374: { main: "Hail",         desc: "Light ice pellets",  icon: "🌨️" },
  377: { main: "Hail",         desc: "Moderate ice pellets",icon: "🌨️" },
  386: { main: "Thunderstorm", desc: "Thundery rain",      icon: "⛈️" },
  389: { main: "Thunderstorm", desc: "Heavy thunderstorm", icon: "⛈️" },
  392: { main: "Thunderstorm", desc: "Thundery snow",      icon: "⛈️" },
  395: { main: "Snow",         desc: "Heavy snow",         icon: "❄️" },
};

const BAD_CONDITIONS = ["Rain", "Thunderstorm", "Snow", "Drizzle", "Mist", "Fog", "Hail"];

const INDOOR_AMENITIES_KEYWORDS = [
  "indoor games", "snooker", "pool table", "billiards",
  "balcony", "view", "fireplace", "netflix", "smart tv",
  "home theatre", "jacuzzi", "spa", "gym",
];

// ─── Primary: wttr.in (no key needed) ────────────────────────────────────────
const getWeatherFromWttr = async (city) => {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
  const { data } = await axios.get(url, { timeout: 5000 });

  const current = data.current_condition?.[0];
  if (!current) throw new Error("No current condition in response");

  const code     = parseInt(current.weatherCode);
  const mapped   = WTTR_CODE_MAP[code] || { main: "Clear", desc: current.weatherDesc?.[0]?.value || "Clear", icon: "☀️" };
  const temp     = parseInt(current.temp_C);
  const cityName = data.nearest_area?.[0]?.areaName?.[0]?.value || city;

  const isBadWeather = BAD_CONDITIONS.some(c =>
    mapped.main.toLowerCase().includes(c.toLowerCase())
  );

  // Build 3-day forecast from weather[] array
  const forecast = (data.weather || []).slice(0, 3).map(day => ({
    date:      day.date,
    condition: WTTR_CODE_MAP[parseInt(day.hourly?.[4]?.weatherCode)]?.main || "Clear",
    icon:      WTTR_CODE_MAP[parseInt(day.hourly?.[4]?.weatherCode)]?.icon || "☀️",
    minTemp:   parseInt(day.mintempC),
    maxTemp:   parseInt(day.maxtempC),
  }));

  return {
    error:       null,
    city:        cityName,
    condition:   mapped.main,
    description: mapped.desc,
    icon:        mapped.icon,  // emoji icon (no image URL needed)
    iconIsEmoji: true,
    temp,
    isBadWeather,
    forecast,
    source:      "wttr.in",
  };
};

// ─── Fallback: OpenWeatherMap ─────────────────────────────────────────────────
const getWeatherFromOWM = async (city) => {
  if (!API_KEY || API_KEY === "your_openweather_api_key_here") {
    throw new Error("OWM API key not configured");
  }

  const url = `${OWM_BASE}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&cnt=8`;
  const { data } = await axios.get(url, { timeout: 5000 });

  const list    = data.list || [];
  const first   = list[0] || {};
  const weather = first.weather?.[0] || {};
  const main    = first.main || {};

  const condition   = weather.main || "Clear";
  const description = weather.description || "";
  const icon        = weather.icon
    ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png`
    : "☀️";
  const temp        = Math.round(main.temp || 0);
  const isBadWeather = BAD_CONDITIONS.some(c =>
    condition.toLowerCase().includes(c.toLowerCase())
  );

  const days = [];
  for (let i = 0; i < list.length && days.length < 3; i++) {
    const entry = list[i];
    const date  = new Date(entry.dt * 1000);
    if (!days.find(d => d.date === date.toDateString())) {
      days.push({
        date:      date.toDateString(),
        condition: entry.weather?.[0]?.main || "Clear",
        icon:      entry.weather?.[0]?.icon
          ? `https://openweathermap.org/img/wn/${entry.weather[0].icon}.png`
          : "☀️",
        minTemp: Math.round(entry.main?.temp_min || 0),
        maxTemp: Math.round(entry.main?.temp_max || 0),
      });
    }
  }

  return {
    error: null, condition, description, icon, iconIsEmoji: false,
    temp, isBadWeather, forecast: days, source: "openweathermap",
  };
};

// ─── Main export: tries cache → wttr.in → OWM ──────────────────────────────
const getWeatherForCity = async (city) => {
  // 0. Server cache (10 min, shared across all users)
  const cached = getCached(city);
  if (cached) {
    console.log(`[Weather] Cache hit: ${city}`);
    return cached;
  }

  // 1. Try wttr.in (no key required)
  try {
    const result = await getWeatherFromWttr(city);
    setCache(city, result); // store in cache on success
    return result;
  } catch (e) {
    console.warn("[Weather] wttr.in failed:", e.message, "– trying OWM...");
  }

  // 2. Fallback to OWM
  try {
    const result = await getWeatherFromOWM(city);
    setCache(city, result);
    return result;
  } catch (e) {
    console.error("[Weather] Both APIs failed:", e.message);
    return { error: e.message, weather: null };
  }
};

// ─── Indoor suitability scorer ────────────────────────────────────────────────
const getWeatherScore = (listing, isBadWeather) => {
  if (!isBadWeather) return 0;
  const text = `${listing.title} ${listing.description || ""}`.toLowerCase();
  let score = 0;
  for (const kw of INDOOR_AMENITIES_KEYWORDS) {
    if (text.includes(kw)) score++;
  }
  return Math.min(score, 10);
};

module.exports = { getWeatherForCity, getWeatherScore };
