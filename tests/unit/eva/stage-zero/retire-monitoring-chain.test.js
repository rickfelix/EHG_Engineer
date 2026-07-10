/**
 * SD-LEO-INFRA-RETIRE-DEAD-MONITORING-CHAIN-001 (Solomon 41a2e6da; Delta C9/C10/H11/H12/H13)
 *
 * Retirement proofs:
 *  1. DEADNESS — the four chain modules are gone at the filesystem level and no live
 *     code references them (retire, don't repair).
 *  2. RETENTION — retry.js survives with its REAL importers intact.
 *  3. HONESTY — app_rankings figures never render without their age; empty renders
 *     the explicit NO-DATA marker; both live readers consume the helper.
 *  4. SUCCESSOR — the sanctioned rebuild spec is named and exists.
 */

import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath, join } from 'path';
import { stalenessStamp, NO_DATA_MARKER } from '../../../../lib/eva/stage-zero/data-pollers/staleness.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dir, '../../../..');
const pollersDir = resolvePath(repoRoot, 'lib/eva/stage-zero/data-pollers');

const DELETED_MODULES = [
  'pipeline-orchestrator.js',
  'change-detector.js',
  'significance-scorer.js',
  'countermeasure-engine.js',
];

function walkJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'archive' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkJs(full, out);
    else if (/\.(js|mjs|cjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('deadness: the four chain modules are gone with zero live references', () => {
  test('filesystem: deleted modules do not exist', () => {
    for (const mod of DELETED_MODULES) {
      expect(existsSync(join(pollersDir, mod)), `${mod} should be deleted`).toBe(false);
    }
  });

  test('reference sweep: no import/require of the deleted modules across lib/ and scripts/', () => {
    const files = [...walkJs(resolvePath(repoRoot, 'lib')), ...walkJs(resolvePath(repoRoot, 'scripts'))];
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const mod of DELETED_MODULES) {
        const base = mod.replace('.js', '');
        // import/require path references only — the consolidation registry's unrelated
        // 'pipeline-orchestrator' subsystem ID string is NOT an import (name collision).
        if (new RegExp(`(from\\s+['"][^'"]*${base}(\\.js)?['"])|(require\\(['"][^'"]*${base}(\\.js)?['"]\\))`).test(src)) {
          offenders.push(`${f} -> ${base}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('retention: retry.js and its real importers', () => {
  test('retry.js exists and its five real importers still consume withRetry', () => {
    expect(existsSync(join(pollersDir, 'retry.js'))).toBe(true);
    const importers = [
      'lib/eva/convergence-loop.js',
      'lib/sd-creation/source-adapters/qf.js',
      'lib/eva/stage-zero/data-pollers/apple-rss-poller.js',
      'lib/eva/stage-zero/data-pollers/gplay-scraper.js',
      'lib/eva/stage-zero/data-pollers/producthunt-poller.js',
    ];
    for (const rel of importers) {
      const src = readFileSync(resolvePath(repoRoot, rel), 'utf8');
      expect(src, `${rel} should import withRetry`).toMatch(/withRetry/);
    }
  });
});

describe('honesty: stalenessStamp', () => {
  const now = new Date('2026-07-10T12:00:00Z');

  test('populated rows → age stamp derived from the NEWEST observation', () => {
    const rows = [
      { app_name: 'A', scraped_at: '2026-07-07T12:00:00Z' },
      { app_name: 'B', scraped_at: '2026-07-09T12:00:00Z' }, // newest: 24h old
    ];
    const { isEmpty, stamp } = stalenessStamp(rows, { now });
    expect(isEmpty).toBe(false);
    expect(stamp).toContain('data age: newest observation 24h old');
    expect(stamp).toContain('2026-07-09T12:00:00');
  });

  test('empty / null rows → explicit NO-DATA marker, never a fresh-looking claim', () => {
    expect(stalenessStamp([], {}).stamp).toBe(NO_DATA_MARKER);
    expect(stalenessStamp(null, {}).stamp).toBe(NO_DATA_MARKER);
    expect(stalenessStamp([], {}).isEmpty).toBe(true);
  });

  test('unparseable timestamps → unknown-age wording, never fabricated freshness', () => {
    const { isEmpty, stamp } = stalenessStamp([{ app_name: 'X', scraped_at: 'garbage' }], { now });
    expect(isEmpty).toBe(false);
    expect(stamp).toContain('data age UNKNOWN');
    expect(stamp).toContain('treat as stale');
  });

  test('old data renders in days', () => {
    const { stamp } = stalenessStamp([{ scraped_at: '2026-06-10T12:00:00Z' }], { now });
    expect(stamp).toContain('30d old');
  });
});

describe('honesty reach: both live readers consume the stamp', () => {
  test('discovery-mode and competitor-teardown import stalenessStamp and can render NO-DATA', () => {
    for (const rel of ['lib/eva/stage-zero/paths/discovery-mode.js', 'lib/eva/stage-zero/paths/competitor-teardown.js']) {
      const src = readFileSync(resolvePath(repoRoot, rel), 'utf8');
      expect(src, `${rel} should import stalenessStamp`).toMatch(/stalenessStamp/);
      expect(src, `${rel} should render the NO-DATA marker`).toMatch(/NO_DATA_MARKER/);
      // no silent-skip catches remain around the ranking reads
      expect(src).not.toMatch(/Silently skip.*ranking/i);
    }
  });
});

describe('successor: the rebuild path is documented', () => {
  test('index.js names the adjudication + successor spec, and the spec exists', () => {
    const idx = readFileSync(join(pollersDir, 'index.js'), 'utf8');
    expect(idx).toContain('RETIREMENT NOTE');
    expect(idx).toContain('41a2e6da');
    expect(idx).toContain('competitive-vigilance-observed-baseline-design.md');
    expect(existsSync(resolvePath(repoRoot, 'docs/design/competitive-vigilance-observed-baseline-design.md'))).toBe(true);
  });
});
