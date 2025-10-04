import pg from 'pg';
const { Client } = pg;

const projectId = 'dedlbzhpgkmetvhbkyzq';
const password = 'Fl!M32DaM00n!1';
const connStr = `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;

const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
await client.connect();

const result = await client.query(`
  SELECT conname, pg_get_constraintdef(c.oid)
  FROM pg_constraint c
  WHERE conrelid = 'retrospectives'::regclass
  AND conname = 'retrospectives_generated_by_check'
`);

console.log('Check constraint:', result.rows);
await client.end();
