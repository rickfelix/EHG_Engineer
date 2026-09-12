/**
 * QF-20260912-394 escalation reproduction: strategic_directives_v2.title is
 * `character varying(500)`. createFromQF() previously passed qf.title straight through to
 * createSD() unbounded -- some Adam-seat-minted QFs fold an entire one-sentence finding into
 * the title field (measured live: QF-20260912-394's own title runs well past 500 chars), so
 * createSD's INSERT failed outright with "value too long for type character varying(500)",
 * losing the escalation entirely instead of degrading (createFromQF worked correctly; the
 * escalation attempt via `leo-create-sd.js --from-qf QF-20260912-394` failed with exactly this
 * error, live, during this SD's own creation).
 *
 * truncateTitle() bounds the title the same way composeEscalatedDescription() already bounds
 * the description: truncate, never fabricate, and preserve the full original in
 * metadata.qf_origin_body.title so nothing is discarded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Pure-function tests: no mocking required ──────────────────────────────────────────
const { truncateTitle } = await import('../../lib/sd-creation/source-adapters/qf.js');

describe('truncateTitle (QF-20260912-394)', () => {
  it('leaves a title at or under 500 chars byte-identical', () => {
    const short = 'Fix the readback comparator';
    expect(truncateTitle(short)).toBe(short);
    const exactly500 = 'x'.repeat(500);
    expect(truncateTitle(exactly500)).toBe(exactly500);
  });

  it('truncates a title over 500 chars to fit the varchar(500) column, with a visible marker', () => {
    const long = 'x'.repeat(600);
    const result = truncateTitle(long);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toMatch(/… \[truncated, see metadata\]$/);
  });

  it('handles a missing/null title without throwing', () => {
    expect(truncateTitle(null)).toBe('');
    expect(truncateTitle(undefined)).toBe('');
    expect(truncateTitle('')).toBe('');
  });
});

// ── End-to-end: createFromQF -> createSDOrThrow never receives an over-length title ──────
const h = vi.hoisted(() => ({ cfg: null, createSDArgs: null }));

vi.mock('../../lib/sd-creation/context.js', () => ({
  supabase: {
    from(table) {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        update: () => b,
        maybeSingle: async () => {
          if (table === 'quick_fixes') return { data: h.cfg?.qfRow ?? null, error: null };
          return { data: null, error: null };
        },
        then: (resolve) => resolve({ error: null })
      };
      return b;
    },
    rpc: async () => ({ data: { success: true }, error: null })
  }
}));

vi.mock('../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: async () => 'LEO',
  createSDOrThrow: async (args) => { h.createSDArgs = args; return { id: 'SD-UUID-1' }; }
}));

vi.mock('../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: async () => 'SD-LEO-FIX-TEST-001'
}));

vi.mock('../../lib/eva/stage-zero/data-pollers/retry.js', () => ({
  withRetry: async (fn) => fn()
}));

const { createFromQF } = await import('../../lib/sd-creation/source-adapters/qf.js');

function baseQfRow(overrides = {}) {
  return {
    id: 'QF-TEST-1',
    title: 'Test QF',
    description: 'desc',
    type: 'bug',
    severity: 'medium',
    estimated_loc: 40,
    target_application: 'EHG_Engineer',
    status: 'open',
    escalated_to_sd_id: null,
    claiming_session_id: null,
    ...overrides
  };
}

beforeEach(() => {
  h.cfg = null;
  h.createSDArgs = null;
});

describe('createFromQF bounds an over-length QF title before it reaches createSD (QF-20260912-394)', () => {
  it('a QF title over 500 chars is truncated, never passed through raw', async () => {
    const longTitle = 'A very long finding title. '.repeat(30); // well over 500 chars
    h.cfg = { qfRow: baseQfRow({ title: longTitle }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs).not.toBeNull();
    expect(h.createSDArgs.title.length).toBeLessThanOrEqual(500);
    expect(h.createSDArgs.title).not.toBe(longTitle);
  });

  it('the full original title survives, unbounded, in metadata.qf_origin_body.title', async () => {
    const longTitle = 'A very long finding title. '.repeat(30);
    h.cfg = { qfRow: baseQfRow({ title: longTitle }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.metadata.qf_origin_body.title).toBe(longTitle);
  });

  it('a normal-length QF title passes through byte-identical', async () => {
    h.cfg = { qfRow: baseQfRow({ title: 'Fix the flaky retry loop' }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.title).toBe('Fix the flaky retry loop');
  });
});
