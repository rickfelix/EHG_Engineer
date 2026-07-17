/**
 * Unit Tests: Shadow-trial child A — proposal staging + precheck packet.
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A
 *
 * PR-1 coverage: 7-field validation, idempotent upsert shape, CEREMONY_PENDING
 * soft-fail semantics (exact missing-table error shapes). Packet/attach/render tests
 * live in shadow-trial-packet.test.js (PR-2).
 */

import { describe, test, expect } from 'vitest';
import {
  REQUIRED_FIELDS,
  isMissingTableError,
  validateProposal,
  diffHash,
  stageProposal,
  TABLE,
} from '../../../../lib/governance/shadow-trial/proposal-writer.mjs';

const PROPOSAL = {
  artifact_class: 'closure_predicates',
  target_ref: 'loop_registry:edge_freshness:v3',
  current_hash: 'abc123',
  proposed_diff: '--- a/predicate\n+++ b/predicate\n-old\n+new',
  proposer: 'session-75390de2:Alpha-2',
  provenance: 'SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A test fixture',
  rationale: 'Tighten the freshness window per retro finding.',
};

/**
 * Capturing stub client: records every table touched and the operation kind, so the
 * evidence-only invariant test can assert the exact write allow-list. Query methods are
 * chainable like the real PostgREST builder; terminal awaits resolve with the canned
 * response for that table.
 */
function stubClient({ probeError = null, insertError = null } = {}) {
  const writes = [];
  const reads = [];
  const make = (tableName) => {
    const rowsHolder = { rows: null };
    const chain = {
      select(cols) { reads.push({ table: tableName, cols }); return chain; },
      limit() { return Promise.resolve(probeErrorFor(tableName)); },
      insert(row) { writes.push({ table: tableName, op: 'insert', row }); rowsHolder.rows = [{ id: `id-${tableName}` }]; return chain; },
      upsert(row, opts) { writes.push({ table: tableName, op: 'upsert', row, opts }); rowsHolder.rows = [{ id: `id-${tableName}` }]; return chain; },
      update(patch) { writes.push({ table: tableName, op: 'update', patch }); return chain; },
      eq() { return Promise.resolve({ data: rowsHolder.rows, error: null }); },
      then(resolve) { resolve({ data: rowsHolder.rows, error: insertError }); },
    };
    return chain;
  };
  const probeErrorFor = (tableName) => (tableName === TABLE && probeError ? { data: null, error: probeError } : { data: [], error: null });
  return { from: (t) => make(t), _writes: writes, _reads: reads };
}

describe('validateProposal — 7-field contract', () => {
  test('accepts a complete proposal and names every missing field', () => {
    expect(validateProposal(PROPOSAL).valid).toBe(true);
    for (const field of REQUIRED_FIELDS) {
      const broken = { ...PROPOSAL, [field]: '' };
      const res = validateProposal(broken);
      expect(res.valid).toBe(false);
      expect(res.errors).toContain(`missing_field:${field}`);
    }
    expect(validateProposal(null).errors).toContain('not_an_object');
  });
});

describe('CEREMONY_PENDING soft-fail semantics', () => {
  test.each([
    ['42P01 code', { code: '42P01', message: 'relation does not exist' }],
    ['PGRST205', { code: 'PGRST205', message: 'x' }],
    ['schema-cache message', { message: `Could not find the table 'public.${TABLE}' in the schema cache` }],
  ])('missing-table shape (%s) -> ceremony_pending, zero writes', async (_label, err) => {
    const client = stubClient({ probeError: err });
    const res = await stageProposal(client, PROPOSAL);
    expect(res).toEqual({ staged: false, ceremony_pending: true });
    expect(client._writes).toHaveLength(0);
  });
  test('a genuine error is NOT ceremony_pending', async () => {
    const client = stubClient({ probeError: { code: '500', message: 'connection refused' } });
    const res = await stageProposal(client, PROPOSAL);
    expect(res.ceremony_pending).toBeUndefined();
    expect(res.error).toBe('connection refused');
    expect(isMissingTableError({ code: '500', message: 'connection refused' })).toBe(false);
  });
});

describe('staging — idempotency key + write shape', () => {
  test('upserts on the content-derived conflict key with a computed diff_hash', async () => {
    const client = stubClient();
    const res = await stageProposal(client, PROPOSAL);
    expect(res.staged).toBe(true);
    const w = client._writes[0];
    expect(w.table).toBe(TABLE);
    expect(w.op).toBe('upsert');
    expect(w.opts.onConflict).toBe('artifact_class,target_ref,current_hash,diff_hash');
    expect(w.row.diff_hash).toBe(diffHash(PROPOSAL.proposed_diff));
    expect(w.row.status).toBe('staged');
  });
  test('--dry validates and probes but never writes', async () => {
    const client = stubClient();
    const res = await stageProposal(client, PROPOSAL, { dry: true });
    expect(res).toEqual({ staged: false, dry: true });
    expect(client._writes).toHaveLength(0);
  });
});

