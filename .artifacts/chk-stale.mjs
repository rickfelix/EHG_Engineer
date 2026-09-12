import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
const supabase = await getSupabaseClient();
const { data } = await supabase.from('strategic_directives_v2')
  .select('id,sd_key,status,current_phase,worktree_path,target_application')
  .eq('id','dfdad20c-bf37-47ef-8588-0ebd82cfb874').maybeSingle();
console.log(JSON.stringify(data,null,2));
