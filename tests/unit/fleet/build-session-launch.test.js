// SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-1) — the canonical buildSessionLaunch.
import { describe, it, expect } from 'vitest';
import {
  buildSessionLaunch, assertLaunchContract, resolveClaudeCmd, resolveRepoRoot, LaunchResolveError,
} from '../../../lib/fleet/build-session-launch.cjs';

const PROFILES = 'C:\\fleet\\profiles';

describe('buildSessionLaunch — the canonical launch contract', () => {
  it('carries full claude token, explicit -d cwd, persistent, and no headless -p', () => {
    const inv = buildSessionLaunch({ role: 'worker', callsign: 'Bravo', cwd: 'R:\\repo' });
    expect(inv.program).toBe('wt.exe');
    expect(inv.persistent).toBe(true);
    const dIdx = inv.args.indexOf('-d');
    expect(dIdx).toBeGreaterThanOrEqual(0);
    expect(inv.args[dIdx + 1]).toBe('R:\\repo');
    expect(inv.cwd).toBe('R:\\repo');
    expect(inv.args).not.toContain('-p');
    expect(inv.args[inv.args.indexOf('--') + 1]).toMatch(/claude(\.cmd|\.exe)?$/i);
  });

  it('injects CLAUDE_CONFIG_DIR from a resolved profile NAME (child env only)', () => {
    const inv = buildSessionLaunch({ callsign: 'W', profile: 'canary', cwd: 'R:\\r' }, { env: { FLEET_ACCOUNT_PROFILES_DIR: PROFILES } });
    expect(inv.env.CLAUDE_CONFIG_DIR).toBe('C:\\fleet\\profiles\\canary');
    expect(inv.args).not.toContain('C:\\fleet\\profiles\\canary'); // never an argv token
  });

  it('accepts a pre-resolved profileDir (back-compat with spawn-control)', () => {
    const inv = buildSessionLaunch({ callsign: 'W', profileDir: 'D:\\p\\x', cwd: 'R:\\r' });
    expect(inv.env.CLAUDE_CONFIG_DIR).toBe('D:\\p\\x');
  });

  it('FAILS LOUD when a requested profile cannot resolve (no silent no-isolation launch)', () => {
    expect(() => buildSessionLaunch({ profile: 'canary', cwd: 'R:\\r' }, { env: {} })).toThrow(LaunchResolveError);
    expect(() => buildSessionLaunch({ profile: '../evil', cwd: 'R:\\r' }, { env: { FLEET_ACCOUNT_PROFILES_DIR: PROFILES } })).toThrow(LaunchResolveError);
  });

  it('encodes auto-resume via FLEET_AUTORESUME_SD when sdToResume is given', () => {
    const inv = buildSessionLaunch({ callsign: 'W', cwd: 'R:\\r', sdToResume: 'SD-X-001' });
    expect(inv.env.FLEET_AUTORESUME_SD).toBe('SD-X-001');
  });

  it('appends --resume <uuid> when a resumeUuid is given (reattach a captured session)', () => {
    const inv = buildSessionLaunch({ callsign: 'W', cwd: 'R:\\r', resumeUuid: 'u-1' });
    expect(inv.args).toContain('--resume');
    expect(inv.args[inv.args.indexOf('--resume') + 1]).toBe('u-1');
  });

  it('defaults cwd to the repo root when none is given', () => {
    const inv = buildSessionLaunch({ callsign: 'W' });
    expect(inv.cwd).toBe(resolveRepoRoot());
    expect(inv.cwd.length).toBeGreaterThan(0);
  });
});

describe('resolveClaudeCmd', () => {
  it('honors an explicit override, else falls back to bare claude', () => {
    expect(resolveClaudeCmd({ FLEET_CLAUDE_CMD: 'X:\\claude.cmd' })).toBe('X:\\claude.cmd');
    expect(resolveClaudeCmd({})).toBe('claude');
  });
});

describe('assertLaunchContract — the conformance predicate', () => {
  it('passes a compliant invocation and flags a non-compliant one', () => {
    const good = buildSessionLaunch({ callsign: 'W', profile: 'canary', cwd: 'R:\\r', sdToResume: 'SD-Y' }, { env: { FLEET_ACCOUNT_PROFILES_DIR: PROFILES } });
    expect(assertLaunchContract(good, { expectProfile: true, expectResume: true }).ok).toBe(true);

    const headless = { program: 'claude', args: ['-p', 'prompt'], env: {}, persistent: false };
    const r = assertLaunchContract(headless);
    expect(r.ok).toBe(false);
    expect(r.violations.join(' ')).toMatch(/persistent|headless|-d|claude/i);
  });
});
