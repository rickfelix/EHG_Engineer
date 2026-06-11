// SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001 — stateless rotation semantics.
// The registry derives from completed SDs stamping metadata.subsystem_review;
// these pin derivation, next-due picking, and the weekly due-gate.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  SUBSYSTEMS,
  ROTATION_DUE_MS,
  deriveRotation,
  pickNextDue,
  isRotationDue,
} = require('../../lib/coordinator/subsystem-review-rotation.cjs');

const sd = (subsystem, updated_at, status = 'completed') => ({
  metadata: { subsystem_review: subsystem }, status, updated_at,
});

describe('SUBSYSTEMS registry', () => {
  it('contains 8 subsystems including the four reviewed on 2026-06-10', () => {
    expect(SUBSYSTEMS).toHaveLength(8);
    for (const s of ['harness', 'protocol', 'data-layer', 'eva-pipeline']) {
      expect(SUBSYSTEMS).toContain(s);
    }
  });
});

describe('deriveRotation (pure)', () => {
  it('cold start: empty history => all never-reviewed, zero reviews', () => {
    const rot = deriveRotation([]);
    expect(rot).toHaveLength(8);
    expect(rot.every((r) => r.last_reviewed === null && r.reviews === 0)).toBe(true);
  });

  it('latest completion wins; review counts accumulate', () => {
    const rot = deriveRotation([
      sd('harness', '2026-06-01T00:00:00Z'),
      sd('harness', '2026-06-10T00:00:00Z'),
      sd('protocol', '2026-06-05T00:00:00Z'),
    ]);
    const h = rot.find((r) => r.subsystem === 'harness');
    expect(h.last_reviewed).toBe('2026-06-10T00:00:00Z');
    expect(h.reviews).toBe(2);
    expect(rot.find((r) => r.subsystem === 'protocol').reviews).toBe(1);
  });

  it('ignores unknown subsystem names and non-completed SDs', () => {
    const rot = deriveRotation([
      sd('not-a-subsystem', '2026-06-10T00:00:00Z'),
      sd('harness', '2026-06-10T00:00:00Z', 'in_progress'),
      { metadata: null, status: 'completed', updated_at: '2026-06-10T00:00:00Z' },
    ]);
    expect(rot.every((r) => r.reviews === 0)).toBe(true);
  });
});

describe('pickNextDue (pure)', () => {
  it('never-reviewed wins, in registry order (harness first on cold start)', () => {
    expect(pickNextDue(deriveRotation([])).subsystem).toBe('harness');
  });

  it('with one unreviewed subsystem, picks it over stale reviewed ones', () => {
    const history = SUBSYSTEMS.filter((s) => s !== 'security')
      .map((s, i) => sd(s, `2026-06-0${(i % 8) + 1}T00:00:00Z`));
    expect(pickNextDue(deriveRotation(history)).subsystem).toBe('security');
  });

  it('with all reviewed, picks the stalest', () => {
    const history = SUBSYSTEMS.map((s, i) => sd(s, `2026-06-${String(i + 2).padStart(2, '0')}T00:00:00Z`));
    expect(pickNextDue(deriveRotation(history)).subsystem).toBe(SUBSYSTEMS[0]);
  });

  it('empty rotation => null', () => {
    expect(pickNextDue([])).toBeNull();
  });
});

describe('isRotationDue (pure)', () => {
  const now = Date.parse('2026-06-10T12:00:00Z');
  it('due with no prior post; not due within ~6 days; due after', () => {
    expect(isRotationDue(null, now)).toBe(true);
    expect(isRotationDue('2026-06-08T12:00:00Z', now)).toBe(false);
    expect(isRotationDue('2026-06-01T12:00:00Z', now)).toBe(true);
  });
  it('garbage timestamps fail toward due', () => {
    expect(isRotationDue('not-a-date', now)).toBe(true);
  });
  it('cadence constant is ~6 days (weekly cron with jitter tolerance)', () => {
    expect(ROTATION_DUE_MS).toBe(6 * 24 * 60 * 60 * 1000);
  });
});
