#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-payment-rail-attribution-002.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp, with genuinely
 * SD-specific insights rather than metric-only boilerplate.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '61fb0315-86d7-40de-bd19-c1e04355c8eb';
const SD_KEY = 'SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'DATABASE_SCHEMA',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — roadmap completion-stamping, PLAN CHECK roadmap-derivation, and verified backfill (FR-3 descoped as already-shipped)`,
  description: 'Chairman-directed governance consolidation (2026-07-16) wiring the LEO Roadmap as the live, single plan of record. LEAD rescoped out FR-3 (schedule rung-progress-rollup) after discovering via a direct Explore-agent read of .github/workflows/wave-progress-refresher.yml that it was already shipped (live 6h cron) by SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 — a 25% scope reduction (Q8 deletion audit) applied before any PRD/code was written for the remaining scope. Delivered FR-1 (lib/roadmap/roadmap-completion-stamp.js + a new fail-safe roadmap-stamp-on-completion-hook.js wired into lead-final-approval/index.js right after the existing rank-on-completion-hook call, flipping roadmap_wave_items.item_disposition to \'promoted\' when a linked SD completes), FR-2 (lib/roadmap/plan-check-status.js computePlanCheckStatus() + scripts/roadmap/plan-check-status.mjs CLI, deriving the chairman\'s PLAN CHECK slipped/done/next/committing sections from roadmap_waves+roadmap_wave_items JOINed against strategic_directives_v2.status instead of the adam_task_ledger side-list; also updated leo_protocol_sections id=624 and regenerated CLAUDE_ADAM.md), and FR-4 (scripts/one-off/backfill-roadmap-completion-linkage.mjs, a dry-run-by-default backfill requiring a verified completed-SD title match, never a bare title guess).',
  affected_components: [
    'lib/roadmap/roadmap-completion-stamp.js',
    'lib/roadmap/plan-check-status.js',
    'scripts/modules/handoff/executors/lead-final-approval/hooks/roadmap-stamp-on-completion-hook.js',
    'scripts/modules/handoff/executors/lead-final-approval/index.js',
    'scripts/roadmap/plan-check-status.mjs',
    'scripts/one-off/backfill-roadmap-completion-linkage.mjs',
  ],
  related_files: [
    'lib/roadmap/roadmap-completion-stamp.js',
    'lib/roadmap/plan-check-status.js',
    'scripts/modules/handoff/executors/lead-final-approval/hooks/roadmap-stamp-on-completion-hook.js',
    'scripts/modules/handoff/executors/lead-final-approval/index.js',
    'scripts/roadmap/plan-check-status.mjs',
    'scripts/one-off/backfill-roadmap-completion-linkage.mjs',
    'tests/unit/roadmap/plan-of-record-linkage.test.js',
    '.github/workflows/wave-progress-refresher.yml',
  ],
  what_went_well: [
    'LEAD caught a 25% scope reduction BEFORE any PRD/code was written for the remaining requirements: the SDs narrative assumed FR-3 (a scheduled rung-progress-rollup) was unbuilt, but a direct Explore-agent read of the live .github/workflows/wave-progress-refresher.yml GHA file proved it already ran as a 6h cron, shipped by SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001. Cut from scope at LEAD (Q8 deletion audit) rather than discovered mid-EXEC as duplicate work.',
    'The DATABASE sub-agent (evidence id 325c9993-8a77-4c40-8637-0f9327b8446f, PLAN_PRD phase, 2026-07-16) caught two hard CHECK-constraint conflicts in the original PRD draft before any code was written: (1) roadmap_wave_items.item_disposition\'s CHECK constraint has no \'done\' value — only (pending, selected, deferred, brainstormed, promoted, dropped) — so FR-1\'s planned terminal marker had to become \'promoted\'; (2) source_type\'s CHECK constraint technically allows \'conversion_ledger\' but 0 live rows use it, so the originally-planned conversion_ledger.linked_sd_key matching path in FR-1/FR-4 was dead code, dropped entirely before implementation instead of being shipped and silently never firing.',
    'FR-2\'s own implementation caught that "stamped" (promoted_to_sd_key IS NOT NULL) is not the same signal as "done": a live query found 341 stamped roadmap_wave_items, of which 225 point to CANCELLED SDs and only 101 point to completed ones. computePlanCheckStatus() was built to JOIN against strategic_directives_v2.status = \'completed\' rather than trust promoted_to_sd_key alone for the PLAN CHECK "done" section — avoided a chairman-facing report that would have silently included 225 cancelled items as if they were finished work.',
    'Ran scripts/roadmap/plan-check-status.mjs --json against the LIVE database (not just seeded fixtures) and it correctly surfaced this sessions own recently-completed SDs (SD-LEO-GEN-SATELLITE-LEARNING-SPEED-001, SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001, SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001) under "done" within the 48h window — a genuine end-to-end smoke test that exercised the real JOIN against real data, not a unit test against a fixture that only proves the code shape is right.',
    'Ran the FR-4 backfill script live in dry-run mode: 403 unstamped roadmap_wave_items with titles, 0 verified matches found. That zero-match result is itself a positive verification — it confirms the remaining unstamped backlog is genuinely raw/unbuilt intake (YouTube links, casual notes) rather than shipped work the earlier creation-time stampers missed, and confirms the matcher is correctly refusing ambiguous matches instead of over-matching.',
    'The new roadmap-stamp-on-completion-hook.js was wired into lead-final-approval/index.js immediately after the existing rank-on-completion-hook call, and the 51 pre-existing lead-final-approval hook tests were re-run to confirm zero regressions from that index.js wiring edit — verified the new hook is additive rather than assuming it from the diff alone.',
    'leo_protocol_sections id=624 (CLAUDE_ADAM.md\'s PLAN CHECK MECHANICS paragraph) was updated to point at the new plan-check-status.js module and CLAUDE_ADAM.md was regenerated via generate-claude-md-from-db.js — kept the documented-behavior source-of-truth in the DB rather than hand-editing the generated markdown file directly.',
  ],
  what_needs_improvement: [
    'The original PRD draft treated item_disposition = \'done\' and conversion_ledger.linked_sd_key as viable, already-decided implementation paths for FR-1/FR-4 before checking either the live CHECK constraint or the live row population of the referenced column. Root cause: the PRD was drafted from the SDs narrative intent (chairman-directed governance consolidation language) rather than from a schema audit of roadmap_wave_items and conversion_ledger — the DATABASE sub-agent caught both at PLAN_PRD, which is one phase later than ideal (LEAD scoping) and cost a PRD-draft revision even though it landed before EXEC.',
    'The "stamped ≠ done" distinction (225/341 stamped items pointing to cancelled SDs) was discovered only while implementing FR-2s query logic, not while drafting FR-2s PLAN-phase acceptance criteria. A live distributional check of promoted_to_sd_key against strategic_directives_v2.status (a single GROUP BY query) run at PRD-acceptance-criteria time would have surfaced this fact before implementation started, rather than mid-implementation.',
    'FR-3 being 25% of the SDs original scope and already shipped by a related, recently-merged SD (SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001) was caught only because LEAD independently chose to Explore-agent-read the live GHA workflow file rather than trust the SD narrative — there is no standing dedup/overlap check against recently-merged sibling SDs in the same feature family (roadmap/plan-of-record) run automatically at SD-drafting or PRD-lock time. This class of overlap was caught by initiative, not by a repeatable gate.',
  ],
  key_learnings: [
    'CHECK constraints are ground truth over PRD narrative for any status-transition feature: roadmap_wave_items.item_disposition\'s live CHECK constraint (pending, selected, deferred, brainstormed, promoted, dropped) has no \'done\' value, so any roadmap-status work must treat \'promoted\' as the terminal marker rather than infer a \'done\' value that reads naturally in prose but does not exist in the schema. Reusable pattern: run the actual CHECK-constraint definition for a target column before drafting PRD acceptance criteria that assume a specific enum value, not after.',
    '"Stamped" (a non-null foreign-key-like column such as promoted_to_sd_key) is a linkage signal, not a completion signal — this SDs own live data showed 225 of 341 stamped roadmap_wave_items point to CANCELLED SDs. Reusable pattern for any backlog/roadmap linkage feature: always JOIN the linkage column through to the linked entitys own current status column before treating "linked" as "done"; never trust a single non-null check as a proxy for completion.',
    'A column\'s CHECK constraint permitting a value is not the same as that value being live: source_type technically allows \'conversion_ledger\' but 0 production rows use it, so the FR-1/FR-4 matching path built against it would have been dead code from day one. Reusable pattern: a quick `GROUP BY` row-count audit of a referenced columns actual live value distribution, done at PLAN time, is cheap insurance against building matching/branching logic for a value nothing in production populates.',
    'Overlap/dedup checks against recently-merged sibling SDs in the same feature family belong at LEAD scoping time, not as a lucky mid-flight catch: FR-3 (25% of this SDs scope) was only cut because LEAD independently read the live .github/workflows/wave-progress-refresher.yml GHA file instead of trusting the SD narratives claim that rollup cadence was unbuilt. This is a reusable check for any future "wire X as the live plan of record" SD in a family with recent, adjacent merges (here: SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001).',
    'dry-run-by-default backfill scripts that require a verified title match (never a bare title guess) are the correct safety posture for retroactive linkage work, and a 0-match result against a large candidate set (403 items here) is a valid, informative outcome rather than a failure — it distinguishes "nothing here needed backfilling" from "the matcher silently guessed wrong," which is exactly the 2026-07-16 dedup-miss failure mode this backfills verified-match discipline was designed to guard against.',
  ],
  action_items: [
    {
      title: 'Run a live CHECK-constraint audit before drafting PRD acceptance criteria for any new status/terminal value on an existing column',
      description: 'Before an SD PRD assumes a specific enum/status value on an existing table column (e.g. item_disposition = \'done\'), query the columns actual live CHECK constraint definition and its current value distribution. This SDs DATABASE sub-agent caught two such conflicts (item_disposition has no \'done\' value; source_type\'s \'conversion_ledger\' has 0 live rows) at PLAN_PRD instead of at LEAD scoping, costing a PRD revision cycle that a five-minute schema query would have avoided.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Add a standing overlap/dedup check against recently-merged sibling SDs in the same feature family at LEAD scoping time',
      description: 'FR-3 (25% of this SDs original scope) turned out to already be shipped by SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001, caught only because LEAD chose to Explore-agent-read the live .github/workflows/wave-progress-refresher.yml GHA file rather than trust the SD narrative. Add a lightweight LEAD-phase check (e.g. grep recently-merged SD titles/PR descriptions in the same category for keyword overlap with the new SDs FRs) before PRD lock, to catch this class of already-shipped-scope earlier and more repeatably.',
      priority: 'high',
      owner_role: 'LEAD',
    },
    {
      title: 'Wire a periodic drift check for stamped-but-cancelled roadmap_wave_items into an existing cron or DB health check',
      description: 'This SDs live audit found 225 of 341 stamped (promoted_to_sd_key IS NOT NULL) roadmap_wave_items point to CANCELLED SDs, not completed ones. FR-2s computePlanCheckStatus() correctly JOINs against strategic_directives_v2.status to exclude these from the "done" section, but there is no standing alert if this ratio grows over time (e.g. via a new stamping path that bypasses the status JOIN). Add a periodic check (existing cron or DB health script) that flags a rising stamped-but-cancelled ratio.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
    {
      title: 'Re-run the FR-4 backfill dry-run periodically and only promote to a real (non-dry-run) apply behind an explicit flag with a second verified-match review',
      description: 'scripts/one-off/backfill-roadmap-completion-linkage.mjs is dry-run-by-default with 0 verified matches against 403 candidates at this SDs completion. As new SDs complete over time, some of that 403 may develop genuine verified-title matches. Re-run the dry-run periodically (e.g. monthly) rather than treating this SDs 0-match result as permanent, and require a second reviewer pass before any non-dry-run apply given the 2026-07-16 dedup-miss failure mode this script exists to prevent.',
      priority: 'low',
      owner_role: 'EXEC',
    },
  ],
  improvement_areas: [
    {
      area: 'Schema-conflicting assumptions in the PRD draft were only caught at PLAN_PRD, not at LEAD scoping',
      analysis: 'The original PRD draft assumed roadmap_wave_items.item_disposition could reach a terminal \'done\' state and that conversion_ledger.linked_sd_key was a live, populated matching path for FR-1/FR-4. Both assumptions came from the SDs narrative intent (chairman-directed governance consolidation language describing roadmap items as becoming "done") rather than from checking the actual CHECK constraint definitions or live row population. Root cause: no schema-audit step existed between SD narrative drafting and PRD acceptance-criteria lock.',
      prevention: 'The DATABASE sub-agent (evidence id 325c9993-8a77-4c40-8637-0f9327b8446f) caught both conflicts before any code was written, at PLAN_PRD phase, with concrete remediation (\'promoted\' instead of \'done\'; drop the conversion_ledger matching path as dead code). Documented as the first action item above to move this check earlier, to LEAD scoping, for future SDs introducing new status/terminal semantics on existing columns.',
    },
    {
      area: '"Stamped" was conflated with "done" until live data analysis during FR-2 implementation disproved it',
      analysis: 'roadmap_wave_items.promoted_to_sd_key IS NOT NULL looks, on its face, like a completion signal — a roadmap item was linked to an SD, so it must be handled. A live query run during FR-2 implementation found 341 stamped items, but 225 of them link to CANCELLED SDs (only 101 to completed ones). Had FR-2s "done" derivation trusted promoted_to_sd_key alone, the chairmans PLAN CHECK "done" section would have silently reported 225 cancelled items as finished work.',
      prevention: 'computePlanCheckStatus() was built to JOIN roadmap_wave_items against strategic_directives_v2.status = \'completed\', never trusting promoted_to_sd_key in isolation. Documented as a key_learning above (linkage signal vs completion signal) as a reusable pattern for any future roadmap/backlog linkage feature, and as the third action item above (a periodic drift check) to catch future growth in the stamped-but-cancelled ratio.',
    },
    {
      area: 'A 25%-of-scope duplicate (FR-3) survived from SD narrative into initial scoping and was only caught by LEAD choosing to read the live implementation of a related, recently-merged SD',
      analysis: 'FR-3 (schedule rung-progress-rollup) was written into this SDs original scope as new work. It was only discovered to already be live — a 6h cron shipped by SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 — because LEAD independently used an Explore agent to read .github/workflows/wave-progress-refresher.yml directly, rather than because a repeatable process flagged the overlap. Root cause: no standing dedup/overlap check exists against recently-merged sibling SDs in the same feature family at SD-drafting or PRD-lock time.',
      prevention: 'FR-3 was cut from scope at LEAD (Q8 deletion audit) before any PRD or code was written for it — a clean scope reduction with zero wasted implementation effort. Documented as the second action item above to make this an explicit, repeatable LEAD-phase check for future SDs in overlapping feature families, rather than relying on an individual LEAD sessions initiative to catch it.',
    },
  ],
  success_patterns: [
    'LEAD used a direct Explore-agent read of a live GHA workflow file (not the SD narrative) to discover 25% of scope was already shipped, cutting it before any PRD/code was written for it',
    'DATABASE sub-agent caught two hard CHECK-constraint conflicts (item_disposition has no \'done\' value; source_type\'s \'conversion_ledger\' has 0 live rows) at PLAN_PRD, before any implementation code existed',
    'Live-data analysis during implementation (341 stamped items, 225 cancelled vs 101 completed) caught a "stamped ≠ done" conflation before it shipped into the chairman-facing PLAN CHECK report',
    'Live end-to-end smoke test (plan-check-status.mjs --json against the real DB) verified real recently-completed SDs surfaced correctly in "done", not just seeded-fixture unit tests',
    'FR-4 backfills dry-run-by-default, verified-match-only design produced a genuine 0-match result against 403 candidates, correctly distinguishing "nothing needed backfilling" from a silent wrong-guess',
  ],
  failure_patterns: [
    'Original PRD draft assumed item_disposition could reach a \'done\' terminal state and that conversion_ledger.linked_sd_key was a live matching path — both wrong, caught only at PLAN_PRD by the DATABASE sub-agent rather than at LEAD scoping',
    'FR-3 (25% of original scope) was drafted as new work despite already being shipped by a recently-merged sibling SD (SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001) — no standing overlap/dedup check caught this before LEAD independently chose to verify against the live GHA workflow file',
  ],
  business_value_delivered: 'Wires the LEO Roadmap as the live, single plan of record: completed SDs now auto-stamp their linked roadmap_wave_items to \'promoted\' (FR-1), the chairmans PLAN CHECK report now derives slipped/done/next/committing sections from a live roadmap_waves+roadmap_wave_items JOIN against real SD status instead of a side-list (FR-2), and a safe, verified-match backfill mechanism exists for the historical unstamped backlog (FR-4) — with a correctly-scoped 25% reduction (FR-3) after confirming that capability was already live via a prior SD.',
  customer_impact: 'Internal governance/process impact: chairman-facing PLAN CHECK reporting becomes trustworthy (no longer conflates cancelled-but-stamped items with done work); no end-user-facing surface changed.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 0,
  bugs_resolved: 0,
  tests_added: 9,
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
    rescoped_fr: 'FR-3 (schedule rung-progress-rollup) — descoped at LEAD as already-shipped',
    predecessor_sd_shipping_fr3: 'SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001',
    scope_reduction_pct: 25,
    database_subagent_evidence_id: '325c9993-8a77-4c40-8637-0f9327b8446f',
    check_constraint_findings: [
      "roadmap_wave_items.item_disposition CHECK excludes 'done' — allowed values: pending, selected, deferred, brainstormed, promoted, dropped",
      "roadmap_wave_items.source_type CHECK allows 'conversion_ledger' but 0 live rows use it — matching path dropped as dead code",
    ],
    stamped_vs_done_finding: '341 live stamped roadmap_wave_items; 225 point to CANCELLED SDs, 101 to completed SDs — promoted_to_sd_key alone is not a done signal',
    live_smoke_test_sds: [
      'SD-LEO-GEN-SATELLITE-LEARNING-SPEED-001',
      'SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001',
      'SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001',
    ],
    fr4_backfill_dry_run: { unstamped_candidates_with_titles: 403, verified_matches: 0 },
    unit_test_file: 'tests/unit/roadmap/plan-of-record-linkage.test.js',
    unit_test_count: 9,
    regression_tests_rerun: 51,
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
