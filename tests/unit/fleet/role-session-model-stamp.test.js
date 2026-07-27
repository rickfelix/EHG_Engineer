/**
 * QF-20260727-909 — non-fleet role sessions (adam, solomon) must get a model/effort stamp.
 *
 * CHAIRMAN-REPORTED: the sessions page rendered his Adam row as '--/--'. Measured 2026-07-27:
 * metadata.model present on 9/9 workers and 1/1 coordinator, ABSENT on adam and solomon.
 *
 * Root cause is structural, not transient: the only two writers of metadata.model are the
 * SessionStart hook (stamps only when stdin carries a model) and worker-checkin's --model
 * self-report, which ONLY workers run. A non_fleet role session runs neither, so nothing would
 * EVER populate it. This is why it does not self-heal on restart, unlike the account column.
 *
 * The QF's open question — "why does the coordinator have one?" — resolved by measurement before
 * building: its effort_source reads 'worker_self_report', i.e. it has no special role-stamping
 * path; it simply runs the worker check-in. So there was no third path to copy, only the
 * existing writer to share.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { mergeCheckinModelEffort, parseCheckinArgs } = require_('../../../scripts/worker-checkin.cjs');

describe('the shared writer stamps a role session correctly', () => {
  it('stamps model, family, effort and provenance onto adam metadata', () => {
    const { metadata, changed } = mergeCheckinModelEffort(
      { role: 'adam', non_fleet: true, adam_since: '2026-07-27T00:00:00Z' },
      { model: 'opus', effort: 'high' },
    );
    expect(changed).toBe(true);
    expect(metadata.model).toBe('opus');
    expect(metadata.model_family).toBe('opus');
    expect(metadata.effort).toBe('high');
    expect(metadata.effort_source).toBe('worker_self_report');
  });

  it('PRESERVES the role keys — the stamp must not clobber the tag it sits beside', () => {
    // The QF explicitly tested and REJECTED "adam-register clobbers the stamp via a read-merge-
    // write". This asserts the converse does not happen either: stamping must not drop role /
    // non_fleet / adam_since, or registration would silently un-tag the singleton.
    const before = { role: 'adam', non_fleet: true, adam_since: '2026-07-27T00:00:00Z', callsign: 'x' };
    const { metadata } = mergeCheckinModelEffort(before, { model: 'opus', effort: 'high' });
    expect(metadata.role).toBe('adam');
    expect(metadata.non_fleet).toBe(true);
    expect(metadata.adam_since).toBe('2026-07-27T00:00:00Z');
    expect(metadata.callsign).toBe('x');
  });

  it('is a no-op when neither flag is supplied (registration keeps working unflagged)', () => {
    const before = { role: 'solomon', non_fleet: true };
    const { metadata, changed } = mergeCheckinModelEffort(before, {});
    expect(changed).toBe(false);
    expect(metadata).toBe(before);
  });

  it('parses the same --model/--effort flags the worker path accepts', () => {
    expect(parseCheckinArgs(['--model', 'opus', '--effort', 'high'])).toEqual({ model: 'opus', effort: 'high' });
    expect(parseCheckinArgs([])).toEqual({ model: null, effort: null });
  });
});

describe('BOTH role registrars call the shared writer', () => {
  // A guard on one registrar is not a guard on the invariant — adam and solomon are mirrors and
  // both were blank.
  for (const f of ['scripts/adam-register.cjs', 'scripts/solomon-register.cjs']) {
    it(`${f} stamps via mergeCheckinModelEffort`, () => {
      const src = readFileSync(resolve(repoRoot, f), 'utf8');
      expect(src).toMatch(/mergeCheckinModelEffort/);
      expect(src).toMatch(/parseCheckinArgs/);
    });

    it(`${f} stamps OUTSIDE the RPC/fallback branch, not inside it`, () => {
      // The RPC (set_*_flag) is the PRIMARY path; the JS merge is only its fail-soft. Stamping
      // inside the fallback becomes dead code the moment the chairman-approved migration lands.
      const src = readFileSync(resolve(repoRoot, f), 'utf8');
      const fallbackIdx = src.indexOf("action = 'tagged_fallback';");
      const stampIdx = src.indexOf('mergeCheckinModelEffort');
      expect(fallbackIdx).toBeGreaterThan(-1);
      expect(stampIdx).toBeGreaterThan(fallbackIdx); // after the branch closes, not within it
    });

    it(`${f} fails soft — a stamp failure must never block role registration`, () => {
      const src = readFileSync(resolve(repoRoot, f), 'utf8');
      const stampIdx = src.indexOf('mergeCheckinModelEffort');
      const region = src.slice(Math.max(0, stampIdx - 600), stampIdx + 600);
      expect(region).toMatch(/try\s*\{/);
      expect(region).toMatch(/catch/);
    });
  }
});
