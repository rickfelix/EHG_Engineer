// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 -- TESTING sub-agent evidence REV-2 (PLAN phase).
// Supersedes d13f8619-f279-448b-bf9e-a10c48f2a277 (CONDITIONAL_PASS).
// Re-measured the PRD after team-lead applied the rev-1 amendments: verified each claimed fix landed
// against the live product_requirements_v2 row rather than relying on the report that they had.
// Upgrades to PASS. One NEW finding (T10) surfaced during verification -- a surviving same-class
// instance of rev-1's T6, on the SD's single most load-bearing open question.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'PLAN';
const SUPERSEDES = 'd13f8619-f279-448b-bf9e-a10c48f2a277';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary: [
    'REV-2, SUPERSEDES ' + SUPERSEDES + ' (CONDITIONAL_PASS). VERDICT UPGRADED TO PASS.',
    'Rev-1 verdict was conditional on 6 blocking PRD amendments. Those amendments have been applied and I RE-MEASURED each',
    'one against the live product_requirements_v2 row (updated_at 2026-08-24T03:05:35Z) rather than accepting the report',
    'that they had landed -- a conditional verdict whose conditions were met is otherwise indistinguishable from one whose',
    'were not, and this SD proceeds to EXEC on the strength of this row.',
    'ALL 6 BLOCKING AMENDMENTS VERIFIED LANDED, with substance intact rather than merely keyword-present:',
    '(1) TS-11 inverted to REJECTED/SDCW1 AND carries the fixture-validity requirement (the cascade wrapper must record',
    'pg_trigger_depth() into a probe table and the test must assert the recorded value >1) -- so the rewritten scenario',
    'cannot silently degrade into a duplicate of TS-1.',
    '(2) TS-18 leg (2) retargeted to plan-to-exec/state-transitions.js; TS-20 correctly LEFT naming SDRepository.js, since',
    'it is about the FR-8 advisory static scanner where reachability is irrelevant. The distinction survived the edit.',
    '(3) TS-25..TS-32 added, 32 scenarios total. Spot-checked substance, not just presence: TS-25 retains the MIRROR',
    'assertion (mutator removed => same UPDATE succeeds), TS-27 retains restore-and-verify, TS-31 retains both halves of',
    'the NULL-at-rest proof. These are the clauses that make the scenarios falsifiable; all three survived.',
    '(4) acceptance_criteria[0] extended past the raw TS array and now states explicitly that the TS array alone is NOT',
    'the definition of done -- closing the literal-reading hole that was rev-1 T5.',
    '(5) implementation_approach: the "TS-11 proves the exemption" framing is GONE; the only surviving updateStatus()',
    'mention is a negative exclusion, which is correct. Registry replace-and-restore primitive added; harness narrowed from',
    'a 35-trigger clone to the ~10-object stub; tests/ddl precedent and tier boundary both recorded.',
    '(6) FR-2 AC#6 split into a two-stage assertion -- Stage 1 is an EXEC-phase read-only catalog SELECT with an offline',
    'bounding assertion (TR-1-compliant), Stage 2 is the post-apply position assertion.',
    'T9 PRESERVE-LIST CONFIRMED UNTOUCHED: FR-3 AC#7 (NULL-at-rest, both halves), FR-6 AC#3 (static absence of',
    'pg_trigger_depth), FR-4 AC#5 (rollback compensation) all still present and unweakened. The remediation did not',
    'collaterally damage the criteria that made the original gaps findable.',
    'ONE NEW FINDING, T10, NON-BLOCKING BUT WORTH FIXING BEFORE EXEC: a same-class instance of rev-1 T6 survived the T6 fix,',
    'on a higher-stakes criterion. FR-1 AC#5 states the SQLSTATE round-trip question "must be resolved before EXEC proceeds,',
    'not discovered by it" -- but TS-29 now scopes it to a genuine SDCW1 rejection in the live-PostgREST tier, which cannot',
    'happen until the chairman-gated apply, and acceptance_criteria[0] exempts TS-29 from the executed-test requirement.',
    'So the one question the PRD declares must be answered BEFORE EXEC is assigned to the one scenario that cannot run',
    'until AFTER it. The fix is cheap because the question is GENERIC -- see T10.',
    'PASS rather than CONDITIONAL_PASS because T10 is a scoping refinement to an already-correct requirement, not missing',
    'coverage, and it does not gate the PLAN-TO-EXEC handoff.',
  ].join(' '),
  findings: [
    {
      id: 'T10-FR1-AC5-round-trip-must-precede-EXEC-but-TS29-cannot-run-until-post-apply',
      severity: 'warning',
      note: [
        'NEW IN REV-2, surfaced while verifying the T6 fix. Same class as T6 (an acceptance criterion that cannot be',
        'satisfied in the phase responsible for it), but on a materially more load-bearing question, and it survived because',
        'the T6 fix was applied to FR-2 AC#6 specifically rather than swept for as a class.',
        'THE CONTRADICTION, quoting both sides. FR-1 AC#5: "...If this test reveals SQLSTATE does NOT round-trip cleanly, the',
        'error-discrimination strategy this whole SD threat model depends on needs a documented message-text fallback',
        'instead, and that must be resolved BEFORE EXEC PROCEEDS, not discovered by it." TS-29 scenario: "MUST RUN IN THE',
        'LIVE-POSTGREST TIER... trigger a GENUINE SDCW1 rejection via the real supabase-js .update().eq(...) call pattern".',
        'A genuine SDCW1 rejection requires the guard trigger to exist on the live strategic_directives_v2 -- which TR-1',
        'forbids during this SD EXEC phase. And acceptance_criteria[0] now explicitly exempts TS-29 from the executed-test',
        'requirement as tier-deferred. Net effect: the single question FR-1 AC#5 says must precede EXEC is the one scenario',
        'guaranteed not to run until after the chairman-gated apply.',
        'WHY IT MATTERS MORE THAN T6 DID. This is not a hygiene assertion about trigger names. The entire error-channel',
        'discrimination strategy rests on the answer. Risk-agent F7 resolved the CAS-masking question as option (c) -- use the',
        'error channel -- and REJECTED option (a) pre-check SELECT on four independent grounds including that it would regress',
        'SD-LEO-FIX-POST-MERGE-AUTOMATION-001 FR-2. That resolution is only sound if error.code survives PostgREST verbatim.',
        'If it does not, the fallback is message-text matching -- which collides directly with FR-1 AC#4 constraint about the',
        '"0 rows" substring, since both rejection messages would then become load-bearing parse targets rather than merely',
        'needing to avoid one forbidden substring. Discovering that after EXEC has wired 15 stamp sites is exactly the',
        'sequencing FR-1 AC#5 was written to prevent.',
        'THE FIX IS CHEAP, BECAUSE THE QUESTION IS GENERIC. "Does PostgREST/supabase-js surface a custom 5-character SQLSTATE',
        'verbatim as error.code?" is a property of the PostgREST error-translation layer. It does not depend on this trigger,',
        'this table, or this SD design. It can be answered in full during EXEC against a THROWAWAY scratch table carrying a',
        'minimal trigger whose only job is RAISE SQLSTATE \'SDCW1\', exercised through the real supabase-js client on the real',
        'Supabase surface -- no DDL on strategic_directives_v2, no dependence on the chairman-gated apply.',
        'RECOMMENDED SPLIT, mirroring the shape already used for FR-2 AC#6: STAGE 1 (EXEC-phase, answers FR-1 AC#5 before EXEC',
        'proceeds) -- throwaway scratch table + minimal SDCW1-raising trigger + real supabase-js .update().eq(...), assert',
        'error.code === \'SDCW1\'. If it does not round-trip, the message-text fallback gets designed NOW, while the design is',
        'still cheap to change. STAGE 2 (post-apply, confirmation not discovery) -- the same assertion against the real guard',
        'on the real table, exactly as TS-29 reads today.',
        'ONE HONEST CAVEAT, stated so this is not smuggled past TR-1: creating a throwaway table plus trigger on the live',
        'Supabase instance IS live DDL, just not on strategic_directives_v2. It does not carry the risk TR-1/TR-2 exist to',
        'prevent -- TR-2 concern is an ACCESS EXCLUSIVE lock on a table measured at 377,874 seq_scans with no lock_timeout',
        'configured for service_role/postgres, and a brand-new zero-traffic table in a scratch schema takes locks only on',
        'itself. But it is still a carve-out, and it should be written into TR-1 as an explicit narrow exception ("DDL',
        'confined to throwaway scratch objects is permitted; DDL touching strategic_directives_v2 is not") rather than left',
        'to EXEC judgment. A TR that gets quietly reinterpreted mid-phase is worse than one with a stated exception.',
        'NOT BLOCKING THE HANDOFF: FR-1 AC#5 is correctly specified and TS-29 correctly captures the assertion. This is a',
        'scoping refinement about WHEN and AGAINST WHAT, not missing coverage, and it is actionable at the start of EXEC.',
      ].join(' '),
    },
    {
      id: 'T11-rev1-amendments-verified-landed-by-re-measurement-not-by-report',
      severity: 'info',
      note: [
        'Verification record, so a later reader can see this row rests on measurement rather than on a relayed claim.',
        'RE-QUERIED product_requirements_v2 id=PRD-SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 after the amendments were',
        'reported applied. updated_at 2026-08-24T03:05:35.523667Z. test_scenarios length 32 (was 24), ids TS-1..TS-32',
        'contiguous with no gaps. acceptance_criteria length 5, unchanged in count, with element [0] rewritten.',
        'CHECKED FOR SUBSTANCE RATHER THAN KEYWORD PRESENCE, because the failure mode rev-1 documented was precisely text that',
        'reads correct while asserting the wrong thing. Specifically re-read: TS-11 full expected text (inversion present AND',
        'the depth>1 probe-table fixture-validity clause present); TS-18 both legs (leg 2 now names',
        'plan-to-exec/state-transitions.js, and the expected text stamp attribution was updated to match rather than left',
        'referring to SDRepository.js); TS-20 (unchanged, still correctly about the advisory scanner); TS-25 (mirror assertion',
        'clause present); TS-27 (restore-and-verify clause present); TS-31 (both the SELECT-reads-NULL half and the',
        'second-write-rejected half present); FR-2 AC#6 (two-stage split, Stage 1 explicitly read-only and TR-1-compliant).',
        'NEGATIVE CHECKS RUN, not just positive ones: grepped implementation_approach for the two stale premises. "proves the',
        'exemption" is absent. The sole surviving "updateStatus" occurrence is a negative exclusion ("NOT SDRepository.js',
        'updateStatus(), which is dead-by-unreachability and is explicitly excluded"), which is the correct residual form --',
        'naming it as excluded is more durable than deleting the mention, since it stops a future reader re-adding it.',
        'T9 PRESERVE-LIST spot-checked intact: FR-3 AC#7, FR-6 AC#3, FR-4 AC#5 all present and unweakened. Worth confirming',
        'explicitly because bulk remediation of adjacent fields is a common way for good criteria to get collaterally',
        'rewritten, and these four are the ones carrying this SD instrument diversity.',
        'NOT RE-VERIFIED, stated so it is not assumed: I did not re-read all 8 FRs end to end, only the criteria named in',
        'rev-1 findings plus the T9 preserve-list. Amendments to FR text outside those specific criteria would not have been',
        'caught by this pass.',
      ].join(' '),
    },
  ],
  metadata: {
    assessment_type: 'pre_implementation_testing_strategy_review',
    revision: 2,
    supersedes_testing_row: SUPERSEDES,
    rev1_verdict: 'CONDITIONAL_PASS',
    rev2_verdict: 'PASS',
    verdict_upgraded_because: 'all 6 rev-1 blocking amendments verified landed by direct re-measurement of the live PRD row, with substance (falsifiability clauses) intact, and the T9 preserve-list confirmed undamaged',
    verification_method: 're-queried product_requirements_v2 and diffed against rev-1 findings; positive checks on amended text AND negative greps for the two stale premises; spot-checked falsifiability clauses rather than keyword presence',
    prd_updated_at_verified: '2026-08-24T03:05:35.523667Z',
    test_scenarios_before: 24,
    test_scenarios_after: 32,
    rev1_blocking_amendments_applied: 6,
    rev1_blocking_amendments_outstanding: 0,
    exec_started: false,
    tests_executed: false,
    read_only: true,
    ddl_executed: false,
    amendment_verification: {
      'TS-11 inverted to REJECTED': 'VERIFIED — plus the pg_trigger_depth() probe-table fixture-validity clause, so it cannot degrade into a duplicate of TS-1',
      'TS-18 leg 2 retargeted off dead updateStatus()': 'VERIFIED — scenario AND expected both updated; TS-20 correctly left untouched (advisory scanner, reachability-irrelevant)',
      'TS-25..TS-32 added': 'VERIFIED — 32 total, contiguous; TS-25 mirror assertion, TS-27 restore-and-verify, TS-31 both halves all present',
      'acceptance_criteria[0] extended past the TS array': 'VERIFIED — now states explicitly that the TS array alone is not the definition of done',
      'implementation_approach corrected': 'VERIFIED — "proves the exemption" absent; sole updateStatus mention is a negative exclusion; registry replace-and-restore primitive added; harness narrowed to the ~10-object stub; tests/ddl precedent + tier boundary recorded',
      'FR-2 AC#6 split pre-apply/post-apply': 'VERIFIED — Stage 1 read-only catalog SELECT + offline bounding assertion (TR-1-compliant), Stage 2 post-apply position assertion',
      'T9 preserve-list untouched': 'VERIFIED — FR-3 AC#7, FR-6 AC#3, FR-4 AC#5 all present and unweakened',
    },
    new_finding_T10: {
      summary: 'FR-1 AC#5 requires the SQLSTATE round-trip resolved BEFORE EXEC proceeds; TS-29 scopes it to a genuine rejection in the live-PostgREST tier, unreachable until the chairman-gated apply; acceptance_criteria[0] exempts TS-29 as tier-deferred',
      class: 'same as rev-1 T6 (criterion unsatisfiable in the phase responsible for it) — survived because T6 was fixed at the specific criterion rather than swept for as a class',
      why_higher_stakes_than_T6: 'the entire error-channel discrimination strategy rests on the answer; risk-agent F7 rejected the pre-check-SELECT alternative on four grounds including regressing SD-LEO-FIX-POST-MERGE-AUTOMATION-001 FR-2. If SQLSTATE does not round-trip, the fallback is message-text matching, which collides with FR-1 AC#4 "0 rows" constraint.',
      recommended_fix: 'split TS-29 like FR-2 AC#6. STAGE 1 (EXEC): throwaway scratch table + minimal SDCW1-raising trigger + real supabase-js .update().eq(...) => assert error.code===SDCW1. The question is generic to the PostgREST error-translation layer and needs neither this trigger nor this table. STAGE 2 (post-apply): same assertion against the real guard, confirmation not discovery.',
      tr1_caveat: 'a throwaway scratch table + trigger IS live DDL, just not on strategic_directives_v2, and carries none of the ACCESS-EXCLUSIVE-on-a-hot-table risk TR-2 exists to prevent. It still needs an explicit narrow TR-1 carve-out rather than EXEC-time reinterpretation.',
      blocking: false,
    },
    not_re_verified: 'did not re-read all 8 FRs end to end — only the criteria named in rev-1 findings plus the T9 preserve-list. FR text changes outside those would not have been caught.',
    method: 'live re-query of product_requirements_v2; targeted re-read of amended scenarios/criteria; negative greps for stale premises in implementation_approach; no code written, no tests executed, no DDL',
  },
  execution_time_ms: 420000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('SUPERSEDES=' + SUPERSEDES);
console.log('AMENDMENTS_OUTSTANDING=' + results.metadata.rev1_blocking_amendments_outstanding);
console.log('NEW_FINDING=T10 blocking=' + results.metadata.new_finding_T10.blocking);
console.log('REPO_PATH=' + results.metadata.repo_path);
