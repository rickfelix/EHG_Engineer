// SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-4): one-off legacy-row audit backfill.
// Dry-run by default; idempotent (skips rows already covered by a prior legacy_backfill_audit).

import { describe, it, expect, vi } from 'vitest';
import {
  resolveTargetFile, classifyLegacyRow, runBackfill,
} from '../backfill-ratification-verification-audit-20260911.mjs';

const REPO_ROOT = 'C:\\fixture-root';

function fakeReadFileSync(files) {
  return (p) => {
    for (const [k, v] of Object.entries(files)) {
      if (p.endsWith(k)) return v;
    }
    throw new Error(`ENOENT: ${p}`);
  };
}

describe('resolveTargetFile', () => {
  it('resolves the target_file for a known section from the manifest', () => {
    const readFileSync = fakeReadFileSync({
      'claude-generation-manifest.json': JSON.stringify({ section_digests: { meta: { 94: { target_file: 'CLAUDE_ADAM.md' } } } }),
    });
    expect(resolveTargetFile({ type: 'section_id', section_id: '94' }, REPO_ROOT, { readFileSync })).toBe('CLAUDE_ADAM.md');
  });

  it('returns null for a non-section_id ref', () => {
    expect(resolveTargetFile({ type: 'sd_row', sd_key: 'x' }, REPO_ROOT)).toBeNull();
  });

  it('returns null when the manifest is unreadable', () => {
    const readFileSync = () => { throw new Error('ENOENT'); };
    expect(resolveTargetFile({ type: 'section_id', section_id: '94' }, REPO_ROOT, { readFileSync })).toBeNull();
  });
});

describe('classifyLegacyRow', () => {
  const manifestDeps = { readFileSync: fakeReadFileSync({ 'claude-generation-manifest.json': JSON.stringify({ section_digests: { meta: { 94: { target_file: 'CLAUDE_ADAM.md' } } } }) }) };

  it('classifies not_applicable for a non-section_id ref (no rendered file to check)', async () => {
    const row = { id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'sd_row', sd_key: 'x' }, marker_text: 'm' };
    const result = await classifyLegacyRow(row, { repoRoot: REPO_ROOT });
    expect(result.outcome).toBe('not_applicable');
  });

  it('classifies no_commit_pin when resolveEncodeCommit cannot derive a pin, using the ROW\'S OWN historical encoded_at', async () => {
    const resolveEncodeCommit = vi.fn(async (rowArg) => {
      expect(rowArg.encoded_at).toBe('2026-08-01T00:00:00Z'); // the row's own, not "now"
      return { tier: 'db_section_content', commit: null };
    });
    const row = { id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'm' };
    const result = await classifyLegacyRow(row, { repoRoot: REPO_ROOT, deps: { ...manifestDeps, resolveEncodeCommit } });
    expect(result.outcome).toBe('no_commit_pin');
    expect(resolveEncodeCommit).toHaveBeenCalledTimes(1);
  });

  it('classifies verified when a pin resolves and the marker is present at it', async () => {
    const resolveEncodeCommit = async () => ({ tier: 'exact_commit_pin', commit: 'deadbeef' });
    const readContractAtCommit = async () => 'prefix the ratified clause suffix';
    const row = { id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'the ratified clause' };
    const result = await classifyLegacyRow(row, { repoRoot: REPO_ROOT, deps: { ...manifestDeps, resolveEncodeCommit, readContractAtCommit } });
    expect(result.outcome).toBe('verified');
    expect(result.commitSha).toBe('deadbeef');
  });

  it('classifies marker_absent when a pin resolves but the stored marker_text is not at that pin', async () => {
    const resolveEncodeCommit = async () => ({ tier: 'exact_commit_pin', commit: 'deadbeef' });
    const readContractAtCommit = async () => 'nothing relevant here';
    const row = { id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'the ratified clause' };
    const result = await classifyLegacyRow(row, { repoRoot: REPO_ROOT, deps: { ...manifestDeps, resolveEncodeCommit, readContractAtCommit } });
    expect(result.outcome).toBe('marker_absent');
  });

  it('classifies unverifiable_infrastructure when the pinned read fails', async () => {
    const resolveEncodeCommit = async () => ({ tier: 'exact_commit_pin', commit: 'deadbeef' });
    const readContractAtCommit = async () => { throw new Error('object not found'); };
    const row = { id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'x' };
    const result = await classifyLegacyRow(row, { repoRoot: REPO_ROOT, deps: { ...manifestDeps, resolveEncodeCommit, readContractAtCommit } });
    expect(result.outcome).toBe('unverifiable_infrastructure');
  });
});

function makeSupabase({ encodedRows = [], alreadyAudited = [], tableExistsResult = { data: [], error: null }, insertOk = true } = {}) {
  const calls = { inserts: [] };
  const from = vi.fn((table) => {
    if (table === 'chairman_ratification_verifications') {
      return {
        select: vi.fn((cols) => {
          if (cols === 'id') return { limit: vi.fn(() => Promise.resolve(tableExistsResult)) };
          return { eq: vi.fn(() => Promise.resolve({ data: alreadyAudited.map((id) => ({ target_ratification_id: id })), error: null })) };
        }),
        insert: vi.fn((row) => { calls.inserts.push(row); return { select: () => ({ single: () => Promise.resolve(insertOk ? { data: { id: 'crv-x' }, error: null } : { data: null, error: { code: 'XXXXX', message: 'boom' } }) }) }; }),
      };
    }
    if (table === 'chairman_ratifications') {
      return { select: vi.fn(() => ({ not: vi.fn(() => Promise.resolve({ data: encodedRows, error: null })) })) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from, _calls: calls };
}

describe('runBackfill', () => {
  it('refuses to proceed when the sibling table does not exist yet', async () => {
    const sb = makeSupabase({ tableExistsResult: { data: null, error: { code: '42P01', message: 'missing' } } });
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runBackfill(sb, { repoRoot: REPO_ROOT, logger });
    expect(result.ranAt).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('dry-run classifies every un-audited encoded row without inserting anything', async () => {
    const manifestDeps = { readFileSync: fakeReadFileSync({ 'claude-generation-manifest.json': JSON.stringify({ section_digests: { meta: { 94: { target_file: 'CLAUDE_ADAM.md' } } } }) }) };
    const resolveEncodeCommit = async () => ({ tier: 'db_section_content', commit: null });
    const sb = makeSupabase({
      encodedRows: [{ id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'm' }],
    });
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runBackfill(sb, { repoRoot: REPO_ROOT, apply: false, deps: { ...manifestDeps, resolveEncodeCommit }, logger });
    expect(result.ranAt).toBe(true);
    expect(result.total).toBe(1);
    expect(result.inserted).toBe(0);
    expect(sb._calls.inserts).toEqual([]);
    expect(result.results[0].outcome).toBe('no_commit_pin');
  });

  it('skips rows already covered by a prior backfill (idempotent)', async () => {
    const sb = makeSupabase({
      encodedRows: [{ id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'm' }],
      alreadyAudited: ['r1'],
    });
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runBackfill(sb, { repoRoot: REPO_ROOT, apply: true, logger });
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
    expect(sb._calls.inserts).toEqual([]);
  });

  it('--apply inserts one legacy_backfill_audit row per newly-classified encoded row', async () => {
    const manifestDeps = { readFileSync: fakeReadFileSync({ 'claude-generation-manifest.json': JSON.stringify({ section_digests: { meta: { 94: { target_file: 'CLAUDE_ADAM.md' } } } }) }) };
    const resolveEncodeCommit = async () => ({ tier: 'exact_commit_pin', commit: 'deadbeef' });
    const readContractAtCommit = async () => 'prefix m suffix';
    const sb = makeSupabase({
      encodedRows: [{ id: 'r1', encoded_at: '2026-08-01T00:00:00Z', encoded_ref: { type: 'section_id', section_id: '94', manifest_hash: 'x' }, marker_text: 'm' }],
    });
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runBackfill(sb, { repoRoot: REPO_ROOT, apply: true, deps: { ...manifestDeps, resolveEncodeCommit, readContractAtCommit }, logger });
    expect(result.inserted).toBe(1);
    expect(sb._calls.inserts).toHaveLength(1);
    expect(sb._calls.inserts[0].attempt_kind).toBe('legacy_backfill_audit');
    expect(sb._calls.inserts[0].encoded_at_persisted).toBe(true);
    expect(sb._calls.inserts[0].outcome).toBe('verified');
  });
});
