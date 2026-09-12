import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').select('*').eq('id','3ed447ec-de8c-4798-9fdc-5a0c814623a5').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(1); }
const { metadata, results, ...rest } = data || {};
console.log('COLUMNS:', JSON.stringify(rest, null, 1).slice(0, 1500));
console.log('METADATA KEYS:', Object.keys(metadata || {}).join(','));
console.log('metadata.repo_path=', metadata?.repo_path, '| executed_from_cwd=', metadata?.executed_from_cwd);
const { data: apps } = await sb.from('applications').select('id,name,local_path').limit(20);
console.log('APPS:', JSON.stringify(apps));
