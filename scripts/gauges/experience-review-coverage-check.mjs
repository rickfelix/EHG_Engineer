// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (X3) — executor for the experience-review coverage
// guard. Queries active ventures at stage>=20, cross-references venture_experience_review_runs,
// and evaluates the result against the pure lib/governance/experience-review-coverage-guard.js.
//
// Usage:
//   node scripts/gauges/experience-review-coverage-check.mjs
//
// Exit code: 0 = not alarmed (not_applicable or clear), 1 = alarmed (suitable for a scheduled
// check / CI step).
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { evaluateExperienceReviewCoverage } from '../../lib/governance/experience-review-coverage-guard.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export async function runCheck({ supabase } = {}) {
  const { data: ventures, error: ventureError } = await supabase
    .from('ventures')
    .select('id')
    .eq('status', 'active')
    .gte('current_lifecycle_stage', 20);
  if (ventureError) throw new Error(`experience-review-coverage-check: ventures query failed: ${ventureError.message}`);
  if (!Array.isArray(ventures)) {
    throw new Error('experience-review-coverage-check: ventures query returned a non-array result with no error -- the instrument itself may be broken');
  }

  const qualifyingVentureIds = ventures.map((v) => v.id);

  let coveredVentureIds = [];
  if (qualifyingVentureIds.length > 0) {
    const { data: runs, error: runsError } = await supabase
      .from('venture_experience_review_runs')
      .select('venture_id')
      .in('venture_id', qualifyingVentureIds);
    if (runsError) throw new Error(`experience-review-coverage-check: venture_experience_review_runs query failed: ${runsError.message}`);
    if (!Array.isArray(runs)) {
      throw new Error('experience-review-coverage-check: venture_experience_review_runs query returned a non-array result with no error -- the instrument itself may be broken');
    }
    coveredVentureIds = runs.map((r) => r.venture_id);
  }

  return evaluateExperienceReviewCoverage({ qualifyingVentureIds, coveredVentureIds });
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const result = await runCheck({ supabase });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.alarmed ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
