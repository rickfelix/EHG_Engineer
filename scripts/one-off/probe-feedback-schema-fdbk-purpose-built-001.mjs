import 'dotenv/config';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const client = await createDatabaseClient('engineer', { verify: false });

const fns = await client.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_submit_internal_feedback','check_feedback_rate_limit','fn_submit_venture_user_feedback')
`);
console.log('=== functions ===');
console.log(JSON.stringify(fns.rows, null, 2));

const cols = await client.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema='public' and table_name='feedback'
  order by ordinal_position
`);
console.log('=== feedback columns ===');
console.log(JSON.stringify(cols.rows, null, 2));

const checks = await client.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.feedback'::regclass and contype = 'c'
`);
console.log('=== feedback check constraints ===');
console.log(JSON.stringify(checks.rows, null, 2));

const policies = await client.query(`
  select
    polname,
    polpermissive as permissive,
    polcmd as cmd,
    (select array_agg(rolname) from pg_roles where oid = any(polroles)) as roles,
    pg_get_expr(polqual, polrelid) as qual,
    pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
  where polrelid = 'public.feedback'::regclass
`);
console.log('=== feedback RLS policies ===');
console.log(JSON.stringify(policies.rows, null, 2));

await client.end();
