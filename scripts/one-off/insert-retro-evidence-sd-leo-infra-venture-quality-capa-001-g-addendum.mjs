#!/usr/bin/env node
/**
 * RETRO sub-agent evidence follow-up row for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G.
 *
 * Supersedes 08d046cf-42cb-4025-a273-60b87a223af6 (the first RETRO evidence row) as the
 * newest RETRO row for this SD. Records that the retrospective (a99fe639) was amended with
 * one addendum finding surfaced by a VALIDATION follow-up pass AFTER the first RETRO pass:
 * moving VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT forward to close the ABSENT-row race makes
 * provenance grading dormant until 2026-09-21 (gradeVentureArtifactProvenance()'s preCutover
 * short-circuit fires before the stamp is ever checked). Same pattern as the sibling
 * scripts/one-off/insert-retro-evidence-sd-leo-infra-venture-quality-capa-001-g.mjs.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G';
const RETRO_ID = 'a99fe639-b61e-4c24-9e1d-3d0342198d2a';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 95,
  phase: 'PLAN',
  execution_time_ms: 0,
  summary: `RETRO addendum PASS for ${SD_KEY}. Retrospective ${RETRO_ID} amended (quality_score recomputed 80 -> 90) with a finding VALIDATION surfaced in a follow-up pass (sub_agent_execution_results 904dad8f-de71-4a97-9832-b5b5006aa4aa) after the first RETRO pass: moving VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT from 2026-09-13T21:00Z to 2026-09-21T00:00Z closes the unfixable-ABSENT-row race, but gradeVentureArtifactProvenance()'s preCutover short-circuit (lib/eva/venture-artifact-provenance.js:36-37) fires BEFORE the stamp is ever checked -- so provenance grading is genuinely DORMANT (every row, stamped or not, grades leniently) until 2026-09-21, not merely 'safely defaulting'. PRD AC#1's live write+readback and TR-6's flip-to-block criterion are scheduled dependencies of that date, now recorded as such in both the retrospective and the PRD risk list.`,
  critical_issues: [],
  warnings: [
    'This is the same cutover fix already covered by the base RETRO evidence row (08d046cf) -- the addendum is the newly-surfaced CONSEQUENCE of that fix (dormancy until 2026-09-21), not a new defect in the fix itself.',
    "The generalizable lesson (moving a boundary constant forward to close one race can create a new scheduled dependency for any acceptance criterion that needs the boundary's grader ACTIVE) is added as a 5th key_learnings entry; the retrospective now names this class explicitly rather than leaving the schedule dependency implicit.",
  ],
  recommendations: [
    "Do not attempt PRD AC#1's live write+readback or TR-6's flip-to-block readback before 2026-09-21T00:00:00.000Z; both would grade every row leniently regardless of stamp presence and read as a false pass.",
    'When any future SD moves a boundary/cutover constant forward to close a race, require it to explicitly enumerate every acceptance criterion that depends on the grader being active (not just correct) and schedule those after the new boundary, rather than leaving them as ordinary undated action items.',
  ],
  detailed_analysis: JSON.stringify({
    sd_key: SD_KEY,
    addendum_source: 'sub_agent_execution_results 904dad8f-de71-4a97-9832-b5b5006aa4aa (VALIDATION follow-up, PLAN-VERIFY, recorded after commit 433398b210f and after the first RETRO pass)',
    independently_reverified: {
      cutover_constant_value: '2026-09-21T00:00:00.000Z (lib/eva/artifact-persistence-service.js:88, re-read directly, not taken on faith)',
      pre_cutover_short_circuit_ordering: 'lib/eva/venture-artifact-provenance.js:36-37 -- isPreCutover computed from createdAt < CUTOVER_AT and returned BEFORE any machine_provenance field is inspected, confirming the dormancy claim by reading the actual control flow',
    },
    retrospective_id: RETRO_ID,
    retrospective_quality_score_before_addendum: 80,
    retrospective_quality_score_after_addendum: 90,
    superseded_retro_evidence_row: '08d046cf-42cb-4025-a273-60b87a223af6 (first RETRO pass, pre-addendum)',
  }),
  metadata: {
    validation_mode: 'retrospective_addendum',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    prd_id: 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    measured: true,
    retro_contribution: {
      retrospective_id: RETRO_ID,
      quality_score: 90,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RETRO',
  probeExistsRelative: 'scripts/one-off/insert-retro-evidence-sd-leo-infra-venture-quality-capa-001-g-addendum.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('RETRO', sdRow.id, { code: 'RETRO', name: 'Continuous Improvement Coach' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
