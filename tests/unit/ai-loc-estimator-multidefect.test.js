/**
 * QF-20260610-234: multi-root-cause scope-discovery advisory in QF triage.
 *
 * The LOC estimator sizes off the FIRST matching error pattern only, so a
 * singular-sounding symptom masking coupled defects under-tiers (QF-20260609-493:
 * filed as one root cause, shipped 152 LOC / 4 defects, needed --force-complete).
 * Pins detectMultiDefectScope (pure), the estimateLOC soft floor (raise-only),
 * and the triage-gate advisory surfacing — plus the no-false-positive direction.
 */
import { describe, it, expect } from 'vitest';
import { estimateLOC, detectMultiDefectScope } from '../../lib/ai-loc-estimator.js';
import { runTriageGate } from '../../scripts/modules/triage-gate.js';

// QF-493-shaped symptom: singular framing, multiple coupled defects underneath.
const QF493_STYLE = {
  title: 'Quick-fix completion fails',
  description:
    'complete-quick-fix.js throws No JSON found when parsing PR metadata, and also the ' +
    'branch detection in git-operations.js silently drops the worktree path, plus the ' +
    'LOC counter ignores test files. Each failure then blocks the next step in turn.',
  type: 'bug',
};

describe('detectMultiDefectScope (FR-1)', () => {
  it('(a) flags a QF-493-style singular-symptom/multi-defect report', () => {
    const out = detectMultiDefectScope(QF493_STYLE);
    expect(out.likelyMultiDefect).toBe(true);
    expect(out.signals.length).toBeGreaterThanOrEqual(2);
    expect(out.suggestedLocFloor).toBe(40);
  });

  it('(b) does NOT flag a genuinely singular typo fix', () => {
    const out = detectMultiDefectScope({
      title: 'Typo in dashboard heading',
      description: 'The heading says "Vetures" instead of "Ventures". Single text change.',
      type: 'typo',
    });
    expect(out).toEqual({ likelyMultiDefect: false, signals: [], suggestedLocFloor: null });
  });

  it('(b) does NOT flag a singular null-access single-file fix', () => {
    const out = detectMultiDefectScope({
      title: 'Cannot read property name of undefined in VentureCard',
      description: 'Null access when venture has no owner. Add a guard.',
      type: 'bug',
      file: 'src/components/VentureCard.tsx',
    });
    expect(out.likelyMultiDefect).toBe(false);
    expect(out.suggestedLocFloor).toBeNull();
  });

  it('(c) empty/garbage/non-string input returns false without throwing', () => {
    expect(detectMultiDefectScope({}).likelyMultiDefect).toBe(false);
    expect(detectMultiDefectScope(null).likelyMultiDefect).toBe(false);
    expect(detectMultiDefectScope(undefined).likelyMultiDefect).toBe(false);
    expect(detectMultiDefectScope({ title: 42, description: {} }).likelyMultiDefect).toBe(false);
    expect(detectMultiDefectScope({ description: '   ' }).likelyMultiDefect).toBe(false);
  });
});

describe('estimateLOC soft floor (FR-3: raise-only, reasoning preserved)', () => {
  it('floors a multi-defect symptom to 40 LOC with a scope-discovery reasoning line', () => {
    const out = estimateLOC(QF493_STYLE);
    expect(out.estimatedLoc).toBeGreaterThanOrEqual(40);
    expect(out.reasoning).toMatch(/Scope-discovery: probable multi-defect coupling/);
  });

  it('never lowers an estimate already above the floor', () => {
    // 'api call' base (15) x 'entire' multiplier (3.0) = 45 > the 40 floor.
    // (no 'across'/'multiple' words — the complexity loop breaks on first match)
    const out = estimateLOC({
      title: 'Rewrite entire api call layer',
      description:
        'fetch fails and also crashes in helper.js and parser.js; cascade of errors',
      type: 'bug',
    });
    expect(out.estimatedLoc).toBe(45); // floor (40) did not pull it DOWN
    expect(out.reasoning).not.toMatch(/floored estimate/);
  });

  it('leaves a singular fix estimate untouched (output contract preserved)', () => {
    const out = estimateLOC({ title: 'Fix typo in heading', description: 'single word change', type: 'typo' });
    expect(out.estimatedLoc).toBeLessThanOrEqual(3);
    expect(out.reasoning).not.toMatch(/Scope-discovery/);
    expect(typeof out.confidence).toBe('number');
  });
});

describe('runTriageGate advisory (FR-2: fail-soft, advisory only)', () => {
  it('(a) surfaces the scope-discovery advisory and lands >= Tier 2 for a QF-493-style item', async () => {
    const res = await runTriageGate({ ...QF493_STYLE, source: 'interactive' });
    expect(res.tier).toBeGreaterThanOrEqual(2);
    expect(res.scopeDiscoveryAdvisory).toMatch(/scope-discovery/);
    expect(res.reasoning).toMatch(/re-estimate LOC before claim/);
    if (res.askUserQuestionPayload) {
      expect(res.askUserQuestionPayload.questions[0].question).toMatch(/scope-discovery/);
    }
  });

  it('(b) no advisory for a genuinely singular fix — routing unchanged', async () => {
    const res = await runTriageGate({
      title: 'Fix typo in heading',
      description: 'single word change',
      type: 'typo',
      source: 'interactive',
    });
    expect(res.scopeDiscoveryAdvisory).toBeNull();
    expect(res.reasoning).not.toMatch(/scope-discovery/);
    expect(res.tier).toBe(1);
  });
});
