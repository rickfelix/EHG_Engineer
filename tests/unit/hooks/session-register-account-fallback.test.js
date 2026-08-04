/**
 * QF-20260727-013 — the account stamp must not be able to go dark silently.
 *
 * QF-20260726-514 shipped resolveAccountIdentity() and it wrote nothing for two days: the CLI
 * answered loggedIn:true with every identity field null, the guard correctly returned null, and
 * NOTHING RECORDED THAT. A 100%-dark instrument was indistinguishable from a healthy one nobody
 * had queried.
 *
 * The two properties pinned here are the ones easiest to regress by "simplifying":
 *   1. the fallback NEVER reads the host-global config (that is last-writer-wins, the exact
 *      defect 514 existed to fix — reintroduced "through a different door");
 *   2. an unresolved account is RECORDED, while the identity fields keep their honest absence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { resolveAccountIdentity, captureAccountIdentity } =
  require_('../../../scripts/hooks/session-register.cjs');

/** Records every metadata patch so we can assert on the WRITE, not a return value. */
function fakeSupabase(existingMeta = {}) {
  const writes = [];
  return {
    writes,
    from() {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: existingMeta }, error: null }) }) }),
        update: (patch) => ({ eq: () => { writes.push(patch); return { error: null }; } }),
      };
    },
  };
}

const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
beforeEach(() => {
  if (ORIGINAL_CONFIG_DIR === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
  vi.restoreAllMocks();
});

describe('QF-013 — fallback is per-profile or nothing', () => {
  it('returns null when CLAUDE_CONFIG_DIR is unset, rather than reading the host-global config', () => {
    // THE LOAD-BEARING ASSERTION. Reading ~/.claude.json here would make every seat on the host
    // report the same account and would look correct until the fleet splits across accounts.
    delete process.env.CLAUDE_CONFIG_DIR;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    expect(resolveAccountIdentity()).toBeNull();
    spy.mockRestore();
  });

  it('CONTROL — with CLAUDE_CONFIG_DIR set to a real profile, the fallback DOES resolve', () => {
    // Without this, the assertion above passes just as well on a fallback that never works at all.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf013-'));
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({
      oauthAccount: { emailAddress: 'seat@example.com', organizationName: 'Org', accountUuid: 'abcdefgh-1111-2222-3333-444444444444' },
    }));
    process.env.CLAUDE_CONFIG_DIR = dir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toMatchObject({ account_email: 'seat@example.com', account_org_name: 'Org' });
  });

  it('does not invent org_id / subscription_type the oauthAccount never carried', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf013-'));
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({
      oauthAccount: { emailAddress: 'seat@example.com', organizationName: 'Org', accountUuid: 'abcdefgh-1111-2222-3333-444444444444' },
    }));
    process.env.CLAUDE_CONFIG_DIR = dir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('nope');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got.account_org_id).toBeNull();
    expect(got.account_subscription_type).toBeNull();
  });
});

describe('QF-013 — darkness is recorded', () => {
  it('stamps account_unresolved_at when nothing resolves, and writes NO identity fields', async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const sb = fakeSupabase({ model: 'opus' });
    await captureAccountIdentity(sb, 'sess-1');
    spy.mockRestore();

    expect(sb.writes).toHaveLength(1);
    const meta = sb.writes[0].metadata;
    expect(meta.account_unresolved_at).toEqual(expect.any(String));
    expect(meta.model).toBe('opus');            // read-modify-write preserved, never clobbered
    expect('account_email' in meta).toBe(false); // absence stays honest — no placeholder
  });

  it('writes nothing at all when the account was already captured', async () => {
    const sb = fakeSupabase({ account_email: 'already@example.com' });
    await captureAccountIdentity(sb, 'sess-1');
    expect(sb.writes).toEqual([]);
  });
});
