# Sync-leg hard failures must FAIL LOUD — durable signal on errors>=1, never a bare log line

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Solomon-proposed 2026-07-17 (distill hand-off addendum, Adam-discretion — NOT chairman-ratified; capture .prd-payloads/CAPTURE-SOLOMON-DISTILL-INTEGRATION-SEAMS.md). Distill/EVA sync legs fail QUIET: the YouTube ingest leg ran with a `deleted_client` OAuth error for ~a MONTH (client deleted in Google Cloud ~07-09 restructuring; newest YouTube row 06-19) and nothing surfaced it — it only came to light via a live distill run inspection. A month of silent staleness on a data leg that feeds the distill pipeline is the "silent-failure ships stale gauges" class.

## Functional Requirements
### FR-1: Enumerate sync legs + their error handling
Identify the sync/ingest legs (YouTube and siblings) and how each currently handles a hard failure (auth error, deleted client, non-2xx). Confirm which ones swallow the error into a log line with no durable signal.
### FR-2: Loud durable signal on errors>=1
Any sync leg with errors>=1 emits a LOUD, DURABLE signal — a `feedback` row (harness_backlog or a sync-health category) and/or an Adam advisory — never just a `console.log`. Include leg name, error class, last-successful-row age. Debounce so a persistently-broken leg signals on state-change + a periodic reminder, not every run.
### FR-3: Staleness watchdog
Add a "newest row for leg X older than N days" check that fires the same durable signal, so a leg that silently stops (not just errors) is caught by staleness even if it throws nothing.
### FR-4: Test
Test: a simulated leg error and a simulated staleness both produce a durable signal row; a healthy leg produces none.

## Success Metrics
- metric: sync-leg hard failures with no durable signal; target: 0
- metric: max silent-staleness window on a feeding leg; target: <= N days (watchdog bound), not a month
- metric: healthy-leg false signals; target: 0 (debounced)

## Smoke Test Steps
1. instruction: Point a sync leg at a deleted/invalid credential and run it; expected_outcome: a durable feedback/advisory signal is written, not just a log line.
2. instruction: Age a leg's newest row past the watchdog threshold; expected_outcome: staleness signal fires once (debounced).

## Sizing / Notes
Tier 2 QF. Adam-discretion source (Solomon-proposed, chairman NOT-yet-ratified — flagged so the coordinator/chairman can deprioritize if desired). Timely: chairman is repairing the YouTube OAuth now (scripts/eva-youtube-auth.js), so a fail-loud guard prevents the next silent month. Relates the controlled-mode-needs-durable-signal + gauge-integrity doctrines.
