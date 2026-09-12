import 'dotenv/config';
import pg from 'pg';
const url = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
console.log('conn var present:', !!url);
if (url) {
  const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
  await c.connect();
  const { rows } = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.strategic_directives_v2'::regclass AND contype='c'`);
  console.log('CHECK constraints on strategic_directives_v2:', rows.length);
  for (const r of rows) console.log('  -', r.conname, '::', r.def.slice(0,160));
  const bl = await c.query(`SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.strategic_directives_v2'::regclass AND NOT tgisinternal`);
  console.log('TRIGGERS:', bl.rows.map(r=>r.tgname).join(', '));
  await c.end();
}
