require('dotenv').config();
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  // feedback: sample a row to learn required columns
  const r = await fetch(`${url}/rest/v1/feedback?select=*&order=created_at.desc&limit=2`, {headers:{apikey:key,Authorization:`Bearer ${key}`}});
  const rows = await r.json();
  console.log('FEEDBACK SAMPLE KEYS:', rows[0] ? Object.keys(rows[0]).join(',') : 'none', 'status', r.status);
  if (rows[0]) console.log('ROW0:', JSON.stringify(rows[0]).slice(0,900));
  // does an UPDATE fail (trigger applied?)
  if (rows[0]) {
    const u = await fetch(`${url}/rest/v1/feedback?id=eq.${rows[0].id}`, {method:'PATCH',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({updated_at:new Date().toISOString()})});
    console.log('UPDATE PROBE status=', u.status, (await u.text()).slice(0,300));
  }
  // active sessions + roles + models
  const s = await fetch(`${url}/rest/v1/claude_sessions?select=session_id,status,metadata,heartbeat_at&status=eq.active&order=heartbeat_at.desc&limit=30`, {headers:{apikey:key,Authorization:`Bearer ${key}`}});
  const ss = await s.json();
  console.log('ACTIVE SESSIONS:', ss.length);
  for (const x of ss) {
    const m = x.metadata||{};
    console.log(' ', x.session_id.slice(0,8), 'role=', m.role ?? (m.is_coordinator?'(is_coordinator)':'-'), 'non_fleet=', m.non_fleet??'-', 'model=', m.model??'-', 'fam=', m.model_family??'-', 'src=', m.model_source??'-');
  }
})();
