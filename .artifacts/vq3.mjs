import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('product_requirements_v2').select('metadata,acceptance_criteria').eq('id','PRD-SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001');
const p = data?.[0];
console.log('--- metadata.post_merge_revisions ---');
console.log(JSON.stringify(p?.metadata?.post_merge_revisions, null, 2));
console.log('--- other metadata keys ---', Object.keys(p?.metadata || {}).join(', '));
