// ManokMetrics forecasting engine.
// Every model predicts the CHANGE from the latest market price (not the price itself),
// using recent price changes at the market and at the farm. Training uses all earlier
// months (expanding window) and testing is walk-forward, so no future data is ever used.

export const MODEL_IDS = ["linear", "arima", "xgboost", "randomForest"];
export const MIN_TRAIN = 12;      // fewer samples than this -> repeat last month's price
const FIRST_ORIGIN = 3;           // first month with enough history to build features

const finite = value => Number.isFinite(value);
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

// ---- features at a forecast origin (index i of the retail-month rows) ----
// [market change last month, market change the month before, farm change x3]
export function featuresAt(rows, i, farmOverride = null) {
  const r = k => Number(rows[i - k].retail);
  const f = k => Number(rows[i - k].farmgate);
  const f0 = farmOverride !== null && finite(farmOverride) ? farmOverride : f(0);
  return [r(0) - r(1), r(1) - r(2), f0 - f(1), f(1) - f(2), f(2) - f(3)];
}

// ---- ridge regression (intercept not penalized) ----
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = c + 1; r < n; r += 1) {
      const factor = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= factor * M[c][k];
    }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = M[r][n];
    for (let k = r + 1; k < n; k += 1) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
}
function fitRidge(X, y, lambda, columns) {
  const Xc = X.map(row => [1, ...columns.map(c => row[c])]);
  const p = Xc[0].length;
  const A = Array.from({ length: p }, () => Array(p).fill(0));
  const b = Array(p).fill(0);
  Xc.forEach((row, n) => row.forEach((v, i) => { b[i] += v * y[n]; row.forEach((w, j) => { A[i][j] += v * w; }); }));
  for (let i = 1; i < p; i += 1) A[i][i] += lambda;
  const beta = solve(A, b);
  return beta ? { beta, columns } : null;
}
const predictRidge = (model, x) => model.beta[0] + model.columns.reduce((s, c, i) => s + model.beta[i + 1] * x[c], 0);

// ---- gradient boosting with depth-1 trees (stumps) ----
function bestStump(X, residual) {
  let best = null;
  for (let c = 0; c < X[0].length; c += 1) {
    const order = X.map((row, i) => i).sort((a, b) => X[a][c] - X[b][c]);
    const total = residual.reduce((s, v) => s + v, 0);
    let leftSum = 0;
    for (let k = 0; k < order.length - 1; k += 1) {
      leftSum += residual[order[k]];
      const a = X[order[k]][c], b = X[order[k + 1]][c];
      if (a === b) continue;
      const nl = k + 1, nr = order.length - nl;
      const gain = (leftSum * leftSum) / nl + ((total - leftSum) * (total - leftSum)) / nr;
      if (!best || gain > best.gain) best = { gain, c, threshold: (a + b) / 2, left: leftSum / nl, right: (total - leftSum) / nr };
    }
  }
  return best;
}
function fitBoost(X, y, rounds = 40, rate = 0.05) {
  const base = mean(y);
  const stumps = [];
  let residual = y.map(v => v - base);
  for (let r = 0; r < rounds; r += 1) {
    const stump = bestStump(X, residual);
    if (!stump) break;
    stumps.push(stump);
    residual = residual.map((v, i) => v - rate * (X[i][stump.c] <= stump.threshold ? stump.left : stump.right));
  }
  return { base, rate, stumps };
}
const predictBoost = (model, x) => model.base + model.stumps.reduce((s, st) => s + model.rate * (x[st.c] <= st.threshold ? st.left : st.right), 0);

// ---- random forest (bagged shallow regression trees) ----
function buildTree(X, y, idx, depth, maxDepth, minLeaf) {
  const value = mean(idx.map(i => y[i]));
  if (depth >= maxDepth || idx.length < 2 * minLeaf) return { value };
  let best = null;
  for (let c = 0; c < X[0].length; c += 1) {
    const order = [...idx].sort((a, b) => X[a][c] - X[b][c]);
    const total = order.reduce((s, i) => s + y[i], 0);
    let left = 0;
    for (let k = 0; k < order.length - 1; k += 1) {
      left += y[order[k]];
      const a = X[order[k]][c], b = X[order[k + 1]][c];
      const nl = k + 1, nr = order.length - nl;
      if (a === b || nl < minLeaf || nr < minLeaf) continue;
      const gain = (left * left) / nl + ((total - left) * (total - left)) / nr;
      if (!best || gain > best.gain) best = { gain, c, threshold: (a + b) / 2 };
    }
  }
  if (!best) return { value };
  const l = idx.filter(i => X[i][best.c] <= best.threshold), r = idx.filter(i => X[i][best.c] > best.threshold);
  return { c: best.c, threshold: best.threshold, left: buildTree(X, y, l, depth + 1, maxDepth, minLeaf), right: buildTree(X, y, r, depth + 1, maxDepth, minLeaf) };
}
const predictTreeNode = (node, x) => node.left ? predictTreeNode(x[node.c] <= node.threshold ? node.left : node.right, x) : node.value;
function fitForest(X, y, trees = 40) {
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const forest = [];
  for (let t = 0; t < trees; t += 1) {
    const idx = Array.from({ length: X.length }, () => Math.floor(rand() * X.length));
    forest.push(buildTree(X, y, idx, 0, 3, 5));
  }
  return { forest };
}
const predictForest = (model, x) => mean(model.forest.map(tree => predictTreeNode(tree, x)));

// ---- one model: fit on training samples, predict the change for features x ----
function fitAndPredict(modelId, X, y, x) {
  if (modelId === "arima") { const m = fitRidge(X, y, 1, [0, 1]); return m ? predictRidge(m, x) : 0; }
  if (modelId === "linear") { const m = fitRidge(X, y, 3, [0, 1, 2, 3, 4]); return m ? predictRidge(m, x) : 0; }
  if (modelId === "xgboost") return predictBoost(fitBoost(X, y), x);
  if (modelId === "randomForest") return predictForest(fitForest(X, y), x);
  return 0;
}

// training samples available when forecasting from origin i, h months ahead
function trainingSet(rows, i, h) {
  const X = [], y = [];
  for (let j = FIRST_ORIGIN; j + h <= i; j += 1) {
    const x = featuresAt(rows, j);
    const target = Number(rows[j + h].retail) - Number(rows[j].retail);
    if (x.every(finite) && finite(target)) { X.push(x); y.push(target); }
  }
  return { X, y };
}

export function forecastFromOrigin(rows, i, h, modelId, farmOverride = null) {
  const last = Number(rows[i].retail);
  if (modelId === "naive") return last;
  const { X, y } = trainingSet(rows, i, h);
  if (X.length < MIN_TRAIN) return last;
  const x = featuresAt(rows, i, farmOverride);
  if (!x.every(finite)) return last;
  const value = last + fitAndPredict(modelId, X, y, x);
  return finite(value) ? value : last;
}

function errorSummary(actuals, predictions) {
  const errors = actuals.map((a, k) => a - predictions[k]);
  const n = errors.length;
  if (!n) return { mae: null, rmse: null, mape: null, validationCount: 0 };
  return {
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map(e => e * e))),
    mape: mean(errors.map((e, k) => Math.abs(e) / (Math.abs(actuals[k]) || 1) * 100)),
    validationCount: n,
  };
}

// walk-forward test of one model at horizon h
export function validateModel(rows, h, modelId) {
  const actuals = [], predictions = [];
  for (let i = FIRST_ORIGIN; i + h < rows.length; i += 1) {
    actuals.push(Number(rows[i + h].retail));
    predictions.push(forecastFromOrigin(rows, i, h, modelId));
  }
  return errorSummary(actuals, predictions);
}

// full run: forecast + walk-forward test for all models (and the same-as-last-month baseline)
export function runForecastEngine(rows, h = 1, farmOverride = null) {
  const clean = rows.filter(row => finite(Number(row.retail)) && finite(Number(row.farmgate)));
  const empty = { models: {}, naive: null, recommendation: null, horizon: h, lastRetail: null };
  if (clean.length < FIRST_ORIGIN + 2 + h) return empty;
  const i = clean.length - 1;
  const models = {};
  MODEL_IDS.forEach(id => {
    models[id] = { forecast: forecastFromOrigin(clean, i, h, id, farmOverride), ...validateModel(clean, h, id) };
  });
  const naive = { forecast: Number(clean[i].retail), ...validateModel(clean, h, "naive") };
  const ranked = MODEL_IDS.filter(id => models[id].rmse !== null).sort((a, b) => models[a].rmse - models[b].rmse);
  return { models, naive, recommendation: ranked[0] || null, horizon: h, lastRetail: Number(clean[i].retail) };
}
