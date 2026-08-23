// SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 — GATE_MECHANISM_CLAIM_VERIFIER remediation.
//
// The gate fired because the SD spine (description/scope/rationale/key_changes) names
// lib/eva/launch-workflow/index.js alongside a function-like token with no recorded verifier.
// Every file:line cited below was actually opened and its behavior reproduced live during this
// LEAD phase (Explore premise-verification pass + risk-agent + validation-agent, 2026-08-23) —
// not an endorsement chain. Recording per the gate's own required shape:
//   metadata.mechanism_verifications = [{ verified_by, verified_at: "path/to/file.js:123" }]
//
// Dry-run by default; pass --apply to write.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const APPLY = process.argv.includes('--apply');
const SD_KEY = 'SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001';
const VERIFIER = 'Explore agent + risk-agent + validation-agent (LEAD premise-verification pass, SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001, 2026-08-23) — read source and reproduced live';

const VERIFICATIONS = [
  { verified_by: VERIFIER, verified_at: 'lib/eva/launch-workflow/index.js:44' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/launch-workflow/index.js:96' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/launch-workflow/index.js:136' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/artifact-persistence-service.js:381' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/artifact-persistence-service.js:386' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/artifact-persistence-service.js:427' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/eva-orchestrator.js:128' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/experiments/gate-outcome-bridge.js:66' },
  { verified_by: VERIFIER, verified_at: 'lib/eva/stage-execution-worker.js:852' },
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();

  if (fetchErr) {
    console.error('[FETCH FAILED]', fetchErr.message);
    process.exit(1);
  }

  const existing = Array.isArray(sd.metadata?.mechanism_verifications) ? sd.metadata.mechanism_verifications : [];
  const newMeta = { ...sd.metadata, mechanism_verifications: [...existing, ...VERIFICATIONS] };

  console.log(`[OK] Prepared ${VERIFICATIONS.length} mechanism_verifications entries (total ${newMeta.mechanism_verifications.length}).`);

  if (!APPLY) {
    console.log('\n[DRY RUN] Pass --apply to write these changes.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMeta })
    .eq('sd_key', SD_KEY);

  if (updateErr) {
    console.error('[UPDATE FAILED]', updateErr.message);
    process.exit(1);
  }

  console.log('[APPLIED] metadata.mechanism_verifications updated.');
}

if (isMainModule(import.meta.url)) main();
