import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const { rows } = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'michael%' ORDER BY 1`);
console.log('MICHAEL TABLES LIVE IN DB:', rows.length ? rows.map(r=>r.tablename).join(', ') : '(NONE — migration not applied)');
const { rows: appr } = await c.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name IN ('michael_staged_items','michael_gmail_labels') ORDER BY table_name, ordinal_position`);
console.log('staged/labels cols live:', appr.length);
await c.end();
