// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — Explore sub-agent evidence writer (LEAD phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Explored the full leg1 A-LOCAL implementation surface: lib/drive-loop/score/leg1-landed.js (OLD ancestry impl, ' +
    'all-or-nothing scoring, zero production callers today, only LEG_ID constant currently imported by the sweep); ' +
    'drive-score-legs.js SSOT (3 frozen legs, no leg3, ratified_by asserted at import time); aggregate.js (central ' +
    'invariant: an unavailable leg shrinks the denominator, never scores 0 — aggregate sums each measured legs own ' +
    'points.value verbatim, so partial-credit shape must be built into the new leg1 scorer itself, not relied on from ' +
    'aggregate); drive-report-sweep.mjs buildGather (computePlanCheckStatus done[] is already scoped to a completed-items ' +
    'window and already carries sd_key via item.promoted_to_sd_key — FR-2 needs zero new queries); checkMergeEvidence ' +
    'in fallback.js (synchronous execSync, tries multiple SD-key pattern variants against git log main --merges --grep, ' +
    'UNANCHORED substring match, behaviorally UNTESTED) confirming the end-anchor gap VALIDATION flagged must be solved ' +
    'in a new predicate, not by reusing this function as-is; the runGit test-injection convention specific to ' +
    'leg1-landed.js (returns only {ok:boolean}, insufficient for a git-log query needing matched subject-line content); ' +
    'and the SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 worktree collision (confirmed real but pre-commit — same legs array, same ' +
    'buildGather signature, same test describe blocks, nothing pushed to origin yet, still cheap to sequence).',
  findings: [
    { id: 'leg1-old-scorer', severity: 'info', note: 'lib/drive-loop/score/leg1-landed.js: scoreLeg1({items,runGit}) all-or-nothing (LEG_POINTS=2 or 0), ancestryArgs() the only permitted git question, throws without injected runGit. Zero production callers today; only the LEG_ID string constant is imported by drive-report-sweep.mjs.' },
    { id: 'aggregate-invariant', severity: 'info', note: 'aggregate.js: unavailable legs shrink the denominator, never score 0 (central invariant, stated in the file header). earned = sum of each measured legs points.value verbatim — no proportional math in aggregate itself.' },
    { id: 'population-already-fetched', severity: 'info', note: 'computePlanCheckStatus done[] (lib/roadmap/plan-check-status.js:217-238) is already scoped to a completed-items window (status=completed AND completion_date within windowHours, default 48h) and already carries sd_key (item.promoted_to_sd_key, line 235). FR-2 needs zero new queries.' },
    { id: 'checkMergeEvidence-unanchored', severity: 'warning', note: 'fallback.js checkMergeEvidence (lines 134-198): synchronous execSync, git log main --merges --grep=<pattern> per SD-key variant, first match wins. Grep is substring-unanchored and the function is behaviorally untested (only existence-checked in branch-resolver.test.js). Confirms a new predicate must build in its own end-anchoring rather than delegating to this function unmodified.' },
    { id: 'rungit-shape-insufficient', severity: 'info', note: 'leg1-landed.js.test.js uses a hand-written (args)=>{ok:boolean} double. That shape returns only a boolean, insufficient for a git-log/grep query that needs the matched subject-line CONTENT to verify end-anchoring — the new predicate needs a richer injected runner returning matched text, not just ok/fail.' },
    { id: 'leg2-collision-precommit', severity: 'warning', note: 'SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 worktree has uncommitted (nothing pushed to origin) edits to the same legs array, same buildGather() signature, and the same test describe blocks in drive-report-sweep.mjs / drive-report-sweep.test.js. Real collision risk on ship, but still cheap to resolve since neither side has landed yet.' },
  ],
  metadata: {
    old_scorer_production_callers: 0,
    population_source: 'computePlanCheckStatus done[] (zero new queries)',
    check_merge_evidence_end_anchored: false,
    check_merge_evidence_tested: false,
    leg2_collision_status: 'uncommitted_precommit',
  },
  execution_time_ms: 480000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
