// Builds data.json: weather and snow from Open-Meteo (free, no key).
// Lifts and runs open come from a resort's own report page when resorts.json gives a "scrape" URL.
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

// Reads "3/7 Lifts Open" (either order) from the page's text. Returns null if the layout changed.
export function parseReport(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const pair = (label) => {
    const m = text.match(new RegExp(`(\\d+)\\s*/\\s*(\\d+)\\s*${label}`, "i"))
      || text.match(new RegExp(`${label}\\s*(\\d+)\\s*/\\s*(\\d+)`, "i"));
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const lifts = pair("Lifts Open"), runs = pair("(?:Trails|Runs) Open");
  return lifts || runs ? { lifts, runs } : null;
}

async function report(r) {
  const res = await fetch(r.scrape, { headers: { "user-agent": "Mozilla/5.0 (vegas-ski-report; personal use)" } });
  if (!res.ok) throw new Error(`${r.name} report: HTTP ${res.status}`);
  const got = parseReport(await res.text());
  if (!got) throw new Error(`${r.name} report: could not find lift or run counts`);
  return { ...got, status: (got.lifts?.[0] ?? got.runs?.[0] ?? 0) > 0 ? "open" : "closed" };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) await main();
async function main() {
const out = [];
for (const r of resorts) {
  const base = { name: r.name, state: r.state, miles: r.miles, report: r.report, status: "unknown", lifts: null, runs: null };
  try { Object.assign(base, await weather(r)); }
  catch (e) { console.error(e.message); Object.assign(base, { snow24: null, snow72: null, depth: null, tempF: null, wind: null, sky: null }); }
  if (r.scrape) {
    try { Object.assign(base, await report(r)); console.log(`${r.name}: lifts ${base.lifts}, runs ${base.runs}`); }
    catch (e) { console.error(e.message); }
  }
  out.push(base);
}
await writeFile(new URL("../data.json", import.meta.url), JSON.stringify({ updated: new Date().toISOString(), resorts: out }, null, 2));
console.log(`Wrote ${out.length} resorts`);
}
