import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// FR-1 + FR-7 flags
const { data: flags, error: fe } = await s.from('leo_feature_flags').select('*').or('flag_key.eq.STAGE_GATE_PREDICATE_ARMED,flag_key.eq.HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED,flag_key.eq.LEO_HIGH_CONSEQUENCE_GATES_ENABLED');
console.log('=== FLAGS err:', fe?.message);
for (const f of flags||[]) console.log(' FLAG', f.flag_key, '| enabled:', f.is_enabled, '| created:', f.created_at, '| desc:', String(f.description||'').slice(0,200));
// FR-7 Part B SD
const { data: sds, error: se } = await s.from('strategic_directives_v2').select('id,sd_key,title,status,created_by,created_at,metadata,description').or('sd_key.eq.SD-LEO-INFRA-DEMAND-ENGINE-PART-001,id.eq.SD-LEO-INFRA-DEMAND-ENGINE-PART-001');
console.log('=== PART B SD err:', se?.message, '| count:', sds?.length);
for (const d of sds||[]) console.log(' SD', d.sd_key||d.id, '| status:', d.status, '| by:', d.created_by, '| at:', d.created_at, '| title:', d.title, '\n   desc:', String(d.description||'').slice(0,700));
// Ledger execution_mode column live?
const { error: ce } = await s.from('venture_channel_publish_ledger').select('execution_mode').limit(1);
console.log('=== execution_mode column live?', ce ? 'NO -> '+ce.code+' '+ce.message : 'YES');
