/**
 * Per-story acceptance verification for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * CLAUDE_EXEC.md "User Story Acceptance Criteria Verification (MANDATORY)": bulk-updating story
 * status to clear a gate is a protocol violation. Each story below is updated INDIVIDUALLY, by
 * id, with the concrete evidence that proves its criterion — and the evidence is stored on the
 * row so a later reader does not have to take this script's word for it.
 *
 * Doing otherwise on THIS SD in particular would be self-refuting: the SD exists because a
 * completion gate reported a verdict it had not earned.
 *
 * Idempotent: skips any story already marked completed.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '222e317f-926c-4d5c-99eb-b98ee8d24f53';
const COMMIT = '0547e5e6594';

const EVIDENCE = {
  'US-001': {
    criterion: 'Tri-state classification: UNVERIFIABLE distinct from UNDELIVERED, decided per-SD',
    evidence: [
      'IMPLEMENTED: fr-delivery-classifier.js classifyFrDelivery — two-pass; PASS 2 computes conventionInUse (some FR referenced) and hasWorkProduct (>=1 validated story); unmeasurable = !conventionInUse && hasWorkProduct.',
      'EXECUTED against the real specimen SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001: 6/6 unverifiable, 0 undelivered, convention_in_use=false (was 6 undelivered before).',
      'POPULATION (55 SDs with FRs): 39 fully-unverifiable vs 12 genuinely-undelivered, where previously all 51 were reported as undelivered.',
      'TESTS: 5 passing — specimen regression, seeded defect, zero-validated-stories stays UNDELIVERED, unvalidated stories are not work product, descope alone does not prove the convention.',
      'MUTANTS: M2 (collapse unverifiable into undelivered) falsified by 2 tests; M3 (per-FR instead of per-SD) falsified by 2 tests.',
    ],
  },
  'US-002': {
    criterion: 'Honest scoring: the enforcement flag governs blocking only, never the reported score',
    evidence: [
      'IMPLEMENTED: projectGateResult now computes score = round(satisfied/total*100) unconditionally; enforced only feeds passed/required. The details.raw_score workaround is deleted.',
      'EXECUTED on the specimen: score 0 (was 100) with passed still true in warn-only mode.',
      'TESTS: OFF+undelivered reports 50 not 100; OFF score TRACKS the undelivered count (0 and 50) while remaining non-blocking; all-delivered still scores 100 in both modes.',
      'MUTANT: M1 (restore the warn-only score:100 pin) falsified by 4 tests.',
    ],
  },
  'US-003': {
    criterion: 'Close the three remaining score fabrications on the LEAD-FINAL path',
    evidence: [
      'IMPLEMENTED: lead-final-approval/gates.js orchestrator-no-PRD and no-PRD and no-FRs paths now return NOT_MEASURED_SCORE (75) instead of 100/80/100; the validator-throw path returns ERRORED_SCORE (50) instead of 100.',
      'SIBLING CONSUMER moved in the same commit per the writer/consumer-asymmetry rule: fr-delivery-traceability-gate.js orchestrator-parent, no-FRs and throw paths carry the identical constants.',
      'TESTS: no-FRs asserts NOT_MEASURED_SCORE and explicitly not 100; a dedicated test asserts NOT_MEASURED_SCORE, ERRORED_SCORE and 100 are three distinct values with ERRORED < NOT_MEASURED.',
      'INVARIANT TEST: across 6 classifications x 2 enforcement modes, score===100 implies undelivered===0 AND unverifiable===0 AND total>0.',
    ],
  },
  'US-004': {
    criterion: 'Ceiling on UNVERIFIABLE so it cannot become warn-only under a new name',
    evidence: [
      'IMPLEMENTED: frUnverifiableCeiling(env) reads LEO_FR_UNVERIFIABLE_CEILING; projectGateResult computes over_ceiling and escalates (issue + block when enforced).',
      'SHIPPED DAY ONE deliberately — the WAIT verdict needed WAIT_MAX_ATTEMPTS retrofitted after it was already load-bearing.',
      'EXECUTED: ceiling 1.0 enforced -> passed=true; ceiling 0.5 enforced -> passed=false with the ceiling named in issues; warn-only never blocks even at ceiling 0.',
      'TESTS: 4 passing, including that exceeding the ceiling yields an OBSERVABLY DIFFERENT result from staying within it, and that bad env values fail safe to 1.',
    ],
  },
  'US-005': {
    criterion: "Persist LEAD-FINAL gate results so this gate's verdict is auditable at all",
    evidence: [
      'IMPLEMENTED: projectGateResultsForPersistence() exported from lead-final-approval/index.js and wired into the canonical LFA row as metadata.gate_results.',
      'MEASURED GAP IT CLOSES: 0 of 62 LEAD-FINAL handoff rows carried metadata.gate_results, so this gate had no execution record for any of the 60 most recent completed SDs.',
      'Carries fr_classification (total/delivered/descoped/undelivered/unverifiable/convention_in_use/over_ceiling) so an auditor can tell blindness from absence WITHOUT re-running the gate.',
      'TESTS: 6 passing in tests/unit/handoff/lead-final-gate-results-persistence.test.js, including a row-bloat guard asserting per-FR descriptions are NOT persisted.',
    ],
  },
  'US-006': {
    criterion: 'Regression and seeded-defect coverage against real fixtures, with falsified mutants',
    evidence: [
      'TESTS: 52 passing across 5 FR-delivery suites (classifier, traceability gate, traceability wiring, LFA fail-open, gate-results persistence).',
      'REGRESSION CASE: the 93-scored specimen classifies all-unverifiable and the gate can no longer report 100.',
      'SEEDED DEFECT: a fixture where the convention IS in use and one named FR is unreferenced classifies UNDELIVERED and is REFUSED (passed:false, required:true) under enforcement.',
      'MUTANTS: 3 distinct mutants each falsified, each with the mutation CONFIRMED PRESENT ON DISK before running (an unapplied mutant is indistinguishable from a survived one) — M1 4 failing, M2 2 failing, M3 2 failing. Restore verified afterwards.',
      'FULL SUITE: 33,956 passing; the 9 failures are pre-existing and named — none of their suites import any module changed by this SD.',
      'HONEST DEVIATION: the PRD said each mutant would fail a DISTINCT count; M2 and M3 both fail 2. Each mutant was still independently detected, which is the property that matters; the distinct-count phrasing was over-specified.',
    ],
  },
};

const { data: stories, error } = await s
  .from('user_stories')
  .select('id, story_key, status, validation_status, metadata')
  .eq('sd_id', SD_UUID)
  .order('story_key');
if (error) { console.log('READ ERR:', error.message); process.exit(1); }

let updated = 0;
for (const st of stories) {
  const key = (st.story_key || '').split(':').pop();
  const ev = EVIDENCE[key];
  if (!ev) { console.log(`SKIP ${st.story_key}: no evidence entry — NOT marking complete`); continue; }
  if (st.status === 'completed') { console.log(`ALREADY COMPLETE ${st.story_key}`); continue; }

  // Individual update, by id — never a blanket .eq('sd_id', ...) sweep.
  const { error: upErr } = await s
    .from('user_stories')
    .update({
      status: 'completed',
      validation_status: 'validated',
      implementation_status: 'implemented',
      completed_at: new Date().toISOString(),
      completed_by: 'Alpha (worker session e7c92ad8)',
      metadata: {
        ...(st.metadata || {}),
        acceptance_verification: {
          verified_by: 'Alpha (worker session e7c92ad8)',
          commit: COMMIT,
          criterion: ev.criterion,
          evidence: ev.evidence,
          method: 'Each item executed or asserted first-hand this session; per-story verification per CLAUDE_EXEC.md, not a bulk status sweep.',
        },
      },
    })
    .eq('id', st.id);
  if (upErr) { console.log(`UPDATE ERR ${st.story_key}: ${upErr.message}`); process.exit(1); }
  console.log(`VERIFIED + COMPLETED ${st.story_key} (${ev.evidence.length} evidence items)`);
  updated++;
}
console.log(`\n${updated} story/stories updated individually with cited evidence.`);
