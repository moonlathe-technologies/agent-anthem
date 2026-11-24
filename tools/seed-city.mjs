// Fill a TEST copy of the shared city with made-up builders, for testing and videos. Never point this at the live city.
//   cd city-server && npx wrangler dev          (a local copy on http://127.0.0.1:8787)
//   node tools/seed-city.mjs [count] [minutes]  (default 30 builders; about two thirds keep working for 30 minutes)
// Then in the page's browser console: localStorage.cityApi = "http://127.0.0.1:8787"; reload. Remove it to go back.
import { pathToFileURL } from "node:url";
import { newCity, grow } from "../public/city.js";
import { randomName, reportOf, CITY_API } from "../public/shared.js";

const API = process.env.CITY_TEST_API || "http://127.0.0.1:8787";

const uuid = random => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(random() * 16).toString(16));

// A builder with a city of a few towers, each a different height.
export function fakeBuilder(random = Math.random) {
  const city = newCity(), towers = 1 + Math.floor(random() * 6);
  for (let t = 0; t < towers; t++) {
    const tools = 10 + Math.floor(random() * 120);
    for (let i = 0; i < tools; i++) grow(city, "tool");
    if (t < towers - 1) grow(city, "done");
  }
  return { id: uuid(random), city, report: reportOf(city, randomName(random)) };
}

const send = b => fetch(`${API}/api/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id, ...b.report }) });

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (API === CITY_API) { console.log("This is the live city. Use a test copy."); process.exit(1); }
  const [count = 30, minutes = 30] = process.argv.slice(2).map(Number);
  const builders = Array.from({ length: count }, () => fakeBuilder());
  for (const b of builders) await send(b);
  console.log(`${count} builders added to ${API}. Keeping two thirds of them working for ${minutes} minutes; Ctrl+C to stop.`);
  const working = builders.filter((_, i) => i % 3 !== 0), end = Date.now() + minutes * 60000;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 60000));
    for (const b of working) { for (let i = 0; i < 4; i++) grow(b.city, "tool"); b.report = reportOf(b.city, b.report.name); await send(b); }
  }
}
