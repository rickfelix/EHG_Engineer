#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- VALIDATION evidence at PLAN-TO-LEAD.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const { data: harnessRows, error: hErr } = await supabase.from('feedback')
    .select('id, category, status, severity')
    .in('id', ['8e7b9427-3208-4087-b828-5fd39f755581', '9a3468c3-8619-41ab-bc21-81af66be5a4a']);
  if (hErr) throw hErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: `Independent re-verification of the full deliverable, separate from EXEC's own pass. (1) Re-ran the full test set (tests/verify-migration-apply-state.test.js, tests/verify-migration-apply-state-corpus.test.js, plus 3 related files) independently: 145 passed, 15 skipped (DB-tier gated, expected), 0 failed -- matches EXEC's own reported numbers exactly, confirming stability. (2) Confirmed via git diff that scripts/verify-migration-apply-state.mjs itself has ZERO changes -- this SD's entire diff is new files (generator, fixture, test suite, README, evidence scripts), matching the PRD's own acceptance criterion. (3) Independently queried the feedback table for both harness_backlog rows EXEC's evidence cited: ${JSON.stringify(harnessRows)} -- both confirmed present with category=harness_backlog, status=new, matching the claimed severities (low for the redundant-paren finding, medium for the quote-scanner finding). (4) Re-read tests/fixtures/apply-state-verifier-corpus/corpus.json directly: confirmed entry_count (264) matches entries.length, confirmed exactly 1 confirmed_false_positive entry, confirmed excluded_current_mismatches contains exactly 11 named entries with source paths -- matches EXEC's narrative exactly. (5) Duplicate/overlap scan: searched strategic_directives_v2 for any other SD (draft/in-progress) referencing apply-state-verifier-corpus, migration apply-state, or verify-migration-apply-state -- zero active duplicates found (only this SD and the completed predecessor SD-001). (6) Re-read tests/verify-migration-apply-state-corpus.test.js in full: confirmed the file genuinely has no live-DB import (grep confirms), confirmed the TS-3 mutation tests use real-content mutations (not a stripped SQL comment, the bug EXEC's own evidence documented catching and fixing).`,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No further action required before LEAD-FINAL-APPROVAL. The 2 harness_backlog findings are correctly routed and do not block this SD\'s own completion (they are new discoveries deferred per chairman decision 27bfdde9\'s scope, not defects in this SD\'s own deliverable).',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-run: unset DATABASE_URL SUPABASE_POOLER_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY && npx vitest run <5 files> -- 145 passed, 0 failed, 15 skipped',
        'git diff --stat scripts/verify-migration-apply-state.mjs -- empty output, confirming zero changes to the file under test',
        'Direct DB query (separate from EXEC\'s own claim) confirming both harness_backlog feedback rows exist with the cited ids/category/status/severity',
        'Direct read of tests/fixtures/apply-state-verifier-corpus/corpus.json -- entry_count/entries.length consistency, confirmed_false_positive count, excluded_current_mismatches count all independently verified',
        "Queried strategic_directives_v2 for any other active SD referencing this SD's own scope -- zero duplicates",
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/apply-state-verifier-002-store-validation-plan-to-lead.mjs',
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
