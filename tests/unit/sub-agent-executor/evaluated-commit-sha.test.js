/**
 * PAT-LES-83842538ee01 (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143), FR-2.
 *
 * Sub-agent evidence had no commit-freshness signal at all -- only a wall-clock check
 * against phase-start time (subagent-evidence-gate.js). This stamps the commit a sub-agent's
 * evidence actually evaluated, so FR-3's staleness check has something real to compare.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolveEvaluatedCommitSha } from '../../../lib/sub-agent-executor/results-storage.js';

describe('resolveEvaluatedCommitSha — TS-3 (pure function)', () => {
  it('resolves the real HEAD SHA of a real repo (this repo, read-only)', () => {
    const sha = resolveEvaluatedCommitSha(process.cwd());
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
    expect(sha).toBe(expected);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('never throws on an unresolvable path -- stamps null, not an error', () => {
    expect(resolveEvaluatedCommitSha('C:/definitely/not/a/git/repo/xyz123')).toBeNull();
  });

  it('stamps null for a missing/empty repo path rather than calling git at all', () => {
    const exec = vi.fn();
    expect(resolveEvaluatedCommitSha(null, exec)).toBeNull();
    expect(resolveEvaluatedCommitSha(undefined, exec)).toBeNull();
    expect(resolveEvaluatedCommitSha('', exec)).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('accepts an injectable exec so a broken repo can be simulated without a real one', () => {
    const explode = () => { throw new Error('not a git repository'); };
    expect(resolveEvaluatedCommitSha('/some/path', explode)).toBeNull();
  });
});

function makeMockSupabase(capture) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        insert(record) {
          capture.insertedTable = table;
          capture.inserted = record;
          return { select: () => ({ single: async () => ({ data: { id: 'mock-row-id', ...record }, error: null }) }) };
        },
        update(fields) {
          return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'mock-row-id', ...fields }, error: null }) }) }) };
        }
      };
    }
  };
}

describe('storeSubAgentResults stamps metadata.evaluated_commit_sha (FR-2 wiring)', () => {
  const capture = {};

  beforeEach(() => {
    capture.inserted = null;
    capture.insertedTable = null;

    // The pure-function describe block above statically imports results-storage.js (unmocked),
    // which populates vitest's module cache before this block's doMock calls run. Without an
    // explicit reset here, the FIRST dynamic import below would return that already-cached real
    // module -- silently bypassing the mocked supabase client and hitting the network guard.
    vi.resetModules();

    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture)
    }));
    vi.doMock('../../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../scripts/modules/sd-id-normalizer.js');
  });

  it('stamps a real SHA when the caller-supplied metadata names a real repo_path', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      metadata: { repo_path: process.cwd() },
    });
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
    expect(capture.inserted.metadata.evaluated_commit_sha).toBe(expected);
  });

  it('a caller-supplied metadata.evaluated_commit_sha is NOT trusted -- overwritten by what this writer actually observed', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, {
      verdict: 'PASS',
      confidence: 90,
      metadata: { repo_path: process.cwd(), evaluated_commit_sha: 'forged0000000000000000000000000000000000' },
    });
    expect(capture.inserted.metadata.evaluated_commit_sha).not.toBe('forged0000000000000000000000000000000000');
    expect(capture.inserted.metadata.evaluated_commit_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('stamps null (never throws) when no repo_path/executed_from_cwd is present', async () => {
    const { storeSubAgentResults } = await import('../../../lib/sub-agent-executor/results-storage.js');
    await storeSubAgentResults('TESTING', 'SD-TEST-001', null, { verdict: 'PASS', confidence: 90 });
    expect(capture.inserted.metadata.evaluated_commit_sha).toBeNull();
  });
});
