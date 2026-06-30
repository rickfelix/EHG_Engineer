#!/usr/bin/env node
/**
 * Periodic clone-tree-exclusion reconciliation runner (FR-2 CLI).
 * SD-LEO-INFRA-CLONE-TREE-EXCLUSION-FAIL-OPEN-LEAK-001.
 *
 * Thin CLI over lib/coordinator/reconcile-clone-tree-exclusion.js (single source of truth).
 * DRY-RUN BY DEFAULT; pass --apply to mutate.
 *
 *   node scripts/coordinator/reconcile-clone-tree-exclusion.mjs           # report counts only
 *   node scripts/coordinator/reconcile-clone-tree-exclusion.mjs --apply   # mark leaked clones + un-mark wrongly-marked real ventures
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { reconcileCloneTreeExclusion } from '../../lib/coordinator/reconcile-clone-tree-exclusion.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const summary = await reconcileCloneTreeExclusion({ supabase, dryRun: !APPLY, log: (m) => console.log(m) });
  console.log(`\n=== reconcile-clone-tree-exclusion ${APPLY ? '(APPLIED)' : '(dry-run — pass --apply to mutate)'} ===`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error('reconcile failed:', e?.message || e); process.exitCode = 1; });
