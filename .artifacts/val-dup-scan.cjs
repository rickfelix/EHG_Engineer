require('dotenv').config();
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const terms=['receipt','capped','broadcast','constraint','drain','backpressure','worktree quota','pool'];
(async()=>{
  console.log('###### STRATEGIC DIRECTIVES ######');
  for(const t of terms){
    const {data,error}=await s.from('strategic_directives_v2')
      .select('sd_key,id,title,status,created_at')
      .or(`title.ilike.%${t}%,description.ilike.%${t}%`)
      .order('created_at',{ascending:false}).limit(25);
    if(error){console.log(t,'ERR',error.message);continue;}
    const rows=(data||[]).filter(r=>/receipt|capped|broadcast|constraint|drain|backpressure|quota|pool/i.test(r.title||''));
    console.log(`\n-- term="${t}" total=${(data||[]).length} title-hits=${rows.length}`);
    for(const r of rows) console.log(`   ${r.status.padEnd(12)} ${r.sd_key||r.id} :: ${r.title}`);
  }
  console.log('\n###### QUICK FIXES ######');
  for(const t of terms){
    const {data,error}=await s.from('quick_fixes')
      .select('id,title,status,created_at,pr_url')
      .or(`title.ilike.%${t}%,description.ilike.%${t}%`)
      .order('created_at',{ascending:false}).limit(25);
    if(error){console.log(t,'ERR',error.message);continue;}
    console.log(`\n-- term="${t}" n=${(data||[]).length}`);
    for(const r of data||[]) console.log(`   ${String(r.status).padEnd(12)} ${r.id} :: ${(r.title||'').slice(0,110)}`);
  }
})();
