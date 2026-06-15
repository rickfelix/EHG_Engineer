#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-2) — refresh the vision BUILD-completeness gauge.
 *
 * Computes the Vision Denominator Registry gauge (lib/vision/vdr-registry.js) and APPENDS a
 * historized snapshot to the vision_build_gauge table (the auditable, trend-able record Adam
 * works down). This is the runtime invoker for the VDR lib + the writer behind the Adam
 * exec-summary's live read and the Chairman-UI tile.
 *
 * Usage:
 *   node scripts/vision-gauge-refresh.mjs            # compute + persist a snapshot
 *   node scripts/vision-gauge-refresh.mjs --dry-run  # compute + print, do NOT write
 *
 * Fail-soft: if the vision doc is unavailable the snapshot is still written with available=false
 * (so the trend honestly records "gauge unavailable" rather than a gap). Exit 0 on success,
 * 1 on a hard DB/compute error.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBuildGauge } from '../lib/vision/vdr-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
// Sibling-repo roots for cross-repo code_grep probes (e.g. the ehg app UI). Absent ⇒ 'unknown'.
const REPO_ROOTS = {
  EHG_Engineer: REPO_ROOT,
  ehg: path.resolve(REPO_ROOT, '..', 'ehg'),
};

/**
 * Portable code-grep seam for the VDR: `git grep` over tracked files (no ripgrep dependency),
 * scoped to a subdir pathspec. Returns { accessible, matched }; accessible=false ⇒ the probe
 * degrades to 'unknown' (honest — never guessed).
 */
function grep(pattern, sub, repo) {
  const root = REPO_ROOTS[repo];
  if (!root || !fs.existsSync(root)) return { accessible: false, matched: false };
  const target = sub ? path.join(root, sub) : root;
  if (!fs.existsSync(target)) return { accessible: false, matched: false };
  try {
    // Exclude archived/dead/test paths so a vocabulary hit there cannot credit a capability
    // (review: 'effort_level' in scripts/archive/* false-credited the fleet-dial capability).
    execFileSync('git', ['-C', root, 'grep', '-lE', pattern, '--', sub || '.',
      ':!**/archive/**', ':!**/__tests__/**', ':!**/*.test.*', ':!**/*.spec.*'],
      { stdio: 'pipe', timeout: 20000 });
    return { accessible: true, matched: true };
  } catch (e) {
    if (e && e.status === 1) return { accessible: true, matched: false };
    return { accessible: false, matched: false };
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[vision-gauge] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);

  let gauge;
  try {
    gauge = await computeBuildGauge({ io: { supabase, grep } });
  } catch (e) {
    console.error('[vision-gauge] compute failed: ' + (e?.message || e));
    process.exit(1);
  }

  const row = {
    overall_pct: gauge.overall_pct,
    available: !!gauge.available,
    per_layer: gauge.per_layer || {},
    components: gauge.components || [],
    denominator: gauge.denominator || 0,
    total_capabilities: gauge.total_capabilities || 0,
    unknown_count: gauge.unknown_count || 0,
    source: 'vdr',
  };

  console.log(`[vision-gauge] available=${row.available} overall=${row.overall_pct == null ? 'n/a' : row.overall_pct + '%'} ` +
    `probeable=${row.denominator}/${row.total_capabilities} unknown=${row.unknown_count}`);
  console.log('[vision-gauge] per_layer=' + JSON.stringify(row.per_layer));
  if (!gauge.coherence?.ok) {
    console.warn('[vision-gauge] WARN registry<->vision drift: ' + JSON.stringify(gauge.coherence));
  }

  if (dryRun) { console.log('[vision-gauge] --dry-run: not persisted'); return; }

  const { error } = await supabase.from('vision_build_gauge').insert(row);
  if (error) {
    // Table may not exist yet (migration not applied) — surface clearly, don't crash silently.
    console.error('[vision-gauge] insert failed (is the migration applied?): ' + error.message);
    process.exit(1);
  }
  console.log('[vision-gauge] snapshot persisted to vision_build_gauge');
}

main().catch((e) => { console.error('[vision-gauge] UNHANDLED: ' + (e?.message || e)); process.exit(1); });
