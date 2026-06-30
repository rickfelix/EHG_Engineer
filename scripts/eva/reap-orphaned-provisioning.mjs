#!/usr/bin/env node
/**
 * Periodic orphaned-provisioning reaper (FR-3, defense-in-depth).
 * SD-LEO-INFRA-VENTURE-PROVISIONING-NAME-COLLISION-001.
 *
 * Thin CLI over lib/eva/bridge/reap-orphaned-provisioning.js — single source of truth (no
 * duplicated logic). DRY-RUN BY DEFAULT; pass --apply to actually delete/terminalize.
 *
 *   node scripts/eva/reap-orphaned-provisioning.mjs           # dry-run: report counts only
 *   node scripts/eva/reap-orphaned-provisioning.mjs --apply   # delete stale rows + cancel orphaned trees
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { reapOrphanedProvisioning } from '../../lib/eva/bridge/reap-orphaned-provisioning.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const summary = await reapOrphanedProvisioning({ supabase, dryRun: !APPLY, log: (m) => console.log(m) });
  console.log(`\n=== reap-orphaned-provisioning ${APPLY ? '(APPLIED)' : '(dry-run — pass --apply to mutate)'} ===`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error('reaper failed:', e?.message || e); process.exitCode = 1; });
