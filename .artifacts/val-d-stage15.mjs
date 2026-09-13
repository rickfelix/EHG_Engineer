import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const q = async (l, s) => { try { const {rows}=await c.query(s); console.log('\n### '+l); console.log(JSON.stringify(rows,null,1).slice(0,3500)); } catch(e){ console.log('\n### '+l+' ERR '+e.message);} };
await q('cols', `SELECT column_name FROM information_schema.columns WHERE table_name='venture_stages'`);
await q('stage15 full metadata', `SELECT stage_number, metadata FROM venture_stages WHERE stage_number=15`);
await c.end();
