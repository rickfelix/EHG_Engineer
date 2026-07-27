/**
 * QF-20260727-794 — name the Windows Terminal tab at spawn.
 *
 * Chairman-reported: with nine worker windows plus three role sessions open, the tab strip is the
 * only way to reach a specific seat and it identified none of them — a coordinator tab read
 * "Load and Execute Startup", which is Claude Code's conversation summary.
 *
 * The title MUST be set at spawn: a running session cannot retitle its own tab (both runtime
 * routes were measured dead before this row was filed). --suppressApplicationTitle is LOAD-BEARING,
 * because without it Claude Code's own title updates overwrite --title within seconds.
 *
 * HOST-VERIFIED, not taken from docs: Windows Terminal 1.24.11911.0, a throwaway tab spawned with
 * these flags while running a command that otherwise self-titles "Start-Sleep" displayed the
 * --title value instead — proving both that --title lands and that --suppressApplicationTitle
 * beats the application title.
 *
 * The contract assertions below matter beyond cosmetics: assertLaunchContract is enforced at three
 * live spawn seams, so a regression in arg RELATIONSHIPS refuses every spawn fleet-wide.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSessionLaunch, assertLaunchContract, formatTabTitle,
} from '../../../lib/fleet/build-session-launch.cjs';

describe('formatTabTitle — number leads, name trails (chairman amendment)', () => {
  it('renders "<n> · <callsign>" — the number is the anchor', () => {
    expect(formatTabTitle({ windowNumber: 3, callsign: 'Alpha' })).toBe('3 · Alpha');
  });

  it('role sessions read as their role, which is the case the chairman raised', () => {
    expect(formatTabTitle({ windowNumber: 1, callsign: 'Coordinator' })).toBe('1 · Coordinator');
    expect(formatTabTitle({ windowNumber: 2, role: 'adam' })).toBe('2 · adam');
  });

  it('accepts a numeric string (the DB round-trips metadata as text)', () => {
    expect(formatTabTitle({ windowNumber: '7', callsign: 'Bravo' })).toBe('7 · Bravo');
  });

  it('degrades gracefully rather than emitting an empty title', () => {
    expect(formatTabTitle({ callsign: 'Alpha' })).toBe('Alpha');       // no number yet
    expect(formatTabTitle({ role: 'worker' })).toBe('worker');          // no callsign
    expect(formatTabTitle({ windowNumber: 4 })).toBe('4 · session');    // no identity
    expect(formatTabTitle({})).toBe('LEO session');                     // nothing at all
    expect(formatTabTitle()).toBe('LEO session');
  });

  it('ignores a non-numeric windowNumber instead of printing garbage', () => {
    expect(formatTabTitle({ windowNumber: 'NaN', callsign: 'Alpha' })).toBe('Alpha');
    expect(formatTabTitle({ windowNumber: '', callsign: 'Alpha' })).toBe('Alpha');
    expect(formatTabTitle({ windowNumber: null, callsign: 'Alpha' })).toBe('Alpha');
  });
});

describe('buildSessionLaunch — the tab is named, and the launch contract still holds', () => {
  const spec = { role: 'worker', callsign: 'Alpha', windowNumber: 3, cwd: 'R:\\repo' };

  it('passes --title with the formatted value', () => {
    const { args } = buildSessionLaunch(spec);
    const i = args.indexOf('--title');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('3 · Alpha');
  });

  it('passes --suppressApplicationTitle — without it Claude Code overwrites the title in seconds', () => {
    expect(buildSessionLaunch(spec).args).toContain('--suppressApplicationTitle');
  });

  it('DOES NOT DISTURB assertLaunchContract — it is enforced at three live spawn seams', () => {
    const inv = buildSessionLaunch(spec);
    const r = assertLaunchContract(inv);
    expect(r.ok, `violations: ${(r.violations || []).join('; ')}`).toBe(true);
  });

  it('preserves every arg RELATIONSHIP the contract checks by indexOf, not by fixed offset', () => {
    const { args } = buildSessionLaunch(spec);
    const w = args.indexOf('-w');
    const nt = args.indexOf('new-tab');
    const d = args.indexOf('-d');
    const dd = args.indexOf('--');
    expect(args[w + 1]).toBe('new');
    expect(w).toBeLessThan(nt);            // -w is global; must precede the subcommand
    expect(args[d + 1]).toBe('R:\\repo');  // -d still followed by the cwd
    expect(nt).toBeLessThan(d);            // new flags sit between new-tab and -d
    expect(d).toBeLessThan(dd);            // -- still last, claude token after it
    expect(args[dd + 1]).toMatch(/claude(\.cmd|\.exe)?$/i);
    expect(args).not.toContain('-p');
  });

  it('still names the tab when no window number was allocated (fix degrades, never blanks)', () => {
    const { args } = buildSessionLaunch({ role: 'worker', callsign: 'Solomon', cwd: 'R:\\repo' });
    expect(args[args.indexOf('--title') + 1]).toBe('Solomon');
    expect(assertLaunchContract(buildSessionLaunch({ role: 'worker', cwd: 'R:\\repo' })).ok).toBe(true);
  });
});
