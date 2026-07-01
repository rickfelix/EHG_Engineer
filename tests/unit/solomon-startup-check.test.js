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
  loopStatus, parseArmedSet, renderContractParity, slugifyDuty, wiredDutySlugs,
  solomonSweepMode, isProactiveSweepEnabled,
} from '../../scripts/solomon-startup-check.mjs';
import { buildSelfAdherenceVerdict } from '../../scripts/solomon-self-adherence-review.mjs';

describe('SOLOMON_LOOPS shape', () => {
  it('declares inbox-monitor (solomon-advisory.cjs inbox, 5min) + self-adherence (*/12h) + deep-sweep', () => {
    const byKey = Object.fromEntries(SOLOMON_LOOPS.map((l) => [l.key, l]));
    expect(byKey['inbox-monitor'].script).toBe('solomon-advisory.cjs');
    // QF-20260701-062: chairman-directed 15min -> 5min durable baseline.
    expect(byKey['inbox-monitor'].cron).toBe('3,8,13,18,23,28,33,38,43,48,53,58 * * * *');
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

describe('SD-LEO-INFRA-SOLOMON-STARTUP-PARITY-RECALIBRATE-001: recalibrated parity (no cry-wolf, no blindness)', () => {
  it('broadened regex parses qualified/punctuated markers the old regex was BLIND to', () => {
    // (DEPTH) parens in the name, '&' and '/' in the name, and a '(durable; ...)' qualifier.
    const md = [
      '**HARNESS-IMPROVEMENT (DEPTH) SWEEP DUTY (durable)**',
      '**ADAM AUTONOMY OVERSIGHT & REPORTING DUTY (durable; chairman-directed 2026-06-30)**',
      '**RETRO / `/learn` INTEGRATION DUTY (durable)**',
    ].join('\n');
    const slugs = parseDurableDutyMarkers(md);
    expect(slugs).toContain('harness-improvement-depth-sweep');
    expect(slugs).toContain('adam-autonomy-oversight-reporting'); // '&' collapsed, qualifier ignored
    expect(slugs).toContain('retro-learn-integration');           // '/' + backticks collapsed
  });

  it('slugifyDuty collapses non-alphanumerics to single hyphens', () => {
    expect(slugifyDuty('ADAM AUTONOMY OVERSIGHT & REPORTING')).toBe('adam-autonomy-oversight-reporting');
    expect(slugifyDuty('HARNESS-IMPROVEMENT (DEPTH) SWEEP')).toBe('harness-improvement-depth-sweep');
  });

  it('covers[]: a Mode-B duty the deep-sweep tick SUBSUMES is wired (not cry-wolf)', () => {
    const wired = wiredDutySlugs(SOLOMON_LOOPS);
    expect(wired.has('deep-architecture-review')).toBe(true);   // a declared deep-sweep cover
    expect(wired.has('taste-judgement')).toBe(true);
    // and it is NOT reported missing when the contract declares it
    expect(missingDurableDuties('**DEEP ARCHITECTURE REVIEW DUTY (durable)**', SOLOMON_LOOPS)).toEqual([]);
  });

  it('alias: the "SOLOMON SELF-ADHERENCE" marker reconciles with loop key self-adherence (the 1 false positive)', () => {
    expect(wiredDutySlugs(SOLOMON_LOOPS).has('solomon-self-adherence')).toBe(true);
    expect(missingDurableDuties('**SOLOMON SELF-ADHERENCE DUTY (durable)**', SOLOMON_LOOPS)).toEqual([]);
  });

  it('parity HOLDS against the full real contract marker set (0 missing)', () => {
    // the 17 durable markers from the live CLAUDE_SOLOMON.md
    const realMarkers = [
      'HARNESS-IMPROVEMENT (DEPTH) SWEEP', 'SELF-IMPROVEMENT-OF-THE-SELF-IMPROVEMENT-LOOP',
      'COORDINATION-LOOP OBSERVATION', 'ADAM GROUNDING-COMPLETENESS OVERSIGHT',
      'ADAM AUTONOMY OVERSIGHT & REPORTING', 'RETRO / `/learn` INTEGRATION', 'REINFORCEMENT-LEARNING SIGNAL',
      'DEEP ARCHITECTURE REVIEW', 'DEEP-THINKING TARGET SCAN', 'TASTE & JUDGEMENT', 'FLAKY-TEST DEEP-RCA',
      'DEDUP / UNIFICATION SWEEP', 'AUTONOMY-SUPPORT', 'REALITY-SIMULATION', 'MODEL/EFFORT EVALUATION',
      'HIGHER-ORDER EFFORT-DISTRIBUTION TIER DESIGN', 'SOLOMON SELF-ADHERENCE',
    ].map((n) => `**${n} DUTY (durable)**`).join('\n');
    expect(parseDurableDutyMarkers(realMarkers)).toHaveLength(17);
    expect(missingDurableDuties(realMarkers, SOLOMON_LOOPS)).toEqual([]); // no cry-wolf, no blindness
  });

  it('a genuinely-unwired NEW duty IS still reported (the guard is not defanged)', () => {
    expect(missingDurableDuties('**SOME BRAND NEW DUTY (durable)**', SOLOMON_LOOPS)).toEqual(['some-brand-new']);
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

describe('SD-LEO-INFRA-SOLOMON-MODEB-FABLE-PIN-TRIGGER-001: solomonSweepMode Fable-pin trigger', () => {
  const noEnv = {}; // isolate from the ambient process.env override
  it('a Fable pin flips the deep-sweep tick to proactive-sweep mode', () => {
    expect(solomonSweepMode('claude-fable-5', noEnv)).toBe('proactive');
    expect(isProactiveSweepEnabled('claude-fable-5', noEnv)).toBe(true);
  });
  it('the Opus 4.8 pin (and any non-Fable id) stays consult-only', () => {
    expect(solomonSweepMode('claude-opus-4-8', noEnv)).toBe('consult');
    expect(solomonSweepMode('claude-sonnet-5', noEnv)).toBe('consult');
    expect(isProactiveSweepEnabled('claude-opus-4-8', noEnv)).toBe(false);
  });
  it('an empty/undefined pin fails safe to consult (Mode-B off)', () => {
    expect(solomonSweepMode('', noEnv)).toBe('consult');
    expect(solomonSweepMode(null, noEnv)).toBe('consult');
  });
  it('SOLOMON_SWEEP_MODE overrides the pin-derived result in BOTH directions', () => {
    expect(solomonSweepMode('claude-opus-4-8', { SOLOMON_SWEEP_MODE: 'proactive' })).toBe('proactive');
    expect(solomonSweepMode('claude-fable-5', { SOLOMON_SWEEP_MODE: 'consult' })).toBe('consult');
    expect(solomonSweepMode('claude-opus-4-8', { SOLOMON_SWEEP_MODE: 'PROACTIVE' })).toBe('proactive'); // case-insensitive
    expect(solomonSweepMode('claude-fable-5', { SOLOMON_SWEEP_MODE: 'garbage' })).toBe('proactive'); // invalid override ignored
  });
});
