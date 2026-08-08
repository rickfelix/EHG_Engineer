/**
 * createPRDWithValidatedContent must reject a mis-call by NAME, before Postgres does.
 * QF-20260808-528.
 *
 * TWO FOOTGUNS, both hit while writing a real PRD. The signature is CLIENT-FIRST, which is easy
 * to mis-order; and `sdIdValue` is written to product_requirements_v2.sd_id, whose FK targets
 * strategic_directives_v2.id — the SD KEY STRING, not the UUID the creation scripts print as
 * the SD's uuid. Measured: id = "SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001" while uuid_id holds
 * the UUID. Passing the UUID raised a bare 23503 naming neither the argument nor the column.
 *
 * THE POSITIVE CONTROL IS THE POINT. Both negative assertions below would also pass against a
 * guard that rejected EVERY call — which would break PRD creation entirely. The third test
 * drives a CORRECT id through and asserts it reaches the next validation instead, so the guard
 * is proven two-sided rather than merely loud.
 */

import { describe, it, expect } from 'vitest';
import { createPRDWithValidatedContent } from '../../../scripts/prd/prd-creator.js';

const SD_KEY = 'SD-LEO-FEAT-EXAMPLE-001';
const SD_UUID = 'd0129bf6-1b4d-49be-a7be-97b761029f55';

// Minimal stand-in: only needs to look like a client to get past the first guard.
const fakeSupabase = {
  from: () => ({
    select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
  })
};

const goodContent = {
  executive_summary: 'x'.repeat(60),
  functional_requirements: [{ id: 'FR-1', title: 'something' }]
};

describe('QF-20260808-528: createPRDWithValidatedContent pre-checks', () => {
  it('rejects a UUID in sdIdValue and names the column, the FK and the fix', async () => {
    await expect(
      createPRDWithValidatedContent(fakeSupabase, 'PRD-X', SD_KEY, SD_UUID, 'T', {}, goodContent)
    ).rejects.toThrow(/sdIdValue must be the SD key/);
  });

  it('the message explains WHICH id was wrong rather than surfacing a bare 23503', async () => {
    // A named error that does not say what to pass instead just relocates the confusion.
    const err = await createPRDWithValidatedContent(
      fakeSupabase, 'PRD-X', SD_KEY, SD_UUID, 'T', {}, goodContent
    ).catch(e => e);
    expect(err.message).toMatch(/23503/);
    expect(err.message).toMatch(/uuid_id|sd_key/);
  });

  it('rejects a mis-ordered call where argument 1 is not a client', async () => {
    await expect(
      createPRDWithValidatedContent(SD_KEY, 'PRD-X', SD_KEY, SD_KEY, 'T', {}, goodContent)
    ).rejects.toThrow(/argument 1 must be a Supabase client/);
  });

  it('CONTROL: a CORRECT sd key passes the pre-check and reaches the next validation', async () => {
    // Deliberately empty functional_requirements: the call must fail on THAT, proving the id
    // guard let a valid key through instead of rejecting everything.
    const err = await createPRDWithValidatedContent(
      fakeSupabase, 'PRD-X', SD_KEY, SD_KEY, 'T', {},
      { executive_summary: 'x'.repeat(60), functional_requirements: [] }
    ).catch(e => e);

    expect(err, 'expected the downstream validation to reject').toBeTruthy();
    expect(err.message, 'the id guard rejected a VALID sd key').not.toMatch(/sdIdValue must be/);
    expect(err.message).toMatch(/functional_requirements/);
  });
});
