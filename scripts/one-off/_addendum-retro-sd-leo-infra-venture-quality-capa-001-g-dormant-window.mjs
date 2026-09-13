// Addendum to the already-enhanced SD_COMPLETION retrospective for
// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (see the sibling
// _enhance-retro-sd-leo-infra-venture-quality-capa-001-g.mjs for the base enhancement).
//
// Folds in a finding VALIDATION surfaced in a follow-up pass (sub_agent_execution_results
// 904dad8f-de71-4a97-9832-b5b5006aa4aa, recorded AFTER the retro was first enhanced): moving
// VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT from 2026-09-13T21:00:00.000Z to
// 2026-09-21T00:00:00.000Z (the correct fix for the unfixable-ABSENT-row race) has its own
// consequence -- gradeVentureArtifactProvenance()'s preCutover short-circuit (lib/eva/
// venture-artifact-provenance.js:36-37) fires BEFORE the stamp is ever checked, so provenance
// grading is genuinely DORMANT (not merely "safely lenient") for every row, stamped or not,
// until 2026-09-21. PRD AC#1's live write+readback and TR-6's flip-to-block criterion cannot
// be meaningfully performed before that date. Independently re-verified here: read the live
// constant (2026-09-21T00:00:00.000Z, lib/eva/artifact-persistence-service.js:88) and the
// preCutover short-circuit ordering (venture-artifact-provenance.js:36-37) myself rather than
// taking the finding on faith.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { RetrospectiveQualityRubric } from '../modules/rubrics/retrospective-quality-rubric.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { updateRetrospectiveWithToken } from '../../lib/retro/write-with-token.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = 'a99fe639-b61e-4c24-9e1d-3d0342198d2a';
const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G';
const SD_UUID = 'db7ec4de-4328-4220-9faf-d89df9c0667c';

async function main() {
  const { data: sd, error: sdErr } = await s.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) { console.error('SD LOOKUP ERROR:', sdErr.message); process.exit(1); }
  if (sd.id !== SD_UUID) { console.error(`SD UUID MISMATCH: expected ${SD_UUID}, got ${sd.id}`); process.exit(1); }

  const { data: existing, error: readErr } = await s
    .from('retrospectives')
    .select('what_needs_improvement, key_learnings, action_items, description')
    .eq('id', RETRO_ID)
    .single();
  if (readErr) { console.error('READ ERROR:', readErr.message); process.exit(1); }

  const newImprovement = "NEW-SD-21-INERT-WINDOW: moving the cutover constant to 2026-09-21T00:00:00.000Z to close the ABSENT-row race (see above) has its own consequence -- gradeVentureArtifactProvenance()'s preCutover short-circuit fires BEFORE the stamp is checked, so provenance grading is genuinely DORMANT (every row, stamped or not, grades leniently) until 2026-09-21, not merely 'safely defaulting'. PRD AC#1's live write+readback and TR-6's 'clean readback before flip-to-block' criterion cannot be meaningfully performed before that date and must be explicitly scheduled after it (VALIDATION follow-up, sub_agent_execution_results 904dad8f-de71-4a97-9832-b5b5006aa4aa).";

  const newLearning = {
    category: 'CORRECT_FIX_CAN_CREATE_ITS_OWN_SCHEDULED_DEPENDENCY',
    evidence: "VALIDATION follow-up (904dad8f) independently re-checked the cutover fix and found gradeVentureArtifactProvenance()'s preCutover short-circuit (lib/eva/venture-artifact-provenance.js:36-37) evaluates BEFORE the stamp-presence check, so moving the cutover 7 days into the future to fix the ABSENT-row race makes provenance grading dormant for that entire window",
    learning: "Fixing a race by moving a boundary constant further into the future is the right tradeoff (a recoverable, visible blind window beats an unfixable, permanent ABSENT-row), but it is not a free fix -- it creates a NEW scheduled dependency: any acceptance criterion that requires the grader to actually discriminate (a live write+readback, a 'clean readback' flip-to-block criterion) becomes unattemptable until the new boundary passes, and unless that is named explicitly as a scheduled follow-up, it silently becomes a step nobody can execute and nobody notices is still pending.",
    applicability: "When a fix moves a boundary/cutover constant forward to close a race, explicitly enumerate every acceptance criterion or follow-up action that depends on the grader being ACTIVE (not merely correct) and schedule those for after the new boundary date, rather than leaving them as ordinary open action items with no date dependency called out.",
  };

  const newActionItem = {
    owner: 'EXEC (scheduled, post-2026-09-21)',
    action: "Do not attempt PRD AC#1's live AltifyAI write+readback or TR-6's flip-to-block 'clean readback' criterion before 2026-09-21T00:00:00.000Z -- gradeVentureArtifactProvenance()'s preCutover short-circuit makes any earlier attempt grade every row leniently regardless of stamp presence, which would read as a false pass.",
    source: 'validation_finding_904dad8f_dormant_window',
    priority: 'high',
    smart_format: true,
    success_criteria: 'The live write+readback and TR-6 flip-to-block readback are both performed on or after 2026-09-21T00:00:00.000Z, with the attempt date recorded alongside the result.',
    evidence_ref: 'sub_agent_execution_results 904dad8f-de71-4a97-9832-b5b5006aa4aa (VALIDATION follow-up, PLAN-VERIFY)',
  };

  const update = {
    what_needs_improvement: [...existing.what_needs_improvement, newImprovement],
    key_learnings: [...existing.key_learnings, newLearning],
    action_items: [...existing.action_items, newActionItem],
  };

  const boilerplateCheck = RetrospectiveQualityRubric.detectBoilerplate(update);
  if (boilerplateCheck.hasBoilerplate) {
    console.error('BOILERPLATE PATTERN(S) DETECTED — fix before inserting:');
    console.error(JSON.stringify(boilerplateCheck.matches, null, 2));
    process.exit(1);
  }
  console.log('Boilerplate check: PASS (0 patterns matched)');

  const { data, error } = await updateRetrospectiveWithToken(
    (payload) => s.from('retrospectives').update(payload).eq('id', RETRO_ID).select('id, sd_id, quality_score, status').single(),
    update,
    'retro_sub_agent'
  );

  if (error) { console.error('ADDENDUM ERROR:', error.message); process.exit(1); }
  if (data.sd_id !== sd.id) {
    console.error(`ADDENDUM ERROR: RETRO_ID ${RETRO_ID} belongs to sd_id=${data.sd_id}, not ${SD_KEY} (${sd.id})`);
    process.exit(1);
  }

  console.log('Addendum applied to retrospective', data.id, '- quality_score:', data.quality_score, '- status:', data.status);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
