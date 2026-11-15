// Re-runs the walk-forward test behind the Forecast page.
// Usage (from the project folder):  node tools/validate-forecast.mjs
import fs from "fs";
import Papa from "papaparse";
import { runForecastEngine } from "../src/utils/forecast.js";

const csv = Papa.parse(fs.readFileSync("public/data/master_national_monthly.csv", "utf8"), { header: true, skipEmptyLines: true }).data;
const rows = csv
  .map(r => ({ period: r.date, farmgate: Number(r.farmgate_hh__broiler_chicken), retail: r.retail__fresh_chicken_fully_dressed_broiler_1_kg === "" ? null : Number(r.retail__fresh_chicken_fully_dressed_broiler_1_kg) }))
  .filter(r => Number.isFinite(r.farmgate) && r.retail !== null && Number.isFinite(r.retail))
  .sort((a, b) => a.period.localeCompare(b.period));

console.log(`National broiler chicken, ${rows.length} months with both farm and market prices\n`);
for (const h of [1, 2, 3, 6, 12]) {
  const out = runForecastEngine(rows, h);
  console.log(`--- ${h} month(s) ahead (most accurate: ${out.recommendation}) ---`);
  const line = (name, m) => console.log(name.padEnd(14), "MAE", m.mae.toFixed(2).padStart(6), " RMSE", m.rmse.toFixed(2).padStart(6), " MAPE", (m.mape.toFixed(2) + "%").padStart(7), " tests", m.validationCount);
  line("repeat last", out.naive);
  Object.keys(out.models).forEach(id => line(id, out.models[id]));
  console.log();
}
