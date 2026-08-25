import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '4e010f6a-f5a5-437c-ac2c-e1ffb8185a95';
const REPO_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const CWD = process.cwd();

const analysis = `TESTING agent reviewed the actual diff (lib/sub-agents/resolve-repo.js, lib/sub-agents/regression.js,
tests/unit/resolve-sub-agent-repo.test.js, tests/unit/sub-agents/regression-target-application-precedence.test.js)
and ran the tests directly. VERDICT: PASS with 4 findings.

Confirmed correct: (1) conditions/justification populated only inside the actual downgrade branch,
skip/healthy paths untouched, caller-supplied values preserved (idempotency-guarded). (2)
applySubAgentRepoVerdict now runs exactly once, immediately post-resolution, before storeResults --
no duplicate calls remain. (3) storeResults' insert payload now carries metadata/conditions/justification.
(4) getSDDetails normalizes sdId and selects target_application.

Tests: regression-target-application-precedence.test.js 4/4 pass. resolve-sub-agent-repo.test.js
(run via temp de-quarantine copy) 22/24 pass -- the 2 failures are the pre-existing, unrelated
registrySource 'db' vs 'registry' EHG_Engineer self-reference assertions (quarantined since
2026-06-28 for a Windows/Linux path difference, confirmed unrelated to this fix). All 5 new
SD-specific tests pass, including the cwd_leak non-aliasing regression guard.

FINDINGS (F1 fixed inline this review cycle; F2-F4 out of scope, flagged for completion-flags):
F1 (FIXED): storeResults' insert call never destructured { error } from the supabase response --
supabase-js RETURNS constraint violations rather than throwing, so a 23514 from THIS fix's own
insert would have stayed invisible (the code comment "silently swallowed by the catch below" was
wrong -- it was swallowed by the missing error binding, never reaching the catch at all). Fixed:
destructured { error: insertError } and logged it explicitly.
F2 (OUT OF SCOPE): regression.js has two OTHER CONDITIONAL_PASS-setting sites (documented API
changes, coverage decrease) that also omit conditions/justification -- same defect class, but a
separate, unescalated finding not part of the repo-writer self-defeat this SD targets.
F3 (OUT OF SCOPE, cosmetic): in capture-baseline mode, the repo-downgrade now fires before
verdict is overwritten to BASELINE_CAPTURED, leaving an orphan verdict_chain/conditions trail on
the in-memory object. No DB row is written on that path (confirmed), so display-only, no persisted
impact.
F4 (confirmed benign): getSDDetails's not-found throw moved outside the try/catch -- only the CLI
calls execute() and already .catch()es to exit 1, same observable behavior.
Cross-caller check: api/dependency/performance/design/security route through
lib/sub-agent-executor/executor.js, confirmed unaffected by the regression.js-specific changes;
they DO benefit from the resolve-repo.js fix (their downgrade rows now carry the repo condition
in addition to results-storage.js's own warnings-derived synthesis -- both satisfy the constraint,
content differs slightly, not a regression).`;

const { data, error } = await supabase.from('sub_agent_execution_results').insert({
  sd_id: SD_UUID,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'Testing Sub-Agent',
  verdict: 'PASS',
  confidence: 90,
  phase: 'PLAN',
  source: 'agent',
  detailed_analysis: analysis,
  warnings: [
    { severity: 'LOW', issue: 'regression.js has 2 other CONDITIONAL_PASS sites (API-change/coverage-decrease) missing conditions/justification -- same defect class, out of scope for this SD', recommendation: 'File a follow-up QF/SD for regression.js lines ~212,263 (documented API changes / coverage decrease branches)' },
  ],
  recommendations: [
    { action: 'Follow-up: audit regression.js for all CONDITIONAL_PASS-setting sites and apply the same conditions/justification synthesis pattern', priority: 'low' },
  ],
  metadata: {
    repo_path: REPO_PATH,
    executed_from_cwd: CWD,
    mechanism_verifications: [
      { verified_at: 'lib/sub-agents/regression.js:811 (pre-fix insert call)', verified_by: 'TESTING agent (Task tool), confirmed missing error destructure via direct file read + fix applied' },
    ],
  },
  executed_from_cwd: CWD,
}).select('id');

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('TESTING evidence recorded:', data[0].id);
