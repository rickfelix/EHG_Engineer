import { describe, it, expect } from 'vitest';
import {
  WORK_CLASSES, deriveWorkClass, modelWorkClasses, workClassIneligibilityReason,
} from '../../../lib/fleet/work-class.cjs';
import { classifyDispatchIneligibility } from '../../../lib/fleet/claim-eligibility.cjs';

const sd = (over = {}) => ({ sd_key: 'SD-X-001', sd_type: 'infrastructure', status: 'draft', metadata: {}, ...over });

describe('TS-1 deriveWorkClass', () => {
  it('validated explicit override wins; invalid override falls through to derivation', () => {
    expect(deriveWorkClass(sd({ metadata: { work_class_override: 'general_harness' }, title: 'design a hero' }))).toBe('general_harness');
    expect(deriveWorkClass(sd({ metadata: { work_class_override: 'ANYTHING' }, title: 'no signals here whatsoever' }))).toBe('unclassified');
    expect(WORK_CLASSES).toContain('any');
  });
  it('creative signals -> creative_design; general signals -> general_harness', () => {
    expect(deriveWorkClass(sd({ title: 'Brand landing page hero visual design' }))).toBe('creative_design');
    expect(deriveWorkClass(sd({ title: 'Fix flaky claim sweep migration lint' }))).toBe('general_harness');
  });
  it('mixed signals resolve toward creative (recall-tuned, C-STARVE)', () => {
    expect(deriveWorkClass(sd({ title: 'Design review of the dispatch pipeline UX' }))).toBe('creative_design');
  });
  it('no signals -> unclassified; null row -> unclassified', () => {
    expect(deriveWorkClass(sd({ title: 'zzz', sd_type: undefined }))).toBe('unclassified');
    expect(deriveWorkClass(null)).toBe('unclassified');
  });
});

describe('TS-2 workClassAxes ctx-gating (via classifyDispatchIneligibility)', () => {
  const general = sd({ title: 'Fix harness cron gate bug' });
  const creative = sd({ title: 'Design the venture brand narrative' });
  const blank = sd({ title: 'zzz', sd_type: undefined, description: undefined });
  it('ctx undefined / no session_model / non-fable model -> axis is a no-op', () => {
    expect(classifyDispatchIneligibility(general, undefined)).toBeNull();
    expect(classifyDispatchIneligibility(general, {})).toBeNull();
    expect(classifyDispatchIneligibility(general, { session_model: 'opus' })).toBeNull();
    expect(classifyDispatchIneligibility(general, { session_model: 'claude-sonnet-5' })).toBeNull();
  });
  it('fable session: general fenced, creative admitted, unclassified fail-closed', () => {
    expect(classifyDispatchIneligibility(general, { session_model: 'claude-fable-5' })).toBe('work_class_mismatch');
    expect(classifyDispatchIneligibility(creative, { session_model: 'fable' })).toBeNull();
    expect(classifyDispatchIneligibility(blank, { session_model: 'fable' })).toBe('work_class_unclassified');
  });
  it('override work_class_override=any admits everywhere', () => {
    expect(classifyDispatchIneligibility(sd({ title: 'Fix cron', metadata: { work_class_override: 'any' } }), { session_model: 'fable' })).toBeNull();
  });
});

describe('TS-3 directed-assign regression pin (dispatch ctx=undefined)', () => {
  it('a general_harness row is dispatchable with ctx=undefined before and after the axis', () => {
    const row = sd({ title: 'Fix the stale session sweep reaper' });
    expect(classifyDispatchIneligibility(row, undefined)).toBeNull();
  });
});

describe('TS-6 fable_window orthogonality', () => {
  it('a below-tier CREATIVE item during an active fable window is still tier-blocked', () => {
    const row = sd({ title: 'Design the brand hero visuals', metadata: { min_tier_rank: 1 } });
    const reason = classifyDispatchIneligibility(row, {
      session_model: 'fable', tiering_active: true, worker_tier_rank: 4, fable_window_active: true,
    });
    expect(reason).toBe('fable_window_downward_claim_blocked'); // work-class admits; window axis still fires
  });
});
