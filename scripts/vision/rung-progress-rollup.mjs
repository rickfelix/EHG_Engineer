#!/usr/bin/env node
// Rung/KR progress rollup CLI — SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-B (FR-1).
//
// Populates roadmap_waves.progress_pct type-aware by REUSING computeBuildGauge (build rungs) and
// key_results progress (outcome rungs). DRY-RUN by default; pass --apply to persist.
//
// Usage:
//   node scripts/vision/rung-progress-rollup.mjs            # dry-run report
//   node scripts/vision/rung-progress-rollup.mjs --apply    # persist progress_pct
//
// Fail-soft: a hiccup degrades to an empty/unknown result, never a fabricated %.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeBuildGauge } from '../../lib/vision/vdr-registry.js';
import { makeDefaultGrepSeam } from '../../lib/vision/vdr-grep-seam.js';
import { runRollup } from '../../lib/vision/rung-progress-rollup.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';

// SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 (FR-3): applied runs are a registered,
// owned periodic process (P6 regime) — self-register the registry row and
// stamp last_fired_at each run so the liveness watcher sees it and the
// refresher can never go dormant invisibly. Idempotent upsert.
const PROCESS_KEY = 'wave-progress-refresher';
const EXPECTED_INTERVAL_SECONDS = 6 * 60 * 60; // 6h cadence (wave-progress-refresher.yml)

async function ensureRegistryAndStamp(supabase) {
  try {
    const { error } = await supabase.from('periodic_process_registry').upsert({
      process_key: PROCESS_KEY,
      display_name: 'Wave progress refresher (rung rollup --apply)',
      owner: 'vision-rollup',
      process_type: 'standalone_cron',
      expected_interval_seconds: EXPECTED_INTERVAL_SECONDS,
      liveness_source: 'self_stamped',
      liveness_source_ref: { workflow: '.github/workflows/wave-progress-refresher.yml', sd_key: 'SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001' },
      session_bound: false,
      currently_expected_active: true,
    }, { onConflict: 'process_key' });
    if (error) throw new Error(error.message);
    await stampLastFired(supabase, PROCESS_KEY);
    console.log(`  [liveness] ${PROCESS_KEY} registered + last_fired_at stamped`);
  } catch (err) {
    // Loud but non-fatal: the rollup itself succeeded; a missing stamp surfaces
    // as UNVERIFIED/OVERDUE on the liveness watcher rather than a lost run.
    console.error(`  [liveness] WARN: registry stamp failed for ${PROCESS_KEY}: ${err.message}`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[rung-rollup] missing Supabase creds'); process.exit(1); }
  const supabase = createClient(url, key);
  const grep = makeDefaultGrepSeam({ engineerRoot: process.cwd() });
  const computeGaugeFn = () => computeBuildGauge({ io: { supabase, grep }, visionSource: true });

  const res = await runRollup({ supabase, computeGaugeFn, apply });
  if (!res.ok) { console.error('[rung-rollup] ERROR:', res.error); process.exit(1); }

  if (apply) await ensureRegistryAndStamp(supabase);

  console.log(`\n  Active build rung: ${res.activeRungKey} | build gauge: ${res.gaugeBuildPct}%`);
  console.log(`  ${apply ? 'APPLIED' : 'DRY-RUN (pass --apply to persist)'} — wrote ${res.written} row(s)\n`);
  for (const r of res.rows) {
    const pct = r.progress_pct == null ? '  —' : `${String(r.progress_pct).padStart(3)}%`;
    console.log(`  ${pct}  [${(r.type || 'skip').padEnd(7)}] ${(r.rung_key || '--').padEnd(3)}  ${(r.title || '').slice(0, 42).padEnd(42)}  ${r.reason}`);
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[rung-rollup] fatal:', e?.message || e); process.exit(1); });
}
