#!/usr/bin/env node
/**
 * Persist the RESUMED testing-agent's final EXEC-phase verification (agentId af80758799dba530b,
 * resumed as a86f87484ea5c0800) for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001. The first run
 * (evidence a21cc030-de9a-4bce-8d2e-befe58c125d4) auto-persisted a FAIL verdict after finding a
 * genuine BLOCKING regression in the FR-3 fix; that regression was fixed (commit 62aaaa26bfc,
 * PR #7339), and the SAME agent was resumed to independently re-verify -- it read the diffs itself,
 * ran its OWN fresh mutation tests (not trusting the summary), and confirmed all 5 findings
 * (1 BLOCKING, 2 HIGH, 1 nit, 1 low/documentation) genuinely fixed with no collateral damage.
 * This second pass did not auto-persist, so it is stored manually here (source: 'manual'), matching
 * the pattern already used for LEAD/PLAN-phase Explore/VALIDATION evidence earlier in this SD.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001';
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, target_application').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr || !sd) { console.error('SD lookup failed', sdErr); process.exit(1); }

const results = {
  verdict: 'PASS',
  confidence: 95,
  status: 'completed',
  summary: 'RE-VERIFICATION pass (resumed same agent, af80758799dba530b -> a86f87484ea5c0800) after the prior FAIL (evidence a21cc030) findings were fixed. Read every diff directly, cross-checked the real production functions the tests claim to exercise, and ran independent mutation tests against commit 62aaaa26bfc -- reverting one fix at a time, confirming the exact expected test(s) go red, then restoring and reconfirming green -- rather than trusting the fix summary. All 5 findings from the prior FAIL confirmed genuinely fixed with clean isolation (no collateral bleed between fixes). Also independently confirmed PR #7339 CI is green (45/45 checks passing). Verdict: proceed to EXEC-TO-PLAN handoff.',
  findings: [
    {
      id: 'TST-FR3-BLOCKER-001-VERIFIED-FIXED',
      severity: 'INFO',
      title: 'BLOCKING regression (null worktree_path unkillable) -- CONFIRMED FIXED, independently mutation-tested',
      detail: 'lib/fleet/graceful-kill.mjs now short-circuits a NULL session.worktree_path to an explicit {action:noop, nothing to preserve} verdict BEFORE isWorktreeDirty/runPreparkWip run at all. Isolated by mutating hasWorktree to a hardcoded true (defeating only the short-circuit): exactly 2 tests went red -- the mock "must not be called" test and the REAL WIRE test, which was confirmed to import genuine production functions (scripts/fleet-kill.mjs isWorktreeDirty runs real git status --porcelain; lib/fleet/prepark-wip.cjs runPreparkWip returns note:no_worktree_path for a falsy path), not disguised mocks. Zero collateral to unrelated tests. Restored, reconfirmed 39/39 green in lib/fleet/graceful-kill.test.js.',
    },
    {
      id: 'TST-FR3-HIGH-002-VERIFIED-FIXED',
      severity: 'INFO',
      title: 'HIGH: fail-open default on omitted isWorktreeDirty dep -- CONFIRMED FIXED',
      detail: 'The ternary now fails CLOSED (wasDirty=true) when isWorktreeDirty is omitted from deps for a session that HAS a worktree, matching this files own QF-20260728-054 discipline for verifyGone. Isolated by flipping only the fallback (true->false) while keeping the null-worktree short-circuit intact: exactly 1 test went red (the dedicated omitted-dep test), zero collateral -- clean separation from the BLOCKING fix. Restored, reconfirmed green.',
    },
    {
      id: 'TST-COMMIT-003-VERIFIED-FIXED',
      severity: 'INFO',
      title: 'HIGH: zero commits -- CONFIRMED FIXED',
      detail: 'Commit 62aaaa26bfc exists on feat/SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001, PR #7339 is OPEN/MERGEABLE, all 45 CI checks pass (including the 9m13s Unit Tier and 14m10s coverage jobs, confirmed completed green on re-check).',
    },
    {
      id: 'TST-ROLEFILTER-004-VERIFIED-FIXED',
      severity: 'INFO',
      title: 'Nit: honoringSb role-filter passthrough in FR-1 tests -- CONFIRMED FIXED',
      detail: 'tests/unit/fleet/addsession-singleton-refusal.test.js\'s test double now genuinely applies the metadata->>role filter, cross-checked against the real query shape in lib/coordinator/adam-identity.cjs\'s fetchAllAdamsStrict (confirmed it really does call .filter(\'metadata->>role\',\'eq\',ADAM_ROLE) inside fetchAllPaginated\'s real .range() call -- the double\'s shape is not fabricated). Isolated by reverting range() to a passthrough: exactly 1 test went red (the new negative control seeding both an Adam and a Solomon row), 8 others stayed green. Restored, reconfirmed 9/9 green.',
    },
  ],
  critical_issues: [],
  warnings: [
    'Cosmetic-only: the documented-limitation comment for FR-4\'s aliasing detector names 6 uncaught shapes (destructuring, bare reassignment, function-parameter alias, optional chaining, multi-declarator comma, this.meta) -- a prior verbal summary said 7, a miscount in that summary only, not in the shipped code comment. No action needed.',
  ],
  recommendations: [
    'Proceed to EXEC-TO-PLAN handoff -- no further changes required before handoff.',
  ],
  detailed_analysis: 'Second (resumed) EXEC-phase TESTING pass, re-verifying fixes for all findings from the first pass (evidence a21cc030-de9a-4bce-8d2e-befe58c125d4, FAIL, confidence 92). Full regression sweep reproduced independently: npx vitest run lib/fleet/ tests/unit/fleet/ tests/unit/server/fleet-actions-route.test.js server/public/fleet-ui/ tests/unit/coordinator/ -> 252 files, 3176 passed, 1 skipped, 0 failures -- exact match to the claimed numbers.',
  metadata: {
    phase: 'EXEC',
    sd_key: SD_KEY,
    gate: 'EXEC-TO-PLAN pre-handoff validation (re-verification)',
    prior_evidence_id: 'a21cc030-de9a-4bce-8d2e-befe58c125d4',
    pr_number: 7339,
    commit: '62aaaa26bfc',
    metrics: {
      tests_passed: 3176,
      tests_failed: 0,
      tests_skipped: 1,
      test_files_passed: 252,
      findings_from_prior_pass: 5,
      findings_confirmed_fixed: 5,
      independent_mutation_tests_run: 4,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application || 'EHG_Engineer',
  subAgentCode: 'TESTING',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', sd.id, { name: 'TESTING' }, results, {
  phase: 'EXEC',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
