#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — Explore evidence at LEAD phase.
 *
 * An Explore sub-agent independently verified the SD's defect premise against live DB state
 * and the actual code (not the SD's own text): live count of fabricated rows, the archived
 * script's real root cause, gate-parity safety of the proposed placeholder, and the exact
 * schema shape of the target column -- finding one material correction (the mergeJsonbColumn
 * mechanism claim was wrong; see the LEAD-phase description addendum applied via
 * scripts/one-off/correct-scope-707-fabricated-v1.mjs before this evidence record).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-REPLACE-707-FABRICATED-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Verified the defect premise directly against live DB state and code, not the SD's own text. (1) Live count of rows matching integration_operationalization->consumers->0->>name='LEO Protocol Engine' is exactly 707; sampled rows show genuine fabricated boilerplate matching generateIntegrationContent() in the archived script byte-for-byte. Total PRDs 4848, live NULL count now only 2. (2) Confirmed the archived script's offset-pagination bug is real: it re-queries a shrinking NULL predicate at a fixed offset per batch, silently skipping roughly half the remaining rows per pass. (3) Confirmed buildDefaultIntegrationOperationalization() (scripts/prd/prd-creator.js:608) produces null-per-key output that scores gate-identical to NULL on every sd_type, via the EXISTING passing suite tests/unit/gates/integration-section-parity.test.js from the sibling SD -- no re-derivation needed. (4) CRITICAL FINDING: integration_operationalization is confirmed via information_schema.columns to be its OWN top-level jsonb column on product_requirements_v2, separate from metadata -- the SD's original claim that the existing mergeJsonbColumn/JSONB_MERGE_ALLOWLIST infra (jsonbColumn:'metadata' hardcoded) could write this column is WRONG; it would throw immediately. The precedented sibling script scripts/one-off/backfill-integration-operationalization-v2.mjs already solves this identical shape via a direct guarded UPDATE and should be the implementation model instead. (5) id (varchar, PK, no duplicates) is a safe update key. (6) No RLS/trigger blockers found for a bulk 707-row write; BATCH_SIZE=500 keyset pagination is precedented elsewhere in-repo. (7) Confirmed prior evidence rows (VALIDATION 53910d3f, TESTING a0b168bb from SD-LEARN-FIX-ADDRESS-PAT-LES-012) exist and explicitly flag these 707 fabricated rows as a distinct, deliberately-deferred follow-up -- this SD is the anticipated legitimate continuation, not redundant work.",
    critical_issues: [
      {
        id: 'EXP-1',
        severity: 'HIGH',
        issue: "SD's stated write mechanism (mergeJsonbColumn against product_requirements_v2) is factually incorrect -- integration_operationalization is a separate top-level jsonb column from metadata, and the allowlist entry hardcodes jsonbColumn:'metadata'. Calling mergeJsonbColumn with jsonbColumn:'integration_operationalization' throws immediately (assertAllowedTarget strict !== check).",
        resolution: "Corrected in SD description via scripts/one-off/correct-scope-707-fabricated-v1.mjs (LEAD-phase correction addendum) before this evidence record -- CONDITIONAL_PASS's condition is resolved. Corrected mechanism: direct guarded UPDATE modeled on backfill-integration-operationalization-v2.mjs.",
      },
    ],
    warnings: [
      {
        id: 'EXP-2',
        severity: 'LOW',
        issue: 'The archived script\'s own 2026-02-15 commit message claims "706 PRDs" backfilled vs. 707 live today -- harmless 1-row drift, but reinforces that PLAN/EXEC must identify target rows via a LIVE predicate query at execution time, never a hardcoded count.',
        evidence: 'git log message on the archived backfill script vs. live count query.',
      },
    ],
    recommendations: [
      'PLAN should design the write path as a direct guarded UPDATE (supabase-js seam) modeled on scripts/one-off/backfill-integration-operationalization-v2.mjs, not mergeJsonbColumn.',
      'Identify target rows via the live predicate at execution time, not a fixed 707 count.',
      'Use keyset (not offset) pagination to avoid repeating the archived script\'s exact defect class.',
    ],
    detailed_analysis: {
      commands_run: [
        "SELECT count(*) FROM product_requirements_v2 WHERE integration_operationalization->'consumers'->0->>'name' = 'LEO Protocol Engine' -> 707",
        'Sampled PRD-SD-ARCH-EHG-007-1, PRD-SD-VISION-V2-002 -- confirmed fabricated boilerplate content matching generateIntegrationContent()',
        'Read scripts/archive/one-time/backfill-prd-integration.js in full -- confirmed offset-pagination-over-shrinking-predicate bug',
        'Read scripts/prd/prd-creator.js:608 buildDefaultIntegrationOperationalization() -- confirmed REQUIRED_SUBSECTIONS shared import with the gate module',
        'npx vitest run tests/unit/gates/integration-section-parity.test.js -- existing passing suite, no re-derivation needed',
        'information_schema.columns query on product_requirements_v2 -- confirmed integration_operationalization and metadata are two separate top-level jsonb columns',
        'Read lib/coordinator/safe-metadata-merge.mjs -- confirmed JSONB_MERGE_ALLOWLIST jsonbColumn is a scalar string, strict !== check, throws for a second column',
        'Read scripts/one-off/backfill-integration-operationalization-v2.mjs -- confirmed it already solves this identical shape via direct guarded UPDATE',
        'Duplicate-id check on product_requirements_v2.id -- zero duplicates',
        'Queried sub_agent_execution_results for SD-LEARN-FIX-ADDRESS-PAT-LES-012 -- confirmed VALIDATION 53910d3f and TESTING a0b168bb exist and flag the 707 rows as deliberately deferred follow-up work',
      ],
    },
    metadata: { independent_verification: true, scope_correction_applied: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/707-fabricated-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('STORED:', 'EXPLORE', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
