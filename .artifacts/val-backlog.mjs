import { createClient } from '@supabase/supabase-js'; import dotenv from 'dotenv'; dotenv.config();
const s=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UUID='ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5', KEY='SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';
for(const v of [UUID,KEY]){
  const { data, error, count } = await s.from('sd_backlog_map').select('*',{count:'exact'}).eq('sd_id',v).limit(3);
  console.log(`sd_backlog_map sd_id=${v.slice(0,20)}...:`, error?`ERR ${error.code} ${error.message.slice(0,60)}`:`count=${count}`);
  if(data&&data[0]) console.log('   sample cols:', Object.keys(data[0]).slice(0,12).join(','));
}
// user stories
for (const t of ['user_stories','product_requirements_v2']) {
  for (const v of [UUID,KEY]) {
    const { count, error } = await s.from(t).select('*',{count:'exact',head:true}).eq(t==='user_stories'?'sd_id':'directive_id', v);
    if(!error) console.log(`${t} for ${v.slice(0,18)}...: count=${count}`);
  }
}
