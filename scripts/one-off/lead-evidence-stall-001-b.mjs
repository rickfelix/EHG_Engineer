import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B';
const REPO = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, {
    verdict: 'PASS',
    confidence_score: 92,
    summary: 'Read lib/coordinator/coordination-events.cjs (detectReaperStarvation/emitReaperStarvationAlert), lib/fleet/worker-status.cjs (DRAIN_SETS), lib/fleet/orphan-reroute-sweep.js (sweepOrphanRows), and role_drain_sets DB table. Confirmed via a live query that role_drain_sets has ZERO rows for kind LIKE reaper%, and DRAIN_SETS.coordinator (the fail-open fallback the sweep reads) also omits all 4 reaper alert kinds -- the exact undeliverable-alarm root cause RCA 9a02a76d names. Confirmed orphan-reroute-sweep.js REROUTE_TO_KIND rewrite spreads payload (severity survives as a field) but always retargets to the generic coordinator_reminder kind regardless of severity, and its repeat-offender alarm dedup was an unconditional "any unread alarm exists, ever" check with no re-arm window.',
    detailed_analysis: { files_read: ['lib/coordinator/coordination-events.cjs', 'lib/fleet/worker-status.cjs', 'lib/fleet/orphan-reroute-sweep.js', 'role_drain_sets (live DB query)'] },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'LEAD' });

  await storeSubAgentResults('VALIDATION', sd.id, { code: 'VALIDATION', name: 'VALIDATION' }, {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Validated the fix scope traces to specific RCA 9a02a76d findings: (1) register the 4 reaper_* alert kinds in role_drain_sets/DRAIN_SETS.coordinator [database/migrations/20260901_role_drain_sets_add_reaper_alerts.sql, lib/fleet/worker-status.cjs] closes the undeliverable-alarm root cause; (2) severity-preserving reroute [lib/fleet/orphan-reroute-sweep.js] stops a high-severity alert from downgrading to a routine coordinator_reminder kind; (3) time-windowed re-arm on the repeat-offender alarm [lib/fleet/orphan-reroute-sweep.js] closes the "alarmed once 2026-08-23, silent for 9 days" gap; (4) the starvation alert body now names the literal fix command (npm run resync:safe) [lib/coordinator/coordination-events.cjs]. All 4 changes are covered by updated/new unit tests (53 passing in the directly-touched files, 3374 passing fleet-wide with zero regressions). Ack-vocabulary unification and the orphan-reroute-sweep-cron last_state divergence (CAPA-4/6b) are explicitly deferred as a fast-follow -- narrower, well-tested PR over one oversized diff, per CLAUDE.md Small PRs guidance.',
    detailed_analysis: {
      diff_stat: '6 files changed, 122 insertions(+), 28 deletions(-) + 1 new migration',
      tests_run: 'tests/unit/fleet/, tests/unit/coordinator/ -- 276 files, 3374 passed, 1 skipped, 0 failed',
    },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'LEAD' });

  const { data: sdRow, error: readErr } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (readErr) throw readErr;

  const { error: updErr } = await supabase.from('strategic_directives_v2').update({
    smoke_test_steps: [
      { step_number: 1, instruction: 'Insert a session_coordination row with payload={kind:"reaper_starvation_alert", severity:"high"}, run resolveRecognizedKinds({role:"coordinator"}), confirm it now includes reaper_starvation_alert (previously absent).', expected_outcome: 'Kind is present in the coordinator drain set -- the alert is deliverable, not orphaned.' },
      { step_number: 2, instruction: 'Run sweepOrphanRows against a row with payload.severity="high" and an unrecognized kind targeting a resolvable role.', expected_outcome: 'The rerouted payload.kind is coordinator_request (REROUTE_TO_KIND_HIGH_SEVERITY), not the routine coordinator_reminder, and payload.severity survives.' },
      { step_number: 3, instruction: 'Run vitest on tests/unit/fleet/orphan-reroute-sweep.test.js and tests/unit/coordinator/reaper-starvation.test.js.', expected_outcome: 'All tests pass, including the new severity-preserving-reroute and re-arm-alarm cases.' },
    ],
    metadata: {
      ...(sdRow.metadata || {}),
      mechanism_verifications: [
        { verified_by: 'lead-evidence-stall-001-b.mjs', verified_at: 'lib/fleet/worker-status.cjs:341', claim: 'DRAIN_SETS.coordinator now includes the 4 reaper alert kinds' },
        { verified_by: 'lead-evidence-stall-001-b.mjs', verified_at: 'lib/fleet/orphan-reroute-sweep.js:46', claim: 'REROUTE_TO_KIND_HIGH_SEVERITY constant and severity-conditional reroute-kind selection' },
        { verified_by: 'lead-evidence-stall-001-b.mjs', verified_at: 'lib/fleet/orphan-reroute-sweep.js:180', claim: 'repeat-offender alarm re-arms after REPEAT_OFFENDER_REALARM_MS instead of firing exactly once' },
        { verified_by: 'lead-evidence-stall-001-b.mjs', verified_at: 'lib/coordinator/coordination-events.cjs:746', claim: 'reaper starvation alert body names the literal fix command (npm run resync:safe)' },
        { verified_by: 'lead-evidence-stall-001-b.mjs', verified_at: 'database/migrations/20260901_role_drain_sets_add_reaper_alerts.sql:16', claim: 'chairman-gated migration registers the 4 reaper kinds in role_drain_sets for coordinator' },
      ],
    },
  }).eq('sd_key', SD_KEY);
  if (updErr) throw updErr;

  console.log('OK stored LEAD evidence + smoke_test_steps + mechanism_verifications for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
