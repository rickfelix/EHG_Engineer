// SD-LEO-FEAT-WORKER-CHECKIN-SELF-001 (FR-1/FR-2): a HARD-DELETED claimed SD must self-heal (release
// the claim) instead of looping action=resume on a ghost forever — BUT a single transient/eventual-
// consistency null must NEVER release a LIVE claim. confirmRowGone() is the guard: it releases only
// when TWO consecutive reads both confirm the row is absent; a read error is fail-open (preserve).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// Zero the inter-read confirm gap so the absent-row tests run instantly (the gap is read at module load).
process.env.CHECKIN_CONFIRM_GAP_MS = '0';
const require = createRequire(import.meta.url);
const { confirmRowGone } = require('../../scripts/worker-checkin.cjs');

// Chainable supabase stub whose maybeSingle() pops the next scripted result off a queue, so we can
// model the two reads confirmRowGone performs. Each result is { data, error }.
function stub(results) {
  const queue = [...results];
  const calls = { reads: 0 };
  function builder() {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      maybeSingle() {
        calls.reads += 1;
        const next = queue.length ? queue.shift() : { data: null, error: null };
        if (next instanceof Error) return Promise.reject(next);
        return Promise.resolve(next);
      },
    };
    return chain;
  }
  return { sb: { from: () => builder() }, calls };
}

describe('confirmRowGone — FR-1/FR-2 deleted-claim guard', () => {
  it('returns TRUE only when BOTH reads find the row absent (genuine hard-delete)', async () => {
    const { sb, calls } = stub([{ data: null, error: null }, { data: null, error: null }]);
    expect(await confirmRowGone(sb, 'strategic_directives_v2', 'sd_key', 'SD-X')).toBe(true);
    expect(calls.reads).toBe(2); // it confirmed with a second read
  });

  it('returns FALSE when the row is present on the first read (live claim, no release)', async () => {
    const { sb, calls } = stub([{ data: { sd_key: 'SD-X' }, error: null }]);
    expect(await confirmRowGone(sb, 'strategic_directives_v2', 'sd_key', 'SD-X')).toBe(false);
    expect(calls.reads).toBe(1); // short-circuits — no needless second read
  });

  it('returns FALSE when a single transient null is contradicted by the confirming read (false-null guard)', async () => {
    // FR-2: read #1 null (eventual-consistency blip), read #2 finds the row -> it EXISTS -> never release.
    const { sb } = stub([{ data: null, error: null }, { data: { sd_key: 'SD-X' }, error: null }]);
    expect(await confirmRowGone(sb, 'strategic_directives_v2', 'sd_key', 'SD-X')).toBe(false);
  });

  it('returns FALSE on a read ERROR (fail-open: preserve the claim)', async () => {
    expect(await confirmRowGone(stub([{ data: null, error: { message: 'timeout' } }]).sb, 't', 'c', 'k')).toBe(false);
    // confirming read errors after a first null -> still preserve
    expect(await confirmRowGone(stub([{ data: null, error: null }, { data: null, error: { message: 'boom' } }]).sb, 't', 'c', 'k')).toBe(false);
  });

  it('returns FALSE when a read throws (fail-open)', async () => {
    const { sb } = stub([new Error('network down')]);
    expect(await confirmRowGone(sb, 't', 'c', 'k')).toBe(false);
  });

  it('FAIL-CLOSED: a malformed/undefined confirming result does NOT release the claim', async () => {
    // First read clean-empty, confirming read returns undefined (misbehaving client) -> must PRESERVE.
    const { sb } = stub([{ data: null, error: null }, undefined]);
    expect(await confirmRowGone(sb, 't', 'c', 'k')).toBe(false);
  });
});
