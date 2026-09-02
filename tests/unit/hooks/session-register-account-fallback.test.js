/**
 * QF-20260727-013 — the account stamp must not be able to go dark silently.
 *
 * QF-20260726-514 shipped resolveAccountIdentity() and it wrote nothing for two days: the CLI
 * answered loggedIn:true with every identity field null, the guard correctly returned null, and
 * NOTHING RECORDED THAT. A 100%-dark instrument was indistinguishable from a healthy one nobody
 * had queried.
 *
 * SD-FDBK-INFRA-SESSION-NAMED-ACCOUNT-001 FR-3 (measured LEAD-phase live: this session, with
 * CLAUDE_CONFIG_DIR unset, was permanently account_unresolved_at despite a real, readable
 * identity on disk) changed the CLAUDE_CONFIG_DIR-unset behavior from an unconditional refusal
 * to a host-default fallback read — the fleet runs ONE account at a time, so the host-default
 * ~/.claude.json is the unambiguous answer for a session with no per-profile scope in play.
 *
 * The property still pinned here, UNCHANGED: a session that DOES have a scoped CLAUDE_CONFIG_DIR
 * reads ONLY that scoped path, never the host default, even when a different host-default
 * identity exists (see "regression guard" below) — that is the exact QF-20260726-514 property
 * this fix must not reintroduce a hole in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function writeClaudeJson(dir, { email, org, uuid }) {
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({
    oauthAccount: { emailAddress: email, organizationName: org, accountUuid: uuid },
  }));
}

const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const ORIGINAL_LAUNCH_INTENT = process.env.FLEET_LAUNCH_PROFILE_INTENT;
beforeEach(() => {
  if (ORIGINAL_CONFIG_DIR === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
  delete process.env.FLEET_LAUNCH_PROFILE_INTENT;
  vi.restoreAllMocks();
});
afterEach(() => {
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  if (ORIGINAL_LAUNCH_INTENT === undefined) delete process.env.FLEET_LAUNCH_PROFILE_INTENT;
  else process.env.FLEET_LAUNCH_PROFILE_INTENT = ORIGINAL_LAUNCH_INTENT;
});

describe('QF-013 / FR-3 — profile-scoped or host-default, never a mismatch', () => {
  it('FR-3: resolves via the host-default config when CLAUDE_CONFIG_DIR is unset (was: unconditional null)', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3-hostdefault-'));
    writeClaudeJson(dir, { email: 'host-default@example.com', org: 'HostOrg', uuid: 'aaaaaaaa-1111-2222-3333-444444444444' });
    process.env.USERPROFILE = dir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toMatchObject({
      account_email: 'host-default@example.com',
      account_org_name: 'HostOrg',
      account_uuid8: 'aaaaaaaa',
      account_auth_method: 'host_default',
    });
  });

  it('REGRESSION GUARD: with CLAUDE_CONFIG_DIR set, the scoped profile resolves — the host-default fallback never contaminates it, even when a DIFFERENT host-default identity exists', () => {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3-profile-'));
    writeClaudeJson(profileDir, { email: 'profile-seat@example.com', org: 'ProfileOrg', uuid: 'bbbbbbbb-1111-2222-3333-444444444444' });
    const hostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3-hostdefault-decoy-'));
    writeClaudeJson(hostDir, { email: 'WRONG-host-default@example.com', org: 'WrongOrg', uuid: 'cccccccc-1111-2222-3333-444444444444' });
    process.env.CLAUDE_CONFIG_DIR = profileDir;
    process.env.USERPROFILE = hostDir; // must NEVER be read while CLAUDE_CONFIG_DIR is set
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toMatchObject({
      account_email: 'profile-seat@example.com',
      account_org_name: 'ProfileOrg',
      account_uuid8: 'bbbbbbbb',
      account_auth_method: 'config_dir',
    });
  });

  it('coordinator ruling 1cbade73: a NAMED profile intent with no CLAUDE_CONFIG_DIR stays unresolved -- the host-default fallback must NOT fire for a lost fleet profile', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    process.env.FLEET_LAUNCH_PROFILE_INTENT = 'named'; // build-session-launch.cjs expected a named profile
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-lostprofile-'));
    writeClaudeJson(dir, { email: 'should-not-be-read@example.com', org: 'Org', uuid: 'eeeeeeee-1111-2222-3333-444444444444' });
    process.env.USERPROFILE = dir; // a real, readable host-default identity exists but must be ignored
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toBeNull();
  });

  it('a host-default intent (or no intent at all) with no CLAUDE_CONFIG_DIR still resolves via the host default', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    process.env.FLEET_LAUNCH_PROFILE_INTENT = 'host-default'; // deliberate no-isolation choice
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-hostdefault-intent-'));
    writeClaudeJson(dir, { email: 'host-default-intent@example.com', org: 'Org', uuid: 'ffffffff-1111-2222-3333-444444444444' });
    process.env.USERPROFILE = dir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toMatchObject({ account_email: 'host-default-intent@example.com', account_uuid8: 'ffffffff' });
  });

  it('CONTROL — with CLAUDE_CONFIG_DIR set to a real profile, the fallback DOES resolve', () => {
    // Without this, the assertion above passes just as well on a fallback that never works at all.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf013-'));
    writeClaudeJson(dir, { email: 'seat@example.com', org: 'Org', uuid: 'abcdefgh-1111-2222-3333-444444444444' });
    process.env.CLAUDE_CONFIG_DIR = dir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toMatchObject({ account_email: 'seat@example.com', account_org_name: 'Org' });
  });

  it('FR-2: when the CLI path resolves (loggedIn:true, no uuid field), account_uuid8 is filled from the file-based reader at the SAME scoped path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr2-cli-'));
    writeClaudeJson(dir, { email: 'cli-seat@example.com', org: 'CliOrg', uuid: 'dddddddd-1111-2222-3333-444444444444' });
    process.env.CLAUDE_CONFIG_DIR = dir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => JSON.stringify({
      loggedIn: true,
      email: 'cli-seat@example.com', // CLI's own answer, authoritative for email/org
      orgName: 'CliOrg',
      orgId: null,
      subscriptionType: null,
      authMethod: 'claude.ai',
      // note: no uuid-shaped field anywhere in the CLI's JSON — never has one.
    }));
    const got = resolveAccountIdentity();
    spy.mockRestore();
    expect(got).toMatchObject({
      account_email: 'cli-seat@example.com',
      account_auth_method: 'claude.ai', // came from the CLI path, not the file fallback
      account_uuid8: 'dddddddd',        // filled from the file read at the same scoped dir
    });
  });

  it('does not invent org_id / subscription_type the oauthAccount never carried', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf013-'));
    writeClaudeJson(dir, { email: 'seat@example.com', org: 'Org', uuid: 'abcdefgh-1111-2222-3333-444444444444' });
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
  it('stamps account_unresolved_at when nothing resolves (CLI fails AND the host-default file is unreadable), and writes NO identity fields', async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    // An empty temp dir as USERPROFILE => no .claude.json => host-default read also fails,
    // so this stays a genuine "nothing resolved" case under FR-3, deterministically.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3-empty-'));
    process.env.USERPROFILE = emptyDir;
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

  it('stamps launch_profile_expected=true only when FLEET_LAUNCH_PROFILE_INTENT=named, even on the unresolved-darkness write', async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    process.env.FLEET_LAUNCH_PROFILE_INTENT = 'named';
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-expected-'));
    process.env.USERPROFILE = emptyDir; // irrelevant here -- 'named' refuses before any file read
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const sb = fakeSupabase({ model: 'opus' });
    await captureAccountIdentity(sb, 'sess-1');
    spy.mockRestore();

    expect(sb.writes).toHaveLength(1);
    const meta = sb.writes[0].metadata;
    expect(meta.account_unresolved_at).toEqual(expect.any(String));
    expect(meta.launch_profile_expected).toBe(true);
  });

  it('does NOT stamp launch_profile_expected when no fleet launch intent is present (absent, not false)', async () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.FLEET_LAUNCH_PROFILE_INTENT;
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-notexpected-'));
    process.env.USERPROFILE = emptyDir;
    const spy = vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => {
      throw new Error('claude CLI unavailable');
    });
    const sb = fakeSupabase({ model: 'opus' });
    await captureAccountIdentity(sb, 'sess-1');
    spy.mockRestore();

    expect(sb.writes).toHaveLength(1);
    expect('launch_profile_expected' in sb.writes[0].metadata).toBe(false);
  });
});
