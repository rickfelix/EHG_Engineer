require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('strategic_directives_v2').select('sd_key,metadata').in('status',['draft','active','in_progress','pending_approval','planning']).limit(400);
const freq={};
for(const r of data||[]){for(const k of Object.keys(r.metadata||{})){if(/rul|constraint|forbid|ratif|hold|review|blocked|solomon|step0|framing/i.test(k))freq[k]=(freq[k]||0)+1;}}
console.log('rows',data?.length);console.log(Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(e=>e.join('=')).join('\n'));
})();
