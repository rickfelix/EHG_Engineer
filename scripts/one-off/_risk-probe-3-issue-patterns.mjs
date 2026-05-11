import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

// Issue pattern recurrence
const { data: pat } = await sb.from('issue_patterns')
  .select('pattern_id,title,witness_count,first_witnessed_at,last_witnessed_at,severity,prevention_status,mitigation_notes')
  .eq('pattern_id', 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001')
  .maybeSingle();
console.log('Pattern record:', JSON.stringify(pat, null, 2));

// Recent SDs that closed this pattern
const { data: closes } = await sb.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,metadata,updated_at')
  .or('metadata->>pattern_id.eq.PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001,description.ilike.%PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001%')
  .order('updated_at', { ascending: false })
  .limit(15);
console.log('\nRelated SDs:');
(closes || []).forEach(s => console.log(`  ${s.sd_key} [${s.status}/${s.current_phase}] ${(s.title || '').slice(0, 100)}`));

// Pattern issue_patterns table schema may differ — try a more open query if first returned null
if (!pat) {
  const { data: any } = await sb.from('issue_patterns').select('*').ilike('pattern_id', '%PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY%').limit(3);
  console.log('\nFallback issue_patterns query:', JSON.stringify(any, null, 2));
}

// Count of completed SDs that touched related triggers
const { count: trigCount } = await sb.from('strategic_directives_v2')
  .select('id', { count: 'exact', head: true })
  .ilike('description', '%update_sd_after_lead_evaluation%');
console.log('\nSDs mentioning update_sd_after_lead_evaluation:', trigCount);
