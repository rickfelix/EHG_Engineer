// QF-20260705-181: PROD_ERROR_SWEEP_LOOP_ENABLE was never flipped after
// SD-LEO-INFRA-PROD-ERROR-SWEEP-LOOP-001 + -WIRE-001 shipped. The WIRE completion flag
// (2026-06-21) explicitly recorded ACTIVATION as an operator/chairman decision, not
// code-decidable ("Cannot be set from code") -- so this QF does NOT flip the flag. Instead
// it records the durable, queryable disposition the QF's own text asks for ("record an
// explicit deferred-with-trigger disposition") in leo_feature_flags, which had no
// PROD_ERROR row at all until now.
//
// Idempotent: upserts on flag_key so re-running never duplicates the row.
export const FLAG_KEY = 'PROD_ERROR_SWEEP_LOOP_ENABLE';

export const DISPOSITION_ROW = {
  flag_key: FLAG_KEY,
  display_name: 'Production-error sweep loop (hourly, sources DRAFT corrective SDs)',
  description: 'Gates whether prod-error-sweep-loop.yml (cron 40 * * * *) actually sweeps system_alerts and sources DRAFT corrective SDs, or SKIPs as a clean no-op (SD-LEO-INFRA-PROD-ERROR-SWEEP-LOOP-001 + -WIRE-001). Shipped default-OFF by design: the WIRE completion flag (2026-06-21) explicitly recorded ACTIVATION as an operator/chairman action, not code-decidable.',
  is_enabled: false,
  lifecycle_state: 'disabled',
  risk_tier: 'medium',
  owner_type: 'team',
  owner_id: 'chairman',
  is_temporary: false,
  enablement_criteria: 'QF-20260705-181 (adversarial sweep J1): activation is a chairman/operator decision, not silently flippable by a worker. Trigger: chairman/operator sets PROD_ERROR_SWEEP_LOOP_ENABLE=true via gh variable set once ready to let hourly prod-error scans auto-source DRAFT SDs. Low near-term blast radius (system_alerts currently has only 2 rows). Coordinator recommended batching this with the sibling ADAM_GOVERNANCE_HEARTBEAT_V1 (QF-083, already activated) and SOURCING_GAUGE_GAP_MINER_V1 (QF-030, still open) as ONE activation-decision surface.',
};

export async function main(supabase) {
  const { error } = await supabase.from('leo_feature_flags').upsert(DISPOSITION_ROW, { onConflict: 'flag_key' });
  if (error) throw error;
  return { flag_key: FLAG_KEY, recorded: true };
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  main(sb).then((r) => console.log('[qf-20260705-181]', JSON.stringify(r))).catch((e) => { console.error('[qf-20260705-181] error:', e.message); process.exit(1); });
}
