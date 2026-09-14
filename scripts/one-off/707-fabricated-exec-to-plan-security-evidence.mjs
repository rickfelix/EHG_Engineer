#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — SECURITY evidence at EXEC-TO-PLAN.
 *
 * An independent EXEC-phase security-agent reviewed the ALREADY-EXECUTED bulk data
 * correction (707 rows) for injection surface, TOCTOU/blast-radius safety, trigger
 * interaction, archive-script guard robustness, and credential hygiene -- verifying the
 * single most important property (zero non-fabricated rows touched) directly against
 * governance_audit_log rather than trusting the script's own printed output.
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
    verdict: 'PASS',
    confidence: 94,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "Independently reviewed the ALREADY-EXECUTED 707-row bulk data correction for security properties, verifying claims against live evidence rather than trusting the script's own output. (1) INJECTION SURFACE: enumerated every external-input read in backfill-707-fabricated-integration.mjs -- exactly one (process.argv.includes('--execute'), coerced to boolean, control-flow only, never reaches a query builder). FABRICATION_PREDICATE_PATH/FABRICATION_MARKER_VALUE/BATCH_SIZE are hardcoded module-level consts; id values reaching .eq('id', id) originate from a prior SELECT, not user input. Zero injection vector. Uses the hardened createSupabaseServiceClient() factory (schema-drift detection + actor-header threading), not raw createClient. (2) TOCTOU/BLAST-RADIUS: the CAS guard (updated_at compare-and-swap) closes the read-to-write race fail-safe (stale CAS -> 0 rows matched, counted as skipped, never an overwrite); the fabrication-predicate re-check IN THE UPDATE'S OWN WHERE CLAUSE is the layer that actually protects genuine content -- it evaluates atomically at write time, closing the gap the CAS alone cannot. Design is correctly non-transactional (707 independent statements) and idempotent by construction. One low-severity latent gap: the CAS is silently skipped when currentRow?.updated_at is falsy (e.g. row deleted between enumeration and write) -- measured 0/707 rows hit this path live, and even if taken the predicate guard alone still bounds the write to genuinely-fabricated rows (no corruption risk, only reduced concurrency protection). (3) updated_by vs enforce_doctrine_of_constraint: read the trigger source directly (v_actor_role := COALESCE(NEW.created_by, NEW.updated_by), aborts only if ='EXEC'). Measured across all 707 rows: created_by IS NULL on 0/707 (COALESCE never fell through to updated_by on any row); pre-write updated_by='EXEC' on 0/707 (no governance marker was erased); created_by unchanged by the write on 707/707. Net effect: 686/707 rows gained attribution where none existed before, 21 pre-existing non-null updated_by values were overwritten but remain fully recoverable from governance_audit_log.old_values. (4) ARCHIVE-SCRIPT GUARD: confirmed the file has ZERO exports (grep for export/module.exports/exports. -> nothing) so no cherry-pick-import bypass exists; confirmed the guard's process.exit(1) fires during module evaluation so even `import()` terminates the process (uncatchable by try/catch); confirmed via ESM-hoisting analysis that only createClient() instantiation (after the guard) is prevented, not the dotenv/supabase-js imports themselves -- neither of which performs a write. Confirmed exactly one file in the repo (`git ls-files`) matches the archived script's path, and the fabrication marker string is written by no other file. (5) LIVE BLAST-RADIUS VERIFICATION (the single most important property, verified against DB-trigger-produced governance_audit_log, not script-authored evidence): 707 audit rows with changed_by=the script name, all product_requirements_v2/UPDATE, 707 distinct record_ids (no double-write), 707/707 pre-write old_values.integration_operationalization.consumers[0].name === 'LEO Protocol Engine' (ZERO non-fabricated rows touched), changed-column signature on a 60-row full-payload sample is exactly {integration_operationalization, updated_at, updated_by} on 60/60 (0 collateral column changes, metadata provably untouched), placeholder written matches buildDefaultIntegrationOperationalization()'s real output exactly, run window 83 seconds with 0 other writers on the table during that window (CAS never exercised in anger -- no race occurred), 0 fabricated rows remain table-wide, blast radius 707/4849 = 14.6% of the table, all confirmed genuinely fabricated. (6) CREDENTIALS: scanned all 8 changed files for JWT/sk-/connection-string/ghp_/AKIA/PEM patterns -- zero hits, all credential access via process.env.*.",
    critical_issues: [],
    warnings: [
      {
        id: 'SEC-1',
        severity: 'LOW',
        issue: 'CAS guard silently degrades (skips the updated_at equality check) when the pre-write read returns a falsy updated_at, including the case where the row was deleted between enumeration and write. Measured 0/707 rows hit this path live; even if taken, the fabrication-predicate re-check alone still bounds the write to genuinely-fabricated rows, so worst case is reduced concurrency protection, not data corruption.',
        evidence: 'Code read at scripts/one-off/backfill-707-fabricated-integration.mjs lines 108-110; live measurement of pre-write updated_at nullability across all 707 rows (0 NULL).',
      },
      {
        id: 'SEC-2',
        severity: 'LOW',
        issue: 'Four ancillary evidence-recording scripts on this branch (707-fabricated-lead-explore-evidence.mjs, 707-fabricated-lead-validation-evidence.mjs, 707-fabricated-precheck-fixes.mjs, correct-scope-707-fabricated-v1.mjs) instantiate createClient() directly rather than via createSupabaseServiceClient(), skipping the schema-drift wrapper and actor-identity header. Not a credential-exposure issue (env-sourced either way); only affects audit attribution consistency on these scripts, both of which are narrowly scoped to .eq(\'sd_key\', SD_KEY) writes against this SD\'s own row.',
        evidence: 'grep for createClient( usage across changed files on this branch.',
      },
      {
        id: 'SEC-3',
        severity: 'INFO',
        issue: "Out of scope for this SD, noted for context only: database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql is staged but not yet applied -- governance_audit_log is not yet append-only enforced. Nothing in the 707-row evidence suggests tampering (contiguous 83-second run window, single-valued pre-write predicate, 707 distinct record_ids matching the enumeration exactly), but this verdict's live-verification evidence rests on that table's current integrity.",
        evidence: 'Migration file inspection; unrelated to this SD\'s scope.',
      },
    ],
    recommendations: [
      'If this backfill pattern is reused as a template, make the CAS unconditional -- treat a missing/null pre-write updated_at as an abort for that row rather than a silent proceed-without-CAS.',
      'Route the four ancillary evidence-recording scripts through createSupabaseServiceClient() for consistent actor attribution (non-blocking, low value given their narrow single-row scope).',
    ],
    detailed_analysis: {
      commands_run: [
        'Read scripts/one-off/backfill-707-fabricated-integration.mjs in full -- enumerated every external-input read, confirmed zero injection vector',
        "Read database/migrations/20251226_law1_fix_actor_role_safe_access.sql -- confirmed enforce_doctrine_of_constraint's exact COALESCE(created_by, updated_by)='EXEC' predicate",
        'Live query: created_by IS NULL count, pre/post-write updated_by=\'EXEC\' count, created_by-changed count across all 707 touched rows -- all 0',
        'Live query: pre-write updated_by histogram across all 707 rows (686 null, 11 database-agent, 8 PRD-REVIEW-RESOLUTION, 1 LEO_AUTOMATION, 1 DATABASE-AGENT)',
        'grep for export/module.exports/exports. in scripts/archive/one-time/backfill-prd-integration.js -- zero hits',
        'git ls-files | grep backfill-prd-integration -- exactly one path',
        'Live query: governance_audit_log rows with changed_by=script name -- 707, all product_requirements_v2/UPDATE, 707 distinct record_ids',
        "Live query: pre-write old_values.integration_operationalization.consumers[0].name across all 707 audit rows -- 100% ='LEO Protocol Engine', 0 exceptions",
        '60-row full-payload sample of governance_audit_log old_values/new_values -- changed-column signature exactly {integration_operationalization, updated_at, updated_by} on 60/60',
        'Live query: run window (min/max changed_at) and concurrent-writer count on product_requirements_v2 during that window -- 83s window, 0 other writers',
        'Live query: remaining fabricated-row count table-wide -- 0',
        'Credential/secret pattern scan across all 8 changed files -- zero hits',
      ],
    },
    metadata: { independent_verification: true, reviewed_shipped_code: true, live_audit_log_verified: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/707-fabricated-exec-to-plan-security-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
