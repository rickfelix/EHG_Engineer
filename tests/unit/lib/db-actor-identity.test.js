/**
 * SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 — FR-4.
 * Unit coverage for the three actor-resolution tiers feeding the two shared DB-client
 * factories: env session id, role-tag fallback, and the 'none' case (no header injected).
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveActorIdentity, withActorHeader } from '../../../lib/db-actor-identity.js';

/** A tmp repoRoot with no .claude/session-identity/current pointer file — forces source 'none'. */
function emptyRepoRoot() {
  return mkdtempSync(path.join(tmpdir(), 'db-actor-id-'));
}

/** A tmp repoRoot carrying a pointer file — exercises resolveClaimIdentity's pointer_fallback tier. */
function repoRootWithPointer(pointerId) {
  const root = mkdtempSync(path.join(tmpdir(), 'db-actor-id-ptr-'));
  const dir = path.join(root, '.claude', 'session-identity');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'current'), JSON.stringify({ session_id: pointerId }));
  return root;
}

describe('resolveActorIdentity', () => {
  it('delegates to resolveClaimIdentity and returns actorId=sessionId when CLAUDE_SESSION_ID is set', () => {
    const r = resolveActorIdentity({ CLAUDE_SESSION_ID: 'sess-123' }, { repoRoot: emptyRepoRoot() });
    expect(r).toEqual({ actorId: 'sess-123', source: 'env' });
  });

  it('falls back to a role-tag when resolveClaimIdentity resolves to source=none', () => {
    const r = resolveActorIdentity({ LEO_ACTOR_ROLE_TAG: 'coordinator-cron' }, { repoRoot: emptyRepoRoot() });
    expect(r).toEqual({ actorId: 'role:coordinator-cron', source: 'role_tag_fallback' });
  });

  it('role-tag fallback is NOT consulted when an env session id is already present', () => {
    const r = resolveActorIdentity(
      { CLAUDE_SESSION_ID: 'sess-123', LEO_ACTOR_ROLE_TAG: 'coordinator-cron' },
      { repoRoot: emptyRepoRoot() },
    );
    expect(r).toEqual({ actorId: 'sess-123', source: 'env' });
  });

  it('resolves to actorId=null, source=none when neither env, pointer, nor role tag is present', () => {
    const r = resolveActorIdentity({}, { repoRoot: emptyRepoRoot() });
    expect(r).toEqual({ actorId: null, source: 'none' });
  });

  it('ignores a blank-string role tag (treats as absent)', () => {
    const r = resolveActorIdentity({ LEO_ACTOR_ROLE_TAG: '   ' }, { repoRoot: emptyRepoRoot() });
    expect(r).toEqual({ actorId: null, source: 'none' });
  });

  // Regression-agent finding (VERIFY phase): a stale/wrong pointer file is last-writer-wins
  // under concurrency — fine for claim tracking, but a wrong-but-specific session uuid on an
  // audit_log row reads as trustworthy and is worse than the honest, generic session_user
  // fallback. resolveActorIdentity must therefore treat pointer_fallback exactly like 'none'.
  it('discards resolveClaimIdentity pointer_fallback -- resolves to none, not the pointer session id', () => {
    const root = repoRootWithPointer('stale-pointer-session-id');
    const r = resolveActorIdentity({}, { repoRoot: root });
    expect(r).toEqual({ actorId: null, source: 'none' });
  });

  it('still applies the role-tag fallback when the only available source is a discarded pointer', () => {
    const root = repoRootWithPointer('stale-pointer-session-id');
    const r = resolveActorIdentity({ LEO_ACTOR_ROLE_TAG: 'coordinator-cron' }, { repoRoot: root });
    expect(r).toEqual({ actorId: 'role:coordinator-cron', source: 'role_tag_fallback' });
  });

  it('never emits resolveClaimIdentity\'s pointer_fallback console.warn (would fire on every client construction)', () => {
    const root = repoRootWithPointer('stale-pointer-session-id');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      resolveActorIdentity({}, { repoRoot: root });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('env still wins even when a pointer file also exists', () => {
    const root = repoRootWithPointer('stale-pointer-session-id');
    const r = resolveActorIdentity({ CLAUDE_SESSION_ID: 'sess-123' }, { repoRoot: root });
    expect(r).toEqual({ actorId: 'sess-123', source: 'env' });
  });
});

describe('withActorHeader', () => {
  it('returns globalOptions unchanged when actorId is null', () => {
    const g = { fetch: 'placeholder' };
    expect(withActorHeader(g, null)).toBe(g);
  });

  it('injects x-actor-session into an empty/undefined globalOptions', () => {
    expect(withActorHeader(undefined, 'sess-123')).toEqual({ headers: { 'x-actor-session': 'sess-123' } });
  });

  it('merges with existing globalOptions (e.g. a custom fetch) without dropping it', () => {
    const fetchFn = () => {};
    const result = withActorHeader({ fetch: fetchFn }, 'sess-123');
    expect(result.fetch).toBe(fetchFn);
    expect(result.headers).toEqual({ 'x-actor-session': 'sess-123' });
  });

  it('a caller-supplied x-actor-session header wins over the injected one', () => {
    const result = withActorHeader({ headers: { 'x-actor-session': 'caller-value' } }, 'resolved-value');
    expect(result.headers['x-actor-session']).toBe('caller-value');
  });

  it('preserves other caller-supplied headers alongside the injected one', () => {
    const result = withActorHeader({ headers: { 'x-other': 'keep-me' } }, 'sess-123');
    expect(result.headers).toEqual({ 'x-actor-session': 'sess-123', 'x-other': 'keep-me' });
  });
});
