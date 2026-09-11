// SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3): the sanctioned write path for the new
// chairman_ratification_verifications sibling table. Must degrade gracefully when the table's
// chairman-gated migration has not been applied yet — recording a verdict is advisory
// infrastructure and must never throw or falsify the encode decision it merely describes.

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  recordVerificationAttempt,
  chairmanRatificationVerificationsTableExists,
  CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE,
} from '../ratification-verification-store.mjs';

const VALID_ATTEMPT = {
  targetRatificationId: 'row-1',
  attemptKind: 'live_encode',
  outcome: 'verified',
  encodedAtPersisted: true,
  pinTier: 'exact_commit_pin',
  commitSha: 'deadbeef',
  targetFile: 'CLAUDE_ADAM.md',
  contentRead: 'the ratified clause\ntail\n',
  markerOffset: 0,
  attemptedEncodedRef: { type: 'section_id', section_id: '94', manifest_hash: 'abc' },
  attemptedMarkerText: 'the ratified clause',
  producer: 'lib/chairman/ratification-writer.mjs:markRatificationEncoded',
};

function makeSupabase({ insertResult, existsResult } = {}) {
  const single = vi.fn(() => Promise.resolve(insertResult ?? { data: { id: 'crv-1' }, error: null }));
  const insertChain = { select: vi.fn(() => insertChain), single };
  const insert = vi.fn(() => insertChain);
  const limit = vi.fn(() => Promise.resolve(existsResult ?? { data: [{ id: 'x' }], error: null }));
  const selectChain = { limit };
  const select = vi.fn(() => selectChain);
  const from = vi.fn((table) => ({ insert, select, _table: table }));
  return { from, _insert: insert, _select: select };
}

const CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE_MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE_MISSING_POSTGREST = { data: null, error: { code: 'PGRST205', message: 'not found' } };

describe('CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE', () => {
  it('names the table this module writes to', () => {
    expect(CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE).toBe('chairman_ratification_verifications');
  });
});

describe('chairmanRatificationVerificationsTableExists', () => {
  it('is true when a real row select succeeds', async () => {
    const sb = makeSupabase({ existsResult: { data: [], error: null } });
    expect(await chairmanRatificationVerificationsTableExists(sb)).toBe(true);
  });

  it('is false on 42P01 (undefined_table)', async () => {
    const sb = makeSupabase({ existsResult: CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE_MISSING });
    expect(await chairmanRatificationVerificationsTableExists(sb)).toBe(false);
  });

  it('is false on PGRST205 (PostgREST schema-cache miss)', async () => {
    const sb = makeSupabase({ existsResult: CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE_MISSING_POSTGREST });
    expect(await chairmanRatificationVerificationsTableExists(sb)).toBe(false);
  });

  it('is true (fail-open on the PROBE, never fail-closed) for an unrelated error code', async () => {
    // A different error (e.g. a transient network blip) must not be misread as "table absent" —
    // that would silently suppress every subsequent recording attempt this session.
    const sb = makeSupabase({ existsResult: { data: null, error: { code: '57014', message: 'query cancelled' } } });
    expect(await chairmanRatificationVerificationsTableExists(sb)).toBe(true);
  });

  it('never throws even if the client itself throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    expect(await chairmanRatificationVerificationsTableExists(sb)).toBe(false);
  });
});

describe('recordVerificationAttempt', () => {
  it('inserts a row with computed file_sha256 and marker_sha256, never storing raw content/marker hashes by hand', async () => {
    const sb = makeSupabase();
    const result = await recordVerificationAttempt(sb, VALID_ATTEMPT);
    expect(result.recorded).toBe(true);
    expect(sb._insert).toHaveBeenCalledTimes(1);
    const row = sb._insert.mock.calls[0][0];
    expect(row.file_sha256).toBe(createHash('sha256').update(VALID_ATTEMPT.contentRead, 'utf8').digest('hex'));
    expect(row.marker_sha256).toBe(createHash('sha256').update(VALID_ATTEMPT.attemptedMarkerText.trim(), 'utf8').digest('hex'));
    expect(row.target_ratification_id).toBe('row-1');
    expect(row.attempt_kind).toBe('live_encode');
    expect(row.outcome).toBe('verified');
  });

  it('generates a run_id when none is supplied', async () => {
    const sb = makeSupabase();
    await recordVerificationAttempt(sb, VALID_ATTEMPT);
    const row = sb._insert.mock.calls[0][0];
    expect(typeof row.run_id).toBe('string');
    expect(row.run_id.length).toBeGreaterThan(0);
  });

  it('degrades to recorded:false, reason:table_not_found on 42P01 — never throws', async () => {
    const sb = makeSupabase({ insertResult: CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE_MISSING });
    const result = await recordVerificationAttempt(sb, VALID_ATTEMPT);
    expect(result).toEqual({ recorded: false, reason: 'table_not_found' });
  });

  it('degrades to recorded:false, reason:table_not_found on PGRST205 — never throws', async () => {
    const sb = makeSupabase({ insertResult: CHAIRMAN_RATIFICATION_VERIFICATIONS_TABLE_MISSING_POSTGREST });
    const result = await recordVerificationAttempt(sb, VALID_ATTEMPT);
    expect(result).toEqual({ recorded: false, reason: 'table_not_found' });
  });

  it('degrades on an unrelated insert error without throwing', async () => {
    const sb = makeSupabase({ insertResult: { data: null, error: { code: '23514', message: 'check violation' } } });
    const result = await recordVerificationAttempt(sb, VALID_ATTEMPT);
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/check violation/);
  });

  it('degrades if the client itself throws — advisory infrastructure never crashes the caller', async () => {
    const sb = { from: () => ({ insert: () => { throw new Error('boom'); } }) };
    const result = await recordVerificationAttempt(sb, VALID_ATTEMPT);
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/insert_threw: boom/);
  });

  it('refuses a malformed attempt shape (caller bug, not infrastructure trouble) without touching the DB', async () => {
    const sb = makeSupabase();
    const result = await recordVerificationAttempt(sb, { ...VALID_ATTEMPT, targetRatificationId: undefined });
    expect(result).toEqual({ recorded: false, reason: 'invalid_attempt_shape' });
    expect(sb._insert).not.toHaveBeenCalled();
  });

  it('a no_commit_pin refusal record never computes file_sha256/marker_offset from absent content', async () => {
    const sb = makeSupabase();
    await recordVerificationAttempt(sb, {
      targetRatificationId: 'row-2', attemptKind: 'live_encode', outcome: 'no_commit_pin',
      encodedAtPersisted: false, pinTier: 'db_section_content', commitSha: null, targetFile: 'CLAUDE_ADAM.md',
      attemptedEncodedRef: { type: 'section_id', section_id: '94', manifest_hash: 'xyz' },
      attemptedMarkerText: 'the ratified clause', reason: 'no_commit_pin',
      producer: 'lib/chairman/ratification-writer.mjs:markRatificationEncoded',
    });
    const row = sb._insert.mock.calls[0][0];
    expect(row.commit_sha).toBeNull();
    expect(row.file_sha256).toBeNull();
    expect(row.marker_offset).toBeNull();
  });
});
