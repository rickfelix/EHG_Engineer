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
