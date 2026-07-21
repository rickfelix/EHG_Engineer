# Chairman Daily Brief — End-to-End Wiring

- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001
- **Last Updated**: 2026-07-21
- **Tags**: chairman, daily-brief, cron, forecast, gantt, mms

## Overview

The chairman's 6AM daily brief is composed from three previously-independent pieces built
by the `SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001` family (children A/B/D) and wired
together end-to-end by `SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001`:

1. **Content**: `lib/chairman/daily-review/roadmap-status-doc.js` — `buildRoadmapStatusDoc()`
2. **Image**: `lib/chairman/daily-review/gantt-renderer.js` — `renderGanttPng()`
3. **Delivery**: `lib/chairman/sms-bridge.js` — `enqueueChairmanSms()`

Prior to the wiring SD, children A/B/D were each individually complete and tested, but the
live production cron (`scripts/cron/chairman-morning-review-sweep.mjs`) never invoked them —
a "shipped but not wired" gap.

## Forecast: gantt_rule_LEGC (Solomon-calibrated)

The daily brief's forecast dates replace a discredited raw-velocity calculation (a single
average completions/day number, applied uniformly regardless of whether an item is actually
dispatchable or blocked on the chairman) with a calibrated model read from Solomon's
`feedback` table row (`category='solomon_forecast_basis'`):

- **Read contract**: `lib/chairman/daily-review/forecast-basis-reader.js` —
  `readForecastBasis(supabase)`. Reads the MOST RECENT matching row and returns its nested
  `metadata.forecast_basis` object. The basis stamps its live snapshot under a
  **date-stamped key** (`current_state_<YYYYMMDD>`) — `resolveCurrentState()` resolves the
  most-recent such key dynamically; never hardcode a specific date.
- **Segregation rule**: `computeForecastRange()` in `roadmap-status-doc.js` applies
  `date = queue_wait[dispatch_class] + work_time[tier]`, using the class's own median/p90
  spread for optimistic/pessimistic bounds (not an arbitrary +-20%).
- **Fail-closed (mandatory invariant)**: the classifier NEVER fabricates a date under
  uncertainty. It returns `confidence: 'insufficient_data'` (no dates) whenever: the basis is
  missing/degraded, the dominant dispatch class cannot be resolved with `dispatchable STRICTLY
  > gated` (a tie counts as unresolved), or any calibration input is non-finite, negative, or
  has an inverted percentile (`p90 < median`). A wrong "dispatchable" date on a chairman-gated
  item is strictly worse than no date at all — it looks authoritative when it is not.

## Composer wiring and activation

`scripts/cron/chairman-morning-review-sweep.mjs` exports `buildComposedBody()`, which chains
`buildRoadmapStatusDoc` → `renderGanttPng` → `uploadPrivateAndSign` → returns `{body, mediaUrl}`
for `enqueueChairmanSms`. This path is gated behind an env flag,
**`DAILY_BRIEF_COMPOSED_ENABLED`**, read per-invocation (never at module load) so the OFF path
stays byte-identical to the original text-only composer at all times.

**The flag alone is not enough** — it must also be exported in the GHA workflow env block
(`.github/workflows/chairman-morning-review-cron.yml`). A code-complete, fully-tested composer
whose activating env var was never added to the workflow is a "shipped but not activated" gap
— distinct from, and just as silent as, the earlier "shipped but not wired" gap. Both are real
recurring failure classes for this kind of feature-flagged live-cron change; verify BOTH the
code path AND the deployment/workflow activation before considering a flagged rollout done.

Composed body length uses `COMPOSED_BODY_CEILING` (MMS-sized, ~1500 chars, word-boundary
truncation), not the older `BODY_CEILING` (~306 chars, sized for the original 2-segment SMS
summary) — reusing the SMS-sized ceiling for MMS content silently truncates the forecast and
narrative sections away under a realistic multi-wave roadmap.

## Delivery: quiet-hours and idempotency

The composed brief sends via the SAME direct `enqueueChairmanSms(supabase, {..., notBefore:
et6amIso(now)})` pattern the pre-existing text-only path already used — it deliberately never
routes through `lib/comms/adam-outbound/chairman-sms-gate/index.js`, which is a *different*,
unrelated quiet-hours implementation confirmed to `console.warn`-drop a blocked send instead of
durably deferring it (a distinct, known harness defect — not fixed by this SD, out of scope).

The composed and text-only (and any fallback-on-composer-failure) paths all share the exact
same idempotency key (`morning_review:<ET-date>`), backed by a real DB unique constraint on
`sms_outbound_obligations.dedupe_key` — this prevents a double-send if a partial media failure
falls back to text-only after a media row was already attempted.

## Google Drive doc-link (explicitly out of scope)

The brief's Drive-doc-link leg is owned by the separate, still-unbuilt sibling
`SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-C`, gated on chairman-provisioned Drive
service-account credentials (none exist in this environment). The composed brief omits the
Drive link gracefully until that SD ships — this is a documented scope decision, not an
oversight.

## Cross-References

- `docs/reference/database-agent-patterns.md`
- Retrospective: `SD-LEO-INFRA-DAILY-BRIEF-E2E-WIRING-001` (`retrospectives` table)
