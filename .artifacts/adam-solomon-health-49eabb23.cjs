require('dotenv').config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const { createClient } = require('@supabase/supabase-js');
const { getActiveSolomonId } = require('../lib/coordinator/solomon-identity.cjs');
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const id = await getActiveSolomonId(s);
  console.log('active Solomon:', id);
  if (!id) return;
  const { data: row } = await s.from('claude_sessions').select('session_id,status,heartbeat_at,last_tool_at,metadata').eq('session_id', id).single();
  const now = Date.now();
  const hbAge = row?.heartbeat_at ? Math.round((now - new Date(row.heartbeat_at).getTime()) / 60000) : null;
  const toolAge = row?.last_tool_at ? Math.round((now - new Date(row.last_tool_at).getTime()) / 60000) : null;
  console.log('status', row?.status, '| heartbeat_at', String(row?.heartbeat_at).slice(11, 19) + 'Z age', hbAge, 'min | last_tool_at', String(row?.last_tool_at).slice(11, 19) + 'Z age', toolAge, 'min | model', row?.metadata?.model);
  const { data: cons } = await s.from('session_coordination').select('id,created_at,sender_session,acknowledged_at,payload').eq('target_session', id).in('payload->>kind', ['solomon_consult']).gte('created_at', new Date(now - 24 * 3600 * 1000).toISOString()).order('created_at', { ascending: false }).limit(50);
  const unanswered = [];
  for (const c of cons || []) {
    const corr = c.payload?.correlation_id;
    const { count } = await s.from('session_coordination').select('id', { count: 'exact', head: true }).eq('sender_session', id).eq('payload->>correlation_id', corr);
    if (!count) unanswered.push({ id: c.id.slice(0, 8), age: Math.round((now - new Date(c.created_at).getTime()) / 60000), from: String(c.sender_session || '').slice(0, 8), acked: !!c.acknowledged_at });
  }
  console.log('consults last 24h:', (cons || []).length, '| unanswered (no reply row by correlation):', unanswered.length);
  for (const u of unanswered.slice(0, 10)) console.log('  ', u.id, 'age', u.age, 'min from', u.from, 'acked', u.acked);
  const { data: out } = await s.from('session_coordination').select('created_at').eq('sender_session', id).order('created_at', { ascending: false }).limit(1);
  console.log('Solomon last outbound row:', String(out?.[0]?.created_at || '-').slice(11, 19) + 'Z');
})();
