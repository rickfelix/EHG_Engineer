import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';

const { data: prd, error: fetchErr } = await sb
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, metadata')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) throw fetchErr;

const fr = [...prd.functional_requirements];
const tr = [...prd.technical_requirements];
const ts = [...prd.test_scenarios];

// FR-1: TESTING sub-agent measured (evidence b2155fb0-b744-4ae1-b07c-aff73f62adbb, F5) that
// validateWorktreePath (scripts/resolve-sd-workdir.js:136-148) uses startsWith with NO
// separator anchor: '<root>\.worktrees-evil\x' and '<root>\.worktreesX\y' both wrongly pass.
// Reusing it naively (TR-1) would inherit this bypass into a security-enforcement hook.
fr[0] = {
  ...fr[0],
  description: fr[0].description +
    ' MEASURED GAP (TESTING sub-agent, evidence b2155fb0): validateWorktreePath uses ' +
    'startsWith(path.join(root, ".worktrees")) with no separator anchor, so a sibling named ' +
    '".worktrees-evil" or ".worktreesX" wrongly passes. The hook wrapper (not validateWorktreePath ' +
    'itself, per TR-1) must additionally verify the resolved target is exactly `.worktrees` or a ' +
    'path UNDER it (i.e. the character immediately after `.worktrees` in the resolved path is a path ' +
    'separator or nothing) before delegating to validateWorktreePath.',
  acceptance_criteria: [
    ...fr[0].acceptance_criteria,
    'git worktree add ../EHG_Engineer.worktrees-evil/x -b y is REFUSED (separator-anchor bypass closed)',
    'git worktree add ../EHG_Engineer.worktreesX/y -b z is REFUSED (separator-anchor bypass closed)',
  ],
};

// FR-4: TESTING sub-agent measured (F6) that AC3 named the wrong composition point, and (F7/F8)
// that wiring the new detector into classifyWorktree's staged categories would (a) break
// tests/unit/worktree-reaper/production-wiring.test.js's 5-detector mock enumeration and (b)
// risk making every sibling worktree an active REMOVAL candidate via hasStage1/hasStage2 --
// inverting the SD's intent into data loss. Re-scoped to gauge-only, computed independently of
// classifyWorktree's category/stage pipeline.
fr[3] = {
  ...fr[3],
  description: 'lib/worktree-reaper/detectors.js gains a new pure detector, `isOutsideWorktreesDir(wt, ctx)`, ' +
    'following the existing {matched, reason, evidence} shape used by isZombieOnMain (line 56), isNested ' +
    '(line 85), hasOrphanSD (line 111), isIdle (line 359), and isSourceTreeBasename (line 517). CORRECTED ' +
    'WIRING (TESTING sub-agent, evidence b2155fb0, F6/F7/F8): the actual production composition point is ' +
    'scripts/worktree-reaper.mjs classifyWorktree() at line ~710 (NOT orphan-sweep.js / removal-decision.js, ' +
    'which do not import the detectors module at all). The new detector\'s result MUST be surfaced as an ' +
    'INDEPENDENT gauge line -- it must NOT be merged into classifyWorktree\'s `categories` array or added to ' +
    'the hasStage1/hasStage2 tables that drive actual reap/removal staging (scripts/worktree-reaper.mjs:796-803). ' +
    'This keeps tests/unit/worktree-reaper/production-wiring.test.js\'s 5-detector mock enumeration undisturbed ' +
    '(the new detector is not part of that composed set) and eliminates the data-loss risk of an existing sibling ' +
    'worktree becoming an auto-removal candidate.',
  acceptance_criteria: [
    'isOutsideWorktreesDir is exported from lib/worktree-reaper/detectors.js and returns {matched: true, reason, evidence} for a fixture worktree path outside .worktrees/',
    'isOutsideWorktreesDir returns {matched: false} for a fixture worktree path under .worktrees/{sd,qf,adhoc}/<key>',
    'The new detector result is surfaced as an independent gauge/log line in scripts/worktree-reaper.mjs (near classifyWorktree, line ~710), NOT merged into the categories array feeding hasStage1/hasStage2',
    'tests/unit/worktree-reaper/production-wiring.test.js (5-detector mock enumeration) is unaffected -- it continues to pass unmodified because the new detector is never part of the staged-categories composition',
    'A unit test exists in tests/unit/worktree-reaper/detectors.test.js covering both the matched and not-matched cases, following the existing describe(\'<detector> (ACn)\') pattern',
  ],
};

tr.push({
  id: 'TR-4',
  title: 'CJS-requires-ESM must be a lazy, in-branch require',
  description: 'TESTING sub-agent confirmed (F4) that require()ing the ESM scripts/resolve-sd-workdir.js from the CJS pre-tool-enforce.cjs hook works on Node 24.12 (~59ms), but it MUST be a lazy require() inside the matched `git worktree add` branch only (mirroring ENFORCEMENT 12d at line 787) -- never a top-level require, or every Bash call pays the ~59ms plus the supabase/dotenv import graph cost.',
});

ts.push({
  id: 'TS-7',
  scenario: 'Separator-anchor bypass is closed',
  type: 'unit',
  expected: 'git worktree add targeting ../EHG_Engineer.worktrees-evil/x or ../EHG_Engineer.worktreesX/y is REFUSED, not wrongly treated as inside .worktrees/',
});
ts.push({
  id: 'TS-8',
  scenario: 'New detector does not alter reaper staging/removal decisions',
  type: 'unit',
  expected: 'tests/unit/worktree-reaper/production-wiring.test.js passes unmodified after the new detector is added; a fixture sibling worktree is never assigned hasStage1/hasStage2 solely due to isOutsideWorktreesDir matching',
});

const newMetadata = {
  ...prd.metadata,
  testing_subagent_findings_applied: {
    evidence_id: 'b2155fb0-b744-4ae1-b07c-aff73f62adbb',
    applied_at: new Date().toISOString(),
    findings: ['F5 (separator-anchor bypass)', 'F6 (wrong wiring files in FR-4 AC3)', 'F7 (production-wiring.test.js mock breakage)', 'F8 (critical: reap blast-radius risk)', 'F4 (lazy require requirement)'],
  },
};

const { error } = await sb
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, technical_requirements: tr, test_scenarios: ts, metadata: newMetadata })
  .eq('id', PRD_ID);
if (error) throw error;

console.log('PRD updated: FR-1 + FR-4 corrected, TR-4 added, TS-7/TS-8 added, metadata recorded.');
