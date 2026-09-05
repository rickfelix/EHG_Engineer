#!/usr/bin/env node
/**
 * Shadow re-score for FR-9 (SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A), closing VALIDATION
 * finding F1: the existing gate-threshold-shadow-rescore.mjs mechanism (QF-20260902-515)
 * scores a DIFFERENT threshold family (ai_quality_assessments.weighted_score vs pass_threshold)
 * and cannot produce a row for this candidate (THRESHOLD_PROFILES.feature.gateThreshold /
 * SD_TYPE_THRESHOLD). This is a one-off, hand-computed shadow row in the SAME category and
 * shape, using numbers independently verified by the validation-lead-gate-003a sub-agent and
 * spot-checked by LEAD directly against sd_phase_handoffs (specimen SD
 * 2fe1b52c-38ae-47bf-9c4b-70d78286acf3 / SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-A: exactly
 * 3 EXEC-TO-PLAN rejections confirmed present, matching the sub-agent's claim).
 *
 * NO THRESHOLD IS CHANGED. This reports pass-rate/flip deltas only, per the same discipline as
 * the sibling instrument.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { emitFeedbackBatch } from '../../lib/governance/emit-feedback.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CHILD_SD_ID = 'f86e0aca-0de0-4e20-8319-db947f0337ea'; // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A

const n = 8; // total EXEC-TO-PLAN SD_TYPE_THRESHOLD rejection attempts landing in the 80-84.99% band, feature type
const distinctSds = 4;
const alreadyResolvedViaRetryGreen = 3; // GATE2 zone=GREEN on a later retry -> already 'completed', accept would not have changed outcome
const realisticNewlyAccepted = 1; // the specimen (SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-A), still blocked as of this writing

const item = {
  title: 'Gate-threshold shadow re-score: feature/SD_TYPE_THRESHOLD gate2_yellow_accept (85% threshold, 80-84.99% band)',
  description: `Shadow re-score (no change applied): sd_type=feature, gate=SD_TYPE_THRESHOLD, `
    + `current_threshold=85 (THRESHOLD_PROFILES.feature.gateThreshold), candidate=gate2_yellow_accept `
    + `(FR-9, SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A). Historical population: all EXEC-TO-PLAN `
    + `SD_TYPE_THRESHOLD rejections for feature-type SDs (5,370 total EXEC-TO-PLAN handoffs surveyed). `
    + `n=${n} rejection attempts across ${distinctSds} distinct SDs land in the 80-84.99% accept band. `
    + `${alreadyResolvedViaRetryGreen} of ${distinctSds} SDs already reached 'completed' via a later retry `
    + `scoring GATE2 zone=GREEN, so the candidate would not have changed their outcome -- only accelerated it. `
    + `Realistic newly-accepted count: ${realisticNewlyAccepted} SD (the specimen, `
    + `SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-A, still blocked as of this writing, 3 rejected attempts). `
    + `fail_to_pass_flips=${n} (attempts), pass_to_fail_flips=0 -- and the 0 is a STRUCTURAL PROOF, not a `
    + `measurement: the accept branch lives entirely inside the pre-existing 'normalizedScore < threshold' `
    + `block and its only writes are results.yellowZoneAccept plus a log line, so no code path under this `
    + `change can newly set results.passed=false. Observability gap: rejected handoffs persist no gate `
    + `results (sd_phase_handoffs.metadata is {artifact_hash} only on a rejection), so the exact historical `
    + `conjunction (band AND GATE2 zone=YELLOW AND GATE2 passed) cannot be retroactively falsified from `
    + `stored data -- band membership and sd_type were verified directly against sd_phase_handoffs and `
    + `strategic_directives_v2; per-attempt GATE2 zone was not persisted historically for rejected runs.`,
  category: 'gate_threshold_shadow',
  sd_id: CHILD_SD_ID,
  dedup_key: 'gate_threshold_shadow:feature:SD_TYPE_THRESHOLD:85:gate2_yellow_accept',
  metadata: {
    sd_type: 'feature',
    gate: 'SD_TYPE_THRESHOLD',
    current_threshold: 85,
    candidate: 'gate2_yellow_accept',
    n_attempts_in_band: n,
    n_distinct_sds_in_band: distinctSds,
    n_sds_already_resolved_via_retry_green: alreadyResolvedViaRetryGreen,
    n_sds_realistically_newly_accepted: realisticNewlyAccepted,
    fail_to_pass_flips: n,
    pass_to_fail_flips: 0,
    pass_to_fail_flips_basis: 'structural_proof_not_measurement',
    specimen_sd_key: 'SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-A',
    specimen_sd_id: '2fe1b52c-38ae-47bf-9c4b-70d78286acf3',
    data_source: 'sd_phase_handoffs (handoff_type=EXEC-TO-PLAN, status=rejected) cross-referenced with strategic_directives_v2.sd_type',
    observability_gap: 'rejected handoffs persist no gate_results (metadata={artifact_hash} only) -- worth its own observability ticket per validation-lead-gate-003a F1/F2',
    verified_by: 'validation-lead-gate-003a sub-agent evidence row 02f4788a-421d-4933-a069-1c11a7dbc030 (LEAD-TO-PLAN, CONDITIONAL_PASS); spot-checked by LEAD via direct query confirming exactly 3 EXEC-TO-PLAN rejections for the specimen SD',
    child_sd_key: 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A',
  },
};

const result = await emitFeedbackBatch({ supabase, items: [item] });
console.log(`wrote ${result.inserted.length} row(s), deduped ${result.deduped.length}, skipped ${result.skipped}.`);
console.log(JSON.stringify(result, null, 2));
console.log('\nNo threshold was changed. This is decision input only.\n');
