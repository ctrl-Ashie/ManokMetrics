function finite(value) {
  return Number.isFinite(Number(value));
}

function compactMetric(metric) {
  if (!metric) return null;
  return {
    forecast: finite(metric.forecast) ? Number(metric.forecast) : null,
    mae: finite(metric.mae) ? Number(metric.mae) : null,
    rmse: finite(metric.rmse) ? Number(metric.rmse) : null,
    mape: finite(metric.mape) ? Number(metric.mape) : null,
    validationCount: finite(metric.validationCount) ? Number(metric.validationCount) : 0,
  };
}

export function buildAssistantContext({
  product,
  scope,
  unit,
  rows,
  engine,
  recommendation,
  events = [],
  farmOverride = null,
  horizon = 1,
  language = "en",
  predictedMarket = null,
  predictedFarmgate = null,
}) {
  const recentRows = (rows || []).slice(-12).map(row => ({
    period: row.periodKey || row.period,
    farmgate: finite(row.farmgate) ? Number(row.farmgate) : null,
    market: finite(row.retail) ? Number(row.retail) : null,
    observed: true,
  }));
  const relevantEvents = events
    .filter(event => event && event.status !== "resolved")
    .slice(-12)
    .map(event => ({
      title: event.title,
      category: event.category,
      description: event.description || "",
      impactPercent: event.impactPercent === "" ? null : Number(event.impactPercent),
      status: event.status,
      dates: [event.startDate, event.endDate].filter(Boolean).join(" to "),
      product: event.product,
      geography: event.geography,
    }));

  return {
    language,
    product: { name: product.name, id: product.id, unit },
    geography: scope,
    recentObservedPrices: recentRows,
    forecast: engine ? {
      horizon,
      recommendation: recommendation || null,
      predictedMarket: finite(predictedMarket) ? Number(predictedMarket) : null,
      predictedFarmgate: finite(predictedFarmgate) ? Number(predictedFarmgate) : null,
      selectedModelMetrics: compactMetric(recommendation && engine.models?.[recommendation]),
      models: Object.fromEntries(
        ["naive", "linear", "arima", "xgboost", "randomForest"]
          .map(id => [id, compactMetric(id === "naive" ? engine.naive : engine.models?.[id])]),
      ),
      assumptions: {
        farmgateOverride: finite(farmOverride) ? Number(farmOverride) : null,
        recommendationIsEngineOutput: true,
      },
    } : null,
    externalEvents: relevantEvents,
    dataRules: [
      "Prices marked as observed come from the loaded dashboard records.",
      "Forecast values are predictions from the existing forecasting engine, not observations.",
      "External-event impacts are user-entered assumptions and are not verified causal effects.",
      "Missing values are unavailable, not zero.",
    ],
  };
}
