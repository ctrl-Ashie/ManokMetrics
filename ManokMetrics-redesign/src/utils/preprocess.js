const MISSING_MARKERS = new Set(["", ".", "..", "..."]);

const DATASET_SCHEMAS = {
  chickenInventory: ["value", "geo_clean_name", "geo_region", "geo_province", "animal_type", "classification", "year", "quarter"],
  duckInventory: ["value", "geo_clean_name", "geo_region", "geo_province", "classification", "year", "quarter"],
  farmgate: ["geo_clean_name", "geo_region", "geo_province", "commodity_type", "year", "month", "value", "is_imputed"],
  retail: ["value", "geo_clean_name", "geo_region", "geo_province", "year", "commodity_type", "month"],
  production: ["value", "geo_region", "quarter", "geo_clean_name", "commodity", "year"],
  slaughter: ["value", "geo_clean_name", "geo_region", "geo_province", "year", "animal_type"],
};

function cleanHeader(header) {
  return String(header ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
}

function normalizeRows(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [cleanHeader(key), value])));
}

function isMissing(value) {
  return value == null || MISSING_MARKERS.has(String(value).trim());
}

function numberValue(value) {
  if (isMissing(value)) return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function yearValue(value) {
  if (isMissing(value)) return null;
  const match = String(value).match(/^\s*(\d{4})/);
  const year = Number(match ? match[1] : value);
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null;
}

function schemaMatches(headers, required) {
  return required.every(column => headers.has(column));
}

function detectDataset(rows) {
  const headers = new Set(Object.keys(rows[0] || {}).map(cleanHeader));
  if (schemaMatches(headers, DATASET_SCHEMAS.chickenInventory) && headers.has("animal_type")) return "chickenInventory";
  if (schemaMatches(headers, DATASET_SCHEMAS.duckInventory) && !headers.has("animal_type")) return "duckInventory";
  if (schemaMatches(headers, DATASET_SCHEMAS.farmgate)) return "farmgate";
  if (schemaMatches(headers, DATASET_SCHEMAS.retail)) return "retail";
  if (schemaMatches(headers, DATASET_SCHEMAS.production)) return "production";
  if (schemaMatches(headers, DATASET_SCHEMAS.slaughter)) return "slaughter";
  if (headers.has("period") && headers.has("farmgate") && headers.has("retail")) return "simple";
  const masterFarmgate = [...headers].some(key => key.startsWith("farmgate_"));
  const masterRetail = [...headers].some(key => key.startsWith("retail_"));
  if (headers.has("year") && headers.has("month") && masterFarmgate && masterRetail) return "master";
  if (headers.has("value") && headers.has("geo_level") && headers.has("period_type")) return "rawPsa";
  return null;
}

function validationReport(filename, datasetType, total) {
  return {
    filename,
    datasetType,
    status: "Rejected",
    totalRecords: total,
    validRecords: 0,
    rejectedRecords: total,
    removedRecords: 0,
    duplicateRecords: 0,
    missingValueRecords: 0,
    imputedRecords: 0,
    warnings: [],
    audit: [],
    reasons: [],
  };
}

function addReason(report, reason) {
  if (!report.reasons.includes(reason)) report.reasons.push(reason);
}

function validateHeaders(rows, filename) {
  const report = validationReport(filename, null, rows.length);
  if (!rows.length) {
    addReason(report, "The CSV contains no data rows.");
    return report;
  }
  const rawHeaders = Object.keys(rows[0] || {});
  const headers = rawHeaders.map(cleanHeader);
  if (headers.some(header => !header)) addReason(report, "The CSV contains an empty header.");
  if (new Set(headers).size !== headers.length) addReason(report, "The CSV contains duplicate column names.");
  return report;
}

function processSimple(rows, report) {
  const output = [];
  rows.forEach(row => {
    const period = String(row.period ?? "").trim();
    const farmgate = numberValue(row.farmgate);
    const retail = isMissing(row.retail) ? null : numberValue(row.retail);
    if (!period || farmgate == null || retail === null && !isMissing(row.retail) || farmgate < 0 || retail !== null && retail < 0) return;
    output.push({ id: `import-${output.length}`, period, periodKey: period, farmgate, retail });
  });
  report.validRecords = output.length;
  report.rejectedRecords = report.totalRecords - output.length;
  if (report.rejectedRecords) addReason(report, "Some rows have missing, invalid, or negative price values.");
  if (output.some(row => row.retail === null)) report.warnings.push("Some accepted records contain farmgate prices without a retail price.");
  return output;
}

function processMaster(rows, report) {
  const headers = Object.keys(rows[0] || {});
  const farmgateKey = headers.includes("farmgate_hh__broiler_chicken")
    ? "farmgate_hh__broiler_chicken"
    : headers.find(key => key.startsWith("farmgate_hh__")) || headers.find(key => key.startsWith("farmgate_"));
  const retailKey = headers.includes("retail__fresh_chicken_fully_dressed_broiler_1_kg")
    ? "retail__fresh_chicken_fully_dressed_broiler_1_kg"
    : headers.find(key => key.startsWith("retail__"));
  const output = [];
  rows.forEach(row => {
    const year = yearValue(row.year);
    const month = numberValue(row.month);
    const farmgate = numberValue(row[farmgateKey]);
    const retail = isMissing(row[retailKey]) ? null : numberValue(row[retailKey]);
    if (year == null || month == null || month < 1 || month > 12 || farmgate == null || farmgate < 0 || retail !== null && retail < 0) return;
    const periodKey = `${year}-${String(month).padStart(2, "0")}`;
    output.push({ id: `import-${output.length}`, period: periodKey, periodKey, farmgate, retail });
  });
  report.validRecords = output.length;
  report.rejectedRecords = report.totalRecords - output.length;
  if (report.rejectedRecords) addReason(report, "Some rows have invalid year, month, or price values.");
  if (output.some(row => row.retail === null)) report.warnings.push("Some accepted records contain farmgate prices without a retail price.");
  return output;
}

function rawRowsToProcessed(rows, report) {
  const kind = rows[0]?.geo_level && rows[0]?.period_type ? "rawPsa" : null;
  if (!kind) return [];
  const regionByProvince = {
    leyte: "REGION VIII (EASTERN VISAYAS)",
    "southern leyte": "REGION VIII (EASTERN VISAYAS)",
    samar: "REGION VIII (EASTERN VISAYAS)",
    "northern samar": "REGION VIII (EASTERN VISAYAS)",
    "eastern samar": "REGION VIII (EASTERN VISAYAS)",
    "nueva vizcaya": "REGION II (CAGAYAN VALLEY)",
    quirino: "REGION II (CAGAYAN VALLEY)",
  };
  const prepared = rows.map(row => {
    const province = String(row.geo_province || row.geo_clean_name || row.geo_name || "").trim();
    const region = String(row.geo_region || "").trim() || regionByProvince[province.toLowerCase()] || "";
    return { ...row, geo_province: province, geo_clean_name: row.geo_clean_name || province, geo_region: region };
  });
  const valueRows = prepared.filter(row => numberValue(row.value) != null);
  report.missingValueRecords = prepared.length - valueRows.length;
  report.audit.push({ label: "Valid value records", count: valueRows.length });
  const filtered = valueRows.filter(row => {
    const periodType = String(row.period_type || "").toLowerCase();
    return periodType === "month" || periodType === "quarter" || !periodType;
  });
  report.audit.push({ label: "Period-compatible records", count: filtered.length });
  const provinceOnly = filtered.filter(row => String(row.geo_level || "").toLowerCase() === "province");
  const regionOnly = filtered.filter(row => String(row.geo_level || "").toLowerCase() === "region");
  const geographic = provinceOnly.length ? provinceOnly : regionOnly;
  report.audit.push({ label: "Geographic-level records", count: geographic.length });
  return processDimensionRows(geographic, report, "rawPsa");
}

function processDimensionRows(rows, report, type, allowInterpolation = true) {
  const isFarmgate = type === "farmgate" || type === "rawPsa" && rows.some(row => row.commodity_type);
  const output = [];
  const seen = new Map();
  rows.forEach(row => {
    const value = numberValue(row.value);
    const year = yearValue(row.year);
    const month = numberValue(row.month);
    const quarter = numberValue(row.quarter);
    const periodValid = month == null || (month >= 1 && month <= 12);
    const quarterValid = quarter == null || (quarter >= 1 && quarter <= 4);
    if (value == null || value < 0 || year == null || !periodValid || !quarterValid) return;
    const identity = [
      row.geo_clean_name, row.geo_province, row.geo_region, row.commodity_type || row.commodity,
      row.animal_type, row.classification, year, month ?? quarter ?? "",
    ].map(item => String(item ?? "").trim().toLowerCase()).join("|");
    const existing = seen.get(identity);
    if (existing) {
      if (existing.value !== value) report.warnings.push(`Conflicting duplicate observations were found for ${identity}.`);
      report.duplicateRecords += 1;
      return;
    }
    const normalized = {
      geo_clean_name: String(row.geo_clean_name || "").trim(),
      geo_region: String(row.geo_region || "").trim(),
      geo_province: String(row.geo_province || "").trim(),
      commodity_type: row.commodity_type || row.commodity || "",
      animal_type: row.animal_type || "",
      classification: row.classification || "",
      year,
      month: month ?? null,
      quarter: quarter ?? null,
      value,
      is_imputed: isFarmgate ? (numberValue(row.is_imputed) ?? 0) : undefined,
    };
    if (!normalized.geo_clean_name || !normalized.geo_region) return;
    seen.set(identity, normalized);
    output.push(normalized);
  });
  output.sort((a, b) => (a.year - b.year) || ((a.month ?? a.quarter ?? 0) - (b.month ?? b.quarter ?? 0)));
  report.validRecords = output.length;
  report.rejectedRecords = report.totalRecords - output.length;
  if (report.rejectedRecords) addReason(report, "Some records were rejected because required dimensions or numeric values were invalid.");
  if (isFarmgate && allowInterpolation) {
    const filled = interpolateFarmgate(output, 3, report);
    report.imputedRecords = filled.length - output.length;
    return filled;
  }
  if (isFarmgate) report.imputedRecords = output.filter(row => row.is_imputed === 1).length;
  return output;
}

function interpolateFarmgate(rows, maxGap, report) {
  const series = new Map();
  rows.forEach(row => {
    const key = [row.geo_clean_name, row.geo_region, row.commodity_type].join("|");
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(row);
  });
  const output = [...rows];
  series.forEach(items => {
    items.sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
    for (let index = 0; index < items.length - 1; index += 1) {
      const first = items[index];
      const second = items[index + 1];
      const t1 = first.year * 12 + first.month;
      const t2 = second.year * 12 + second.month;
      const gap = t2 - t1 - 1;
      if (gap < 1 || gap > maxGap) continue;
      for (let step = 1; step <= gap; step += 1) {
        const t = t1 + step;
        const year = Math.floor(t / 12);
        const month = t % 12 || 12;
        output.push({
          ...first,
          year,
          month,
          value: Number((first.value + ((second.value - first.value) * step) / (gap + 1)).toFixed(2)),
          is_imputed: 1,
        });
      }
    }
  });
  output.sort((a, b) => (a.year - b.year) || (a.month - b.month));
  report.audit.push({ label: "After gap interpolation", count: output.length });
  return output;
}

export function processCsvImport(rawRows, filename = "uploaded.csv", options = {}) {
  const rows = normalizeRows(rawRows);
  const report = validateHeaders(rows, filename);
  const datasetType = detectDataset(rows);
  report.datasetType = datasetType;
  if (!datasetType || report.reasons.length) {
    if (!datasetType) addReason(report, "The uploaded CSV is not a supported ManokMetrics dataset.");
    return { rows: [], records: [], report };
  }
  report.status = "Processed";
  let records = [];
  if (datasetType === "simple") records = processSimple(rows, report);
  else if (datasetType === "master") records = processMaster(rows, report);
  else if (datasetType === "rawPsa") records = rawRowsToProcessed(rows, report);
  else records = processDimensionRows(rows, report, datasetType, datasetType !== "farmgate");
  report.removedRecords = Math.max(0, report.totalRecords - report.validRecords - report.duplicateRecords);
  report.status = records.length ? (report.reasons.length || report.warnings.length ? "Processed with warnings" : "Processed") : "Rejected";
  if (!records.length) addReason(report, "No usable records remained after validation.");
  return { rows: datasetType === "simple" || datasetType === "master" ? records : [], records, report };
}

export function formatDatasetType(type) {
  return ({
    simple: "Simple monthly price records",
    master: "Wide national monthly master",
    farmgate: "Preprocessed farmgate prices",
    retail: "Preprocessed retail prices",
    chickenInventory: "Preprocessed chicken inventory",
    duckInventory: "Preprocessed duck inventory",
    production: "Preprocessed production volume",
    slaughter: "Preprocessed slaughter",
    rawPsa: "Raw PSA poultry dataset",
  })[type] || "Unsupported dataset";
}
