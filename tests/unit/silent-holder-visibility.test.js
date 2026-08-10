// SD-LEO-INFRA-SILENT-HOLDER-AUDIT-001 — QF holders visible on every surface; honest badges;
// bidirectional conflicts; prompt-only audit pinned by string.
//
// Measured victims this SD replays: Bravo (QF claim, raw last_tool_at byte-identical across
// samples, heartbeat 0m fresh — invisible on four surfaces for four days), Delta (last signal WAS
// the last tool call — cleared by signal-recency while under the 120m tool-silence bar), one
// session holding two claims while the sweep printed CONFLICTS: None, and three frozen seats
// badged DEEP WORK for an hour.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeSessionBadge, TOOL_SILENT_UNKNOWN_MINUTES } from '../../lib/fleet/fleet-view-badges.cjs';
import { eligibleIdleWorkers } from '../../scripts/coordinator-idle-qf-hint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '../../', p), 'utf8');

describe('idle-qf-hint: a QF holder is never idle capacity', () => {
  const now = Date.now();
  const worker = (over = {}) => ({ session_id: 's1', sd_key: null, created_at: new Date(now - 10 * 60000).toISOString(), ...over });

  it('QF holder (authoritative table, NULL mirror) excluded from idle', () => {
    const idle = eligibleIdleWorkers([worker()], now, new Set(['s1']));
    expect(idle).toEqual([]);
  });

  it('non-holder still counts idle; sd_key mirror holder still excluded', () => {
    const idle = eligibleIdleWorkers([worker(), worker({ session_id: 's2' }), worker({ session_id: 's3', sd_key: 'SD-X-001' })], now, new Set(['s1']));
    expect(idle.map((w) => w.session_id)).toEqual(['s2']);
  });
});

describe('badge honesty: UNKNOWN on tool-silent mid-loop seats', () => {
  const base = { loopState: 'active', pAlive: 0.9, isSilent: false, computedStatus: 'active', model: 'claude-opus-5', effort: 'high' };

  it('frozen opus/high seat renders UNKNOWN, never DEEP WORK (the measured false badge)', () => {
    expect(computeSessionBadge({ ...base, toolSilentMinutes: 15 })).toBe('UNKNOWN');
    expect(computeSessionBadge({ ...base, loopState: 'awaiting_tick', toolSilentMinutes: 90 })).toBe('UNKNOWN');
  });

  it('fresh tool clock keeps DEEP WORK for opus/high', () => {
    expect(computeSessionBadge({ ...base, toolSilentMinutes: 2 })).toBe('DEEP WORK');
    expect(computeSessionBadge({ ...base, toolSilentMinutes: null })).toBe('DEEP WORK');
  });

  it('threshold constant is exported and small', () => {
    expect(TOOL_SILENT_UNKNOWN_MINUTES).toBeLessThanOrEqual(15);
  });

  it('the dead IDLE branch is gone: no comparison against a loop_state value outside the writer enum', () => {
    const src = read('lib/fleet/fleet-view-badges.cjs');
    expect(src).not.toMatch(/loopState\s*===\s*'idle'/);
  });
});

describe('roster and sweep wiring (structural pins on the measured gaps)', () => {
  it('dashboard idle filter excludes qf_id and selects it from the view', () => {
    const src = read('scripts/fleet-dashboard.cjs');
    expect(src).toMatch(/!s\.qf_id/);
    expect(src).toMatch(/sd_key\.not\.is\.null,qf_id\.not\.is\.null/);
  });

  it('sweep groups conflicts in BOTH directions and names un-pointed claims', () => {
    const src = read('scripts/stale-session-sweep.cjs');
    expect(src).toMatch(/multiClaimSessions/);
    expect(src).toMatch(/UN-POINTED/);
    // "None" only when both directions empty:
    expect(src).toMatch(/conflicts\.length > 0 \|\| multiClaimSessions\.length > 0/);
  });
});

describe('prompt-only audit duty: the prompt IS the contract (script:null)', () => {
  const src = read('scripts/coordinator-startup-check.mjs');
  const entry = src.slice(src.indexOf("key: 'silent-holder-audit'"), src.indexOf("key: 'silent-holder-audit'") + 2200);

  it('enumerates BOTH authoritative claim tables and names the mirror as a mirror', () => {
    expect(entry).toContain('strategic_directives_v2.claiming_session_id');
    expect(entry).toContain('quick_fixes.claiming_session_id');
    expect(entry).toMatch(/sd_key is only a MIRROR/i);
  });

  it('prescribes raw two-sample last_tool_at and phase-aware work product', () => {
    expect(entry).toMatch(/RAW last_tool_at compared across TWO samples/i);
    expect(entry).toMatch(/product_requirements_v2 rows at PLAN/);
  });

  it('forbids the fields that failed the two-sided admissibility control', () => {
    expect(entry).toMatch(/heartbeat_at.*wake_armed_at.*wind_down.*window_owner_pid/s);
    expect(entry).toMatch(/re-stamps on healthy seats AND stops on frozen ones/i);
  });

  it('keeps ask-only semantics', () => {
    expect(entry).toMatch(/this loop only asks/i);
  });
});

describe('admissibility: inadmissible fields stay out of new decision paths', () => {
  it('badge decision logic consults no heartbeat/wake/wind_down fields', () => {
    const src = read('lib/fleet/fleet-view-badges.cjs');
    for (const banned of ['heartbeat_at', 'wake_armed_at', 'expected_wake_at', 'wind_down', 'window_owner_pid', 'has_uncommitted_changes']) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it('idle-qf-hint eligibility consults no inadmissible fields', () => {
    const src = read('scripts/coordinator-idle-qf-hint.mjs');
    const fn = src.slice(src.indexOf('export function eligibleIdleWorkers'), src.indexOf('export function eligibleQfCandidates'));
    for (const banned of ['heartbeat_at', 'wake_armed_at', 'wind_down', 'has_uncommitted_changes']) {
      expect(fn.includes(banned)).toBe(false);
    }
  });
});
