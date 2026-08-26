// Independent instrument: raw HTTPS fetch with the ANON key (not supabase-js, not the
// VALIDATION pass's script) against eva_sync_state. Instrument diversity on purpose.
import dotenv from 'dotenv'; dotenv.config();
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
console.log('url present:', !!url, 'anon present:', !!anon);
if (!url || !anon) process.exit(0);
const h = { apikey: anon, Authorization: `Bearer ${anon}` };
const sel = await fetch(`${url}/rest/v1/eva_sync_state?select=id,source_identifier,source_metadata`, { headers: h });
console.log('ANON SELECT status:', sel.status, '=>', (await sel.text()).slice(0, 400));
const upd = await fetch(`${url}/rest/v1/eva_sync_state?id=eq.00000000-0000-0000-0000-000000000000`, {
  method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ consecutive_failures: 0 }),
});
console.log('ANON UPDATE(nonexistent id) status:', upd.status, '=>', (await upd.text()).slice(0, 300));
