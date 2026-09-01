#!/usr/bin/env node
/**
 * Improves the auto-generated (preflight_autogen) SD_COMPLETION retrospective for
 * SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 with genuine, SD-specific content — the
 * existing row (id 9987e1d6) is templated boilerplate ("SD X defined success metric Y",
 * generic FR_PATTERN/EXECUTION_TIMELINE entries) that never names the actual work:
 * the decideCadence() fourth branch, the coordinator-quiet-tick.mjs wiring + static
 * wiring-pin guard, the STANDARD_LOOPS cron durability fix, or the FR-6 risk-acceptance
 * descope. This script REPLACES what_went_well / what_needs_improvement / key_learnings /
 * action_items / success_patterns / failure_patterns with specifics, keeping the row id,
 * sd_id, quality metadata, and PUBLISHED status intact.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '7d23f04f-d468-41a2-be35-388def3a6025';
const SD_KEY = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002';
const RETRO_ID = '9987e1d6-aae5-45d4-b0a8-81b0b036ec94';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const s = createClient(url, key);

  const patch = {
    what_went_well: [
      {
        achievement:
          'The predicate/wiring split from the parent SD held up exactly as planned: computeLoadedAndQuiet() (shipped inert in -001, zero callers) was wired into its first production call site in coordinator-quiet-tick.mjs main(), fed by a fresh gatherCapacityInputs() read taken immediately before decideCadence() for ARM-time freshness (FR-3) — no predicate logic had to be touched, only the call site.',
        is_boilerplate: false,
      },
      {
        achievement:
          'A static wiring-pin regression guard (tests/static-guards/lane-drain-wiring-pinned.test.js) was added specifically because the parent SD (-001) shipped the same call site unwired and green across all its unit tests — the guard makes a future silent drop of the wiring fail loudly instead of reading as a passing suite.',
        is_boilerplate: false,
      },
      {
        achievement:
          'FR-1 (periodic_process_registry.standard_loop:inbox durability) was fixed at the SOURCE (STANDARD_LOOPS cron widened */2 -> */4 in scripts/coordinator-startup-check.mjs) rather than the DB-only edit the LEAD-gate VALIDATION pass (evidence c9d87f02, VAL-2) had caught reverting on every re-seed — read-back was pasted AFTER a re-seed run, per the FR-1 acceptance criterion ordering, not immediately after a DB write.',
        is_boilerplate: false,
      },
      {
        achievement:
          'FR-6 (parked-seat directive-wake preemption) was explicitly descoped via a recorded LEAD-phase risk acceptance (session_coordination row 2dd84a5a, metadata.risk_acceptance_b) rather than silently dropped or half-built — the up-to-660s undelivered-directive exposure on the coordinator\'s own seat is named in the PR description, not glossed over.',
        is_boilerplate: false,
      },
      {
        achievement:
          'Regression coverage extended cleanly: 9 new decideCadence loaded-and-quiet fixtures plus a pre-registered golden-hash digest over a 2200-cell matrix, computed against the unmodified module so the byte-identity claim (loadedAndQuiet omitted -> unchanged output) is not self-referential.',
        is_boilerplate: false,
      },
    ],
    what_needs_improvement: [
      'FR-5 (the two-sided live proof: one tick stamped in [540,660], one in [180,270]) is structurally a post-merge observation and could not be captured before PR #7940 opened — it remains an open PR checklist item, which means LEAD-FINAL-APPROVAL for this class of SD is gated on evidence that cannot exist until after merge; worth deciding whether that ordering is acceptable as a pattern or whether FR-5-shaped requirements should be reframed as post-merge follow-up tasks rather than PRD acceptance criteria.',
      'The auto-generated preflight retrospective for this SD was pure boilerplate (templated "SD X defined success metric Y" and generic FR_PATTERN entries with zero mention of decideCadence, the wiring guard, or the cron fix) despite scoring 80% on the quality gate — the quality score measures structural completeness (do the buckets exist, are fields populated) but not whether the content is SD-specific, which let a generic row pass and required a manual PLAN-TO-LEAD pass to correct.',
      'Sub-agent evidence (RETRO) for the PLAN-TO-LEAD handoff was missing from sub_agent_execution_results despite a retrospective row already existing in the DB — the gate checks for the execution-results row specifically, not retrospective content, and that distinction was not obvious from the handoff failure message alone.',
    ],
    key_learnings: [
      {
        learning:
          'A predicate function shipped "inert" in a parent SD (zero callers, fully unit-tested) is genuinely cheap to wire into a follow-up SD when the follow-up scopes the wiring as its own FR (FR-3) rather than assuming the parent left a half-wired seam — the parent SD explicitly documented computeLoadedAndQuiet() as not-yet-wired, and that documentation is what let this SD estimate FR-3 correctly as full wiring work.',
        is_boilerplate: false,
      },
      {
        learning:
          'A DB-only fix to a machine-derived registry value (periodic_process_registry.standard_loop:inbox.expected_interval_seconds) is not a fix at all if a seeder script re-derives and unconditionally upserts that value on every run — the LEAD-gate VALIDATION pass catching this (VAL-2, executing discoverStandardLoops() rather than reading the parser) is what forced the source-level cron edit instead of a DB row that would have reverted on the next re-seed.',
        is_boilerplate: false,
      },
      {
        learning:
          'Widening a coordinator self-pace band changes the coordinator\'s own worst-case directive latency, not a worker seat\'s — the parent risk-acceptance rationale (LEAD-gate VAL-3) initially framed the exposure against parked WORKER seats when the actual affected seat is the coordinator itself (decideCadence is only called from coordinator-quiet-tick.mjs and adam-quiet-tick.mjs, no worker-seat caller exists), and hard-wake branches choose the NEXT park length rather than preempting one already armed — restating the exposure correctly (coordinator seat, up to ~660s) in the PR/risk-acceptance is what makes the accepted magnitude honest rather than just present.',
        is_boilerplate: false,
      },
      {
        learning:
          'A static wiring-pin test is a cheap, durable countermeasure against exactly the failure mode its own sibling SD demonstrated (the parent SD shipped an unwired call site with a fully green test suite) — adding the guard in the SAME PR as the wiring, rather than as separate follow-up work, is what prevents the pattern from repeating a third time.',
        is_boilerplate: false,
      },
    ],
    action_items: [
      {
        owner: 'LEO-Session',
        action:
          'Paste the two-sided live proof for FR-5 (loaded-and-quiet tick in [540,660], open-unclaimed-row tick in [180,270], both timestamped) into PR #7940 once the coordinator observes both states in production.',
        deadline: 'Post-merge',
        verification: 'PR #7940 description contains both stamps verbatim',
        is_boilerplate: false,
      },
      {
        owner: 'LEO-Session',
        action:
          'Consider whether PRD acceptance criteria that can only be satisfied post-merge (like FR-5) should be reframed as follow-up tasks rather than blocking LEAD-FINAL-APPROVAL, to avoid a structural ordering problem repeating on future SDs of this shape.',
        deadline: 'Next SD of this class',
        verification: 'Reviewed at next LEAD-phase PRD authoring for a similar live-observation FR',
        is_boilerplate: false,
      },
      {
        owner: 'RETRO Sub-Agent tooling',
        action:
          'Investigate why the preflight-autogenerated retrospective for this SD scored 80% on the quality gate while containing zero SD-specific technical content (no mention of decideCadence, the wiring guard, or the cron fix) — the quality score should weight content specificity, not just bucket population.',
        source: 'evidence_gap',
        deadline: '2026-09-08',
        priority: 'medium',
        smart_format: true,
        success_criteria: 'Quality scoring incorporates a specificity/genericness check, or the gate documents that it measures structure only',
      },
    ],
    success_patterns: [
      'Wiring an already-shipped, already-tested predicate into a new call site as a scoped FR (FR-3) kept the change small and low-risk',
      'LEAD-gate VALIDATION catching a DB-only-edit-reverts-on-reseed gap (FR-1) before EXEC started prevented shipping a false-green registry state',
      'Explicit risk acceptance (FR-6 descope) with a durable session_coordination row kept the scope boundary honest instead of silently dropped',
      'Static wiring-pin guard added in the same PR as the wiring, directly countering the parent SD\'s own unwired-call-site failure mode',
    ],
    failure_patterns: [
      'FR-5\'s two-sided live proof cannot exist before merge, creating a structural gap between PRD acceptance criteria and what LEAD-FINAL-APPROVAL can actually verify pre-merge',
      'Auto-generated preflight retrospective scored 80% while containing no SD-specific content — quality gate measures structure, not specificity',
    ],
  };

  const { data, error } = await s
    .from('retrospectives')
    .update(patch)
    .eq('id', RETRO_ID)
    .eq('sd_id', SD_UUID)
    .select('id, sd_id, quality_score, status')
    .single();

  if (error) {
    console.error('Update error:', error.message);
    process.exit(1);
  }
  console.log('Retrospective updated:', JSON.stringify(data, null, 2));
}

import { isMainModule } from '../../lib/utils/is-main-module.js';

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
