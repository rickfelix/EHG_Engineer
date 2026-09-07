#!/usr/bin/env node
/**
 * Improves the auto-generated (preflight_autogen) SD_COMPLETION retrospective for
 * SD-LEO-FIX-STALE-SESSION-SWEEP-002 with genuine, SD-specific content — the existing
 * row (id a9f8a7c5) is templated boilerplate ("SD X defined success metric Y", generic
 * FR_PATTERN entries) that never names the actual work: the QF-to-SD escalation with zero
 * rework, the JS-floor-first design for the chairman-gated migration, the EXEC-phase
 * TESTING/SECURITY evidence, or the QF LOC-estimation gap. This script REPLACES
 * what_went_well / what_needs_improvement / key_learnings / action_items /
 * success_patterns / failure_patterns with specifics, keeping the row id, sd_id, quality
 * metadata, and PUBLISHED status intact.
 *
 * Ground truth sources (verified before writing this patch):
 *  - strategic_directives_v2.metadata (qf_estimated_loc=70, source_qf_id=QF-20260905-230)
 *  - sub_agent_execution_results: VALIDATION/LEAD (537c8fad), TESTING/EXEC (8f43c2c4),
 *    SECURITY/EXEC (0c7e5d88)
 *  - product_requirements_v2 PRD-SD-LEO-FIX-STALE-SESSION-SWEEP-002 (FR-1..FR-4)
 *  - git commits 3d2f28488aa (initial sink) and 13c57add3a0 (SECURITY OBS-1 fix)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '84c487d4-0dd8-4841-b5f1-16ad5799a316';
const SD_KEY = 'SD-LEO-FIX-STALE-SESSION-SWEEP-002';
const RETRO_ID = 'a9f8a7c5-4a57-4b24-bb69-879553c4769d';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const s = createClient(url, key);

  const patch = {
    what_went_well: [
      {
        achievement:
          'QF-to-SD escalation preserved all completed work with zero rework: QF-20260905-230\'s implementation (lib/fleet/sweep-findings-sink.cjs, all 4 wired call sites in scripts/stale-session-sweep.cjs, the DRAIN_SETS.coordinator entry, and the seed migration) was already complete on branch feat/SD-LEO-FIX-STALE-SESSION-SWEEP-002 before LEAD validated the escalated SD. LEAD VALIDATION (sub_agent_execution_results 537c8fad, verdict CONDITIONAL_PASS) confirmed "no duplicate work, no scope creep, escalation justified on every LOC counting convention", and PLAN wrote the PRD against the already-delivered branch scope rather than re-deriving requirements from scratch.',
        is_boilerplate: false,
      },
      {
        achievement:
          'JS-floor-first design meant the feature worked correctly even with its companion migration unapplied: FR-4 registered the new sweep_finding_alert kind directly in lib/fleet/worker-status.cjs\'s DRAIN_SETS.coordinator (immediately effective via drain-set-registry.js\'s resolveRecognizedKinds union), while the matching database/migrations/20260906_role_drain_sets_add_sweep_finding_alert.sql seed migration sat chairman-gated (@approved-by: PENDING) for DB-side parity only. LEAD VALIDATION flagged the unapplied migration as a HIGH warning but confirmed the coordinator inbox filter (scripts/hooks/coordination-inbox.cjs:672) already uses the null-safe .or(payload->>kind.neq.X,payload->>kind.is.null) shape rather than the NOT-IN-on-nullable-kind shape that hides findings — so the feature was structurally excluded from the wired-but-blind failure mode and did not need the migration to function.',
        is_boilerplate: false,
      },
      {
        achievement:
          'TESTING (EXEC phase, sub_agent_execution_results 8f43c2c4, confidence 95) executed rather than cited: 28/28 targeted tests across 3 files, all 6 PRD test_scenarios (TS-1..TS-6) re-read live from product_requirements_v2 and bound to specific passing vitest assertions (100% coverage), plus a 4/4 fail-soft probe covering FR-1 AC#2 (filesystem write failure never crashes the sweep) which none of TS-1..TS-6 reached. Full regression: 845/845 passed across 56 files — every test file referencing DRAIN_SETS/worker-status/resolveRecognizedKinds, run because this SD mutates DRAIN_SETS.coordinator.',
        is_boilerplate: false,
      },
      {
        achievement:
          'SECURITY (EXEC phase, sub_agent_execution_results 0c7e5d88, verdict PASS) surfaced a real, non-blocking finding (OBS-1: appendFindingLine()\'s JSON.stringify({ ts, ...finding }) spread order let a finding object carrying its own "ts" key silently override the sink\'s append-time timestamp — unreachable today since all 4 call sites build fixed-key objects, but a latent footgun) and it was fixed same-session in commit 13c57add3a0 ("stamp jsonl ts last so a finding.ts can never override it") rather than deferred or left as a backlog item.',
        is_boilerplate: false,
      },
      {
        achievement:
          'The escalation trigger itself was mechanical and honest, not judgment-based: the QF\'s own measured source diff (~171 LOC across sweep-findings-sink.cjs, the 4 wired call sites, the worker-status.cjs DRAIN_SETS literal, and the seed migration) exceeded the Tier-2 75-line cap per the QF\'s LOC-counting convention, so it auto-escalated to a full SD rather than being force-fit into QF scope or silently split to dodge the cap.',
        is_boilerplate: false,
      },
    ],
    what_needs_improvement: [
      'QF LOC estimation significantly undershot the measured diff: strategic_directives_v2.metadata.qf_estimated_loc=70 vs a measured source diff of roughly 171 LOC (~2.4x) — the estimate was apparently scoped to the new sweep-findings-sink.cjs module alone and did not account for the 4-call-site wiring pass in scripts/stale-session-sweep.cjs, the DRAIN_SETS.coordinator literal, and the companion seed migration. QF authoring guidance should default-assume Tier-3 sizing (or explicitly re-estimate against every touched file) whenever a QF adds a new module AND wires it into existing call sites AND ships a companion migration, rather than estimating against the primary new file in isolation.',
      'The chairman-gated seed migration (database/migrations/20260906_role_drain_sets_add_sweep_finding_alert.sql) remains unapplied at PLAN-TO-LEAD. The JS floor mitigates this functionally (see what_went_well), but it is still an open loose end past SD closure: the DB-side role_drain_sets table stays out of 1:1 parity with DRAIN_SETS.coordinator (the invariant tests/unit/fleet/drain-set-registry.test.js enforces) until a chairman applies it.',
      'PRD FR-3\'s acceptance-criteria text says "All 4 call sites (2 in isSweepResetAllowed, 1 in WARNINGS, 2 in CONFLICTS)" which is internally inconsistent (2+1+2=5, not 4) — TESTING (8f43c2c4) caught this and confirmed the code correctly implements 5 call sites, but the PRD text itself was carried forward uncorrected into PLAN-TO-LEAD rather than fixed at the point of discovery.',
    ],
    key_learnings: [
      {
        learning:
          'When a QF\'s actual diff crosses the Tier-2 LOC cap, letting the escalated SD inherit the already-complete implementation — rather than restarting PRD authoring or EXEC from zero — is the efficient path. LEAD, PLAN, and EXEC evidence on this SD all confirm zero rework: the work was retroactively documented and verified, not redone.',
        is_boilerplate: false,
      },
      {
        learning:
          'JS-floor-first is a repeatable pattern for shipping a feature whose DB-side counterpart needs a human (chairman) approval step: register the recognized-kind literal directly in the JS registry (functionally complete immediately) and let the SQL migration exist purely for DB-side parity, gated on approval, without blocking the feature itself.',
        is_boilerplate: false,
      },
      {
        learning:
          'QF LOC estimates should be scoped against every file the change will touch (new module, call-site wiring, registry entries, migrations), not just the primary new file — undercounting the wiring and migration cost is what turned a "70 LOC" QF into a 171 LOC diff and triggered an unplanned (though harmless) escalation.',
        is_boilerplate: false,
      },
      {
        learning:
          'A dedup key built from raw finding text (subject=warning text truncated, per SECURITY OBS-3) is fragile against volatile substrings (e.g. an age-in-seconds field that changes every tick) — this is bounded by dispatch backpressure rather than causing an actual flood, but it is worth remembering as a general caution for any future dedup key derived from freeform text rather than a stable identifier.',
        is_boilerplate: false,
      },
    ],
    action_items: [
      {
        owner: 'LEO-Session / QF authoring guidance',
        action:
          'Record the QF LOC-estimation gap (estimated 70 vs measured ~171) as a documented case for QF-authoring guidance: a QF that adds a new module AND wires it into existing call sites AND ships a companion migration should default-assume Tier-3 sizing rather than estimate against the new module alone.',
        source: 'knowledge_capture',
        deadline: 'Next QF-authoring guidance review',
        priority: 'low',
        smart_format: true,
        success_criteria: 'QF LOC-estimation guidance references this SD as a worked example',
      },
      {
        owner: 'Chairman / coordinator',
        action:
          'Apply database/migrations/20260906_role_drain_sets_add_sweep_finding_alert.sql once chairman-approved, and confirm role_drain_sets returns the sweep_finding_alert row for kind=coordinator (currently 0 rows live).',
        deadline: 'Next chairman migration review window',
        verification: 'SELECT on role_drain_sets WHERE kind=sweep_finding_alert returns 1 row',
        is_boilerplate: false,
      },
      {
        owner: 'LEO-Session',
        action:
          'Correct PRD-SD-LEO-FIX-STALE-SESSION-SWEEP-002 FR-3\'s acceptance-criteria text from "4 call sites" to 5, matching both its own parenthetical (2+1+2) and the shipped code.',
        deadline: 'Low priority cleanup, next PRD touch',
        verification: 'FR-3 acceptance_criteria text reads 5 call sites',
        is_boilerplate: false,
      },
    ],
    success_patterns: [
      'QF-to-SD escalation with zero rework: PLAN wrote the PRD against the already-delivered branch scope instead of restarting requirements authoring',
      'JS-floor-first design: DRAIN_SETS.coordinator registration made the feature fully functional before its chairman-gated migration companion was applied',
      'SECURITY finding (OBS-1, ts spread-order footgun) fixed in the same EXEC session rather than deferred (commit 13c57add3a0)',
      'TESTING executed live assertions bound to all 6 PRD test_scenarios plus a fail-soft probe covering an uncovered acceptance criterion, not merely cited',
    ],
    failure_patterns: [
      'QF LOC estimate (70) undershot the measured source diff (~171) by roughly 2.4x, triggering an unplanned (though harmless) Tier-2-to-SD escalation',
      'PRD FR-3 acceptance-criteria text miscounts its own call sites (states 4; parenthetical and code both total 5)',
      'Chairman-gated seed migration remains unapplied at PLAN-TO-LEAD, leaving DB-side role_drain_sets out of parity with the JS floor until approved',
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
  console.log('SD:', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
