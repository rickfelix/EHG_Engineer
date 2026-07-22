#!/usr/bin/env node
/**
 * Backfill real-build provenance — one-time, dry-run-DEFAULT, REVERSIBLE, ZERO-DDL.
 * SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-A (Part 1, FR-4).
 *
 * Sweeps ACTIVE, GENUINE (non-fixture) ventures for the stage-gauge-vs-real-build divergence
 * (see lib/governance/real-build-discriminator.mjs) and reversibly annotates each divergent
 * venture under metadata.build_provenance. It NEVER touches current_lifecycle_stage or status —
 * the annotation is a namespaced jsonb merge, fully reversible by clearing the key.
 *
 * Usage:
 *   node scripts/one-time/backfill-real-build-provenance.mjs           # DRY-RUN (default): print divergent table + count, ZERO writes
 *   node scripts/one-time/backfill-real-build-provenance.mjs --apply   # reversibly merge metadata.build_provenance on each divergent venture
 *
 * Idempotent: re-running --apply overwrites metadata.build_provenance with a fresh assessment
 * (same divergence => same shape, new assessed_at). Fixtures are EXCLUDED via the canonical
 * isFixtureVenture predicate — only genuine ventures are annotated.
 *
 * @wire-check-exempt: one-time backfill CLI under scripts/one-time/ — no permanent runtime entry
 *   point by design (mirrors scripts/archive/one-time/soft-archive-fixture-ventures.mjs).
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { isFixtureVenture } from '../../lib/governance/fixture-exclusion.mjs';
import { assessRealBuildDivergence } from '../../lib/governance/real-build-discriminator.mjs';

/** Parse CLI args → { apply }. Defaults to dry-run (apply=false). */
export function parseArgs(argv = []) {
  return { apply: argv.includes('--apply') };
}

/**
 * Pure: from a set of venture rows, select the GENUINE (non-fixture) ones whose stage gauge
 * diverges from real-build state. Returns [{ v, assessment }] for reporting/annotation.
 */
export function selectDivergent(ventures) {
  const out = [];
  for (const v of ventures || []) {
    if (isFixtureVenture(v)) continue; // only annotate genuine ventures
    const assessment = assessRealBuildDivergence(v);
    if (assessment.divergent) out.push({ v, assessment });
  }
  return out;
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const supabase = createClient(url, key);

  // Load ALL active ventures, paginated (ventures is a portfolio table that grows — never
  // trust a single ≤1000-row page: SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001).
  const ventures = await fetchAllPaginated(() => supabase
    .from('ventures')
    .select('id, name, status, current_lifecycle_stage, launch_mode, deployment_url, repo_url, workflow_started_at, is_demo, metadata')
    .eq('status', 'active')
    .order('id', { ascending: true }));

  const divergent = selectDivergent(ventures);

  console.log(`\n── Backfill real-build provenance (${apply ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`   active ventures scanned: ${ventures.length}`);
  console.log(`   divergent (genuine):     ${divergent.length}`);
  console.log('');
  console.log('   id                                     stage  launch_mode  name');
  for (const { v } of divergent) {
    console.log(`   ${String(v.id).padEnd(38)} ${String(v.current_lifecycle_stage).padStart(5)}  ${String(v.launch_mode).padEnd(11)}  ${v.name}`);
  }

  if (divergent.length === 0) {
    console.log('\n   No divergent genuine ventures — nothing to annotate. ✅');
    return;
  }

  if (!apply) {
    console.log('\n   DRY-RUN — zero writes. Re-run with --apply to reversibly annotate metadata.build_provenance. ✅');
    return;
  }

  // ── APPLY: reversible namespaced jsonb merge (read row metadata, spread, set build_provenance) ──
  const assessed_at = new Date().toISOString();
  const affectedIds = [];
  for (const { v, assessment } of divergent) {
    const nextMetadata = {
      ...(v.metadata && typeof v.metadata === 'object' ? v.metadata : {}),
      build_provenance: {
        real_build_started: assessment.real_build_started,
        divergent: assessment.divergent,
        annotation: assessment.annotation,
        assessed_at,
      },
    };
    // NEVER touch current_lifecycle_stage or status — metadata-only, reversible annotation.
    const { error } = await supabase
      .from('ventures')
      .update({ metadata: nextMetadata })
      .eq('id', v.id);
    if (error) throw new Error(`annotate ${v.id} failed: ${error.message}`);
    affectedIds.push(v.id);
    console.log(`   annotated ${v.id} (${v.name})`);
  }

  console.log(`\n   ✅ Annotated ${affectedIds.length} venture(s) with metadata.build_provenance (stage/status untouched).`);
  console.log('\n   ── ROLLBACK RECIPE (clears the annotation on each id) ──');
  console.log(`   UPDATE ventures SET metadata = metadata - 'build_provenance' WHERE id IN (${affectedIds.map((id) => `'${id}'`).join(', ')});`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
