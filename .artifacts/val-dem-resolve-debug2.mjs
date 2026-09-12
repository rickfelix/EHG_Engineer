import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo } from '../lib/sub-agents/resolve-repo.js';
const r = await resolveSubAgentRepo({ subAgentCode: 'VALIDATION', sdId: 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001', targetApplication: 'EHG_Engineer' });
console.log('WITH targetApplication:', JSON.stringify(r, null, 1));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('applications').select('name,local_path').ilike('name','%EHG_Engineer%');
console.log('applications.local_path:', JSON.stringify(data));
