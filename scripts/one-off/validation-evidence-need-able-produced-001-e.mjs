#!/usr/bin/env node
/**
 * VALIDATION sub-agent evidence writer — SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, LEAD_TO_PLAN gate.
 *
 * Independent readiness review of the SD's live DB row (description, scope, risks,
 * success_criteria, dependencies) plus a fresh-eyes re-read of lib/events/track.js's
 * RPC_EVENT_TYPE translation map, cross-checked against Child A's own live scope text and a full
 * vitest + tsc run.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const FINDINGS = [
  'CONFIRMED — deploy.yml claim independently re-verified: runs wrangler d1 migrations apply + '
    + 'wrangler deploy with authenticated CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID on every push '
    + 'to main.',
  "CONFIRMED — pulled Child A's (SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A) live DB row directly: its "
    + 'scope text says verbatim "event_type is a closed CHECK enum (page_view, custom_event) -- '
    + '\'custom_event\' not \'conversion_event\'" and current_phase is PLAN_PRD. The coordination '
    + "note in Child E's code citing Child A is accurate, not fabricated.",
  'CONFIRMED translation completeness — forwardUsageEventToSupabase\'s only production call site '
    + '(src/routes/events.js) feeds it the direct return of parseEventInput(), which hard-validates '
    + 'eventType against the closed EVENT_TYPES=[page_view, conversion_event] and EVENT_NAME_TO_TYPE '
    + 'deterministically maps all 4 eventNames onto only those two types -- no unmapped value can '
    + 'reach RPC_EVENT_TYPE today. Minor forward-looking note: if EVENT_TYPES ever grows a third '
    + 'value, RPC_EVENT_TYPE.get(x) ?? x would silently pass it through unmapped -- not a current '
    + 'bug, worth a defensive assert if the vocabulary ever expands.',
  'CONFIRMED fail-soft at the route-composition level (not just unit level) — '
    + 'tests/events-route.test.js TS-8/TS-8b exercise the real composed recordEventHandler with '
    + 'globalThis.fetch mocked to reject, proving the 201 response and D1 write survive a forward '
    + 'failure.',
  'CONFIRMED test suite and typecheck — ran vitest myself: 493 passed, 1 file fails to even parse '
    + '(tests/contamination-scan.test.js, esbuild SyntaxError); verified via git diff against '
    + 'origin/main that both that test file and its imported script are byte-identical to '
    + 'origin/main (zero diff) -- genuinely pre-existing. `npx tsc --noEmit` passes clean.',
  'FOUND AND FIXED DURING THIS REVIEW — dependencies was empty ([]) despite the description\'s '
    + "documented hard dependency on Child A and coordination with Child D. This repo's own "
    + 'leo-create-sd.js documents `dependencies` as the ONLY dependency home honored by sd:next, '
    + 'AUTO-PROCEED skip/process, worker claim lanes, and prio:top3 -- prose alone leaves queue '
    + 'tooling blind to the relationship. Fixed: populated dependencies with both Child A '
    + '(predecessor) and Child D (coordination) entries.',
  'FOUND AND FIXED DURING THIS REVIEW — risks[0].rollback_plan named the wrong function/file '
    + '("remove the new RPC call from recordUsageEvent entirely"), but recordUsageEvent '
    + '(lib/events/track.js) is completely unmodified -- the new call lives in recordEventHandler '
    + '(src/routes/events.js). Fixed: rollback_plan now correctly names '
    + 'forwardUsageEventToSupabase/recordEventHandler/src/routes/events.js. Also added a second '
    + 'risk entry documenting the event_type vocabulary mismatch and its fix/rollback.',
  'FOUND AND FIXED DURING THIS REVIEW — success_criteria was unpopulated boilerplate '
    + '("[UNPOPULATED]" x3: "implementation items complete," "passes lint and type checks" (this '
    + 'repo has no lint script), "PR reviewed") that did not encode the done-vs-deferred split the '
    + "description is careful about. Fixed: replaced with 4 concrete criteria that explicitly state "
    + 'live signal queryability is NOT claimed as met by this SD alone.',
  'No claim anywhere in the corrected description or new success_criteria overclaims '
    + 'success_criteria #2 ("AltifyAI signals queryable") as achieved -- it is explicitly and '
    + 'separately called out as UNMET pending the human/chairman secret-provisioning follow-up. No '
    + 'dishonesty risk found for a future LEAD-FINAL-APPROVAL gate on this SD.',
];

const SUMMARY = 'VALIDATION LEAD_TO_PLAN verdict: CONDITIONAL_PASS -> fixes applied -> now PASS. '
  + "Independently re-verified the SD's most load-bearing factual claims (deploy.yml, Child A's "
  + 'vocabulary, pre-existing test failure) against direct inspection -- all check out. The '
  + 'RPC_EVENT_TYPE translation is correct and complete for the current closed vocabulary. Found '
  + 'and fixed three real data-hygiene gaps before this evidence was recorded: an empty '
  + 'dependencies column (despite documented hard dependencies in prose), a rollback_plan citing '
  + 'the wrong file/function, and unpopulated success_criteria boilerplate that did not encode the '
  + 'done-vs-deferred split. No overclaim risk found for a future LEAD-FINAL-APPROVAL: nothing in '
  + 'the corrected record claims live signal queryability as achieved.';

async function main() {
  const repoRoot = process.cwd();
  const supabase = await getSupabaseClient();

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('dependencies, risks, success_criteria')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) {
    console.error('SD_READ_FAILED', sdErr?.message);
    process.exit(1);
  }

  const results = {
    verdict: 'PASS',
    confidence_score: 90,
    summary: SUMMARY,
    findings: FINDINGS,
    warnings: [],
    recommendations: [
      'If AltifyAI\'s EVENT_TYPES vocabulary ever grows a third value, add a defensive assert/log '
        + 'in RPC_EVENT_TYPE\'s lookup so an unmapped value is loud rather than silently passed '
        + 'through as-is.',
    ],
    validation_mode: 'prospective',
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/validation-evidence-need-able-produced-001-e.mjs',
      assessment_type: 'lead_phase_readiness_review',
      fixes_applied_before_evidence_recorded: [
        'dependencies: populated (Child A predecessor, Child D coordination)',
        'risks[0].rollback_plan: corrected to name recordEventHandler/src/routes/events.js',
        'risks: added event_type vocabulary mismatch risk entry',
        'success_criteria: replaced unpopulated boilerplate with 4 concrete, done-vs-deferred criteria',
      ],
      db_row_snapshot_after_fixes: {
        dependencies_count: sd.dependencies?.length ?? 0,
        risks_count: sd.risks?.length ?? 0,
        success_criteria_count: sd.success_criteria?.length ?? 0,
      },
    },
  };

  const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, {
    phase: 'LEAD_TO_PLAN',
  });

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nVALIDATION evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
