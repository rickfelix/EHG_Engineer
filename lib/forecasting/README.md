# Forecast Ledger org-service

SD-LEO-FEAT-FORECAST-LEDGER-001 — a general-purpose, immutable ledger of **pre-registered
probabilistic forecasts**, Brier-scored on resolution, attached as **advisory-weight** evidence to
the venture kill-gates.

## Modules
- `brier.js` — pure, shared Brier math (`brierScore`, `round3`, `meanBrier`, `interpretBrier`). The
  **canonical extraction** of the formula that was inline in `lib/eva/experiments/baseline-accuracy.js`
  (`analyzeAccuracy`) and `lib/agents/venture-ceo/truth-layer.js` (`_computeCalibrationDelta`). Reuse,
  do not reimplement. `brierScore` returns the RAW `(clamp01(p)-outcome)²` — callers round with
  `round3` (float hazard: `(0.7-1)² = 0.09000000000000002`).
- `ledger.js` — `register` / `resolve` / `calibration`. Injected supabase client (`deps.supabase`);
  **fail-soft** when the table is absent (`tableAbsent()`), mirroring `sms-bridge` drain semantics.
- `gate-attach.js` — READ-ONLY advisory attach to S3/S5/S16 briefs. `buildGateBrief()` passes the
  gate verdict through untouched via `structuredClone` — CONST-001: a forecast can never flip a verdict.

CLI: `scripts/forecast-ledger.js register|resolve|calibration`.
Table: `database/migrations/20260719_forecast_ledger_STAGED.sql` (RLS-at-create + sealed-immutability
trigger; **chairman-gated apply** — `STAGED`, not auto-applied).

## Boundary vs existing prediction infrastructure (FR-8)
This ledger is a NEW, general-purpose org-service — NOT a duplicate. It **references, does not fork**:
- `agent_predictions` (`20260712_agent_predictions.sql`) — **agent-scoped** (`agent_id`, `was_correct`),
  no horizon/resolution-criteria/model/stored-Brier, not immutable. Different contract.
- `stage_of_death_predictions`, `build_completion_forecast_log` — domain-specific, non-overlapping; left alone.
`truth-layer.js` `computeCalibration()` (formerly a dead `const predictions=[]` stub) now reads this
ledger via `brier.js`.

## Semantics
- **Sealed pre-registration**: once registered, a forecast's fields are immutable (service layer + DB
  update-guard trigger); resolution stamps outcome + provenance and is one-shot (no re-resolve).
- **Advisory weight only**: calibration (Brier by `question_class`) is a chairman-visible read;
  graduation to any higher weight is never automatic.
