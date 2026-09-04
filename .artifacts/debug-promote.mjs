import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const mod = await import(pathToFileURL('scripts/auto-validate-user-stories-on-exec-complete.js').href + '?debug=' + Date.now());
const { autoValidateUserStories } = mod;

const result = await autoValidateUserStories('SD-LEO-FIX-EXEC-PLAN-HEALS-001', supabase);
console.log('RESULT:', JSON.stringify(result, null, 2));
