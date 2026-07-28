/**
 * C1 — the retry that keeps the adherence ledger alive must itself be guarded.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * WHY THIS FILE EXISTS. check_class ships behind a chairman-gated migration, so between this code
 * merging and the DDL applying, PostgREST rejects any row carrying the unknown column. recordAdherence
 * is fail-open, so WITHOUT the retry every adherence write — all eight probes, the 6h retro, the
 * action-time path — would silently stop and the table would simply cease growing.
 *
 * That retry was the fix for a blocking defect and had NO regression barrier: deleting it left the
 * whole suite green. A remedy nobody can see break is the same shape as the defect this SD exists
 * to remove, one level up. Hence these.
 *
 * THE DISCRIMINATION THAT MATTERS: retry on "the column is not there", NEVER on a CHECK violation.
 * A 23514 message contains "check_class" as the CONSTRAINT NAME, so a bare /check_class/ guard
 * would retry a genuine rejection and write a row the database just refused.
 */
import { describe, it, expect } from 'vitest';
import { recordAdherence } from '../../../scripts/adam-self-adherence-review.mjs';

const BAR = { probe: 'p', duty: 'd', verdict: 'pass', detail: 'x', check_class: 'conduct' };

/** Records every insert attempt; fails the first with `err`, succeeds after. */
function db(err, { failAll = false } = {}) {
  const attempts = [];
  return {
    attempts,
    from: () => ({
      insert: (row) => {
        attempts.push(row);
        const shouldFail = failAll || attempts.length === 1;
        return {
          select: () => ({
            single: async () => (shouldFail
              ? { data: null, error: err }
              : { data: { id: `id-${attempts.length}` }, error: null }),
          }),
        };
      },
    }),
  };
}

const MISSING_COLUMN = [
  { message: "Could not find the 'check_class' column of 'adam_adherence_ledger' in the schema cache" },
  { message: 'column "check_class" of relation "adam_adherence_ledger" does not exist', code: '42703' },
];

const MUST_NOT_RETRY = [
  { message: 'new row violates check constraint "adam_adherence_ledger_check_class_check"', code: '23514' },
  { message: 'null value in column "check_class" violates not-null constraint', code: '23502' },
  { message: 'fetch failed: socket hang up' },
];

describe('the column is not there yet — write the row anyway, unclassified', () => {
  for (const err of MISSING_COLUMN) {
    it(`retries once without check_class on: ${err.message.slice(0, 48)}…`, async () => {
      const client = db(err);
      const id = await recordAdherence(client, 'run-1', BAR);
      expect(id).toBe('id-2');
      expect(client.attempts).toHaveLength(2);
      expect(client.attempts[0]).toHaveProperty('check_class', 'conduct');
      // The retry row omits the column entirely — an unclassified row is what a pre-migration row
      // honestly is, and is far better than no row at all.
      expect(client.attempts[1]).not.toHaveProperty('check_class');
      expect(client.attempts[1].probe).toBe('p');
    });
  }
});

describe('THE DISCRIMINATION — a genuine rejection is never retried', () => {
  for (const err of MUST_NOT_RETRY) {
    it(`does NOT retry on: ${err.message.slice(0, 48)}…`, async () => {
      // The 23514 case is the sharp one: its message contains "check_class" as the CONSTRAINT
      // NAME, so a guard matching only /check_class/ would retry a row the database refused.
      const client = db(err, { failAll: true });
      const id = await recordAdherence(client, 'run-1', BAR);
      expect(id).toBeNull();
      expect(client.attempts).toHaveLength(1);
    });
  }
});

describe('bounded, and never a loop', () => {
  it('a retry that also fails stops at two attempts and returns null', async () => {
    const client = db(MISSING_COLUMN[0], { failAll: true });
    const id = await recordAdherence(client, 'run-1', BAR);
    expect(id).toBeNull();
    expect(client.attempts).toHaveLength(2);
  });

  it('NEGATIVE CONTROL — the happy path writes once and carries the class', async () => {
    // Without this, "always retries" would satisfy everything above while doubling every write.
    const client = db(null, {});
    client.attempts.length = 0;
    const ok = {
      attempts: [],
      from: () => ({
        insert: (row) => { ok.attempts.push(row); return { select: () => ({ single: async () => ({ data: { id: 'id-1' }, error: null }) }) }; },
      }),
    };
    const id = await recordAdherence(ok, 'run-1', BAR);
    expect(id).toBe('id-1');
    expect(ok.attempts).toHaveLength(1);
    expect(ok.attempts[0].check_class).toBe('conduct');
  });
});
