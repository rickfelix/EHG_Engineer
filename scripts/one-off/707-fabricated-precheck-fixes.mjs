#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — LEAD-TO-PLAN precheck remediation.
 *
 * Fixes two gate failures surfaced by `handoff.js precheck LEAD-TO-PLAN`:
 * 1. GATE_PLACEHOLDER_CONTENT_DETECTION: success_criteria was 100% leo-create-sd template
 *    text. Replaced with SD-specific, operator-verifiable exit conditions.
 * 2. GATE_MECHANISM_CLAIM_VERIFIER: the spine names files+functions within 200 chars of each
 *    other with no named verifier. Added metadata.mechanism_verifications citing the exact
 *    file:line locations independently confirmed by the Explore + VALIDATION LEAD-phase
 *    sub-agents (sub_agent_execution_results rows c04bec4e / 425e034f).
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
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const successCriteria = [
  {
    criterion: 'Zero rows remain matching the fabrication predicate',
    measure: "SELECT count(*) FROM product_requirements_v2 WHERE integration_operationalization->'consumers'->0->>'name' = 'LEO Protocol Engine' returns 0 (started at 707, verified live 2026-09-14).",
  },
  {
    criterion: 'Every corrected row carries the honest null-per-key placeholder shape',
    measure: 'For each of the 707 corrected rows, integration_operationalization has exactly the 5 canonical keys (consumers, dependencies, data_contracts, runtime_config, observability_rollout) each set to null, matching buildDefaultIntegrationOperationalization() (scripts/prd/prd-creator.js:608) byte-for-byte.',
  },
  {
    criterion: 'GATE_INTEGRATION_SECTION_VALIDATION verdict is unchanged (still scores as incomplete) on every corrected row',
    measure: 'tests/unit/gates/integration-section-parity.test.js continues to pass (73/73 baseline) after the fix, proving null-per-key scores byte-identical to NULL across every sd_type -- corrected rows do not newly/falsely pass the gate.',
  },
  {
    criterion: 'Every write is attributable and auditable',
    measure: "governance_audit_log contains exactly 707 new rows for product_requirements_v2 UPDATEs with changed_by set to the script/SD identity (not 'SYSTEM'), each carrying old_values/new_values sufficient to prove the corrected value replaced fabricated content.",
  },
];

const mechanismVerifications = [
  {
    verified_by: 'Explore sub-agent (LEAD phase)',
    verified_at: 'scripts/archive/one-time/backfill-prd-integration.js:138-204',
    claim: 'Offset-pagination-over-a-shrinking-NULL-predicate bug caused the archived backfill to silently skip rows',
  },
  {
    verified_by: 'Explore sub-agent (LEAD phase)',
    verified_at: 'scripts/prd/prd-creator.js:608',
    claim: 'buildDefaultIntegrationOperationalization() produces the null-per-key placeholder shape used as the replacement content',
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'lib/coordinator/safe-metadata-merge.mjs:68',
    claim: "JSONB_MERGE_ALLOWLIST's product_requirements_v2 entry hardcodes jsonbColumn:'metadata' (deep-frozen scalar, strict !== check) -- cannot target the separate integration_operationalization column; mergeJsonbColumn is therefore NOT the write mechanism for this SD (corrected from the original SD text)",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'scripts/one-off/backfill-integration-operationalization-v2.mjs:109-142',
    claim: 'writeBackfillRow() demonstrates the precedented direct-guarded-UPDATE pattern (updated_at CAS guard) this SD models its write mechanism on',
  },
];

const newMetadata = {
  ...sd.metadata,
  mechanism_verifications: mechanismVerifications,
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ success_criteria: successCriteria, metadata: newMetadata })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('Precheck remediation applied:', JSON.stringify(data, null, 2));
