# ManokMetrics Copilot Guide

## Project shape
- This is a Vite + React single-page app.
- The main UI and styles are in `src/App.jsx`; the entry point is `src/main.jsx`.
- CSV files used by the app live in `public/data/` and are fetched at runtime from `/data/...`.
- Keep the existing tabs and visual language unless a change explicitly asks for a redesign.

## Data rules
- The app consumes normalized rows shaped like `{ id, period, farmgate, retail }`.
- Keep parsing in `normalizeCsvRows` so bundled and user-imported files behave consistently.
- Treat blank values and PSA markers such as `..`, `.`, and `...` as missing, never as zero.
- The default dashboard source is `public/data/master_national_monthly.csv`.
- The selected master columns represent national broiler farmgate household price and national fully dressed broiler retail price. Do not silently mix regions or commodities.
- Do not claim that the marketing spread is profit; it is only retail minus farmgate.

## Product language
- Use plain explanations beside statistics. Define farmgate price as the producer price, retail price as the shopper price, and spread as their difference.
- Avoid visible wording such as placeholder, sample data, incomplete, scaffold, or to-be-replaced in user-facing copy.
- Be honest when a forecast is a transparent baseline rather than a trained production model.
- Preserve the distinction between observed data and estimates.

## Implementation guidance
- Prefer the existing React state and localStorage patterns before introducing new state libraries.
- Keep dependencies small and avoid adding a backend for local CSV exploration.
- Preserve responsive behavior for the mobile navigation and tables.
- Use accessible labels, button names, and keyboard-friendly controls.
- Use ASCII in source files unless the existing UI or domain data requires otherwise.

## Validation
- Run `npm.cmd run build` on Windows after code changes.
- When changing data parsing, test both the wide master CSV fields and the simple `period,farmgate,retail` format.
- Do not commit generated `dist/` output unless explicitly requested.
