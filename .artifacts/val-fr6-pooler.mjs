import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
// FR-6 DISCRIMINATOR: on a transaction-mode pooled connection, pg_backend_pid() changes
// between transactions and a session-level set_config does NOT survive. Measure it.
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const r1 = await c.query("SELECT pg_backend_pid() p, current_setting('app.actor', true) a, inet_server_port() port");
  await c.query('BEGIN'); const r2 = await c.query("SELECT pg_backend_pid() p, current_setting('app.actor', true) a"); await c.query('COMMIT');
  await c.query('BEGIN'); const r3 = await c.query("SELECT pg_backend_pid() p, current_setting('app.actor', true) a"); await c.query('COMMIT');
  // interleave several standalone statements, then re-read
  for (let i=0;i<5;i++) await c.query('SELECT 1');
  const r4 = await c.query("SELECT pg_backend_pid() p, current_setting('app.actor', true) a");
  const rows=[r1,r2,r3,r4].map((r,i)=>({step:['post-connect','txn1','txn2','after-5-stmts'][i], pid:r.rows[0].p, app_actor:r.rows[0].a}));
  console.log('port:', r1.rows[0].port);
  console.table(rows);
  const pids=new Set(rows.map(r=>r.pid)), actors=new Set(rows.map(r=>r.app_actor));
  console.log('distinct backend pids:', pids.size, '| distinct app.actor values:', actors.size);
  console.log(pids.size===1 && actors.size===1
    ? 'VERDICT: SESSION-MODE / stable backend -- session-level set_config SURVIVES across transactions. FR-6 conclusion HOLDS.'
    : 'VERDICT: backend or GUC NOT stable -- transaction-mode pooling risk. FR-6 conclusion FAILS.');
} finally { await c.end(); }
