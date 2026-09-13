import 'dotenv/config';
import { resolveSubAgentRepo, getSubAgentCapability } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('capability:', JSON.stringify(getSubAgentCapability('TESTING')));
const r = await resolveSubAgentRepo({ sdId: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D', subAgentCode: 'TESTING', supabase });
console.log('resolution:', JSON.stringify(r, null, 2));
