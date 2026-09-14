#!/usr/bin/env node
/**
 * Update SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's title/description/scope/key_changes/
 * smoke_test_steps/success_metrics/strategic_objectives/rationale to reflect the ACTUAL
 * verified findings, replacing the /learn-generated boilerplate. Mirrors the pattern
 * established by SD-LEARN-FIX-ADDRESS-PAT-LES-010/013's update-scope one-off scripts.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';

const rationale = 'This SD addressed 3 /learn-reported patterns. All 3 were verified STALE: '
  + 'PAT-LES-1a22954978cc\'s scoring-logic bug was already fixed in Feb 2026 (commit d228da9dac7); '
  + 'PAT-LES-7fd10bfaf89a\'s "zero structured logging" claim and PAT-LES-e72314a404ae\'s "missing '
  + 'stage-14 security object" claim both trace verbatim to Feb 14 2026 retrospectives that were '
  + 'fixed within 24-48 hours (commits 0dd7e2735dd, d5f3ab7d) -- 7 months before /learn re-surfaced '
  + 'them with a fresh created_at as if newly discovered. A genuine, narrow gap was found and closed '
  + 'instead: the LIVE sdObjectivesDefined validator (gate-l-sd-creation.js, actually responsible for '
  + 'the 45 recorded occurrences of PAT-LES-1a22954978cc) had zero direct test coverage -- a '
  + 'differently-named sibling file with the same threshold logic was tested, but not the one '
  + 'actually wired into the validator registry. This SD was also a confirmed full duplicate of '
  + 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 (identical source_items, minted 1 minute apart by a '
  + '/learn race); 152 was cancelled and its 3 patterns\' assigned_sd_id reassigned to this SD.';

const description = `## Verified Findings (supersedes /learn's original boilerplate description)

This SD addressed 3 patterns surfaced by \`/learn\`. All 3 were independently verified STALE
against current main:

1. **PAT-LES-1a22954978cc** ("Gate L:sdObjectivesDefined failed: score 0/100", 45 occurrences):
   the scoring-logic bug (a zero-issues check that failed SDs with 1 objective + metrics) was
   already fixed in commit d228da9dac7 (2026-02-27, PAT-AUTO-043). Remaining 0/100 hits reflect
   the gate running before an auto-generated orchestrator child's objectives are authored -- a
   sequencing/timing artifact, not a live scoring defect (sample triggering SDs currently have
   well-formed strategic_objectives and would score 100/100 today).
2. **PAT-LES-7fd10bfaf89a** ("no structured logging in 5 EVA stages"): traces verbatim to a
   2026-02-14 retrospective for SD-EVA-QA-AUDIT-TRUTH-001. Fixed the very next day (commit
   0dd7e2735dd, 2026-02-15, SD-EVA-R2-FIX-LOGGING-001, "Logging Instrumentation for 72 Silent
   Files") -- structured logging is now pervasive across all 5 stage templates and analysis steps.
3. **PAT-LES-e72314a404ae** ("stage 14 missing security object"): traces verbatim to a 2026-02-14
   retrospective for SD-EVA-QA-AUDIT-BLUEPRINT-001. Fixed the next day (commit d5f3ab7d,
   2026-02-15). \`lib/eva/stage-templates/stage-14.js\` currently REQUIRES and validates a
   \`security\` object (authStrategy, dataClassification, complianceRequirements) and hard-fails
   without it; further hardened by a later completed SD.

\`/learn\`'s pattern-extraction pipeline appears to mint issue_patterns rows from OLD
retrospective text with a FRESH created_at/first_seen timestamp, without checking whether the
underlying issue was already fixed -- signaled as a systemic harness gap (this is the 3rd time
this session a full LEAD-TO-PLAN-TO-EXEC-TO-LEAD-FINAL cycle was spent verifying an
already-resolved defect: SD-LEARN-FIX-ADDRESS-PAT-LES-010, -013, and now 2 of 3 patterns here).

## Genuine Gap Found and Closed

The LIVE \`sdObjectivesDefined\` validator (registered by
\`scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js\`, wired into
the validator registry actually used by the LEAD-TO-PLAN/LEAD gate pipeline, and the real source
of PAT-LES-1a22954978cc's 45 occurrences) had ZERO direct test coverage. A differently-named
sibling file (\`scripts/modules/handoff/validators/sd-objectives-validator.js\`) implements the
same \`score >= 30\` threshold logic and IS tested, but the two are kept in sync only by
convention (a shared \`PAT-AUTO-b6e88bcc\` comment), not shared code -- an edit to one would not
be caught by the other's tests. Added
\`tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js\`, which also found
and closed a genuinely untested boundary case in the SIBLING file too: 0 objectives + metrics
present (score exactly 30, issues array non-empty) is the ONE input shape that actually
distinguishes the current \`score >= 30\` formula from the pre-fix \`issues.length === 0\` formula
-- verified via live mutation testing (reverting the live gate to the pre-fix formula caused
exactly this 1 new test to fail; all other cases coincidentally agreed between both formulas).

## Duplicate Consolidation

SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 was confirmed a full duplicate (identical 3 source_items,
minted 1 minute apart by a race in /learn's ALREADY_ASSIGNED_OPEN_SD filter). Per the
coordinator's explicit delegation of this LEAD-phase decision and the established fleet precedent
(Alpha-2, PAT-LES-338e7a02477c), SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 was cancelled and the 3
shared issue_patterns rows' assigned_sd_id reassigned to this SD so the closure-loop resolves them
correctly on completion.`;

const scope = 'IN SCOPE: Verify all 3 /learn-reported patterns against current main and close each '
  + 'honestly. Add a regression guard for the one narrow, previously-untested link found (the LIVE '
  + 'sdObjectivesDefined validator in gate-l-sd-creation.js). Cancel the confirmed duplicate '
  + '(SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152) and reassign its patterns. '
  + 'OUT OF SCOPE: Reimplementing already-fixed logging/security-object mechanisms. Changing '
  + 'existing gate thresholds, scoring algorithms, or boilerplate pattern lists. Fixing the '
  + 'underlying /learn stale-retrospective-extraction defect itself (signaled separately to the '
  + 'coordinator as a systemic harness gap, out of this SD\'s scope).';

const keyChanges = [
  {
    type: 'verification',
    change: 'Verified all 3 /learn-reported patterns (PAT-LES-1a22954978cc, PAT-LES-7fd10bfaf89a, PAT-LES-e72314a404ae) against current main: all stale, already fixed by prior completed work',
    impact: 'Confirms the patterns are stale and closes them without reimplementing existing, working functionality'
  },
  {
    type: 'test',
    change: 'Added tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js: a real regression guard for the LIVE sdObjectivesDefined validator, including the one boundary case (0 objectives + metrics, score=30) that actually distinguishes the current threshold formula from the pre-fix zero-issues formula',
    impact: 'Closes the one narrow, previously-untested link responsible for the 45 recorded occurrences of PAT-LES-1a22954978cc, verified non-vacuous via live mutation testing'
  },
  {
    type: 'housekeeping',
    change: 'Cancelled confirmed-duplicate SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 and reassigned its 3 shared issue_patterns rows\' assigned_sd_id to this SD',
    impact: 'Prevents duplicate work across two seats and ensures the closure-loop correctly auto-resolves the shared patterns on completion'
  }
];

const successCriteria = [
  {
    criterion: 'All 3 patterns verified already addressed by prior completed work',
    measure: 'Each pattern traced to a specific prior commit fixing the described defect, dated before /learn re-surfaced it',
    verification: 'Manual: git log + DB queries against strategic_directives_v2 and retrospectives for each of the 3 patterns'
  },
  {
    criterion: 'The one genuinely untested link (the live sdObjectivesDefined validator) is now regression-guarded',
    measure: 'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js passes (7/7) and was proven non-vacuous via mutation testing',
    verification: 'Automated: npx vitest run tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js'
  },
  {
    criterion: 'Confirmed-duplicate SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 is cancelled and its patterns correctly reassigned',
    measure: 'strategic_directives_v2.status=cancelled for -152; issue_patterns.assigned_sd_id=-151 for all 3 shared patterns',
    verification: 'Automated: query strategic_directives_v2 and issue_patterns for the relevant keys'
  }
];

const smokeTestSteps = [
  {
    instruction: 'From the repo root, run: npx vitest run tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js',
    expected_outcome: '1 file, 7 tests pass, including the PAT-AUTO-b6e88bcc boundary case (0 objectives + metrics, score=30, passed=true)'
  },
  {
    instruction: 'From the repo root, run: npx vitest run tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js tests/unit/handoff/validators/sd-objectives-validator.test.js',
    expected_outcome: 'Both files pass with a combined 17 tests (7 + 10)'
  }
];

const successMetrics = [
  {
    metric: '3 pattern recurrence rates',
    baseline: '47 total recorded occurrences across 3 patterns (issue_patterns), most from before this SD',
    target: '0 new occurrences post-verification: all 3 defect classes structurally cannot recur (2 already fixed 7 months ago with existing test coverage; the 3rd\'s live gate now has direct regression coverage)',
    actual: 'All 3 patterns traced to specific prior fixes; the live sdObjectivesDefined validator gap closed with a mutation-tested regression guard',
    measurement: 'Query issue_patterns for each pattern_id after SD completion; re-run the new + sibling test files'
  },
  {
    metric: 'gate-l-sd-creation.js sdObjectivesDefined test coverage',
    baseline: '0 tests directly exercised the LIVE validator (registerGateLValidators); only a differently-named sibling file with the same logic was tested',
    target: 'At least 1 test suite exercises the live validator directly, including the boundary case that distinguishes it from its pre-fix behavior',
    actual: '7 new tests added, verified non-vacuous via live mutation testing (1 test correctly failed when the live gate was reverted to its pre-fix formula)',
    measurement: 'npx vitest run tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js'
  },
  {
    metric: 'Duplicate SD consolidation',
    baseline: '2 draft SDs (LEARN-151, LEARN-152) both targeting the identical 3 patterns, risking duplicate work across 2 seats',
    target: '1 surviving SD carrying all 3 patterns\' assigned_sd_id, 1 cancelled with a documented reason',
    actual: 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 cancelled; all 3 patterns\' assigned_sd_id reassigned to SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
    measurement: 'Query strategic_directives_v2.status and issue_patterns.assigned_sd_id for the relevant keys'
  }
];

const strategicObjectives = [
  'Verify all 3 /learn-reported patterns against current main and close each honestly, without reimplementing already-fixed functionality',
  'Close the one genuinely untested link in an otherwise-live gate: the sdObjectivesDefined validator actually wired into the validator registry, verified non-vacuous via mutation testing',
  'Consolidate the confirmed-duplicate SD pair so the shared patterns resolve correctly on completion'
];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      rationale,
      description,
      scope,
      key_changes: keyChanges,
      success_criteria: successCriteria,
      smoke_test_steps: smokeTestSteps,
      success_metrics: successMetrics,
      strategic_objectives: strategicObjectives,
    })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();

  if (error) {
    console.error('FAILED:', error.message);
    process.exit(1);
  }

  console.log('UPDATED:', data.sd_key);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
