/**
 * SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-B FR-4: insertSDIdempotent
 * (lib/eva/lifecycle-sd-bridge.js) is the single shared insert helper every
 * SD-creation call site in this file routes through — stamping sourced_by
 * here covers all of them uniformly rather than patching each call site.
 */
import { describe, it, expect } from 'vitest';
import { _internal } from '../../lib/eva/lifecycle-sd-bridge.js';

const { insertSDIdempotent } = _internal;

function fakeSupabase(insertResult = { error: null }) {
  const calls = [];
  return {
    calls,
    client: {
      from: () => ({
        insert: async (row) => {
          calls.push(row);
          return insertResult;
        },
      }),
    },
  };
}

describe('insertSDIdempotent — sourced_by stamping', () => {
  it('stamps metadata.sourced_by = "lifecycle-sd-bridge" when the row does not already set it', async () => {
    const { client, calls } = fakeSupabase();
    const row = { sd_key: 'SD-X-001', id: 'uuid-1', metadata: { created_via: 'lifecycle-sd-bridge' } };
    await insertSDIdempotent(client, row);
    expect(calls).toHaveLength(1);
    expect(calls[0].metadata.sourced_by).toBe('lifecycle-sd-bridge');
  });

  it('does not overwrite an explicit sourced_by already set by the caller', async () => {
    const { client, calls } = fakeSupabase();
    const row = { sd_key: 'SD-X-002', id: 'uuid-2', metadata: { sourced_by: 'some-other-writer' } };
    await insertSDIdempotent(client, row);
    expect(calls[0].metadata.sourced_by).toBe('some-other-writer');
  });

  it('applies across every call (all 3 insertSDIdempotent call sites share this one function)', async () => {
    const { client, calls } = fakeSupabase();
    await insertSDIdempotent(client, { sd_key: 'SD-ORCH-001', id: 'u1', metadata: {} });
    await insertSDIdempotent(client, { sd_key: 'SD-ORCH-001-1', id: 'u2', metadata: {} });
    await insertSDIdempotent(client, { sd_key: 'SD-ORCH-001-1-1', id: 'u3', metadata: {} });
    expect(calls.every((r) => r.metadata.sourced_by === 'lifecycle-sd-bridge')).toBe(true);
  });

  it('still treats a 23505 duplicate-key error as reuse, unaffected by the stamping change', async () => {
    const { client } = fakeSupabase({ error: { code: '23505', message: 'duplicate key value violates unique constraint "strategic_directives_v2_sd_key_key"' } });
    const result = await insertSDIdempotent(client, { sd_key: 'SD-DUP-001', id: 'u4', metadata: {} });
    expect(result.created).toBe(false);
    expect(result.error).toBeNull();
  });
});
