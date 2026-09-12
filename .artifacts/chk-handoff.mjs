import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
const supabase = await getSupabaseClient();
const uuid='dfdad20c-bf37-47ef-8588-0ebd82cfb874';
const { data, error } = await supabase.from('sd_phase_handoffs')
  .select('id,from_phase,to_phase,status,accepted_at,created_at,handoff_type,validation_score,metadata')
  .eq('sd_id', uuid).order('created_at',{ascending:false}).limit(10);
if(error){console.error('handoff err:',error.message);}
else for(const h of data){
  console.log(`${h.from_phase} -> ${h.to_phase} | ${h.status} | score=${h.validation_score} | accepted=${h.accepted_at} | created=${h.created_at}`);
  const m=h.metadata||{};
  const byp = m.bypass || m.bypassed || m.bypass_reason || m.bypass_validation;
  if(byp) console.log('   BYPASS MARKER:', JSON.stringify(byp).slice(0,300));
}
console.log('\n== bypass ledger (audit_log gate_bypass / handoff bypass) ==');
const { data: al, error: ae } = await supabase.from('audit_log')
  .select('event_type,severity,created_at,metadata,created_by')
  .eq('entity_id', uuid).order('created_at',{ascending:false}).limit(20);
if(ae) console.log('audit err:', ae.message);
else if(!al.length) console.log('no audit_log rows for this SD entity_id');
else for(const a of al) console.log(`${a.created_at} | ${a.event_type} | ${a.severity} | by=${a.created_by} | ${JSON.stringify(a.metadata).slice(0,200)}`);
