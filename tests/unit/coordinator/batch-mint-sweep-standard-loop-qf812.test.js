/**
 * QF-20260913-812 — batch-mint-sweep-cron.yml was schedule-starved (scheduled GHA runs landing
 * two to five hours apart against its own every-10-minute cron for three days), so every
 * bounded-wait batch-mint hold waited hours for release. This pins the two touches that close the gap:
 * the session-armed STANDARD_LOOPS entry (beside the GHA leg, kept as backup) and its
 * recurring-tick-exemptions.json registration (the same defensive pairing QF-20260912-197 used
 * for index-jam-detector.mjs).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);
const { isExempt } = require('../../../scripts/hooks/retry-state-manager.cjs');

describe('QF-20260913-812 — batch-mint-sweep STANDARD_LOOPS entry', () => {
  const entry = STANDARD_LOOPS.find((l) => l.key === 'batch-mint-sweep');

  it('exists, session-armed, with the GHA leg kept as backup', () => {
    expect(entry).toBeTruthy();
    expect(entry.script).toBe('batch-mint-sweep.mjs');
    expect(entry.cron).toBe('*/10 * * * *');
    expect(entry.gha_backed).toBe(true);
    expect(entry.session_arm).toBe(true);
    expect(entry.prompt).toBe('node scripts/cron/batch-mint-sweep.mjs');
  });

  it('the script field is the basename (not a subpath), so enumerate-processes.mjs coveredScripts matches it', () => {
    // lib/periodic-liveness/enumerate-processes.mjs's discoverAllProcesses() excludes
    // cron_script:<file> whenever a STANDARD_LOOPS entry's `script` equals that same basename
    // (coveredScripts is built from `l.script`, not `l.prompt`) — a subpath here would silently
    // fail to suppress the cron_script:batch-mint-sweep.mjs shadow row.
    expect(entry.script).not.toMatch(/[/\\]/);
  });
});

describe('QF-20260913-812 — batch-mint-sweep recurring-tick exemption', () => {
  it('isExempt recognizes the real invocation command (tolerates the scripts/cron/ subdirectory)', () => {
    expect(isExempt('node scripts/cron/batch-mint-sweep.mjs')).toBe(true);
  });

  it('DISCRIMINATES: an unregistered sibling script is not exempt (proves this is not vacuously green)', () => {
    expect(isExempt('node scripts/cron/definitely-not-registered-anywhere.mjs')).toBe(false);
  });
});
