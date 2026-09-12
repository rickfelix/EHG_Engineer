import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { getFilteredRetrospective } from '../scripts/modules/handoff/retro-filters.js';
import { validateSDCompletionReadiness } from '../scripts/modules/sd-quality-validation.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

const PARENT_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001';

async function main() {
  const { data: parent } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', PARENT_KEY)
    .maybeSingle();

  const { retrospective, leadToPlanAcceptedAt, error } = await getFilteredRetrospective(parent.id, parent.created_at, supabase, parent.sd_key);
  console.log('leadToPlanAcceptedAt:', leadToPlanAcceptedAt);
  console.log('filter error:', error);
  console.log('selected retro id:', retrospective?.id, '| created_at:', retrospective?.created_at);

  if (!retrospective) {
    console.log('NO QUALIFYING RETROSPECTIVE FOUND -- would fail.');
    return;
  }

  const readiness = await validateSDCompletionReadiness(parent, retrospective);
  console.log('\n=== READINESS RESULT ===');
  console.log('passed:', readiness.passed);
  console.log('score:', readiness.score);
  console.log('issues:', JSON.stringify(readiness.issues));
  console.log('retroQuality.score:', readiness.retroQuality?.score);
  console.log('retroQuality.passed:', readiness.retroQuality?.passed);
  console.log('retroQuality.details.band:', readiness.retroQuality?.details?.band);
  console.log('retroQuality.details.confidence:', readiness.retroQuality?.details?.confidence);
  console.log('retroQuality.details.threshold:', readiness.retroQuality?.details?.threshold);
  console.log('retroQuality.details.boilerplate_penalty:', readiness.retroQuality?.details?.boilerplate_penalty);
  console.log('retroQuality.details.is_orchestrator:', readiness.retroQuality?.details?.is_orchestrator);
  console.log('retroQuality.warnings:', JSON.stringify(readiness.retroQuality?.warnings));
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR', e); process.exit(1); });
