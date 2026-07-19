/**
 * SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001 FR-2 — static + behavioral wiring pins,
 * mirroring tests/unit/cron/chairman-decision-sla-wiring.test.js's role for the SLA sweep.
 * TS-5 (import pin), TS-6 (package.json reachability root), TS-7 (ARMED idempotency),
 * TS-9 (exact activationTrigger literal), TS-10 (DST-aware quiet-window boundary math).
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  main,
  isWithinAdamSmsQuietWindow,
  ACTIVATION_TRIGGER,
  SD_KEY,
} from '../../../scripts/cron/adam-decision-scheduler-tick.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'adam-decision-scheduler-cron.yml');
const SCRIPT = path.join(repoRoot, 'scripts', 'cron', 'adam-decision-scheduler-tick.mjs');
const PACKAGE_JSON = path.join(repoRoot, 'package.json');

const EXPECTED_ACTIVATION_TRIGGER = 'sms_outbound_obligations STAGED migration applied by chairman ceremony';

describe('adam decision-scheduler machinery names its dispatcher (static wiring)', () => {
  it('TS-5/TS-6: the cron workflow exists and its run step invokes the tick script with --once', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml, 'workflow no longer references scripts/cron/adam-decision-scheduler-tick.mjs').toMatch(
      /node\s+scripts\/cron\/adam-decision-scheduler-tick\.mjs\s+--once/
    );
    expect(yml, 'workflow lost its schedule trigger').toMatch(/schedule:/);
  });

  it('TS-5: the tick script exists and imports runDecisionSchedulerTick from the decision-scheduler module', () => {
    expect(fs.existsSync(SCRIPT), `missing tick script: ${SCRIPT}`).toBe(true);
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src, 'script no longer imports runDecisionSchedulerTick from lib/comms/adam-outbound/decision-scheduler/index.js').toMatch(
      /import\s*\{[^}]*runDecisionSchedulerTick[^}]*\}\s*from\s*['"][./]*\.\.\/\.\.\/lib\/comms\/adam-outbound\/decision-scheduler\/index\.js['"]/
    );
  });

  it('TS-9: the tick registers ARMED machinery with the EXACT pinned activationTrigger literal', () => {
    expect(SD_KEY).toBe('SD-LEO-INFRA-ADAM-DECISION-SCHEDULER-001');
    expect(ACTIVATION_TRIGGER).toBe(EXPECTED_ACTIVATION_TRIGGER);
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src, 'script no longer calls registerArmedMachinery').toMatch(/registerArmedMachinery/);
  });

  it('TS-6: package.json gains a <name>:cron script entry giving the two new files a WIRE_CHECK reachability root', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['adam:decision-scheduler:tick:cron']).toBe(
      'node scripts/cron/adam-decision-scheduler-tick.mjs --once'
    );
  });

  it('the cron YAML documents the chairman SMS-specific 22:00-06:00 America/New_York window, not the different SLA-sweep window', () => {
    const yml = fs.readFileSync(WORKFLOW, 'utf8');
    expect(yml).toMatch(/22:00-06:00/);
    expect(yml).toMatch(/America\/New_York/);
  });

  it('the tick script exports the RUNTIME DST-aware quiet-window guard and main() gates on it', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/export function isWithinAdamSmsQuietWindow/);
    expect(typeof isWithinAdamSmsQuietWindow).toBe('function');
  });
});

/** Minimal fake for periodic_process_registry: supports the select/eq/maybeSingle check
 *  plus the real registerArmedMachinery's upsert call — no mocking of the armed-registration
 *  module needed, mirroring tests/unit/cron/chairman-decision-sla-sweep.test.js's approach. */
function makeRegistrySupabase({ existingRow = null } = {}) {
  let row = existingRow;
  const upserts = [];
  return {
    from(table) {
      if (table !== 'periodic_process_registry') throw new Error(`unexpected table ${table}`);
      const ctx = { mode: 'select' };
      const api = {
        select() { ctx.mode = 'select'; return api; },
        eq() { return api; },
        async maybeSingle() { return { data: row, error: null }; },
        upsert(vals) { ctx.mode = 'upsert'; ctx.vals = vals; return api; },
        then(resolve) {
          if (ctx.mode === 'upsert') {
            upserts.push(ctx.vals);
            row = { process_key: ctx.vals.process_key, ...ctx.vals };
            resolve({ error: null });
          } else {
            resolve({ data: row, error: null });
          }
        },
      };
      return api;
    },
    _upserts: upserts,
  };
}

describe('adam decision-scheduler tick — behavioral wiring', () => {
  it('TS-9: first run (no existing registry row) registers ARMED machinery with the exact pinned literal', async () => {
    const sb = makeRegistrySupabase({ existingRow: null });
    const stampLastFired = vi.fn(async () => ({ stamped: true }));
    const tick = vi.fn(async () => ({ ran: true, results: [] }));
    const result = await main(['node', 'script', '--once'], {
      supabase: sb, logger: { log() {}, warn() {}, error() {} },
      stampLastFired, runDecisionSchedulerTick: tick,
      now: new Date(Date.UTC(2026, 6, 18, 12, 0, 0)), // 08:00 ET — outside quiet window
    });
    expect(result.exitCode).toBe(0);
    expect(sb._upserts).toHaveLength(1);
    expect(sb._upserts[0].liveness_source_ref.activation_trigger).toBe(EXPECTED_ACTIVATION_TRIGGER);
    expect(stampLastFired).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('TS-7: second run (registry row already exists) does NOT re-register — idempotent, never wipes last_fired_at', async () => {
    const sb = makeRegistrySupabase({ existingRow: { process_key: 'g3-armed-sd-leo-infra-adam-decision-scheduler-001', last_fired_at: '2026-07-17T00:00:00.000Z' } });
    const stampLastFired = vi.fn(async () => ({ stamped: true }));
    const tick = vi.fn(async () => ({ ran: true, results: [] }));
    const result = await main(['node', 'script', '--once'], {
      supabase: sb, logger: { log() {}, warn() {}, error() {} },
      stampLastFired, runDecisionSchedulerTick: tick,
      now: new Date(Date.UTC(2026, 6, 18, 12, 0, 0)),
    });
    expect(result.exitCode).toBe(0);
    expect(sb._upserts).toHaveLength(0); // no re-registration, real last_fired_at never touched by an upsert
    expect(stampLastFired).toHaveBeenCalledTimes(1); // liveness is still stamped every real run
  });

  it('quiet-window skip: a run during 22:00-06:00 ET skips the tick without erroring', async () => {
    const sb = makeRegistrySupabase({ existingRow: { process_key: 'x' } });
    const stampLastFired = vi.fn(async () => ({ stamped: true }));
    const tick = vi.fn(async () => ({ ran: true, results: [] }));
    const result = await main(['node', 'script', '--once'], {
      supabase: sb, logger: { log() {}, warn() {}, error() {} },
      stampLastFired, runDecisionSchedulerTick: tick,
      now: new Date(Date.UTC(2026, 6, 18, 3, 0, 0)), // 23:00 ET (EDT) — inside quiet window
    });
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('quiet_window_skip');
    expect(tick).not.toHaveBeenCalled();
  });

  it('dry-run: reports intent, performs no ARMED registration and no tick', async () => {
    const sb = makeRegistrySupabase();
    const stampLastFired = vi.fn(async () => ({ stamped: true }));
    const tick = vi.fn(async () => ({ ran: true, results: [] }));
    const result = await main(['node', 'script', '--once', '--dry-run'], {
      supabase: sb, logger: { log() {}, warn() {}, error() {} },
      stampLastFired, runDecisionSchedulerTick: tick,
    });
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('dry_run');
    expect(sb._upserts).toHaveLength(0);
    expect(stampLastFired).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
  });
});

describe('TS-10: isWithinAdamSmsQuietWindow — DST-aware 22:00-06:00 America/New_York boundary math', () => {
  it('EST (January): 21:59 ET outside, 22:00 ET inside, 05:59 ET inside, 06:00 ET outside', () => {
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 0, 16, 2, 59)))).toBe(false); // 21:59 ET Jan 15
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 0, 16, 3, 0)))).toBe(true);   // 22:00 ET Jan 15
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 0, 15, 10, 59)))).toBe(true); // 05:59 ET Jan 15
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 0, 15, 11, 0)))).toBe(false); // 06:00 ET Jan 15
  });

  it('EDT (July): 21:59 ET outside, 22:00 ET inside, 05:59 ET inside, 06:00 ET outside', () => {
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 6, 19, 1, 59)))).toBe(false); // 21:59 ET Jul 18
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 6, 19, 2, 0)))).toBe(true);   // 22:00 ET Jul 18
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 6, 18, 9, 59)))).toBe(true);  // 05:59 ET Jul 18
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 6, 18, 10, 0)))).toBe(false); // 06:00 ET Jul 18
  });

  it('spring side of a DST transition (post spring-forward, EDT) classifies 22:00 ET as inside', () => {
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 2, 21, 2, 0)))).toBe(true); // 22:00 ET Mar 20 (EDT)
  });

  it('fall side of a DST transition (post fall-back, EST) classifies 22:00 ET as inside', () => {
    expect(isWithinAdamSmsQuietWindow(new Date(Date.UTC(2026, 10, 21, 3, 0)))).toBe(true); // 22:00 ET Nov 20 (EST)
  });
});
