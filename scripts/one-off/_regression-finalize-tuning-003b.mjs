import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const ROW_ID = '776a65fb-ce95-4ff0-be3c-ceb16514ea09';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: existing, error: readErr } = await sb
  .from('sub_agent_execution_results')
  .select('id, metadata, sd_id, phase, verdict')
  .eq('id', ROW_ID)
  .maybeSingle();
if (readErr || !existing) throw new Error(`cannot read provisional row: ${readErr?.message || 'not found'}`);

const findings = [
  { severity: 'INFO', check: 'FR-1 test-suite parity', issue: 'tests/unit/quality/ai-quality-evaluator-config.test.js: 16/16 pass at HEAD. Baseline proof is stronger than a plain before/after: main\'s 15-assertion version of the file was checked out and executed AGAINST THE MODIFIED config.js -- 15/15 pass. Every pre-existing pinned threshold value therefore resolves byte-identically post-change. Delta is +1 test (the new security x user_story direct pin), 0 removed, 0 changed.' },
  { severity: 'INFO', check: 'FR-1 broader sweep', issue: 'tests/unit/quality/ (7 files, 121 tests): 121/121 pass. No neighbouring quality test regressed.' },
  { severity: 'INFO', check: 'FR-2 getPassThreshold untouched', issue: 'getPassThreshold is defined at scripts/modules/ai-quality-evaluator/scoring.js:90. `git diff main -- scripts/modules/ai-quality-evaluator/scoring.js` produces 0 bytes. Whole-module diff is config.js only (+27 lines, 0 deletions). Signature and behaviour are provably untouched by this SD.' },
  { severity: 'INFO', check: 'FR-2 runtime export equality', issue: 'Loaded main\'s config.js and HEAD\'s config.js side by side in one process and deep-compared every export. Export key sets identical (BAND_THRESHOLDS, DEFAULT_THRESHOLD, ORCHESTRATOR_THRESHOLD, SD_TYPE_BLOCKING_THRESHOLDS, SD_TYPE_PASS_THRESHOLDS); ALL_EXPORTED_VALUES_IDENTICAL=true. SD_TYPE_PASS_THRESHOLDS at HEAD == at main: {"documentation":{"default":50},"infrastructure":{"default":55,"prd":60,"retrospective":60},"feature":{"default":60,"prd":65,"retrospective":65},"database":{"default":65},"security":{"default":70,"retrospective":75},"refactor":{"default":65},"bugfix":{"default":60,"prd":65,"retrospective":65}}. This is the load-bearing claim: the diff is comment-only, verified at runtime rather than by reading the diff.' },
  { severity: 'INFO', check: 'FR-3 comment-text coupling', issue: 'Repo-wide grep for the modified comment markers ("BEFORE VALUE FOR ROLLBACK", "VACUOUS") across .js/.ts/.mjs/.cjs/.json outside node_modules found ZERO consumers coupled to config.js comment text. All VACUOUS hits are unrelated files using the word in their own code/comments. No test, scanner, or gate asserts on the exact comment string, so the added comment blocks cannot break a reader.' },
  { severity: 'INFO', check: 'Lint', issue: 'npx eslint on both changed files exits 0 with no output. No new lint errors introduced.' },
];

const metadata = {
  ...(existing.metadata || {}),
  provisional: false,
  finalized_at: new Date().toISOString(),
  metrics: {
    tests_target_file_head: '16/16 pass',
    tests_target_file_baseline_main_against_new_config: '15/15 pass',
    tests_quality_dir: '121/121 pass across 7 files',
    scoring_js_diff_bytes: 0,
    module_diff: 'config.js only, +27 lines / -0 lines (comment-only)',
    exported_values_identical_vs_main: true,
    eslint_exit: 0,
    comment_text_consumers_found: 0,
  },
  findings,
  regression_verdict_basis: 'runtime deep-equality of every config export vs main + main-baseline assertions replayed against the modified module + zero diff in the consumer (scoring.js)',
};

const summary = 'PASS -- zero behavioral regression. The config.js change is comment-only, proven at RUNTIME (not by reading the diff): all 5 exports deep-equal between main and HEAD, SD_TYPE_PASS_THRESHOLDS byte-identical. scoring.js (which defines getPassThreshold at :90) has a 0-byte diff. main\'s 15 pre-existing assertions replayed against the MODIFIED config all pass; HEAD is 16/16; the wider tests/unit/quality/ dir is 121/121. No file in the repo couples to the modified comment text. ESLint exit 0.';

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .update({
    verdict: 'PASS',
    confidence: 96,
    summary,
    justification: 'PASS recorded by REGRESSION for SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B (PLAN_TO_LEAD). ' + summary,
    conditions: [],
    metadata,
    updated_at: new Date().toISOString(),
  })
  .eq('id', ROW_ID)
  .select('id, verdict, confidence, phase, sd_id')
  .maybeSingle();

if (error) throw new Error(`update failed: ${error.message}`);
console.log('FINAL_ROW:', JSON.stringify(data, null, 2));
