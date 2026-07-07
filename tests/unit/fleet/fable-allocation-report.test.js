/**
 * scripts/fable-allocation-report.mjs — SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-5, TS-7).
 * Integration-style: spawns the script as a real child process (its only external
 * dependency is a REST fetch, which resolves to [] against the pre-cutover /
 * not-yet-live door_routing_ledger table — this IS the empty-ledger case).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/fable-allocation-report.mjs');

describe('fable-allocation-report.mjs — empty-ledger graceful handling (TS-7)', () => {
  it('exits 0 and prints an explicit "no data in window" message when the ledger is empty/not-yet-live', () => {
    const out = execFileSync('node', [scriptPath], { encoding: 'utf8' });
    expect(out).toMatch(/no data in window/i);
    expect(out).toMatch(/FABLE ALLOCATION/);
  });

  it('--json mode exits 0 and produces valid, well-shaped JSON with empty breakdowns', () => {
    const out = execFileSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    expect(parsed).toMatchObject({ window: { rows: 0 }, byCriterion: {}, byFunnelPosition: {} });
  });

  it('--days accepts a custom window without erroring', () => {
    const out = execFileSync('node', [scriptPath, '--days', '30'], { encoding: 'utf8' });
    expect(out).toMatch(/FABLE ALLOCATION/);
  });
});
