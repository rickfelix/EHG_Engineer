'use strict';
/**
 * QF-20260725-342 — the ONE source of truth for the Solomon ledger-pending resurface threshold.
 *
 * THE BUG THIS FIXES: the 72h threshold shipped (QF-20260725-743) scoped to the GitHub Actions
 * cron ONLY. There are THREE invocation sites and only one passed the flag:
 *   1. .github/workflows/solomon-ledger-resurface-cron.yml  --threshold-hours 72   CORRECT
 *   2. scripts/coordinator-quiet-tick.mjs                   no flag -> 24h default
 *   3. scripts/coordinator-startup-check.mjs                no flag -> 24h default
 * Proven at runtime, not inferred: 34 resurface rows landed in a single batch at 20:35 on
 * 2026-07-25. The GHA cron fires at :13 and :43, so 20:35 was the coordinator tick — and with
 * the oldest pending ledger row at 34.8h, a 72h threshold has a crossing set of ZERO. Those 34
 * rows are positive proof the 24h default was still live on that path.
 *
 * WHY A SHARED CONSTANT RATHER THAN ADDING THE FLAG TWICE: adding the flag at each site is the
 * same shape as the defect — the next threshold change would again have to find all three call
 * sites and would again miss some. This module makes "the operating threshold" a single value
 * every JS invoker imports. The GHA workflow cannot import JS, so it keeps a literal, and
 * tests/unit/coordination/resurface-threshold.test.js pins that literal to this constant so the
 * two cannot drift silently.
 *
 * SAME CLASS AS QF-20260725-141: a corrected value that reaches one consumer and leaves the
 * others on the old path. Verifying at the merge is not verifying at the consumer, and verifying
 * ONE consumer is not verifying ALL of them.
 *
 * NOTE ON THE VALUE: 72 is a MITIGATION, not the end state — it was chosen to sit just under the
 * measured p75 disposition latency (77.2h) so the signal fires on the genuine tail. Once
 * SD-LEO-INFRA-RESURFACE-DIGEST-BATCHING-001's digest batching is confirmed live, this can
 * return to a latency-grounded value; changing it HERE now reaches every JS invoker at once.
 *
 * @module lib/coordination/resurface-threshold
 */

/** Hours a solomon_advice_outcome_ledger row must sit at decision='pending' before it resurfaces. */
const OPERATING_THRESHOLD_HOURS = 72;

/** CLI args form, so an invoker cannot pass the value in a subtly different shape. */
function thresholdArgs() {
  return ['--threshold-hours', String(OPERATING_THRESHOLD_HOURS)];
}

module.exports = { OPERATING_THRESHOLD_HOURS, thresholdArgs };
