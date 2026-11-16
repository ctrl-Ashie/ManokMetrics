# ManokMetrics — local setup

ManokMetrics is a local dashboard for exploring Philippine poultry prices.
It ships with the supplied PSA-derived CSV files and opens with the national
monthly master records already loaded.

## Fastest way to run it

- **Windows:** double-click `start.bat`
- **Mac/Linux:** double-click `start.sh` (or run `./start.sh` in a terminal)

The first run installs dependencies automatically (takes a bit); every run
after that starts instantly. Open the local URL printed in the terminal,
usually `http://localhost:5173`.

To stop it, close the terminal window or press `Ctrl+C` in it.

## Manual way (if you'd rather run it yourself)

```bash
npm install
npm run dev
```

## No terminal at all

If you just want to open and demo the app with zero setup, use the
`ManokMetrics.html` file provided separately instead of this project. It's
a single self-contained file — double-click it and it opens straight in
your browser. The trade-off: it's a frozen snapshot, so code changes here
won't show up in it until you rebuild (`npm run build`, then re-grab
`dist/index.html`).

## Requirements
- Node.js 18 or newer (only needed for the scripted/manual ways above, not
  for the standalone HTML file)

## Notes
- The default source is `public/data/master_national_monthly.csv`. The
  other supplied CSVs are bundled there for import and future analysis.
- Data you add or import is saved to this browser on this machine. Use
  **Model Settings > Reload bundled records** to return to the supplied data.
- Farmgate means the producer price; retail means the shopper price; the
  marketing spread is retail minus farmgate. A classification band is a
  simple small/moderate/large label for that gap.
- The Analysis tab reports Spearman rank correlations for price indicators and
  one-, two-, and three-period lags. It also aligns production volume and
  inventory indicators by year when those PSA series are available. Correlation
  indicates association, not causation.
- The Classification tab trains a transparent nearest-profile classifier from
  the loaded periods, including the matching year's production-volume signal
  when available, and compares it with the configurable spread-threshold rule.
- The Forecast tab compares linear, ARIMA-style, XGBoost-style, and Random
  Forest regression baselines. Metrics use walk-forward validation; the
  recommended model has the lowest validation RMSE. Forecasts remain planning
  estimates, not promises about future prices.
- To build a static, deployable version instead of running the dev server:
  ```bash
  npm run build
  ```
  This outputs to a `dist/` folder you can host anywhere (GitHub Pages,
  Netlify, etc.), or grab `dist/index.html` on its own as a standalone file.

## Forecast engine (updated)

The Forecast page now uses `src/utils/forecast.js`. Every method predicts the **change** from the latest market price, using recent price changes at the market and at the farm. Training uses all earlier months and testing is walk-forward, so no future data is used. The app tests four methods (farm-link regression, ARIMA(2,1,0), boosted stumps, random forest) plus a "repeat last price" baseline, and uses the most accurate one for the chosen time ahead.

To re-run the accuracy test: `npm install` then `node tools/validate-forecast.mjs`.

## AI Forecast Companion

The optional ManokMetrics AI Assistant explains forecasts, observed price
trends, model metrics, and user-entered events without replacing the existing
forecasting engine. Before the first request it asks for consent and sends only
the question plus a compact dashboard summary. It never sends the full CSV and
does not store conversations remotely.

### Local development

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholders in `.env.local`:

   ```text
   AI_API_URL=YOUR_AI_API_ENDPOINT
   AI_API_KEY=YOUR_API_KEY
   AI_MODEL=YOUR_MODEL_NAME
   AI_ALLOWED_ORIGINS=http://localhost:5173
   ```

   `AI_API_KEY` is read only by the server-side Vite middleware. Never add a
   `VITE_` prefix and never put it in React code, `localStorage`, or `public/`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:5173/api/assistant` in a browser. A safe response of
   `{"enabled":true}` confirms configuration without revealing any secret.

`.env.local`, `.env`, and other local environment files are ignored by Git.
Commit `.env.example` only. If a key is ever pushed to GitHub, revoke or rotate
it immediately with the provider, remove it from the repository history, and
replace it with a new private key.

### Production deployment

The Vite development middleware is not included in a static frontend build.
Deploy the frontend and the included server together:

```bash
npm run build
npm run start:server
```

The production server in `server/index.mjs` serves `dist/` and preserves the
`/api/assistant` route. Configure `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, and
`AI_ALLOWED_ORIGINS` as private environment variables in the hosting
provider's dashboard or secret store. Do not commit `.env.local` or copy the
API key into the built HTML.

The server validates request size and questions, applies a per-address request
limit, checks allowed browser origins, uses a server-side Authorization header,
and returns sanitized provider errors. Static hosting alone cannot securely
enable the assistant; it will remain disabled unless a server-side endpoint is
deployed alongside it.
