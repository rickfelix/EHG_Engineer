import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createOrUpsertNode } from '../lib/adam/task-ledger.js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r = await createOrUpsertNode(s, { source_kind: 'sourced_sd', source_ref: 'QF-20260906-360', tier: 'child', parent_id: '45ee754a-59ab-46dd-81da-9f39f4b3c282',
  title: 'QF-20260906-360: CLAUDE_COORDINATOR.md inside the single-read error band; split like QF-908 (hit on encode PR #8359, CI red)', status: 'open' });
console.log('bound', r.id.slice(0, 8));
