#!/usr/bin/env node
/**
 * SECURITY sub-agent evidence writer — SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E, EXEC_TO_PLAN gate.
 *
 * Independent security review of the committed diff in the isolated altifyai worktree
 * (git diff origin/main -- lib/events/track.js src/routes/events.js tests/events-forward.test.js
 * tests/events-route.test.js docs/usage-event-ingest-secret-provisioning.md, 519 lines, exactly
 * these 5 files touched).
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const FINDINGS = [
  'PASS — secrets never logged. Both new console.warn call sites in src/routes/events.js log only '
    + "the typed {ok,status,reason} return object (never env values) and {name,message} from a "
    + 'caught exception.',
  'PASS — no injection/spoofing path. parseEventInput returns a fresh literal of only '
    + '{eventType, eventName, properties} built from fixed enums and an allowlisted properties Map -- '
    + 'no request-body field reaches p_venture_id/p_ingest_secret, both read exclusively from env. '
    + "Independently proven by the diff's own test (\"a forged venture_id/ventureId on the input has "
    + 'ZERO effect").',
  'PASS — no SSRF. Outbound URL is always built from env.EHG_ENGINEER_SUPABASE_URL, never '
    + 'influenced by caller input.',
  'PASS — no undisclosed outbound capability. Grepped the diff for fetch(|http:|https:|smtp|webhook|'
    + 'child_process|eval(|exec(|require( -- only the one new fetchImpl(...) call site plus test '
    + 'mocks/harness invocations. The branch touches exactly 5 files (confirmed via git diff '
    + 'origin/main --stat), so no other new code path exists.',
  "PASS — test fixtures ('anon-key', 'venture-ingest-secret', 'https://example.supabase.co', a "
    + 'random UUID) are obvious placeholders, none resembling real Supabase JWTs/keys.',
  "PASS — cross-checked against lib/feedback/submit.js's forwardFeedbackToSupabase (the sibling "
    + 'this SD mirrors): the env-sourced venture_id/ingest-secret-in-POST-body pattern is '
    + 'pre-existing and already shipped elsewhere, not a novel risk this diff introduces.',
];

const SUMMARY = 'SECURITY EXEC_TO_PLAN verdict: PASS. Independently reviewed the actual committed '
  + 'diff (519 lines across exactly 5 files). No secret exposure, no spoofing vector (venture_id/'
  + 'ingest-secret are structurally unreachable from request-body input), no SSRF, no undisclosed '
  + 'outbound capability, and no fake-real-looking credentials in test fixtures. The env-sourced-'
  + 'secret pattern mirrors an already-shipped sibling (forwardFeedbackToSupabase), not a new trust '
  + 'model. No findings requiring remediation.';

async function main() {
  const supabase = await getSupabaseClient();

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: [],
    validation_mode: 'retrospective',
    metadata: {
      recorded_by: 'scripts/one-off/security-evidence-need-able-produced-001-e-exec-to-plan.mjs',
      assessment_type: 'exec_to_plan_security_review',
      investigation_target_repo: 'altifyai (sibling repo, isolated worktree)',
      target_branch: 'feat/SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E',
      files_reviewed_diff: [
        'lib/events/track.js',
        'src/routes/events.js',
        'tests/events-forward.test.js',
        'tests/events-route.test.js',
        'docs/usage-event-ingest-secret-provisioning.md',
      ],
      checks_performed: {
        secret_exposure: 'PASS',
        request_body_spoofing: 'PASS',
        ssrf: 'PASS',
        undisclosed_outbound_capability: 'PASS',
        test_fixture_hygiene: 'PASS',
      },
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, {
    phase: 'EXEC_TO_PLAN',
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

  console.log('\nSECURITY evidence recorded and read back:');
  console.log(JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
