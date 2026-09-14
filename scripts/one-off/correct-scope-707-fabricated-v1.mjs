#!/usr/bin/env node
/**
 * LEAD-phase correction for SD-LEO-FIX-REPLACE-707-FABRICATED-001's description/scope.
 *
 * Independent Explore + VALIDATION sub-agents (LEAD phase) both confirmed the defect premise
 * (707 fabricated rows, real pagination-bug root cause, gate-parity-safe placeholder) but
 * REFUTED the SD's stated implementation mechanism: `integration_operationalization` is its
 * own top-level jsonb column on product_requirements_v2, NOT nested inside `metadata`. The
 * existing lib/coordinator/safe-metadata-merge.mjs `mergeJsonbColumn`/`JSONB_MERGE_ALLOWLIST`
 * infra (built under SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001) hardcodes jsonbColumn:'metadata'
 * for this table and cannot target a second column without a primitive redesign -- and even if
 * it could, it performs a `||` MERGE, not a REPLACE, and has no CAS/extra-guard capability. The
 * correct approach (confirmed sound, CONDITIONAL_PASS both agents) is a direct guarded UPDATE
 * modeled on the precedented sibling script scripts/one-off/backfill-integration-operationalization-v2.mjs
 * (same table, same column, same buildDefaultIntegrationOperationalization() placeholder,
 * keyset pagination, updated_at CAS guard -- which VALIDATION confirmed alone subsumes the
 * write-time fabrication re-check). mergeJsonbColumn(jsonbColumn:'metadata') is reserved only
 * for an optional provenance-stamp write into metadata, which the sibling script already does.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-REPLACE-707-FABRICATED-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('description, scope')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const addendum = `

## LEAD-Phase Correction (mechanism)

Independent Explore + VALIDATION sub-agent review (2026-09-14) confirmed the defect premise (707 fabricated rows via the exact \`integration_operationalization->consumers->0->>name = 'LEO Protocol Engine'\` predicate; the archived script's offset-pagination-over-a-shrinking-predicate bug; gate-verdict parity of the null-per-key placeholder, already proven by the existing \`tests/unit/gates/integration-section-parity.test.js\` suite) but **refuted the stated write mechanism**: \`integration_operationalization\` is its own top-level jsonb column on \`product_requirements_v2\`, separate from \`metadata\`. \`lib/coordinator/safe-metadata-merge.mjs\`'s \`mergeJsonbColumn\`/\`JSONB_MERGE_ALLOWLIST\` (built under SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001) hardcodes \`jsonbColumn:'metadata'\` for this table's allowlist entry and cannot target a second column without a primitive redesign (jsonbColumn scalar->array, new extra-guard mechanism, new replace-vs-merge mode) -- and even set aside the allowlist, it performs a \`||\` MERGE not a REPLACE, and has no CAS/extra-guard capability, so it is the wrong tool even if the allowlist were widened.

**Corrected mechanism**: a direct guarded UPDATE (supabase-js seam, not raw pg -- \`updated_at\` is a naive timestamp column and the node pg driver shifts naive timestamps by machine offset, breaking a CAS comparison), modeled on the precedented sibling script \`scripts/one-off/backfill-integration-operationalization-v2.mjs\` (same table, same column, same \`buildDefaultIntegrationOperationalization()\` placeholder builder). Per-row guard: \`id = $1 AND integration_operationalization->consumers->0->>name = 'LEO Protocol Engine' AND updated_at = $2\` (the \`updated_at\` CAS alone is a complete concurrency guard, per VALIDATION's analysis -- \`update_prd_timestamp\` touches it on every write, so an unchanged value proves the row has not changed since it was read and verified fabricated). Keyset pagination over \`id\` (not offset, to avoid repeating the archived script's exact defect class), batch size ~100-500. \`mergeJsonbColumn(jsonbColumn:'metadata')\` is reserved only for an optional provenance-stamp write into \`metadata\` (the sibling script already does this).

**Conditions surfaced by VALIDATION, binding on PLAN/EXEC**:
1. \`trg_validate_integration_section_keys\` (DB trigger) hard-rejects any key outside the canonical 5 -- \`buildDefaultIntegrationOperationalization()\`'s output is compliant; no provenance marker can live inside this column (must go in \`metadata\`).
2. The 707 rows contain 15 distinct fabricated jsonb variants (not 1) sharing the same 5-key keyset -- verification/idempotency logic must key on the \`consumers[0].name\` predicate, never an expected old blob.
3. \`enforce_doctrine_of_constraint\` (DB trigger) hard-aborts if \`COALESCE(created_by, updated_by) = 'EXEC'\` -- measured 0/707 would trip this now, but treat as a live pre-flight assertion; never set \`updated_by='EXEC'\`.
4. Set \`updated_by\` (unlike the sibling script, which left it null and got \`changed_by='SYSTEM'\` in the audit trail) to the SD/script identity for audit attribution -- a genuine improvement over the precedent.
5. Audit is automatic and free at the DB-trigger level (\`governance_audit_trigger\`, fires regardless of write seam) -- full before/after rollback capability without any bespoke logging.

This correction is documentation-only (no code written yet, still LEAD phase). Full evidence in \`sub_agent_execution_results\` for this SD, phase LEAD.`;

const newDescription = sd.description + addendum;

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ description: newDescription })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('LEAD-phase mechanism correction applied:', JSON.stringify(data, null, 2));
