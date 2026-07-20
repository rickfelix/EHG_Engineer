#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-FLEET-VIEW-BADGES-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-loop-evidence-collectors-001.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp, with genuinely
 * SD-specific insights rather than metric-only boilerplate.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '1a6325e6-16f6-43d1-8b3a-a46ef735c6e3';
const SD_KEY = 'SD-LEO-INFRA-FLEET-VIEW-BADGES-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'APPLICATION_ISSUE',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — Fleet launcher SD-C: per-session badges, capacity chip, and a DB-only attention strip on the one live fleet render surface`,
  description: 'The sibling SD-A (SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001) shipped pure identity-join primitives (session-registry + manifest SSOT) with no render surface of its own. scripts/fleet-dashboard.cjs\'s printWorkers()/loadData() is the ONLY live fleet render surface, and three signals were sitting unwired next to it: (1) lib/fleet/account-capacity-gauge.cjs, built earlier by QF-20260720-406 and never called from anywhere; (2) a scattering of already-rendered per-session columns (loop_state, P(alive), silent-until, handoff_fail_count) with no single at-a-glance status signal; (3) no durable place to flag a session for chairman/coordinator attention that would survive past the current dashboard render. This SD wires all three into fleet-dashboard.cjs: a capacity/headroom chip in the WORKERS header line via a new formatCapacityChip() (lib/fleet/fleet-view-badges.cjs), a compact per-session status badge (HEALTHY/STALLED/SILENT/STRUGGLING/UNKNOWN) via computeSessionBadge() that is deliberately a ROLLUP of already-rendered columns rather than a new liveness state machine, and a DB-only attention strip (lib/fleet/attention-flag-writer.js, atomic JSONB merge against claude_sessions.metadata keyed by session_id) with a read-only printAttentionStrip() renderer modeled on the existing printReviewHeldSds()/printChairmanGatedQfs() pattern.',
  affected_components: [
    'lib/fleet/fleet-view-badges.cjs',
    'lib/fleet/attention-flag-writer.js',
    'scripts/fleet-dashboard.cjs',
  ],
  related_files: [
    'lib/fleet/fleet-view-badges.cjs',
    'lib/fleet/attention-flag-writer.js',
    'scripts/fleet-dashboard.cjs',
    'tests/unit/fleet/fleet-view-badges.test.js',
    'tests/unit/fleet/attention-flag-writer.test.js',
    'lib/fleet/account-capacity-gauge.cjs',
    'lib/fleet/exec-boundary-hold-writer.js',
    'lib/coordinator/clear-coordinator-review.js',
  ],
  what_went_well: [
    'A validation-agent pass during LEAD caught that the SD\'s original scope description WRONGLY assumed lib/fleet/account-identity.cjs was unwired. It is actually already wired at the host level (fleet-dashboard.cjs:47,492,496) as a single "acct=" header label — surfacing this before EXEC narrowed the account axis to ONLY the capacity/headroom chip, avoiding wasted work re-wiring something already live.',
    'The same validation pass surfaced that a live in-flight sibling, SD-LEO-INFRA-FLEET-WATCHDOG-001 ("SD-E", in EXEC at 30%), is independently building its OWN per-session liveness-classification badge taxonomy (ALIVE/STOPPED/AUTH-LOST/CRASHED) on the exact same printWorkers() surface this SD touches. Catching this before writing computeSessionBadge() meant the new badge could be deliberately scoped as a generic ROLLUP of pre-existing columns (loop_state/P(alive)/silent-until/handoff_fail_count) rather than a competing state-name vocabulary, avoiding two badge taxonomies colliding on one dashboard.',
    'lib/fleet/account-capacity-gauge.cjs had been sitting fully built since QF-20260720-406 with zero call sites — this SD found and wired it via a new pure formatter (formatCapacityChip()) rather than re-deriving capacity math from scratch, so the only new logic needed was presentation, not computation.',
    'While building the attention-flag-writer, the precedent I was about to copy (lib/fleet/exec-boundary-hold-writer.js) turned out to be a fresh-read + full-blob spread-write, not a true atomic `||` JSONB merge — the same anti-pattern class as a same-session prior fix (QF-20260720-597 on lib/coordinator/dispatch.cjs). Recognizing this before copying it meant attention-flag-writer.js was built on the SAFE atomic-merge pattern (mirroring lib/coordinator/clear-coordinator-review.js) instead of inheriting a TOCTOU-prone write path.',
    'Rather than fixing exec-boundary-hold-writer.js inline (which would have scope-crept this SD into an unrelated file), the finding was logged as a harness bug (feedback row 862b76b5-8f72-4e9c-88a6-3a051e89d01a) and signaled to the coordinator, keeping this SD\'s diff focused on the three signals it was scoped to wire.',
    'Verified zero regressions directly rather than trusting the new tests alone: all 750 pre-existing tests in tests/unit/fleet pass unchanged, and all 165 tests across the 18 test files that reference scripts/fleet-dashboard.cjs directly (several of which assert against the raw source string, e.g. fleet-dashboard-ackstamp-false-metrics.test.js) also pass unchanged after the header-chip, row-badge, and attention-strip edits landed in the same file.',
  ],
  what_needs_improvement: [
    'lib/fleet/exec-boundary-hold-writer.js still uses the unsafe fresh-read+spread-write pattern in production — this SD deliberately did not fix it (out of scope), so the TOCTOU window QF-20260720-597 closed in dispatch.cjs remains open in this sibling file until the logged follow-up QF lands.',
    'computeSessionBadge() is a rollup of pre-existing columns, not a true liveness classifier — it will need to be swapped for SD-E\'s classifyWatchdogState() once that lands, and until then the badge and SD-E\'s in-progress taxonomy describe overlapping-but-not-identical concepts (HEALTHY/STALLED/SILENT/STRUGGLING/UNKNOWN vs ALIVE/STOPPED/AUTH-LOST/CRASHED) on the same dashboard.',
    'The attention strip is DB-only by design (attention raises to DB, never auto-clears) — there is currently no automated staleness sweep for attention flags that are set and never explicitly cleared, so a flag could persist past its useful lifetime with only manual clearing as the reset path.',
  ],
  key_learnings: [
    'When two sibling SDs (this SD and SD-LEO-INFRA-FLEET-WATCHDOG-001) target the same render surface with what looks like overlapping scope (both add a per-session status signal to printWorkers()), the fix is not to merge or race them — it is to scope one as a deliberately generic rollup with an explicit swap-out seam (the computeSessionBadge() call site) for the other\'s eventual, more authoritative classifier. Building a competing state-name vocabulary would have guaranteed a collision the moment SD-E ships.',
    'An SD\'s original scope description can be wrong about what is already wired versus stubbed — the account-identity axis in this SD\'s brief assumed lib/fleet/account-identity.cjs was unwired, but it was already rendering an "acct=" header label at fleet-dashboard.cjs:47/492/496. Verifying wiring state against the actual render surface (not the SD description) before implementation prevented duplicate/conflicting work on an already-live signal.',
    'A "safe-looking" precedent file is not automatically safe to copy: lib/fleet/exec-boundary-hold-writer.js reads as a metadata-merge writer but is actually fresh-read + full-blob spread + .update(), the same anti-pattern class QF-20260720-597 had just fixed in lib/coordinator/dispatch.cjs in this same session. The tell was the absence of an atomic `||` JSONB merge operator in the update call — worth grepping for explicitly before adopting any "similar-sounding" writer as a template.',
    'Finding a second live instance of an already-fixed bug class (QF-20260720-597\'s pattern, now also present in exec-boundary-hold-writer.js) is a signal worth routing through /signal + a logged feedback row rather than fixing inline, even when the fix would be small — it keeps the current SD\'s diff scoped to what it was chartered to deliver and gives the harness a durable record (feedback 862b76b5) instead of a silent side-fix buried in an unrelated commit.',
    'A previously-built-but-never-wired module (lib/fleet/account-capacity-gauge.cjs, dormant since QF-20260720-406) is cheaper to surface than to re-derive — this SD\'s capacity chip needed only a presentation-layer formatter, not new capacity math, because the underlying computation already existed and just lacked a call site.',
  ],
  action_items: [
    {
      title: 'Migrate lib/fleet/exec-boundary-hold-writer.js to the safe atomic-merge pattern',
      description: 'setExecBoundaryHold/clearExecBoundaryHold (~lines 48-104) use fresh-read + spread + full-blob .update({metadata: nextMeta}), the same read-spread-write anti-pattern class QF-20260720-597 fixed in lib/coordinator/dispatch.cjs. Migrate to lib/coordinator/safe-metadata-merge.mjs\'s mergeMetadataKeys (the pattern this SD\'s new attention-flag-writer.js uses), mirroring the QF-597 fix exactly. Logged as feedback row 862b76b5-8f72-4e9c-88a6-3a051e89d01a.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Swap classifyWatchdogState() into computeSessionBadge()\'s call site once SD-LEO-INFRA-FLEET-WATCHDOG-001 ships',
      description: 'computeSessionBadge() in lib/fleet/fleet-view-badges.cjs was deliberately scoped as a rollup of pre-existing columns (loop_state/P(alive)/silent-until/handoff_fail_count) because SD-E (SD-LEO-INFRA-FLEET-WATCHDOG-001, in EXEC at 30% at time of writing) is independently building a more authoritative liveness classifier (ALIVE/STOPPED/AUTH-LOST/CRASHED) for the same printWorkers() surface. When SD-E ships, replace the call to computeSessionBadge() in scripts/fleet-dashboard.cjs with SD-E\'s classifyWatchdogState() rather than maintaining two badge vocabularies on one dashboard.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
    {
      title: 'Consider a staleness sweep for attention-strip flags',
      description: 'The attention strip is intentionally DB-only and never auto-clears (attention raises to DB, coordinator/chairman action clears it) — evaluate whether a periodic sweep should flag attention entries that have sat unactioned past some threshold, distinct from the current fully-manual clear path.',
      priority: 'low',
      owner_role: 'PLAN',
    },
  ],
  improvement_areas: [
    {
      area: 'exec-boundary-hold-writer.js still carries the read-spread-write TOCTOU anti-pattern in production',
      analysis: 'This SD discovered the bug while sourcing its own attention-flag-writer.js but deliberately did not fix it inline to avoid scope creep into an unrelated file family.',
      prevention: 'Tracked as the first action item above; logged as feedback row 862b76b5-8f72-4e9c-88a6-3a051e89d01a for a dedicated follow-up QF mirroring QF-20260720-597.',
    },
    {
      area: 'Two overlapping per-session badge concepts will coexist until SD-E ships',
      analysis: 'computeSessionBadge()\'s rollup and SD-E\'s in-progress classifyWatchdogState() describe related but non-identical state spaces on the same dashboard row until the swap happens.',
      prevention: 'Tracked as the second action item above; the call site in fleet-dashboard.cjs is the designed single point of swap.',
    },
  ],
  success_patterns: [
    'Verified wiring state against the actual render surface (fleet-dashboard.cjs) rather than trusting the SD\'s original scope description, catching that account-identity was already wired and narrowing scope before writing code',
    'Caught a live sibling SD (SD-E/FLEET-WATCHDOG-001) building an overlapping badge taxonomy on the same surface, and scoped this SD\'s badge as a generic rollup with an explicit future swap-out seam instead of a competing vocabulary',
    'Discovered a second live instance of an already-fixed bug class (QF-20260720-597\'s read-spread-write anti-pattern, now also in exec-boundary-hold-writer.js) and routed it via /signal + a logged feedback row rather than scope-creeping this SD to fix it inline',
    'Reused a previously-built-but-never-wired module (account-capacity-gauge.cjs) via a thin presentation-layer formatter instead of re-deriving capacity math',
    'Verified zero regressions directly: 750/750 in tests/unit/fleet and 165/165 across every test file that references scripts/fleet-dashboard.cjs (including source-string assertion tests), in addition to the 17 new tests (9 in fleet-view-badges.test.js, 8 in attention-flag-writer.test.js) added for this SD',
  ],
  failure_patterns: [
    'The SD\'s original scope description was wrong about lib/fleet/account-identity.cjs\'s wiring state (assumed unwired; actually live at fleet-dashboard.cjs:47/492/496) — caught by a validation-agent pass rather than the initial scoping, meaning the correction happened later than ideal in the process',
    'lib/fleet/exec-boundary-hold-writer.js has been shipping the read-spread-write anti-pattern in production since before this SD, undetected until this SD\'s author happened to consider it as a copy precedent',
  ],
  business_value_delivered: 'Turns three previously-invisible fleet signals (capacity headroom, per-session health rollup, DB-durable attention flags) into visible, actionable information on the one render surface every fleet operator and coordinator already looks at (fleet-dashboard.cjs), without introducing a second liveness-classification vocabulary that would have collided with the in-flight SD-E watchdog work.',
  customer_impact: 'Indirect: internal fleet-operations observability surface used by the coordinator/chairman to triage session health and capacity; no end-user-facing product surface changed.',
  technical_debt_addressed: false,
  technical_debt_created: false,
  bugs_found: 1,
  bugs_resolved: 0,
  tests_added: 17,
  performance_impact: 'Standard',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  human_participants: ['LEAD'],
  team_satisfaction: 9,
  metadata: {
    sd_key: SD_KEY,
    sibling_sds: {
      'SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001': 'SD-A, shipped identity-join primitives with no render surface (prerequisite context)',
      'SD-LEO-INFRA-FLEET-WATCHDOG-001': 'SD-E, in EXEC at 30% at time of writing, independently building classifyWatchdogState() for the same printWorkers() surface — computeSessionBadge() is designed to be swapped out for it',
    },
    harness_bug_logged: '862b76b5-8f72-4e9c-88a6-3a051e89d01a (exec-boundary-hold-writer.js read-spread-write anti-pattern, same class as QF-20260720-597)',
    test_verification: {
      new_tests: { 'tests/unit/fleet/fleet-view-badges.test.js': 9, 'tests/unit/fleet/attention-flag-writer.test.js': 8, total: 17 },
      regression_scope_1: { path: 'tests/unit/fleet', files: 70, tests: 750, result: 'all pass, no regressions' },
      regression_scope_2: { description: 'every test file referencing scripts/fleet-dashboard.cjs directly', files: 18, tests: 165, result: 'all pass, no regressions' },
    },
    files_new: ['lib/fleet/fleet-view-badges.cjs', 'lib/fleet/attention-flag-writer.js', 'tests/unit/fleet/fleet-view-badges.test.js', 'tests/unit/fleet/attention-flag-writer.test.js'],
    files_edited: ['scripts/fleet-dashboard.cjs'],
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Dedup guard: don't create a second SD_COMPLETION row if one already exists.
  const { data: existing } = await s
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`SD_COMPLETION retrospective already exists (id: ${existing[0].id}, created_at: ${existing[0].created_at}) — no new row needed.`);
    return;
  }

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
