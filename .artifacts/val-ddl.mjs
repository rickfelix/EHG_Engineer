import 'dotenv/config';
import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const client = await createDatabaseClient('engineer', { verify: false });
const { rows } = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ventures' AND column_name IN ('is_demo','is_scaffolding','name','updated_at')
  ORDER BY column_name`);
console.log('=== ventures column defs ===');
for (const r of rows) console.log(` ${r.column_name}: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default}`);
const { rows: trg } = await client.query(`
  SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
  WHERE tgrelid='public.ventures'::regclass AND NOT tgisinternal`);
console.log('\n=== ventures triggers ===');
for (const t of trg) console.log(` ${t.tgname}: ${t.def.slice(0,200)}`);
const { rows: chk } = await client.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conrelid='public.ventures'::regclass AND contype='c'`);
console.log('\n=== ventures CHECK constraints ===');
for (const c of chk) console.log(` ${c.conname}: ${c.def.slice(0,220)}`);
await client.end?.();
process.exit(0);
