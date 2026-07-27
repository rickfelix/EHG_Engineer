/**
 * QF-20260726-757 — LEO-spawned sessions must not come up in a prompting permission mode.
 *
 * Chairman-directed: "We need to run these claude sessions with auto mode on by default."
 *
 * WHY IT IS A CORRECTNESS BUG, not a preference: a spawned session has no operator at the keyboard,
 * so the first tool call needing approval blocks forever. From outside, that seat is
 * INDISTINGUISHABLE FROM A DEAD ONE — loop_state stays active, the tick daemon keeps the heartbeat
 * fresh, and last_tool_at freezes. That is the phantom-seat signature diagnosed on Alpha-5, so the
 * fleet's liveness instruments cannot separate a permission-blocked worker from a crashed one.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSessionLaunch,
  resolvePermissionMode,
  VALID_PERMISSION_MODES,
  DEFAULT_PERMISSION_MODE,
} = require('../../../lib/fleet/build-session-launch.cjs');

const FRESH = { role: 'worker', callsign: 'T1', cwd: process.cwd() };
const RESUME = { role: 'worker', callsign: 'T2', cwd: process.cwd(), resumeUuid: '11111111-1111-4111-8111-111111111111' };

const modeOf = (args) => {
  const i = args.indexOf('--permission-mode');
  return i === -1 ? null : args[i + 1];
};

describe('spawn permission mode', () => {
  it('FRESH spawns carry --permission-mode auto', () => {
    expect(modeOf(buildSessionLaunch(FRESH, { env: {} }).args)).toBe('auto');
  });

  it('RESUME spawns carry it too — the two paths diverge and BOTH need it', () => {
    // The row called out "applying it to the resume path only or the fresh path only" as a
    // do-not-accept, because --resume and --session-id are set in different branches.
    expect(modeOf(buildSessionLaunch(RESUME, { env: {} }).args)).toBe('auto');
  });

  it('uses auto and NEVER substitutes the bypass flag', () => {
    for (const spec of [FRESH, RESUME]) {
      const { args } = buildSessionLaunch(spec, { env: {} });
      // --dangerously-skip-permissions is a strictly WIDER grant that disables more than
      // prompting. The chairman asked for auto; auto is sufficient and narrower.
      expect(args).not.toContain('--dangerously-skip-permissions');
      expect(args).not.toContain('--allow-dangerously-skip-permissions');
    }
  });

  it('is CONFIGURABLE — an override can spawn a seat that DOES pause', () => {
    const { args } = buildSessionLaunch(FRESH, { env: { FLEET_SPAWN_PERMISSION_MODE: 'manual' } });
    expect(modeOf(args)).toBe('manual');
  });

  it('accepts every mode the CLI accepts, including the two the QF row omitted', () => {
    // `claude --help` on 2.1.220 lists SIX choices; the row enumerated four. Copying the row would
    // have made these two silently fall back to auto instead of being honoured.
    expect(VALID_PERMISSION_MODES).toContain('dontAsk');
    expect(VALID_PERMISSION_MODES).toContain('plan');
    for (const m of VALID_PERMISSION_MODES) expect(resolvePermissionMode({ FLEET_SPAWN_PERMISSION_MODE: m })).toBe(m);
  });

  it('emits the CLI’s exact spelling for a case-mismatched override', () => {
    // 'acceptedits' would be rejected by the CLI and fail the whole launch.
    expect(resolvePermissionMode({ FLEET_SPAWN_PERMISSION_MODE: 'acceptedits' })).toBe('acceptEdits');
  });

  it('falls back to the default on an unrecognised override rather than forwarding it', () => {
    // A config typo must not become a dead spawn: an invalid --permission-mode makes the CLI
    // reject the entire invocation, so a bad value is worse than no value.
    expect(resolvePermissionMode({ FLEET_SPAWN_PERMISSION_MODE: 'nonsense' })).toBe(DEFAULT_PERMISSION_MODE);
    expect(resolvePermissionMode({ FLEET_SPAWN_PERMISSION_MODE: '   ' })).toBe(DEFAULT_PERMISSION_MODE);
    expect(resolvePermissionMode({})).toBe(DEFAULT_PERMISSION_MODE);
  });

  it('places the flag among the claude args, after the wt.exe separator', () => {
    const { args } = buildSessionLaunch(FRESH, { env: {} });
    // `--` separates wt.exe's own options from the command it runs. A permission flag landing
    // before it would be parsed by wt.exe and never reach claude.
    expect(args.indexOf('--permission-mode')).toBeGreaterThan(args.indexOf('--'));
  });
});
