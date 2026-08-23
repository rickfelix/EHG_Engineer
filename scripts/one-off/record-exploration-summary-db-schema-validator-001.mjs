#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001';

const filesExplored = [
  {
    file: 'lib/sub-agents/database/schema-validator.js',
    findings: "staticFileValidation() (lines 85-114) built migrationPaths from 3 directories and did `const files = await glob(pattern)` at line 107. glob@7.2.3's main export is callback/EventEmitter-based (not thenable) -- await resolved to the Glob instance itself, not the file list. Array.isArray(files) was false, Array.from(glob_instance) yielded []. allFiles was ALWAYS empty, for every pattern, for every SD, unconditionally -- not just the chairman-gated directory the original QF was scoped around. Fixed by promisify(glob) + cwd:getRepoRoot()+absolute:true, plus adding 'database/chairman-gated/*.sql' as the originally-requested 4th pattern."
  },
  {
    file: 'lib/sub-agents/database/index.js',
    findings: "The only production consumer of staticFileValidation() (line 216). Lines 219-225 early-return verdict=PASS/confidence=100 whenever phase1.verdict==='NOT_REQUIRED' -- since staticFileValidation always returned NOT_REQUIRED, this branch has been the ONLY path ever taken. Contract-compliance validation (line 258) and Phase-2 DB verification have been dead code for the DATABASE sub-agent's entire lifetime."
  },
  {
    file: 'lib/sub-agents/database/database.test.js',
    findings: "Prior coverage of staticFileValidation was `expect(typeof module.staticFileValidation).toBe('function')` -- never actually invoked. Added 3 real behavioral tests with fixture files (database/migrations + database/chairman-gated), RED-first verified: failed against original code (2/2 red), pass against the fix (10/10 green)."
  },
  {
    file: 'tests/database/schema-validator.test.js',
    findings: "Confirmed genuine naming collision -- this file tests scripts/db-validate/schema-validator.js's SchemaValidator class (DB column-existence checks), a completely different module unrelated to the one this SD fixes. No real coverage existed for the actual defect before this SD."
  },
  {
    file: 'lib/sub-agents/database/migration-handler.js',
    findings: "Sibling file with the identical await-glob defect (line 77) -- independently confirmed by both prospective testing-agent and validation-agent sub-agent runs. Kept explicitly OUT of this SD's scope (different file, not named in the SD title) and reported to the coordinator via /signal (harness-bug, critical, signal 1db687bf) for separate disposition rather than silently expanding this PR."
  },
  {
    file: 'lib/repo-paths.js',
    findings: "getRepoRoot() -- already used by the sibling loadSchemaDocumentation() function in schema-validator.js for worktree-safe path resolution. Reused the same helper for the glob fix's cwd option so the fix works correctly when run from inside a .worktrees/<sd> checkout, not just the main repo root."
  },
  {
    file: 'scripts/verify-migration-apply-state.mjs',
    findings: "Owns DEFAULT_EXTRA_ROOTS (line 174), a drift-tested canonical list of migration-adjacent directories. Confirmed (via testing-agent + validation-agent) that schema-validator.js's migrationPaths is one of 7 divergent hardcoded copies of a similar list across the codebase, vs this one canonical/drift-tested source -- a separate single-representation violation flagged to the coordinator, not fixed in this SD (would be a much larger refactor than the stated bugfix scope)."
  },
  {
    file: 'database/chairman-gated/ (live directory listing)',
    findings: "Confirmed 56 real .sql migration files exist in this directory (grep-verified), all previously invisible to staticFileValidation() -- proof the original QF's premise (a real, high-severity fixture-blind gate) was accurate, even though the true root cause (broken glob await) was deeper and broader than the QF's stated fix (adding one array entry, which testing-agent proved was a strict no-op against the pre-existing broken call)."
  },
  {
    file: 'strategic_directives_v2 (live query)',
    findings: "QF-20260822-945 -> SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001 escalation chain confirmed correct provenance (validation-agent, evidence d14d22e8) -- no duplicate SD/QF exists for this defect; this SD is the sole in-flight effort."
  },
];

const { data: current, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('exploration_summary')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH ERROR:', fetchErr.message); process.exit(1); }

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    exploration_summary: {
      ...(current.exploration_summary || {}),
      files_explored: filesExplored,
      explored_by: 'Bravo',
      explored_at: new Date().toISOString(),
    },
  })
  .eq('sd_key', SD_KEY);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log(`exploration_summary recorded: ${filesExplored.length} files`);
