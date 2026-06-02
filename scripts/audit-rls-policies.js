/**
 * RLS Policy Audit Tool
 *
 * Audits Row-Level Security policies across all tables in the public schema.
 * Reports coverage, missing policies, and potential security gaps.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-J
 *
 * Usage: node scripts/audit-rls-policies.js [--json]
 *
 * NOTE: queries pg_catalog/pg_policies directly over a pg connection because
 * PostgREST does not expose the catalog. (The previous supabase-js `exec_sql`
 * RPC path was dead — the function does not exist. 2026-06-02.) In CI, pass
 * the connection via the SUPABASE_POOLER_URL secret; locally it falls back to
 * SUPABASE_DB_PASSWORD. See also scripts/sentinels/audit-security-linter.mjs.
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

const JSON_MODE = process.argv.includes('--json');

function log(msg = '') {
  if (!JSON_MODE) console.log(msg);
}

// Tables that are intentionally public or service-role only
const EXEMPTED_TABLES = new Set([
  'schema_migrations',
  'spatial_ref_sys',
]);

async function getRlsPolicies(client) {
  try {
    const res = await client.query(`
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);
    return { data: res.rows, error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

async function getRlsEnabledTables(client) {
  try {
    const res = await client.query(`
      SELECT
        relname as tablename,
        relrowsecurity as rls_enabled,
        relforcerowsecurity as rls_forced
      FROM pg_class
      WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND relkind = 'r'
      ORDER BY relname
    `);
    return { data: res.rows, error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

async function main() {
  // 'engineer' matches scripts/apply-migration.js (the consolidated instance).
  // connectionString (SUPABASE_POOLER_URL) wins in CI; locally it falls back to
  // building from SUPABASE_DB_PASSWORD.
  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL,
  });

  try {
    log('');
    log('='.repeat(60));
    log('  RLS POLICY AUDIT');
    log('='.repeat(60));

    const { data: tables, error: tablesErr } = await getRlsEnabledTables(client);
    if (tablesErr) {
      console.error('Failed to get tables:', tablesErr);
      process.exitCode = 1;
      return;
    }

    const { data: policies, error: policiesErr } = await getRlsPolicies(client);
    if (policiesErr) {
      console.error('Failed to get policies:', policiesErr);
      process.exitCode = 1;
      return;
    }

    // Build policy map
    const policyMap = new Map();
    for (const p of policies) {
      if (!policyMap.has(p.tablename)) policyMap.set(p.tablename, []);
      policyMap.get(p.tablename).push(p);
    }

    // Categorize tables
    const rlsEnabled = [];
    const rlsDisabled = [];
    const withPolicies = [];
    const withoutPolicies = [];

    for (const t of tables) {
      const exempt = EXEMPTED_TABLES.has(t.tablename);
      if (exempt) continue;

      if (t.rls_enabled) {
        rlsEnabled.push(t.tablename);
        if (policyMap.has(t.tablename)) {
          withPolicies.push(t.tablename);
        } else {
          withoutPolicies.push(t.tablename);
        }
      } else {
        rlsDisabled.push(t.tablename);
      }
    }

    const totalTables = rlsEnabled.length + rlsDisabled.length;
    const coverage = totalTables > 0 ? Math.round((rlsEnabled.length / totalTables) * 100) : 0;

    // Report
    log('');
    log('  Summary');
    log('  ' + '-'.repeat(40));
    log(`  Total tables:        ${totalTables}`);
    log(`  RLS enabled:         ${rlsEnabled.length} (${coverage}%)`);
    log(`  RLS disabled:        ${rlsDisabled.length}`);
    log(`  With policies:       ${withPolicies.length}`);
    log(`  Without policies:    ${withoutPolicies.length}`);
    log(`  Total policies:      ${policies.length}`);

    if (rlsDisabled.length > 0) {
      log('');
      log('  Tables WITHOUT RLS (security gap)');
      log('  ' + '-'.repeat(40));
      for (const t of rlsDisabled.slice(0, 20)) {
        const hasPolicies = policyMap.has(t) ? ' (has policies but RLS disabled!)' : '';
        log(`  - ${t}${hasPolicies}`);
      }
      if (rlsDisabled.length > 20) {
        log(`  ... and ${rlsDisabled.length - 20} more`);
      }
    }

    if (withoutPolicies.length > 0) {
      log('');
      log('  RLS enabled but NO policies defined');
      log('  ' + '-'.repeat(40));
      for (const t of withoutPolicies) {
        log(`  - ${t} (all access blocked!)`);
      }
    }

    // Policy details for tables with policies
    if (withPolicies.length > 0) {
      log('');
      log('  Policy Coverage Detail (first 10)');
      log('  ' + '-'.repeat(40));
      for (const t of withPolicies.slice(0, 10)) {
        const tablePolicies = policyMap.get(t) || [];
        const cmds = [...new Set(tablePolicies.map(p => p.cmd))].join(', ');
        log(`  ${t}: ${tablePolicies.length} policies (${cmds})`);
      }
    }

    log('');
    log('='.repeat(60));

    if (JSON_MODE) {
      const output = {
        coverage,
        totalTables,
        rlsEnabled: rlsEnabled.length,
        rlsDisabled: rlsDisabled.length,
        withPolicies: withPolicies.length,
        withoutPolicies: withoutPolicies.length,
        totalPolicies: policies.length,
        gaps: rlsDisabled,
        enabledButNoPolicies: withoutPolicies,
      };
      console.log(JSON.stringify(output, null, 2));
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Audit error:', err.message);
  process.exitCode = 1;
});
