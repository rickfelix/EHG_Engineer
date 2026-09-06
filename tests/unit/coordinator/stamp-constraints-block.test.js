/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-4 (TS-6/TS-6b/TS-7,
 * AC-10/AC-11/AC-12/AC-13).
 *
 * stampConstraintsBlock is tested in ISOLATION here (a minimal stub covering only the
 * strategic_directives_v2 select it issues) -- proving the stamper CAN render correctly.
 * A separate structural test proves the choke CALLS it before both body mirrors, mirroring
 * this file's own precedent (dispatch-send-backpressure.test.js's own header note: "testing the
 * exported assert alone proves the guard CAN refuse, never that the choke CALLS it").
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { stampConstraintsBlock } = require('../../../lib/coordinator/dispatch.cjs');
const { BODY_HARD_CAP } = require('../../../lib/shared/body-cap.cjs');

const silentLog = { warn() {}, error() {}, log() {} };

/** Minimal stub: only strategic_directives_v2.select(...).eq('sd_key', ...).maybeSingle() matters. */
function stubSupabase(metadata) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() {
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: { metadata }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

describe('stampConstraintsBlock (isolated)', () => {
  it('AC-10: renders ratifications_cited and a resolvable hold', async () => {
    const sb = stubSupabase({ ratifications_cited: ['49656c8c', '76a3c081'], review_hold_reason: 'awaiting Solomon review' });
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-TEST-001' } };
    await stampConstraintsBlock(sb, row, silentLog);
    expect(row.body).toContain('CONSTRAINTS:');
    expect(row.body).toContain('49656c8c');
    expect(row.body).toContain('76a3c081');
    expect(row.body).toContain('awaiting Solomon review');
  });

  it('AC-7 integration: a human_action_note-only hold (FR-3 widened key) renders too', async () => {
    const sb = stubSupabase({ human_action_note: 'awaiting chairman ceremony' });
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-TEST-001' } };
    await stampConstraintsBlock(sb, row, silentLog);
    expect(row.body).toContain('awaiting chairman ceremony');
  });

  it('AC-11: renders "CONSTRAINTS: none recorded" when no constraint-bearing keys are present', async () => {
    const sb = stubSupabase({});
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-TEST-001' } };
    await stampConstraintsBlock(sb, row, silentLog);
    expect(row.body).toBe('CONSTRAINTS: none recorded');
  });

  it('AC-12: writes BOTH row.body and row.payload.body directly, converging pre-set distinct values', async () => {
    const sb = stubSupabase({ review_hold_reason: 'awaiting review' });
    const row = {
      message_type: 'WORK_ASSIGNMENT',
      payload: { assigned_sd: 'SD-TEST-001', body: 'original payload.body text' },
      body: 'original row.body text (distinct)',
    };
    await stampConstraintsBlock(sb, row, silentLog);
    expect(row.body).toBe(row.payload.body);
    expect(row.body).toContain('CONSTRAINTS:');
    expect(row.body).toContain('awaiting review');
  });

  it('AC-13: an oversized render is DROPPED (fail-soft), never thrown, never truncated -- the row is left un-stamped', async () => {
    const hugeReason = 'x'.repeat(BODY_HARD_CAP + 500);
    const sb = stubSupabase({ review_hold_reason: hugeReason });
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-TEST-001' }, body: 'original short body' };
    await expect(stampConstraintsBlock(sb, row, silentLog)).resolves.toBeUndefined();
    // Un-stamped: the original body is untouched, not a truncated CONSTRAINTS block.
    expect(row.body).toBe('original short body');
    expect(row.payload.body).toBeUndefined();
  });

  it('non-WORK_ASSIGNMENT rows are left untouched', async () => {
    const sb = stubSupabase({ review_hold_reason: 'x' });
    const row = { message_type: 'INFO', payload: {} };
    await stampConstraintsBlock(sb, row, silentLog);
    expect(row.body).toBeUndefined();
  });

  it('a QF target is skipped (no metadata-shaped constraints for quick fixes today)', async () => {
    const sb = stubSupabase({ review_hold_reason: 'should never be read' });
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'QF-20260101-001' } };
    await stampConstraintsBlock(sb, row, silentLog);
    expect(row.body).toBeUndefined();
  });

  it('a lookup error is fail-soft -- never throws, never stamps', async () => {
    const sb = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: () => { throw new Error('db down'); } }) };
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-TEST-001' } };
    await expect(stampConstraintsBlock(sb, row, silentLog)).resolves.toBeUndefined();
    expect(row.body).toBeUndefined();
  });
});

describe('stampConstraintsBlock wiring (structural — the choke actually calls it)', () => {
  it('is called before BOTH body/payload.body fill-if-absent mirrors', () => {
    const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../lib/coordinator/dispatch.cjs');
    const src = fs.readFileSync(filePath, 'utf8');
    const stampCallIdx = src.indexOf('await stampConstraintsBlock(supabase, row, logger);');
    const firstMirrorIdx = src.indexOf("row.body == null && row.payload && typeof row.payload === 'object' && row.payload.body != null");
    const secondMirrorIdx = src.indexOf("row.body != null && row.payload && typeof row.payload === 'object' && row.payload.body == null");
    expect(stampCallIdx).toBeGreaterThan(-1);
    expect(firstMirrorIdx).toBeGreaterThan(-1);
    expect(secondMirrorIdx).toBeGreaterThan(-1);
    expect(stampCallIdx).toBeLessThan(firstMirrorIdx);
    expect(stampCallIdx).toBeLessThan(secondMirrorIdx);
  });
});
