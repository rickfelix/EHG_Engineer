#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STOP-ORG-ROLE-001: one-time repair of the 28/33 org_agent_roles rows a prior
 * venture-factory test run clobbered with a venture-named title (e.g. "TEST-59732e35fc-SD-A
 * CEO" instead of "CEO"), via lib/org/factory-identity-fold.cjs's pre-fix bug (it upserted
 * agentData.display_name -- a per-venture string -- as the SHARED role registry's title).
 *
 * Restores each row's title to the canonical, venture-agnostic form computed by
 * lib/org/canonical-role-titles.mjs -- the SAME derivation the fixed fold now uses on a
 * role_key's first-ever insert, so this script and the runtime fix can never drift apart.
 *
 * Dry-run by default (prints the planned before/after diff, writes nothing). Pass --execute
 * to apply. Idempotent: re-running after a successful --execute finds zero targets.
 *
 * Usage:
 *   node scripts/one-off/restore-org-agent-roles-canonical-titles.mjs           # dry-run
 *   node scripts/one-off/restore-org-agent-roles-canonical-titles.mjs --execute # apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeCanonicalRoleTitles } from '../../lib/org/canonical-role-titles.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { assertNotCapTruncated } from '../../lib/db/fetch-all-paginated.mjs';

const EXECUTE = process.argv.includes('--execute');

export async function findRepairTargets(supabase) {
  const canonical = computeCanonicalRoleTitles();
  // count-truncation-diff-lint (count-truncation-discipline): see the matching comment in
  // scripts/lint/org-agent-roles-canonical-titles-check.mjs -- same table, same reasoning.
  const { data, error } = await supabase.from('org_agent_roles').select('role_key, title').limit(500);
  if (error) throw new Error(`org_agent_roles select failed: ${error.message}`);
  assertNotCapTruncated(data, { cap: 500, site: 'restore-org-agent-roles-canonical-titles' });

  const targets = [];
  for (const row of data || []) {
    const expected = canonical.get(row.role_key);
    if (expected === undefined) continue; // role_key not in the current template -- not this script's concern
    if (row.title !== expected) {
      targets.push({ role_key: row.role_key, current_title: row.title, expected_title: expected });
    }
  }
  return targets;
}

export async function run() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const targets = await findRepairTargets(supabase);
  if (targets.length === 0) {
    console.log('Nothing to repair — every canonical role title already matches the template.');
    return;
  }

  console.log(`Found ${targets.length} row(s) with a non-canonical title:`);
  for (const t of targets) {
    console.log(`  ${t.role_key}: "${t.current_title}" -> "${t.expected_title}"`);
  }

  if (!EXECUTE) {
    console.log('\nDry-run only. Re-run with --execute to apply.');
    return;
  }

  let updated = 0;
  for (const t of targets) {
    const { error, count } = await supabase
      .from('org_agent_roles')
      .update({ title: t.expected_title }, { count: 'exact' })
      .eq('role_key', t.role_key)
      .eq('title', t.current_title); // CAS: only overwrite the exact value we read
    if (error) {
      console.error(`  FAILED ${t.role_key}: ${error.message}`);
      continue;
    }
    if (count !== 1) {
      console.error(`  SKIPPED ${t.role_key}: expected to affect 1 row, affected ${count} (concurrent write? re-run to re-check)`);
      continue;
    }
    updated += 1;
  }

  console.log(`\nUpdated ${updated}/${targets.length} row(s).`);

  const remaining = await findRepairTargets(supabase);
  if (remaining.length === 0) {
    console.log('Confirmed: all canonical role titles now match the template.');
  } else {
    console.error(`GATE: ${remaining.length} row(s) still non-canonical after repair:`, remaining);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
