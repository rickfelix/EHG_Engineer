import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id, functional_requirements, technical_requirements, acceptance_criteria, test_scenarios')
  .eq('directive_id', 'SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

// Fix 1 (BLOCK): TR-1 contradicts FR-5's new one-off script.
const technical_requirements = prd.technical_requirements.map((tr) =>
  tr.id === 'TR-1'
    ? { ...tr, description: tr.description.replace(
        'all fixes extend existing functions/files (release-oracle-hold.js, hold-writer.js, batch-mint-sweep.mjs\'s existing tick, existing test files) -- no new script, cron entry, or table is introduced.',
        'all fixes extend existing functions/files (release-oracle-hold.js, hold-writer.js, batch-mint-sweep.mjs\'s existing tick, existing test files) -- the ONE exception is FR-5\'s new one-off backfill script (scripts/one-off/backfill-terminal-oracle-hold-markers.mjs), a standard one-time-use pattern already established elsewhere in this repo (e.g. scripts/backfill-session-liveness-ssot-is-alive.mjs). No new cron entry, daemon, or table is introduced.'
      ) }
    : tr
);

const functional_requirements = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      description: fr.description + ' Reply eligibility (resolving the plan-critique gap on tie-breaking/verdict-value ambiguity): a matching reply is any session_coordination row with message_type=\'coordinator_reply\' (the repo\'s existing reply convention, scripts/worker-signal.cjs:296) whose payload.reply_to OR payload.correlation_id equals the held consult row\'s correlation_id -- the review having HAPPENED is what releases the hold, not any particular verdict content (the original complaint was that the outcome is identical whether a review happened or not; this fix makes the review\'s OCCURRENCE, not its content, the gate). When multiple matching replies exist, the EARLIEST by created_at satisfies the requirement (the first review discharges the obligation).',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'Only rows with message_type=\'coordinator_reply\' and a matching reply_to/correlation_id count as a satisfying reply -- an unrelated row sharing the same id by coincidence does not',
        'When two matching replies exist, the earliest by created_at is the one cited in the release provenance',
      ],
    };
  }
  if (fr.id === 'FR-2') {
    return {
      ...fr,
      description: fr.description.replace(
        "register 'oracle_read_pending_consult' as a recognized kind for the solomon role (role_drain_sets DB row and/or the DRAIN_SETS JS floor -- determine during EXEC which is the actual enforcement point read by the inbox/orphan-catcher, per the chairman's 'one registry row' framing, and touch only that one).",
        "register 'oracle_read_pending_consult' as a recognized kind for the solomon role via exactly ONE new role_drain_sets row (role='solomon', kind='oracle_read_pending_consult', status='active', direction='inbound') -- resolved during LEAD due-diligence: lib/fleet/drain-set-registry.js's resolveRecognizedKinds() already unions the role_drain_sets table with the hard-coded DRAIN_SETS floor in worker-status.cjs, so a single DB row is sufficient and the JS floor must NOT be touched (matches the chairman's literal 'one registry row' framing)."
      ),
    };
  }
  if (fr.id === 'FR-6') {
    return {
      ...fr,
      description: fr.description + ' Environment (resolving the plan-critique gap): this is a PRODUCTION-residue check, not a fixture/ephemeral-DB assertion -- it follows the existing repo pattern of scripts/session-liveness-ssot-exit-predicate-check.mjs (a standalone script invoked in CI via the existing service-role secret, guarded by a population canary so a silently-scoped-down credential cannot report a false "0 violations"), not a unit test against a mocked/seeded DB.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'The zero-orphaned-marker script includes a population canary (asserts it queried a non-trivially-sized population) mirroring session-liveness-ssot-exit-predicate-check.mjs, so a wrongly-scoped credential cannot silently report a false pass',
      ],
    };
  }
  if (fr.id === 'FR-5') {
    return {
      ...fr,
      description: fr.description + ' Selection predicate (resolving the plan-critique gap on targeting precision): status IN (\'completed\',\'closed\') AND owner=\'chairman\' AND release_condition LIKE \'[oracle_read_pending]%\' (the exact QF_ORACLE_HOLD_PREFIX from lib/fleet/hold-writer.js) -- no other terminal-QF residue class is touched. The script supports --dry-run (default), printing the exact candidate row ids/current state with zero mutation, and requires an explicit --execute flag to actually clear the marker.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'Running the script with no flags (or --dry-run) prints the exact candidate set and mutates nothing',
        'Only rows matching status IN (completed,closed) AND owner=chairman AND release_condition LIKE \'[oracle_read_pending]%\' are ever selected as candidates',
      ],
    };
  }
  return fr;
});

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements })
  .eq('id', prd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('PRD updated: TR-1 contradiction fixed, FR-2/FR-3/FR-5/FR-6 plan-critique gaps closed.');
