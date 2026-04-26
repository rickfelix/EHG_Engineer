/**
 * Unit tests for SD-LEO-INFRA-FLEET-DASHBOARD-VISIBILITY-001
 * Covers formatClaimedWork + formatRosterClaim in scripts/modules/sd-next/display/claim-formatters.js
 *
 * Scenarios per PRD:
 *   - SD-only session  (sd_id/sd_key set, qf_id null)
 *   - QF-only session  (qf_id set via quick_fixes.claiming_session_id, sd_id/sd_key null)
 *   - Mixed roster     (multiple sessions across SDs and QFs in one render pass)
 *   - Idle session     (both null → fallback)
 *   - Dual claim       (defensive: both set → render both, no de-dup)
 */
import { describe, it, expect } from 'vitest';
import {
  formatClaimedWork,
  formatRosterClaim,
} from '../../../scripts/modules/sd-next/display/claim-formatters.js';

// ANSI escape stripper for color-agnostic assertions
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatClaimedWork — ACTIVE SESSIONS table cell', () => {
  it('SD-only session renders the SD id', () => {
    const s = { sd_id: 'SD-FOO-001', qf_id: null };
    expect(formatClaimedWork(s)).toBe('SD-FOO-001');
  });

  it('QF-only session renders [QF] prefix and QF id', () => {
    const s = { sd_id: null, qf_id: 'QF-20260424-805' };
    expect(formatClaimedWork(s)).toBe('[QF] QF-20260424-805');
  });

  it('Idle session (both null) renders "None"', () => {
    const s = { sd_id: null, qf_id: null };
    expect(formatClaimedWork(s)).toBe('None');
  });

  it('Dual-claim defensive case renders both, no de-dup', () => {
    const s = { sd_id: 'SD-FOO-001', qf_id: 'QF-20260424-805' };
    const out = formatClaimedWork(s);
    expect(out).toContain('SD-FOO-001');
    expect(out).toContain('QF-20260424-805');
    expect(out).toContain('+');
  });

  it('Mixed roster: each row formatted independently', () => {
    const sessions = [
      { sd_id: 'SD-FOO-001', qf_id: null },
      { sd_id: null, qf_id: 'QF-20260424-805' },
      { sd_id: null, qf_id: null },
    ];
    const rendered = sessions.map(formatClaimedWork);
    expect(rendered).toEqual(['SD-FOO-001', '[QF] QF-20260424-805', 'None']);
  });
});

describe('formatRosterClaim — Fleet Roster line segment', () => {
  it('SD-only session renders "→ <sd_title>" preferring title', () => {
    const s = { sd_key: 'SD-FOO-001', sd_title: 'Foo Feature', qf_id: null };
    expect(stripAnsi(formatRosterClaim(s))).toBe('→ Foo Feature');
  });

  it('SD-only session falls back to sd_key when title missing', () => {
    const s = { sd_key: 'SD-FOO-001', sd_title: null, qf_id: null };
    expect(stripAnsi(formatRosterClaim(s))).toBe('→ SD-FOO-001');
  });

  it('QF-only session renders "→ [QF] <qf_title>"', () => {
    const s = { sd_key: null, qf_id: 'QF-20260424-805', qf_title: 'Fix nav crash' };
    expect(stripAnsi(formatRosterClaim(s))).toBe('→ [QF] Fix nav crash');
  });

  it('QF-only session falls back to qf_id when title missing', () => {
    const s = { sd_key: null, qf_id: 'QF-20260424-805', qf_title: null };
    expect(stripAnsi(formatRosterClaim(s))).toBe('→ [QF] QF-20260424-805');
  });

  it('Idle session renders "(idle)" fallback', () => {
    const s = { sd_key: null, qf_id: null };
    expect(stripAnsi(formatRosterClaim(s))).toBe('(idle)');
  });

  it('Dual-claim defensive case renders SD title and [QF] segment, separated by "+"', () => {
    const s = {
      sd_key: 'SD-FOO-001',
      sd_title: 'Foo Feature',
      qf_id: 'QF-20260424-805',
      qf_title: 'Fix nav crash',
    };
    const plain = stripAnsi(formatRosterClaim(s));
    expect(plain).toContain('Foo Feature');
    expect(plain).toContain('[QF] Fix nav crash');
    expect(plain).toContain('+');
  });

  it('Color codes applied to QF segment (smoke check)', () => {
    const s = { sd_key: null, qf_id: 'QF-1', qf_title: 't' };
    const colored = formatRosterClaim(s);
    // ANSI present (cyan + reset)
    expect(colored).not.toBe(stripAnsi(colored));
  });

  it('Mixed roster: each row dispatches to the correct branch', () => {
    const sessions = [
      { sd_key: 'SD-FOO-001', sd_title: 'Foo', qf_id: null },
      { sd_key: null, qf_id: 'QF-1', qf_title: 'Bar' },
      { sd_key: null, qf_id: null },
    ];
    const plain = sessions.map(formatRosterClaim).map(stripAnsi);
    expect(plain).toEqual(['→ Foo', '→ [QF] Bar', '(idle)']);
  });
});
