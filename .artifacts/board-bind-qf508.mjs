import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createOrUpsertNode } from '../lib/adam/task-ledger.js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const row = await createOrUpsertNode(s, { source_kind: 'sourced_sd', source_ref: 'QF-20260906-508', tier: 'child', parent_id: '45ee754a-59ab-46dd-81da-9f39f4b3c282',
  title: 'QF-20260906-508: hook-path windowsHide hotfix (QF-335 Part 1; Solomon split 4855e3c3; chairman still sees flicker 14:1xZ; Adam builds under chairman direction, precedent QF-961)', status: 'in_progress' });
console.log('bound', row.id);
