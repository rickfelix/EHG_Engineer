#!/usr/bin/env node
/**
 * Backfill applications.local_path — SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-2.
 *
 * The path SSOT historically lived only in applications/registry.json; the DB
 * column applications.local_path was NULL for every row, so the DB-first resolver
 * (lib/repo-paths.js::resolveRepoPathDbFirst) and vw_venture_registry returned NULL
 * and venture work silently routed to the EHG_Engineer fallback. This one-time,
 * idempotent backfill populates the column so the DB becomes the authoritative
 * source while registry.json remains the in-lockstep fallback.
 *
 * Resolution order per active application with a NULL local_path:
 *   1. EHG_Engineer self  -> ENGINEER_ROOT
 *   2. registry.json match (by normalizeAppName) with a local_path -> that path
 *   3. convention -> <parent-of-ENGINEER_ROOT>/<kebab(name)>  (matches
 *      venture-provisioner.resolveVentureMetadata, portable across machines)
 *
 * Idempotent: only rows where local_path IS NULL are touched. Re-running is a no-op.
 *
 * Usage:
 *   node scripts/backfill-applications-local-path.mjs [--dry-run]
 */
import { readFileSync } from 'fs';
import path from 'path';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { ENGINEER_ROOT, normalizeAppName } from '../lib/repo-paths.js';

const DRY_RUN = process.argv.includes('--dry-run');

// ENGINEER_ROOT is derived from the module's own location, so when this runs from
// inside a `.worktrees/<sd>` checkout it points at the worktree, not the canonical
// main repo. Strip the worktree suffix so the derived clone paths match what the
// venture-provisioner writes from the main repo (sibling of EHG_Engineer), keeping
// the DB column in lockstep regardless of where the backfill is invoked.
function canonicalMainRoot() {
  const root = ENGINEER_ROOT.replace(/\\/g, '/');
  const idx = root.indexOf('/.worktrees/');
  return idx === -1 ? root : root.slice(0, idx);
}
const MAIN_ROOT = canonicalMainRoot();
const PARENT_DIR = path.resolve(MAIN_ROOT, '..');
const REGISTRY_PATH = path.resolve(MAIN_ROOT, 'applications', 'registry.json');

function kebab(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function loadRegistryByNormalizedName() {
  const byNorm = new Map();
  try {
    const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    for (const app of Object.values(reg.applications || {})) {
      if (app.name && app.local_path) byNorm.set(normalizeAppName(app.name), app.local_path);
    }
  } catch { /* registry unreadable — convention-only */ }
  return byNorm;
}

function deriveLocalPath(name, registryByNorm) {
  const norm = normalizeAppName(name);
  if (norm === 'ehgengineer') return MAIN_ROOT;
  const fromRegistry = registryByNorm.get(norm);
  if (fromRegistry) return fromRegistry.replace(/\\/g, '/');
  return path.resolve(PARENT_DIR, kebab(name)).replace(/\\/g, '/');
}

async function main() {
  const sb = await createSupabaseServiceClient('engineer');
  const registryByNorm = loadRegistryByNormalizedName();

  const { data: apps, error } = await sb
    .from('applications')
    .select('id, name, local_path, status')
    .eq('status', 'active');
  if (error) { console.error('[backfill] query failed:', error.message); process.exit(1); }

  const targets = (apps || []).filter((a) => !a.local_path);
  console.log(`[backfill] ${apps?.length ?? 0} active applications, ${targets.length} with NULL local_path${DRY_RUN ? ' (dry-run)' : ''}`);

  let updated = 0;
  for (const app of targets) {
    const localPath = deriveLocalPath(app.name, registryByNorm);
    console.log(`  ${app.name.padEnd(22)} -> ${localPath}`);
    if (!DRY_RUN) {
      const { error: upErr } = await sb.from('applications').update({ local_path: localPath }).eq('id', app.id);
      if (upErr) console.error(`    WARN update failed: ${upErr.message}`);
      else updated++;
    }
  }
  console.log(`[backfill] ${DRY_RUN ? 'would update' : 'updated'} ${DRY_RUN ? targets.length : updated} row(s)`);
  process.exit(0);
}

main().catch((e) => { console.error('[backfill] fatal:', e.message); process.exit(1); });
