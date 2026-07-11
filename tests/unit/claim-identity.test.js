/**
 * Claim-identity integrity — SD-LEO-INFRA-CLAIM-IDENTITY-INTEGRITY-001.
 * TS-1 resolver precedence, TS-2 mismatch guard, TS-3 concurrency e2e
 * (N pairs of child processes, distinct env, shared root + pointer churn),
 * TS-4 identity_source stamping.
 */

import { describe, it, expect, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RESOLVER_URL = pathToFileURL(path.resolve('lib/claim/claim-identity.js')).href;
const fwd = (p) => p.replace(/\\/g, '/');
import { resolveClaimIdentity, checkIdentityMismatch } from '../../lib/claim/claim-identity.js';
import { stampClaim } from '../../lib/fleet/claim-stamp.cjs';

const execFileP = promisify(execFile);

/** Build a temp repo root carrying a pointer file with the given session id. */
function tmpRootWithPointer(pointerId) {
  const root = mkdtempSync(path.join(tmpdir(), 'claim-id-'));
  const dir = path.join(root, '.claude', 'session-identity');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'current'), JSON.stringify({ session_id: pointerId }));
  return root;
}

describe('resolveClaimIdentity (TS-1)', () => {
  it('env wins with source env; pointer never consulted', () => {
    const root = tmpRootWithPointer('pointer-session');
    const r = resolveClaimIdentity({ CLAUDE_SESSION_ID: 'env-session' }, { repoRoot: root, warn: vi.fn() });
    expect(r).toEqual({ sessionId: 'env-session', source: 'env' });
  });

  it('env absent falls back to pointer LOUDLY with source pointer_fallback', () => {
    const root = tmpRootWithPointer('pointer-session');
    const warn = vi.fn();
    const r = resolveClaimIdentity({}, { repoRoot: root, warn });
    expect(r.source).toBe('pointer_fallback');
    expect(r.sessionId).toBe('pointer-session');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('neither -> null with source none', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'claim-id-empty-'));
    const r = resolveClaimIdentity({}, { repoRoot: root, warn: vi.fn() });
    expect(r).toEqual({ sessionId: null, source: 'none' });
  });

  it('whitespace-only env is treated as absent', () => {
    const root = tmpRootWithPointer('pointer-session');
    const r = resolveClaimIdentity({ CLAUDE_SESSION_ID: '   ' }, { repoRoot: root, warn: vi.fn() });
    expect(r.source).toBe('pointer_fallback');
  });
});

describe('checkIdentityMismatch (TS-2 guard predicate)', () => {
  const envIdentity = { sessionId: 'env-a', source: 'env' };

  it('contradiction -> mismatch with both identities named', () => {
    expect(checkIdentityMismatch({ session_id: 'other-b' }, envIdentity))
      .toEqual({ mismatch: true, envId: 'env-a', adoptedId: 'other-b' });
  });

  it('agreement -> no mismatch', () => {
    expect(checkIdentityMismatch({ session_id: 'env-a' }, envIdentity).mismatch).toBe(false);
  });

  it('absence of env identity is NOT a conflict (human/pointer runs stay valid)', () => {
    expect(checkIdentityMismatch({ session_id: 'x' }, { sessionId: 'p', source: 'pointer_fallback' }).mismatch).toBe(false);
    expect(checkIdentityMismatch({ session_id: 'x' }, { sessionId: null, source: 'none' }).mismatch).toBe(false);
    expect(checkIdentityMismatch(null, envIdentity).mismatch).toBe(false);
  });
});

describe('stampClaim identity_source (TS-4)', () => {
  function mockSupabase(store) {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u1', metadata: store.metadata }, error: null }) }) }),
        update: (patch) => ({ eq: async () => { store.metadata = patch.metadata; return { error: null }; } }),
      }),
    };
  }

  it('stamps identity_source when provided and omits it when not', async () => {
    const store = { metadata: {} };
    await stampClaim(mockSupabase(store), 'SD-X-001', 'sess-1', 'pointer_fallback');
    expect(store.metadata.claim_history.at(-1)).toMatchObject({ session_id: 'sess-1', identity_source: 'pointer_fallback' });
    await stampClaim(mockSupabase(store), 'SD-X-001', 'sess-2');
    expect(store.metadata.claim_history.at(-1).identity_source).toBeUndefined();
  });
});

describe('concurrency e2e (TS-3 / FR-4): env always wins under shared-pointer churn', () => {
  it('N=12 concurrent children with distinct env each resolve their OWN identity — zero cross-adoption', async () => {
    const root = tmpRootWithPointer('initial-pointer');
    const pointerPath = path.join(root, '.claude', 'session-identity', 'current');
    // Child: churns the shared pointer (last-writer-wins simulation), then resolves.
    const childScript = `
      import { writeFileSync } from 'node:fs';
      import { resolveClaimIdentity } from ${JSON.stringify(RESOLVER_URL)};
      const me = process.env.CLAUDE_SESSION_ID;
      for (let i = 0; i < 20; i++) writeFileSync(${JSON.stringify(fwd(pointerPath))}, JSON.stringify({ session_id: me + '-pointer-' + i }));
      const r = resolveClaimIdentity(process.env, { repoRoot: ${JSON.stringify(fwd(root))}, warn: () => {} });
      console.log(JSON.stringify(r));
    `;
    const runChild = (id) => execFileP(process.execPath, ['--input-type=module', '-e', childScript], {
      cwd: root,
      env: { ...process.env, CLAUDE_SESSION_ID: id },
    }).then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)));

    const pairs = [];
    for (let n = 0; n < 6; n++) pairs.push([`sess-A-${n}`, `sess-B-${n}`]);
    const results = await Promise.all(pairs.flat().map((id) => runChild(id).then((r) => ({ id, r }))));

    for (const { id, r } of results) {
      expect(r.source).toBe('env');
      expect(r.sessionId).toBe(id); // zero cross-adoption
    }
  }, 60_000);

  it('negative: env-unset child resolves the pointer loudly', async () => {
    const root = tmpRootWithPointer('shared-pointer-x');
    const childScript = `
      import { resolveClaimIdentity } from ${JSON.stringify(RESOLVER_URL)};
      const r = resolveClaimIdentity(process.env, { repoRoot: ${JSON.stringify(fwd(root))} });
      console.log(JSON.stringify(r));
    `;
    const env = { ...process.env };
    delete env.CLAUDE_SESSION_ID;
    const { stdout, stderr } = await execFileP(process.execPath, ['--input-type=module', '-e', childScript], { cwd: root, env });
    const r = JSON.parse(stdout.trim().split('\n').at(-1));
    expect(r).toEqual({ sessionId: 'shared-pointer-x', source: 'pointer_fallback' });
    expect(stderr).toContain('pointer_fallback');
  }, 30_000);
});
