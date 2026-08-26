import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
const sb = await getSupabaseClient();
const { data, error } = await sb.from('eva_sync_state').select('*');
if (error) { console.log('ERR', error.message); process.exit(1); }
console.log('total rows:', data.length);
const TOKENISH = /ya29\.|1\/\/0[A-Za-z0-9]|refresh_token|access_token|"tokens"/;
for (const r of data) {
  const sm = JSON.stringify(r.source_metadata);
  console.log('---');
  console.log('id=', r.id, 'type=', r.source_type, 'ident=', r.source_identifier, 'updated=', r.updated_at ?? r.last_synced_at ?? 'n/a');
  console.log('  source_metadata =', sm);
  console.log('  keys =', Object.keys(r.source_metadata || {}));
  console.log('  TOKEN-SHAPED MATCH:', TOKENISH.test(sm || ''));
  const otherCols = Object.entries(r).filter(([k,v]) => k !== 'source_metadata' && typeof v === 'string' && TOKENISH.test(v));
  if (otherCols.length) console.log('  !! other cols token-shaped:', otherCols.map(([k])=>k));
}
const target = data.find(r => r.id === '5ea38ba3-6b46-4f17-be5a-3a87a4075143');
console.log('=== TARGET 5ea38ba3 ===');
console.log(target ? JSON.stringify(target, null, 2) : 'ROW NOT FOUND');
