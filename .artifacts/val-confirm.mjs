import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
try {
  const r = await c.query(`SELECT id, sub_agent_code, verdict, confidence, phase, metadata->>'phase' mphase,
      metadata->>'repo_path' repo_path, created_at
    FROM sub_agent_execution_results WHERE id='557dd8ec-a9c7-435b-a390-55fec4bac262'`);
  console.log('=== my evidence row ===');
  console.table(r.rows);
  // CLEANUP CHECK: my CREATE-OR-REPLACE semantics probe created public.val_probe_cor_fn -- is it gone?
  const d = await c.query(`SELECT count(*) n FROM pg_proc p JOIN pg_namespace n2 ON n2.oid=p.pronamespace
    WHERE n2.nspname='public' AND p.proname LIKE 'val_probe%'`);
  console.log('=== leftover probe functions in public (must be 0) ===', d.rows[0].n);
  const g = await c.query(`SELECT count(*) n FROM pg_proc p JOIN pg_namespace n2 ON n2.oid=p.pronamespace
    WHERE n2.nspname='public' AND p.proname='resolve_sd_mutation_audit_actor'`);
  console.log('=== resolve_sd_mutation_audit_actor in public (must be 0, migration unapplied) ===', g.rows[0].n);
} finally { await c.end(); }
