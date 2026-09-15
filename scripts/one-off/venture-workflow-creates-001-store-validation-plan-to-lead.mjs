#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- VALIDATION evidence at PLAN-TO-LEAD.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 88,
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: 'Independent re-verification of the full deliverable, separate from EXEC\'s own pass. (1) Independently re-ran the full test suite (unset all Supabase/DB env vars, npx vitest run tests/unit/eva/stage-templates/ tests/unit/eva/uat-robustness-gate.test.js -- the whole affected surface, not just the newly-added files): 1040 passed, 0 failed, 5 skipped -- matches EXEC\'s own reported counts. (2) Duplicate/overlap scan: strategic_directives_v2 search for organization-creation/venture-workflow/stage-23/stage-24 scope -- only SD-LEO-INFRA-REMOVE-EVERY-BINDING-001 (a genuinely different concern, confirmed by reading its own title) and this SD\'s own row; no active duplicate. (3) Independently re-read the new organization_qa registry entry and confirmed (via a fresh, separate node invocation of getDimension/STAGE23_*_CATEGORY_IDS.includes) that it appears in none of the 3 registry-derived checklist arrays -- corroborating EXEC\'s own claim that the checklist inclusion is handled via the CAPABILITY_CATEGORIES-style self-contained flag mechanism, not the registry derivation. (4) Independently re-queried chairman_ratifications for id 58f5345f-cab2-4a3c-9314-fbb7118ce43e -- confirmed the row\'s quote_hash (d208738534d913e04a9c3ecbd1acba785b9e25387b1ecfc6c8c47bcd59ec3b61) matches exactly what the registry entry\'s ORGANIZATION_QA_POINTER carries; no drift between the live row and the committed pointer. (5) Confirmed git diff for this SD touches only the 4 files EXEC\'s own summary claims (stage-23-dedicated-venture-uat.js, stage-23-launch-readiness.js, quality-model/registry.js, artifact-types.js) plus test files and evidence scripts -- no unrelated file changed.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No further action required before LEAD-FINAL-APPROVAL. The scoping decision (implement within existing stages) remains well-grounded by the primary-source ratification quote and was already signaled to the coordinator for awareness (7ab3945a, d5412736).',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-run: unset DATABASE_URL SUPABASE_POOLER_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY && npx vitest run tests/unit/eva/stage-templates/ tests/unit/eva/uat-robustness-gate.test.js -- 1040 passed, 0 failed, 5 skipped',
        "Queried strategic_directives_v2 for title/description overlap on this SD's scope -- 1 unrelated result, no duplicate",
        'Independent node invocation re-confirming organization_qa is absent from STAGE23_REQUIRED_CATEGORY_IDS/STAGE23_ADVISORY_CATEGORY_IDS/STAGE23_GROWTH_CATEGORY_IDS',
        'Independent raw SQL re-query of chairman_ratifications for 58f5345f-cab2-4a3c-9314-fbb7118ce43e -- quote_hash matches the committed registry entry exactly',
        "git diff origin/main...HEAD --stat -- confirmed the diff's file list matches EXEC's own claimed scope",
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-store-validation-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
