/**
 * QF-20260720-597: lib/coordinator/safe-metadata-merge.mjs
 *
 * Shared atomic-merge helper so future metadata stampers cannot reintroduce the
 * read-spread-write anti-pattern that silently resurrects a concurrently-cleared
 * coordinator hold flag (needs_coordinator_review / requires_human_action). Mirrors
 * clear-coordinator-review.js's exemplar test style: a fake raw-pg client, one atomic
 * `||` merge query, no follow-up read.
 */
import { describe, it, expect, vi } from 'vitest';
import { mergeMetadataKeys, removeMetadataKey, removeMetadataKeyIfClaimedBy } from '../../../lib/coordinator/safe-metadata-merge.mjs';

function fakeClient({ rowCount = 1, queryError = null } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (queryError) throw queryError;
      return { rowCount };
    }),
    end: vi.fn(async () => {}),
  };
}

describe('mergeMetadataKeys', () => {
  it('throws synchronously on a missing sdKey (programmer error)', async () => {
    await expect(mergeMetadataKeys()).rejects.toThrow('sdKey is required');
  });

  it('throws synchronously on a non-object patch (programmer error)', async () => {
    await expect(mergeMetadataKeys('SD-TEST-001', 'not-an-object')).rejects.toThrow('patch must be a plain object');
    await expect(mergeMetadataKeys('SD-TEST-001', ['array'])).rejects.toThrow('patch must be a plain object');
  });

  it('issues ONE atomic || merge touching only the given keys, and closes the connection', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);

    const result = await mergeMetadataKeys('SD-TEST-001', { model_tier_decisions: [{ tier: 'fable' }] }, { createClientFn });

    expect(result).toEqual({ merged: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/\|\|/);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE strategic_directives_v2/i);
    expect(client.queries[0].sql).toMatch(/COALESCE\(metadata/i);
    // SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001: the WHERE clause was never actually pinned
    // here before this SD -- a mutation test (swapping keyColumn from sd_key to id during
    // the generalization refactor) proved every pre-existing assertion in this file still
    // passed. Added to close that real gap.
    expect(client.queries[0].sql).toMatch(/WHERE sd_key = \$1\s*$/);
    expect(client.queries[0].params[0]).toBe('SD-TEST-001');
    expect(JSON.parse(client.queries[0].params[1])).toEqual({ model_tier_decisions: [{ tier: 'fable' }] });
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('never sends a full-metadata-blob spread — the patch param carries ONLY the caller-given keys', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    // A caller reading a stale snapshot with hold flags must never re-transmit them —
    // the whole point is that this function's SQL param is the patch object as-given,
    // never a spread of some larger metadata blob the caller may have read.
    await mergeMetadataKeys('SD-TEST-001', { some_key: 'value' }, { createClientFn });
    const sentPatch = JSON.parse(client.queries[0].params[1]);
    expect(Object.keys(sentPatch)).toEqual(['some_key']);
  });

  it('reports merged:false (no throw) when no row matched', async () => {
    const client = fakeClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-NOPE-001', { x: 1 }, { createClientFn });
    expect(result).toEqual({ merged: false, sdKey: 'SD-NOPE-001' });
  });

  it('fail-soft on connection failure — never throws, closes nothing (no client to close)', async () => {
    const createClientFn = vi.fn(async () => { throw new Error('connect refused'); });
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/db_connect_failed/);
  });

  it('fail-soft on query failure — still closes the connection', async () => {
    const client = fakeClient({ queryError: new Error('constraint violation') });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/constraint violation/);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('no writer/reason at all → unchanged behavior: one query, no last_metadata_write stamp, no audit insert', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-TEST-001', { some_key: 'value' }, { createClientFn });
    expect(result).toEqual({ merged: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(1);
    const sentPatch = JSON.parse(client.queries[0].params[1]);
    expect(sentPatch).toEqual({ some_key: 'value' });
    expect(sentPatch.last_metadata_write).toBeUndefined();
  });
});

// QF-20260902-928 (Solomon CAPA 9d8d34b3 CA-11): opt-in {writer, reason} provenance stamp +
// audit_log row. Deliberately opt-in (not a hard refuse of a bare call) — see the module
// docblock for why: 9 live production callers do not pass writer/reason yet, and hard-
// refusing them would break drift-guard bookkeeping, hold/unfence flows, and dispatch's own
// audit trail immediately.
describe('mergeMetadataKeys writer/reason provenance (QF-20260902-928)', () => {
  it('writer without reason → refused, zero DB queries issued', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn, writer: 'hold-writer' });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/writer_and_reason/);
    expect(client.queries).toHaveLength(0);
  });

  it('reason without writer → refused, zero DB queries issued', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn, reason: 'because' });
    expect(result.merged).toBe(false);
    expect(result.error).toMatch(/writer_and_reason/);
    expect(client.queries).toHaveLength(0);
  });

  it('both provided → the merge lands metadata.last_metadata_write AND one audit_log row is inserted', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys(
      'SD-TEST-001', { target_application: 'AltifyAI' },
      { createClientFn, writer: 'retarget-script', reason: 'moved to the correct venture repo' }
    );
    expect(result).toEqual({ merged: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(2);

    const mergedPatch = JSON.parse(client.queries[0].params[1]);
    expect(mergedPatch.target_application).toBe('AltifyAI');
    expect(mergedPatch.last_metadata_write).toMatchObject({
      writer: 'retarget-script', reason: 'moved to the correct venture repo', keys: ['target_application'],
    });
    expect(typeof mergedPatch.last_metadata_write.at).toBe('string');

    const [auditSql, auditParams] = [client.queries[1].sql, client.queries[1].params];
    expect(auditSql).toMatch(/INSERT INTO audit_log/i);
    expect(auditParams).toEqual([
      'sd_metadata_merge', 'strategic_directive', 'SD-TEST-001',
      JSON.stringify({ target_application: 'AltifyAI' }),
      JSON.stringify({ writer: 'retarget-script', reason: 'moved to the correct venture repo', keys: ['target_application'] }),
      'info', 'retarget-script',
    ]);
  });

  it('no row matched → neither the stamp nor the audit insert is attempted', async () => {
    const client = fakeClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-NOPE-001', { x: 1 }, { createClientFn, writer: 'w', reason: 'r' });
    expect(result).toEqual({ merged: false, sdKey: 'SD-NOPE-001' });
    expect(client.queries).toHaveLength(1); // the UPDATE only — no audit insert on a 0-row match
  });

  it('audit_log insert failure is fail-open — the merge itself still reports success', async () => {
    let call = 0;
    const client = {
      queries: [],
      query: vi.fn(async (sql, params) => {
        client.queries.push({ sql, params });
        call += 1;
        if (call === 2) throw new Error('audit_log insert failed');
        return { rowCount: 1 };
      }),
      end: vi.fn(async () => {}),
    };
    const createClientFn = vi.fn(async () => client);
    const result = await mergeMetadataKeys('SD-TEST-001', { x: 1 }, { createClientFn, writer: 'w', reason: 'r' });
    expect(result).toEqual({ merged: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(2); // the audit insert was attempted, just failed silently
    expect(client.end).toHaveBeenCalledOnce();
  });
});

// SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 FR-3: removeMetadataKey/removeMetadataKeyIfClaimedBy
// had ZERO direct unit coverage of their real SQL before this SD (only mocked in unrelated
// consumer tests) -- and both now delegate to the new generic removeJsonbColumnKey core.
// These tests pin their real behavior for the first time.
describe('removeMetadataKey (real implementation, first direct coverage)', () => {
  it('issues ONE atomic jsonb `-` remove scoped by sd_key, and closes the connection', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);

    const result = await removeMetadataKey('SD-TEST-001', 'stale_flag', { createClientFn });

    expect(result).toEqual({ removed: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE strategic_directives_v2/i);
    expect(client.queries[0].sql).toMatch(/COALESCE\(metadata, '\{\}'::jsonb\) - \$2::text/);
    expect(client.queries[0].sql).toMatch(/WHERE sd_key = \$1\s*$/);
    expect(client.queries[0].params).toEqual(['SD-TEST-001', 'stale_flag']);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('reports removed:false (no throw) when no row matched', async () => {
    const client = fakeClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await removeMetadataKey('SD-NOPE-001', 'x', { createClientFn });
    expect(result).toEqual({ removed: false, sdKey: 'SD-NOPE-001' });
  });

  it('fail-soft on query failure — still closes the connection', async () => {
    const client = fakeClient({ queryError: new Error('constraint violation') });
    const createClientFn = vi.fn(async () => client);
    const result = await removeMetadataKey('SD-TEST-001', 'x', { createClientFn });
    expect(result.removed).toBe(false);
    expect(result.error).toMatch(/constraint violation/);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('throws synchronously on missing sdKey or key (programmer error)', async () => {
    await expect(removeMetadataKey()).rejects.toThrow('sdKey is required');
    await expect(removeMetadataKey('SD-TEST-001')).rejects.toThrow('key is required');
  });
});

describe('removeMetadataKeyIfClaimedBy (real implementation, first direct coverage)', () => {
  it('issues ONE atomic jsonb `-` remove guarded by id AND claiming_session_id (CAS)', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);

    const result = await removeMetadataKeyIfClaimedBy('sd-uuid-123', 'release_request', 'sess-abc', { createClientFn });

    expect(result).toEqual({ removed: true, id: 'sd-uuid-123' });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE strategic_directives_v2/i);
    expect(client.queries[0].sql).toMatch(/COALESCE\(metadata, '\{\}'::jsonb\) - \$2::text/);
    expect(client.queries[0].sql).toMatch(/WHERE id = \$1 AND claiming_session_id = \$3/);
    expect(client.queries[0].params).toEqual(['sd-uuid-123', 'release_request', 'sess-abc']);
  });

  it('0-row result means the claim moved out from under the caller — reported as removed:false, not an error', async () => {
    const client = fakeClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await removeMetadataKeyIfClaimedBy('sd-uuid-123', 'release_request', 'sess-abc', { createClientFn });
    expect(result).toEqual({ removed: false, id: 'sd-uuid-123' });
  });

  it('throws synchronously on any missing required arg', async () => {
    await expect(removeMetadataKeyIfClaimedBy()).rejects.toThrow('id is required');
    await expect(removeMetadataKeyIfClaimedBy('id-1')).rejects.toThrow('key is required');
    await expect(removeMetadataKeyIfClaimedBy('id-1', 'key-1')).rejects.toThrow('claimingSessionId is required');
  });
});

// SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 FR-3: representative real call-site patch shapes
// (drawn from the LEAD-phase 28-call-site enumeration), pinning that the generic-core
// delegation produces identical SQL/params for each distinct shape a real caller sends.
describe('mergeMetadataKeys — representative real call-site patch shapes (FR-3 regression)', () => {
  it('single nested-object-replace key (e.g. lib/claim/release-claim-both-surfaces.mjs style)', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const patch = { claim_release: { prior_claimant: 'sess-1', released_at: '2026-09-14T00:00:00Z' } };
    await mergeMetadataKeys('SD-TEST-001', patch, { createClientFn });
    expect(JSON.parse(client.queries[0].params[1])).toEqual(patch);
  });

  it('multi-key fixed-shape reset-to-null (e.g. chairman-gated-decision-row-guard.mjs style)', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const patch = {
      gated_guard_prior_hit_at: null,
      gated_guard_drift_flagged_at: null,
      gated_guard_last_escalated_at: null,
      gated_guard_suppressed_count: 0,
    };
    await mergeMetadataKeys('SD-TEST-001', patch, { createClientFn });
    expect(JSON.parse(client.queries[0].params[1])).toEqual(patch);
  });

  it('array-value key (e.g. dispatch.cjs stampModelRecommendation style)', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const patch = { model_tier_decisions: [{ tier: 'fable', at: '2026-09-14T00:00:00Z' }] };
    await mergeMetadataKeys('SD-TEST-001', patch, { createClientFn });
    expect(JSON.parse(client.queries[0].params[1])).toEqual(patch);
  });

  it('wide hold-flag key set (e.g. lib/fleet/hold-writer.js writeSdOracleHold style, 10 keys)', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const patch = {
      requires_human_action: true,
      requires_human_action_reason: 'oracle read pending review',
      requires_human_action_by: 'oracle-tick',
      requires_human_action_at: '2026-09-14T00:00:00Z',
      human_decider: 'chairman',
      oracle_read_pending_review_at: '2026-09-14T00:00:00Z',
      oracle_read_pending_release_condition: 'chairman_ack',
      oracle_read_pending_consult_row_id: 'consult-1',
      premise_recheck_by: '2026-09-15T00:00:00Z',
      premise_predicate: 'always',
    };
    await mergeMetadataKeys('SD-TEST-001', patch, { createClientFn });
    expect(JSON.parse(client.queries[0].params[1])).toEqual(patch);
  });
});
