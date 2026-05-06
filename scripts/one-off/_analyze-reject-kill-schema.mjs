#!/usr/bin/env node
/**
 * Read-only schema-impact analysis for SD-LEO-FEAT-STAGE-REJECT-KILL-001.
 * NO MIGRATIONS APPLIED. Selects only.
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const SECTION = (n, t) => console.log(`\n========== [${n}] ${t} ==========`);
const sub = (s) => console.log(`-- ${s}`);

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // ---------- 1. Enum / CHECK / domain status of ventures.workflow_status ----------
    SECTION('1', 'ventures.workflow_status type & values');

    sub('1a. column type info');
    const colInfo = await client.query(`
      SELECT
        c.table_schema, c.table_name, c.column_name, c.data_type,
        c.udt_schema, c.udt_name, c.is_nullable, c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ventures'
        AND c.column_name = 'workflow_status';
    `);
    console.log(colInfo.rows);

    sub('1b. enum labels (if udt_name is an enum)');
    const enumLabels = await client.query(`
      SELECT t.typname, e.enumlabel, e.enumsortorder
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname IN (
        SELECT udt_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
      )
      ORDER BY e.enumsortorder;
    `);
    console.log(enumLabels.rows);

    sub('1c. CHECK constraints on ventures referencing workflow_status');
    const chk = await client.query(`
      SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cls.relnamespace
      WHERE n.nspname = 'public'
        AND cls.relname = 'ventures'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%workflow_status%';
    `);
    console.log(chk.rows);

    sub('1d. domain definition (if column is a domain)');
    const dom = await client.query(`
      SELECT d.typname AS domain_name, t.typname AS base_type, pg_get_constraintdef(c.oid) AS check_def
      FROM pg_type d
      JOIN pg_type t ON t.oid = d.typbasetype
      LEFT JOIN pg_constraint c ON c.contypid = d.oid
      WHERE d.typtype = 'd'
        AND d.typname IN (
          SELECT udt_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='ventures' AND column_name='workflow_status'
        );
    `);
    console.log(dom.rows);

    sub('1e. partial indexes on ventures referencing workflow_status');
    const pIdx = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname='public'
        AND tablename='ventures'
        AND indexdef ILIKE '%workflow_status%';
    `);
    console.log(pIdx.rows);

    sub('1f. views referencing ventures.workflow_status');
    const views = await client.query(`
      SELECT schemaname, viewname
      FROM pg_views
      WHERE definition ILIKE '%workflow_status%'
        AND definition ILIKE '%ventures%'
      ORDER BY schemaname, viewname;
    `);
    console.log(views.rows);

    sub('1g. distinct workflow_status values currently in use');
    const distinct = await client.query(`
      SELECT workflow_status, COUNT(*) AS n
      FROM public.ventures
      GROUP BY workflow_status
      ORDER BY n DESC;
    `);
    console.log(distinct.rows);

    // ---------- 2. Trigger inventory on ventures ----------
    SECTION('2', 'Trigger inventory on public.ventures');

    const trigs = await client.query(`
      SELECT t.tgname,
             t.tgenabled,
             pg_get_triggerdef(t.oid) AS definition,
             p.proname AS func_name,
             n2.nspname AS func_schema
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n2 ON n2.oid = p.pronamespace
      WHERE NOT t.tgisinternal
        AND n.nspname = 'public'
        AND c.relname = 'ventures'
      ORDER BY t.tgname;
    `);
    console.log(trigs.rows);

    sub('2b. function bodies for any trigger function whose name matches ventures or sd_completed or workflow_status');
    if (trigs.rows.length) {
      const fnNames = [...new Set(trigs.rows.map(r => r.func_name))];
      for (const fn of fnNames) {
        const body = await client.query(`
          SELECT n.nspname || '.' || p.proname AS qualified, pg_get_functiondef(p.oid) AS def
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = $1
          LIMIT 5;
        `, [fn]);
        for (const r of body.rows) {
          console.log(`\n--- function: ${r.qualified} ---`);
          console.log(r.def);
        }
      }
    }

    sub('2c. tr_sd_completed_event family (across schemas)');
    const sdComp = await client.query(`
      SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname ILIKE '%sd_completed%'
         OR p.proname ILIKE '%venture_killed%'
         OR p.proname ILIKE '%venture_status%'
         OR p.proname ILIKE '%workflow_status%'
      ORDER BY p.proname;
    `);
    for (const r of sdComp.rows) {
      console.log(`\n--- ${r.schema}.${r.proname} ---`);
      console.log(r.def);
    }

    sub('2d. FK references TO ventures.id (cascade considerations)');
    const fkIn = await client.query(`
      SELECT con.conname,
             cls.relname AS child_table,
             pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cls.relnamespace
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.ventures'::regclass
      ORDER BY cls.relname;
    `);
    console.log(fkIn.rows);

    // ---------- 3. chk_event_type contract on eva_events ----------
    SECTION('3', 'chk_event_type CHECK constraint on eva_events');

    const evt = await client.query(`
      SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cls.relnamespace
      WHERE n.nspname = 'public'
        AND cls.relname = 'eva_events'
        AND con.contype = 'c'
      ORDER BY con.conname;
    `);
    console.log(evt.rows);

    sub('3b. eva_events column inventory');
    const evtCols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='eva_events'
      ORDER BY ordinal_position;
    `);
    console.log(evtCols.rows);

    sub('3c. distinct event_type & event_subtype currently in eva_events (sample)');
    const evtUsed = await client.query(`
      SELECT event_type, COUNT(*) AS n
      FROM public.eva_events
      GROUP BY event_type
      ORDER BY n DESC
      LIMIT 30;
    `);
    console.log(evtUsed.rows);

    // ---------- 4. auth.users PK type ----------
    SECTION('4', 'auth.users PK type');
    const authPk = await client.query(`
      SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'auth.users'::regclass
        AND i.indisprimary;
    `);
    console.log(authPk.rows);

    // ---------- 5. PrivacyPatrol AI venture + chairman uid ----------
    SECTION('5', 'PrivacyPatrol AI backfill resolution');

    sub('5a. ventures table column inventory (look for killed_at / kill_reason)');
    const venCols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures'
      ORDER BY ordinal_position;
    `);
    console.log(venCols.rows);

    sub('5b. PrivacyPatrol AI venture lookup');
    const pp = await client.query(`
      SELECT id, name, workflow_status,
             column_or_null('killed_at') AS killed_at_check,
             updated_at
      FROM (
        SELECT v.*, NULL::text AS column_or_null
        FROM public.ventures v
        WHERE v.name ILIKE '%PrivacyPatrol%'
        LIMIT 5
      ) t;
    `).catch(async (e) => {
      // fallback if column_or_null helper isn't valid; just select * with safe lookup
      sub('5b-alt: simple SELECT * for PrivacyPatrol ventures');
      const r = await client.query(`
        SELECT *
        FROM public.ventures
        WHERE name ILIKE '%PrivacyPatrol%'
        ORDER BY created_at DESC
        LIMIT 5;
      `);
      console.log(r.rows);
      return null;
    });
    if (pp) console.log(pp.rows);

    sub('5c. attempt to read killed_at / kill_reason if columns exist');
    const killCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ventures'
        AND column_name IN ('killed_at','kill_reason','rejected_at','reject_reason','status_reason');
    `);
    console.log('killed/reject columns present:', killCols.rows);

    if (killCols.rows.some(r => r.column_name === 'killed_at')) {
      const killed = await client.query(`
        SELECT id, name, workflow_status, killed_at,
               COALESCE(kill_reason, '') AS kill_reason,
               LENGTH(COALESCE(kill_reason, '')) AS kill_reason_len
        FROM public.ventures
        WHERE killed_at IS NOT NULL
        ORDER BY killed_at DESC
        LIMIT 20;
      `).catch(async () => {
        // kill_reason might not exist
        const r = await client.query(`
          SELECT id, name, workflow_status, killed_at
          FROM public.ventures
          WHERE killed_at IS NOT NULL
          ORDER BY killed_at DESC
          LIMIT 20;
        `);
        return r;
      });
      console.log(killed.rows);
    } else {
      sub('No killed_at column — looking for status_reason / reject_reason / metadata signals on PP venture');
      const ppDetails = await client.query(`
        SELECT id, name, workflow_status, status, updated_at, metadata
        FROM public.ventures
        WHERE name ILIKE '%PrivacyPatrol%'
        LIMIT 5;
      `).catch(async () => {
        const r = await client.query(`
          SELECT *
          FROM public.ventures
          WHERE name ILIKE '%PrivacyPatrol%'
          LIMIT 5;
        `);
        return r;
      });
      console.log(ppDetails.rows);
    }

    sub('5d. chairman lookup by email rickfelix2000@gmail.com');
    const chairman = await client.query(`
      SELECT id, email, raw_user_meta_data->>'role' AS meta_role,
             raw_app_meta_data->>'role' AS app_role,
             created_at
      FROM auth.users
      WHERE email = 'rickfelix2000@gmail.com'
      LIMIT 5;
    `);
    console.log(chairman.rows);

    sub('5e. broader chairman/lead user lookup');
    const roles = await client.query(`
      SELECT id, email, raw_user_meta_data->>'role' AS meta_role,
             raw_app_meta_data->>'role' AS app_role
      FROM auth.users
      WHERE raw_user_meta_data->>'role' IN ('chairman','lead')
         OR raw_app_meta_data->>'role' IN ('chairman','lead')
      ORDER BY created_at
      LIMIT 10;
    `);
    console.log(roles.rows);

    // ---------- 6. RLS pattern survey ----------
    SECTION('6', 'SECURITY DEFINER + auth.jwt() RPC pattern survey');

    const sdRpc = await client.query(`
      SELECT n.nspname AS schema, p.proname,
             pg_get_function_identity_arguments(p.oid) AS args,
             p.prosecdef AS security_definer,
             pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef = true
        AND n.nspname = 'public'
        AND pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
      ORDER BY p.proname
      LIMIT 12;
    `);
    console.log(`Found ${sdRpc.rows.length} SECURITY DEFINER funcs that reference auth.jwt()`);
    for (const r of sdRpc.rows) {
      console.log(`\n--- ${r.schema}.${r.proname}(${r.args}) ---`);
      console.log(r.def.slice(0, 4000));
      if (r.def.length > 4000) console.log(`... [truncated ${r.def.length - 4000} chars]`);
    }

    sub('6b. RLS policies INSERT-restricted to RPC pattern (compare canonical)');
    const pol = await client.query(`
      SELECT schemaname, tablename, policyname, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname='public'
        AND (cmd = 'INSERT' OR cmd = 'ALL')
      ORDER BY tablename, policyname
      LIMIT 25;
    `);
    console.log(pol.rows);

    sub('6c. existing audit-log style tables (for naming convention)');
    const auditTbls = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
        AND (table_name LIKE '%_log' OR table_name LIKE '%_audit' OR table_name LIKE '%_history' OR table_name LIKE '%_events')
      ORDER BY table_name;
    `);
    console.log(auditTbls.rows);

  } finally {
    await client.end();
  }
})().catch(err => {
  console.error('FATAL', err);
  process.exit(1);
});
