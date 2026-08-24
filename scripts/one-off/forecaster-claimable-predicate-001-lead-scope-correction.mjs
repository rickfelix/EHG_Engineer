#!/usr/bin/env node
// SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 LEAD phase: corrects the SD record
// from its as-submitted plan_content (only half-accurate, per validation-agent evidence
// c3e0e895-526f-4c2f-9082-f52ab780bf02) to the measurement-verified scope. See
// .claude/session-state.md "Update 1" for the full rationale.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001';

export async function correctLeadScope() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const description = `Forecaster: close two measured, verified defects in the belt-low forecaster's claimable accounting.

## Problem (LEAD-corrected, validation-agent evidence c3e0e895-526f-4c2f-9082-f52ab780bf02)
The original submission claimed the forecaster's arithmetic was inconsistent. Verified against 803/803 live belt_capacity_verdicts rows: the arithmetic is exact. The real defects are narrower:
1. EXTENT MISMATCH: the Adam-facing message's "Belt=N" header counts SD+QF combined, but the "Claimable now:" list enumerates SD keys only -- the two numbers visually disagree even though both are individually correct (coordinator-capacity-forecast.mjs:449-450 vs the console-only breakout at :129).
2. DEAD "HELD" AXIS: metadata.scheduling_constraint (a chairman W6 ruling format) has ZERO code readers anywhere in the codebase. A held SD is counted claimable indefinitely (confirmed: still claimable ~2 days after the cited specimen's hold landed, not ~3h as originally claimed).

## Scope (LEAD-reduced from the as-submitted plan; see scope_reduction_percentage)
- FR-1: add a new "held" axis to classifyDispatchIneligibility (lib/fleet/claim-eligibility.cjs) reading metadata.scheduling_constraint. Purely additive -- zero existing readers means no consumer currently depends on this being ignored. Every consumer of the shared predicate inherits the fix.
- FR-2: (a) correct the published deficit formula to the real one (deficit = (demandSoon + BELT_BUFFER) - beltDepth, BELT_BUFFER=1, no incorrect max(0,...) clamp -- negative deficit is a valid SURPLUS reading); (b) fix the Adam-facing message to print the SAME SD+QF extent the console already breaks out at coordinator-capacity-forecast.mjs:129, closing the header-vs-list mismatch.
- FR-3: regression fixtures for (i) the belt_capacity_verdicts formula invariant, (ii) a scheduling_constraint-held SD excluded from claimable the same tick the hold lands, (iii) header extent always equals the printed claimable-now list extent.

## Explicitly out of scope (LEAD decision, deferred)
- Deleting/restructuring the deliberate, documented bare-shell re-derivation in scripts/lib/capacity-inputs.mjs:333-368 (forecaster intentionally under-counts vs. computeClaimableLeaves -- "under-count is the SAFE deficit direction"). This is NOT a bug to fix.
- Whether the fleet-wide belt should be tier-FILTERED (not just tier-displayed) -- scripts/lib/claimable-leaves.mjs:57 calls classifyDispatchIneligibility(d) with no ctx, so tier axes can never fire from that call site today. This is a genuine architectural decision with fleet-wide blast radius; deferred to its own SD/chairman ruling, consistent with the original SD's own "out of scope: ranking" boundary.
- Demand-side estimation heuristics (idle/freeing-soon) -- unchanged, per original scope.`;

  const success_criteria = [
    { criterion: 'A scheduling_constraint-held SD is never claimable', measure: 'Fixture: apply a held constraint to a live-shaped fixture row, assert claimableDbFreeReason() returns a held reason in the same tick, before/after comparison against the pre-fix behavior' },
    { criterion: 'Deficit formula published matches the real shipped formula', measure: 'Fixture: replay belt_capacity_verdicts history (803+ rows) through the corrected formula-publication code and assert zero mismatches against the stored verdict' },
    { criterion: 'Adam-facing message extent matches the claimable-now list extent', measure: 'Fixture: construct a mixed SD+QF belt, assert the printed header count equals the printed claimable-now enumeration count' },
    { criterion: 'No regression to the deliberate bare-shell under-count safety property', measure: 'Existing capacity-inputs.mjs bare-shell test(s) still pass unchanged; PRD explicitly documents this property as preserved, not touched' },
  ];

  const key_changes = [
    { change: 'Add a "held" ineligibility axis (metadata.scheduling_constraint) to classifyDispatchIneligibility', type: 'fix' },
    { change: 'Correct the published deficit formula text to match the real shipped formula (demandSoon + BELT_BUFFER - beltDepth)', type: 'fix' },
    { change: 'Fix the Adam-facing message to print the same SD+QF extent the console breakout already computes', type: 'fix' },
    { change: 'Add regression fixtures for the held axis, the formula invariant, and the extent-match invariant', type: 'testing' },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'validation-agent evidence c3e0e895-526f-4c2f-9082-f52ab780bf02',
      reason: 'as-submitted plan_content premise was only half-accurate on the arithmetic claim, and FR-2 formula was verified wrong against lib/drive-loop/belt-verdict.js; FR-1 literal text would have deleted a deliberate documented safety property',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description,
      success_criteria,
      key_changes,
      scope_reduction_percentage: 45,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected LEAD-phase scope for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  correctLeadScope().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
