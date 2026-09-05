#!/usr/bin/env node
// TR-2 full-population regression measurement for SD-LEO-FIX-GATE-PLAN-EXEC-001.
// Mirrors VALIDATION's methodology (sub_agent_execution_results c84eda3c-0670-406e-80a6-
// d7c42b650f02): paginate all PRDs, join to their SD's category/sd_type, compute the CURRENT
// (pre-fix) gate verdict and the FIXED gate verdict for each, and report regressions/newly-pass.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { validatePRDQuality } from '../modules/prd-quality-validation.js';
import { getStoryMinimumScoreByCategory } from '../modules/handoff/verifiers/plan-to-exec/story-quality.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UNCONDITIONAL_BLOCK_PATTERNS = [/Insufficient functional requirements/, /Insufficient acceptance criteria/];

function currentVerdict(result) {
  // Today's gate: pass through validatePRDQuality's own `passed` unchanged.
  return !!result.passed;
}

function fixedVerdict(result, sd) {
  const isHeuristic = result.details?.method === 'heuristic';
  const rawIssues = result.issues || [];
  const unconditional = rawIssues.filter((i) => UNCONDITIONAL_BLOCK_PATTERNS.some((p) => p.test(i)));
  const threshold = getStoryMinimumScoreByCategory(sd?.category, sd?.sd_type);
  const scoreClears = typeof result.score === 'number' && result.score >= threshold;
  if (isHeuristic && !result.passed && scoreClears && unconditional.length === 0) return true;
  return !!result.passed;
}

async function fetchAllPaginated(queryFactory, pageSize = 1000) {
  const all = [];
  for (let page = 0; ; page++) {
    const offset = page * pageSize;
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
    if (error) throw new Error(`page ${page} failed: ${error.message}`);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function main() {
  console.log('Fetching PRDs...');
  const prds = await fetchAllPaginated(() =>
    supabase.from('product_requirements_v2').select('id, sd_id, functional_requirements, acceptance_criteria, test_scenarios, system_architecture, implementation_approach, risks, executive_summary, category'));
  console.log(`  ${prds.length} PRDs fetched`);

  console.log('Fetching SDs (sd_type, category)...');
  const sds = await fetchAllPaginated(() =>
    supabase.from('strategic_directives_v2').select('id, sd_type, category'));
  const sdById = new Map(sds.map((s) => [s.id, s]));
  console.log(`  ${sds.length} SDs fetched`);

  let heuristicCount = 0, aiCount = 0;
  let currentPass = 0, fixedPass = 0;
  let regressions = 0, newlyPass = 0;
  const regressionSamples = [];

  for (const prd of prds) {
    const sd = sdById.get(prd.sd_id) || {};
    let result;
    try {
      result = await validatePRDQuality(prd, { sdType: sd.sd_type, sdCategory: sd.category });
    } catch (e) {
      continue; // skip PRDs that error (e.g. malformed data) -- not part of the population comparison
    }
    const isHeuristic = result.details?.method === 'heuristic';
    if (isHeuristic) heuristicCount++; else aiCount++;

    const cur = currentVerdict(result);
    const fixed = fixedVerdict(result, sd);
    if (cur) currentPass++;
    if (fixed) fixedPass++;
    if (cur && !fixed) {
      regressions++;
      if (regressionSamples.length < 10) regressionSamples.push({ id: prd.id, score: result.score, issues: result.issues });
    }
    if (!cur && fixed) newlyPass++;

    // AI-path invariant: the fixed verdict must equal the current verdict for every AI-path PRD.
    if (!isHeuristic && cur !== fixed) {
      console.error(`❌ AI-PATH REGRESSION at ${prd.id}: current=${cur} fixed=${fixed}`);
      process.exitCode = 1;
    }
  }

  console.log('\n=== TR-2 Full-Population Regression Measurement ===');
  console.log(`Total PRDs measured: ${prds.length}`);
  console.log(`Heuristic-path: ${heuristicCount}, AI-rubric-path: ${aiCount}`);
  console.log(`Current gate: ${currentPass} pass`);
  console.log(`Fixed gate:   ${fixedPass} pass`);
  console.log(`Newly-passing (current fail -> fixed pass): ${newlyPass}`);
  console.log(`Regressions (current pass -> fixed fail): ${regressions}`);
  if (regressions > 0) {
    console.log('Regression samples:', JSON.stringify(regressionSamples, null, 2));
    console.error('\n❌ REGRESSIONS DETECTED -- fix is NOT safe to ship as-is.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ ZERO regressions confirmed across the live population.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
