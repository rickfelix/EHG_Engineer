import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createOrUpsertNode } from '../lib/adam/task-ledger.js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const row = await createOrUpsertNode(s, { source_kind: 'sourced_sd', source_ref: 'QF-20260906-456', tier: 'child', parent_id: '45ee754a-59ab-46dd-81da-9f39f4b3c282',
  title: 'QF-20260906-456: generate-claude-md-from-db.js --only shrinks the manifest to the scoped files (hit on the 1afdeaac encode; adam-restart step 2 uses the same form)', status: 'open' });
console.log('bound', row.id);
