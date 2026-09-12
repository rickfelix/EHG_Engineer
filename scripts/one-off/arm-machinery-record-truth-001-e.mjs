#!/usr/bin/env node
/**
 * INVOCATION_PATH_PROOF (G3) for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E.
 *
 * classifyMachineryClass() flags this SD machinery-class because FR-4 ships a NEW scheduled
 * GitHub Actions workflow (.github/workflows/session-liveness-ssot-exit-predicate-check.yml,
 * cron '0 10 * * *') that invokes scripts/session-liveness-ssot-exit-predicate-check.mjs
 * autonomously.
 *
 * UNLIKE the PBN-001/vision-gap-001 ARMED precedents (whose triggers were indefinitely blocked
 * behind an unapplied chairman-gated migration or an unset feature flag), this trigger is a REAL,
 * live, unblocked daily cron that WILL fire on its own -- it simply has not fired yet because the
 * workflow merged to main only minutes/hours before this LEAD-FINAL-APPROVAL attempt, and the
 * cron's next scheduled occurrence (10:00 UTC) has not yet elapsed. This is the genuinely honest
 * ARMED state the G3 amendment describes: "the trigger structurally cannot have fired yet"
 * (verified live: `gh run list --workflow=session-liveness-ssot-exit-predicate-check.yml` returned
 * zero runs at the time of this registration). Once the cron fires for real, the workflow's own
 * GHA-run stamping (the same github_actions_api liveness_source path other gha_cron:* rows use)
 * will record last_fired_at, at which point this SD's machinery transitions from ARMED to
 * (retroactively) ACTIVATED -- no further action needed here.
 *
 * expectedIntervalSeconds=86400 (daily) + workflowCron='0 10 * * *' matches the real cadence, so
 * periodic-liveness-watcher.mjs's gap-subtraction (armed-registration.js FR-1) correctly accounts
 * for the workflow's own declared gap instead of false-alarming inside it. Deliberately left
 * currently_expected_active=true (the default) -- unlike the PBN precedent, this trigger is not
 * indefinitely blocked, so it should genuinely be watched for its first real fire.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { registerArmedMachinery } from '../../lib/machinery-class/armed-registration.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E';
const supabase = await getSupabaseClient();

const result = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
  owner: 'session-liveness-ssot-exit-predicate-check',
  expectedIntervalSeconds: 86400,
  workflowCron: '0 10 * * *',
  activationTrigger:
    'First scheduled run of .github/workflows/session-liveness-ssot-exit-predicate-check.yml ' +
    '(cron 0 10 * * *, GitHub Actions), invoking scripts/session-liveness-ssot-exit-predicate-check.mjs. ' +
    'Verified live 2026-09-05: `gh run list --workflow=session-liveness-ssot-exit-predicate-check.yml` ' +
    'returned zero runs -- the workflow merged to main only hours before this registration, and the ' +
    'cron\'s next scheduled occurrence has not yet elapsed. Not blocked by anything else; will fire on ' +
    'its own daily schedule and self-transition to ACTIVATED via the standard github_actions_api ' +
    'liveness-stamping path once it does.',
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
console.log(`workflow_cron=${data.liveness_source_ref?.workflow_cron}`);
console.log(`activation_trigger=${(data.liveness_source_ref?.activation_trigger ?? 'ABSENT').slice(0, 160)}…`);
