import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import Papa from "papaparse";
import { formatDatasetType, processCsvImport } from "./utils/preprocess";
import {
  LayoutDashboard, Table2, TrendingUp, Settings as SettingsIcon,
  Upload, Plus, Trash2, RotateCcw, ChevronRight, Feather,
  CheckCircle2, Menu, X, Download, HelpCircle, Database,
  BarChart3, ArrowUpRight, ArrowDownRight, ArrowRight, Check,
  Drumstick, Egg, Bird, Wheat, Store, Sun
} from "lucide-react";
import { runForecastEngine, MODEL_IDS } from "./utils/forecast.js";

const STORAGE_KEY = "poultry:dataset:v2";
const SETTINGS_KEY = "poultry:settings";
const EVENTS_KEY = "poultry:external-events:v1";
const MASTER_DATA_URL = "/data/master_national_monthly.csv";
const DEFAULT_GEOGRAPHIC_SCOPE = { level: "national", region: "", province: "" };
const KNOWN_REGIONS = [
  "REGION I (ILOCOS REGION)", "REGION II (CAGAYAN VALLEY)", "REGION III (CENTRAL LUZON)",
  "REGION IV-A (CALABARZON)", "REGION IV-B (MIMAROPA)", "REGION V (BICOL REGION)",
  "REGION VI (WESTERN VISAYAS)", "REGION VII (CENTRAL VISAYAS)", "REGION VIII (EASTERN VISAYAS)",
  "REGION IX (ZAMBOANGA PENINSULA)", "REGION X (NORTHERN MINDANAO)", "REGION XI (DAVAO REGION)",
  "REGION XII (SOCCSKSARGEN)", "REGION XIII (CARAGA)", "CORDILLERA ADMINISTRATIVE REGION (CAR)",
  "NATIONAL CAPITAL REGION (NCR)", "BANGSAMORO AUTONOMOUS REGION IN MUSLIM MINDANAO (BARMM)",
];

const PRODUCT_DEFS = [
  { id: "broiler", name: "Broiler chicken", farmgateField: "farmgate_hh__broiler_chicken", retailField: "retail__fresh_chicken_fully_dressed_broiler_1_kg", commodityType: "Broiler Chicken", retailCommodityType: "FRESH CHICKEN, FULLY DRESSED, BROILER", inventoryAnimalType: "BROILER", unit: "PHP/kg" },
  { id: "layer-egg", name: "Chicken eggs: layer", farmgateField: "farmgate_hh__chicken_egg_layer", retailField: "retail__fresh_egg_chicken_medium_1_pc", commodityType: "Chicken egg, Layer", retailCommodityType: "FRESH EGG, CHICKEN, MEDIUM", inventoryAnimalType: "LAYER", unit: "PHP/piece" },
  { id: "native-egg", name: "Chicken eggs: native", farmgateField: "farmgate_hh__chicken_egg_native", retailField: "retail__fresh_egg_chicken_native_medium_1_pc", commodityType: "Chicken egg, Native", retailCommodityType: "FRESH EGG, CHICKEN, NATIVE, MEDIUM", inventoryAnimalType: "NATIVE/IMPROVED", unit: "PHP/piece" },
  { id: "duck", name: "Duck", farmgateField: "farmgate_hh__duck", retailField: null, commodityType: "Duck", inventoryAnimalType: "DUCK", unit: "PHP/kg" },
  { id: "duck-egg", name: "Duck eggs", farmgateField: "farmgate_hh__duck_egg", retailField: "retail__fresh_egg_duck_medium_1_pc", commodityType: "Duck egg", retailCommodityType: "FRESH EGG, DUCK, MEDIUM", inventoryAnimalType: "DUCK", unit: "PHP/piece" },
  { id: "gamefowl-dressing", name: "Gamefowl for dressing", farmgateField: "farmgate_hh__gamefowl_for_dressing", retailField: null, commodityType: "Gamefowl for Dressing", inventoryAnimalType: "GAMEFOWL", unit: "PHP/kg" },
  { id: "gamefowl-other", name: "Gamefowl: other purposes", farmgateField: "farmgate_hh__gamefowl_for_other_purposes", retailField: null, commodityType: "Gamefowl for Other Purposes", inventoryAnimalType: "GAMEFOWL", unit: "PHP/kg" },
  { id: "layer-chicken", name: "Layer chicken", farmgateField: "farmgate_hh__layer_chicken", retailField: null, commodityType: "Layer Chicken", inventoryAnimalType: "LAYER", unit: "PHP/kg" },
  { id: "native-improved", name: "Native/improved chicken", farmgateField: "farmgate_hh__native_improved_chicken", retailField: "retail__fresh_chicken_native_1_kg", commodityType: "Native/Improved Chicken", retailCommodityType: "FRESH CHICKEN, NATIVE", inventoryAnimalType: "NATIVE/IMPROVED", unit: "PHP/kg" },
];

const PRODUCT_LOOK = {
  "broiler": { icon: Drumstick, fil: "Manok (broiler)" },
  "layer-egg": { icon: Egg, fil: "Itlog ng manok (layer)" },
  "native-egg": { icon: Egg, fil: "Itlog ng native na manok" },
  "duck": { icon: Bird, fil: "Itik" },
  "duck-egg": { icon: Egg, fil: "Itlog ng itik" },
  "gamefowl-dressing": { icon: Bird, fil: "Panabong (dressed)" },
  "gamefowl-other": { icon: Bird, fil: "Panabong (ibang gamit)" },
  "layer-chicken": { icon: Drumstick, fil: "Manok na pangitlog (layer)" },
  "native-improved": { icon: Feather, fil: "Native/improved na manok" },
};
function forecastRowsForProduct(rows, product) {
  const validRows = rows.filter(row => Number.isFinite(Number(row.farmgate)));
  if (product.retailField) {
    return validRows.filter(row => Number.isFinite(Number(row.retail)));
  }
  return validRows.map(row => ({ ...row, retail: Number(row.farmgate) }));
}
function farmgateForecastRows(rows) {
  return rows
    .filter(row => Number.isFinite(Number(row.farmgate)))
    .map(row => ({ ...row, retail: Number(row.farmgate) }));
}
function productLabel(product, lang) {
  const look = PRODUCT_LOOK[product.id];
  return lang === "fil" && look ? look.fil : product.name;
}
function productIcon(product) { return (PRODUCT_LOOK[product.id] || {}).icon || Feather; }
function unitWord(product, lang) {
  const perPiece = /pc|piece/i.test(product.unit || "");
  return perPiece ? (lang === "fil" ? "kada piraso" : "each") : (lang === "fil" ? "kada kilo" : "per kilo");
}

const STRINGS = {
  en: {
    "brand.sub": "Chicken & egg price guide",
    "nav.home": "Home", "nav.forecast": "Forecast", "nav.analysis": "Why prices move", "nav.data": "Price records", "nav.settings": "Advanced settings", "nav.help": "Help",
    "status.ready": "Data ready", "status.loading": "Loading", "status.needs": "Needs data", "loading.title": "Getting the price records ready", "loading.body": "The little chick is checking the latest farm and market prices.",
    "foot.psa": "Data from PSA OpenSTAT",
    "scope.national": "Whole Philippines", "scope.chooseRegion": "Choose a region", "scope.chooseProvince": "Choose a province",
    "filter.product": "Product", "filter.where": "Where", "filter.region": "Region", "filter.province": "Province",
    "term.farm": "Farm price", "term.farm.d": "What the farmer is paid for the bird or egg.",
    "term.market": "Market price", "term.market.d": "What you pay as a shopper at the palengke or store.",
    "term.gap": "Price gap", "term.gap.d": "Market price minus farm price. It is a gap, not profit.",
    "term.forecast": "Forecast", "term.forecast.d": "Our best guess of a future price, based on past prices. It can be wrong.",
    "term.link": "Moving together", "term.link.d": "Two things that tend to go up and down at the same time. It does not mean one causes the other.",
    "term.miss": "Typical miss", "term.miss.d": "How far off our past guesses were, on average. Smaller is better.",
    "term.psa": "PSA", "term.psa.d": "The Philippine Statistics Authority, the government office that collects these prices.",
    "level.Low": "Low", "level.Medium": "Medium", "level.High": "High",
    "welcome.title": "Kumusta! Welcome to ManokMetrics",
    "welcome.text": "See how much chicken and eggs cost at the palengke, how much farmers are paid, and what may happen next month. All numbers come from PSA price records.",
    "welcome.ok": "Got it",
    "dash.title": "Price overview", "dash.sub": "{product} \u00B7 {scope} \u00B7 latest month: {period}", "dash.cta": "Forecast next month",
    "dash.empty": "Add records in the Price records page to see this overview.",
    "dash.headline": "In {period}, {product} cost {market} {unit} at the market and {farm} at the farm. The gap was {gap} (level: {level}).",
    "dash.headlineFarm": "In {period}, {product} was paid {farm} {unit} at the farm. No market price records are available for this product.",
    "dash.vsLast": "{sign}{amount} vs last month", "dash.na": "Not available", "dash.farmOnly": "Farm only",
    "kpi.market": "Average market price", "kpi.farm": "Average farm price", "kpi.gap": "Average price gap", "kpi.latest": "Latest month \u00B7 {period}", "kpi.latestNote": "Market price minus farm price",
    "chart.title": "{product} price trend", "chart.market": "Market", "chart.farm": "Farm",
    "gap.title": "Price gap", "gap.now": "{level} now", "gap.lead": "How much more shoppers pay than farmers get. It is a gap, not profit.",
    "gap.upto": "up to {x}", "gap.above": "above {x}", "gap.foot": "Number of months in each group",
    "act.question": "What would you like to do?", "act.sub": "Pick one. Every page explains itself in simple words.",
    "act.forecast": "Forecast", "act.forecast.d": "Guess next month's market price",
    "act.analysis": "Why prices move", "act.analysis.d": "See what rises and falls with market prices",
    "act.data": "Price records", "act.data.d": "Browse the numbers or add your own",
    "act.help": "Help", "act.help.d": "Simple steps and a word list",
    "dash.terms": "What do these words mean?",
    "fc.title": "Forecast", "fc.sub": "{product} \u00B7 {scope}. A guide for planning, not a promise of the market price.",
    "fc.noRetail": "This product has no usable price records for forecasting.",
    "fc.setup": "Set up your guess", "fc.s1": "Which farm price should we start from?",
    "fc.o.household": "Backyard (household) farms \u00B7 latest ({x})", "fc.o.establishment": "Commercial farms \u00B7 latest ({x})", "fc.o.average": "Average of all months ({x})",
    "fc.s2": "Farm price we will use (PHP/kg)", "fc.hint": "Set by your choice above.", "fc.s3": "How far ahead?",
    "fc.next1": "Next month", "fc.nextN": "Next {n} months",
    "hero.label": "Likely market price {when}", "hero.label.farm": "Likely farmgate price {when}", "hero.when1": "next month", "hero.whenN": "in {n} months",
    "hero.about": "About {price} {unit} at the market.", "hero.about.farm": "About {price} {unit} at the farmgate.", "hero.tray": "That is about {tray} for a tray of 30.",
    "hero.last": "Last recorded market price", "hero.last.farm": "Last recorded farmgate price", "hero.trust": "How much to trust this guess",
    "trust.good": "Reliable", "trust.ok": "Fairly reliable", "trust.low": "Rough guide only",
    "trust.note": "Past guesses this far ahead were off by about {mape}% on average.",
    "hero.modelNote": "Made with the {model}. You can change the model in Advanced settings.",
    "model.linear": "straight-line model", "model.arima": "recent-trend model", "model.xgboost": "boosted-tree model", "model.randomForest": "multiple-tree model",
    "fc.rel.title": "How reliable are the guesses?", "fc.rel.chip": "Smaller miss = better",
    "fc.rel.intro": "We test each model by hiding a past month, guessing it from the months before, and checking the real price. This is how far off each model was, on average.",
    "fc.best": "Best of these", "fc.miss": "Usually off by about {mae} ({mape}%)", "fc.rec": "Most accurate in past tests", "fc.heldout": "{n} past months tested.",
    "fc.what": "What do the error numbers mean?", "fc.how": "How is the guess made?", "fc.events": "Add news that could move prices (optional)",
    "dec.title": "What this means for you", "dec.tag": "A guide, not a promise",
    "dec.shoppers": "Shoppers", "dec.shoppers.d": "Compare the guess with prices you see at the palengke or supermarket. Look at the price trend first.",
    "dec.biz": "Small food businesses", "dec.biz.d": "Plan a price range and keep a buffer for costs the gap does not include, like rent, transport and labor.",
    "dec.watch": "Price watchers", "dec.watch.d": "Open Why prices move to see patterns before looking into a sudden price change.",
    "dec.now": "Right now: guess {price}, gap {gap} (level: {level}). The most accurate model in past tests was the {model}.",
    "dec.none": "Enter a valid farm price to see a guess.",
    "an.title": "Why prices move", "an.sub": "See which things tend to go up and down together with the market price of {product}. Moving together does not prove that one causes the other.",
    "an.f1.t": "Farm and market prices move together", "an.f1.b": "{word}. When farm prices rise, market prices usually rise too.",
    "an.f2.t": "Farm prices lead by about {n}", "an.f2.b": "Changes at the farm tend to show up in market prices about {n} later.",
    "an.f3.t": "Production and number of birds", "an.f3.b": "Production is {w1} and the number of birds is {w2} with market prices. A hint, not a rule.",
    "an.month1": "1 month", "an.monthN": "{n} months",
    "an.col1": "What we compare", "an.col2": "How closely it follows the market price", "an.col3": "In plain words",
    "an.same": "Compared with the same month's market price", "an.earlier": "Do earlier changes show up later?",
    "an.how": "How to read this page", "an.how.b": "Each bar shows how often two things rise and fall together. A longer bar means they move together more often. This shows they move together, not that one causes the other.",
    "an.tech": "Technical note",
    "an.time": "Time passing (older to newer)", "an.production": "Poultry production", "an.birds": "Number of birds",
    "an.lagMonth1": "{label}, 1 month earlier", "an.lagMonthN": "{label}, {n} months earlier", "an.lagPeriod1": "{label}, from 1 period earlier", "an.lagPeriodN": "{label}, from {n} periods earlier",
    "link.strong": "Very closely linked", "link.mid": "Somewhat linked", "link.weak": "Weakly linked", "link.na": "Not enough data",
    "an.periods": "{n} months used",
    "help.title": "How to use ManokMetrics", "help.sub": "Simple steps and a word list. No statistics background needed.",
    "help.steps": "Three easy steps",
    "help.s1.t": "Pick a product and place", "help.s1.d": "Use the Product and Where boxes at the top. Try Broiler chicken and Whole Philippines first.",
    "help.s2.t": "Look at the Price overview", "help.s2.d": "See today's prices, how they changed, and the price gap.",
    "help.s3.t": "Open Forecast", "help.s3.d": "Get a simple guess for next month and see how much to trust it.",
    "help.glossary": "Word list", "help.faq": "Common questions",
    "faq.q1": "Where do the numbers come from?", "faq.a1": "From the Philippine Statistics Authority (PSA OpenSTAT) price and production records. Your browser reads them and nothing is uploaded.",
    "faq.q2": "Is the forecast a promise?", "faq.a2": "No. It is a guide for planning. Check the box called How reliable are the guesses? on the Forecast page to see how far off past guesses were.",
    "faq.q3": "Why are some market prices missing?", "faq.a3": "For some products, market price records start later than farm price records. We never treat a missing number as zero.",
    "faq.q4": "What does the price gap level mean?", "faq.a4": "Low, Medium and High split the months into three equal groups by the size of the gap. A big gap does not mean big profit.",
    "faq.q5": "Can I add my own prices?", "faq.a5": "Yes. In Price records you can add a month or import a CSV file. They stay in your browser.",
    "faq.q6": "How do I start over?", "faq.a6": "Open Advanced settings and use Reload bundled records.",
    "nav.more": "More",
    "fc.whatif.note": "What-if: using a farm price of {x} with the farm-link method, the one that looks at farm prices.",
    "gap.explain.Low": "Shoppers pay only a little more than farmers get.", "gap.explain.Medium": "Shoppers pay a normal amount more than farmers get.", "gap.explain.High": "Shoppers pay a lot more than farmers get. That is not the same as profit.",
    "home.welcome": "Kumusta! This guide shows chicken and egg prices from PSA records.",
    "home.now": "Right now \u00B7 {period}",
    "home.price": "{product} costs {price} {unit} at the market.",
    "home.priceFarm": "{product} is paid {price} {unit} at the farm.",
    "home.farmLine": "Farmers get {farm} {unit}. The difference is {gap} (level: {level}).",
    "home.up": "Up {amount} from last month", "home.down": "Down {amount} from last month", "home.flat": "Same as last month",
    "home.next.title": "Our guess for next month", "home.next.title.farm": "Our farmgate guess for next month", "home.next.cta": "See the forecast",
    "home.range.2y": "Last 2 years", "home.range.all": "All years",
    "gap.simple": "Shoppers pay {gap} more than farmers get.",
    "gap.scale.Low": "Small", "gap.scale.Medium": "Normal", "gap.scale.High": "Big",
    "gap.cuts": "Small up to {a} \u00B7 Normal up to {b}",
    "fc.h1": "Next month", "fc.h2": "2 months", "fc.h3": "3 months", "fc.h6": "6 months", "fc.h12": "1 year", "fc.custom": "Custom months",
    "hero.when12": "in 1 year",
    "fc.vsLast": "{sign}{amount} from the last recorded price",
    "fc.rel2.title": "How reliable is this guess?",
    "fc.rel2.body": "We tested this method on {n} past months. It was usually off by about {mae} ({mape}%). Just repeating the last price would be off by about {nmae} ({nmape}%).",
    "fc.rel2.better": "Better than repeating the last price.", "fc.rel2.same": "About as good as repeating the last price.", "fc.rel2.worse": "Not better than repeating the last price, so treat it as a rough guide.",
    "fc.rel2.far": "The further ahead we guess, the less certain it gets.",
    "fc.bar.ours": "Our guess", "fc.bar.last": "Repeat last price",
    "fc.adv.compare": "Compare the methods (for analysts)", "fc.adv.auto": "The app tests every method on past months and picks the most accurate one for this time ahead. The star marks the pick.",
    "fc.adv.col1": "Method", "fc.adv.col2": "Usual miss", "fc.adv.col3": "Percent miss",
    "fc.whatif": "What if the farm price is different?", "fc.whatif.body": "Type a farm price to see how the guess changes. It starts at the latest farm price ({x}).", "fc.whatif.apply": "Apply", "fc.whatif.reset": "Back to latest",
    "fc.how2.body": "We look at how the market price changed in recent months and how farm prices changed. Then we predict how much the market price will change. We test several methods on past months and use the most accurate one.", "fc.how2.farm": "We look at how the farmgate price changed in recent months. Then we predict how much the farmgate price will change. We test several methods on past months and use the most accurate one.",
    "model2.naive": "Repeat last price", "model2.linear": "Farm-link (linear)", "model2.arima": "Recent trend (ARIMA 2,1,0)", "model2.xgboost": "Boosted stumps (XGBoost-style)", "model2.randomForest": "Random forest",
    "an.hint": "A longer bar means the two move together more often.",
    "data.recent": "Recent months", "data.col.month": "Month", "data.more": "More tools: compare sources, charts, import your own data",
  },
  fil: {
    "brand.sub": "Gabay sa presyo ng manok at itlog",
    "nav.home": "Home", "nav.forecast": "Hula ng presyo", "nav.analysis": "Bakit gumagalaw ang presyo", "nav.data": "Mga rekord ng presyo", "nav.settings": "Mga advanced na setting", "nav.help": "Tulong",
    "status.ready": "Handa na ang data", "status.loading": "Naglo-load", "status.needs": "Kailangan ng data", "loading.title": "Inihahanda ang mga rekord ng presyo", "loading.body": "Sinusuri ng munting sisiw ang pinakabagong presyo sa bukid at palengke.",
    "foot.psa": "Data mula sa PSA OpenSTAT",
    "scope.national": "Buong Pilipinas", "scope.chooseRegion": "Pumili ng region", "scope.chooseProvince": "Pumili ng probinsya",
    "filter.product": "Produkto", "filter.where": "Saan", "filter.region": "Region", "filter.province": "Probinsya",
    "term.farm": "Presyo sa bukid", "term.farm.d": "Ang bayad sa magsasaka para sa manok o itlog.",
    "term.market": "Presyo sa palengke", "term.market.d": "Ang binabayaran mo bilang mamimili sa palengke o tindahan.",
    "term.gap": "Agwat ng presyo", "term.gap.d": "Presyo sa palengke bawas ang presyo sa bukid. Agwat ito, hindi tubo.",
    "term.forecast": "Hula ng presyo", "term.forecast.d": "Pinakamahusay naming hula sa presyo sa hinaharap, batay sa mga nakaraang presyo. Maaari itong magkamali.",
    "term.link": "Sabay na gumagalaw", "term.link.d": "Dalawang bagay na karaniwang sabay tumataas at bumababa. Hindi ibig sabihin na ang isa ang sanhi ng isa.",
    "term.miss": "Karaniwang mali", "term.miss.d": "Gaano kalayo ang mali ng mga nakaraang hula, sa karaniwan. Mas maliit, mas mabuti.",
    "term.psa": "PSA", "term.psa.d": "Ang Philippine Statistics Authority, ang tanggapan ng gobyerno na nangongolekta ng mga presyong ito.",
    "level.Low": "Mababa", "level.Medium": "Katamtaman", "level.High": "Mataas",
    "welcome.title": "Kumusta! Maligayang pagdating sa ManokMetrics",
    "welcome.text": "Tingnan kung magkano ang manok at itlog sa palengke, magkano ang bayad sa magsasaka, at ano ang posibleng mangyari sa susunod na buwan. Galing ang lahat ng numero sa mga rekord ng presyo ng PSA.",
    "welcome.ok": "Sige",
    "dash.title": "Pangkalahatang presyo", "dash.sub": "{product} \u00B7 {scope} \u00B7 pinakabagong buwan: {period}", "dash.cta": "Hulaan ang susunod na buwan",
    "dash.empty": "Magdagdag ng mga rekord sa pahina ng Mga rekord ng presyo para makita ito.",
    "dash.headline": "Noong {period}, ang {product} ay {market} {unit} sa palengke at {farm} sa bukid. Ang agwat ay {gap} (antas: {level}).",
    "dash.headlineFarm": "Noong {period}, ang {product} ay binayaran ng {farm} {unit} sa bukid. Walang rekord ng presyo sa palengke para sa produktong ito.",
    "dash.vsLast": "{sign}{amount} kumpara noong nakaraang buwan", "dash.na": "Wala", "dash.farmOnly": "Bukid lamang",
    "kpi.market": "Karaniwang presyo sa palengke", "kpi.farm": "Karaniwang presyo sa bukid", "kpi.gap": "Karaniwang agwat ng presyo", "kpi.latest": "Pinakabagong buwan \u00B7 {period}", "kpi.latestNote": "Presyo sa palengke bawas presyo sa bukid",
    "chart.title": "Galaw ng presyo ng {product}", "chart.market": "Palengke", "chart.farm": "Bukid",
    "gap.title": "Agwat ng presyo", "gap.now": "{level} ngayon", "gap.lead": "Gaano kalaki ang dagdag na binabayaran ng mamimili kumpara sa bayad sa magsasaka. Agwat ito, hindi tubo.",
    "gap.upto": "hanggang {x}", "gap.above": "higit sa {x}", "gap.foot": "Bilang ng buwan sa bawat grupo",
    "act.question": "Ano ang gusto mong gawin?", "act.sub": "Pumili ng isa. Ipinapaliwanag ng bawat pahina ang sarili nito sa simpleng salita.",
    "act.forecast": "Hula ng presyo", "act.forecast.d": "Hulaan ang presyo sa palengke sa susunod na buwan",
    "act.analysis": "Bakit gumagalaw ang presyo", "act.analysis.d": "Tingnan kung ano ang kasabay ng galaw ng presyo",
    "act.data": "Mga rekord ng presyo", "act.data.d": "Silipin ang mga numero o magdagdag ng sarili",
    "act.help": "Tulong", "act.help.d": "Simpleng hakbang at talaan ng salita",
    "dash.terms": "Ano ang ibig sabihin ng mga salitang ito?",
    "fc.title": "Hula ng presyo", "fc.sub": "{product} \u00B7 {scope}. Gabay ito sa pagpaplano, hindi pangako ng presyo sa palengke.",
    "fc.noRetail": "Walang magagamit na rekord ng presyo para sa hula ng produktong ito.",
    "fc.setup": "Ihanda ang hula", "fc.s1": "Aling presyo sa bukid ang gagamitin?",
    "fc.o.household": "Mga backyard (household) na bukid \u00B7 pinakabago ({x})", "fc.o.establishment": "Mga komersyal na farm \u00B7 pinakabago ({x})", "fc.o.average": "Karaniwan sa lahat ng buwan ({x})",
    "fc.s2": "Presyo sa bukid na gagamitin (PHP/kg)", "fc.hint": "Itinakda ng napili mo sa itaas.", "fc.s3": "Gaano kalayo ang hula?",
    "fc.next1": "Susunod na buwan", "fc.nextN": "Susunod na {n} buwan",
    "hero.label": "Posibleng presyo sa palengke {when}", "hero.label.farm": "Posibleng presyo sa bukid {when}", "hero.when1": "sa susunod na buwan", "hero.whenN": "sa loob ng {n} buwan",
    "hero.about": "Mga {price} {unit} sa palengke.", "hero.about.farm": "Mga {price} {unit} sa bukid.", "hero.tray": "Humigit-kumulang {tray} bawat tray na 30.",
    "hero.last": "Huling naitalang presyo sa palengke", "hero.trust": "Gaano katiyak ang hulang ito",
    "trust.good": "Maaasahan", "trust.ok": "Medyo maaasahan", "trust.low": "Magaspang na gabay lamang",
    "trust.note": "Ang mga nakaraang hula sa layong ito ay may mali na mga {mape}% sa karaniwan.",
    "hero.modelNote": "Ginawa gamit ang {model}. Maaari mong palitan ang modelo sa Mga advanced na setting.",
    "model.linear": "tuwid na linyang modelo", "model.arima": "modelo ng kamakailang galaw", "model.xgboost": "boosted-tree na modelo", "model.randomForest": "multiple-tree na modelo",
    "fc.rel.title": "Gaano katiyak ang mga hula?", "fc.rel.chip": "Mas maliit na mali = mas mabuti",
    "fc.rel.intro": "Sinusubukan namin ang bawat modelo: itinatago ang isang nakaraang buwan, hinuhulaan mula sa mga naunang buwan, at tinitingnan ang totoong presyo. Ito ang karaniwang laki ng mali ng bawat modelo.",
    "fc.best": "Pinakamaganda dito", "fc.miss": "Karaniwang mali ng mga {mae} ({mape}%)", "fc.rec": "Pinakatumpak sa mga nakaraang pagsubok", "fc.heldout": "{n} nakaraang buwan ang sinubukan.",
    "fc.what": "Ano ang ibig sabihin ng mga numero ng mali?", "fc.how": "Paano ginagawa ang hula?", "fc.events": "Magdagdag ng balitang maaaring makaapekto sa presyo (opsyonal)",
    "dec.title": "Ano ang ibig sabihin nito para sa iyo", "dec.tag": "Gabay, hindi pangako",
    "dec.shoppers": "Mga mamimili", "dec.shoppers.d": "Ihambing ang hula sa mga presyong nakikita mo sa palengke o supermarket. Tingnan muna ang galaw ng presyo.",
    "dec.biz": "Maliliit na negosyo ng pagkain", "dec.biz.d": "Magplano ng saklaw ng presyo at maglaan ng dagdag para sa mga gastos na wala sa agwat, tulad ng upa, transportasyon at sahod.",
    "dec.watch": "Mga nagbabantay ng presyo", "dec.watch.d": "Buksan ang Bakit gumagalaw ang presyo para makita ang mga padron bago imbestigahan ang biglaang pagbabago ng presyo.",
    "dec.now": "Sa ngayon: hula {price}, agwat {gap} (antas: {level}). Ang pinakatumpak sa mga nakaraang pagsubok ay ang {model}.",
    "dec.none": "Maglagay ng tamang presyo sa bukid para makakuha ng hula.",
    "an.title": "Bakit gumagalaw ang presyo", "an.sub": "Tingnan kung anong mga bagay ang karaniwang sabay tumataas at bumababa kasama ng presyo ng {product} sa palengke. Hindi nangangahulugang ang isa ang sanhi ng isa kahit sabay silang gumagalaw.",
    "an.f1.t": "Sabay na gumagalaw ang presyo sa bukid at sa palengke", "an.f1.b": "{word}. Kapag tumaas ang presyo sa bukid, karaniwang tumataas din ang presyo sa palengke.",
    "an.f2.t": "Nauuna ang presyo sa bukid nang mga {n}", "an.f2.b": "Ang pagbabago sa bukid ay karaniwang makikita sa presyo sa palengke makalipas ang mga {n}.",
    "an.f3.t": "Produksyon at dami ng manok", "an.f3.b": "Ang produksyon ay {w1} at ang dami ng manok ay {w2} sa presyo sa palengke. Pahiwatig lamang ito, hindi batas.",
    "an.month1": "1 buwan", "an.monthN": "{n} buwan",
    "an.col1": "Ano ang pinaghahambing", "an.col2": "Gaano ito kasunod ng presyo sa palengke", "an.col3": "Sa simpleng salita",
    "an.same": "Kumpara sa presyo sa palengke sa parehong buwan", "an.earlier": "Lumilitaw ba mamaya ang mga naunang pagbabago?",
    "an.how": "Paano basahin ang pahinang ito", "an.how.b": "Ipinapakita ng bawat bar kung gaano kadalas sabay tumataas at bumababa ang dalawang bagay. Mas mahabang bar, mas madalas silang sabay gumalaw. Ipinapakita nitong sabay silang gumagalaw, hindi na ang isa ang sanhi ng isa.",
    "an.tech": "Teknikal na tala",
    "an.time": "Paglipas ng panahon (luma hanggang bago)", "an.production": "Produksyon ng manok", "an.birds": "Dami ng manok",
    "an.lagMonth1": "{label}, 1 buwan ang nauna", "an.lagMonthN": "{label}, {n} buwan ang nauna", "an.lagPeriod1": "{label}, mula sa 1 naunang yugto", "an.lagPeriodN": "{label}, mula sa {n} naunang yugto",
    "link.strong": "Malapit na malapit ang ugnayan", "link.mid": "May kaunting ugnayan", "link.weak": "Mahina ang ugnayan", "link.na": "Kulang ang data",
    "an.periods": "{n} buwan ang ginamit",
    "help.title": "Paano gamitin ang ManokMetrics", "help.sub": "Simpleng hakbang at talaan ng salita. Hindi kailangan ng kaalaman sa estadistika.",
    "help.steps": "Tatlong madaling hakbang",
    "help.s1.t": "Pumili ng produkto at lugar", "help.s1.d": "Gamitin ang mga kahon ng Produkto at Saan sa itaas. Subukan muna ang Broiler chicken at Buong Pilipinas.",
    "help.s2.t": "Tingnan ang Pangkalahatang presyo", "help.s2.d": "Tingnan ang presyo ngayon, kung paano ito nagbago, at ang agwat ng presyo.",
    "help.s3.t": "Buksan ang Hula ng presyo", "help.s3.d": "Kumuha ng simpleng hula para sa susunod na buwan at alamin kung gaano ito katiyak.",
    "help.glossary": "Talaan ng salita", "help.faq": "Mga madalas itanong",
    "faq.q1": "Saan galing ang mga numero?", "faq.a1": "Galing sa mga rekord ng presyo at produksyon ng Philippine Statistics Authority (PSA OpenSTAT). Binabasa ito ng iyong browser at walang ina-upload.",
    "faq.q2": "Pangako ba ang hula?", "faq.a2": "Hindi. Gabay ito sa pagpaplano. Tingnan ang kahon na Gaano katiyak ang mga hula? sa pahina ng Hula ng presyo para makita kung gaano kalayo ang mali ng mga nakaraang hula.",
    "faq.q3": "Bakit may kulang na presyo sa palengke?", "faq.a3": "Sa ilang produkto, mas huli nagsisimula ang rekord ng presyo sa palengke kaysa sa bukid. Hindi namin ituturing na zero ang kulang na numero.",
    "faq.q4": "Ano ang ibig sabihin ng antas ng agwat ng presyo?", "faq.a4": "Hinahati ng Mababa, Katamtaman at Mataas ang mga buwan sa tatlong magkakapantay na grupo ayon sa laki ng agwat. Hindi nangangahulugang malaki ang tubo kapag malaki ang agwat.",
    "faq.q5": "Maaari ba akong magdagdag ng sarili kong presyo?", "faq.a5": "Oo. Sa Mga rekord ng presyo maaari kang magdagdag ng buwan o mag-import ng CSV file. Mananatili ang mga ito sa iyong browser.",
    "faq.q6": "Paano magsimula ulit?", "faq.a6": "Buksan ang Mga advanced na setting at gamitin ang Reload bundled records.",
    "nav.more": "Iba pa",
    "fc.whatif.note": "Paano-kung: gamit ang presyo sa bukid na {x} sa pamamaraang farm-link, ang tumitingin sa presyo sa bukid.",
    "gap.explain.Low": "Kaunti lang ang dagdag na binabayaran ng mamimili kaysa sa bayad sa magsasaka.", "gap.explain.Medium": "Karaniwang dagdag ang binabayaran ng mamimili kaysa sa bayad sa magsasaka.", "gap.explain.High": "Malaki ang dagdag na binabayaran ng mamimili kaysa sa bayad sa magsasaka. Hindi ito katumbas ng tubo.",
    "home.welcome": "Kumusta! Ipinapakita ng gabay na ito ang presyo ng manok at itlog mula sa mga rekord ng PSA.",
    "home.now": "Ngayon \u00B7 {period}",
    "home.price": "Ang {product} ay {price} {unit} sa palengke.",
    "home.priceFarm": "Ang {product} ay binabayaran ng {price} {unit} sa bukid.",
    "home.farmLine": "Ang bayad sa magsasaka ay {farm} {unit}. Ang agwat ay {gap} (antas: {level}).",
    "home.up": "Tumaas ng {amount} mula noong nakaraang buwan", "home.down": "Bumaba ng {amount} mula noong nakaraang buwan", "home.flat": "Kapareho ng nakaraang buwan",
    "home.next.title": "Ang aming hula para sa susunod na buwan", "home.next.title.farm": "Ang aming hula sa presyo sa bukid para sa susunod na buwan", "home.next.cta": "Tingnan ang hula",
    "home.range.2y": "Huling 2 taon", "home.range.all": "Lahat ng taon",
    "gap.simple": "Mas malaki ng {gap} ang binabayaran ng mamimili kaysa sa bayad sa magsasaka.",
    "gap.scale.Low": "Maliit", "gap.scale.Medium": "Katamtaman", "gap.scale.High": "Malaki",
    "gap.cuts": "Maliit hanggang {a} \u00B7 Katamtaman hanggang {b}",
    "fc.h1": "Susunod na buwan", "fc.h2": "2 buwan", "fc.h3": "3 buwan", "fc.h6": "6 na buwan", "fc.h12": "1 taon", "fc.custom": "Pasadyang buwan",
    "hero.when12": "sa loob ng 1 taon",
    "fc.vsLast": "{sign}{amount} mula sa huling naitalang presyo",
    "fc.rel2.title": "Gaano katiyak ang hulang ito?",
    "fc.rel2.body": "Sinubukan namin ang pamamaraang ito sa {n} nakaraang buwan. Karaniwan itong nagkamali ng mga {mae} ({mape}%). Kung uulitin lang ang huling presyo, magkakamali ito ng mga {nmae} ({nmape}%).",
    "fc.rel2.better": "Mas mahusay kaysa sa pag-ulit ng huling presyo.", "fc.rel2.same": "Halos kasingtumpak ng pag-ulit ng huling presyo.", "fc.rel2.worse": "Hindi mas mahusay kaysa sa pag-ulit ng huling presyo, kaya ituring itong magaspang na gabay lamang.",
    "fc.rel2.far": "Habang mas malayo ang hula, mas hindi ito tiyak.",
    "fc.bar.ours": "Ang aming hula", "fc.bar.last": "Ulitin ang huling presyo",
    "fc.adv.compare": "Ihambing ang mga pamamaraan (para sa mga analyst)", "fc.adv.auto": "Sinusubukan ng app ang bawat pamamaraan sa mga nakaraang buwan at pinipili ang pinakatumpak para sa layong ito. Minarkahan ng bituin ang napili.",
    "fc.adv.col1": "Pamamaraan", "fc.adv.col2": "Karaniwang mali", "fc.adv.col3": "Porsyentong mali",
    "fc.whatif": "Paano kung iba ang presyo sa bukid?", "fc.whatif.body": "Maglagay ng presyo sa bukid para makita kung paano nagbabago ang hula. Nagsisimula ito sa pinakabagong presyo sa bukid ({x}).", "fc.whatif.apply": "Ilapat", "fc.whatif.reset": "Bumalik sa pinakabago",
    "fc.how2.body": "Tinitingnan namin kung paano nagbago ang presyo sa palengke nitong mga nakaraang buwan at kung paano nagbago ang presyo sa bukid. Pagkatapos, hinuhulaan namin kung gaano magbabago ang presyo sa palengke. Sinusubukan namin ang ilang pamamaraan sa mga nakaraang buwan at ginagamit ang pinakatumpak.", "fc.how2.farm": "Tinitingnan namin kung paano nagbago ang presyo sa bukid nitong mga nakaraang buwan. Pagkatapos, hinuhulaan namin kung gaano magbabago ang presyo sa bukid. Sinusubukan namin ang ilang pamamaraan sa mga nakaraang buwan at ginagamit ang pinakatumpak.",
    "model2.naive": "Ulitin ang huling presyo", "model2.linear": "Farm-link (linear)", "model2.arima": "Kamakailang galaw (ARIMA 2,1,0)", "model2.xgboost": "Boosted stumps (XGBoost-style)", "model2.randomForest": "Random forest",
    "an.hint": "Mas mahabang bar, mas madalas silang sabay gumalaw.",
    "data.recent": "Mga huling buwan", "data.col.month": "Buwan", "data.more": "Iba pang kasangkapan: ihambing ang mga source, mga tsart, mag-import ng sariling data",
  },
};
const LangContext = React.createContext("en");
function makeT(lang) {
  const t = (key, vars) => {
    let text = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (vars) Object.keys(vars).forEach(name => { text = text.split("{" + name + "}").join(String(vars[name])); });
    return text;
  };
  t.lang = lang;
  return t;
}
function useT() { return makeT(React.useContext(LangContext)); }

function ChickMark() {
  return (
    <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
      <path d="M27 52v7M37 52v7M24 59h6M34 59h6" stroke="#F2A33A" strokeWidth="3" strokeLinecap="round" fill="none" />
      <ellipse cx="31" cy="39" rx="17" ry="14" fill="#fff" stroke="#11162B" strokeWidth="2.6" />
      <circle cx="33" cy="22" r="11" fill="#fff" stroke="#11162B" strokeWidth="2.6" />
      <circle cx="28" cy="11.5" r="3.6" fill="#E8553D" /><circle cx="33" cy="9.5" r="4" fill="#E8553D" /><circle cx="38" cy="11.5" r="3.6" fill="#E8553D" />
      <path d="M43 21l8 3.5-8 3.5z" fill="#F2A33A" stroke="#11162B" strokeWidth="1.6" strokeLinejoin="round" />
      <ellipse cx="42" cy="31" rx="2.6" ry="3.6" fill="#E8553D" />
      <circle cx="37" cy="21" r="1.9" fill="#11162B" />
      <path d="M20 37q9-7 16 2q-5 9-16-2z" fill="#F2A33A" stroke="#11162B" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function Meter({ value }) {
  const missing = value === null || value === undefined;
  const pct = missing ? 0 : Math.min(100, Math.round(Math.abs(value) * 100));
  const tone = missing ? "na" : Math.abs(value) >= 0.7 ? "strong" : Math.abs(value) >= 0.4 ? "mid" : "weak";
  return (
    <span className="meter">
      <span className="meter-track"><i className={`meter-fill ${tone}`} style={{ width: `${pct}%` }} /></span>
      <small>{missing ? "\u2014" : Math.abs(value).toFixed(2)}</small>
    </span>
  );
}

const SOURCE_DEFS = [
  { id: "master", file: "master_national_monthly.csv", name: "National monthly prices", description: "National monthly farmgate and retail prices for the selected product.", kind: "paired", unit: "PHP/kg", scale: "price" },
  { id: "farmgate-household", file: "farmgate_household_preprocessed_imputed.csv", nationalFile: "farmgate_household_complete.csv", name: "Farmgate: household", description: "Producer prices reported by household farms for the selected geographic scope.", kind: "value", unit: "PHP/kg", mode: "average", scale: "price", periodType: "month", filters: {} },
  { id: "farmgate-establishment", file: "farmgate_establishment_preprocessed_imputed.csv", nationalFile: "farmgate_establishment_complete.csv", name: "Farmgate: establishment", description: "Producer prices reported by larger establishments for the selected geographic scope.", kind: "value", unit: "PHP/kg", mode: "average", scale: "price", periodType: "month", filters: {} },
  { id: "retail", file: "retail_price_preprocessed.csv", nationalFile: "retail_price_complete.csv", name: "Retail price", description: "Retail prices for the selected poultry product and geographic scope.", kind: "value", unit: "PHP/kg", mode: "average", scale: "price", periodType: "month", filters: {} },
  { id: "chicken-inventory", file: "chicken_inventory_preprocessed.csv", nationalFile: "chicken_inventory_clean.csv", name: "Chicken inventory", description: "Chicken inventory records for the selected geographic scope.", kind: "value", unit: "birds", mode: "sum", scale: "quantity" },
  { id: "duck-inventory", file: "duck_inventory_preprocessed.csv", nationalFile: "duck_inventory_clean.csv", name: "Duck inventory", description: "Duck inventory records for the selected geographic scope.", kind: "value", unit: "birds", mode: "sum", scale: "quantity" },
  { id: "production", file: "production_volume_preprocessed_regionalonly.csv", nationalFile: "production_volume_clean.csv", name: "Production volume", description: "Poultry production for the selected geographic scope (quarterly only).", kind: "value", unit: "volume", mode: "sum", scale: "quantity" },
  { id: "slaughter", file: "slaughter_clean_preprocessed.csv", nationalFile: "slaughter_clean.csv", name: "Slaughter volume", description: "Reported slaughter volume for the selected geographic scope.", kind: "value", unit: "volume", mode: "sum", scale: "quantity" },
];

const SEED_DATA = [];
const bundledSourceCache = new Map();
const bundledSourcePromises = new Map();
const bundledSourceItemCache = new Map();
const bundledSourceItemPromises = new Map();

const DEFAULT_SETTINGS = {
  modelType: "linear",
  trainingWindow: 12,
  smoothing: 0.35,
  intercept: 18,
  farmgateCoef: 1.08,
  trendCoef: 0.52,
  lagCoef: 0.23,
  lowMax: 32,
  medMax: 42,
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function classify(spread, settings) {
  if (spread <= settings.lowMax) return "Low";
  if (spread <= settings.medMax) return "Medium";
  return "High";
}

function deriveSpreadThresholds(rows) {
  const spreads = rows
    .filter(row => row.retail !== null && row.retail !== undefined && row.farmgate !== null && row.farmgate !== undefined)
    .map(row => Number(row.retail) - Number(row.farmgate))
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
  if (spreads.length < 3) return null;
  const quantile = position => {
    const index = (spreads.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return spreads[lower] + (spreads[upper] - spreads[lower]) * weight;
  };
  return {
    lowMax: Number(quantile(1 / 3).toFixed(2)),
    medMax: Number(quantile(2 / 3).toFixed(2)),
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function rankValues(values) {
  const indexed = values.map((value, index) => ({ value: Number(value), index }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  let start = 0;
  while (start < indexed.length) {
    let end = start;
    while (end + 1 < indexed.length && indexed[end + 1].value === indexed[start].value) end += 1;
    const rank = (start + end + 2) / 2;
    for (let index = start; index <= end; index += 1) ranks[indexed[index].index] = rank;
    start = end + 1;
  }
  return ranks;
}

function spearmanCorrelation(first, second) {
  if (first.length !== second.length || first.length < 3) return null;
  const firstRanks = rankValues(first);
  const secondRanks = rankValues(second);
  const firstMean = average(firstRanks);
  const secondMean = average(secondRanks);
  const numerator = firstRanks.reduce((sum, value, index) => sum + (value - firstMean) * (secondRanks[index] - secondMean), 0);
  const firstVariance = firstRanks.reduce((sum, value) => sum + (value - firstMean) ** 2, 0);
  const secondVariance = secondRanks.reduce((sum, value) => sum + (value - secondMean) ** 2, 0);
  if (!firstVariance || !secondVariance) return null;
  return numerator / Math.sqrt(firstVariance * secondVariance);
}

function spearmanPairwise(first, second) {
  const pairs = first.map((value, index) => ({ first: value, second: second[index] })).filter(pair => pair.first !== null && pair.first !== undefined && pair.second !== null && pair.second !== undefined && Number.isFinite(Number(pair.first)) && Number.isFinite(Number(pair.second)));
  return spearmanCorrelation(pairs.map(pair => pair.first), pairs.map(pair => pair.second));
}

function alignSourceByYear(rows, sourceRows) {
  const valuesByYear = new Map();
  sourceRows.forEach(sourceRow => {
    const year = String(sourceRow.periodKey || "").slice(0, 4);
    if (!/^\d{4}$/.test(year) || !Number.isFinite(Number(sourceRow.value))) return;
    const values = valuesByYear.get(year) || [];
    values.push(Number(sourceRow.value));
    valuesByYear.set(year, values);
  });
  return rows.map(row => {
    const values = valuesByYear.get(String(row.periodKey || "").slice(0, 4));
    return values?.length ? average(values) : null;
  });
}

function buildCorrelationAnalysis(rows, productionRows = [], inventoryRows = []) {
  const alignedProduction = alignSourceByYear(rows, productionRows);
  const alignedInventory = alignSourceByYear(rows, inventoryRows);
  const indicators = [
    { id: "farmgate", label: "Farmgate price", values: rows.map(row => row.farmgate) },
    { id: "spread", label: "Marketing spread", values: rows.map(row => row.retail - row.farmgate) },
    { id: "time", label: "Time index", values: rows.map((_, index) => index + 1) },
    ...(productionRows.length ? [{ id: "production", label: "Production volume", values: alignedProduction }] : []),
    ...(inventoryRows.length ? [{ id: "inventory", label: "Inventory level", values: alignedInventory }] : []),
  ];
  const target = rows.map(row => row.retail);
  const contemporaneous = indicators.map(indicator => ({
    ...indicator,
    correlation: spearmanPairwise(indicator.values, target),
  }));
  const laggedIndicators = [
    { label: "Farmgate price", values: rows.map(row => row.farmgate) },
    { label: "Retail price", values: rows.map(row => row.retail) },
    ...(productionRows.length ? [{ label: "Production volume", values: alignedProduction }] : []),
    ...(inventoryRows.length ? [{ label: "Inventory level", values: alignedInventory }] : []),
  ];
  const lagged = [1, 2, 3].flatMap(lag => laggedIndicators.map(indicator => ({
    label: `${indicator.label}, lag ${lag}`,
    correlation: spearmanPairwise(indicator.values.slice(0, -lag), target.slice(lag)),
  })));
  return { contemporaneous, lagged, observations: rows.length };
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);

  for (let pivotIndex = 0; pivotIndex < n; pivotIndex += 1) {
    let maxRow = pivotIndex;
    for (let row = pivotIndex + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][pivotIndex]) > Math.abs(augmented[maxRow][pivotIndex])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivotIndex]) < 1e-9) continue;
    if (maxRow !== pivotIndex) {
      [augmented[pivotIndex], augmented[maxRow]] = [augmented[maxRow], augmented[pivotIndex]];
    }

    const pivotValue = augmented[pivotIndex][pivotIndex];
    for (let col = pivotIndex; col <= n; col += 1) {
      augmented[pivotIndex][col] /= pivotValue;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === pivotIndex) continue;
      const factor = augmented[row][pivotIndex];
      if (Math.abs(factor) < 1e-9) continue;
      for (let col = pivotIndex; col <= n; col += 1) {
        augmented[row][col] -= factor * augmented[pivotIndex][col];
      }
    }
  }

  return augmented.map(row => row[n]);
}

function trainPriceGapClassifier(rows, settings, productionRows = []) {
  const productionByYear = new Map();
  productionRows.forEach(row => {
    const year = String(row.periodKey || "").slice(0, 4);
    if (!year) return;
    const current = productionByYear.get(year) || [];
    current.push(Number(row.value));
    productionByYear.set(year, current);
  });
  const productionFallback = average(productionRows.map(row => Number(row.value)).filter(Number.isFinite));
  const hasProduction = productionByYear.size > 0;
  const rawRows = rows.map((row, index) => ({
    features: [Number(row.farmgate), Number(row.retail), index + 1, hasProduction ? average(productionByYear.get(String(row.periodKey || "").slice(0, 4)) || [productionFallback]) : 0],
    label: classify(Number(row.retail - row.farmgate), settings),
  }));
  const means = rawRows[0]?.features.map((_, featureIndex) => average(rawRows.map(row => row.features[featureIndex]))) || [];
  const scales = rawRows[0]?.features.map((_, featureIndex) => {
    const variance = average(rawRows.map(row => (row.features[featureIndex] - means[featureIndex]) ** 2));
    return Math.sqrt(variance) || 1;
  }) || [];
  const labeledRows = rawRows.map(row => ({
    ...row,
    features: row.features.map((value, index) => (value - means[index]) / scales[index]),
  }));
  const centroids = {};
  ["Low", "Medium", "High"].forEach(label => {
    const members = labeledRows.filter(row => row.label === label);
    centroids[label] = members.length ? members[0].features.map((_, index) => average(members.map(row => row.features[index]))) : null;
  });
  return { centroids, means, scales, observations: labeledRows.length, hasProduction };
}

function predictPriceGapClass(model, features) {
  const candidates = Object.entries(model.centroids).filter(([, centroid]) => centroid);
  if (!candidates.length) return { label: "—", confidence: null };
  const normalizedFeatures = features.map((value, index) => (value - model.means[index]) / model.scales[index]);
  const distances = candidates.map(([label, centroid]) => ({
    label,
    distance: Math.sqrt(centroid.reduce((sum, value, index) => sum + (value - normalizedFeatures[index]) ** 2, 0)),
  })).sort((a, b) => a.distance - b.distance);
  const closest = distances[0];
  const runnerUp = distances[1]?.distance ?? closest.distance + 1;
  const confidence = Math.max(0, Math.min(99, 100 * (1 - closest.distance / (closest.distance + runnerUp + 1e-9))));
  return { label: closest.label, confidence };
}

function buildPriceGapClassification(rows, settings, forecastValue, productionRows = []) {
  const latestRow = rows[rows.length - 1];
  const latestSpread = Number(latestRow?.retail ?? 0) - Number(latestRow?.farmgate ?? 0);
  const predictedSpread = forecastValue != null && latestRow ? Number(forecastValue) - Number(latestRow.farmgate) : latestSpread;
  const classifier = trainPriceGapClassifier(rows, settings, productionRows);
  const productionByYear = productionRows.filter(row => String(row.periodKey || "").slice(0, 4) === String(latestRow?.periodKey || "").slice(0, 4));
  const productionValue = productionByYear.length ? average(productionByYear.map(row => row.value)) : average(productionRows.map(row => row.value));
  const predictedFeatures = [Number(latestRow?.farmgate || 0), Number(forecastValue || latestRow?.retail || 0), rows.length + 1, productionValue];
  const profilePrediction = predictPriceGapClass(classifier, predictedFeatures);
  const thresholdLevel = classify(predictedSpread, settings);

  return {
    xgboost: { predictedLevel: profilePrediction.label, confidence: profilePrediction.confidence },
    randomForest: { predictedLevel: thresholdLevel, confidence: 100 },
    threshold: classify(latestSpread, settings),
    latestSpread: predictedSpread,
    observations: classifier.observations,
    notes: `The nearest-profile classifier is trained from historical farmgate, retail, spread, time, and ${classifier.hasProduction ? "production-volume" : "available"} features. The threshold classifier is the transparent rule-based comparison.`,
    hasProduction: classifier.hasProduction,
  };
}

function buildModelEvaluation(rows, settings, farmgateValue, timeIndex, productionRows = []) {
  const empty = { forecast: null, prediction: null, mae: null, rmse: null, mape: null, validationCount: 0 };
  if (!rows.length) {
    return { linear: empty, arima: empty, xgboost: empty, randomForest: empty, naive: empty, classification: null, validation: {}, recommendation: null, engine: null };
  }
  const engine = runForecastEngine(rows, 1);
  const pick = id => { const m = engine.models[id]; return m ? { ...m, prediction: m.forecast } : empty; };
  const linear = pick("linear"), arima = pick("arima"), xgboost = pick("xgboost"), randomForest = pick("randomForest");
  const validation = { linear, arima, xgboost, randomForest };
  const best = engine.recommendation ? engine.models[engine.recommendation].forecast : null;
  const classification = buildPriceGapClassification(rows, settings, best, productionRows);
  return { linear, arima, xgboost, randomForest, naive: engine.naive, classification, validation, recommendation: engine.recommendation, engine };
}

const LEVEL_COLOR = {
  Low: "var(--c-low)",
  Medium: "var(--c-med)",
  High: "var(--c-high)",
};

function fmtPHP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `₱${Number(n).toFixed(2)}`;
}

function constrainForecast(value, rows) {
  const retailValues = rows
    .map(row => Number(row.retail))
    .filter(value => Number.isFinite(value));
  const fallback = retailValues.length ? retailValues[retailValues.length - 1] : null;
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return fallback;
  if (!retailValues.length) return Number(value);
  const upperBound = Math.max(...retailValues) * 1.5;
  return Math.min(Math.max(Number(value), 0), upperBound);
}

function eventAppliesToForecast(event, productName) {
  const product = String(event.product || "").trim().toLowerCase();
  return !product || product === "all poultry" || product === productName.toLowerCase();
}

function eventAppliesToGeography(event, geographicScope) {
  const geography = String(event.geography || "").trim().toLowerCase();
  if (geography === "nationwide") return true;
  if (!geography || geography === "unknown" || geography === "unknown / unspecified") return false;
  const selected = String(geographicScope.level === "province" ? geographicScope.province : geographicScope.region).trim().toLowerCase();
  return geographicScope.level !== "national" && selected === geography;
}

function eventAdjustment(events, productName, geographicScope) {
  return events
    .filter(event => event.status !== "resolved" && event.impactPercent !== "" && Number.isFinite(Number(event.impactPercent)) && eventAppliesToForecast(event, productName) && eventAppliesToGeography(event, geographicScope))
    .reduce((total, event) => total + Number(event.impactPercent), 0);
}

function fmtValue(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatChartPeriod(value) {
  const text = String(value || "");
  const numericMonth = text.match(/^(\d{4})-(\d{2})$/);
  if (numericMonth) return `${Number(numericMonth[2])}/${numericMonth[1]}`;
  const quarter = text.match(/^(\d{4})-Q(\d)$/);
  if (quarter) return `Q${quarter[2]}/${quarter[1]}`;
  const namedMonth = text.match(/^[A-Za-z]{3} (\d{4})$/);
  if (namedMonth) {
    const month = new Date(`${text} 1`).getMonth() + 1;
    return Number.isFinite(month) ? `${month}/${namedMonth[1]}` : text;
  }
  return text;
}

function forecastDateLabel(row, monthsAhead, lang) {
  const period = String(row?.periodKey || row?.period || "");
  const numericMonth = period.match(/^(\d{4})-(\d{2})$/);
  let year = numericMonth ? Number(numericMonth[1]) : null;
  let month = numericMonth ? Number(numericMonth[2]) : null;
  if (!numericMonth) {
    const namedMonth = period.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (namedMonth) {
      const parsed = new Date(`${namedMonth[1]} 1, ${namedMonth[2]}`);
      year = parsed.getFullYear();
      month = parsed.getMonth() + 1;
    }
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1 + monthsAhead, 1)).toLocaleDateString(
    lang === "fil" ? "fil-PH" : "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );
}

function getChartTicks(data, key) {
  const step = Math.max(1, Math.ceil(data.length / 16));
  return data.filter((_, index) => index % step === 0).map(item => item[key]);
}

function mergeDashboardRows(baseRows, importedRows) {
  const merged = new Map((baseRows || []).map(row => [String(row.periodKey || row.period), row]));
  (importedRows || []).forEach(row => {
    const key = String(row.periodKey || row.period);
    if (key) merged.set(key, row);
  });
  return [...merged.values()].sort((first, second) => String(first.periodKey || first.period).localeCompare(String(second.periodKey || second.period)));
}

function normalizeCsvRows(rows, product = PRODUCT_DEFS[0]) {
  return rows.map(row => {
    const keys = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
    const period = keys.period || keys.date || keys.month || keys.time_period;
    const farmgateRaw = keys.farmgate ?? keys.farmgateprice ?? keys.farmgate_price ?? keys[product.farmgateField];
    const retailRaw = keys.retail ?? keys.retailprice ?? keys.retail_price ?? keys[product.retailField];
    const isMissing = value => value === undefined || value === null || ["", ".", "..", "..."].includes(String(value).trim());
    const farmgate = Number(farmgateRaw);
    const retail = Number(retailRaw);
    if (!period || isMissing(farmgateRaw) || isMissing(retailRaw) || Number.isNaN(farmgate) || Number.isNaN(retail)) return null;
    const label = String(period).match(/^\d{4}-\d{2}$/) ? new Date(`${period}-01`).toLocaleDateString("en", { month: "short", year: "numeric" }) : String(period);
    return { id: uid(), period: label, periodKey: String(period), farmgate, retail };
  }).filter(Boolean);
}

async function loadBundledDataset() {
  const response = await fetch(MASTER_DATA_URL);
  if (!response.ok) throw new Error("Bundled dataset could not be loaded");
  const parsed = Papa.parse(await response.text(), { header: true, skipEmptyLines: true });
  return normalizeCsvRows(parsed.data);
}

function normalizeMasterRows(rows, product) {
  return rows.map(row => {
    const keys = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
    const period = keys.period || keys.date || keys.month || keys.time_period;
    const farmgateRaw = keys[product.farmgateField];
    const retailRaw = product.retailField ? keys[product.retailField] : undefined;
    const isMissing = value => value === undefined || value === null || ["", ".", "..", "..."].includes(String(value).trim());
    const farmgate = Number(farmgateRaw);
    const retail = isMissing(retailRaw) ? null : Number(retailRaw);
    if (!period || isMissing(farmgateRaw) || Number.isNaN(farmgate) || (retail !== null && Number.isNaN(retail))) return null;
    const label = String(period).match(/^\d{4}-\d{2}$/) ? new Date(`${period}-01`).toLocaleDateString("en", { month: "short", year: "numeric" }) : String(period);
    return { id: uid(), period: label, periodKey: String(period), farmgate, retail, value: retail };
  }).filter(Boolean);
}

function normalizeSeriesRows(rows, definition, product = PRODUCT_DEFS[0], geographicScope = DEFAULT_GEOGRAPHIC_SCOPE) {
  if (definition.id === "retail" && !product.retailCommodityType) return [];
  const grouped = new Map();
  const isInventorySource = definition.id === "chicken-inventory" || definition.id === "duck-inventory";
  rows.forEach(row => {
    const keys = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
    const geoLevel = String(keys.geo_level || (keys.geo_province ? "province" : keys.geo_region ? "region" : "national")).trim().toLowerCase();
    const region = String(keys.geo_region || "").trim();
    const province = String(keys.geo_province || "").trim();
    if (geographicScope.level === "national" && geoLevel !== "national") return;
    if (geographicScope.level === "region" && (geoLevel !== "province" && geoLevel !== "region" || region.toLowerCase() !== geographicScope.region.toLowerCase())) return;
    if (geographicScope.level === "province" && (geoLevel !== "province" || province.toLowerCase() !== geographicScope.province.toLowerCase())) return;
    if (definition.periodType === "month" && (keys.month === undefined || String(keys.month).trim() === "" || (keys.period_type !== undefined && String(keys.period_type).trim().toLowerCase() !== "month"))) return;
    if (isInventorySource && keys.classification !== undefined && String(keys.classification).trim().toLowerCase() === "total") return;
    const inventoryAnimalType = definition.id === "duck-inventory" ? "DUCK" : product.inventoryAnimalType;
    if (isInventorySource && keys.animal_type !== undefined && inventoryAnimalType && String(keys.animal_type).trim().toLowerCase() !== inventoryAnimalType.toLowerCase()) return;
    const commodityType = definition.id === "retail" ? product.retailCommodityType : product.commodityType;
    const filters = { ...definition.filters, ...(definition.scale === "price" && commodityType ? { commodity_type: commodityType } : {}) };
    if (definition.id === "production") {
      const productionCommodity = product.id === "duck" || product.id === "duck-egg" ? (product.id === "duck" ? "Duck" : "Duck eggs") : product.id === "layer-egg" || product.id === "native-egg" ? "Chicken eggs" : "Chicken";
      if (String(keys.commodity).trim().toLowerCase() !== productionCommodity.toLowerCase()) return;
      if (!keys.quarter) return;
    }
    if (definition.id === "slaughter" && String(keys.animal_type).trim().toLowerCase() !== (["duck", "duck-egg"].includes(product.id) ? "duck" : "chicken")) return;
    if (Object.entries(filters).some(([key, expected]) => key !== "geo_level" && keys[key] !== undefined && String(keys[key]).trim().toLowerCase() !== expected.toLowerCase())) return;
    const rawValue = keys.value_raw ?? keys.value;
    if (rawValue === undefined || rawValue === null || ["", ".", "..", "..."].includes(String(rawValue).trim())) return;
    const value = Number(rawValue);
    if (Number.isNaN(value) || !keys.year) return;
    const periodValue = keys.month || keys.quarter;
    const normalizedPeriodValue = periodValue === undefined ? "" : Number(periodValue);
    const period = periodValue ? `${keys.year}-${keys.month ? String(normalizedPeriodValue).padStart(2, "0") : `Q${normalizedPeriodValue}`}` : String(keys.year);
    const bucket = grouped.get(period) || [];
    bucket.push({ value, region, province, geoLevel });
    grouped.set(period, bucket);
  });
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, values], index) => ({
    id: `${definition.id}-${index}`,
    period: period.match(/^\d{4}-\d{2}$/) ? new Date(`${period}-01`).toLocaleDateString("en", { month: "short", year: "numeric" }) : period,
    periodKey: period,
    value: definition.mode === "sum" ? values.reduce((total, item) => total + item.value, 0) : values.reduce((total, item) => total + item.value, 0) / values.length,
    geographicLevel: geographicScope.level,
    region: values.find(item => item.region)?.region || "",
    province: geographicScope.level === "province" ? values.find(item => item.province)?.province || "" : "",
  }));
}

function combineGeographicPriceRows(sources) {
  const farmgate = sources["farmgate-household"]?.rows || [];
  const retail = sources.retail?.rows || [];
  const retailByPeriod = new Map(retail.map(row => [row.periodKey, row.value]));
  return farmgate.map((row, index) => ({
    id: `regional-price-${index}`,
    period: row.period,
    periodKey: row.periodKey,
    farmgate: row.value,
    retail: retailByPeriod.get(row.periodKey) ?? null,
    geographicLevel: row.geographicLevel,
    region: row.region,
    province: row.province,
  }));
}

function sourceCacheKey(definition, product, geographicScope) {
  const sourceFile = geographicScope.level === "national" && definition.nationalFile ? definition.nationalFile : definition.file;
  const scopeKey = [geographicScope.level, geographicScope.region, geographicScope.province].join("|");
  return `${definition.id}|${sourceFile}|${product.id}|${scopeKey}`;
}

function loadBundledSource(definition, product, geographicScope) {
  const cacheKey = sourceCacheKey(definition, product, geographicScope);
  if (bundledSourceItemCache.has(cacheKey)) return Promise.resolve(bundledSourceItemCache.get(cacheKey));
  if (bundledSourceItemPromises.has(cacheKey)) return bundledSourceItemPromises.get(cacheKey);
  const sourceFile = geographicScope.level === "national" && definition.nationalFile ? definition.nationalFile : definition.file;
  const promise = fetch(`/data/${sourceFile}`)
    .then(response => {
      if (!response.ok) throw new Error(`Could not load ${sourceFile}`);
      return response.text();
    })
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = definition.kind === "paired" ? normalizeMasterRows(parsed.data, product) : normalizeSeriesRows(parsed.data, definition, product, geographicScope);
      const source = { ...definition, file: sourceFile, unit: definition.scale === "price" ? product.unit : definition.unit, rows, loadError: "" };
      bundledSourceItemCache.set(cacheKey, source);
      bundledSourceItemPromises.delete(cacheKey);
      return source;
    })
    .catch(error => {
      bundledSourceItemPromises.delete(cacheKey);
      return { ...definition, unit: definition.scale === "price" ? product.unit : definition.unit, rows: [], loadError: error.message };
    });
  bundledSourceItemPromises.set(cacheKey, promise);
  return promise;
}

function loadAllBundledSources(product = PRODUCT_DEFS[0], geographicScope = DEFAULT_GEOGRAPHIC_SCOPE) {
  const scopeKey = [geographicScope.level, geographicScope.region, geographicScope.province].join("|");
  const cacheKey = `${product.id}|${scopeKey}`;
  if (bundledSourceCache.has(cacheKey)) return bundledSourceCache.get(cacheKey);
  if (bundledSourcePromises.has(cacheKey)) return bundledSourcePromises.get(cacheKey);
  const promise = Promise.all(SOURCE_DEFS.map(definition => loadBundledSource(definition, product, geographicScope))).then(loaded => {
    const result = Object.fromEntries(loaded.map(source => [source.id, source]));
    bundledSourceCache.set(cacheKey, result);
    bundledSourcePromises.delete(cacheKey);
    return result;
  }).catch(error => {
    bundledSourcePromises.delete(cacheKey);
    throw error;
  });
  bundledSourcePromises.set(cacheKey, promise);
  return promise;
}

async function loadAvailableGeographies() {
  const response = await fetch("/data/farmgate_household_preprocessed_imputed.csv");
  if (!response.ok) throw new Error("Regional geography file could not be loaded.");
  const parsed = Papa.parse(await response.text(), { header: true, skipEmptyLines: true });
  const regions = new Set();
  const provincesByRegion = new Map();
  parsed.data.forEach(row => {
    const region = String(row.geo_region || "").trim();
    const province = String(row.geo_province || row.geo_clean_name || "").trim();
    if (!region) return;
    regions.add(region);
    if (!provincesByRegion.has(region)) provincesByRegion.set(region, new Set());
    if (province) provincesByRegion.get(region).add(province);
  });
  return {
    regions: [...regions].sort(),
    provincesByRegion: Object.fromEntries([...provincesByRegion.entries()].map(([region, provinces]) => [region, [...provinces].sort()])),
  };
}

/* ---------------------------- Storage hook --------------------------- */

// Standalone build: persists to the browser's localStorage instead of the
// Claude-artifact storage API (window.storage only exists inside claude.ai).
function usePersistentState(key, initial, persist = true) {
  const [value, setValue] = useState(() => {
    if (!persist) return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch (e) {
      return initial;
    }
  });
  const [ready] = useState(true);

  useEffect(() => {
    if (!persist) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage save failed", e);
    }
  }, [value, key, persist]);

  return [value, setValue, ready];
}

/* ------------------------------- App ---------------------------------- */

export default function App() {
  const [dataset, setDataset, dataReady] = usePersistentState(STORAGE_KEY, SEED_DATA, false);
  const [settings, setSettings, settingsReady] = usePersistentState(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [events, setEvents] = usePersistentState(EVENTS_KEY, []);
  const [tab, setTab] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("manok-lang") === "fil" ? "fil" : "en"; } catch (e) { return "en"; } });
  const chooseLang = (value) => { setLang(value); try { localStorage.setItem("manok-lang", value); } catch (e) { /* ignore */ } };
  const [dataStatus, setDataStatus] = useState("loading");
  const [sources, setSources] = useState({});
  const [activePriceSourceId, setActivePriceSourceId] = useState("master");
  const [comparePriceIds, setComparePriceIds] = useState(["farmgate-household", "farmgate-establishment"]);
  const [activeInventorySourceId, setActiveInventorySourceId] = useState("chicken-inventory");
  const [compareInventoryIds, setCompareInventoryIds] = useState([]);
  const [activeVolumeSourceId, setActiveVolumeSourceId] = useState("production");
  const [compareVolumeIds, setCompareVolumeIds] = useState(["slaughter"]);
  const [selectedProductId, setSelectedProductId] = useState("broiler");
  const [geographicScope, setGeographicScope] = useState(DEFAULT_GEOGRAPHIC_SCOPE);
  const [availableGeographies, setAvailableGeographies] = useState({ regions: [], provincesByRegion: {} });
  const importedDatasetActiveRef = useRef(false);
  const bundledDatasetRef = useRef([]);

  // Auto-select inventory source based on product
  useEffect(() => {
    loadAvailableGeographies().then(setAvailableGeographies).catch(() => setAvailableGeographies({ regions: [], provincesByRegion: {} }));
  }, []);

  useEffect(() => {
    if (selectedProductId === "duck" || selectedProductId === "duck-egg") {
      setActiveInventorySourceId("duck-inventory");
    } else {
      setActiveInventorySourceId("chicken-inventory");
    }
  }, [selectedProductId]);

  const modelOutputs = useMemo(() => {
    const product = PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0];
    const forecastDataset = forecastRowsForProduct(dataset, product);
    const farmgateDataset = farmgateForecastRows(dataset);
    if (!forecastDataset.length && !farmgateDataset.length) return null;
    const forecastLastRow = forecastDataset[forecastDataset.length - 1] || null;
    const farmgateLastRow = farmgateDataset[farmgateDataset.length - 1] || null;
    const retailEvaluation = forecastDataset.length
      ? buildModelEvaluation(forecastDataset, settings, Number(forecastLastRow.farmgate), forecastDataset.length + 1, sources.production?.rows || [])
      : null;
    const farmgateEvaluation = farmgateDataset.length
      ? buildModelEvaluation(farmgateDataset, settings, Number(farmgateLastRow.farmgate), farmgateDataset.length + 1, sources.production?.rows || [])
      : null;
    return {
      ...(retailEvaluation || farmgateEvaluation),
      engine: retailEvaluation?.engine || farmgateEvaluation?.engine || null,
      retailEngine: retailEvaluation?.engine || null,
      farmgateEngine: farmgateEvaluation?.engine || null,
    };
  }, [dataset, selectedProductId, settings, sources]);

  useEffect(() => {
    let cancelled = false;
    let backgroundTimer = null;
    const product = PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0];
    importedDatasetActiveRef.current = false;
    setDataStatus("loading");
    setDataset([]);
    const primaryIds = geographicScope.level === "national" ? ["master"] : ["farmgate-household", "retail"];
    const primaryDefinitions = SOURCE_DEFS.filter(definition => primaryIds.includes(definition.id));
    Promise.all(primaryDefinitions.map(definition => loadBundledSource(definition, product, geographicScope))).then(primaryLoaded => {
      if (cancelled) return;
      const primarySources = Object.fromEntries(primaryLoaded.map(source => [source.id, source]));
      setSources(primarySources);
      const masterRows = primarySources.master?.rows || [];
      const thresholds = deriveSpreadThresholds(masterRows);
      if (thresholds) setSettings(current => ({ ...current, ...thresholds }));
      const nextDataset = geographicScope.level === "national"
        ? masterRows
        : combineGeographicPriceRows(primarySources);
      bundledDatasetRef.current = nextDataset;
      if (!importedDatasetActiveRef.current) {
        setDataset(nextDataset);
        setDataStatus(nextDataset.length ? "ready" : "error");
      }
      if (tab === "data" || tab === "analysis") {
        backgroundTimer = setTimeout(() => {
          loadAllBundledSources(product, geographicScope).then(nextSources => {
            if (!cancelled) setSources(nextSources);
          });
        }, 0);
      }
    }).catch(() => {
      if (cancelled) return;
      loadBundledDataset()
        .then(nextRows => { if (!cancelled) setDataset(nextRows); })
        .catch(() => { if (!cancelled) setDataset([]); });
      setDataStatus("error");
    });
    return () => {
      cancelled = true;
      if (backgroundTimer !== null) clearTimeout(backgroundTimer);
    };
  }, [selectedProductId, geographicScope, tab, setDataset, setSettings]);

  useEffect(() => {
    const masterRows = sources.master?.rows;
    if (!masterRows || activePriceSourceId !== "master") return;
    const hasRetail = masterRows.some(row => row.retail !== null && row.retail !== undefined && Number.isFinite(Number(row.retail)));
    if (!hasRetail) setActivePriceSourceId("farmgate-household");
  }, [sources, activePriceSourceId]);

  const rows = useMemo(() => {
    return dataset.map((d, i) => {
      const hasRetail = d.retail !== null && d.retail !== undefined && Number.isFinite(Number(d.retail));
      const spread = hasRetail ? Number(d.retail) - Number(d.farmgate) : null;
      return { ...d, spread, level: spread === null ? null : classify(spread, settings), idx: i };
    });
  }, [dataset, settings]);

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const latest = rows[rows.length - 1];
    const retailRows = rows.filter(row => row.retail !== null && row.retail !== undefined && Number.isFinite(Number(row.retail)));
    const avgRetail = retailRows.length ? average(retailRows.map(row => Number(row.retail))) : null;
    const avgFarmgate = average(rows.map(row => Number(row.farmgate)));
    const spreadRows = rows.filter(row => row.spread !== null);
    const avgSpread = spreadRows.length ? average(spreadRows.map(row => Number(row.spread))) : null;
    return { avgRetail, avgFarmgate, avgSpread, latest, hasRetail: retailRows.length > 0 };
  }, [rows]);

  const t = makeT(lang);
  const NAV = [
    { id: "dashboard", label: t("nav.home"), icon: LayoutDashboard },
    { id: "predict", label: t("nav.forecast"), icon: TrendingUp },
    { id: "analysis", label: t("nav.analysis"), icon: BarChart3 },
    { id: "faq", label: t("nav.help"), icon: HelpCircle },
  ];
  const NAV_MORE = [
    { id: "data", label: t("nav.data"), icon: Table2 },
    { id: "settings", label: t("nav.settings"), icon: SettingsIcon },
  ];
  const ActiveIcon = productIcon(PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0]);
  const activeProduct = PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0];
  const scopeLabel = geographicScope.level === "national" ? t("scope.national") : geographicScope.level === "region" ? (geographicScope.region || t("scope.chooseRegion")) : (geographicScope.province || t("scope.chooseProvince"));
  const statusText = dataStatus === "loading" ? t("status.loading") : dataStatus === "error" ? t("status.needs") : dataReady && settingsReady ? t("status.ready") : t("status.loading");

  return (
    <LangContext.Provider value={lang}>
    <div className="app">
      <style>{CSS}</style>
      <div className="frame">
        <aside className={`sidebar ${navOpen ? "open" : ""}`}>
          <div className="brand">
            <span className="brand-mark"><ChickMark /></span>
            <span className="brand-text">
              <span className="brand-title">Manok<span className="brand-title-accent">Metrics</span></span>
              <span className="brand-sub">{t("brand.sub")}</span>
            </span>
          </div>

          <nav className="nav" aria-label="Main">
            {NAV.map(item => (
              <button
                key={item.id}
                className={`navitem ${tab === item.id ? "active" : ""}`}
                onClick={() => { setTab(item.id); setNavOpen(false); }}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </button>
            ))}
            <span className="nav-label">{t("nav.more")}</span>
            {NAV_MORE.map(item => (
              <button
                key={item.id}
                className={`navitem navitem-small ${tab === item.id ? "active" : ""}`}
                onClick={() => { setTab(item.id); setNavOpen(false); }}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="lang-toggle" role="group" aria-label="Language">
              <button type="button" className={lang === "en" ? "on" : ""} onClick={() => chooseLang("en")}>EN</button>
              <button type="button" className={lang === "fil" ? "on" : ""} onClick={() => chooseLang("fil")}>Filipino</button>
            </div>
            <span className="foot-note"><Store size={14} />{t("foot.psa")}</span>
          </div>
        </aside>
        {navOpen && <button className="scrim" onClick={() => setNavOpen(false)} aria-label="Close menu" />}

        <main className="main">
          <header className="topbar">
            <button className="hamburger" onClick={() => setNavOpen(v => !v)} aria-label="Toggle menu">
              {navOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <FilterBar
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
              geographicScope={geographicScope}
              setGeographicScope={setGeographicScope}
              availableGeographies={availableGeographies}
            />
            <div className="lang-toggle lang-mobile" role="group" aria-label="Language">
              <button type="button" className={lang === "en" ? "on" : ""} onClick={() => chooseLang("en")}>EN</button>
              <button type="button" className={lang === "fil" ? "on" : ""} onClick={() => chooseLang("fil")}>Filipino</button>
            </div>
          </header>

          <div className="content">
            {dataStatus === "loading" ? <LoadingState /> : (
              <>
                {tab === "dashboard" && <Dashboard rows={rows} stats={stats} selectedProductId={selectedProductId} geographicScope={geographicScope} settings={settings} setTab={setTab} modelOutputs={modelOutputs} />}
                {tab === "data" && <DataTab rows={rows} setDataset={setDataset} activateImportedDataset={importedRows => { importedDatasetActiveRef.current = true; setDataset(mergeDashboardRows(bundledDatasetRef.current, importedRows)); }} sources={sources} activePriceSourceId={activePriceSourceId} setActivePriceSourceId={setActivePriceSourceId} comparePriceIds={comparePriceIds} setComparePriceIds={comparePriceIds} activeInventorySourceId={activeInventorySourceId} setActiveInventorySourceId={setActiveInventorySourceId} compareInventoryIds={compareInventoryIds} setCompareInventoryIds={compareInventoryIds} activeVolumeSourceId={activeVolumeSourceId} setActiveVolumeSourceId={activeVolumeSourceId} compareVolumeIds={compareVolumeIds} setCompareVolumeIds={compareVolumeIds} selectedProductId={selectedProductId} setSelectedProductId={setSelectedProductId} geographicScope={geographicScope} setGeographicScope={setGeographicScope} availableGeographies={availableGeographies} />}
                {tab === "analysis" && <AnalysisTab rows={rows} productionRows={sources.production?.rows || []} inventoryRows={sources[activeInventorySourceId]?.rows || []} selectedProductId={selectedProductId} geographicScope={geographicScope} />}
                {tab === "predict" && <PredictTab settings={settings} rows={rows} modelOutputs={modelOutputs} sources={sources} selectedProductId={selectedProductId} events={events} setEvents={setEvents} geographicScope={geographicScope} availableGeographies={availableGeographies} />}
                {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} rows={rows} />}
                {tab === "faq" && <FaqTab />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
    </LangContext.Provider>
  );
}

function ProductBadge({ id }) {
  const Icon = productIcon(PRODUCT_DEFS.find(item => item.id === id) || PRODUCT_DEFS[0]);
  return <span className="pill-icon"><Icon size={16} /></span>;
}

function trustFromMape(mape) {
  if (mape === null || mape === undefined || !Number.isFinite(Number(mape))) return null;
  return Number(mape) < 2.5 ? "good" : Number(mape) < 5 ? "ok" : "low";
}

function FilterBar({ selectedProductId, setSelectedProductId, geographicScope, setGeographicScope, availableGeographies }) {
  const t = useT();
  return (
    <div className="filterbar">
      <label className="pill-select">
        <ProductBadge id={selectedProductId} />{t("filter.product")}
        <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
          {PRODUCT_DEFS.map(product => <option key={product.id} value={product.id}>{productLabel(product, t.lang)}</option>)}
        </select>
      </label>
      <label className="pill-select">{t("filter.where")}
        <select value={geographicScope.level} onChange={event => setGeographicScope({ level: event.target.value, region: "", province: "" })}>
          <option value="national">{t("scope.national")}</option>
          <option value="region">{t("filter.region")}</option>
          <option value="province">{t("filter.province")}</option>
        </select>
      </label>
      {geographicScope.level !== "national" && (
        <label className="pill-select">{t("filter.region")}
          <select value={geographicScope.region} onChange={event => setGeographicScope(current => ({ ...current, region: event.target.value, province: "" }))}>
            <option value="">{t("scope.chooseRegion")}</option>
            {availableGeographies.regions.map(region => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
      )}
      {geographicScope.level === "province" && (
        <label className="pill-select">{t("filter.province")}
          <select value={geographicScope.province} onChange={event => setGeographicScope(current => ({ ...current, province: event.target.value }))}>
            <option value="">{t("scope.chooseProvince")}</option>
            {(availableGeographies.provincesByRegion[geographicScope.region] || []).map(province => <option key={province} value={province}>{province}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/* ------------------------------- Analysis --------------------------------- */

function AnalysisTab({ rows, productionRows, inventoryRows, selectedProductId, geographicScope }) {
  const t = useT();
  const product = PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0];
  const analysis = useMemo(() => buildCorrelationAnalysis(rows, productionRows, inventoryRows), [rows, productionRows, inventoryRows]);
  const [expandedIndicator, setExpandedIndicator] = useState(null);
  const formatCorrelation = value => value === null ? "—" : value.toFixed(3);
  const interpretation = value => value === null || value === undefined ? t("link.na") : Math.abs(value) >= 0.7 ? t("link.strong") : Math.abs(value) >= 0.4 ? t("link.mid") : t("link.weak");
  const plainBase = { "Farmgate price": t("term.farm"), "Retail price": t("term.market"), "Marketing spread": t("term.gap"), "Time index": t("an.time"), "Production volume": t("an.production"), "Inventory level": t("an.birds") };
  const plainLabel = label => {
    const m = label.match(/^(.*), lag (\d+)$/);
    const base = m ? m[1] : label;
    const name = plainBase[base] || base;
    if (!m) return name;
    const n = Number(m[2]);
    const monthly = base === "Farmgate price" || base === "Retail price";
    const key = monthly ? (n === 1 ? "an.lagMonth1" : "an.lagMonthN") : (n === 1 ? "an.lagPeriod1" : "an.lagPeriodN");
    return t(key, { label: name, n });
  };
  const explanations = {
    "Farmgate price": { title: "Farmgate price", body: "The amount paid to the producer for the bird or egg before it reaches the market. The analysis checks whether producer prices move with retail prices." },
    "Retail price": { title: "Retail price", body: "The amount a shopper pays. This is the comparison target for the relationship scores on this page." },
    "Marketing spread": { title: "Marketing spread", body: "Retail price minus farmgate price. It shows the price gap, not profit, because costs and margins are not included." },
    "Time index": { title: "Time index", body: "The order of the records from oldest to newest. A relationship with time can indicate a broad upward or downward movement, not a cause by itself." },
    "Production volume": { title: "Production volume", body: "The reported amount of poultry produced in the matching year. Quarterly production records are averaged within each year before comparison with monthly prices." },
    "Inventory level": { title: "Inventory level", body: "The reported number of birds in the matching year. Inventory records are aligned by year because they do not use the same monthly schedule as prices." },
  };
  const toggleIndicator = label => setExpandedIndicator(current => current === label ? null : label);
  const renderIndicatorCell = (label, key) => {
    const baseLabel = label.replace(/, lag \d+$/, "");
    const explanation = explanations[baseLabel];
    if (!explanation) return <td key={key}>{label}</td>;
    const isExpanded = expandedIndicator === label;
    return <td key={key}><button className="analysis-explain-toggle" type="button" aria-expanded={isExpanded} onClick={() => toggleIndicator(label)}>{plainLabel(label)}<span aria-hidden="true">{isExpanded ? "−" : "i"}</span></button></td>;
  };
  const renderExplanationRow = (label, key) => {
    const baseLabel = label.replace(/, lag \d+$/, "");
    const explanation = explanations[baseLabel];
    return expandedIndicator === label && explanation ? <tr className="analysis-explanation-row" key={`${key}-explanation`}><td colSpan="3"><strong>{explanation.title}:</strong> {explanation.body}{label.includes(", lag ") ? " This row uses an earlier period and compares it with the current retail price." : ""}</td></tr> : null;
  };

  const farmLags = analysis.lagged.filter(item => /^Farmgate price, lag \d+$/.test(item.label) && item.correlation !== null && item.correlation !== undefined);
  const bestLag = farmLags.length ? farmLags.reduce((best, item) => item.correlation > best.correlation ? item : best, farmLags[0]) : null;
  const bestLagN = bestLag ? Number(bestLag.label.match(/(\d+)$/)[1]) : null;
  const lagWords = bestLagN === null ? "" : (bestLagN === 1 ? t("an.month1") : t("an.monthN", { n: bestLagN }));
  const farmSame = analysis.contemporaneous.find(item => item.label === "Farmgate price");
  const productionSame = analysis.contemporaneous.find(item => item.label === "Production volume");
  const inventorySame = analysis.contemporaneous.find(item => item.label === "Inventory level");
  const scopeText = geographicScope.level === "national" ? t("scope.national") : geographicScope.level === "region" ? geographicScope.region : geographicScope.province;

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2 className="page-title">{t("an.title")}</h2>
          <p className="page-sub">{productLabel(product, t.lang)} · {scopeText}</p>
        </div>
      </div>
      <p className="lead-text">{t("an.sub", { product: productLabel(product, t.lang) })}</p>

      <div className="findings">
        <div className="finding"><span className="finding-icon"><Wheat size={22} /></span><h3>{t("an.f1.t")}</h3><p>{t("an.f1.b", { word: interpretation(farmSame ? farmSame.correlation : null) })}</p></div>
        {bestLag && <div className="finding"><span className="finding-icon"><TrendingUp size={22} /></span><h3>{t("an.f2.t", { n: lagWords })}</h3><p>{t("an.f2.b", { n: lagWords })}</p></div>}
        <div className="finding"><span className="finding-icon"><Egg size={22} /></span><h3>{t("an.f3.t")}</h3><p>{t("an.f3.b", { w1: interpretation(productionSame ? productionSame.correlation : null).toLowerCase(), w2: interpretation(inventorySame ? inventorySame.correlation : null).toLowerCase() })}</p></div>
      </div>

      <p className="hint-line">{t("an.hint")}</p>

      <div className="panel">
        <div className="panel-head"><h3>{t("an.same")}</h3></div>
        <div className="analysis-table-wrap"><table className="data-table"><thead><tr><th>{t("an.col1")}</th><th>{t("an.col2")}</th><th>{t("an.col3")}</th></tr></thead><tbody>
          {analysis.contemporaneous.map(item => <React.Fragment key={item.id}><tr>{renderIndicatorCell(item.label, `${item.id}-label`)}<td><Meter value={item.correlation} /></td><td>{interpretation(item.correlation)}</td></tr>{renderExplanationRow(item.label, item.id)}</React.Fragment>)}
        </tbody></table></div>
      </div>
      <details className="card fold">
        <summary>{t("an.earlier")}</summary>
        <div className="analysis-table-wrap"><table className="data-table"><thead><tr><th>{t("an.col1")}</th><th>{t("an.col2")}</th><th>{t("an.col3")}</th></tr></thead><tbody>
          {analysis.lagged.map(item => <React.Fragment key={item.label}><tr>{renderIndicatorCell(item.label, `${item.label}-label`)}<td><Meter value={item.correlation} /></td><td>{interpretation(item.correlation)}</td></tr>{renderExplanationRow(item.label, item.label)}</React.Fragment>)}
        </tbody></table></div>
      </details>
    </div>
  );
}

/* ------------------------------- Ticker --------------------------------- */

function Ticker({ rows }) {
  const items = rows.filter(row => row.retail !== null && row.retail !== undefined && Number.isFinite(Number(row.retail)));
  const doubled = [...items, ...items];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {doubled.map((r, i) => (
          <span className="ticker-item" key={i}>
            <b>{r.period}</b>
            <span className="ticker-sep">farmgate</span> {fmtPHP(r.farmgate)}
            <span className="ticker-sep">retail</span> {fmtPHP(r.retail)}
            <span className="ticker-badge" style={{ background: r.level ? LEVEL_COLOR[r.level] : "var(--c-line)" }}>{r.level || "—"}</span>
          </span>
        ))}
        {items.length === 0 && <span className="ticker-item">No data loaded yet — add records in the Dataset tab.</span>}
      </div>
    </div>
  );
}

/* ----------------------------- Dashboard -------------------------------- */

function Dashboard({ rows, stats, selectedProductId, geographicScope, settings, setTab, modelOutputs }) {
  const t = useT();
  const product = PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0];
  const productName = productLabel(product, t.lang);
  const scopeText = geographicScope.level === "national" ? t("scope.national") : geographicScope.level === "region" ? (geographicScope.region || t("filter.region")) : (geographicScope.province || t("filter.province"));
  const last = rows.length ? rows[rows.length - 1] : null;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const [range, setRange] = useState("2y");
  const [showWelcome, setShowWelcome] = useState(() => { try { return localStorage.getItem("manok-welcome") !== "done"; } catch (e) { return true; } });
  const closeWelcome = () => { setShowWelcome(false); try { localStorage.setItem("manok-welcome", "done"); } catch (e) { /* ignore */ } };
  const unit = unitWord(product, t.lang);
  const forecastUsesFarmgate = !product.retailField;
  const hasRetail = !!(stats && stats.hasRetail && last && last.retail !== null && last.retail !== undefined);
  const mainKey = hasRetail ? "retail" : "farmgate";
  const move = last && prev && Number.isFinite(Number(last[mainKey])) && Number.isFinite(Number(prev[mainKey])) ? Number(last[mainKey]) - Number(prev[mainKey]) : null;
  const moveText = move === null ? null : Math.abs(move) < 0.005 ? t("home.flat") : move > 0 ? t("home.up", { amount: fmtPHP(move) }) : t("home.down", { amount: fmtPHP(Math.abs(move)) });
  const forecastEngine = forecastUsesFarmgate ? modelOutputs?.farmgateEngine : modelOutputs?.retailEngine || modelOutputs?.engine;
  const rec = forecastEngine && forecastEngine.recommendation ? forecastEngine.models[forecastEngine.recommendation] : null;
  const forecastRows = forecastUsesFarmgate ? farmgateForecastRows(rows) : rows;
  const guess = rec && Number.isFinite(rec.forecast) ? constrainForecast(rec.forecast, forecastRows) : null;
  const trust = rec ? trustFromMape(rec.mape) : null;
  const chartRows = range === "2y" ? rows.slice(-24) : rows;
  const chartTicks = range === "2y" ? chartRows.filter((_, i) => i % 4 === 0).map(row => row.period) : getChartTicks(chartRows, "period").filter((_, i) => i % 2 === 0);
  const levels = ["Low", "Medium", "High"];

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2 className="page-title">{t("dash.title")}</h2>
          <p className="page-sub">{productName} · {scopeText}</p>
        </div>
      </div>

      {showWelcome && (
        <section className="welcome welcome-slim">
          <Sun className="welcome-sun" size={110} strokeWidth={1.2} aria-hidden="true" />
          <p>{t("home.welcome")}</p>
          <button className="btn btn-primary" onClick={closeWelcome}>{t("welcome.ok")}</button>
        </section>
      )}

      {!stats && <EmptyState text={t("dash.empty")} />}

      {stats && last && (
        <>
          <div className="hero-row">
            <section className="card price-now">
              <span className="eyebrow">{t("home.now", { period: last.period })}</span>
              <h3>{hasRetail ? t("home.price", { product: productName, price: fmtPHP(last.retail), unit }) : t("home.priceFarm", { product: productName, price: fmtPHP(last.farmgate), unit })}</h3>
              {hasRetail && <p className="price-sub">{t("home.farmLine", { farm: fmtPHP(last.farmgate), unit, gap: fmtPHP(last.spread), level: last.level ? t("level." + last.level) : "\u2014" })}</p>}
              {moveText && <span className={`change-line ${move > 0.005 ? "up" : move < -0.005 ? "down" : ""}`}>{move > 0.005 ? <ArrowUpRight size={16} /> : move < -0.005 ? <ArrowDownRight size={16} /> : null}{moveText}</span>}
            </section>

            {guess !== null && (
              <section className="card hero-card next-card">
                <span className="hero-label">{t(forecastUsesFarmgate ? "home.next.title.farm" : "home.next.title")}</span>
                <span className="hero-value">{fmtPHP(guess)}</span>
                {trust && <span className={`trust-pill trust-${trust}`}>{t("trust." + trust)}</span>}
                <button className="btn btn-light" onClick={() => setTab("predict")}>{t("home.next.cta")} <ArrowRight size={16} /></button>
              </section>
            )}
          </div>

          <div className="dash-grid">
            <section className="card card-sky chart-card">
              <div className="card-head">
                <h3>{t("chart.title", { product: productName })}</h3>
                <div className="seg seg-small" role="group">
                  <button type="button" className={range === "2y" ? "on" : ""} onClick={() => setRange("2y")}>{t("home.range.2y")}</button>
                  <button type="button" className={range === "all" ? "on" : ""} onClick={() => setRange("all")}>{t("home.range.all")}</button>
                </div>
              </div>
              <div className="legend-chips">
                {hasRetail && <span className="chip"><i style={{ background: "#E8553D" }} />{t("chart.market")}</span>}
                <span className="chip"><i style={{ background: "#11162B" }} />{t("chart.farm")}</span>
                <span className="chip chip-ghost">{product.unit}</span>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={290}>
                  <LineChart data={chartRows} margin={{ top: 10, right: 14, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(17,22,43,0.14)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="period" ticks={chartTicks} tickFormatter={range === "2y" ? (p => p) : formatChartPeriod} interval={0} padding={{ left: 18, right: 18 }} tick={{ fontSize: 12, fill: "#2C4250" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#2C4250" }} axisLine={false} tickLine={false} width={48} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#fff", border: "none", borderRadius: 14, boxShadow: "0 10px 28px rgba(17,22,43,0.2)", fontSize: 13 }} formatter={(v) => fmtPHP(v)} />
                    {hasRetail && <Line type="monotone" dataKey="retail" name={t("chart.market")} stroke="#E8553D" strokeWidth={3} dot={chartRows.length < 2} activeDot={{ r: 6, fill: "#11162B", stroke: "#fff", strokeWidth: 2 }} />}
                    <Line type="monotone" dataKey="farmgate" name={t("chart.farm")} stroke="#11162B" strokeWidth={3} dot={chartRows.length < 2} activeDot={{ r: 6, fill: "#E8553D", stroke: "#fff", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {hasRetail && (
              <section className="card card-dark gap-card">
                <h3>{t("gap.title")}</h3>
                <p className="gap-big">{fmtPHP(last.spread)}</p>
                <p className="gap-lead">{t("gap.simple", { gap: fmtPHP(last.spread) })}</p>
                <div className="gap-scale" role="img" aria-label={last.level || ""}>
                  {levels.map(level => (
                    <span key={level} className={`gap-seg ${last.level === level ? "on" : ""}`} style={last.level === level ? { background: LEVEL_COLOR[level] } : undefined}>{t("gap.scale." + level)}</span>
                  ))}
                </div>
                {last.level && <p className="gap-explain">{t("gap.explain." + last.level)}</p>}
                <span className="gap-foot">{t("gap.cuts", { a: fmtPHP(settings.lowMax), b: fmtPHP(settings.medMax) })}</span>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LevelBars({ rows }) {
  const counts = { Low: 0, Medium: 0, High: 0 };
  rows.forEach(r => { counts[r.level] = (counts[r.level] || 0) + 1; });
  const total = rows.filter(row => row.level).length || 1;
  return (
    <div className="levelbars">
      {["Low", "Medium", "High"].map(level => (
        <div className="levelbar-row" key={level}>
          <span className="levelbar-label">{level}</span>
          <div className="levelbar-track">
            <div
              className="levelbar-fill"
              style={{ width: `${(counts[level] / total) * 100}%`, background: LEVEL_COLOR[level] }}
            />
          </div>
          <span className="levelbar-count">{counts[level]}</span>
        </div>
      ))}
    </div>
  );
}

function KPI({ label, value, tone, level, delta, note }) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {hasDelta && (
          <span className={`kpi-delta ${delta >= 0 ? "up" : "down"}`} aria-hidden="true">
            {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          </span>
        )}
      </div>
      {tone === "level" ? (
        <span className="kpi-value kpi-pill" style={{ background: level ? LEVEL_COLOR[level] : "#5E6275" }}>{value}</span>
      ) : (
        <span className="kpi-value">{value}</span>
      )}
      {note && <span className="kpi-note">{note}</span>}
    </div>
  );
}

/* ------------------------------- Data tab -------------------------------- */

function DataTab({ rows, setDataset, activateImportedDataset, sources, activePriceSourceId, setActivePriceSourceId, comparePriceIds, setComparePriceIds, activeInventorySourceId, setActiveInventorySourceId, compareInventoryIds, setCompareInventoryIds, activeVolumeSourceId, setActiveVolumeSourceId, compareVolumeIds, setCompareVolumeIds, selectedProductId, setSelectedProductId, geographicScope, setGeographicScope, availableGeographies }) {
  const t = useT();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ period: "", farmgate: "", retail: "" });
  const [error, setError] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedDatasets, setImportedDatasets] = useState([]);
  const [selectedImportedId, setSelectedImportedId] = useState("");
  const masterHasRetail = sources.master?.rows?.some(row => row.retail !== null && row.retail !== undefined && Number.isFinite(Number(row.retail)));
  const priceSourceDefinitions = SOURCE_DEFS.filter(definition => definition.scale === "price" && (definition.id !== "master" || masterHasRetail));

  const refreshImportedDatasets = () => {
    fetch("/api/imported-datasets")
      .then(response => {
        if (!response.ok) throw new Error("The local dataset service is unavailable.");
        return response.json();
      })
      .then(setImportedDatasets)
      .catch(() => setError("Local dataset storage is unavailable. Start ManokMetrics with start.bat or npm run dev."));
  };

  useEffect(() => {
    refreshImportedDatasets();
  }, []);

  const addRow = (e) => {
    e.preventDefault();
    if (!form.period || form.farmgate === "" || form.retail === "") {
      setError("Fill in period, farmgate price, and retail price.");
      return;
    }
    const fg = Number(form.farmgate), rt = Number(form.retail);
    if (Number.isNaN(fg) || Number.isNaN(rt)) {
      setError("Farmgate and retail prices must be numbers.");
      return;
    }
    setDataset(prev => [...prev, { id: uid(), period: form.period, farmgate: fg, retail: rt }]);
    setForm({ period: "", farmgate: "", retail: "" });
    setError("");
  };

  const removeRow = (id) => setDataset(prev => prev.filter(r => r.id !== id));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: async (results) => {
        const processed = processCsvImport(results.data, file.name);
        setImportReport(processed.report);
        if (results.errors?.length) {
          processed.report.status = "Rejected";
          processed.report.reasons = [...processed.report.reasons, "The CSV parser found malformed rows."];
        }
        if (!processed.rows.length && !processed.records.length) {
          setError(processed.report.reasons[0] || "The uploaded CSV contains no usable dashboard records.");
          setIsImporting(false);
          return;
        } else {
          if (processed.rows.length) activateImportedDataset(processed.rows);
          setError("");
        }
        const outputRows = processed.records.length ? processed.records : processed.rows;
        const csv = ["master", "rawPsa"].includes(processed.report.datasetType)
          ? await file.text()
          : Papa.unparse(outputRows);
        fetch("/api/imported-datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            csv,
            metadata: {
              datasetType: processed.report.datasetType,
              geographicCoverage: processed.report.datasetType === "simple" || processed.report.datasetType === "master" ? "dashboard-compatible" : "dataset-specific",
              recordCount: outputRows.length,
              preprocessingStatus: processed.report.status,
              report: processed.report,
            },
          }),
        }).then(response => {
          if (!response.ok) throw new Error("The local dataset service could not save this file.");
          return response.json();
        }).then(() => refreshImportedDatasets()).catch(storageError => {
          setError(`Import was validated but not saved: ${storageError.message}`);
          processed.report.status = "Failed persistence";
          setImportReport({ ...processed.report });
        });
        setIsImporting(false);
      },
      error: parseError => {
        setIsImporting(false);
        setError(`Import failed: ${parseError.message || "The file could not be parsed."}`);
        setImportReport({ filename: file.name, status: "Rejected", reasons: [parseError.message || "The file could not be parsed."], totalRecords: 0, validRecords: 0, rejectedRecords: 0, warnings: [] });
      },
    });
    e.target.value = "";
  };

  const selectImportedDataset = event => {
    const id = event.target.value;
    setSelectedImportedId(id);
    if (!id) return;
    setIsImporting(true);
    fetch(`/api/imported-datasets/${encodeURIComponent(id)}`)
      .then(response => {
        if (!response.ok) throw new Error("The selected dataset file is missing or inaccessible.");
        return response.text();
      })
      .then(csv => {
        const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
        const processed = processCsvImport(parsed.data, id);
        setImportReport(processed.report);
        if (!processed.rows.length) throw new Error("This dataset is not compatible with the dashboard view.");
        activateImportedDataset(processed.rows);
        setError("");
      })
      .catch(loadError => setError(`Dataset could not be loaded: ${loadError.message}`))
      .finally(() => setIsImporting(false));
  };

  const removeImportedDataset = () => {
    if (!selectedImportedId || !window.confirm("Permanently remove this imported dataset? Bundled datasets will not be affected.")) return;
    fetch(`/api/imported-datasets/${encodeURIComponent(selectedImportedId)}`, { method: "DELETE" })
      .then(response => {
        if (!response.ok) throw new Error("The local dataset service could not delete this file.");
        setSelectedImportedId("");
        refreshImportedDatasets();
      })
      .catch(deleteError => setError(`Dataset could not be removed: ${deleteError.message}`));
  };

  const exportCsv = () => {
    const csv = Papa.unparse(rows.map(({ period, farmgate, retail }) => ({ period, farmgate, retail })));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "poultry_dataset.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Price records"
        title="The numbers behind every page"
        desc="Browse the price records from PSA. Pick a source, compare it with others, or add your own months. Farm price means what the farmer is paid; market price means what shoppers pay."
      />

      <section className="card recent-card">
        <h3>{t("data.recent")}</h3>
        <div className="analysis-table-wrap">
          <table className="data-table">
            <thead><tr><th>{t("data.col.month")}</th><th>{t("term.farm")}</th><th>{t("term.market")}</th><th>{t("term.gap")}</th></tr></thead>
            <tbody>
              {rows.slice(-12).reverse().map(row => (
                <tr key={row.period}>
                  <td>{row.period}</td>
                  <td>{fmtPHP(row.farmgate)}</td>
                  <td>{row.retail !== null && row.retail !== undefined ? fmtPHP(row.retail) : "\u2014"}</td>
                  <td>{row.spread !== null && row.spread !== undefined && Number.isFinite(Number(row.spread)) ? fmtPHP(row.spread) : "\u2014"}{row.level ? ` \u00B7 ${t("gap.scale." + row.level)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card fold">
        <summary>{t("data.more")}</summary>
        <div className="fold-inner">
      <div className="panel source-panel">
        <div className="panel-head">
          <div><h3>Price trends</h3><p className="panel-help">Compare producer and retail prices over time. Select a main source and tick others to add comparison lines.</p></div>
          <span className="panel-tag">Prices (PHP/kg)</span>
        </div>
        <div className="source-controls">
          <label className="source-select">Main source
            <select value={activePriceSourceId} onChange={e => setActivePriceSourceId(e.target.value)}>
              {priceSourceDefinitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
            </select>
          </label>
          <div className="source-checks"><span className="source-label">Compare with</span>
            {priceSourceDefinitions.filter(definition => definition.id !== activePriceSourceId).map(definition => (
              <label className="source-check" key={definition.id} title={definition.description}>
                <input type="checkbox" checked={comparePriceIds.includes(definition.id)} onChange={e => setComparePriceIds(current => e.target.checked ? [...current, definition.id] : current.filter(id => id !== definition.id))} />
                {definition.name}
              </label>
            ))}
          </div>
        </div>
        {sources[activePriceSourceId] && <>
          <p className="source-description"><Database size={14} /> <b>{sources[activePriceSourceId].name}:</b> {sources[activePriceSourceId].description}</p>
          {sources[activePriceSourceId].rows.length > 0 || activePriceSourceId === "master" && rows.length > 0 ? <SourceCompareChart sources={sources} dashboardRows={rows} activeSourceId={activePriceSourceId} compareIds={comparePriceIds} /> : <EmptyState text="This source does not contain this product. Choose another source or product type." />}
          <div className="source-preview"><b>Records available:</b> {sources[activePriceSourceId].rows.length.toLocaleString()} time-period records.</div>
        </>}
      </div>

      <div className="panel source-panel">
        <div className="panel-head">
          <div><h3>Inventory levels</h3><p className="panel-help">Available birds or eggs by period. Automatically selected based on your product choice.</p></div>
          <span className="panel-tag">Inventory (birds)</span>
        </div>
        <div className="source-controls">
          <label className="source-select">Inventory source
            <select value={activeInventorySourceId} onChange={e => setActiveInventorySourceId(e.target.value)}>
              {SOURCE_DEFS.filter(d => d.id === "chicken-inventory" || d.id === "duck-inventory").map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
            </select>
          </label>
          <div className="source-checks"><span className="source-label">Compare with</span>
            {SOURCE_DEFS.filter(d => (d.id === "chicken-inventory" || d.id === "duck-inventory") && d.id !== activeInventorySourceId).map(definition => (
              <label className="source-check" key={definition.id} title={definition.description}>
                <input type="checkbox" checked={compareInventoryIds.includes(definition.id)} onChange={e => setCompareInventoryIds(current => e.target.checked ? [...current, definition.id] : current.filter(id => id !== definition.id))} />
                {definition.name}
              </label>
            ))}
          </div>
        </div>
        {sources[activeInventorySourceId] && <>
          <p className="source-description"><Database size={14} /> <b>{sources[activeInventorySourceId].name}:</b> {sources[activeInventorySourceId].description}</p>
          {sources[activeInventorySourceId].rows.length > 0 ? <SourceCompareChart sources={sources} activeSourceId={activeInventorySourceId} compareIds={compareInventoryIds} /> : <EmptyState text="This inventory type does not have data for this product. Choose another source or product type." />}
          <div className="source-preview"><b>Records available:</b> {sources[activeInventorySourceId].rows.length.toLocaleString()} time-period records.</div>
        </>}
      </div>

      <div className="panel source-panel">
        <div className="panel-head">
          <div><h3>Production volume</h3><p className="panel-help">Quarterly production records for poultry output. This metric is reported on a quarterly time cadence.</p></div>
          <span className="panel-tag">Volume (quarterly)</span>
        </div>
        {sources.production && <>
          <p className="source-description"><Database size={14} /> <b>{sources.production.name}:</b> {sources.production.description}</p>
          {sources.production.rows.length > 0 ? <SourceCompareChart sources={sources} activeSourceId="production" compareIds={[]} /> : <EmptyState text="This production source does not contain this product. Choose another source or product type." />}
          <div className="source-preview"><b>Records available:</b> {sources.production.rows.length.toLocaleString()} time-period records.</div>
        </>}
      </div>

      <div className="panel source-panel">
        <div className="panel-head">
          <div><h3>Slaughter volume</h3><p className="panel-help">Philippines-wide annual slaughter totals. This metric is reported on a yearly time cadence and should be reviewed separately from production.</p></div>
          <span className="panel-tag">Volume (annual)</span>
        </div>
        {sources.slaughter && <>
          <p className="source-description"><Database size={14} /> <b>{sources.slaughter.name}:</b> {sources.slaughter.description}</p>
          {sources.slaughter.rows.length > 0 ? <SourceCompareChart sources={sources} activeSourceId="slaughter" compareIds={[]} /> : <EmptyState text="This slaughter source does not contain this product. Choose another source or product type." />}
          <div className="source-preview"><b>Records available:</b> {sources.slaughter.rows.length.toLocaleString()} time-period records.</div>
        </>}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Import / export</h3>
          <span className="panel-tag">PSA master CSV or period, farmgate, retail</span>
        </div>
        <p className="panel-help">Use this only when you have another CSV. The built-in files are already available in the explorer above.</p>
        <div className="import-row">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleFile} />
          <button className="btn btn-ghost" onClick={exportCsv}>
            <Download size={15} /> Export current data
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Add a record</h3></div>
        <form className="addform" onSubmit={addRow}>
          <input placeholder="Period (e.g. Jan 2026)" value={form.period}
            onChange={e => setForm(f => ({ ...f, period: e.target.value }))} />
          <input placeholder="Farmgate price (PHP/kg)" inputMode="decimal" value={form.farmgate}
            onChange={e => setForm(f => ({ ...f, farmgate: e.target.value }))} />
          <input placeholder="Retail price (PHP/kg)" inputMode="decimal" value={form.retail}
            onChange={e => setForm(f => ({ ...f, retail: e.target.value }))} />
          <button className="btn btn-primary" type="submit"><Plus size={15} /> Add</button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </div>
        </div>
      </details>

    </div>
  );
}

function SourceCompareChart({ sources, dashboardRows, activeSourceId, compareIds }) {
  const chartSources = activeSourceId === "master" && dashboardRows?.length
    ? { ...sources, master: { ...sources.master, rows: dashboardRows } }
    : sources;
  const ids = [activeSourceId, ...compareIds.filter(id => id !== activeSourceId)].filter(id => chartSources[id]);
  const periods = [...new Set(ids.flatMap(id => chartSources[id].rows.map(row => row.periodKey)))].sort((a, b) => a.localeCompare(b));
  const chartRows = periods.map(periodKey => {
    const row = { periodKey };
    ids.forEach(id => { const point = chartSources[id].rows.find(item => item.periodKey === periodKey); row[id] = id === "master" ? point?.retail : point?.value; });
    return row;
  });
  const quantityIds = ids.filter(id => chartSources[id].scale === "quantity");
  const priceIds = ids.filter(id => chartSources[id].scale !== "quantity");
  const colors = ["var(--c-teal)", "var(--c-brick)", "var(--c-yolk)", "#6D5A8D", "#4D7890", "#8B6B45"];
  return <div className="source-chart"><ResponsiveContainer width="100%" height={280}><LineChart data={chartRows} margin={{ top: 8, right: 16, left: -12, bottom: 40 }}>
    <CartesianGrid stroke="var(--c-line)" strokeDasharray="3 5" vertical={false} />
    <XAxis dataKey="periodKey" ticks={getChartTicks(chartRows, "periodKey")} tickFormatter={formatChartPeriod} interval={0} padding={{ left: 18, right: 18 }} tick={{ fontSize: 10, fill: "var(--c-ink-soft)", angle: -20, textAnchor: "end", height: 60 }} axisLine={{ stroke: "var(--c-line)" }} tickLine={false} />
    <YAxis yAxisId="price" tick={{ fontSize: 10, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} width={52} label={{ value: "Price (PHP/kg)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--c-ink-soft)" } }} />
    {quantityIds.length > 0 && <YAxis yAxisId="quantity" orientation="right" tickFormatter={fmtValue} tick={{ fontSize: 10, fill: "var(--c-ink-soft)" }} axisLine={false} tickLine={false} width={78} label={{ value: "Quantity (birds/volume)", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "var(--c-ink-soft)" } }} />}
    <Tooltip contentStyle={{ background: "var(--c-surface)", border: "1px solid var(--c-line)", borderRadius: 8, fontSize: 12 }} formatter={value => fmtValue(value)} />
    <Legend wrapperStyle={{ fontSize: 11 }} />
    {priceIds.map((id, index) => <Line key={id} yAxisId="price" type="monotone" dataKey={id} name={chartSources[id].name} stroke={colors[index % colors.length]} strokeWidth={2} dot={false} />)}
    {quantityIds.map((id, index) => <Line key={id} yAxisId="quantity" type="monotone" dataKey={id} name={chartSources[id].name} stroke={colors[(index + priceIds.length) % colors.length]} strokeWidth={2} dot={false} />)}
  </LineChart></ResponsiveContainer></div>;
}

function ExternalEventsPanel({ events, setEvents, product, baseline, adjusted, adjustment, geographicScope, availableGeographies }) {
  const geographyOptions = ["Nationwide", ...availableGeographies.regions, ...Object.values(availableGeographies.provincesByRegion).flat()].filter((value, index, values) => value && values.indexOf(value) === index);
  const emptyEvent = { title: "", category: "Disease outbreak", description: "", startDate: "", endDate: "", geography: geographicScope.level === "national" ? "Nationwide" : geographicScope.level === "region" ? geographicScope.region : geographicScope.province, product: product.name, impactPercent: "", status: "anticipated", source: "" };
  const [form, setForm] = useState(emptyEvent);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const saveEvent = event => {
    event.preventDefault();
    if (!form.title.trim() || !form.startDate) {
      setError("Enter an event title and start date.");
      return;
    }
    if (form.impactPercent !== "" && !Number.isFinite(Number(form.impactPercent))) {
      setError("Impact must be a numeric percentage or left blank.");
      return;
    }
    const record = { ...form, id: editingId || uid(), title: form.title.trim(), description: form.description.trim(), storedAt: new Date().toISOString() };
    setEvents(current => editingId ? current.map(item => item.id === editingId ? record : item) : [...current, record]);
    setForm({ ...emptyEvent });
    setEditingId(null);
    setError("");
  };

  const editEvent = event => {
    setEditingId(event.id);
    setForm({ ...emptyEvent, ...event });
  };

  const removeEvent = id => {
    if (window.confirm("Remove this external event?")) setEvents(current => current.filter(event => event.id !== id));
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div><h3>External events</h3><p className="panel-help">Record events that may affect poultry prices. Events do not change the baseline unless you explicitly provide an estimated percentage impact.</p></div>
        <span className="panel-tag">{events.length} recorded</span>
      </div>
      <form className="event-form" onSubmit={saveEvent}>
        <label>Event title<input value={form.title} onChange={e => setForm(current => ({ ...current, title: e.target.value }))} placeholder="e.g. Typhoon affecting transport" /></label>
        <label>Category<select value={form.category} onChange={e => setForm(current => ({ ...current, category: e.target.value }))}><option>Disease outbreak</option><option>Natural disaster</option><option>Supply chain</option><option>Demand or market</option><option>Policy or trade</option><option>Other</option></select></label>
        <label>Start date<input type="date" value={form.startDate} onChange={e => setForm(current => ({ ...current, startDate: e.target.value }))} /></label>
        <label>End date<input type="date" value={form.endDate} onChange={e => setForm(current => ({ ...current, endDate: e.target.value }))} /></label>
        <label>Product<select value={form.product} onChange={e => setForm(current => ({ ...current, product: e.target.value }))}><option value="All poultry">All poultry</option>{PRODUCT_DEFS.map(item => <option key={item.id}>{item.name}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={e => setForm(current => ({ ...current, status: e.target.value }))}><option value="anticipated">Anticipated</option><option value="ongoing">Ongoing</option><option value="historical">Historical</option><option value="resolved">Resolved</option></select></label>
        <label>Geography<select value={form.geography} onChange={e => setForm(current => ({ ...current, geography: e.target.value }))}><option value="Unknown">Unknown / unspecified</option>{geographyOptions.map(geography => <option key={geography}>{geography}</option>)}</select></label>
        <label>Estimated impact %<input inputMode="decimal" value={form.impactPercent} onChange={e => setForm(current => ({ ...current, impactPercent: e.target.value }))} placeholder="Optional; e.g. 8 or -5" /></label>
        <label className="event-form-wide">Description / source<textarea value={form.description} onChange={e => setForm(current => ({ ...current, description: e.target.value }))} placeholder="Evidence, assumptions, or reference URL" /></label>
        <div className="event-actions"><button className="btn btn-primary" type="submit">{editingId ? "Update event" : "Record event"}</button>{editingId && <button className="btn btn-ghost" type="button" onClick={() => { setEditingId(null); setForm({ ...emptyEvent }); }}>Cancel</button>}</div>
      </form>
      {error && <p className="form-error">{error}</p>}
      {baseline != null && <div className="event-forecast-note"><b>Baseline:</b> {fmtPHP(baseline)} {adjustment !== 0 ? <><span> · </span><b>Event-aware scenario:</b> {fmtPHP(adjusted)} ({adjustment > 0 ? "+" : ""}{adjustment.toFixed(2)}%)</> : <span> · No quantified event adjustment applied.</span>}</div>}
      {events.length > 0 && <div className="event-list">{events.map(event => <div className="event-item" key={event.id}><div><b>{event.title}</b><span>{event.category} · {event.status} · {event.geography || "Geography unknown"} · {event.product || "Product unknown"}</span>{event.description && <small>{event.description}</small>}</div><div className="event-item-actions"><button className="btn btn-ghost" type="button" onClick={() => editEvent(event)}>Edit</button><button className="btn btn-danger-ghost" type="button" onClick={() => removeEvent(event.id)}>Remove</button></div></div>)}</div>}
    </div>
  );
}

/* ------------------------------ Predict tab ------------------------------ */

function PredictTab({ settings, rows, modelOutputs, sources, selectedProductId, events, setEvents, geographicScope, availableGeographies }) {
  const t = useT();
  const [periodsAhead, setPeriodsAhead] = useState(1);
  const [customPeriods, setCustomPeriods] = useState("");
  const [farmDraft, setFarmDraft] = useState("");
  const [farmText, setFarmText] = useState("");
  const product = PRODUCT_DEFS.find(item => item.id === selectedProductId) || PRODUCT_DEFS[0];
  const forecastUsesFarmgate = !product.retailField;
  const productName = productLabel(product, t.lang);
  const scopeText = geographicScope.level === "national" ? t("scope.national") : geographicScope.level === "region" ? (geographicScope.region || t("filter.region")) : (geographicScope.province || t("filter.province"));
  const forecastRows = useMemo(() => forecastRowsForProduct(rows, product), [rows, product]);
  const farmgateRows = useMemo(() => farmgateForecastRows(rows), [rows]);
  const hasForecast = forecastRows.length > 0;
  const hasFarmgateForecast = farmgateRows.length > 0;
  const lastRow = hasForecast ? forecastRows[forecastRows.length - 1] : null;
  const latestFarm = lastRow ? Number(lastRow.farmgate) : null;
  const farmOverride = farmText !== "" && Number.isFinite(Number(farmText)) ? Number(farmText) : null;
  const shared = periodsAhead === 1 && farmOverride === null && modelOutputs;
  const ownRetailEngine = useMemo(() => (!shared && hasForecast) ? runForecastEngine(forecastRows, Number(periodsAhead), farmOverride) : null, [shared, hasForecast, forecastRows, periodsAhead, farmOverride]);
  const ownFarmgateEngine = useMemo(() => (!shared && hasFarmgateForecast) ? runForecastEngine(farmgateRows, Number(periodsAhead), farmOverride) : null, [shared, hasFarmgateForecast, farmgateRows, periodsAhead, farmOverride]);
  const retailEngine = shared ? modelOutputs.retailEngine : ownRetailEngine;
  const farmgateForecastEngine = shared ? modelOutputs.farmgateEngine : ownFarmgateEngine;
  const engine = forecastUsesFarmgate ? farmgateForecastEngine : retailEngine;
  const recId = engine ? (farmOverride !== null ? "linear" : engine.recommendation) : null;
  const rec = recId ? engine.models[recId] : null;
  const farmgateRecId = farmgateForecastEngine ? (farmOverride !== null ? "linear" : farmgateForecastEngine.recommendation) : null;
  const farmgateRec = farmgateRecId ? farmgateForecastEngine.models[farmgateRecId] : null;
  const naive = engine ? engine.naive : null;
  const predicted = rec ? constrainForecast(rec.forecast, forecastUsesFarmgate ? forecastRows : rows) : null;
  const farmgatePredicted = forecastUsesFarmgate ? predicted : farmgateRec ? constrainForecast(farmgateRec.forecast, farmgateRows) : null;
  const activeEventAdjustment = eventAdjustment(events, product.name, geographicScope);
  const eventAwarePredicted = predicted == null ? null : constrainForecast(predicted * (1 + activeEventAdjustment / 100), rows);
  const unit = unitWord(product, t.lang);
  const perPiece = /pc|piece/i.test(product.unit || "");
  const targetDate = forecastDateLabel(lastRow, periodsAhead, t.lang);
  const whenText = targetDate || (periodsAhead === 1 ? t("hero.when1") : periodsAhead === 12 ? t("hero.when12") : t("hero.whenN", { n: periodsAhead }));
  const trust = rec ? trustFromMape(rec.mape) : null;
  const farmUsed = farmOverride !== null ? farmOverride : latestFarm;
  const gapLevel = predicted != null && Number.isFinite(farmUsed) ? classify(predicted - farmUsed, settings) : null;
  const diff = predicted != null && lastRow ? predicted - Number(lastRow.retail) : null;
  const ratio = rec && naive && naive.rmse ? rec.rmse / naive.rmse : null;
  const verdict = ratio === null ? null : ratio < 0.97 ? "better" : ratio <= 1.03 ? "same" : "worse";
  const barMax = rec && naive ? Math.max(rec.mae, naive.mae) || 1 : 1;
  const horizons = [[1, "fc.h1"], [2, "fc.h2"], [3, "fc.h3"], [6, "fc.h6"], [12, "fc.h12"]];
  const applyCustomPeriods = event => {
    const value = event.target.value;
    setCustomPeriods(value);
    const months = Number(value);
    if (Number.isInteger(months) && months >= 1 && months <= 120) setPeriodsAhead(months);
  };
  const applyFarm = () => setFarmText(farmDraft.trim());

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2 className="page-title">{t("fc.title")}</h2>
          <p className="page-sub">{t("fc.sub", { product: productName, scope: scopeText })}</p>
        </div>
      </div>

      {!hasForecast && <div className="notice">{t("fc.noRetail")}</div>}

      {hasForecast && (
        <>
          <div className="forecast-period-controls">
            <div className="seg" role="group" aria-label={t("fc.s3")}>
              {horizons.map(([n, key]) => <button type="button" key={n} className={customPeriods === "" && periodsAhead === n ? "on" : ""} onClick={() => { setCustomPeriods(""); setPeriodsAhead(n); }}>{forecastDateLabel(lastRow, n, t.lang) || t(key)}</button>)}
            </div>
            <label className="forecast-period-input">{t("fc.custom")}<input type="number" min="1" max="120" step="1" value={customPeriods} onChange={applyCustomPeriods} placeholder="1–120" aria-label={t("fc.custom")} /></label>
          </div>

          <section className="card hero-card hero-simple">
            <span className="hero-label">{t(forecastUsesFarmgate ? "hero.label.farm" : "hero.label", { when: whenText })}</span>
            <span className="hero-value">{predicted != null ? fmtPHP(predicted) : "\u2014"}</span>
            {predicted != null && <p className="hero-sentence">{t(forecastUsesFarmgate ? "hero.about.farm" : "hero.about", { price: fmtPHP(predicted), unit })}{!forecastUsesFarmgate && perPiece ? " " + t("hero.tray", { tray: fmtPHP(predicted * 30) }) : ""}</p>}
            {!forecastUsesFarmgate && farmgatePredicted != null && <div className="forecast-alt"><span>{t("hero.label.farm", { when: whenText })}</span><b>{fmtPHP(farmgatePredicted)}</b><small>{t("hero.about.farm", { price: fmtPHP(farmgatePredicted), unit })}</small></div>}
            <div className="hero-facts">
              <div className="hero-fact"><small>{t(forecastUsesFarmgate ? "hero.last.farm" : "hero.last")}</small><b>{fmtPHP(lastRow.retail)}</b><small>{diff !== null ? t("fc.vsLast", { sign: diff >= 0 ? "+" : "\u2212", amount: fmtPHP(Math.abs(diff)) }) : lastRow.period}</small></div>
              {trust && <div className={`hero-fact trust-${trust}`}><small>{t("hero.trust")}</small><b>{t("trust." + trust)}</b><small>{t("trust.note", { mape: rec.mape.toFixed(1) })}</small></div>}
            </div>
            {gapLevel && <span className="hero-level" style={{ background: LEVEL_COLOR[gapLevel] }}>{t("term.gap")}: {t("gap.scale." + gapLevel)}</span>}
            {farmOverride !== null && <p className="hero-note">{t("fc.whatif.note", { x: fmtPHP(farmOverride) })}</p>}
          </section>

          {rec && naive && (
            <section className="card reliability-simple">
              <h3>{t("fc.rel2.title")}</h3>
              <p>{t("fc.rel2.body", { n: rec.validationCount, mae: fmtPHP(rec.mae), mape: rec.mape.toFixed(1), nmae: fmtPHP(naive.mae), nmape: naive.mape.toFixed(1) })}</p>
              <div className="rel-bars">
                <div className="rel-row"><span>{t("fc.bar.ours")}</span><span className="rel-track"><i style={{ width: `${(rec.mae / barMax) * 100}%` }} className="ours" /></span><b>{fmtPHP(rec.mae)}</b></div>
                <div className="rel-row"><span>{t("fc.bar.last")}</span><span className="rel-track"><i style={{ width: `${(naive.mae / barMax) * 100}%` }} className="base" /></span><b>{fmtPHP(naive.mae)}</b></div>
              </div>
              <p className="rel-verdict">{verdict ? t("fc.rel2." + verdict) : ""} {periodsAhead > 1 ? t("fc.rel2.far") : ""}</p>
            </section>
          )}

          <details className="card fold">
            <summary>{t("fc.adv.compare")}</summary>
            <p className="muted">{t("fc.adv.auto")}</p>
            <div className="analysis-table-wrap">
              <table className="data-table">
                <thead><tr><th>{t("fc.adv.col1")}</th><th>{t("fc.adv.col2")}</th><th>RMSE</th><th>{t("fc.adv.col3")}</th></tr></thead>
                <tbody>
                  {["naive", ...MODEL_IDS].map(id => {
                    const m = id === "naive" ? naive : engine && engine.models[id];
                    return m ? (
                      <tr key={id} className={id === recId ? "row-best" : ""}>
                        <td>{t("model2." + id)}{id === recId ? ` \u2605` : ""}</td>
                        <td>{fmtPHP(m.mae)}</td><td>{fmtPHP(m.rmse)}</td><td>{m.mape.toFixed(2)}%</td>
                      </tr>
                    ) : null;
                  })}
                </tbody>
              </table>
            </div>
          </details>

          <details className="card fold">
            <summary>{t("fc.whatif")}</summary>
            <p className="muted">{t("fc.whatif.body", { x: fmtPHP(latestFarm) })}</p>
            <div className="whatif-row">
              <input inputMode="decimal" placeholder={String(latestFarm ?? "")} value={farmDraft} onChange={e => setFarmDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") applyFarm(); }} aria-label={t("fc.s2")} />
              <button type="button" className="btn btn-primary" onClick={applyFarm}>{t("fc.whatif.apply")}</button>
              {farmOverride !== null && <button type="button" className="btn btn-ghost" onClick={() => { setFarmDraft(""); setFarmText(""); }}>{t("fc.whatif.reset")}</button>}
            </div>
          </details>

          <details className="card fold">
            <summary>{t("fc.events")}</summary>
            <ExternalEventsPanel events={events} setEvents={setEvents} product={product} baseline={predicted} adjusted={eventAwarePredicted} adjustment={activeEventAdjustment} geographicScope={geographicScope} availableGeographies={availableGeographies} />
          </details>

          <details className="card fold">
            <summary>{t("fc.how")}</summary>
            <p className="muted">{t(forecastUsesFarmgate ? "fc.how2.farm" : "fc.how2.body")}</p>
          </details>
        </>
      )}
    </div>
  );
}

function DecisionSupport({ forecast, farmgate, stats, settings }) {
  const t = useT();
  const spread = Number.isFinite(forecast) ? forecast - farmgate : null;
  const level = spread === null ? "\u2014" : classify(spread, settings);
  const modelKey = stats?.recommendation || settings.modelType;
  return (
    <div className="card decision-panel">
      <div className="card-head"><h3>{t("dec.title")}</h3><span className="chip chip-ghost">{t("dec.tag")}</span></div>
      <div className="decision-grid">
        <div><strong>{t("dec.shoppers")}</strong><p>{t("dec.shoppers.d")}</p></div>
        <div><strong>{t("dec.biz")}</strong><p>{t("dec.biz.d")}</p></div>
        <div><strong>{t("dec.watch")}</strong><p>{t("dec.watch.d")}</p></div>
      </div>
      <p className="decision-note">{forecast === null ? t("dec.none") : t("dec.now", { price: fmtPHP(forecast), gap: fmtPHP(spread), level: level === "\u2014" ? level : t("level." + level), model: t("model." + modelKey) })}</p>
    </div>
  );
}

/* ----------------------------- Classify tab ------------------------------ */

function ClassifyTab({ rows, settings, modelOutputs }) {
  const forecastValue = modelOutputs?.linear?.forecast ?? modelOutputs?.arima?.forecast ?? null;
  const xgbLevel = modelOutputs?.classification?.xgboost?.predictedLevel || "Medium";
  const rfLevel = modelOutputs?.classification?.randomForest?.predictedLevel || "Medium";
  const forecastSpread = forecastValue === null ? null : forecastValue - (rows[rows.length - 1]?.farmgate || 0);
  const currentLevel = forecastSpread === null ? null : classify(forecastSpread, settings);

  return (
    <div className="page">
      <PageHead
        eyebrow="Classification"
        title="Price-gap levels"
        desc="This tab groups each period as Low, Medium, or High based on the gap between retail and farmgate prices. These levels describe gap size, not productivity. It compares a learned profile with a simple rule."
      />

      {!modelOutputs && <div className="panel guide-panel"><p className="panel-help">Classification requires a retail price series. The selected product's farmgate records are still available in Overview and Dataset.</p></div>}

      <div className="panel guide-panel">
        <div className="panel-head"><h3>How the levels work</h3></div>
        <div className="info-stack">
          <InfoBox title="Spread" technical="Spread = retail price - farmgate price." plain="This is the gap between what the shopper pays and what the producer receives. It is not profit." />
          <InfoBox title="Low / Medium / High" technical="Historical labels use threshold cutoffs; the nearest-profile model learns the typical farmgate, retail, spread, time, and production profile of each label." plain="Low is a smaller price gap, Medium is moderate, and High is a larger price gap. These labels do not directly measure productivity." />
          <InfoBox title="Why the settings matter" technical="Changing the thresholds moves the classification boundary." plain="If you raise the cutoff, more values move into the High band; if you lower it, more values stay Low or Medium." />
        </div>
        <p className="muted">Active thresholds: up to {settings.lowMax} is Low, up to {settings.medMax} is Medium, and above {settings.medMax} is High. Change them in Model Settings.</p>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Model classification</h3></div>
        <div className="model-grid model-grid-compact">
          <div className="model-card">
            <span className="model-label">Nearest-profile model</span>
            <strong className="model-value model-level" style={{ background: LEVEL_COLOR[xgbLevel] }}>{xgbLevel}</strong>
            <span className="model-meta">Confidence {Number(modelOutputs?.classification?.xgboost?.confidence || 0).toFixed(1)}% · trained on price{modelOutputs?.classification?.hasProduction ? " + production" : ""}</span>
          </div>
          <div className="model-card">
            <span className="model-label">Threshold rule</span>
            <strong className="model-value model-level" style={{ background: LEVEL_COLOR[rfLevel] }}>{rfLevel}</strong>
            <span className="model-meta">Confidence {Number(modelOutputs?.classification?.randomForest?.confidence || 0).toFixed(1)}%</span>
          </div>
          <div className="model-card">
            <span className="model-label">Forecast spread</span>
            <strong className="model-value model-level" style={{ background: currentLevel ? LEVEL_COLOR[currentLevel] : "var(--c-line)" }}>{currentLevel || "Not available"}</strong>
            <span className="model-meta">Projected spread {fmtPHP(forecastSpread)} · {modelOutputs?.classification?.observations || 0} trained periods</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Settings tab ------------------------------- */

function SettingsTab({ settings, setSettings, setDataset, rows }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const num = (key) => (e) => setSettings(s => ({ ...s, [key]: Number(e.target.value) }));
  const derivedDefaults = deriveSpreadThresholds(rows);
  const resetThresholds = () => {
    if (derivedDefaults) setSettings(current => ({ ...current, ...derivedDefaults }));
  };

  const smoothingLabel = settings.smoothing < 0.25 ? "Conservative" : settings.smoothing < 0.45 ? "Balanced" : "Responsive";

  return (
    <div className="page">
      <PageHead
        eyebrow="Advanced"
        title="Advanced settings"
        desc="Most people never need to change these. They only affect how the forecast is calculated."
      />

      <div className="panel">
        <div className="panel-head"><h3>Forecast method</h3></div>
        <p className="muted">The forecast now tests several methods on past months and picks the most accurate one automatically, so there is nothing to choose here. The only setting you may want to change is the price-gap levels below.</p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><h3>Price-gap levels</h3><p className="panel-help">Defaults are calculated from this product's observed spreads: Low ends at the 33rd percentile and Medium ends at the 67th percentile.</p></div>
          <button className="btn btn-ghost" type="button" onClick={resetThresholds} disabled={!derivedDefaults} title="Restore the product's 33rd and 67th percentile spread thresholds">
            <RotateCcw size={15} /> Reset to data-derived defaults
          </button>
        </div>
        <div className="settings-grid">
          <label>Low becomes Medium at
            <input type="number" step="0.01" value={settings.lowMax} onChange={num("lowMax")} />
          </label>
          <label>Medium becomes High at
            <input type="number" step="0.01" value={settings.medMax} onChange={num("medMax")} />
          </label>
        </div>
        <div className="info-stack compact-stack">
          <InfoBox title="Low threshold" technical="Upper boundary for the Low band." plain="Values below this level are considered a narrow spread." />
          <InfoBox title="High threshold" technical="Upper boundary for the Medium band before moving into High." plain="Values above this line are treated as a wider spread." />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Data reset</h3></div>
        <p className="muted">Clears your local edits and reloads the bundled national monthly records. Your data stays in this browser and is not uploaded by this app.</p>
        {!confirmReset ? (
          <button className="btn btn-danger-ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={15} /> Reload bundled records
          </button>
        ) : (
          <div className="confirm-row">
            <span>This replaces your current dataset. Continue?</span>
            <button className="btn btn-danger" onClick={async () => { try { setDataset(await loadBundledDataset()); } catch (e) { setDataset([]); } setConfirmReset(false); }}>
              Yes, reset
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FaqTab() {
  const t = useT();
  const steps = [["help.s1.t", "help.s1.d"], ["help.s2.t", "help.s2.d"], ["help.s3.t", "help.s3.d"]];
  const glossary = [["term.farm", Wheat], ["term.market", Store], ["term.gap", ArrowUpRight], ["term.forecast", TrendingUp], ["term.link", BarChart3], ["term.miss", Check], ["term.psa", HelpCircle]];
  const faqs = [1, 2, 3, 4, 5, 6];
  return (
    <div className="page">
      <div className="page-title-row"><div><h2 className="page-title">{t("help.title")}</h2><p className="page-sub">{t("help.sub")}</p></div></div>
      <h3 className="section-label">{t("help.steps")}</h3>
      <div className="help-steps">
        {steps.map(([title, text], index) => (
          <div className="help-step" key={title}><span className="step-num">{index + 1}</span><b>{t(title)}</b><p>{t(text)}</p></div>
        ))}
      </div>
      <h3 className="section-label">{t("help.glossary")}</h3>
      <div className="glossary">
        {glossary.map(([key, Icon]) => (
          <div className="glossary-item" key={key}><span className="finding-icon"><Icon size={20} /></span><div><b>{t(key)}</b><p>{t(key + ".d")}</p></div></div>
        ))}
      </div>
      <h3 className="section-label">{t("help.faq")}</h3>
      <div className="faq-list">{faqs.map(n => <details className="faq-item" key={n}><summary>{t("faq.q" + n)}</summary><p>{t("faq.a" + n)}</p></details>)}</div>
    </div>
  );
}

/* ------------------------------ Shared bits ------------------------------- */

function InfoPill({ title, short, technical, plain }) {
  return (
    <div className="info-pill">
      <div className="info-pill-header">
        <strong>{title}</strong>
        <span>{short}</span>
      </div>
      <div className="info-pill-copy">
        <p><b>Technical:</b> {technical}</p>
        <p><b>Plain language:</b> {plain}</p>
      </div>
    </div>
  );
}

function InfoBox({ title, technical, plain }) {
  return (
    <div className="info-box">
      <span className="info-box-title">{title}</span>
      <p><b>Technical:</b> {technical}</p>
      <p><b>Plain language:</b> {plain}</p>
    </div>
  );
}

function PageHead({ eyebrow, title, context, desc }) {
  return (
    <div className="pagehead">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {context && <strong className="pagehead-context">{context}</strong>}
      <p>{desc}</p>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty">
      <CheckCircle2 size={16} />
      <span>{text}</span>
    </div>
  );
}

function LoadingState() {
  const t = useT();
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-chick"><ChickMark /></div>
      <h2>{t("loading.title")}</h2>
      <p>{t("loading.body")}</p>
      <span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

/* --------------------------------- CSS ------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');

:root {
  --c-bg: #F1EEE9;
  --c-surface: #FFFFFF;
  --c-ink: #11162B;
  --c-ink-soft: #5E6275;
  --c-line: #E6E1DA;
  --c-yolk: #F2A33A;
  --c-teal: #2E8B7A;
  --c-brick: #E8553D;
  --c-low: #2E8B7A;
  --c-med: #F2A33A;
  --c-high: #E8553D;
  --radius: 22px;
}

* { box-sizing: border-box; }

.app {
  font-family: 'DM Sans', system-ui, sans-serif;
  background: var(--c-bg);
  color: var(--c-ink);
  min-height: 100%;
  width: 100%;
  caret-color: transparent;
}

button, select, summary, label { user-select: none; }
input, textarea { caret-color: auto; user-select: text; }

.pagehead { max-width: 640px; margin-bottom: 22px; }
.eyebrow {
  font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-teal);
}
.pagehead h2 {
  font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 32px;
  margin: 4px 0 6px; color: var(--c-ink);
}
.pagehead-context {
  display: inline-block; margin-bottom: 8px; padding: 5px 10px;
  border-left: 3px solid var(--c-teal); background: #EFF4ED; color: var(--c-teal);
  font-size: 13px; font-weight: 700;
}
.pagehead p { font-size: 14px; color: var(--c-ink-soft); line-height: 1.5; margin: 0; }
.panel-help { color: var(--c-ink-soft); font-size: 12px; line-height: 1.4; margin: 4px 0 0; }
.import-report { display: grid; gap: 8px; margin-top: 14px; padding: 12px; background: #f5f8f3; border: 1px solid var(--c-line); border-radius: 8px; font-size: 12px; }
.report-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; color: var(--c-ink-soft); }
.report-grid span, .report-audit span { display: flex; justify-content: space-between; gap: 8px; }
.report-grid b, .report-audit b { color: var(--c-ink); font-family: 'DM Sans', system-ui, sans-serif; }
.report-audit { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid var(--c-line); color: var(--c-ink-soft); }
.source-controls { display: flex; gap: 20px; align-items: flex-end; flex-wrap: wrap; }
.source-select, .source-label { display: flex; flex-direction: column; gap: 6px; color: var(--c-ink-soft); font-size: 12px; font-weight: 600; }
.source-select select { min-width: 250px; border: 1px solid var(--c-line); border-radius: 8px; padding: 9px 11px; font: inherit; color: var(--c-ink); background: #fff; }
.scope-controls { display: flex; gap: 12px; flex-wrap: wrap; }
.scope-controls input { min-width: 220px; border: 1px solid var(--c-line); border-radius: 8px; padding: 9px 11px; font: inherit; color: var(--c-ink); background: #fff; }
.event-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.event-form label { display: flex; flex-direction: column; gap: 5px; color: var(--c-ink-soft); font-size: 12px; font-weight: 600; }
.event-form input, .event-form select, .event-form textarea { border: 1px solid var(--c-line); border-radius: 8px; padding: 8px 10px; font: inherit; color: var(--c-ink); background: #fff; }
.event-form textarea { min-height: 60px; resize: vertical; }
.event-form-wide { grid-column: span 3; }
.event-actions { display: flex; align-items: end; gap: 8px; }
.event-forecast-note { margin-top: 14px; padding: 10px 12px; background: #F5F1E5; border: 1px solid #EFE2C1; border-radius: 8px; font-size: 12px; }
.event-list { display: grid; gap: 8px; margin-top: 14px; }
.event-item { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--c-line); border-radius: 8px; }
.event-item > div:first-child { display: grid; gap: 3px; }
.event-item span, .event-item small { color: var(--c-ink-soft); font-size: 11px; }
.event-item-actions { display: flex; align-items: center; gap: 6px; }
.source-checks { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; }
.source-check { display: inline-flex; align-items: center; gap: 5px; color: var(--c-ink-soft); font-size: 12px; font-weight: 500; }
.source-label { margin-right: 2px; }
.source-description, .source-preview { display: flex; align-items: center; gap: 6px; color: var(--c-ink-soft); font-size: 12px; line-height: 1.4; margin: 14px 0 0; }
.axis-help { color: var(--c-ink-soft); font-size: 11px; margin: 8px 0 0; }
.source-preview { display: block; padding-top: 10px; border-top: 1px solid var(--c-line); }
.source-chart { margin: 12px -6px 0; }
.source-chart .recharts-wrapper { max-width: 100%; }
.faq-list { display: flex; flex-direction: column; gap: 8px; max-width: 760px; }
.faq-item { background: var(--c-surface); border: 1px solid var(--c-line); border-radius: 8px; padding: 0 16px; }
.faq-item summary { cursor: pointer; padding: 15px 0; font-size: 14px; font-weight: 700; list-style-position: inside; }
.faq-item p { color: var(--c-ink-soft); font-size: 13px; line-height: 1.55; margin: 0 0 16px 22px; }

.meaning-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.meaning-grid > div { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; background: #EFF4ED; border-left: 3px solid var(--c-teal); }
.meaning-grid b { font-size: 12px; }
.meaning-grid span { color: var(--c-ink-soft); font-size: 12px; line-height: 1.4; }

.kpis {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px;
}
.kpi {
  background: var(--c-surface); border: 1px solid var(--c-line); border-radius: var(--radius);
  padding: 16px; display: flex; flex-direction: column; gap: 8px;
  border-top: 3px solid var(--c-line);
}
.kpi-ink { border-top-color: var(--c-ink); }
.kpi-teal { border-top-color: var(--c-teal); }
.kpi-yolk { border-top-color: var(--c-yolk); }
.kpi-level { border-top-color: var(--c-line); }
.kpi-label { font-size: 11.5px; color: var(--c-ink-soft); font-weight: 600; }
.kpi-value {
  font-family: 'DM Sans', system-ui, sans-serif; font-size: 22px; font-weight: 600; color: var(--c-ink);
}
.kpi-pill {
  display: inline-flex; width: fit-content; padding: 3px 12px; border-radius: 999px;
  color: #fff; font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; font-weight: 700;
}

.panel {
  background: var(--c-surface); border: 1px solid var(--c-line); border-radius: var(--radius);
  padding: 18px 20px; margin-bottom: 18px;
}
.guide-panel {
  background: linear-gradient(180deg, rgba(47, 107, 79, 0.05), rgba(232, 163, 61, 0.04));
  border: 1px solid rgba(47, 107, 79, 0.18);
}
.step-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--c-ink-soft);
  display: grid;
  gap: 8px;
  line-height: 1.55;
}
.panel-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  margin-bottom: 14px; flex-wrap: wrap;
}
.panel-head h3 { font-size: 15px; margin: 0; font-weight: 700; }
.panel-tag { font-size: 11.5px; color: var(--c-ink-soft); font-family: 'DM Sans', system-ui, sans-serif; }

.chart-wrap { margin: 0 -6px; }

.levelbars { display: flex; flex-direction: column; gap: 10px; }
.levelbar-row { display: flex; align-items: center; gap: 10px; }
.levelbar-label { width: 64px; font-size: 12.5px; font-weight: 600; }
.levelbar-track { flex: 1; height: 10px; background: #EEF1E8; border-radius: 999px; overflow: hidden; }
.levelbar-fill { height: 100%; border-radius: 999px; transition: width .3s ease; }
.levelbar-count { width: 20px; text-align: right; font-family: 'DM Sans', system-ui, sans-serif; font-size: 12px; color: var(--c-ink-soft); }

.import-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.btn {
  display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
  border-radius: 8px; padding: 9px 15px; font-size: 13px; font-weight: 600;
  border: 1px solid transparent; font-family: inherit;
}
.btn-primary { background: var(--c-teal); color: #fff; }
.btn-primary:hover { background: #275a41; }
.btn-ghost { background: none; border-color: var(--c-line); color: var(--c-ink); }
.btn-ghost:hover { background: #F0F2EA; }
.btn-danger { background: var(--c-brick); color: #fff; }
.btn-danger-ghost { background: none; border-color: #E7BDB6; color: var(--c-brick); }
.confirm-row { display: flex; align-items: center; gap: 10px; font-size: 13px; flex-wrap: wrap; }

.addform { display: grid; grid-template-columns: 1.2fr 1fr 1fr auto; gap: 10px; align-items: stretch; }
.addform input {
  border: 1px solid var(--c-line); border-radius: 8px; padding: 9px 11px; font-size: 13px; font-family: inherit;
}
.form-error { color: var(--c-brick); font-size: 12.5px; margin: 10px 0 0; }

.table-wrap { overflow-x: auto; }
.analysis-table-wrap { overflow-x: auto; }
.analysis-table-wrap table { min-width: 460px; }
.analysis-explain-toggle {
  display: inline-flex; align-items: center; gap: 8px; border: 0; background: none;
  color: var(--c-teal); cursor: pointer; font: inherit; font-weight: 600; padding: 0;
  text-align: left;
}
.analysis-explain-toggle:hover { color: var(--c-brick); text-decoration: underline; }
.analysis-explain-toggle span {
  display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px;
  border: 1px solid currentColor; border-radius: 50%; font-size: 11px; line-height: 1;
}
.analysis-explanation-row td { background: #F5F7F2; color: var(--c-ink-soft); font-size: 12px; line-height: 1.5; }
.analysis-explanation-row strong { color: var(--c-ink); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--c-ink-soft); padding: 8px 10px; border-bottom: 1px solid var(--c-line);
}
td { padding: 9px 10px; border-bottom: 1px solid #EEF0EA; }
tr:last-child td { border-bottom: none; }
.mono { font-family: 'DM Sans', system-ui, sans-serif; }
.badge {
  display: inline-block; padding: 2px 10px; border-radius: 999px; color: #fff;
  font-size: 11px; font-weight: 700;
}
.icon-btn {
  background: none; border: none; cursor: pointer; color: var(--c-ink-soft); padding: 4px;
  border-radius: 6px;
}
.icon-btn:hover { color: var(--c-brick); background: #FBEDEA; }

.empty {
  display: flex; align-items: center; gap: 8px; justify-content: center;
  padding: 22px; color: var(--c-ink-soft); font-size: 13px;
}
.loading-state {
  min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; background: #fff; border-radius: 28px; padding: 36px 24px;
  box-shadow: 0 2px 16px rgba(17,22,43,0.05);
}
.loading-chick {
  width: 76px; height: 76px; display: grid; place-items: center; border-radius: 24px;
  background: #EBD3BE; animation: chick-bob 1.4s ease-in-out infinite;
}
.loading-chick svg { width: 48px; height: 48px; }
.loading-state h2 { margin: 22px 0 8px; font-family: 'Fraunces', Georgia, serif; font-size: 28px; }
.loading-state p { margin: 0; color: var(--c-ink-soft); font-size: 14px; }
.loading-dots { display: flex; gap: 6px; margin-top: 20px; }
.loading-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--c-brick); animation: loading-dot 1.2s ease-in-out infinite; }
.loading-dots i:nth-child(2) { animation-delay: .15s; }
.loading-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes chick-bob { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-8px) rotate(2deg); } }
@keyframes loading-dot { 0%, 80%, 100% { opacity: .35; transform: scale(.8); } 40% { opacity: 1; transform: scale(1.15); } }

.predict-panel { display: flex; gap: 28px; flex-wrap: wrap; align-items: center; }
.predict-form { display: flex; gap: 16px; flex-wrap: wrap; flex: 1; min-width: 260px; }
.predict-form label {
  display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600;
  color: var(--c-ink-soft); flex: 1; min-width: 160px;
}
.predict-form input, .predict-form select {
  border: 1px solid var(--c-line); border-radius: 8px; padding: 9px 11px;
  font-size: 14px; font-family: 'DM Sans', system-ui, sans-serif; color: var(--c-ink);
  background: var(--c-surface);
}
.hint { font-weight: 400; font-size: 11px; line-height: 1.4; }
.predict-result {
  background: #F5F1E5; border: 1px solid #EFE2C1; border-radius: var(--radius);
  padding: 16px 22px; display: flex; flex-direction: column; gap: 6px; min-width: 220px;
}
.predict-result-label { font-size: 11.5px; font-weight: 600; color: #8A6A22; }
.predict-result-value {
  font-family: 'Fraunces', Georgia, serif; font-size: 34px; font-weight: 800; color: var(--c-ink);
}
.predict-result-level {
  align-self: flex-start; padding: 3px 12px; border-radius: 999px; color: #fff;
  font-size: 11.5px; font-weight: 700;
}
.formula {
  font-family: 'DM Sans', system-ui, sans-serif; font-size: 14px; background: #F6F7F2;
  border: 1px solid var(--c-line); border-radius: 8px; padding: 12px 14px; margin: 0 0 10px;
}
.muted { color: var(--c-ink-soft); font-size: 12.5px; line-height: 1.5; margin: 0; }

.threshold-row { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 10px; }
.threshold-row label, .settings-grid label {
  display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--c-ink-soft);
}
.threshold-row input, .settings-grid input {
  border: 1px solid var(--c-line); border-radius: 8px; padding: 8px 10px;
  font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; width: 140px;
}
.settings-grid select {
  border: 1px solid var(--c-line); border-radius: 8px; padding: 8px 10px;
  font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; color: var(--c-ink);
  background: var(--c-surface); width: 100%; min-height: 34px;
}
.settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 4px; }

.metric-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px;
  margin-bottom: 14px;
}
.info-pill {
  background: #F5F7F2; border: 1px solid var(--c-line); border-radius: 10px; padding: 12px 14px;
}
.info-pill-header {
  display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px;
}
.info-pill-header strong {
  font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-teal);
}
.info-pill-header span {
  font-size: 11px; color: var(--c-ink-soft);
}
.info-pill-copy p {
  margin: 0 0 6px; font-size: 11.5px; line-height: 1.5; color: var(--c-ink-soft);
}
.info-stack {
  display: grid; gap: 10px;
}
.info-box {
  background: rgba(47, 107, 79, 0.03); border: 1px solid rgba(47, 107, 79, 0.12); border-radius: 10px; padding: 12px 14px;
}
.info-box-title {
  display: inline-block; font-size: 12px; font-weight: 700; color: var(--c-teal); margin-bottom: 6px;
}
.info-box p {
  margin: 4px 0; font-size: 11.5px; line-height: 1.5; color: var(--c-ink-soft);
}
.compact-stack { margin-top: 12px; }
.model-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;
}
.model-grid-compact { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.model-card {
  background: #F6F7F2; border: 1px solid var(--c-line); border-radius: 10px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.model-label {
  font-size: 11px; color: var(--c-ink-soft); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
}
.model-value {
  font-family: 'DM Sans', system-ui, sans-serif; font-size: 22px; color: var(--c-ink); line-height: 1.1;
}
.model-level {
  display: inline-flex; align-items: center; justify-content: center; width: fit-content; min-width: 88px; padding: 4px 12px; border-radius: 999px; color: #fff; font-size: 13px; font-weight: 700;
}
.model-meta {
  color: var(--c-ink-soft); font-size: 11.5px; line-height: 1.4;
}
.recommendation {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  margin-top: 14px; padding: 12px 14px; background: #EFF4ED;
  border-left: 3px solid var(--c-teal); font-size: 13px;
}
.recommendation strong { color: var(--c-teal); }
.recommendation span { font-family: 'DM Sans', system-ui, sans-serif; font-weight: 600; }
.recommendation small { color: var(--c-ink-soft); }
.decision-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.decision-grid > div {
  padding: 12px 14px; background: #F6F7F2; border: 1px solid var(--c-line); border-radius: 8px;
}
.decision-grid strong { font-size: 12px; color: var(--c-teal); }
.decision-grid p, .decision-note { color: var(--c-ink-soft); font-size: 12px; line-height: 1.5; margin: 7px 0 0; }
.decision-note { margin-top: 14px; }


/* ---------------- Redesign: layout shell ---------------- */
html, body { margin: 0; background: #11162B; }
.app {
  font-family: 'DM Sans', system-ui, sans-serif; background: #11162B; color: var(--c-ink);
  min-height: 100vh; padding: 28px; font-variant-numeric: tabular-nums;
}
.frame {
  display: flex; max-width: 1560px; margin: 0 auto; min-height: calc(100vh - 56px);
  border-radius: 36px; overflow: hidden; background: #fff; box-shadow: 0 30px 80px rgba(0,0,0,0.38);
}
.sidebar {
  width: 268px; flex-shrink: 0; background: #fff; padding: 30px 20px 28px;
  display: flex; flex-direction: column; gap: 26px;
}
.brand { display: flex; align-items: center; gap: 12px; padding: 0 8px; }
.brand-mark {
  width: 42px; height: 42px; border-radius: 13px; background: #EBD3BE; color: var(--c-ink);
  display: grid; place-items: center; flex-shrink: 0;
}
.brand-text { display: flex; flex-direction: column; line-height: 1.15; }
.brand-title { font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 22px; letter-spacing: -0.01em; }
.brand-title-accent { color: var(--c-brick); }
.brand-sub { font-size: 12px; color: var(--c-ink-soft); }
.viewing-card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 4px 8px; }
.viewing-avatar {
  width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; color: #fff; margin-bottom: 10px;
  background: linear-gradient(135deg, #F6A07C, #E8553D); box-shadow: 0 14px 28px rgba(232,85,61,0.34);
}
.viewing-card strong { font-size: 18px; }
.viewing-card > span { font-size: 13.5px; color: var(--c-ink-soft); }
.status-chip {
  margin-top: 10px; display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600;
  padding: 6px 12px; border-radius: 999px; background: #F1EEE9; color: var(--c-ink-soft);
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #B8B2A8; }
.status-chip.on .dot { background: var(--c-teal); }
.nav { display: flex; flex-direction: column; gap: 6px; }
.navitem {
  display: flex; align-items: center; gap: 13px; border: none; background: none; cursor: pointer; text-align: left;
  padding: 13px 18px; border-radius: 18px; color: var(--c-ink-soft); font-family: inherit; font-size: 15.5px; font-weight: 600;
}
.navitem:hover { background: #F7F4F0; color: var(--c-ink); }
.navitem.active { background: #F1EEE9; color: var(--c-ink); }
.navitem.active svg { color: var(--c-brick); }
.navitem:focus-visible, .action-card:focus-visible, .btn:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid rgba(232,85,61,0.45); outline-offset: 2px; }
.main { flex: 1; min-width: 0; background: var(--c-bg); border-radius: 36px 0 0 36px; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 14px; padding: 24px 40px 0; flex-wrap: wrap; }
.hamburger { display: none; background: #fff; border: none; border-radius: 14px; width: 44px; height: 44px; cursor: pointer; color: var(--c-ink); align-items: center; justify-content: center; }
.filterbar { display: flex; gap: 10px; flex-wrap: wrap; margin-left: auto; }
.pill-select {
  display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 999px; padding: 6px 8px 6px 18px;
  box-shadow: 0 2px 12px rgba(17,22,43,0.06); font-size: 11.5px; font-weight: 700; color: var(--c-ink-soft);
  text-transform: uppercase; letter-spacing: 0.07em;
}
.pill-select select {
  border: none; background: #F1EEE9; border-radius: 999px; padding: 9px 14px; font: inherit; font-size: 14px; font-weight: 600;
  text-transform: none; letter-spacing: 0; color: var(--c-ink); cursor: pointer; max-width: 230px; min-width: 120px;
}
.content { padding: 18px 40px 56px; }
.scrim { display: none; }

.page-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 8px 0 24px; }
.page-title { font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 46px; line-height: 1.05; margin: 0; letter-spacing: -0.01em; }
.page-sub { margin: 8px 0 0; color: var(--c-ink-soft); font-size: 15.5px; }
.pagehead { max-width: 760px; margin-bottom: 24px; }
.pagehead h2 { font-size: 40px; font-weight: 700; margin: 6px 0 8px; letter-spacing: -0.01em; }
.eyebrow { color: var(--c-brick); letter-spacing: 0.12em; font-size: 12px; font-family: 'DM Sans', sans-serif; font-weight: 700; }
.pagehead-context { border-left: none; border-radius: 999px; background: #fff; color: var(--c-ink); padding: 6px 14px; }
.pagehead p { font-size: 15px; }
.notice { background: #fff; border-radius: 18px; padding: 14px 18px; margin-bottom: 18px; color: var(--c-ink-soft); font-size: 14px; }

/* ---------------- cards ---------------- */
.card { border-radius: 30px; padding: 26px 30px; margin-bottom: 22px; background: #fff; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.card-head h3, .card h3 { font-size: 22px; margin: 0; font-weight: 700; letter-spacing: -0.005em; }
.card-sky { background: linear-gradient(180deg, #98CCD9 0%, #C9E5EC 100%); box-shadow: none; }
.card-dark { background: #11162B; color: #fff; box-shadow: none; }
.card-tan { background: linear-gradient(180deg, #DDBFA4, #E9D6C3); box-shadow: none; }
.panel { border: none; border-radius: 28px; padding: 26px 30px; margin-bottom: 22px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.panel-head h3 { font-size: 20px; }
.panel-tag { font-family: 'DM Sans', sans-serif; background: #F1EEE9; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.chip { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.75); padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--c-ink); }
.chip i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.chip-ghost { background: rgba(255,255,255,0.55); color: var(--c-ink-soft); }
.legend-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.card-tan .chip-ghost { background: rgba(255,255,255,0.6); }

/* ---------------- KPI strip ---------------- */
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-bottom: 22px; }
.kpi { background: #fff; border: none; border-radius: 26px; padding: 22px 24px; gap: 6px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); border-top: none; }
.kpi-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kpi-label { font-size: 13.5px; color: var(--c-ink-soft); font-weight: 600; }
.kpi-value { font-family: 'Fraunces', Georgia, serif; font-size: 34px; font-weight: 700; letter-spacing: -0.01em; }
.kpi-pill { font-family: 'DM Sans', sans-serif; font-size: 18px; padding: 6px 18px; margin: 4px 0; }
.kpi-note { font-size: 12.5px; color: var(--c-ink-soft); }
.kpi-delta { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
.kpi-delta.up { background: var(--c-teal); }
.kpi-delta.down { background: var(--c-brick); }

/* ---------------- dashboard grid ---------------- */
.dash-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); gap: 22px; margin-bottom: 0; align-items: stretch; }
.chart-card .chart-wrap { margin: 0 -8px; }
.gap-card { display: flex; flex-direction: column; }
.gap-card h3 { color: #fff; }
.gap-lead { color: #B8BCCB; font-size: 14px; line-height: 1.55; margin: 0 0 20px; }
.level-pill { padding: 6px 14px; border-radius: 999px; color: #fff; font-size: 13px; font-weight: 700; }
.gap-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 18px; }
.gap-list li { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; grid-template-areas: "check name count" "check bar count"; column-gap: 14px; row-gap: 8px; align-items: center; }
.gap-check { grid-area: check; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
.gap-name { grid-area: name; display: flex; flex-direction: column; gap: 1px; }
.gap-name b { font-size: 16px; }
.gap-name small { color: #B8BCCB; font-size: 12.5px; }
.gap-bar { grid-area: bar; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
.gap-bar i { display: block; height: 100%; border-radius: 999px; }
.gap-count { grid-area: count; font-size: 18px; font-weight: 700; text-align: right; }
.gap-foot { margin-top: auto; padding-top: 18px; color: #8F94A8; font-size: 12.5px; }

.actions-strip { display: grid; grid-template-columns: minmax(200px, 0.7fr) minmax(0, 3fr); gap: 28px; align-items: center; margin-top: 22px; }
.strip-intro h3 { font-size: 24px; }
.strip-intro p { margin: 8px 0 0; font-size: 14.5px; line-height: 1.5; color: #5B4A3C; }
.action-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.action-card {
  position: relative; text-align: left; border: none; cursor: pointer; font-family: inherit; color: var(--c-ink);
  background: #FBF8F4; border-radius: 24px; padding: 20px 20px 22px; display: flex; flex-direction: column; gap: 6px; min-height: 160px;
  box-shadow: 0 8px 22px rgba(94,60,30,0.12); transition: transform .15s ease, box-shadow .15s ease;
}
.action-card:hover { transform: translateY(-3px); box-shadow: 0 14px 28px rgba(94,60,30,0.18); }
.action-card strong { font-size: 17px; }
.action-card > span:not(.action-icon) { font-size: 13.5px; line-height: 1.45; color: var(--c-ink-soft); padding-right: 22px; }
.action-icon { width: 44px; height: 44px; border-radius: 14px; background: var(--c-brick); color: #fff; display: grid; place-items: center; margin-bottom: 10px; }
.action-arrow { position: absolute; right: 18px; bottom: 20px; color: var(--c-ink-soft); }
.action-card.primary { background: linear-gradient(135deg, #B7DDE6, #7DBFCF); }
.action-card.primary > span:not(.action-icon), .action-card.primary .action-arrow { color: #20404D; }
.action-card.primary .action-icon { background: #11162B; }

details.fold { padding: 0; overflow: hidden; }
details.fold > summary { cursor: pointer; padding: 20px 30px; font-size: 17px; font-weight: 700; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
details.fold > summary::-webkit-details-marker { display: none; }
details.fold > summary::after { content: "+"; font-size: 24px; font-weight: 500; color: var(--c-brick); line-height: 1; }
details.fold[open] > summary::after { content: "\u2212"; }
details.fold > :not(summary) { margin-left: 30px; margin-right: 30px; }
details.fold > :last-child { margin-bottom: 26px; }
.meaning-grid { gap: 14px; }
.meaning-grid > div { background: #F7F4F0; border-left: none; border-radius: 18px; padding: 16px 18px; }
.meaning-grid b { font-size: 14px; }
.meaning-grid span { font-size: 13.5px; }

/* ---------------- forecast ---------------- */
.forecast-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 22px; margin-bottom: 0; }
.forecast-grid { margin-bottom: 22px; }
.forecast-grid > .card, .dash-grid > .card { margin-bottom: 0; }
.inputs-card h3 { margin-bottom: 18px; }
.input-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px; }
.input-steps li { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 16px; align-items: start; }
.step-num { width: 38px; height: 38px; border-radius: 50%; background: #FBE3DC; color: var(--c-brick); display: grid; place-items: center; font-weight: 700; font-size: 16px; margin-top: 22px; }
.input-steps label { display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 600; color: var(--c-ink); }
.input-steps select, .input-steps input { border: 1.5px solid var(--c-line); border-radius: 16px; padding: 13px 16px; font: inherit; font-size: 16px; font-weight: 600; background: #FBF9F6; color: var(--c-ink); }
.input-steps .hint { color: var(--c-ink-soft); font-weight: 500; font-size: 12.5px; }
.hero-card {
  margin-bottom: 22px; display: flex; flex-direction: column; justify-content: center; gap: 12px; color: #fff; box-shadow: none;
  background: linear-gradient(135deg, #F59A74 0%, #E8553D 100%);
}
.hero-label { font-size: 15px; font-weight: 600; opacity: 0.92; }
.hero-value { font-family: 'Fraunces', Georgia, serif; font-size: 78px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
.hero-level { align-self: flex-start; padding: 8px 18px; border-radius: 999px; font-size: 14px; font-weight: 700; background: #11162B; }
.hero-note { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5; opacity: 0.92; max-width: 420px; }
.reliability-card .muted { color: #5B4A3C; margin-bottom: 18px; font-size: 14px; }
.model-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.model-card { position: relative; background: #FBF8F4; border: 2px solid transparent; border-radius: 22px; padding: 18px 20px; gap: 8px; }
.model-card.recommended { border-color: var(--c-brick); background: #fff; }
.model-tag { position: absolute; top: -12px; right: 16px; background: var(--c-brick); color: #fff; font-size: 11.5px; font-weight: 700; padding: 4px 12px; border-radius: 999px; }
.model-label { font-size: 12px; letter-spacing: 0.05em; }
.model-value { font-family: 'Fraunces', Georgia, serif; font-size: 30px; font-weight: 700; }
.model-meta { font-size: 12.5px; }
.recommendation { background: rgba(255,255,255,0.6); border-left: none; border-radius: 16px; padding: 14px 18px; margin-top: 18px; }
.recommendation strong { color: var(--c-brick); }
.recommendation span { font-weight: 700; }
.formula { background: #F7F4F0; border: none; border-radius: 16px; }
.info-pill { background: #F7F4F0; border: none; border-radius: 18px; }
.info-pill-header strong { color: var(--c-brick); }
.info-box { background: #F7F4F0; border: none; border-radius: 18px; }
.info-box-title { color: var(--c-brick); }
.decision-grid > div { background: #fff; border: none; border-radius: 22px; padding: 18px 20px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.decision-grid strong { color: var(--c-brick); font-size: 14px; }
.decision-grid p { font-size: 13.5px; }

/* ---------------- shared controls ---------------- */
.btn { border-radius: 999px; padding: 11px 22px; font-size: 14px; font-weight: 700; gap: 8px; }
.btn-lg { padding: 14px 26px; font-size: 15px; }
.btn-primary { background: var(--c-ink); color: #fff; }
.btn-primary:hover { background: var(--c-brick); }
.btn-ghost { background: #fff; border-color: var(--c-line); }
.btn-ghost:hover { background: #F7F4F0; }
select, input, textarea { font-family: inherit; }
.source-select select, .scope-controls input, .addform input, .event-form input, .event-form select, .event-form textarea, .settings-grid input, .settings-grid select, .threshold-row input {
  border: 1.5px solid var(--c-line); border-radius: 14px; background: #FBF9F6; padding: 11px 14px; font-family: 'DM Sans', sans-serif; font-weight: 500;
}
.import-report { background: #F7F4F0; border: none; border-radius: 18px; }
.faq-item { border: none; border-radius: 20px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.faq-item summary { font-size: 15.5px; }
th { color: var(--c-ink-soft); font-size: 11.5px; padding: 10px 12px; }
td { padding: 12px; border-bottom: 1px solid #F0ECE6; }
.analysis-explanation-row td { background: #F7F4F0; }
.badge { padding: 4px 12px; }
.levelbar-track { background: #F1EEE9; }
.empty { background: #fff; border-radius: 20px; }
.analysis-explain-toggle { color: var(--c-brick); }
.guide-panel { background: #fff; border: none; }
.step-list { color: var(--c-ink-soft); }
.recommendation small { color: #5B4A3C; }


/* ---------------- Philippine poultry theme + plain-language extras ---------------- */
.brand-mark svg { width: 30px; height: 30px; }
.sidebar-foot { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 14px 12px 0; border-top: 1px solid #F0ECE6; color: var(--c-ink-soft); font-size: 12.5px; }
.lang-toggle { display: inline-flex; background: #fff; border-radius: 999px; padding: 4px; box-shadow: 0 2px 12px rgba(17,22,43,0.06); }
.lang-toggle button { border: none; background: transparent; padding: 9px 16px; border-radius: 999px; font: inherit; font-size: 13px; font-weight: 700; color: var(--c-ink-soft); cursor: pointer; }
.lang-toggle button.on { background: var(--c-ink); color: #fff; }
.lead-text { margin: -8px 0 22px; max-width: 760px; font-size: 16px; line-height: 1.6; color: var(--c-ink-soft); }
.section-label { font-family: 'Fraunces', Georgia, serif; font-size: 24px; margin: 28px 0 14px; }

/* woven-mat (banig) texture */
.hero-card, .welcome { position: relative; overflow: hidden; }
.hero-card::before, .welcome::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.13) 0 12px, transparent 12px 24px),
    repeating-linear-gradient(-45deg, rgba(255,255,255,0.13) 0 12px, transparent 12px 24px);
}
.hero-card > *, .welcome > * { position: relative; }

.welcome { display: flex; align-items: center; gap: 24px; border-radius: 30px; padding: 26px 30px; margin-bottom: 22px; background: linear-gradient(120deg, #FFD98A 0%, #F7B955 55%, #F29E3D 100%); color: #11162B; }
.welcome-sun { position: absolute !important; right: -34px; top: -40px; color: rgba(255,255,255,0.55); }
.welcome-body { flex: 1; min-width: 0; }
.welcome h3 { font-size: 26px; margin: 0 0 6px; font-family: 'Fraunces', Georgia, serif; }
.welcome p { margin: 0 0 16px; max-width: 760px; font-size: 15.5px; line-height: 1.55; }
.term-chips { display: flex; gap: 12px; flex-wrap: wrap; }
.term-chip { display: inline-flex; align-items: flex-start; gap: 10px; background: rgba(255,255,255,0.82); border-radius: 18px; padding: 10px 16px 10px 12px; max-width: 290px; }
.term-chip svg { margin-top: 2px; color: var(--c-brick); flex-shrink: 0; }
.term-chip b { display: block; font-size: 14px; }
.term-chip small { display: block; font-size: 12.5px; line-height: 1.4; color: #4A4538; }
.welcome .btn { align-self: flex-start; margin-right: 54px; }

.headline-card { display: flex; align-items: center; gap: 16px; background: #fff; border-radius: 26px; padding: 20px 26px; margin-bottom: 20px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.headline-card svg { flex-shrink: 0; color: #fff; background: var(--c-brick); border-radius: 16px; padding: 11px; width: 48px; height: 48px; box-sizing: border-box; }
.headline-card p { margin: 0; font-size: 19px; line-height: 1.5; font-weight: 600; }

.hero-sentence { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.45; }
.forecast-alt { display: inline-flex; flex-direction: column; gap: 3px; margin-top: 6px; padding: 10px 14px; border-radius: 10px; background: rgba(17,22,43,0.16); }
.forecast-alt span { font-size: 12px; font-weight: 700; }
.forecast-alt b { font-family: 'Fraunces', Georgia, serif; font-size: 30px; line-height: 1; }
.forecast-alt small { font-size: 11px; opacity: .85; }
.hero-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 6px; }
.hero-fact { background: rgba(17,22,43,0.2); border-radius: 18px; padding: 12px 16px; display: flex; flex-direction: column; gap: 3px; }
.hero-fact small { font-size: 12px; opacity: 0.9; line-height: 1.35; }
.hero-fact b { font-size: 20px; font-family: 'Fraunces', Georgia, serif; }
.hero-fact.trust-good b { color: #C9F3DE; }
.hero-fact.trust-ok b { color: #FFF1BF; }
.hero-fact.trust-low b { color: #FFE0D6; }

.meter { display: flex; align-items: center; gap: 12px; }
.meter-track { flex: 1; min-width: 90px; max-width: 220px; height: 12px; border-radius: 999px; background: #EDE8E1; overflow: hidden; }
.meter-fill { display: block; height: 100%; border-radius: 999px; }
.meter-fill.strong { background: var(--c-teal); }
.meter-fill.mid { background: var(--c-yolk); }
.meter-fill.weak, .meter-fill.na { background: #C9C3B8; }
.meter small { color: var(--c-ink-soft); font-size: 12px; min-width: 34px; }

.findings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-bottom: 22px; }
.finding { background: #fff; border-radius: 26px; padding: 22px 24px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.finding h3 { font-size: 18px; margin: 12px 0 8px; line-height: 1.3; }
.finding p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--c-ink-soft); }
.finding-icon { width: 44px; height: 44px; border-radius: 14px; background: #FBE3DC; color: var(--c-brick); display: inline-grid; place-items: center; flex-shrink: 0; }
.tech-note { font-size: 12.5px; }

.help-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.help-step { background: #fff; border-radius: 26px; padding: 22px 24px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.help-step .step-num { margin-top: 0; }
.help-step b { font-size: 18px; }
.help-step p { margin: 0; color: var(--c-ink-soft); font-size: 14.5px; line-height: 1.55; }
.glossary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.glossary-item { display: flex; gap: 16px; background: #fff; border-radius: 22px; padding: 18px 20px; box-shadow: 0 2px 16px rgba(17,22,43,0.05); }
.glossary-item b { font-size: 16px; }
.glossary-item p { margin: 4px 0 0; color: var(--c-ink-soft); font-size: 14px; line-height: 1.5; }
.faq-list { display: grid; gap: 12px; }
.faq-item summary { padding: 4px 6px; }


/* ---------------- simplified layout (v3) ---------------- */
.nav-label { margin: 14px 18px 2px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9A9486; }
.navitem-small { padding: 10px 18px; font-size: 14px; font-weight: 600; }
.sidebar-foot { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px 6px 0; }
.sidebar-foot .lang-toggle { box-shadow: none; background: #F1EEE9; }
.sidebar-foot .lang-toggle button.on { background: var(--c-ink); }
.foot-note { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--c-ink-soft); }
.lang-mobile { display: none; }
.pill-icon { width: 28px; height: 28px; border-radius: 50%; background: #FBE3DC; color: var(--c-brick); display: inline-grid; place-items: center; }
.pill-select { text-transform: none; letter-spacing: 0; }

.welcome-slim { padding: 14px 24px; gap: 16px; }
.welcome-slim p { margin: 0; flex: 1; font-size: 15.5px; font-weight: 600; }
.welcome-slim .btn { margin-right: 54px; align-self: center; }

.hero-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 22px; margin-bottom: 22px; }
.hero-row > .card { margin-bottom: 0; }
.price-now { display: flex; flex-direction: column; gap: 10px; justify-content: center; padding: 30px 34px; }
.price-now .eyebrow { margin: 0; }
.price-now h3 { font-family: 'Fraunces', Georgia, serif; font-size: 38px; line-height: 1.15; margin: 0; letter-spacing: -0.01em; }
.price-sub { margin: 0; font-size: 17px; color: var(--c-ink-soft); line-height: 1.5; }
.change-line { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; font-size: 14px; font-weight: 700; padding: 7px 14px; border-radius: 999px; background: #F1EEE9; color: var(--c-ink-soft); }
.change-line.up { background: #DDF1EA; color: #1F6B5C; }
.change-line.down { background: #FCE0D8; color: #B23E2A; }
.next-card { justify-content: center; gap: 12px; align-items: flex-start; }
.next-card .hero-value { font-size: 64px; }
.btn-light { background: #fff; color: var(--c-ink); }
.btn-light:hover { background: #11162B; color: #fff; }
.trust-pill { display: inline-block; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; background: rgba(17,22,43,0.28); }
.trust-pill.trust-good { background: rgba(46,139,122,0.9); }
.trust-pill.trust-ok { background: rgba(242,163,58,0.95); color: #11162B; }
.trust-pill.trust-low { background: rgba(17,22,43,0.4); }

.forecast-period-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.forecast-period-controls .seg { margin-bottom: 0; }
.forecast-period-input { display: inline-flex; align-items: center; gap: 8px; color: var(--c-ink-soft); font-size: 13px; font-weight: 700; white-space: nowrap; }
.forecast-period-input input { width: 76px; border: 1px solid #D9D4CC; border-radius: 999px; padding: 10px 12px; background: #fff; color: var(--c-ink); font: inherit; }
.seg { display: inline-flex; max-width: 100%; overflow-x: auto; background: #fff; border-radius: 999px; padding: 5px; box-shadow: 0 2px 12px rgba(17,22,43,0.06); margin: 0 0 20px; }
.seg button { border: none; background: transparent; cursor: pointer; font: inherit; font-size: 14.5px; font-weight: 700; color: var(--c-ink-soft); padding: 11px 20px; border-radius: 999px; white-space: nowrap; }
.seg button.on { background: var(--c-ink); color: #fff; }
.seg-small { margin: 0; box-shadow: none; background: rgba(255,255,255,0.7); }
.seg-small button { font-size: 12.5px; padding: 7px 14px; }
.chart-card .legend-chips { margin-bottom: 6px; }

.gap-big { font-family: 'Fraunces', Georgia, serif; font-size: 46px; font-weight: 700; margin: 6px 0 2px; }
.gap-scale { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0 16px; }
.gap-seg { text-align: center; padding: 12px 6px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #B8BCCB; font-size: 14px; font-weight: 700; }
.gap-seg.on { color: #fff; box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
.gap-card .gap-lead { margin-bottom: 14px; }

.hero-simple { margin-bottom: 22px; }
.reliability-simple h3 { font-size: 21px; margin: 0 0 8px; }
.reliability-simple p { margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: var(--c-ink-soft); }
.rel-bars { display: grid; gap: 10px; margin: 6px 0 14px; }
.rel-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 70px; gap: 14px; align-items: center; font-size: 14px; }
.rel-track { height: 14px; background: #EDE8E1; border-radius: 999px; overflow: hidden; }
.rel-track i { display: block; height: 100%; border-radius: 999px; }
.rel-track i.ours { background: var(--c-teal); }
.rel-track i.base { background: #C9C3B8; }
.rel-row b { text-align: right; }
.rel-verdict { font-weight: 700; color: var(--c-ink) !important; margin: 0 !important; }
.row-best td { background: #FFF6EC; font-weight: 700; }
.whatif-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 4px; }
.whatif-row input { border: 1.5px solid var(--c-line); border-radius: 14px; padding: 12px 16px; font: inherit; font-size: 16px; font-weight: 600; background: #FBF9F6; min-width: 160px; }
.hint-line { margin: -6px 0 18px; font-size: 14px; color: var(--c-ink-soft); }
.recent-card { padding-bottom: 12px; }
.fold-inner { padding: 0 0 8px; margin: 0 -10px; }
details.fold > .fold-inner { margin-left: 18px; margin-right: 18px; }
details.fold .panel { box-shadow: none; border: 1px solid #F0ECE6; }

.gap-explain { margin: 4px 0 16px; font-size: 14.5px; line-height: 1.55; color: #D8DBE6; }
/* ---------------- responsive ---------------- */
@media (max-width: 1180px) {
  .hero-row { grid-template-columns: 1fr; }
  .findings, .help-steps { grid-template-columns: 1fr; }
  .glossary { grid-template-columns: 1fr; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .actions-strip { grid-template-columns: 1fr; }
  .dash-grid, .forecast-grid { grid-template-columns: 1fr; }
}
@media (max-width: 960px) {
  .lang-mobile { display: inline-flex; }
  .sidebar .lang-toggle { display: none; }
  .sidebar-foot { padding-top: 8px; }
  .price-now h3 { font-size: 28px; }
  .rel-row { grid-template-columns: 110px minmax(0, 1fr) 62px; }
  .welcome-slim .btn { margin-right: 0; }
  .welcome { flex-direction: column; align-items: flex-start; }
  .welcome .btn { margin-right: 0; }
  .lang-toggle { margin-left: auto; }
  .headline-card p { font-size: 16.5px; }
  .app { padding: 0; }
  .frame { border-radius: 0; min-height: 100vh; box-shadow: none; }
  .main { border-radius: 0; }
  .hamburger { display: inline-flex; }
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 40; transform: translateX(-100%); transition: transform .2s ease; box-shadow: none; overflow-y: auto; }
  .sidebar.open { transform: translateX(0); box-shadow: 8px 0 40px rgba(0,0,0,0.25); }
  .scrim { display: block; position: fixed; inset: 0; z-index: 30; background: rgba(17,22,43,0.45); border: none; }
  .topbar { padding: 16px 16px 0; }
  .filterbar { margin-left: 0; width: 100%; }
  .pill-select { flex: 1 1 200px; }
  .pill-select select { flex: 1; max-width: none; }
  .content { padding: 14px 16px 40px; }
  .page-title { font-size: 36px; }
  .action-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero-value { font-size: 60px; }
  .meaning-grid, .decision-grid { grid-template-columns: 1fr; }
  .addform, .event-form { grid-template-columns: 1fr; }
  .event-form-wide { grid-column: auto; }
  .event-item { flex-direction: column; }
  .report-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .card, .panel { padding: 20px 18px; border-radius: 24px; }
  details.fold > summary { padding: 18px; }
  details.fold > :not(summary) { margin-left: 18px; margin-right: 18px; }
}
@media (max-width: 560px) {
  .kpis, .action-cards { grid-template-columns: 1fr; }
}
`;
