import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cronToIntervalSeconds,
  parseStandardLoops,
  deriveRequiredInvocation,
  discoverAllProcesses,
  discoverGhaCrons,
  discoverCronScripts,
  discoverStandardLoops,
} from '../../../lib/periodic-liveness/enumerate-processes.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('cronToIntervalSeconds', () => {
  it('maps the common shapes used by this repo', () => {
    expect(cronToIntervalSeconds('*/15 * * * *')).toBe(900);       // GHA watcher cadence
    expect(cronToIntervalSeconds('17,47 * * * *')).toBe(1800);     // STANDARD_LOOPS twice-hourly
    expect(cronToIntervalSeconds('0 */6 * * *')).toBe(21600);      // every 6 hours
    expect(cronToIntervalSeconds('45 9 * * *')).toBe(86400);       // daily fixed time
    expect(cronToIntervalSeconds('0 8 * * 1')).toBe(604800);       // weekly (Monday)
    expect(cronToIntervalSeconds('0 0 1 * *')).toBe(2592000);      // monthly (1st)
  });

  it('falls back to daily on unrecognized/absent expressions (conservative for OVERDUE math)', () => {
    expect(cronToIntervalSeconds(null)).toBe(86400);
    expect(cronToIntervalSeconds('not a cron')).toBe(86400);
  });
});

describe('parseStandardLoops', () => {
  const fixture = `
// preamble
export const STANDARD_LOOPS = [
  { key: 'sweep', label: 'Stale-session sweep', script: 'sweep.cjs', cron: '*/20 * * * *',
    prompt: 'node scripts/sweep.cjs' },
  { key: 'folded-thing', label: 'Folded loop', script: 'folded.cjs', folded: true },
  { key: 'dashboard', label: 'Fleet dashboard', script: 'fleet-dashboard.cjs', cron: '*/5 * * * *',
    prompt: 'node scripts/fleet-dashboard.cjs all' },
];
export function other() {}
`;

  it('extracts every entry with key, cron-derived interval, and session_bound=true', () => {
    const loops = parseStandardLoops(fixture);
    expect(loops.map((l) => l.process_key)).toEqual(['standard_loop:sweep', 'standard_loop:folded-thing', 'standard_loop:dashboard']);
    expect(loops[0].expected_interval_seconds).toBe(1200);
    expect(loops[1].expected_interval_seconds).toBe(3600); // no cron -> hourly default
    expect(loops.every((l) => l.session_bound === true)).toBe(true);
  });

  it('returns empty on text without the export (never throws on drift)', () => {
    expect(parseStandardLoops('const x = 1;')).toEqual([]);
  });

  // QF-20260823-965: a multi-section CLI (fleet-dashboard.cjs all/inbox/workers/...) is only
  // proven alive by the ONE section its liveness stamp is wired to. A single-purpose script's
  // prompt has no trailing section argument, so it has nothing ambiguous to name.
  it('names the required trailing invocation arg for a multi-section prompt, null for a bare script prompt', () => {
    const loops = parseStandardLoops(fixture);
    expect(loops.find((l) => l.process_key === 'standard_loop:dashboard').required_invocation).toBe('all');
    expect(loops.find((l) => l.process_key === 'standard_loop:sweep').required_invocation).toBeNull();
    expect(loops.find((l) => l.process_key === 'standard_loop:folded-thing').required_invocation).toBeNull();
  });
});

describe('deriveRequiredInvocation', () => {
  it('returns the trailing arg when the prompt carries one beyond the script path', () => {
    expect(deriveRequiredInvocation('node scripts/fleet-dashboard.cjs all')).toBe('all');
    expect(deriveRequiredInvocation('node scripts/fleet-dashboard.cjs inbox')).toBe('inbox');
  });

  it('returns null for a bare "node <script>" prompt or no prompt at all', () => {
    expect(deriveRequiredInvocation('node scripts/sweep.cjs')).toBeNull();
    expect(deriveRequiredInvocation(null)).toBeNull();
    expect(deriveRequiredInvocation('')).toBeNull();
  });
});

describe('discovery against the live repo (read-only)', () => {
  it('finds all three sources and unique process_keys', () => {
    const all = discoverAllProcesses(repoRoot);
    const keys = all.map((p) => p.process_key);
    expect(new Set(keys).size).toBe(keys.length);

    expect(discoverGhaCrons(repoRoot).length).toBeGreaterThan(0);
    expect(discoverCronScripts(repoRoot).length).toBeGreaterThan(0);
    const loops = discoverStandardLoops(repoRoot);
    expect(loops.length).toBeGreaterThan(10); // ~24 entries; >10 guards the parser without pinning churn
    expect(loops.some((l) => l.process_key === 'standard_loop:liveness-watcher')).toBe(true);
  });

  it('the new GHA invoker itself is discovered (watchdog is watched)', () => {
    const gha = discoverGhaCrons(repoRoot);
    expect(gha.some((p) => p.process_key === 'gha_cron:periodic-liveness-watcher-cron.yml')).toBe(true);
  });
});
