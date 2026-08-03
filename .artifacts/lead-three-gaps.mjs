import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-THREE-GAPS-APPLIED-001';

const explore = {
  verdict: 'WARNING', confidence: 92,
  summary:
    'All three FR premises measured against live Postgres before any PRD text was written. Two confirmed as '
    + 'stated, one confirmed with a material refinement the SD does not carry, and one of my own suspicions '
    + 'REFUTED by measurement. FR-2 and FR-3 are the same defect class, which changes the shape of the fix.',
  findings: [
    { id: 'g1-confirmed-security-definer-plus-bypassrls-plus-anon-execute', severity: 'critical', note: 'MEASURED, live: public.record_venture_error has prosecdef=true, is owned by postgres whose rolbypassrls=true, and anon holds EXECUTE (alongside authenticated, service_role, postgres). That is exactly the combination no RLS policy on feedback can constrain, so the SD core claim stands unmodified: any artifact asserting anon-cannot-reach-the-chairman-queue is false as stated.' },
    { id: 'g1-severity-high-is-only-one-of-two-insert-paths', severity: 'critical', note: 'THE REFINEMENT THE SD DOES NOT CARRY. The function has TWO inserts, not one: the normal path writes (issue, new, MEDIUM) and the storm-watermark path writes (issue, new, HIGH). The SD states flatly that it inserts severity=high, which is true only on the storm path; a plain anon call produces medium, which the ingress policy already permits. Encoding the SD sentence unqualified would misstate the reachable surface in the PRD.' },
    { id: 'the-inferred-not-caller-controlled-assessment-is-weaker-than-stated', severity: 'critical', note: 'The SD carries forward an assessment that this is not currently critical because severity is hard-coded rather than caller-controlled. Hard-coded is accurate. NOT-CALLER-CONTROLLED IS NOT. p_error_hash is a caller parameter and the storm ceiling is v_ceiling constant integer := 20 distinct fingerprints per venture per hour, so an anon caller can deliberately submit 21 distinct hashes to trip the ceiling and cause the severity=high row. WHICH hard-coded value fires is caller-influenceable. The inference must be re-stated with its reachability condition rather than inherited verbatim.' },
    { id: 'fr2-confirmed-the-pair-is-embedded-literally', severity: 'warning', note: 'MEASURED: policy anon_feedback_ingress_bounds carries severity IS NULL OR severity <> ALL (ARRAY[critical, high]) inline, plus the category exclusion and the count(*)<50 telegram subquery. The copied pair is real and is a single-representation violation spanning DDL and a separately-editable view.' },
    { id: 'fr3-hazard-is-future-not-live-my-own-suspicion-refuted', severity: 'warning', note: 'PROCESS FINDING IN MY OWN FAVOUR ONLY BECAUSE I CHECKED. I suspected the limit was ALREADY failing open: it counts source_type=telegram rows while select_feedback_policy exposes only feedback_type LIKE user_%, and 0 of 1 live telegram rows match that. Measuring polroles refuted it — select_feedback_policy binds to AUTHENTICATED, not anon; anon SELECT is telegram_bot_select_feedback USING (source_type=telegram), which exposes exactly the rows the limit counts. The count works today. The SD framing (a future hardening disarms it) is correct and my hunch was wrong.' },
    { id: 'fr2-and-fr3-are-one-defect-class-not-two', severity: 'critical', note: 'THE FINDING THAT SHOULD SHAPE THE PRD. Both are an UNDECLARED DEPENDENCY BETWEEN TWO SEPARATELY-EDITABLE OBJECTS: FR-2 is policy-pair <- view-pair; FR-3 is INSERT-policy-subquery <- SELECT-policy-breadth. In both, the two sides agree today, neither knows the other exists, and no mechanism notices divergence. That argues for ONE two-sided divergence fence covering both couplings rather than two unrelated fixes, and it means FR-3 acceptance must assert on the COUPLING, not merely that the limit rejects past 50.' },
    { id: 'restrictive-is-load-bearing-and-easy-to-drop-in-a-rework', severity: 'critical', note: 'HAZARD FOR THE MIGRATION. anon_feedback_ingress_bounds is the ONLY restrictive policy on feedback, and anon simultaneously holds TWO permissive INSERT policies (telegram_bot_insert_feedback, venture_user_insert_feedback). Permissive policies OR together, so any migration that recreates this policy without restating AS RESTRICTIVE silently disarms the entire bound while still appearing present in pg_policy. Same shape as the security_invoker omission caught on a prior SD.' },
    { id: 'test-data-population-is-one-row', severity: 'info', note: 'MEASURED: feedback holds exactly 1 row with source_type=telegram, 0 of them feedback_type LIKE user_%. Any acceptance test asserting the 50-row limit must SEED its own rows; relying on live data would assert against a population of one and pass vacuously.' },
  ],
  metadata: {
    phase_intent: 'LEAD groundwork — premise verification before PRD',
    premises_confirmed: 2, premises_refined: 1, own_hypotheses_refuted: 1,
    ddl_applied: 0, reads_only: true,
    mechanism_verifications: [
      { verified_by: 'the function is SECURITY DEFINER owned by a bypassrls role and anon can execute it', verified_at: 'pg_proc.prosecdef=true; pg_roles owner=postgres rolbypassrls=true; information_schema.routine_privileges grantee=anon privilege=EXECUTE' },
      { verified_by: 'there are two insert paths with different hard-coded severities', verified_at: 'pg_get_functiondef(record_venture_error): normal path VALUES (... issue, new, medium); storm path VALUES (... issue, new, high)' },
      { verified_by: 'the severity pair is embedded literally in the applied policy', verified_at: "pg_policy anon_feedback_ingress_bounds polwithcheck: severity <> ALL (ARRAY['critical','high'])" },
      { verified_by: 'the rate-limit count is NOT starved today', verified_at: 'pg_policy.polroles: select_feedback_policy -> authenticated; telegram_bot_select_feedback -> anon USING (source_type=telegram), which covers the limit WHERE clause exactly' },
      { verified_by: 'the ingress bound is RESTRICTIVE and alone among permissive peers', verified_at: 'pg_policy.polpermissive=false for anon_feedback_ingress_bounds; telegram_bot_insert_feedback and venture_user_insert_feedback are permissive on the same role/cmd' },
    ],
  },
  execution_time_ms: 900000,
};

const validation = {
  verdict: 'CONDITIONAL_PASS', confidence: 90,
  summary:
    'Scope is coherent and correctly bounded, and the SD does the rare right thing of labelling its own '
    + 'MEASURED vs INFERRED. Conditions: one premise must be re-stated before it is encoded, and the G2 '
    + 'exclusion must be actively evidenced at completion rather than assumed.',
  findings: [
    { id: 'condition-restate-the-severity-premise-before-encoding-it', severity: 'critical', note: 'CONDITION 1. The PRD must not inherit "inserts rows with severity=high" verbatim. Measured truth is two paths (medium normal, high on storm) and a caller-influenceable trigger via p_error_hash against a 20-fingerprint ceiling. An SD text that overstates reachability produces acceptance criteria that test the wrong path — the exact failure the prior SD in this session hit twice, where 2 of 9 criteria would have regressed their targets if implemented as written.' },
    { id: 'condition-g2-must-be-evidenced-not-assumed-excluded', severity: 'warning', note: 'CONDITION 2. Success criterion 5 requires that completing this SD does not imply G2 is fixed, and that evidence states G2 status explicitly. That is an easy criterion to satisfy silently and wrongly — the honest form is a positive statement of G2 status at completion, not the absence of G2 work. Flagged now so it is designed in rather than remembered at LEAD-FINAL.' },
    { id: 'chairman-gate-is-correctly-identified-and-must-not-be-eroded', severity: 'critical', note: 'Every FR terminates in DDL against an APPLIED permission policy, a SECURITY DEFINER function grant, or both. Success criterion 4 puts all migrations in database/chairman-gated/ and routes the apply through the ceremony. The builder STAGES; the chairman APPLIES — and that holds even inside a rolled-back transaction. Read-only validation of DDL bodies is the permitted substitute and was used for all measurement in this phase.' },
    { id: 'scope-is-right-sized-for-one-sd-because-the-three-share-a-root', severity: 'info', note: 'The SD states the shared shape as the security reasoning being correct in the author head and nowhere in the system. Measurement supports that and sharpens it: FR-2 and FR-3 are literally the same undeclared-dependency class, so a single fence can cover both. That makes the three FRs cohesive rather than three unrelated tickets bundled for convenience, and it supports keeping them in one SD.' },
    { id: 'acceptance-asserts-on-the-claim-not-only-the-code', severity: 'info', note: 'FR-1 acceptance explicitly covers the CLOSURE LANGUAGE, not just the grant — no artifact may keep asserting unreachability the function contradicts. That is the correct shape: a false closure claim is worse than an open gap because it stops anyone looking. Worth preserving verbatim into the PRD.' },
  ],
  metadata: { conditions: 2, ddl_applied: 0, chairman_gated_frs: 3 },
  execution_time_ms: 600000,
};

for (const [code, name, payload] of [['Explore', 'Codebase Explorer', explore], ['VALIDATION', 'Principal Systems Analyst', validation]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'LEAD' });
  console.log('STORED ' + code + '/LEAD id=' + (s && s.id));
}
