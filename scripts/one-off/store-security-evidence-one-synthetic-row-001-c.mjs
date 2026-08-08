// SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C — SECURITY sub-agent evidence writer (EXEC phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
// Adversarial threat model of the fixture-QF exclusion reaching the CLAIM PATH
// (scripts/worker-checkin.cjs isAutoStartableQF) and the SUPPLY GAUGE
// (lib/coordinator/qf-supply-predicate.cjs isClaimableQfSupply / lib/coordinator/coordination-events.cjs).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '3d0100d7-1cc3-427a-b5a2-bfeff80d3f57';
const SD_KEY = 'SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C';
const PHASE = 'EXEC';
const CODE = 'SECURITY';

const results = {
  verdict: 'PASS',
  confidence: 88,
  validation_mode: 'prospective',
  execution_time_ms: 0,
  summary:
    'The three commits are a correct, narrow consistency fix: isFixtureQf (unchanged in this SD) is now also ' +
    'consumed by the self-claim gate (isAutoStartableQF) and the row-holding supply gauge (isClaimableQfSupply), ' +
    'closing a real INCONSISTENCY where five surfaces filtered quick_fixes but the door that hands out work did ' +
    'not. Confirmed by reading fixture-exclusion.mjs end-to-end and by execution: isFixtureQfByCreatedBy stays ' +
    'unwired (opt-in, matches 0 live rows), the id/title regex is byte-identical to the pre-existing predicate ' +
    '(no TEST-/UAT-/DEMO title branch reintroduced), the over-eating control ("Test-fixture ventures leak into ' +
    'gauges" stays claimable/counted) passes, and the two new consumers fail OPEN on predicate-load failure ' +
    '(correct direction — fail-closed on the self-claim gate would zero out ALL auto-dispatch fleet-wide on a ' +
    'single module error, a far larger blast radius than an occasional unfiltered fixture row). 12/12 unit tests ' +
    'pass (tests/unit/coordinator/qf-supply-gauge-agreement.test.js) plus 10/10 in three adjacent worker-checkin ' +
    'suites, no regressions. ONE non-blocking residual-risk finding, inherited from platform state this SD does ' +
    'not touch: quick_fixes RLS is FOR ALL USING(true) WITH CHECK(true) to anon AND authenticated (confirmed live ' +
    'in database/migrations/20251117_create_quick_fixes_table.sql:87-101, never tightened by any later migration ' +
    'touching this table), so any caller holding the anon key can set a ZZZ_/dunder-prefixed title on an EXISTING ' +
    'real quick_fixes row. I proved this is live-reachable through the actual predicate (not reasoned about): ' +
    'isAutoStartableQF(base({title:"ZZZ_ this is actually a real critical fix"})) returns false — the same as a ' +
    'genuine fixture. This is not a new suppression vector (the identical regex already hid such a row from the ' +
    'human-facing dispatch queue via scripts/modules/sd-next/data-loaders.js:473, which predates this SD by ' +
    'several unrelated commits), but this SD does make the CONSEQUENCE worse for that one narrow case: pre-SD, a ' +
    'title-spoofed real row was invisible on dashboards/gauges but still SELF-CLAIMABLE (worker-checkin\'s own ' +
    'candidate query has no id/title filter — confirmed by reading QF_CANDIDATE_COLUMNS/the query at L729-746 — so ' +
    'isAutoStartableQF was the only gate, and before commit 569d361f5 it had none for fixtures), so the work still ' +
    'got done via auto-dispatch despite bad visibility. Post-SD, that same row is also excluded from self-claim, ' +
    'removing the last automatic path to completion; recovery now requires a human who already knows the row\'s ' +
    'id to run scripts/qf-start.js directly (verified qf-start.js has no isFixtureQf/isAutoStartableQF reference, ' +
    'so it remains available) — but nothing SURFACES that id, because the same predicate hides the row from the ' +
    'one queue a human would normally look at. Bounded: the regex requires an unusual title/id shape no real QF ' +
    'creator uses organically, the blast radius is one row at a time (not systemic), and neither the RLS nor the ' +
    'regex are introduced or widened by this diff. Not blocking. Recommended follow-up below.',
  findings: [
    {
      id: 'F1-title-spoofing-under-permissive-rls-removes-the-last-auto-recovery-path-for-a-misclassified-real-row',
      severity: 'medium',
      note: 'Verified live-code-path (not reasoned): quick_fixes RLS grants anon+authenticated FOR ALL ' +
        'USING(true) WITH CHECK(true) (database/migrations/20251117_create_quick_fixes_table.sql:87-101; grepped ' +
        'every later migration touching quick_fixes — 20251206_factory_architecture.sql, ' +
        '20260211_work_item_thresholds.sql, 20260716_hold_state_contract.sql — none touches its RLS). ' +
        'isFixtureQf (lib/governance/fixture-exclusion.mjs, UNCHANGED by this SD) classifies on qf.id ' +
        '(/^QF-(TEST|DEMO)\\b/i) and qf.title (/^\\s*(ZZZ_|__)/i) only — both freely writable by any caller holding ' +
        'the anon key, which the module\'s own docblock already documents ships client-side. I ran the real ' +
        'exported isAutoStartableQF against a row shaped exactly like an attacker-edited real QF ' +
        '(title:"ZZZ_ this is actually a real critical fix") — it returns false, identically to a genuine fixture. ' +
        'THIS IS NOT A NEW VECTOR: the identical regex already hides such a row from scripts/modules/sd-next/' +
        'data-loaders.js:473 (git log confirms that filter predates this SD by unrelated commits), so the ' +
        'VISIBILITY suppression was already live before these three commits. WHAT IS NEW: pre-SD, worker-checkin\'s ' +
        'own candidate query (QF_CANDIDATE_COLUMNS, L729-746) applies no id/title filter at the DB layer, and ' +
        '(before commit 569d361f5) isAutoStartableQF had no fixture check either — so a title-spoofed real row was ' +
        'invisible to dashboards/gauges but was STILL fetched as a self-claim candidate and would still get worked. ' +
        'Post-SD it is excluded from self-claim too. So this SD converts "silently hidden, self-heals via ' +
        'auto-claim" into "silently hidden, permanently stranded from every automatic path" for the narrow set of ' +
        'rows that are (accidentally or adversarially) fixture-shaped. scripts/qf-start.js (manual, explicit-id ' +
        'start) is unaffected — grepped, it has zero references to isFixtureQf or isAutoStartableQF — so recovery ' +
        'remains POSSIBLE, but only for a human who already has the row\'s id out-of-band, since the surface that ' +
        'would normally show it (sd:next) is filtered by the same predicate. Mitigating factors: (a) the regex is ' +
        'precision-first and requires a shape (ZZZ_/dunder prefix, QF-TEST/QF-DEMO id) no real QF creator produces ' +
        'organically — PR #6186\'s adversarial review already confirmed 0 real rows match; (b) blast radius is one ' +
        'row at a time, not systemic; (c) neither this diff nor any of the three commits touches the RLS policy or ' +
        'the regex — both are pre-existing platform state.',
      recommendation: 'Add a one-line audit trail at the two CONSEQUENTIAL sites only (worker-checkin.cjs ' +
        'isAutoStartableQF, qf-supply-predicate.cjs isClaimableQfSupply) — not the five pre-existing gauge/display ' +
        'sites, which are lower-stakes and already numerous. Something as cheap as an INFO-level log or a ' +
        'coordination-events row on the (rare) branch where isFixtureQf returns true for a row whose age exceeds a ' +
        'few minutes (i.e., not a freshly-seeded test fixture) would give a human something to grep when a QF goes ' +
        'quiet for no visible reason. Separately, and not scoped to this SD: quick_fixes\' anon+authenticated ' +
        'FOR ALL USING(true) WITH CHECK(true) policy is broader than the read-mostly access pattern every consumer ' +
        'in this diff actually needs — tightening UPDATE/INSERT to authenticated-only (or scoping WITH CHECK to the ' +
        'columns legitimate producers write) would close the write surface this finding depends on, independent of ' +
        'any fixture-predicate change. File as its own SD/QF rather than blocking this PR on it.'
    },
    {
      id: 'F2-isFixtureQfByCreatedBy-correctly-stays-unwired',
      severity: 'info',
      note: 'Confirmed by reading lib/governance/fixture-exclusion.mjs end-to-end and by grep across scripts/ and ' +
        'lib/: isFixtureQfByCreatedBy is declared, documented as deliberately opt-in for exactly the reason given ' +
        'in the task brief (created_by is a free-text column under the same permissive RLS; folding it into ' +
        'isFixtureQf would add a one-column suppression vector with no id/title change for a human to notice), and ' +
        'has ZERO callers anywhere in the repo outside its own declaration and doc comments. Neither ' +
        'worker-checkin.cjs nor qf-supply-predicate.cjs references it. FIXTURE_CREATED_BY (\'FIXTURE_HARNESS\') is ' +
        'verified distinct from the default \'UAT_AGENT\' value carried by 98.47% of live rows per the module\'s own ' +
        'comment, so the predicate stays inert by construction until a producer explicitly opts in.',
      recommendation: 'None — this is the correct design and should not be changed.'
    },
    {
      id: 'F3-fail-open-direction-is-correct-for-both-new-call-sites',
      severity: 'info',
      note: 'Both new branches (worker-checkin.cjs:657-661, qf-supply-predicate.cjs:86-91) wrap the require() in ' +
        'try/catch, log via console.error, and CONTINUE UNFILTERED on failure. Fail-CLOSED on the claim path would ' +
        'mean a single module-load hiccup (bad deploy, path typo, Node/ESM-interop regression) makes ' +
        'isAutoStartableQF return false for every row it evaluates, halting ALL self-claim dispatch fleet-wide — a ' +
        'strictly larger blast radius than the residual issue this SD fixes (a worker occasionally picking up a ' +
        'fixture QF). Fail-open on the supply gauge is even lower-stakes (a metric becomes temporarily over- rather ' +
        'than under-counted, which is the SAFE direction per the same commit\'s own "under-counting supply ' +
        'over-mints work" reasoning). Consistent with the existing degrade-safe pattern already in ' +
        'scripts/fleet-dashboard.cjs:474-476. The console.error-only reporting is easy to miss operationally (no ' +
        'counter feeds an alert surface), but that is a pre-existing pattern-wide characteristic, not something ' +
        'this SD introduces or worsens.',
      recommendation: 'Optional, not blocking: if predicate-load failures become a recurring signal, wire the ' +
        'catch-block message into the existing gauge-registry / coordinator-alert path rather than console.error ' +
        'alone, so a persistent failure surfaces to a human instead of scrolling off stdout.'
    },
    {
      id: 'F4-over-exclusion-control-verified-intact-no-regression',
      severity: 'info',
      note: 'Confirmed the fixture-exclusion.mjs regex is BYTE-IDENTICAL before and after this SD\'s three commits ' +
        '(the file is not in the diff of 569d361f5, 2afe4b038, or 29900c23e) — this SD adds consumers of an ' +
        'existing predicate, it does not touch the predicate\'s matching logic. Read the full file: the bare ' +
        'TEST-/UAT-/DEMO title branches removed by PR #6186 (per its own docblock, after two live false positives ' +
        'on real bug reports) were NOT reintroduced; only unambiguous ZZZ_/dunder-prefix and QF-TEST/QF-DEMO-id ' +
        'markers remain. Ran the live test suite: 12/12 pass in ' +
        'tests/unit/coordinator/qf-supply-gauge-agreement.test.js, including the new two-sided pin added in commit ' +
        '29900c23e — two fixture rows correctly excluded (supply:false, claimable:false) AND the over-eating ' +
        'control ("REAL bug report merely NAMING fixtures" — title "Test-fixture ventures leak into gauges") ' +
        'correctly stays on the supply/claimable side. Also ran 10/10 in three adjacent worker-checkin suites ' +
        '(qf-factory-lane, critical-qf-priority-jump, qf-directed-not-before) with no regressions.',
      recommendation: 'None — precision-over-recall control is intact and test-pinned in both directions.'
    },
    {
      id: 'F5-no-injection-traversal-or-new-secret-exposure',
      severity: 'info',
      note: 'Reviewed every changed line in the three commits. Both new require() calls use static, hard-coded ' +
        'relative path string literals (\'../lib/governance/fixture-exclusion.mjs\', ' +
        '\'../governance/fixture-exclusion.mjs\') — never derived from qf-controlled data, so there is no path- ' +
        'traversal or dynamic-require surface. isFixtureQf/isClaimableQfSupply are pure in-memory regex tests over ' +
        'already-fetched fields; no new SQL string concatenation (coordination-events.cjs:507\'s .select(...) call ' +
        'is a static literal with `title` appended, not user input). console.error interpolation in both catch ' +
        'blocks only includes `e?.message || e` (a JS error message), never row content. Adding `title` to the ' +
        'coordination-events.cjs projection introduces no new sink — it is consumed only by the in-memory ' +
        'isClaimableQfSupply filter in this diff, never logged, printed, or forwarded to any external surface here. ' +
        'No secrets/credentials touched anywhere in the three commits.',
      recommendation: 'None.'
    }
  ],
  recommendations: [
    'Non-blocking, recommended follow-up: add lightweight audit telemetry at the two CONSEQUENTIAL fixture-exclusion ' +
      'sites (worker-checkin.cjs isAutoStartableQF, qf-supply-predicate.cjs isClaimableQfSupply) so a real row ' +
      'silently stranded by title/id spoofing (or an unlucky accidental collision) leaves a trace a human can find — ' +
      'currently the match branch is completely silent (only the require()-failure branch logs).',
    'Out of scope for this SD, file separately: quick_fixes RLS (FOR ALL USING(true) WITH CHECK(true) to anon AND ' +
      'authenticated, unchanged since 20251117_create_quick_fixes_table.sql) is broader than any consumer in this ' +
      'diff needs and is the root enabler of the title-spoofing scenario in F1. Tightening write access would close ' +
      'that surface independent of any future fixture-predicate change.',
    'Confirmed no action needed: do not fold isFixtureQfByCreatedBy into isFixtureQf, and do not converge ' +
      'lib/chairman/chairman-actionable.mjs or lib/eva/chairman-decision-watcher.js onto the canonical predicate — ' +
      'both are deliberate, test-pinned divergences per fixture-exclusion.mjs\'s own docblock.'
  ],
  warnings: [
    'The fixture-classification match itself (as opposed to predicate-load failure) is silent at every call site ' +
      'in this repo, not only the two added here. This SD is simply the first to let that silent classification ' +
      'change ACTION (dispatch eligibility, supply count) rather than only a display number.',
    'This review treats the quick_fixes RLS policy and the fixture-exclusion.mjs regex as pre-existing platform ' +
      'state — neither is introduced, widened, or modified by the three commits in scope (569d361f5, 2afe4b038, ' +
      '29900c23e). F1 is a residual-risk finding about consequence, not about a new defect in this diff.'
  ],
  critical_issues: [],
  detailed_analysis:
    'SCOPE: adversarial threat model of three commits on feat/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C that extend ' +
    'the CANONICAL fixture-exclusion predicate (lib/governance/fixture-exclusion.mjs isFixtureQf, unchanged by ' +
    'this SD) to two NEW consumers: the self-claim eligibility gate (scripts/worker-checkin.cjs ' +
    'isAutoStartableQF) and the row-holding supply gauge (lib/coordinator/qf-supply-predicate.cjs ' +
    'isClaimableQfSupply, consumed by lib/coordinator/coordination-events.cjs:505-516).\n\n' +
    'METHOD: read fixture-exclusion.mjs end-to-end and diffed it against HEAD~3 (byte-identical — confirmed this ' +
    'SD does not touch it); read the full diff of all three commits (569d361f5, 2afe4b038, 29900c23e); read the ' +
    'quick_fixes RLS migration (20251117_create_quick_fixes_table.sql) and grepped every later migration that ' +
    'touches quick_fixes for any RLS change (none found); executed the real exported isAutoStartableQF against a ' +
    'crafted attacker-shaped row to PROVE the suppression path rather than reason about it; ran the live test ' +
    'suite (tests/unit/coordinator/qf-supply-gauge-agreement.test.js, 12/12 pass) plus three adjacent ' +
    'worker-checkin suites (10/10 pass, no regressions); grepped the whole repo for isFixtureQfByCreatedBy and ' +
    'isClaimableQfSupply/applyClaimableQfFilter callers to confirm wiring boundaries; grepped scripts/qf-start.js ' +
    'and scripts/create-quick-fix.js to confirm the manual/explicit-id start path is untouched by either predicate.\n\n' +
    'WHAT THE CHANGE GETS RIGHT. It closes a genuine, previously-undetected inconsistency: five surfaces already ' +
    'filtered quick_fixes with isFixtureQf (recursion-governor.js:128, adam-github-assessment.mjs:136, ' +
    'adam-self-adherence-review.mjs:105, fleet-dashboard.cjs:476, sd-next/data-loaders.js:473) while the two ' +
    'places that turn classification into ACTION (claim eligibility, supply count) did not. isFixtureQfByCreatedBy ' +
    'correctly stays unwired and opt-in, for exactly the reason its own docblock states (created_by is free-text ' +
    'under the same permissive RLS). Both new call sites fail OPEN on predicate-load failure, which is the correct ' +
    'direction given that failing closed on the claim path would zero out ALL self-claim dispatch fleet-wide on a ' +
    'single module error — a strictly larger blast radius than the narrow issue being fixed. The precision-first ' +
    'regex (ZZZ_/dunder/QF-TEST/QF-DEMO only, no bare TEST-/UAT-/DEMO title branch) is unchanged and its two-sided ' +
    'test control (over-eating pin) is intact and passing.\n\n' +
    'THE ONE RESIDUAL FINDING (F1, medium, non-blocking). quick_fixes RLS is permissive to anon+authenticated for ' +
    'ALL operations, and both id and title are ordinary writable columns. isFixtureQf reads only those two fields, ' +
    'so any caller holding the anon key can make an existing real row read as a fixture. I proved this reaches the ' +
    'new claim-path gate by executing isAutoStartableQF against such a row (returns false, same as a genuine ' +
    'fixture). This is NOT a new suppression vector — the identical regex already hid such a row from the ' +
    'human-facing dispatch queue (sd-next/data-loaders.js:473, predates this SD) — but this SD does close the last ' +
    'AUTOMATIC recovery path for that narrow case: pre-SD, worker-checkin\'s own candidate query applies no id/' +
    'title filter, so a title-spoofed real row was still fetched and (before commit 569d361f5) still self-claimed ' +
    'despite bad visibility elsewhere. Post-SD it is excluded there too. Manual recovery via scripts/qf-start.js ' +
    'remains available and untouched by either predicate, but nothing surfaces the id to a human, since the same ' +
    'predicate hides the row from sd:next. Bounded by precision-first matching (no real QF organically matches), ' +
    'one-row-at-a-time blast radius, and the fact that neither the RLS policy nor the regex is touched by this ' +
    'diff. Recommended (non-blocking): audit telemetry on the match branch at these two consequential sites, and a ' +
    'separately-filed RLS-tightening SD for quick_fixes.\n\n' +
    'BOTTOM LINE: PASS. The diff is a correct, well-scoped consistency fix with the right fail-direction choices ' +
    'and no regressions. The one residual risk is inherited platform state (permissive RLS + free-text ' +
    'classification fields) that predates and is unmodified by this SD; it is surfaced here because this SD is the ' +
    'first to let that classification affect dispatch action rather than only a display count.',
  metadata: {
    version: '1.0.0',
    review_type: 'adversarial_fixture_exclusion_dispatch_threat_model',
    worktree_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C',
    branch: 'feat/SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C',
    commits_reviewed: ['569d361f543', '2afe4b038c6', '29900c23edc'],
    brief_sections_answered: {
      S1_suppression_vector: 'CONFIRMED reachable and empirically demonstrated, but the VISIBILITY suppression ' +
        'predates this SD via 5 pre-existing surfaces (same unmodified regex); this SD\'s marginal contribution ' +
        'is removing the last AUTOMATIC recovery path (self-claim) for a title/id-spoofed real row — medium, ' +
        'non-blocking, root cause is pre-existing permissive RLS',
      S2_isFixtureQfByCreatedBy_stays_optin: 'PASS — zero callers outside its own declaration, correctly excluded ' +
        'from isFixtureQf and both new consumers',
      S3_fail_open_vs_closed: 'PASS — fail-open is the correct direction on both new call sites; fail-closed on ' +
        'the claim path would halt fleet-wide self-claim dispatch on any module-load error',
      S4_over_exclusion_dos: 'PASS — regex byte-identical pre/post this SD; TEST-/UAT-/DEMO title branches not ' +
        'reintroduced; over-eating control test row present and passing (12/12)',
      S5_injection_secrets: 'PASS — static require() paths, no dynamic query construction from qf data, no new ' +
        'log/persist sink for title content, no secrets touched'
    },
    empirical_verifications: [
      'Read database/migrations/20251117_create_quick_fixes_table.sql:87-101 — RLS FOR ALL USING(true) ' +
        'WITH CHECK(true) to both anon and authenticated',
      'Grepped every other migration touching quick_fixes (20251206_factory_architecture.sql, ' +
        '20260211_work_item_thresholds.sql, 20260716_hold_state_contract.sql) — none alters its RLS',
      'Diffed lib/governance/fixture-exclusion.mjs across the three commits in scope — file untouched, ' +
        'confirming the regex is not modified by this SD',
      'Executed the real exported isAutoStartableQF: real row -> true; QF-TEST-001 id -> false; ZZZ_ title -> ' +
        'false; attacker-shaped "ZZZ_ this is actually a real critical fix" title -> false (proves the ' +
        'suppression is live-reachable through the actual code path); over-eating control ' +
        '"Test-fixture ventures leak into gauges" -> true',
      'npx vitest run tests/unit/coordinator/qf-supply-gauge-agreement.test.js -> 12/12 pass',
      'npx vitest run tests/unit/worker-checkin-qf-factory-lane.test.js, ' +
        'worker-checkin-critical-qf-priority-jump.test.js, worker-checkin-qf-directed-not-before.test.js -> ' +
        '10/10 pass, no regressions',
      'Grepped repo-wide for isFixtureQfByCreatedBy callers — zero outside its own module',
      'Grepped scripts/qf-start.js and scripts/create-quick-fix.js for isFixtureQf/isAutoStartableQF references ' +
        '— none, confirming the manual explicit-id start path is unaffected by either predicate',
      'Read worker-checkin.cjs QF_CANDIDATE_COLUMNS query (L729-746) — no id/title filter at the DB layer, ' +
        'confirming isAutoStartableQF is (and always was) the sole in-process gate for self-claim eligibility'
    ],
    files_reviewed: [
      'scripts/worker-checkin.cjs (isAutoStartableQF, isCriticalQfJumpEligible, QF_CANDIDATE_COLUMNS query)',
      'lib/coordinator/qf-supply-predicate.cjs (isClaimableQfSupply, applyClaimableQfFilter)',
      'lib/coordinator/coordination-events.cjs (L22-25, 190-201, 495-518)',
      'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
      'lib/governance/fixture-exclusion.mjs (read-only, confirmed unchanged by this SD)',
      'database/migrations/20251117_create_quick_fixes_table.sql (read-only, RLS posture)',
      'database/migrations/20251206_factory_architecture.sql, 20260211_work_item_thresholds.sql, ' +
        '20260716_hold_state_contract.sql (read-only, confirmed no RLS change to quick_fixes)',
      'scripts/qf-start.js, scripts/create-quick-fix.js (read-only, confirmed unaffected)',
      'scripts/adam-github-assessment.mjs, scripts/adam-self-adherence-review.mjs, scripts/fleet-dashboard.cjs, ' +
        'scripts/modules/sd-next/data-loaders.js, lib/governance/recursion-governor.js (read-only, the 5 ' +
        'pre-existing isFixtureQf consumers)',
      'lib/fleet/belt-depth.cjs (read-only, the sibling head-count gauge that stays partial by design)'
    ],
    notes_on_method: 'All demonstration scripts (the isAutoStartableQF spoofing proof) were run transient via ' +
      'node -e and touched no database rows. No writes were made to quick_fixes or any other table during this review.'
  }
};

// results.summary and results.findings are NOT mapped columns on sub_agent_execution_results
// (established pattern from prior SECURITY evidence writers). Fold them into detailed_analysis,
// which IS mapped and uncapped, so the per-finding evidence is not silently discarded.
const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY',
  '=======',
  results.summary,
  '',
  results.detailed_analysis,
  '',
  'PER-SECTION FINDINGS',
  '='.repeat(72),
  '',
  results.findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + NL +
    'FINDING: ' + f.note + NL +
    'RECOMMENDATION: ' + (f.recommendation || '(none - informational)')
  )).join(NL + NL + HR + NL + NL)
].join(NL);

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: CODE,
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer'
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  CODE,
  SD_ID,
  { name: 'Chief Security Architect' },
  results,
  { sdKey: SD_KEY, phase: PHASE }
);

console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_CONFIDENCE=' + results.confidence);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('REPO_RESOLVED=' + results.metadata.repo_resolved);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
