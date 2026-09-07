require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{const {data,error}=await s.from('strategic_directives_v2').select('*').eq('sd_key',process.argv[2]).single();
if(error){console.log(error);return}
const d=data;for(const k of ['title','description','scope','rationale','strategic_objectives','success_criteria','success_metrics','key_changes','risks','dependencies','metadata','status','current_phase','priority','category','sd_type','target_application','parent_sd_id'])console.log('=== '+k+' ===\n'+(typeof d[k]==='string'?d[k]:JSON.stringify(d[k],null,1)));})();
