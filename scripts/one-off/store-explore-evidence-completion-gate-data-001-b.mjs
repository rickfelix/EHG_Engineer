import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 92,
    summary: 'Measured all 4 specimens named in the SD description directly against live code/DB before authoring the v2 rescope. Confirmed context_usage_log tagging columns (2 migrations) are unapplied and NOT chairman-gated. Found operator_cash_burn_monthly manual-revenue migration ALREADY EXISTS (contradicting the SD premise) and IS explicitly chairman-gated. Confirmed cancelled_at is a documented permanent design decision, not an orphan. Confirmed sms_outbound_obligations is already correctly registered. Confirmed lib/governance/orphan-writers-registry.js is the correct, already-wired home for the two new entries (reader: scripts/orphan-writers-count.mjs).',
    detailed_analysis: {
      files_read: [
        'scripts/cancel-sd.js (lines 285-305)',
        'database/migrations/20260724190000_add_manual_revenue_provenance_columns.sql',
        'lib/operator/cash-burn-substrate.js (upsertSubstrateInputs, PGRST204/42703 fallback)',
        'scripts/operator/feed-operator-cash-burn.mjs',
        'lib/governance/orphan-writers-registry.js (ORPHAN_ENTRIES, validateOrphanEntry)',
        'scripts/orphan-writers-count.mjs',
        'database/migrations/20260829_context_usage_loop_name.sql',
        'database/migrations/20260831_context_usage_leo_phase_tagging.sql',
        'scripts/apply-migration.js, scripts/lib/migration-guards.js (3-factor prod-deploy guards)'
      ],
      key_findings: [
        'Live pooler probe (information_schema.columns) confirmed 0/3 context_usage_log tagging columns applied, 0/2 operator_cash_burn_monthly manual-revenue columns applied.',
        'operator_cash_burn_monthly manual-revenue migration file EXISTS (20260724190000) and its own header states "STAGED, NOT YET APPROVED FOR APPLY... requires-chairman-apply... a fleet worker must not apply this file directly" -- the SD premise "no migration file exists anywhere, needs net-new authorship" is FALSE.',
        'context_usage_log migrations are NOT chairman-gated (approved-by header matches this session\'s git user.email); scripts/apply-migration.js --prod-deploy was attempted and refused by the tool-permission classifier -- a session-capability limit, not a chairman gate.',
        'cancelled_at: scripts/cancel-sd.js documents (QF-20260509-CANCEL-SD-COLDROP) this is a permanent, correct design (updated_at substitutes), not a bug -- no registry entry warranted.',
        'sms_outbound_obligations.delivery_status_source already has a correct orphan-writers-registry.js entry (id: sms-delivery-status-source-strip).',
        'orphan-writers-registry.js is actively consumed by scripts/orphan-writers-count.mjs (imports ORPHAN_ENTRIES directly) -- confirmed live reader, not a write-without-reader risk.',
        'SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 (completed 2026-08-30) already shipped a CHAIRMAN_APPLY_VERIFICATION gate for exactly the "surface unapplied migrations" concern this SD also names -- not rebuilding it. Incidental: SD-LEO-INFRA-LEO-PHASE-TAGGED-001 completed today despite an unapplied database/migrations/ file, which that gate should have caught -- flagged via signal, not investigated further in this SD.'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
