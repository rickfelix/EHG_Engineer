import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B';

const scope = `IN SCOPE (v2, corrected after LEAD-phase measurement disproved 2 of the SD's 4 original premises against live code/DB):
- FR-1: register the context_usage_log tagging-column migrations (database/migrations/20260829_context_usage_loop_name.sql, 20260831_context_usage_leo_phase_tagging.sql -- both merged 2026-08-31, neither chairman-gated, neither applied to live DB per direct information_schema probe) as 'shipped-but-not-applied' entries in lib/governance/orphan-writers-registry.js's ORPHAN_ENTRIES, mirroring the existing competitive-observed-tag-migration entry shape exactly.
- FR-2: register the operator_cash_burn_monthly manual-revenue provenance migration (database/migrations/20260724190000_add_manual_revenue_provenance_columns.sql -- ALREADY EXISTS, contrary to this SD's original premise of "no migration file exists anywhere, needs net-new authorship"; the file's own header states "STAGED, NOT YET APPROVED FOR APPLY... requires-chairman-apply... a fleet worker must not apply this file directly") as a 'shipped-but-not-applied' entry, chairman-gated like the existing sms-delivery-status-source-strip entry (NOT authored net-new -- LEAD measurement found it already exists).
- FR-3: close out strategic_directives_v2.cancelled_at as VERIFIED-PERMANENT-BY-DESIGN, not an orphan: scripts/cancel-sd.js:296-303 already documents (QF-20260509-CANCEL-SD-COLDROP) that cancelled_at was never a real column, updated_at is the correct, intentional substitute, and there is no migration, staged or otherwise, to apply. No registry entry is added for this specimen -- adding one would misrepresent a correct design as an open defect.
- FR-4: probe-follows-pattern is a DOCUMENTATION acceptance criterion, not new code: cite the existing concrete shape (scripts/solomon-advisory.cjs's captureLedgerRow write-path strip + checkLedgerCaptureHealth independent existence-probe + ledgerCaptureFailures in-memory counter) as the reference pattern in a code comment on the two new registry entries (FR-1/FR-2), so a future strip-fallback specimen has a named, findable precedent rather than needing to be reinvented.
DEFERRED / OUT OF SCOPE (do not build around):
- Applying either migration (context_usage_log or operator_cash_burn_monthly) -- explicitly this SD's own stated boundary ("Out of scope: applying either pending migration") per the completed sibling SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001's own scope, which this SD inherits. The context_usage_log migration is additionally NOT chairman-gated and could in principle be applied by a worker via scripts/apply-migration.js --prod-deploy (git user.email matches the file's @approved-by header) -- LEAD attempted this and the action was refused by this session's own tool-permission classifier; not retried within this pass (an apply action is not one to hammer against a denial for). Left for a differently-permissioned session/operator or an explicit follow-up.
- sms_outbound_obligations.delivery_status_source (item 4, chairman CEREMONY_PENDING) -- already correctly registered in orphan-writers-registry.js (id: sms-delivery-status-source-strip); this SD does not touch it, per its own explicit warning that "the fallback is load-bearing... migration must land BEFORE code touches the fallback."
- Rebuilding the "surface unapplied migrations as one chairman ceremony list" mechanism (item b) -- SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 (completed 2026-08-30) already shipped a CHAIRMAN_APPLY_VERIFICATION gate deriving owned migrations from the PR merged-file-list, distinguishing CEREMONY_PENDING from ordinary NOT_APPLIED (WAIT, not FAIL). This SD's two new registry entries (FR-1/FR-2) are the data that gate consumes going forward -- not a reason to re-author the gate itself. INCIDENTAL FINDING, not fixed here: SD-LEO-INFRA-LEO-PHASE-TAGGED-001 completed today (LEAD-FINAL-APPROVAL) despite shipping an unapplied database/migrations/ file, which this gate should have caught as WAIT -- worth a follow-up check on whether CHAIRMAN_APPLY_VERIFICATION actually fired on that handoff. Routed via /signal, not investigated further here.`;

const key_changes = [
  { change: 'Add context_usage_log tagging-column migrations as shipped-but-not-applied entries in lib/governance/orphan-writers-registry.js', impact: 'Both migrations become visible to the existing orphan-writers-count.mjs triage pass and the CHAIRMAN_APPLY_VERIFICATION gate, closing the LEAD-measured gap without any code change to the migrations or the reader.' },
  { change: 'Add the operator_cash_burn_monthly manual-revenue migration as a shipped-but-not-applied (chairman-gated) entry, correcting the SD premise that no migration existed', impact: 'Prevents a redundant net-new migration authorship that would have conflicted with the already-staged, chairman-gated file.' },
  { change: 'Document (not code) the probe-follows-pattern precedent inline on both new entries', impact: 'Establishes a findable reference for future strip-fallback specimens.' }
];

const success_criteria = [
  { criterion: 'Both new registry entries validate structurally (validateOrphanEntry) and are consumed by the existing orphan-writers-count.mjs reader', measure: 'Running scripts/orphan-writers-count.mjs after the change includes both new specimens in its live count, with no validation errors.' },
  { criterion: 'No code change is made to operator_cash_burn_monthly-related files (since a migration already exists and is chairman-gated)', measure: 'git diff shows only lib/governance/orphan-writers-registry.js and this SD one-off/evidence scripts touched -- no changes under lib/operator/, scripts/operator/, or database/migrations/.' },
  { criterion: 'cancelled_at is explicitly documented as closed-not-orphaned, not silently dropped', measure: 'The SD scope/metadata records the verification and the reason no registry entry was added.' }
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run node scripts/orphan-writers-count.mjs after the registry change.', expected_outcome: 'The output includes the two new shipped-but-not-applied specimens (context_usage_log tagging columns, operator_cash_burn_monthly manual-revenue columns) without errors.' },
  { step_number: 2, instruction: 'Run the existing orphan-writers-registry unit test suite.', expected_outcome: 'All existing tests still pass; any new/extended test for the two new entries also passes.' }
];

async function main() {
  const { data: existing } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = {
    ...(existing?.metadata || {}),
    lead_rescope_v2: 'LEAD-phase direct measurement (live pooler probe + file grep) disproved 2 of the SD\'s 4 original premises: (1) context_usage_log migrations exist and are NOT chairman-gated (apply attempt refused by this session\'s own tool-permission classifier, not a chairman gate) -- registered as shipped-but-not-applied rather than applied; (2) operator_cash_burn_monthly manual-revenue migration ALREADY EXISTS (database/migrations/20260724190000_add_manual_revenue_provenance_columns.sql) and is explicitly chairman-gated ("a fleet worker must not apply this file directly") -- the SD\'s "needs net-new authorship" premise was false. Rescoped to registry-entry-only work (lib/governance/orphan-writers-registry.js) plus verified-permanent closure of cancelled_at; sms_outbound_obligations (item 4) already correctly registered, untouched.',
  };
  const { error } = await supabase.from('strategic_directives_v2')
    .update({ scope, key_changes, success_criteria, smoke_test_steps, metadata, scope_reduction_percentage: 70 })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK rescoped', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
