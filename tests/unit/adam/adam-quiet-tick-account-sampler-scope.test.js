/**
 * QF-20260906-219 — the fleet-account-identity sampler (adam-quiet-tick.mjs's `main()`) called
 * getAccountIdentity() BARE, which always reads the machine-global ~/.claude.json regardless of
 * a seat's own CLAUDE_CONFIG_DIR profile -- "the account sampler measures the file, not the
 * seat" (Solomon diagnosis cd6647b2). Extracted into resolveAccountSamplerIdentity() so the
 * CLAUDE_CONFIG_DIR-aware branch is unit-testable without pulling apart the whole of main()
 * (mirrors resolveMainRepoRoot()'s own extraction, see adam-quiet-tick-account-identity-shared-
 * root.test.js). Ships dormant: identical to a bare call until a seat actually has
 * CLAUDE_CONFIG_DIR set, which is deliberate -- no live seat does yet.
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { resolveAccountSamplerIdentity, resolveAccountSamplerSourcePath } from '../../../scripts/adam-quiet-tick.mjs';

const require_ = createRequire(import.meta.url);
const { resolveRealConfigPath } = require_('../../../lib/fleet/account-identity.cjs');

describe('resolveAccountSamplerIdentity (QF-20260906-219)', () => {
  it('DORMANT TODAY: with no CLAUDE_CONFIG_DIR set, calls identityFn with no argument (bare, machine-global) -- unchanged from pre-fix behavior', () => {
    const identityFn = vi.fn(() => ({ email: 'host@example.com', orgName: 'Org', accountUuid8: 'aaaaaaaa' }));
    const result = resolveAccountSamplerIdentity({}, identityFn);
    expect(identityFn).toHaveBeenCalledWith();
    expect(result).toEqual({ email: 'host@example.com', orgName: 'Org', accountUuid8: 'aaaaaaaa' });
  });

  it('ACTIVE ONCE A PROFILE EXISTS: with CLAUDE_CONFIG_DIR set, calls identityFn with THAT seat\'s own .claude.json path -- never the machine-global file', () => {
    const identityFn = vi.fn(() => ({ email: 'seat@example.com', orgName: 'SeatOrg', accountUuid8: 'bbbbbbbb' }));
    const profileDir = join('fleet-profiles', 'canary');
    const result = resolveAccountSamplerIdentity({ CLAUDE_CONFIG_DIR: profileDir }, identityFn);
    expect(identityFn).toHaveBeenCalledWith(join(profileDir, '.claude.json'));
    expect(result).toEqual({ email: 'seat@example.com', orgName: 'SeatOrg', accountUuid8: 'bbbbbbbb' });
  });

  it('propagates a null resolution (fail-safe passthrough, never throws or coerces)', () => {
    const identityFn = vi.fn(() => null);
    expect(resolveAccountSamplerIdentity({}, identityFn)).toBeNull();
    expect(resolveAccountSamplerIdentity({ CLAUDE_CONFIG_DIR: join('a', 'b') }, identityFn)).toBeNull();
  });

  it('defaults env to process.env when omitted (does not require an explicit env argument)', () => {
    // Deterministic regardless of whether THIS test host happens to have CLAUDE_CONFIG_DIR set --
    // asserts only that omitting env delegates to process.env rather than throwing/ignoring it.
    const identityFn = vi.fn(() => ({ email: 'default@example.com', orgName: 'Org', accountUuid8: 'cccccccc' }));
    const result = resolveAccountSamplerIdentity(undefined, identityFn);
    const expectedArg = process.env.CLAUDE_CONFIG_DIR
      ? [join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')]
      : [];
    expect(identityFn.mock.calls[0]).toEqual(expectedArg);
    expect(result).toEqual({ email: 'default@example.com', orgName: 'Org', accountUuid8: 'cccccccc' });
  });
});

/**
 * SD-LEO-INFRA-STAMP-CLAUDE-SESSIONS-001 (LEAD-phase prospective TESTING finding): the state file
 * saveLastAccountIdentity() writes always stamped `source: resolveRealConfigPath()` (machine-
 * global) unconditionally, even for a reading resolveAccountSamplerIdentity() actually took from a
 * seat-scoped CLAUDE_CONFIG_DIR profile -- reintroducing the exact provenance lie QF-20260901-848's
 * `source` field exists to prevent. resolveAccountSamplerSourcePath() is the SAME branch as
 * resolveAccountSamplerIdentity(), extracted so main() can pass the genuinely-correct path to
 * saveLastAccountIdentity() instead of always defaulting to the machine-global one.
 */
describe('resolveAccountSamplerSourcePath (SD-LEO-INFRA-STAMP-CLAUDE-SESSIONS-001)', () => {
  it('DORMANT TODAY: with no CLAUDE_CONFIG_DIR set, returns the machine-global resolveRealConfigPath() -- unchanged from pre-fix behavior', () => {
    expect(resolveAccountSamplerSourcePath({})).toBe(resolveRealConfigPath());
  });

  it('ACTIVE ONCE A PROFILE EXISTS: with CLAUDE_CONFIG_DIR set, returns that seat own .claude.json path -- never the machine-global one', () => {
    const profileDir = join('fleet-profiles', 'canary');
    const result = resolveAccountSamplerSourcePath({ CLAUDE_CONFIG_DIR: profileDir });
    expect(result).toBe(join(profileDir, '.claude.json'));
    expect(result).not.toBe(resolveRealConfigPath());
  });

  it('agrees with resolveAccountSamplerIdentity() on WHICH branch fires, for the same env -- the two can never disagree by construction', () => {
    const identityFn = vi.fn(() => ({ email: 'x@example.com', orgName: 'X', accountUuid8: 'xxxxxxxx' }));
    const withProfile = { CLAUDE_CONFIG_DIR: join('fleet-profiles', 'canary') };
    resolveAccountSamplerIdentity(withProfile, identityFn);
    expect(identityFn).toHaveBeenCalledWith(resolveAccountSamplerSourcePath(withProfile));
  });
});
