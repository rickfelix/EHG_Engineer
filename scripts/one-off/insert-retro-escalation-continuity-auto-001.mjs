#!/usr/bin/env node
/**
 * One-off: SD_COMPLETION retrospective for
 * SD-LEO-INFRA-ESCALATION-CONTINUITY-AUTO-001 (uuid 09617852-1a4c-4213-a4d2-be2b8048c632)
 *
 * born-claim + branch-seed QF->SD escalation continuity (PR #6040).
 * Inserts as DRAFT so the auto_validate_retrospective_quality trigger can
 * recompute quality_score from content, then promotes to PUBLISHED if >= 70.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createSupabaseServiceClient();
const SD_UUID = '09617852-1a4c-4213-a4d2-be2b8048c632';

const what_went_well = [
  'RCA on the cancelled QF-20260712-254 correctly isolated the failure as duplicate effort, not data loss: createFromQF birthed the escalated SD unclaimed off origin/main, and a second same-host session self-claimed it within 11 seconds and rebuilt the QF\'s already-committed fix.',
  'The fix was decomposed into four tight, independently-verifiable functional requirements (FR-1 born-claim, FR-2 branch-seed metadata, FR-3 escalated base-ref resolution, FR-4 hermetic suite) landing in a single small PR #6040.',
  'FR-1 correctly routed the born-claim through the canonical claim_sd RPC (the claude_sessions unique-index lock) rather than the mirror strategic_directives_v2.claiming_session_id column, matching the schema\'s real source of truth.',
  'The born-claim was properly guarded on three conditions - captured session non-null, session live (active/idle), and still on this QF (sd_key === qf.id) - so claim_sd\'s release-others behaviour can never yank an unrelated claim.',
  'FR-3 resolveEscalatedBaseRef() bases the new SD worktree off the LOCAL qf/<id> branch via git show-ref, deliberately skipping fetchBaseRef (which would fail on the unpushed ref) and falling back byte-identically to origin/main when the ref is absent.',
  'A deep-tier adversarial review was run on the implementation and it caught a production-fatal dead-code defect that the initial green unit suite had masked (see key learnings).',
  'FR-4 shipped a hermetic vitest suite (tests/unit/qf-escalation-continuity.test.js, 8 cases) so the continuity contract is regression-locked.'
];

const key_learnings = [
  'HEADLINE / DEAD-CODE MASKED BY A MOCK: The deep-tier adversarial review found the born-claim guard was dead code in production. FR-1 selected claude_sessions.sd_id, but that column does not exist - claim_sd migrated sd_id -> sd_key. The select returned PostgREST HTTP-400, sess resolved to null, and FR-1 (the entire point of the SD) silently never fired. The original unit test hid this because its mock returned a hand-built sd_id field, the textbook "mocked seam ships green on dead code" trap. Fix: read sd_key; surface the lookup error instead of silently no-op\'ing; and harden the mock to reproduce PostgREST\'s HTTP-400 on an unknown column so any revert to sd_id now fails the suite.',
  'A unit-test mock of a DB seam MUST validate columns against the real schema (or reproduce the DB\'s error on an unknown column); otherwise a schema-drift or a typo in the selected column ships green through the whole suite.',
  'Born-claim must go through the canonical lock (claim_sd RPC / claude_sessions unique index), never the mirror strategic_directives_v2.claiming_session_id column - confirmed by both the VALIDATION sub-agent and the schema.',
  'The escalation race was measured in single-digit seconds (11s from birth to the second session\'s self-claim), so any continuity mechanism has to be atomic at creation time - there is no polling window wide enough to close the gap after the fact.',
  'A new SD worktree cannot be based on the QF\'s local qf/<id> branch by the normal fetch path because that branch is unpushed; the base-ref resolver must verify with git show-ref locally and skip fetchBaseRef, degrading to origin/main only when the local ref is genuinely absent.',
  'Source-pin / regex-anchored tests are brittle against legitimate code additions: adding metadata.escalated_from_branch broke a regex anchor in leo-create-sd-from-qf-migration-reviewed.test.js and required relaxing the anchor rather than reverting the feature.'
];

const what_needs_improvement = [
  'The born-claim column bug (sd_id vs sd_key) should have been caught before the adversarial review - the initial unit test actively masked it by mocking a non-existent column, so the first-pass test design gave false confidence.',
  'Mocks of DB seams in this codebase are not schema-aware by default; there is no shared helper that reproduces PostgREST 400s on unknown columns, so every author re-learns this trap individually.',
  'Silent no-op on a failed session lookup (sess === null) swallowed a hard error; the code should have surfaced the lookup failure from the start instead of degrading to "just don\'t claim".',
  'Regex-anchored source-pin tests (leo-create-sd-from-qf-migration-reviewed.test.js) are tightly coupled to source layout and break on additive, correct changes like the new escalated_from_branch metadata key.'
];

const action_items = [
  { text: 'Add or adopt a schema-aware DB-mock helper that validates selected columns against the live schema (or reproduces PostgREST HTTP-400 on an unknown column), so a column typo / schema drift fails the unit suite instead of shipping green.', category: 'TESTING_STRATEGY' },
  { text: 'Audit remaining callers that read claude_sessions for any lingering sd_id references and confirm all use sd_key post-claim_sd migration.', category: 'DATABASE_SCHEMA' },
  { text: 'Make failed session lookups in born-claim paths surface the error explicitly (log + throw or signal) rather than resolving null and silently skipping the claim.', category: 'PROCESS_IMPROVEMENT' },
  { text: 'Replace brittle regex-anchor assertions in source-pin tests (leo-create-sd-from-qf-migration-reviewed.test.js) with structural/semantic checks that tolerate additive metadata keys.', category: 'TESTING_STRATEGY' }
];

const retro = {
  sd_id: SD_UUID,
  target_application: 'EHG_Engineer',
  project_name: 'born-claim + branch-seed QF->SD escalation continuity',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: 'SD-LEO-INFRA-ESCALATION-CONTINUITY-AUTO-001 Retrospective',
  description: 'Retrospective for born-claim + branch-seed QF->SD escalation continuity (PR #6040): the escalated SD is born already claimed by the QF\'s own live worker via claim_sd, and its worktree seeds off the local qf/<id> branch, closing the 11-second duplicate-effort race that surfaced on cancelled QF-20260712-254.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['RCA', 'VALIDATION', 'Adversarial Review (deep-tier)'],
  human_participants: ['LEAD'],

  what_went_well,
  key_learnings,
  action_items,
  what_needs_improvement,

  learning_category: 'TESTING_STRATEGY',
  affected_components: [
    'lib/sd-creation/source-adapters/qf.js',
    'scripts/resolve-sd-workdir.js'
  ],
  related_files: [
    'lib/sd-creation/source-adapters/qf.js',
    'scripts/resolve-sd-workdir.js',
    'tests/unit/qf-escalation-continuity.test.js',
    'tests/unit/leo-create-sd-from-qf-migration-reviewed.test.js'
  ],
  related_commits: [],
  related_prs: ['#6040'],
  tags: ['SD-LEO-INFRA-ESCALATION-CONTINUITY-AUTO-001', 'qf-escalation', 'born-claim', 'mocked-seam-dead-code', 'claim_sd'],

  quality_score: 85, // seed; trigger recomputes from content

  team_satisfaction: 8,
  business_value_delivered: 'HIGH',
  customer_impact: 'MEDIUM',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 1,      // the sd_id-vs-sd_key dead-code guard caught in review
  bugs_resolved: 1,
  tests_added: 8,     // hermetic vitest suite (FR-4)
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  success_patterns: ['Adversarial review after green suite', 'Canonical-lock over mirror-column', 'Atomic born-claim at creation time'],
  failure_patterns: ['Mocked seam ships green on dead code', 'Silent no-op on failed lookup', 'Brittle regex-anchor source-pin tests'],
  improvement_areas: ['Schema-aware DB mocks', 'Explicit error surfacing', 'Structural source-pin assertions'],
  generated_by: 'SUB_AGENT',
  trigger_event: 'SD_STATUS_COMPLETED',

  status: 'DRAFT'
};

const { data: inserted, error: insertErr } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select();

if (insertErr) {
  console.error('INSERT FAILED:', insertErr.message);
  process.exit(1);
}

const retroId = inserted[0].id;
let score = inserted[0].quality_score;
console.log('Inserted DRAFT retro id=%s quality_score=%s', retroId, score);

if (score >= 70) {
  const { data: pub, error: pubErr } = await supabase
    .from('retrospectives')
    .update({ status: 'PUBLISHED' })
    .eq('id', retroId)
    .select();
  if (pubErr) {
    console.error('PUBLISH FAILED:', pubErr.message, '- left as DRAFT');
  } else {
    console.log('Published. status=%s', pub[0].status);
  }
} else {
  console.log('Score below 70; left as DRAFT. quality_issues=', JSON.stringify(inserted[0].quality_issues));
}

// Read back the persisted, trigger-recomputed value
const { data: readback, error: rbErr } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .eq('id', retroId)
  .single();

if (rbErr) {
  console.error('READBACK FAILED:', rbErr.message);
  process.exit(1);
}
console.log('READBACK:', JSON.stringify(readback, null, 2));
