#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-6, TS-16): mechanically enforces "No migration
 * file, DDL statement, or schema change of any kind is included in this SD's diff" -- a
 * scripted check rather than a reviewer's eyeball. Compares the current branch's changed
 * files against origin/main for anything under database/migrations/** or supabase/**.
 */
import { execFileSync } from 'node:child_process';

const changed = execFileSync('git', ['diff', '--name-only', 'origin/main'], { encoding: 'utf8' })
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const ddlPaths = changed.filter((f) => f.startsWith('database/migrations/') || f.startsWith('supabase/'));

if (ddlPaths.length > 0) {
  console.error('❌ DDL/migration files found in this SD\'s diff (FR-6 forbids this):');
  ddlPaths.forEach((f) => console.error(`   - ${f}`));
  process.exit(1);
}

console.log(`✅ No DDL/migration files in diff (${changed.length} files changed, checked against origin/main).`);
