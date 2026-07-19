/**
 * SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 (FR-5, TS-4/TS-5).
 *
 * Guards against the incident class this SD fixed reappearing silently: an unscoped
 * `.is('promoted_to_sd_key', null)` remainder-aggregation read against roadmap_wave_items,
 * reintroduced into one of the 6 consumers this SD repointed to v_plan_of_record_remainder.
 *
 * Deliberately idiom- and file-scoped (not a repo-wide grep) -- the same literal idiom
 * appears legitimately elsewhere (one-off backfill idempotency guards, sourcing-engine
 * staging queries), so a blanket scan would false-positive. This guard only reads the
 * curated file lists below, mirroring the venture-stack-compliance test idiom: assert the
 * post-fix tree compliant, inject a synthetic drift string and assert red, remove it and
 * assert green again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

// FR-3: repointed to v_plan_of_record_remainder by this SD -- must never regress to the
// unscoped roadmap_wave_items remainder idiom.
const REPOINTED_CONSUMER_FILES = [
  'scripts/adam-startup-check.mjs',
  'scripts/coordinator-capacity-forecast.mjs',
  'scripts/coordinator-charter-audit.mjs',
  'scripts/modules/sd-next/data-loaders.js',
  'lib/roadmap/plan-check-status.js',
  'lib/chairman/daily-review/roadmap-status-doc.js',
];

// FR-4: legitimate promoted-item / full-status readers of roadmap_wave_items, explicitly
// EXEMPT from the remainder view (repointing any of these would silently break them):
//  - coordinator-backlog-rank.mjs: buildSdRungMap needs PROMOTED items for needle scoring
//  - gauge-runner.mjs: promoted-item velocity/time-horizon gauge (opposite of a remainder gauge)
//  - plan-drift-detectors.js: same promoted-item drift-gauge pattern
//  - wave-linkage-coverage.js: WAVE_LINKAGE_STARVATION gauge (0% is a designed signal)
//  - roadmap-status.js: deliberate full diagnostic across ALL wave generations/statuses
const EXEMPT_FILES = [
  'scripts/coordinator-backlog-rank.mjs',
  'scripts/gauge-runner.mjs',
  'lib/governance/plan-drift-detectors.js',
  'lib/roadmap/wave-linkage-coverage.js',
  'scripts/roadmap-status.js',
];

// The exact bypass idiom this SD eliminated: an unscoped "unpromoted" remainder read.
// The 5 exempt files above only ever use the OPPOSITE direction (.not(...,'is', null) --
// promoted items), so this pattern is safe to check against them too without false-positiving.
const UNSCOPED_REMAINDER_IDIOM = /\.is\(\s*['"]promoted_to_sd_key['"]\s*,\s*null\s*\)/;

function readRepoFile(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('plan-of-record-remainder grep-guard (FR-5)', () => {
  it('TS-5: stays green -- none of the 6 repointed consumers contain the unscoped remainder idiom', () => {
    for (const relPath of REPOINTED_CONSUMER_FILES) {
      const text = readRepoFile(relPath);
      expect(UNSCOPED_REMAINDER_IDIOM.test(text), `${relPath} should not contain the unscoped remainder idiom`).toBe(false);
    }
  });

  it('TS-5: stays green -- the guard does not false-positive against the 5 FR-4 exempt files', () => {
    for (const relPath of EXEMPT_FILES) {
      const text = readRepoFile(relPath);
      expect(UNSCOPED_REMAINDER_IDIOM.test(text), `${relPath} (exempt) should not trip the guard`).toBe(false);
    }
  });

  it('TS-4: reds when the unscoped bypass idiom is reintroduced into a repointed consumer', () => {
    const original = readRepoFile('scripts/coordinator-charter-audit.mjs');
    expect(UNSCOPED_REMAINDER_IDIOM.test(original)).toBe(false);

    const drifted = `${original}\n// synthetic regression: supabase.from('roadmap_wave_items').select('id').is('promoted_to_sd_key', null);\n`;
    expect(UNSCOPED_REMAINDER_IDIOM.test(drifted)).toBe(true);
  });
});
