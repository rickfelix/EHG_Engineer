#!/usr/bin/env node
// SD-LEARN-FIX-ADDRESS-PAT-LES-010: LEAD-phase update reflecting the actual verified scope.
// The pattern's described defect (old stage-23.js's evaluateKillGate reading
// stage22Data.promotion_gate.pass) was already superseded by an unrelated refactor
// (SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001). Rather than a no-op close, this SD ships a
// permanent regression guard proving the fragile shape can never silently reappear.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DESCRIPTION = `## Business Impact

This SD originated from /learn pattern PAT-LES-a7862f7339c4 (source: retrospective for
SD-EVA-FIX-KILL-GATES-001, 2026-02-14), which described: "Stage 23 prerequisite check depends
on stage22Data.promotion_gate.pass being exactly true (boolean). If Stage 22 returns a truthy
non-boolean value, the gate would incorrectly block. A more defensive check would be safer."

## LEAD Verification Against Current Main (2026-09-13)

Traced via git history (commit 7fe5370, PR #1279): the described code was
\`if (stage22Data && !stage22Data.promotion_gate?.pass)\` in the OLD lib/eva/stage-templates/
stage-23.js's evaluateKillGate(). That entire function and its stage22Data positional param
were REMOVED by later, unrelated work (SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001
renumbered Launch Readiness from stage-23 to stage-24; SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001
rewrote its prerequisite logic entirely onto preflightUpstream() -- a canonical
artifact_type-existence check with no boolean-coercion failure mode at all, a strict
improvement over the class of bug the pattern worried about).

## Root Cause Analysis

The pattern's described code no longer exists; no fix is needed for it directly. The residual
risk is regression: nothing previously guarded against this exact fragile shape (or an
equivalent) being reintroduced by a future, unrelated change to these files.

## Fix Delivered

Added a permanent regression guard (tests/unit/eva/stage-templates/
stage-23-launch-readiness-fr1-4-6.test.js) asserting stage-23.js, stage-24.js, and their
analysis-step modules never reintroduce \`stage22Data.promotion_gate\` or a bare
\`evaluateKillGate(\` call -- source-text checked directly, alongside the existing FR-4 test
confirming the current replacement mechanism (UPSTREAM_REQUIREMENTS' 3 canonical-artifact
entries for S20/S21/S22) is still in place.

## Prevention Strategy

The regression guard makes recurrence structurally detectable (a failing unit test) rather
than relying on manual review to notice a reintroduced fragile check.`;

const { data: before, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, description')
  .eq('sd_key', 'SD-LEARN-FIX-ADDRESS-PAT-LES-010')
  .maybeSingle();

if (readErr) { console.error('READ ERROR', readErr.message); process.exit(1); }
if (!before) { console.error('SD not found'); process.exit(1); }

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description: DESCRIPTION,
    scope: 'IN SCOPE: Verify PAT-LES-a7862f7339c4 against current main; add a permanent regression guard preventing the described fragile pattern from ever being reintroduced into stage-23.js/stage-24.js. OUT OF SCOPE: Re-implementing the original evaluateKillGate check (superseded, not needed) or any change to the current preflightUpstream mechanism.',
    key_changes: [
      {
        type: 'fix',
        change: 'Verify PAT-LES-a7862f7339c4 against current main (found: superseded by an unrelated refactor) and add a regression guard test preventing the fragile shape from reappearing',
        impact: 'Closes the pattern permanently and makes future recurrence structurally detectable via a failing unit test, rather than relying on manual review',
      },
    ],
    smoke_test_steps: [
      {
        instruction: 'Run tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js',
        expected_outcome: 'All tests pass, including the new regression guard confirming stage22Data.promotion_gate / evaluateKillGate( do not appear in stage-23.js, stage-24.js, or their analysis-step modules',
      },
      {
        instruction: 'Confirm the FR-4 UPSTREAM_REQUIREMENTS test (the replacement mechanism) still passes alongside the new guard',
        expected_outcome: 'UPSTREAM_REQUIREMENTS lists 3 entries (S20, S21, S22) -- the current, non-fragile prerequisite check is intact',
      },
    ],
  })
  .eq('id', before.id);

if (updateErr) { console.error('UPDATE ERROR', updateErr.message); process.exit(1); }

console.log('Updated description/scope/key_changes/smoke_test_steps to reflect the verified finding + regression guard.');
