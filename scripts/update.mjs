// Builds data.json: weather and snow from Open-Meteo (free, no key).
// Lifts and runs open are left empty for now; the page links to each resort's report instead.
import { readFile, writeFile } from "node:fs/promises";

const resorts = JSON.parse(await readFile(new URL("../resorts.json", import.meta.url)));
const SKY = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog",
  51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers",
  82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm" };
const round = (v) => (v == null ? null : Math.round(v));

async function weather(r) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  Object.entries({
    latitude: r.lat, longitude: r.lon, timezone: "America/Los_Angeles",
    current: "temperature_2m,wind_speed_10m,weather_code,snow_depth",
    hourly: "snowfall", past_days: 3, forecast_days: 1,
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`${r.name}: HTTP ${res.status}`);
  const d = await res.json();
  const now = Date.now();
  let s24 = 0, s72 = 0;
  d.hourly.time.forEach((t, i) => {
    const age = (now - new Date(t + ":00-08:00").getTime()) / 36e5;
    const v = d.hourly.snowfall[i] ?? 0; // inches when precipitation_unit=inch
    if (age >= 0 && age <= 24) s24 += v;
    if (age >= 0 && age <= 72) s72 += v;
  });
  return {
    tempF: round(d.current.temperature_2m), wind: round(d.current.wind_speed_10m),
    sky: SKY[d.current.weather_code] ?? null,
    depth: d.current.snow_depth == null ? null : Math.round(d.current.snow_depth * 39.37), // meters to inches
    snow24: Math.round(s24 * 10) / 10, snow72: Math.round(s72 * 10) / 10,
  };
}

const out = [];
for (const r of resorts) {
  const base = { name: r.name, state: r.state, miles: r.miles, report: r.report, status: "unknown", lifts: null, runs: null };
  try { out.push({ ...base, ...(await weather(r)) }); }
  catch (e) { console.error(e.message); out.push({ ...base, snow24: null, snow72: null, depth: null, tempF: null, wind: null, sky: null }); }
}
await writeFile(new URL("../data.json", import.meta.url), JSON.stringify({ updated: new Date().toISOString(), resorts: out }, null, 2));
console.log(`Wrote ${out.length} resorts`);
