import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const id of ['885ad953-6288-45db-9e16-4a2e26684afc','168c381b','d18567a6']) {
  let q = sb.from('session_coordination').select('id, created_at, target_session, sender_session, subject, payload, read_at');
  q = id.length > 8 ? q.eq('id', id) : q.like('id', `${id}%`);
  const { data, error } = await q.limit(3);
  if (error) { const a = await sb.from('retention_archive').select('source_id, row_data').like('source_id', `${id}%`).limit(3); console.log('ARCHIVE', id, JSON.stringify(a.data?.map(r=>({id:r.source_id, t:r.row_data?.target_session, c:r.row_data?.created_at, p:r.row_data?.payload})), null, 1), a.error?.message); continue; }
  console.log('LIVE', id, JSON.stringify(data?.map(r=>({id:r.id, t:r.target_session, s:r.sender_session, c:r.created_at, sub:r.subject, corr:r.payload?.correlation_id, kind:r.payload?.kind, addr:r.payload?.addressee, role:r.payload?.target_role})), null, 1));
  if (!data?.length) { const a = await sb.from('retention_archive').select('source_id, row_data').like('source_id', `${id}%`).limit(3); console.log('ARCHIVE', id, JSON.stringify(a.data?.map(r=>({id:r.source_id, t:r.row_data?.target_session, c:r.row_data?.created_at, kind:r.row_data?.payload?.kind})), null, 1), a.error?.message); }
}
const { data: sess } = await sb.from('claude_sessions').select('session_id, heartbeat_at, status, metadata').in('session_id', ['3616c697-916a-4e60-bc83-be29c9557d71','d3430608-0000-0000-0000-000000000000']).limit(2);
const { data: sol } = await sb.from('claude_sessions').select('session_id, heartbeat_at, status, metadata->role, metadata->solomon_since, created_at').filter('metadata->>role','eq','solomon').order('heartbeat_at',{ascending:false}).limit(5);
console.log('SOLOMON ROWS', JSON.stringify(sol, null, 1));
const { data: coord } = await sb.from('claude_sessions').select('session_id, heartbeat_at, status, metadata->role, metadata->solomon_since').eq('session_id','3616c697-916a-4e60-bc83-be29c9557d71').limit(1);
console.log('COORD ROW', JSON.stringify(coord, null, 1));
