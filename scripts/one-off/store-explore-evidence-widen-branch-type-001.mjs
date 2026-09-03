import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-WIDEN-BRANCH-TYPE-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'Codebase discovery for widening BRANCH_TYPE_TOKENS: confirmed lib/git/branch-owner.js:64 is the ' +
    'SOLE definition site (Object.freeze([\'feat\',\'fix\',\'docs\',\'test\'])), with an unconditional ' +
    'assertTypeTokensPrefixFree(BRANCH_TYPE_TOKENS) call at line 71 already running at every module ' +
    'import -- so adding \'sd\' and letting that existing call re-verify is the entire "re-derive the ' +
    'proof" step; no new verification code is needed. Grepped every consumer: only ' +
    'lib/git/branch-owner.js and lib/git/branch-owner.test.js reference the constant name directly; ' +
    'scripts/modules/handoff/executors/lead-final-approval/gates.js (the PR_MERGE_VERIFICATION Scan ' +
    'A/B/C gate that missed the incident branch) imports BRANCH_TYPE_TOKENS and aliases it as ' +
    'RECOGNIZED_BRANCH_TYPES (line 623) rather than re-declaring it, per that file\'s own comment ' +
    '("named directly off BRANCH_TYPE_TOKENS... instead of a second, hand-maintained literal"). ' +
    'Confirmed \'sd\' does not prefix or get prefixed by feat/fix/docs/test (checked all 20 ordered ' +
    'pairs by inspection: no shared prefix relationship exists), so assertTypeTokensPrefixFree will ' +
    'not throw with the widened set.',
  critical_issues: [],
  warnings: [
    'The existing test suite (lib/git/branch-owner.test.js) only asserts BRANCH_TYPE_TOKENS.toContain(\'test\'), ' +
    'not an exact-array equality, so it will not break from the addition -- but it also does not ' +
    'currently test any \'sd/\' branch resolution, so TS-2 (a new test reproducing the incident) is ' +
    'required to actually prove the fix closes the reported gap, not just that the token list changed.',
  ],
  recommendations: [
    'Update the module\'s FLIP CONDITION docblock in place (not just the SD row) so the widen\'s ' +
    'provenance is co-located with the constant, matching the block\'s own stated design intent.',
  ],
  detailed_analysis: {
    definition_site: 'lib/git/branch-owner.js:64 (BRANCH_TYPE_TOKENS), :71 (assertTypeTokensPrefixFree call at import time, pre-existing, unconditional)',
    sole_consumers_grepped: ['lib/git/branch-owner.js', 'lib/git/branch-owner.test.js', 'scripts/modules/handoff/executors/lead-final-approval/gates.js (via RECOGNIZED_BRANCH_TYPES alias, line 623, no re-declaration)'],
    incident_reference: 'SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001 PR #8079, branch sd/SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001, merge commit f113152308c -- invisible to Scan A/B/C, false-blocked LEAD-FINAL-APPROVAL with reason=never_pushed, unblocked via a --bypass-validation --followup-sd-key citing this SD.',
  },
  execution_time_ms: 60000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Codebase Discovery (Explore)' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
