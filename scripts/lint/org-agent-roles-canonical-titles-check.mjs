#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STOP-ORG-ROLE-001 (E2, success criterion): live CI check asserting zero
 * canonical role titles in org_agent_roles carry a venture name. Reads the LIVE table
 * (read-only) and asserts each known role_key's title matches the canonical, venture-agnostic
 * form computed by lib/org/canonical-role-titles.mjs -- the same source the fixed
 * lib/org/factory-identity-fold.cjs uses on a role_key's first-ever insert, so drift here
 * means either a regression in the fold or a new, unaudited writer to this table.
 *
 * Exit 0: every known role_key is present with a canonical title.
 * Exit 1: at least one drifted or MISSING -- prints role_key/current/expected for each.
 * Exit 2: could not reach the database (treated as a non-blocking INFRA warning by the
 *         calling workflow, matching this repo's migration-deploy-drift-guard.yml convention
 *         -- a real DB outage must never red-X main, only a genuine drift may).
 *
 * VALIDATION finding (LEAD-TO-PLAN, evidence 5363c1ea): the drift check alone iterates only
 * the rows the table RETURNS, so an emptied/truncated table would read as a false green
 * (0 rows checked, 0 drifted). `missing` below closes that coverage gap by asserting every
 * role_key the current template defines actually has a row.
 *
 * Usage: node scripts/lint/org-agent-roles-canonical-titles-check.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeCanonicalRoleTitles } from '../../lib/org/canonical-role-titles.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export async function checkCanonicalTitles(supabase) {
  const canonical = computeCanonicalRoleTitles();
  const { data, error } = await supabase.from('org_agent_roles').select('role_key, title');
  if (error) throw new Error(`org_agent_roles select failed: ${error.message}`);

  const seen = new Set();
  const drifted = [];
  for (const row of data || []) {
    seen.add(row.role_key);
    const expected = canonical.get(row.role_key);
    if (expected === undefined) continue; // not a role this template currently defines
    if (row.title !== expected) {
      drifted.push({ role_key: row.role_key, current_title: row.title, expected_title: expected });
    }
  }

  const missing = [];
  for (const [roleKey, expected] of canonical) {
    if (!seen.has(roleKey)) missing.push({ role_key: roleKey, expected_title: expected });
  }

  return { checked: data ? data.length : 0, expected_count: canonical.size, drifted, missing };
}

async function run() {
  let supabase;
  try {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      console.error('MISCONFIG: no Supabase credential available.');
      process.exitCode = 2;
      return;
    }
  } catch (e) {
    console.error(`MISCONFIG: ${e.message}`);
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = await checkCanonicalTitles(supabase);
  } catch (e) {
    console.error(`INFRA: ${e.message}`);
    process.exitCode = 2;
    return;
  }

  if (result.drifted.length === 0 && result.missing.length === 0) {
    console.log(`[ORG_AGENT_ROLES_CANONICAL_TITLES_OK] ${result.checked}/${result.expected_count} role(s) present, 0 drifted.`);
    return;
  }

  if (result.drifted.length > 0) {
    console.error(`[ORG_AGENT_ROLES_CANONICAL_TITLES_DRIFT] ${result.drifted.length} role(s) drifted from their canonical title:`);
    for (const d of result.drifted) {
      console.error(`  ${d.role_key}: "${d.current_title}" (expected "${d.expected_title}")`);
    }
  }
  if (result.missing.length > 0) {
    console.error(`[ORG_AGENT_ROLES_CANONICAL_TITLES_MISSING] ${result.missing.length} known role_key(s) have no row at all:`);
    for (const m of result.missing) {
      console.error(`  ${m.role_key} (expected "${m.expected_title}")`);
    }
  }
  console.error('\nRepair drift with: node scripts/one-off/restore-org-agent-roles-canonical-titles.mjs --execute');
  process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  run();
}
