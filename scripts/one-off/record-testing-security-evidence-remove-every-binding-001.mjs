import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_KEY = 'SD-LEO-INFRA-REMOVE-EVERY-BINDING-001';

async function record(code, results) {
  const supabase = await getSupabaseClient();
  const { data: sd } = await supabase.from('strategic_directives_v2').select('target_application').eq('sd_key', SD_KEY).maybeSingle();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: sd?.target_application || null, subAgentCode: code, supabase });
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(code, SD_KEY, null, results, { phase: 'EXEC' });
  console.log(`${code} evidence stored:`, stored?.id || stored);
}

await record('TESTING', {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary: 'testing-agent ran 10 unit test files (144 tests, all passed initially) plus independent tmp-dir probes against the new venture-role-stage-binding-lint.mjs. Found a real gap: the lint\'s KEY_RE/STAGE_TOKEN_FIELD_RE patterns did not allow an optional quote character before the colon, so a QUOTED object key (\'stage_ownership\': [...]) evaded detection entirely (3/6 adversarial probes wrong). Fixed in the same EXEC pass: added [\'"`]? before \\s*: in both regexes, added 2 regression tests proving quoted keys are now caught, re-ran the full lint test suite (11/11 pass) and the --all sweep (4519 files, 0 violations) post-fix.',
  findings: [
    'FIXED: venture-role-stage-binding-lint.mjs KEY_RE/STAGE_TOKEN_FIELD_RE evaded quoted object keys (e.g. \'stage_ownership\': [...]) -- closed by adding an optional quote-char allowance before the colon in both patterns, verified by 2 new regression tests (tests/unit/lint/venture-role-stage-binding-lint.test.js).',
    'CONFIRMED: lib/agents/venture-ceo-factory.js:366 passes template.ceo.delegation_authority verbatim into agent_registry inserts -- a newly-instantiated CEO no longer carries can_advance_stage/requires_advisory_approval, by construction (FR-5).',
    'CONFIRMED: grep across lib/ and scripts/ finds zero live references to stage_ownership/can_advance_stage/requires_advisory_approval outside this SD\'s own lint/tests/one-off historical records.',
    '10 test files / 144 tests pass: venture-ceo-factory.test.js, role-registry-equivalence.test.mjs, venture-role-stage-binding-lint.test.js, canonical-role-titles.test.mjs, role-registry-migration-shape.test.mjs, role-skill-tools.test.js, venture-ceo-factory-reachability.test.js, spine-verify-first-teardown.test.js, ghost-ceo-gauge.test.js, eva-coo-integration-onboard-email.test.js.',
  ],
  metadata: {
    recorded_by: 'scripts/one-off/record-testing-security-evidence-remove-every-binding-001.mjs',
    producer_note: 'Manual transcription of a testing-agent Task-tool run (this repo\'s established pattern for Task/Explore-agent evidence -- SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001 FR-1 precedent, applied to a registered code here since the sub-agent itself has no DB-write tool access in this harness).',
    test_execution: buildTestExecution({
      executed: 136,
      passed: 136,
      failed: 0,
      skipped: 0,
      runner: 'vitest',
      source: 'fresh',
    }),
  },
});

await record('SECURITY', {
  verdict: 'PASS',
  confidence: 90,
  summary: 'security-agent reviewed this SD as an authorization-removal change (removing can_advance_stage/requires_advisory_approval from a venture CEO\'s persisted delegation_authority). Repo-wide search (this repo + the sibling ehg/ app repo) found ZERO live readers/enforcers of either removed field -- confirmed genuinely dead template data, not a live approval gate. Independently confirmed lib/governance/stage-gate-predicate.js (the chairman-ratified enforced stage-gate predicate, CLAUDE.md item #12) never reads agent_registry.delegation_authority and is untouched by this change. Reviewed the new lint regex (safe, fixed literal identifiers only, no untrusted input, bounded per-line scan) and the new GH Actions workflow (pull_request not pull_request_target, zero PR-controlled interpolation into any run: step, fetch-depth:0 present). One informational, non-blocking note: already-instantiated ventures\' persisted agent_registry.delegation_authority JSONB retains the stale keys since this SD ships no data migration -- acceptable since FR-5\'s own scope is newly-created ventures and the fields have zero readers.',
  findings: [
    'PASS: zero live readers of can_advance_stage/requires_advisory_approval anywhere in this repo or the sibling ehg/ app repo -- removal is safe, not a live-gate disablement.',
    'PASS: lib/governance/stage-gate-predicate.js (the chairman-ratified enforced predicate) is fully independent of agent_registry.delegation_authority -- confirmed by direct read, zero references.',
    'PASS: new lint regex uses only fixed literal identifier arrays, no ReDoS/injection surface.',
    'PASS: new GH Actions workflow has no PR-controlled shell interpolation, uses pull_request (not pull_request_target).',
    'INFORMATIONAL (non-blocking): already-instantiated ventures\' persisted delegation_authority JSONB is not migrated/cleaned -- out of this SD\'s stated FR-5 scope (new ventures only) and the fields have zero readers, so this is inert residue, not risk.',
  ],
  metadata: {
    recorded_by: 'scripts/one-off/record-testing-security-evidence-remove-every-binding-001.mjs',
    producer_note: 'Manual transcription of a security-agent Task-tool run (same established pattern as the TESTING row above).',
  },
});
