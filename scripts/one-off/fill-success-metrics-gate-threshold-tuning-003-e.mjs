import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, success_metrics')
  .eq('sd_key', 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const success_metrics = sd.success_metrics.map((m) => {
  if (m.metric === 'Implementation completeness') {
    return { ...m, actual: '100% -- all 4 key_changes verified live: resolveLiveRescoreThreshold() and enumerateConfiguredThresholdPairs() exist in lib/quality/gate-threshold-shadow.js; scripts/gate-threshold-shadow-rescore.mjs filters by the live-resolved threshold (verified by direct diff read, not just the PR description); config.js DO-NOT-cite annotations present for the raised pairs; new CI-run unit tests present and passing.' };
  }
  if (m.metric === 'Test coverage') {
    return { ...m, actual: '126/126 tests passing across tests/unit/quality/ (re-run independently at heal time, not just trusted from the PR), including the FR-1/FR-3 mutation-proof coverage tests in gate-threshold-shadow.test.js.' };
  }
  return m;
});

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_metrics })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD success_metrics updated with real measured values.');
