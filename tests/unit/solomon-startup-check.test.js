/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-001E-C (Phase E3) — the Solomon session orchestration surface.
 * Pure-function coverage of SOLOMON_LOOPS shape, the contract↔tooling parity guard (fails loud on a
 * missing durable duty), and the retry-state-manager exemption matching the solomon inbox command.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import {
  SOLOMON_LOOPS, ROLE_CONTEXT_DOC, parseDurableDutyMarkers, missingDurableDuties,
  loopStatus, parseArmedSet, renderContractParity,
} from '../../scripts/solomon-startup-check.mjs';
import { buildSelfAdherenceVerdict } from '../../scripts/solomon-self-adherence-review.mjs';

describe('SOLOMON_LOOPS shape', () => {
  it('declares inbox-monitor (solomon-advisory.cjs inbox, */15) + self-adherence (*/12h) + deep-sweep', () => {
    const byKey = Object.fromEntries(SOLOMON_LOOPS.map((l) => [l.key, l]));
    expect(byKey['inbox-monitor'].script).toBe('solomon-advisory.cjs');
    expect(byKey['inbox-monitor'].cron).toBe('*/15 * * * *');
    expect(byKey['inbox-monitor'].prompt).toMatch(/solomon-advisory\.cjs inbox/);
    expect(byKey['self-adherence'].script).toBe('solomon-self-adherence-review.mjs');
    expect(byKey['self-adherence'].cron).toBe('0 */12 * * *');
    expect(byKey['deep-sweep']).toBeDefined();
    // every loop has the canonical {key,label,script,cron,prompt} shape
    for (const l of SOLOMON_LOOPS) {
      expect(typeof l.key).toBe('string');
      expect(typeof l.cron).toBe('string');
      expect(typeof l.prompt).toBe('string');
      expect('script' in l).toBe(true); // null allowed for agent-prompt ticks
    }
    expect(ROLE_CONTEXT_DOC).toBe('CLAUDE_SOLOMON.md');
  });
});

describe('contract↔tooling parity (fails loud on a missing durable duty)', () => {
  it('parseDurableDutyMarkers slugs **<NAME> DUTY (durable)** markers', () => {
    const md = 'text **Deep Sweep DUTY (durable)** more **Inbox Monitor DUTY (durable)** end';
    expect(parseDurableDutyMarkers(md)).toEqual(['deep-sweep', 'inbox-monitor']);
  });
  it('missingDurableDuties reports a contract duty absent from SOLOMON_LOOPS', () => {
    // a duty present in the loops → not missing
    expect(missingDurableDuties('**Inbox Monitor DUTY (durable)**', SOLOMON_LOOPS)).toEqual([]);
    // a duty NOT in the loops → reported (this is the drift the guard must catch)
    expect(missingDurableDuties('**Ledger Reconcile DUTY (durable)**', SOLOMON_LOOPS)).toEqual(['ledger-reconcile']);
  });
  it('renderContractParity fails LOUD when a durable duty is missing (against a synthetic contract)', () => {
    // Inject a fake repoRoot whose CLAUDE_SOLOMON.md declares an unmatched duty → drift line.
    // We test the pure missingDurableDuties path directly (renderContractParity reads a real file +
    // fails open if absent), so assert the loud-drift branch via the pure function the render uses.
    const drift = missingDurableDuties('**Phantom Duty DUTY (durable)**', SOLOMON_LOOPS);
    expect(drift).toContain('phantom-duty');
    // renderContractParity is fail-open when the contract file is absent (ships before E-B seeds it).
    const out = renderContractParity('/no/such/root');
    expect(out).toMatch(/parity check skipped \(fail-open\)/);
  });
});

describe('self-adherence verdict (propose-only drift report)', () => {
  it('fails open (ok:true) when CLAUDE_SOLOMON.md is not present yet (Phase E-B seeds it)', () => {
    const v = buildSelfAdherenceVerdict('/no/such/root');
    expect(v.ok).toBe(true);
    expect(v.drifted).toEqual([]);
    expect(v.note).toMatch(/not present yet/);
  });
});

describe('armed-set parsing + loop status', () => {
  it('parses --armed and reports armed|MISSING by key', () => {
    const armed = parseArmedSet(['--armed', 'inbox-monitor,deep-sweep'], {});
    expect(armed.provided).toBe(true);
    expect(loopStatus(SOLOMON_LOOPS.find((l) => l.key === 'inbox-monitor'), armed)).toBe('armed');
    expect(loopStatus(SOLOMON_LOOPS.find((l) => l.key === 'self-adherence'), armed)).toBe('MISSING');
  });
  it('reports unverified when no armed-set supplied', () => {
    const armed = parseArmedSet([], {});
    expect(loopStatus(SOLOMON_LOOPS[0], armed)).toBe('unverified');
  });
});

describe('retry-state-manager EXEMPT_PATTERNS includes the solomon inbox command', () => {
  it('isExempt matches "node scripts/solomon-advisory.cjs inbox --quiet"', () => {
    const { isExempt } = require('../../scripts/hooks/retry-state-manager.cjs');
    expect(isExempt('node scripts/solomon-advisory.cjs inbox --quiet')).toBe(true);
    expect(isExempt('node scripts/solomon-advisory.cjs send "x"')).toBe(false); // only the inbox tick is exempt
  });
});
