#!/usr/bin/env node
/**
 * vision-coherence-check — SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001 (FR-4).
 *
 * Runs the ladder/roadmap coherence assertion EVERY CI run (and on demand locally) so placement /
 * wave↔rung drift is caught the moment it lands, not only on human inspection. FAIL-SOFT by design:
 * advisory drift emits a loud ::warning:: but NEVER fails the build (exit 0). The only thing that
 * would be a hard problem — registry↔vision drift — already withholds the live gauge separately; this
 * check surfaces it too but does not gate CI on it (advisory posture, matching the gauge's own
 * advisory-only ladder_coherence). Run: `npm run vision:coherence`.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeBuildGauge } from '../lib/vision/vdr-registry.js';
import { makeDefaultGrepSeam } from '../lib/vision/vdr-grep-seam.js';

const warn = (m) => process.stdout.write(`::warning::[vision-coherence] ${m}\n`);
const log = (m) => process.stdout.write(`[vision-coherence] ${m}\n`);

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    warn('no Supabase credentials — skipping coherence check (fail-soft)');
    return;
  }
  let gauge;
  try {
    const db = createClient(url, key);
    gauge = await computeBuildGauge({ io: { supabase: db, grep: makeDefaultGrepSeam() }, visionSource: true });
  } catch (e) {
    warn(`gauge compute failed (fail-soft, not failing CI): ${e && e.message ? e.message : e}`);
    return;
  }

  if (!gauge || gauge.available === false) {
    // Registry↔vision drift (or an unmeasurable gauge) — surfaced, but this script stays advisory.
    warn(`gauge unavailable / registry drift: ${gauge && gauge.measured_at_note ? gauge.measured_at_note : 'unknown'}`);
  }

  const lc = (gauge && gauge.ladder_coherence) || { advisories: [] };
  const advisories = Array.isArray(lc.advisories) ? lc.advisories : [];
  if (advisories.length === 0) {
    log('OK — no ladder/roadmap placement or wave↔rung drift detected.');
  } else {
    warn(`${advisories.length} ladder/roadmap advisory finding(s):`);
    for (const a of advisories) warn(`  - ${a}`);
  }
  log(`gauge: available=${gauge && gauge.available} overall=${gauge && gauge.overall_pct}% build=${gauge && gauge.build_pct}% operational=${gauge && gauge.operational_pct}%`);
}

main().then(() => process.exit(0)).catch((e) => {
  // Absolute backstop: never fail CI on this advisory check.
  warn(`unexpected error (fail-soft): ${e && e.message ? e.message : e}`);
  process.exit(0);
});
