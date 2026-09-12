import dotenv from 'dotenv'; dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '9126184c-a826-4ef7-9ce3-f0425b2aaf57';
const blocker = 'DEFERRED: gate condition unchanged (re-reviewed 2026-09-12 03:1xZ by Adam 49eabb23; review_by stays 2026-10-05). Fires when every sessions-watch sibling has LANDED; the only non-landed sibling INTELLIGENT-ACTION (board e4504e8e) was routed to the durable backlog 08-30 and is not built, so the gate is open-ended and owned, not unowned: it re-fires if that backlog item is built (then the coordinator dispatches the clean restart + end-to-end page verification; Adam does not execute, CONST-002), or closes at the chairman word that the sessions page is final. Owner: Adam. Marker form corrected this pass: the 2026-09-05 stamp read "DEFERRED (reviewed ...)" which DEFERRAL_MARKER_RE (DEFERRED\s*:) does not match, so the probe kept reading this row as stale/orphan.';
const { data, error } = await s.from('adam_task_ledger').update({ blocker }).eq('id', id).select('id,status,updated_at');
console.log(error ? 'ERR ' + error.message : ('OK ' + data[0].status + ' ' + data[0].updated_at));
