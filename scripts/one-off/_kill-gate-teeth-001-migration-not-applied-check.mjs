// READ-ONLY: assert the SD-LEO-INFRA-KILL-GATE-TEETH-001 migration objects do not exist yet.
// Uses information_schema/pg_catalog over a direct pg connection (authoritative), NOT PostgREST
// (PGRST205 is a schema-cache miss, not proof of absence) and NOT head:true counts
// (a head count on a missing table can return no error and a null count).
import 'dotenv/config';
import pg from 'pg';

const url = process.env.SUPABASE_POOLER_URL;
if (!url) { console.error('NO SUPABASE_POOLER_URL'); process.exit(2); }
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const t = await client.query(
  `SELECT table_schema, table_name FROM information_schema.tables
   WHERE table_name = ANY($1::text[])`,
  [['kill_gate_sealed_predictions', 'kill_gate_teeth_proof_records']]
);
const r = await client.query(`SELECT rolname FROM pg_roles WHERE rolname = 'kill_gate_traversal_ro'`);
const f = await client.query(
  `SELECT p.proname FROM pg_proc p WHERE p.proname = 'kill_gate_teeth_discharged_predictions'`
);
console.log('tables found:', JSON.stringify(t.rows));
console.log('role found:', JSON.stringify(r.rows));
console.log('function found:', JSON.stringify(f.rows));
console.log('MIGRATION_APPLIED:', t.rows.length > 0 || r.rows.length > 0 || f.rows.length > 0);
await client.end();
process.exit(0);
