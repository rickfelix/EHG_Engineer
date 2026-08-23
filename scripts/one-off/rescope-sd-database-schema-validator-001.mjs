#!/usr/bin/env node
/**
 * Rescope SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001 after LEAD-phase prospective
 * TESTING found the real defect is deeper than the original title: staticFileValidation()'s
 * `await glob(pattern)` never resolves to a file list with glob@7.2.3 (callback/EventEmitter
 * API, not thenable) — allFiles is ALWAYS empty, for every pattern, for every SD. The chairman-
 * gated blind spot is a symptom of this, not the root cause. See sub_agent_execution_results
 * row 4b38649c-93c0-419a-a80f-616d983de36d and coordinator signal 1db687bf.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001';

const newDescription = "lib/sub-agents/database/schema-validator.js staticFileValidation() has NEVER found any migration file for any SD. LEAD-phase prospective TESTING (evidence 4b38649c-93c0-419a-a80f-616d983de36d) found the true root cause is deeper than the original chairman-gated-glob-missing framing: line 107's `const files = await glob(pattern)` uses glob@7.2.3's callback/EventEmitter API, which is NOT thenable — `await` resolves to a Glob instance immediately, not the file list. `Array.isArray(files)` is false and `Array.from(glob_instance)` yields `[]`, so `allFiles` is always empty for every pattern (including the three already-listed directories), for every SD, unconditionally. Reproduced live: staticFileValidation('SD-KNOWLEDGE-001', {}) returns NOT_REQUIRED/0 files despite database/migrations containing 3 real files that literally reference that SD ID. Downstream, index.js:219 launders this into PASS/confidence-100 and skips Phase-2 DB verification entirely — the DATABASE sub-agent's static validation phase has been a silent no-op for every SD, not just ones using the chairman-gated directory.";

const newScope = "Fix lib/sub-agents/database/schema-validator.js's staticFileValidation(): (1) properly resolve the glob call (promisify glob or use glob.sync) so allFiles is populated for real, (2) add 'database/chairman-gated/*.sql' as a fourth migrationPaths entry (the originally-scoped fix — necessary but was proven insufficient alone), (3) pass cwd:getRepoRoot() so the fix is worktree-safe like the sibling loadSchemaDocumentation() function, (4) add a RED-first regression test that fails against current main and passes after the fix (per testing-agent: do not assert the array literal contains the new string — assert observed behavior). OUT OF SCOPE (flagged separately, not fixed here): the same await-glob defect in lib/sub-agents/database/migration-handler.js:24/77 (different file); the 7 divergent hardcoded migration-root lists vs the canonical DEFAULT_EXTRA_ROOTS in scripts/verify-migration-apply-state.mjs.";

const patch = {
  description: newDescription,
  scope: newScope,
  rationale: "Escalated from quick-fix QF-20260822-945 (Tier 3 routing, migration risk keyword). Original LOC estimate: 4 — since revised upward after LEAD-phase prospective TESTING found the actual defect (a broken async glob call, not a missing array entry) is deeper than the QF's original framing.",
  key_changes: [
    { change: "Fix the broken await-glob call in staticFileValidation() (glob@7.2.3 callback API misused as a Promise) so migration files are actually discovered", type: 'fix' },
    { change: "Add 'database/chairman-gated/*.sql' to migrationPaths (originally-scoped fix, confirmed necessary but not sufficient alone)", type: 'fix' },
    { change: "Add cwd:getRepoRoot() to the glob call for worktree safety, matching loadSchemaDocumentation()'s existing pattern", type: 'fix' },
    { change: "Add a RED-first regression test (fails on current main, passes after the fix) proving staticFileValidation() finds a real migration file by SD-ID content match", type: 'test' }
  ],
  success_criteria: [
    { criterion: 'staticFileValidation() actually discovers migration files that exist on disk', measure: "Regression test: staticFileValidation('SD-KNOWLEDGE-001', {}) returns verdict=VALID with database/migrations/20251015_add_retrospective_quality_score_constraint.sql in migration_files (currently returns NOT_REQUIRED/0 files on main — this is the RED-first proof)" },
    { criterion: 'chairman-gated migrations are scanned', measure: 'A fixture *.sql under database/chairman-gated/ referencing a test SD ID is found by the same function' },
    { criterion: 'No regression to callers', measure: 'index.js and any other consumer of staticFileValidation() still function correctly with the corrected (non-empty) return shape' }
  ],
  success_metrics: [
    { metric: 'Fixture-blind gap closed', target: 'staticFileValidation() finds real, pre-existing migration files (was: 0, always, for every SD)' },
    { metric: 'Chairman-gated coverage', target: '56 previously-unscanned files become scannable' },
    { metric: 'Zero regressions', target: '0 existing schema-validator tests broken' }
  ],
  risks: [
    {
      risk: 'Downstream consumers (index.js:219 and others) may currently assume/depend on staticFileValidation() returning NOT_REQUIRED (since it always has) — fixing it to return real results could surface previously-hidden migration content for SDs that never expected Phase-2 checks to run',
      impact: 'medium',
      likelihood: 'low',
      mitigation: 'Grep all call sites of staticFileValidation before merging; confirm index.js and any other consumer handle a populated migration_files/VALID verdict correctly (this is likely the FIRST time they have ever received one)'
    }
  ]
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update(patch)
  .eq('sd_key', SD_KEY)
  .select('sd_key, description, scope')
  .single();

if (error) {
  console.error('❌ Rescope failed:', error.message);
  process.exit(1);
}

console.log('✅ Rescoped SD', data.sd_key);
console.log('New description:', data.description.slice(0, 200) + '...');
