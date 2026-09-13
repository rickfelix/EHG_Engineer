import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. execution_mode present?
const a = await sb.from('venture_channel_publish_ledger').select('correlation_id, decision, outcome, execution_mode, mock_run_id, venture_id, channel_type, content_ref, created_at').limit(20);
console.log('LEDGER select w/ execution_mode:', a.error ? 'ERROR '+a.error.code+' '+a.error.message : `${a.data.length} rows`);
if (!a.error) console.log(JSON.stringify(a.data, null, 1));

// 2. campaign_content
const c = await sb.from('campaign_content').select('id, idempotency_key, external_post_id, platform, dispatch_status').limit(20);
console.log('CAMPAIGN_CONTENT:', c.error ? 'ERROR '+c.error.message : `${c.data.length} rows`);
if (!c.error && c.data.length) console.log(JSON.stringify(c.data,null,1));

// 3. probe the outcome CHECK: try updating a nonexistent row w/ unmeasurable - won't tell us.
// Instead: attempt an insert into a throwaway? Too risky. Use a read-only constraint probe via rpc if available.
for (const fn of ['exec_sql','execute_sql','sql']) {
  const r = await sb.rpc(fn, { query: "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='venture_channel_publish_ledger'::regclass" });
  console.log(`rpc(${fn}):`, r.error ? r.error.message.slice(0,90) : JSON.stringify(r.data));
}
