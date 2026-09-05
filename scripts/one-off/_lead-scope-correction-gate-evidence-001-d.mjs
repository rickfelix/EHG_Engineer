import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: "Run a fixture LEAD-FINAL-APPROVAL handoff where WIRE_CHECK_GATE (required:true in source) fails. Inspect the resulting sd_phase_handoffs.metadata.gate_results entry for WIRE_CHECK_GATE.",
    expected_outcome: "required:true is persisted (not the current unconditional false) -- confirms the fix reads the gate's real declared requiredness, not a value that always collapses to false."
  },
  {
    step_number: 2,
    instruction: "Run a fixture LEAD-FINAL-APPROVAL handoff for an SD whose newest sub-agent evidence predates the current LEAD phase start by more than the staleness threshold.",
    expected_outcome: "GATE_ACTIVATION_INVARIANT fails with the evidence age stated, not merely a console warning -- closing the gap where evidence staleness at LEAD-FINAL-APPROVAL currently has no check at all (not 'advisory', absent)."
  },
  {
    step_number: 3,
    instruction: "Query bypass_ledger rows with phase='LEAD-FINAL-APPROVAL' after the fix.",
    expected_outcome: "handoff_id and sd_id are populated (not the current 0/33), making the join to sd_phase_handoffs structural rather than a soft sd_key match."
  },
  {
    step_number: 4,
    instruction: "Run the committed gate-census artifact/test.",
    expected_outcome: "Every LEAD-FINAL-APPROVAL gate module's disposition (required/not, enforcement-flag status if any, live/dead-registration) is named and asserted in CI, not just described in prose."
  },
];

const scopeNote = `LEAD scope correction (2026-09-05, Explore evidence + independent validation-agent and risk-agent re-measurement against live DB/code, all three surfacing corrections the SD's own pre-authored text got wrong):

- CORRECTED FR-D1 (dead gates / required persistence): the SD's "9 of 31 gates" framing is wrong on both numbers -- only 22 gates are actually registered in getRequiredGates() (lead-final-approval/gates.js), of which 16 declare required:true (not 9; the SD's 9 missed 8 gates defined inline in gates.js itself, e.g. SdStart/PRMergeVerification/RetrospectiveExists). 2 of the SD's own 9 named files are DEAD CODE never wired into the runtime pipeline at all (runtime-probe-coverage-gate.js, lead-final-approval/gates/acceptance-criteria-traceability.js) -- fixing their persistence would have zero live effect. The real, live, unconditional bug (confirmed against 500/500 sampled production rows -- 15,476/15,476 gate_results entries read required:false, including WIRE_CHECK_GATE which is required:true in source) is at lead-final-approval/index.js:43's projectGateResultsForPersistence(), which reads .required off the wrong sibling object (the validator's RETURN VALUE, which no validator populates except one: fr-delivery-classifier.js, which sets it DYNAMICALLY and deliberately, e.g. false when its own enforcement flag is off). Root-cause fix: merge the gate's static required (ValidationOrchestrator.js:352/359's already-correct-but-orphaned gateStatuses, predicate gate.required !== false) into results.gateResults at the one place it's built (ValidationOrchestrator.js:343), preserving any validator-set dynamic value as required_effective rather than overwriting it -- this repairs projectGateResultsForPersistence with no further edit AND repairs the other 3 downstream writers (HandoffRecorder.recordFailure/createArtifact/_recordCompletionActionFailure) for free, since they all read the same results.gateResults object. CI asserts the corrected 16 by name (the SD's original 9 are a verified subset); the parent CAPA's own criteriaD[3] baseline ("none of those 5 are required") is corrected in the same PR -- it read the buggy persisted required:false and concluded gates were optional when in fact all 5 named gates (PR_MERGE_VERIFICATION, RETROSPECTIVE_EXISTS, GATE_ACTIVATION_INVARIANT, USER_STORIES_COMPLETE) declare required:true; they were accepted via BYPASS, not because they were optional.

- CORRECTED FR-D2 (staleness): the SD's "advisory-only" framing is wrong -- subagent-evidence-gate.js's detectStaleEvidence is not merely soft at LEAD-FINAL-APPROVAL, it DOES NOT RUN THERE AT ALL (the whole gate module is wired only into LEAD-TO-PLAN/PLAN-TO-EXEC/EXEC-TO-PLAN/PLAN-TO-LEAD; even where wired, detectStaleEvidence itself only fires for handoffType==='EXEC-TO-PLAN' by deliberate design, since a commit-SHA mismatch is the NORMAL state elsewhere). A naive port of detectStaleEvidence's commit-SHA-equality predicate to LEAD-FINAL-APPROVAL would be vacuous by construction: it depends on sd.worktree_path, which is null or already-reaped for 57/60 of the most recently completed SDs (measured) -- it would silently no-op ~95% of the time while reading as wired, exactly the failure shape flagged elsewhere in this project's own memory. CORRECTED approach: add a DB-only, age/phase-start-based staleness check (no worktree/git dependency) inside GATE_ACTIVATION_INVARIANT (already registered, already required:true at LEAD-FINAL-APPROVAL, already imports the shared provenance-mode resolver) rather than commit-SHA-strict -- measured impact at a 72h threshold is 0.8% of the trailing-30-day fleet (1/120), versus 93.3% (112/120) for a SHA-strict rule, since post-merge fix commits routinely advance HEAD past evidence by design. This reuses (and, per the SD's own correction note, must fix rather than bypass) lib/sub-agent-executor/evidence-provenance.js's normalisePhase()/PHASE_MAP, which is still missing bare 'PLAN' and 3 of 4 hyphenated handoff-type spellings (measured: ~51% of the trailing-30-day evidence rows fail to normalise) -- add the missing keys and add a LEAD-FINAL-APPROVAL entry to HANDOFF_TYPE_TO_PHASE (mapping to 'LEAD', matching subagent-evidence-gate.js's own phase-start resolver for consistency), but deliberately leave 'orchestrated' unmapped (that is a separate, larger design decision, not a bugfix). Ships with a kill-switch env var following the codebase's existing convention (LEO_DISABLE_STALE_EVIDENCE_CHECK precedent).
  - OUT OF SCOPE, routed separately (not absorbed): a live, unrelated bug in sibling A's gradeProvenance() content-hash check (results-storage.js:840 hashes the in-memory record; evidence-provenance.js:137 recomputes over the DB-read-back row; jsonb round-tripping changes representation, causing 59/93 post-cutover hash-bearing rows to false-fail as content_hash_mismatch) -- signaled to the coordinator (2026-09-05) for a QF against child A. This SD's new staleness check does not depend on gradeProvenance's content-hash grading, only on evaluated_commit_sha/created_at, so it is unaffected by that bug.

- CORRECTED FR-D3 (env-flag-gated dead branches): the SD named 2 flags (ENFORCE_ADKAR_GATE, ENFORCE_LEARNING_GATE); research found 5 total (adding ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING, INVOCATION_PATH_PROOF_MODE, and SUBAGENT_EVIDENCE_PROVENANCE_MODE), and found ENFORCE_LEARNING_GATE's "dead branch" framing itself wrong -- learning-or-bypass-resolved-gate.js already contains an unconditional hard block on unresolved phase-chain bypasses that explicitly does NOT depend on the flag; the flag only gates a secondary, narrower check. Per the parent CAPA's own ratified rule (a zero-yield census is "evidence to investigate, never a removal warrant," requiring a per-gate reachability proof before removing any branch), and per a prior sibling SD's own documented caution against flipping ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING without first spot-checking its false-positive rate: this SD turns ON only ENFORCE_ADKAR_GATE (measured zero-risk: only 1 of 6,089 SDs has ever set metadata.requires_adoption=true, and that SD is already completed -- zero in-flight exposure, honestly reported as a zero-delta flip rather than implied as a meaningful behavior change). The other 4 flags remain observe-only, each with a one-line documented rationale in the gate-census artifact (FR-D4) rather than silently left unexplained. No branch is removed.

- CORRECTED FR-D4 (bypass rate): the SD's proposed source (validation_details.bypass on accepted rows) was found structurally incapable of ever populating for LEAD-FINAL-APPROVAL specifically -- the canonical accepted-row write (lead-final-approval/index.js, its own dedicated insert) never routes through HandoffRecorder.recordSuccess()'s bypass-stamping path at all. The CORRECT, already-populated source is bypass_ledger (33 LEAD-FINAL-APPROVAL rows; the already-holding invariant -- every one of the 22 accepted rows with a failing required gate joins to a bypass_ledger row, 22/22 -- was independently measured and confirmed). The real defect is JOINABILITY: bypass_ledger.handoff_id is 0/33 populated for this phase (sd_id is 2/33; only sd_key, a soft/renameable key, is 33/33), making the join informal rather than structural. Fix: populate handoff_id/sd_id on the LEAD-FINAL-APPROVAL bypass_ledger write path, and CI-assert the already-holding 22/22 invariant so it cannot silently regress. The SD's literal exit criterion ("re-measured trailing-30-day bypass share is lower than the 32/158 baseline") is RE-CUT to an observation-only KPI, not a code-enforceable pass/fail: the trailing-30-day share is currently measured at 34.2% (27/79), HIGHER than the cited 20.3% baseline, and is dominated by fail-closed infrastructure outages (a dead GEMINI_API_KEY causing RETROSPECTIVE_EXISTS bypasses, PR_MERGE_VERIFICATION git-subprocess timeouts) rather than gate evasion -- this SD's code cannot move an infra-outage-driven metric, and asserting otherwise would misrepresent what shipped. The dead-API-key finding is signaled separately (2026-09-05), not absorbed here.

Net: all 4 of the SD's original FRs needed correction (not merely 3 as in sibling C) -- two numeric/scope errors (D1's 9/31 miscount, D3's 2-of-5-flags undercount), one claim that was categorically wrong in a way that changes the fix location entirely (D2: "advisory" vs "does not run here"), and one that targeted a field structurally incapable of being populated on the relevant write path (D4). The parent's own ratified success_criteria text (criteriaD[3]) is itself shown to be corrupted by the exact bug FR-D1 fixes -- this is the strongest evidence for why FR-D1 matters and is documented as such rather than quietly patched around.`;

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    scope_reduction_percentage: 25,
    smoke_test_steps: smokeTestSteps,
  })
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D');

if (error) { console.error('update1 error:', error); process.exit(1); }

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D')
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const newMetadata = { ...(row.metadata || {}), lead_scope_correction: scopeNote };
const { error: metaErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D');
if (metaErr) { console.error('update2 error:', metaErr); process.exit(1); }

console.log('OK: scope_reduction_percentage=25, smoke_test_steps updated, metadata.lead_scope_correction recorded.');
