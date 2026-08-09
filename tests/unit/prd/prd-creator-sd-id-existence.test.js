/**
 * sd_id must be validated by EXISTENCE, not by SHAPE.
 * QF-20260808-269 — corrects the guard I shipped in QF-20260808-528.
 *
 * WHAT WENT WRONG, and it is worth stating plainly because the failure is the lesson. QF-528 added
 * a guard that threw whenever `sdIdValue` matched a UUID, asserting that
 * `strategic_directives_v2.id` "is the SD KEY STRING". That premise came from n=1: a single row
 * whose id happened to equal its sd_key. Measured over the WHOLE table, paged (not a capped
 * fetch): .id is a UUID for 4228 of 5574 rows (75.9%) and a key string for 1346 (24.1%). The
 * column is HETEROGENEOUS — and ALL 26 open SDs carry a UUID id, so the guard threw on the CORRECT
 * value for 100% of the SDs anyone was working on, blocking the canonical PRD path fleet-wide.
 * Its comment then sent callers to the sd_key, which fails the FK with a real 23503.
 *
 * GROUND TRUTH: database/migrations/2025-09-22-prd-add-sd-id.sql:46 —
 * `prd_sd_fk FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)`.
 *
 * WHY EXISTENCE. A shape check can only ever encode ONE of two shapes; an existence check is
 * correct for both. THE UUID-ACCEPTED TEST BELOW IS THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL
 * BUG — a suite that only asserted "a bad id is rejected" was green against a guard that rejected
 * the right answer.
 */

import { describe, it, expect } from 'vitest';
import { createPRDWithValidatedContent } from '../../../scripts/prd/prd-creator.js';

const UUID_ID = 'a80ffadc-990f-4492-ab63-63a82f2680f7';   // shape a real OPEN SD's .id takes
const KEY_ID = 'SD-LEO-FEAT-EXAMPLE-001';                  // shape an older row's .id takes

const goodContent = {
  executive_summary: 'x'.repeat(60),
  functional_requirements: [{ id: 'FR-1', title: 'something' }]
};

/** Fake whose strategic_directives_v2.id lookup resolves ONLY for `existingId`. */
function makeSupabase(existingId, capture = { inserted: false }) {
  return {
    capture,
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: (_c, v) => ({ maybeSingle: async () => ({ data: v === existingId ? { id: v } : null, error: null }) }) }) };
      }
      // product_requirements_v2: pre-existing-PRD probe, then insert
      return {
        select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        insert: (rec) => { capture.inserted = true; return { select: () => ({ single: async () => ({ data: { id: 'new-prd', ...rec }, error: null }) }) }; }
      };
    }
  };
}

const call = (sb, sdIdValue, content = goodContent) =>
  createPRDWithValidatedContent(sb, 'PRD-X', 'SD-KEY', sdIdValue, 'T', {}, content);

describe('QF-20260808-269: sd_id is validated by existence, not shape', () => {
  it('ACCEPTS a UUID sd_id that EXISTS — the case the old shape-guard wrongly rejected', async () => {
    // THE REGRESSION TEST. All 26 open SDs have a UUID .id; the previous guard threw here, which is
    // what blocked the canonical PRD path. A suite without this arm stays green on the broken guard.
    const err = await call(makeSupabase(UUID_ID), UUID_ID).catch((e) => e);
    expect(err?.message || '', 'a UUID sd_id that exists must not be rejected').not.toMatch(/does not exist|must be the SD key/);
  });

  it('ACCEPTS a key-string sd_id that EXISTS — the other half of the heterogeneous column', async () => {
    const err = await call(makeSupabase(KEY_ID), KEY_ID).catch((e) => e);
    expect(err?.message || '').not.toMatch(/does not exist|must be the SD key/);
  });

  it('REJECTS an sd_id that does not resolve, before Postgres raises 23503', async () => {
    // The original footgun is real and the guard still earns its place — it just needed the right
    // discriminator. Nothing may be inserted on this path.
    const capture = { inserted: false };
    const sb = makeSupabase(UUID_ID, capture);
    const err = await call(sb, 'SD-KEY-THAT-IS-NOT-AN-ID').catch((e) => e);

    expect(err).toBeTruthy();
    expect(err.message).toMatch(/does not exist in strategic_directives_v2\.id/);
    expect(capture.inserted, 'a non-resolving sd_id must never reach the insert').toBe(false);
  });

  it('the rejection NAMES all three candidates so the next caller is not guessing', async () => {
    // The ambiguity IS the footgun — three id-ish fields on one row. An error that merely says
    // "wrong" reproduces the confusion that produced the original bad guard.
    const err = await call(makeSupabase(UUID_ID), 'nope').catch((e) => e);
    expect(err.message).toMatch(/sdData\.id/);
    expect(err.message).toMatch(/sd_key/);
    expect(err.message).toMatch(/uuid_id/);
    expect(err.message).toMatch(/prd_sd_fk/);
  });

  it('CONTROL: an empty sd_id is refused with its own message, not a lookup', async () => {
    const err = await call(makeSupabase(UUID_ID), '').catch((e) => e);
    expect(err.message).toMatch(/sdIdValue is required/);
  });

  it('CONTROL: the client-first signature guard still fires before any id work', async () => {
    // Two-sided: rewriting guard (b) must not have disturbed guard (a).
    const err = await createPRDWithValidatedContent('not-a-client', 'PRD-X', 'SD-KEY', UUID_ID, 'T', {}, goodContent).catch((e) => e);
    expect(err.message).toMatch(/argument 1 must be a Supabase client/);
  });
});
