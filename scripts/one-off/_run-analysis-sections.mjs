#!/usr/bin/env node
/**
 * Read-only schema analysis for SD-LEO-FEAT-STAGE-REJECT-KILL-001.
 * Runs each section through `supabase db query --linked --file <file>`.
 * NO migrations applied; selects only.
 *
 * Windows note: spawn `npx.cmd` explicitly (npx alone is a .cmd shim → ENOENT).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import process from 'node:process';

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const sections = [
  { id: '1a', label: 'ventures.workflow_status column type', sql: `
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
           c.udt_schema, c.udt_name, c.is_nullable, c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='ventures' AND c.column_name='workflow_status';
  `},
  { id: '1b', label: 'enum labels for udt', sql: `
    SELECT t.typname, e.enumlabel, e.enumsortorder
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname IN (
      SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
    )
    ORDER BY e.enumsortorder;
  `},
  { id: '1c', label: 'CHECK constraints on ventures referencing workflow_status', sql: `
    SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname='public' AND cls.relname='ventures' AND con.contype='c'
      AND pg_get_constraintdef(con.oid) ILIKE '%workflow_status%';
  `},
  { id: '1d', label: 'domain definition (if column is a domain)', sql: `
    SELECT d.typname AS domain_name, t.typname AS base_type, pg_get_constraintdef(c.oid) AS check_def
    FROM pg_type d
    JOIN pg_type t ON t.oid = d.typbasetype
    LEFT JOIN pg_constraint c ON c.contypid = d.oid
    WHERE d.typtype='d' AND d.typname IN (
      SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
    );
  `},
  { id: '1e', label: 'partial indexes on ventures referencing workflow_status', sql: `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename='ventures' AND indexdef ILIKE '%workflow_status%';
  `},
  { id: '1f', label: 'views referencing ventures + workflow_status', sql: `
    SELECT schemaname, viewname
    FROM pg_views
    WHERE definition ILIKE '%workflow_status%' AND definition ILIKE '%ventures%'
    ORDER BY schemaname, viewname;
  `},
  { id: '1g', label: 'distinct workflow_status values currently in use', sql: `
    SELECT workflow_status, COUNT(*) AS n
    FROM public.ventures
    GROUP BY workflow_status
    ORDER BY n DESC;
  `},

  { id: '2a', label: 'triggers on public.ventures', sql: `
    SELECT t.tgname, t.tgenabled,
           pg_get_triggerdef(t.oid) AS definition,
           p.proname AS func_name,
           n2.nspname AS func_schema
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname='ventures'
    ORDER BY t.tgname;
  `},
  { id: '2b', label: 'sd_completed / venture_killed / workflow_status function signatures', sql: `
    SELECT n.nspname AS schema, p.proname, p.prosrc IS NOT NULL AS has_body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname ILIKE '%sd_completed%'
       OR p.proname ILIKE '%venture_killed%'
       OR p.proname ILIKE '%venture_status%'
       OR p.proname ILIKE '%workflow_status%'
    ORDER BY p.proname;
  `},
  { id: '2b2', label: 'sd_completed / venture_killed function bodies (full)', sql: `
    SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname ILIKE '%sd_completed%'
       OR p.proname ILIKE '%venture_killed%'
       OR p.proname ILIKE '%venture_status%'
       OR p.proname ILIKE '%workflow_status%'
    ORDER BY p.proname;
  `},
  { id: '2c', label: 'FK references INTO ventures.id', sql: `
    SELECT con.conname, cls.relname AS child_table, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE con.contype='f' AND con.confrelid = 'public.ventures'::regclass
    ORDER BY cls.relname;
  `},

  { id: '3a', label: 'eva_events CHECK constraints', sql: `
    SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    WHERE n.nspname='public' AND cls.relname='eva_events' AND con.contype='c'
    ORDER BY con.conname;
  `},
  { id: '3b', label: 'eva_events column inventory', sql: `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='eva_events'
    ORDER BY ordinal_position;
  `},
  { id: '3c', label: 'distinct event_type currently in eva_events (top 30)', sql: `
    SELECT event_type, COUNT(*) AS n
    FROM public.eva_events
    GROUP BY event_type
    ORDER BY n DESC
    LIMIT 30;
  `},

  { id: '4', label: 'auth.users PK type', sql: `
    SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
    WHERE i.indrelid='auth.users'::regclass AND i.indisprimary;
  `},

  { id: '5a', label: 'ventures column inventory (look for kill / reject signals)', sql: `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventures'
    ORDER BY ordinal_position;
  `},
  { id: '5b', label: 'PrivacyPatrol AI venture lookup', sql: `
    SELECT id, name, workflow_status, status, created_at, updated_at
    FROM public.ventures
    WHERE name ILIKE '%PrivacyPatrol%'
    ORDER BY updated_at DESC
    LIMIT 10;
  `},
  { id: '5c', label: 'kill-like columns present?', sql: `
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventures'
      AND column_name IN ('killed_at','kill_reason','rejected_at','reject_reason','status_reason','cancellation_reason','cancelled_at','rejected_by_user_id','killed_by_user_id');
  `},
  { id: '5d', label: 'chairman lookup by email', sql: `
    SELECT id, email,
           raw_user_meta_data->>'role' AS meta_role,
           raw_app_meta_data->>'role' AS app_role,
           created_at
    FROM auth.users
    WHERE email = 'rickfelix2000@gmail.com'
    LIMIT 5;
  `},
  { id: '5e', label: 'all auth users with chairman/lead role', sql: `
    SELECT id, email,
           raw_user_meta_data->>'role' AS meta_role,
           raw_app_meta_data->>'role' AS app_role
    FROM auth.users
    WHERE raw_user_meta_data->>'role' IN ('chairman','lead')
       OR raw_app_meta_data->>'role' IN ('chairman','lead')
    ORDER BY created_at
    LIMIT 10;
  `},
  { id: '5f', label: 'PP venture metadata snapshot', sql: `
    SELECT id, name, workflow_status, status, metadata, updated_at
    FROM public.ventures
    WHERE name ILIKE '%PrivacyPatrol%'
    ORDER BY updated_at DESC
    LIMIT 5;
  `},

  { id: '6a', label: 'SECURITY DEFINER funcs that reference auth.jwt() (signatures)', sql: `
    SELECT n.nspname AS schema, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname='public'
      AND pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
    ORDER BY p.proname
    LIMIT 30;
  `},
  { id: '6b', label: 'SECURITY DEFINER+auth.jwt() full bodies (top 3)', sql: `
    SELECT n.nspname || '.' || p.proname AS qualified, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname='public'
      AND pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
    ORDER BY p.proname
    LIMIT 3;
  `},
  { id: '6c', label: 'RLS policies (INSERT/ALL) sample', sql: `
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND (cmd='INSERT' OR cmd='ALL')
    ORDER BY tablename, policyname
    LIMIT 30;
  `},
  { id: '6d', label: 'audit-style table names (for naming convention)', sql: `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND (table_name LIKE '%_log' OR table_name LIKE '%_audit' OR table_name LIKE '%_history' OR table_name LIKE '%_events')
    ORDER BY table_name;
  `},
];

const tmpDir = 'scripts/one-off/_reject_kill_analysis';
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

for (const s of sections) {
  const file = `${tmpDir}/section_${s.id}.sql`;
  writeFileSync(file, s.sql.trim() + '\n');
  console.log(`\n========== [${s.id}] ${s.label} ==========`);
  const r = spawnSync(NPX, ['supabase', 'db', 'query', '--linked', '--file', file], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    shell: true,
  });
  if (r.error) {
    console.log(`SPAWN ERROR (${s.id}):`, r.error.message);
    continue;
  }
  if (r.status !== 0) {
    console.log(`NONZERO EXIT (${s.id}) status=${r.status}`);
    if (r.stdout) console.log('STDOUT:', r.stdout);
    if (r.stderr) console.log('STDERR:', r.stderr);
    continue;
  }
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('STDERR:', r.stderr);
}
