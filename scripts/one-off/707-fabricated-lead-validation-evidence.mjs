#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — VALIDATION evidence at LEAD phase.
 *
 * An independent validation-agent re-verified the Explore agent's critical finding (the
 * mergeJsonbColumn mechanism claim was wrong) from first principles -- confirming it from
 * schema, code, and two additional reasons Explore did not surface (merge-not-replace
 * semantics; no CAS/guard capability) -- and assessed whether extending the shared allowlist
 * infra vs. a bespoke direct-UPDATE script is the better design call for PLAN. Also confirmed
 * mergeJsonbColumn is not a bypassed safety gate (audit logging happens at the DB-trigger
 * level regardless of write seam; RLS is not a factor for either seam).
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
    confidence: 91,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently re-derived the mechanism question from schema, code, and live queries -- not trusted from the Explore agent's report. CONFIRMED integration_operationalization and metadata are two separate top-level jsonb columns (information_schema.columns), and CONFIRMED lib/coordinator/safe-metadata-merge.mjs's JSONB_MERGE_ALLOWLIST jsonbColumn is a deep-frozen scalar string compared with strict !==, so it cannot even be widened at runtime. Found TWO ADDITIONAL reasons mergeJsonbColumn is the wrong tool beyond the allowlist block: (1) it emits a `||` MERGE, not a REPLACE -- would only happen to work here by accident of all 707 rows sharing the canonical 5-key keyset, not by construction; (2) its WHERE clause is keyColumn-only, with no CAS/extra-guard capability, and this SD's entire concurrency-safety story rests on an updated_at CAS guard. RECOMMENDATION: do NOT extend the allowlist -- doing so requires FOUR separate primitive changes (scalar->array, add extraGuardColumns, add a guard mechanism that doesn't exist yet, add a replace-vs-merge mode) driven by a single one-off, and mergeJsonbColumn has ZERO production callers today against product_requirements_v2 (proven only against a fake pg client per the sibling SD's own TESTING evidence). The genuinely reusable asset already exists: scripts/one-off/backfill-integration-operationalization-v2.mjs solves the identical shape. VERIFIED mergeJsonbColumn is not a bypassed safety gate: audit logging happens at the DB-trigger level (governance_audit_trigger, AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW, writes row_to_json(OLD)/row_to_json(NEW) to governance_audit_log) regardless of write seam -- a bespoke script inherits full audit/rollback capability for free. RLS is not a differentiator either: mergeJsonbColumn connects as table-owner postgres (bypasses RLS by ownership), the sibling script connects via service_role which has a permissive ALL policy -- neither seam is RLS-gated relative to the other. Ran the sibling suite live: tests/unit/gates/integration-section-parity.test.js + both jsonb-merge suites -> 73/73 passed.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'MEDIUM',
        issue: 'The 707 fabricated rows contain 15 DISTINCT full jsonb values (not 1) sharing the same 5-key keyset -- any verification or idempotency logic PLAN designs must key on the consumers[0].name predicate, never assume/assert a single expected old blob.',
        evidence: 'Distinct-value census over the 707-row set matching the fabrication predicate.',
      },
      {
        id: 'VAL-2',
        severity: 'LOW',
        issue: "trg_validate_integration_section_keys (BEFORE INSERT/UPDATE OF integration_operationalization) hard-rejects any key outside the canonical 5 -- buildDefaultIntegrationOperationalization()'s output is compliant, but this means NO provenance marker can be embedded inside this column; a provenance stamp must go into metadata instead (the sibling script's existing pattern).",
        evidence: 'Trigger definition read directly; buildDefaultIntegrationOperationalization() output keyset compared against the trigger\'s allowed-key list.',
      },
      {
        id: 'VAL-3',
        severity: 'LOW',
        issue: "enforce_doctrine_of_constraint (BEFORE INSERT/UPDATE, SECURITY DEFINER) hard-aborts with P0001 if COALESCE(created_by, updated_by) = 'EXEC'. Measured 0/707 would trip this now, but it is a live predicate PLAN/EXEC must treat as a standing constraint, never set updated_by='EXEC'.",
        evidence: 'Trigger definition read directly; live predicate measured against the 707-row set (0 matches).',
      },
      {
        id: 'VAL-4',
        severity: 'LOW',
        issue: "The seam choice matters beyond style: if EXEC chooses a raw-pg seam instead of supabase-js, updated_at is a naive (no-timezone) timestamp column and the node pg driver shifts naive timestamps by machine offset, which would silently break the updated_at CAS guard (every UPDATE would match 0 rows). Recommend staying on the supabase-js seam, verified to round-trip the CAS correctly (positive control matched true, negative control matched false).",
        evidence: 'information_schema column type for updated_at; live supabase-js CAS round-trip test (read-only, no writes).',
      },
    ],
    recommendations: [
      'Do NOT extend JSONB_MERGE_ALLOWLIST/mergeJsonbColumn for this SD -- model the write path on scripts/one-off/backfill-integration-operationalization-v2.mjs instead; reserve mergeJsonbColumn(jsonbColumn:\'metadata\') only for an optional provenance stamp.',
      "Set updated_by (unlike the sibling script, which left it null and got changed_by='SYSTEM' in the audit trail) to the SD/script identity for audit attribution -- cheap, genuine improvement over the precedent.",
      'The updated_at CAS alone is a complete concurrency guard (update_prd_timestamp touches it on every write) -- a write-time re-check of the fabrication predicate is defensible belt-and-braces but not strictly required.',
    ],
    detailed_analysis: {
      commands_run: [
        'information_schema.columns query on product_requirements_v2 -- confirmed integration_operationalization (jsonb, default null) and metadata (jsonb, default {}) are two separate top-level columns',
        'Read lib/coordinator/safe-metadata-merge.mjs in full -- confirmed assertAllowedTarget uses strict !== against a deep-frozen scalar jsonbColumn, confirmed the || merge (not replace) emission, confirmed extraGuardColumns is only consumed by removeJsonbColumnKey and is an empty frozen array for product_requirements_v2',
        'Read scripts/one-off/backfill-integration-operationalization-v2.mjs in full -- confirmed it already solves the identical shape via direct guarded UPDATE with a CAS guard',
        'npx vitest run tests/unit/gates/integration-section-parity.test.js tests/unit/coordinator/*jsonb-merge*.test.js -> 73/73 passed, 3 files, 0 failures',
        'Read governance_audit_trigger definition -- confirmed AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW, row_to_json(OLD)/row_to_json(NEW), independent of write seam',
        'Checked pg_roles for postgres (table owner, rolbypassrls=true) and the service_role RLS policy on product_requirements_v2 -- confirmed neither write seam is RLS-gated relative to the other',
        'Distinct-value census over the 707 fabrication-matching rows -- confirmed 15 distinct full jsonb values, all sharing the canonical 5-key keyset',
        'Read trg_validate_integration_section_keys and enforce_doctrine_of_constraint trigger definitions -- confirmed both are live, non-bypassable constraints compatible with the corrected approach',
        'information_schema column type check on updated_at (timestamp without time zone) + live supabase-js CAS positive/negative control round-trip (read-only)',
      ],
    },
    metadata: { independent_verification: true, scope_correction_applied: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/707-fabricated-lead-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
