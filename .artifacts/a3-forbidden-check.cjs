require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
const {data}=await s.from('strategic_directives_v2').select('sd_key,metadata').limit(400);
const freq={};
for(const r of data||[]){for(const k of Object.keys(r.metadata||{})){if(/forbid|framing|solomon_ruling|ruling/i.test(k))freq[k]=(freq[k]||0)+1;}}
console.log(Object.entries(freq).sort((a,b)=>b[1]-a[1]));
})();
