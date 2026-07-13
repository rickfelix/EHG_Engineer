/**
 * SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3, TS-4) -- static wiring coverage over the ~29
 * distinct scripts backing the 26 standard_loop:* registry rows plus the 4 cron_script:* rows
 * with a real GHA invoker (per PLAN-phase investigation). Asserts each script's SOURCE references
 * stampLastFired and its correct process_key literal(s), rather than actually executing 29
 * fleet-coordination scripts (which would fire real DB writes / session messages) -- pattern
 * mirrors tests/unit/cron/venture-ops-actuals-wiring.test.js.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function src(relPath) {
  const full = path.join(repoRoot, relPath);
  expect(fs.existsSync(full), `missing instrumented script: ${relPath}`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

// file -> process_key(s) it must reference alongside a stampLastFired call.
const STANDARD_LOOP_SCRIPTS = {
  'scripts/stale-session-sweep.cjs': ['standard_loop:sweep'],
  'scripts/coordinator-quiet-tick.mjs': ['standard_loop:quiet-tick'],
  'scripts/fleet-dashboard.cjs': ['standard_loop:dashboard', 'standard_loop:inbox'],
  'scripts/assign-fleet-identities.cjs': ['standard_loop:identity'],
  'scripts/coordinator-audit.mjs': ['standard_loop:audit'],
  'scripts/coordinator-charter-audit.mjs': ['standard_loop:charter-audit'],
  'scripts/flag-governance-review.mjs': ['standard_loop:flag-review'],
  'scripts/coordinator-self-review.mjs': ['standard_loop:self-review'],
  'scripts/coordinator-hourly-review.cjs': ['standard_loop:hourly-review'],
  'scripts/coordinator-capacity-forecast.mjs': ['standard_loop:capacity-forecast'],
  'scripts/coordinator-backlog-rank.mjs': ['standard_loop:backlog-rank'],
  'scripts/gauge-unranked-claimable-leaves.mjs': ['standard_loop:unranked-gauge'],
  'scripts/singleton-relaunch-scheduler.mjs': ['standard_loop:singleton-relaunch'],
  'scripts/coordinator-relay-drain.cjs': ['standard_loop:relay-drain'],
  'scripts/coordinator-relay-drop-gauge.cjs': ['standard_loop:relay-drop-gauge'],
  'scripts/coordinator-fleet-retro.mjs': ['standard_loop:fleet-retro'],
  'scripts/row-growth-snapshot.cjs': ['standard_loop:row-growth'],
  'scripts/subsystem-review-rotation.cjs': ['standard_loop:review-rotation'],
  'scripts/scripts-reachability-gauge.mjs': ['standard_loop:scripts-reachability'],
  'scripts/retention-enforce.js': ['standard_loop:retention'],
  'scripts/coordinator-startup-check.mjs': ['standard_loop:roles-review'],
  'scripts/gauge-runner.mjs': ['standard_loop:gauge-runner'],
  'scripts/coordinator-feedback-sla-gauge.cjs': ['standard_loop:feedback-sla'],
  'scripts/solomon-ledger-pending-resurface.cjs': ['standard_loop:solomon-ledger-resurface'],
  'scripts/periodic-liveness-watcher.mjs': ['standard_loop:liveness-watcher'],
};

const CRON_SCRIPT_SCRIPTS = {
  'scripts/cron/chairman-decision-sla-sweep.mjs': ['cron_script:chairman-decision-sla-sweep.mjs'],
  'scripts/cron/eva-scheduler-watcher.mjs': ['cron_script:eva-scheduler-watcher.mjs'],
  'scripts/cron/fr-c-generator.mjs': ['cron_script:fr-c-generator.mjs'],
  'scripts/cron/venture-ops-actuals-sweep.mjs': ['cron_script:venture-ops-actuals-sweep.mjs'],
};

describe('FR-3: every standard_loop:* backing script self-stamps', () => {
  for (const [file, keys] of Object.entries(STANDARD_LOOP_SCRIPTS)) {
    it(`${file} references stampLastFired and its process_key(s)`, () => {
      const content = src(file);
      expect(content, `${file} does not reference stampLastFired`).toMatch(/stampLastFired/);
      for (const key of keys) {
        expect(content, `${file} does not reference process_key '${key}'`).toContain(key);
      }
    });
  }

  it('covers all 26 standard_loop:* keys across the 25 distinct scripts (one script, fleet-dashboard.cjs, backs two)', () => {
    expect(Object.keys(STANDARD_LOOP_SCRIPTS)).toHaveLength(25);
    const allKeys = Object.values(STANDARD_LOOP_SCRIPTS).flat();
    expect(allKeys).toHaveLength(26);
    expect(new Set(allKeys).size).toBe(26);
  });
});

describe('FR-3 extension: the 4 cron_script:* rows with a real GHA invoker also self-stamp', () => {
  for (const [file, keys] of Object.entries(CRON_SCRIPT_SCRIPTS)) {
    it(`${file} references stampLastFired and its process_key`, () => {
      const content = src(file);
      expect(content, `${file} does not reference stampLastFired`).toMatch(/stampLastFired/);
      for (const key of keys) {
        expect(content, `${file} does not reference process_key '${key}'`).toContain(key);
      }
    });
  }
});
