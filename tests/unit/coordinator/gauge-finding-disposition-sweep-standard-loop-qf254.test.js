/**
 * QF-20260913-254 — scripts/gauge-findings/disposition-sweep.mjs (QF-20260911-425) had ZERO
 * invokers anywhere (no STANDARD_LOOPS entry, no cron, no GHA workflow) since it shipped, so the
 * designed drain for invariant_gauge_finding feedback never ran and the backlog read UNDRAINED
 * tick after tick. This pins the three touches that close the gap: the session-armed
 * STANDARD_LOOPS entry (beside the GHA leg, kept as backup), its stampLastFired liveness call,
 * and its recurring-tick-exemptions.json registration — the same defensive pairing
 * QF-20260913-812 used for batch-mint-sweep.mjs.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { STANDARD_LOOPS } from '../../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);
const { isExempt } = require('../../../scripts/hooks/retry-state-manager.cjs');

describe('QF-20260913-254 — gauge-finding-disposition-sweep STANDARD_LOOPS entry', () => {
  const entry = STANDARD_LOOPS.find((l) => l.key === 'gauge-finding-disposition-sweep');

  it('exists, session-armed, with the GHA leg kept as backup', () => {
    expect(entry).toBeTruthy();
    expect(entry.script).toBe('disposition-sweep.mjs');
    expect(entry.cron).toBe('23 * * * *');
    expect(entry.gha_backed).toBe(true);
    expect(entry.session_arm).toBe(true);
    expect(entry.prompt).toBe('node scripts/gauge-findings/disposition-sweep.mjs --apply');
  });

  it('the script field is the basename (not a subpath)', () => {
    expect(entry.script).not.toMatch(/[/\\]/);
  });
});

describe('QF-20260913-254 — gauge-finding-disposition-sweep recurring-tick exemption', () => {
  it('isExempt recognizes the real invocation command', () => {
    expect(isExempt('node scripts/gauge-findings/disposition-sweep.mjs --apply')).toBe(true);
  });

  it('DISCRIMINATES: an unregistered sibling script is not exempt (proves this is not vacuously green)', () => {
    expect(isExempt('node scripts/gauge-findings/definitely-not-registered-anywhere.mjs')).toBe(false);
  });
});

describe('QF-20260913-254 — gauge-finding disposition-sweep.mjs stamps its own liveness', () => {
  it('calls stampLastFired with the process key matching the STANDARD_LOOPS key', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts/gauge-findings/disposition-sweep.mjs'),
      'utf8'
    );
    expect(src).toContain("import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';");
    expect(src).toContain('stampLastFired(supabase, PROCESS_KEY)');
    expect(src).toContain("const PROCESS_KEY = 'standard_loop:gauge-finding-disposition-sweep';");
  });
});
