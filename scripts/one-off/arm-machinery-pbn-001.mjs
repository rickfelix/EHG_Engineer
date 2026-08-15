#!/usr/bin/env node
/**
 * INVOCATION_PATH_PROOF (G3) for SD-LEO-FEAT-PROVEN-BETTER-NEW-001.
 *
 * classifyMachineryClass() correctly flags this SD machinery-class (kind='hook', matched
 * phrase "validation gate" in the title) -- and RCA (this session) traced the REAL reason it
 * belongs there: runPbnGate() is reached not just synchronously from persistVentureBrief(),
 * but transitively from two autonomous producers -- config/workers.json's stage-zero-processor
 * (30s poll) and .github/workflows/nursery-reeval-cron.yml (cron, every 6 hours at :17). This IS
 * "event-processing machinery", not a bare synchronous function call.
 *
 * ACTIVATED evidence is genuinely unavailable, not merely inconvenient -- every fact below was
 * measured live this session (2026-08-15), not asserted:
 *   - venture_nursery.pbn_verdict is ABSENT from the live catalog (17 columns, no pbn_verdict).
 *     The migration that adds it (database/migrations/20260815_venture_nursery_pbn_verdict.sql)
 *     is CHAIRMAN-GATED with an intentionally-blank @approved-by header the file itself forbids
 *     filling in on the SD's behalf.
 *   - nursery_evaluation_log has 0 rows.
 *   - 0 of 16 venture_nursery rows carry a non-null next_evaluation_at, so the re-eval
 *     due-candidate predicate selects nothing.
 *   - stage_zero_requests holds 4 rows, all status=dismissed, newest 2026-05-31.
 *   - vars.NURSERY_REEVAL_ENABLED is unset, so the 6-hourly cron never actually runs its body.
 * No real event can be manufactured without applying the chairman-gated migration this SD
 * explicitly defers -- manufacturing one would mean fabricating evidence.
 *
 * ARMED is the honest state: built, tested (180/180), merged (PR #7042, deep-tier adversarially
 * reviewed), inert until the migration is chairman-approved and the queue has real work. Uses
 * the canonical writer (registerArmedMachinery), modeled on the precedent script
 * scripts/one-off/_arm-machinery-codify-honest-activation.mjs (SD-LEO-FEAT-CODIFY-HONEST-
 * ACTIVATION-001, same kind='gate'/free_text_match shape, ARMED, zero bypass).
 *
 * expectedIntervalSeconds is set to 30 days, NOT the 86400s (1-day) default: RCA measured that
 * all 3 existing never-fired ARMED rows in this registry are already OVERDUE false alarms
 * (6.6d/6.7d/8.2d against a 2-day grace-multiplied threshold) because the default cadence was
 * tuned for hourly/daily processes, not "ships ahead of its producer, pending a chairman-gated
 * migration" SDs. A 30-day cadence honestly says "if this is still inert after two months
 * (grace_multiplier=2), surface it" instead of manufacturing a guaranteed false alarm in 48h.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { registerArmedMachinery } from '../../lib/machinery-class/armed-registration.js';

const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001';
const supabase = await getSupabaseClient();

const result = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
  owner: 'pbn-gate-nursery-stage0',
  expectedIntervalSeconds: 2592000, // 30 days
  activationTrigger:
    'First runPbnGate() invocation reaching persistence via chairman-review.js:persistVentureBrief, ' +
    'reached transitively from either config/workers.json\'s stage-zero-processor (30s poll of ' +
    'stage_zero_requests) or .github/workflows/nursery-reeval-cron.yml (cron 17 */6 * * *), AFTER ' +
    'the chairman-gated migration database/migrations/20260815_venture_nursery_pbn_verdict.sql is ' +
    'approved and applied (its @approved-by header is intentionally blank and the file forbids ' +
    'filling it in on the SD\'s behalf). Measured live 2026-08-15: venture_nursery.pbn_verdict is ' +
    'ABSENT from the live catalog (17 columns); nursery_evaluation_log has 0 rows; 0 of 16 ' +
    'venture_nursery rows carry a non-null next_evaluation_at so the re-eval due-candidate ' +
    'predicate selects nothing; stage_zero_requests holds 4 rows all status=dismissed (newest ' +
    '2026-05-31); vars.NURSERY_REEVAL_ENABLED is unset so the 6-hourly cron never runs its body. ' +
    'No real event can be manufactured without applying the migration this SD explicitly defers ' +
    'to the chairman.',
});

console.log('registerArmedMachinery ->', JSON.stringify(result));
if (!result?.ok) { console.error('ARMED REGISTRATION FAILED'); process.exit(1); }

// Readback -- persistence is not the return value.
const { data, error } = await supabase
  .from('periodic_process_registry')
  .select('process_key, display_name, owner, liveness_source, liveness_source_ref, currently_expected_active, expected_interval_seconds, grace_multiplier')
  .eq('process_key', result.processKey)
  .maybeSingle();
if (error) { console.error('READBACK FAILED:', error.message); process.exit(1); }
if (!data) { console.error('READBACK FOUND NO ROW — registration did not persist.'); process.exit(1); }
console.log(`process_key=${data.process_key} owner=${data.owner} active=${data.currently_expected_active}`);
console.log(`expected_interval_seconds=${data.expected_interval_seconds} grace_multiplier=${data.grace_multiplier}`);
console.log(`sd_key=${data.liveness_source_ref?.sd_key} armed_at=${data.liveness_source_ref?.armed_at}`);
console.log(`activation_trigger=${(data.liveness_source_ref?.activation_trigger ?? 'ABSENT').slice(0, 160)}…`);
