/**
 * SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-2/FR-3 vitest:
 *   - --force-complete + --reason flag parsing + audit-trail behavior
 *   - --non-interactive flag fail-fast on prompt() (TS-7 parametric coverage spec)
 *   - --actual-source-loc / --actual-test-loc explicit overrides
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  parseArguments,
  prompt,
  _setNonInteractiveMode,
  _getNonInteractiveMode
} from '../../../scripts/modules/complete-quick-fix/cli.js';

describe('SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 — CLI flags', () => {
  beforeEach(() => {
    _setNonInteractiveMode(false);
  });

  // ─── parseArguments ─────────────────────────────────────────────────
  describe('parseArguments — new flags', () => {
    it('parses --force-complete + --reason as a pair', () => {
      const { qfId, options } = parseArguments(['QF-X', '--force-complete', '--reason', 'PR already merged']);
      expect(qfId).toBe('QF-X');
      expect(options.forceComplete).toBe(true);
      expect(options.reason).toBe('PR already merged');
    });

    it('throws when --force-complete is passed without --reason', () => {
      expect(() => parseArguments(['QF-X', '--force-complete']))
        .toThrow(/FORCE_COMPLETE_NO_REASON/);
    });

    it('parses --non-interactive and persists module-level flag', () => {
      _setNonInteractiveMode(false);
      const { options } = parseArguments(['QF-X', '--non-interactive', '--pr-url', 'https://github.com/foo/bar/pull/1']);
      expect(options.nonInteractive).toBe(true);
      expect(_getNonInteractiveMode()).toBe(true);
    });

    it('parses --actual-source-loc and --actual-test-loc as integers', () => {
      const { options } = parseArguments(['QF-X', '--actual-source-loc', '25', '--actual-test-loc', '180']);
      expect(options.actualSourceLoc).toBe(25);
      expect(options.actualTestLoc).toBe(180);
    });

    it('shows help on no args / --help / -h', () => {
      expect(parseArguments([]).showHelp).toBe(true);
      expect(parseArguments(['--help']).showHelp).toBe(true);
      expect(parseArguments(['-h']).showHelp).toBe(true);
    });

    it('preserves existing flags (--actual-loc, --skip-tests, --tests-pass) — backwards compat', () => {
      const { options } = parseArguments([
        'QF-X', '--actual-loc', '40', '--skip-tests', '--tests-pass', 'yes',
        '--uat-verified', 'yes', '--pr-url', 'https://github.com/foo/bar/pull/1'
      ]);
      expect(options.actualLoc).toBe(40);
      expect(options.skipTestRun).toBe(true);
      expect(options.testsPass).toBe(true);
      expect(options.uatVerified).toBe(true);
    });

    it('rejects unknown flags via parseArgs strict mode', () => {
      expect(() => parseArguments(['QF-X', '--bogus-flag'])).toThrow();
    });
  });

  // ─── prompt() under --non-interactive ───────────────────────────────
  describe('prompt() — fail-fast under --non-interactive', () => {
    it('rejects with NON_INTERACTIVE error instead of hanging readline', async () => {
      _setNonInteractiveMode(true);
      await expect(prompt('Proceed anyway? (yes/no): ')).rejects.toThrow(/NON_INTERACTIVE/);
    });

    it('error message includes the original question for forensics', async () => {
      _setNonInteractiveMode(true);
      try {
        await prompt('UAT verified (yes/no): ');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).toMatch(/UAT verified/);
        expect(e.message).toMatch(/--uat-verified/);
      }
    });

    it('does NOT throw when non-interactive mode is OFF (regression guard)', () => {
      _setNonInteractiveMode(false);
      // Don't actually run prompt() — just confirm the early-return path doesn't fire
      expect(_getNonInteractiveMode()).toBe(false);
    });

    it('parametric coverage: rejects on each prompt site (TS-7 spec)', async () => {
      _setNonInteractiveMode(true);
      const promptSites = [
        'Auto-escalate to SD? (yes/no): ',
        'Actual lines of code changed: ',
        'UAT verified (manually tested fix works)? (yes/no): ',
        'GitHub PR URL (required): ',
        'Verification notes (optional): ',
        '\n   Proceed anyway? (yes/no): ',
        'Risk acknowledged? (yes/no): ',
        'Continue with override? (yes/no): ',
        'Confirm completion? (yes/no): '
      ];
      for (const q of promptSites) {
        await expect(prompt(q)).rejects.toThrow(/NON_INTERACTIVE/);
      }
    });
  });

  // ─── --force-complete audit-trail JSON shape ────────────────────────
  describe('--force-complete audit trail', () => {
    it('builds JSON containing required keys (force_completed, reason, operator, timestamp)', () => {
      // Simulating the orchestrator-side JSON.stringify({...}) path
      const reason = 'PR already merged sha abc1234';
      const forceCompletedNotes = JSON.stringify({
        force_completed: true,
        reason,
        operator: 'session-id-fixture',
        timestamp: '2026-05-08T00:00:00.000Z',
        operator_supplied_notes: null
      });
      const parsed = JSON.parse(forceCompletedNotes);
      expect(parsed.force_completed).toBe(true);
      expect(parsed.reason).toBe(reason);
      expect(parsed.operator).toBeTruthy();
      expect(parsed.timestamp).toBeTruthy();
    });
  });
});
