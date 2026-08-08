// QF-20260807-159 items (2) and (4): a guess must be legible as a guess, and a hold-flip
// must be visible.
//
// Item (1) of the ticket is NOT tested here because it was ALREADY SHIPPED on 2026-07-25
// (capture-session-id.cjs stamps `sessionstart_observed`); a writer census confirmed exactly
// two model_source writers and no third. Testing it would assert behaviour this QF did not
// change — a green light wired to someone else's bulb.
//
// WHAT THE DEFECT ACTUALLY WAS, once the premise was corrected: both held seats were a TRUE
// self-report of a WRONG value. Source-field truthfulness was never the gap, so these tests
// target the two things that were: an unrecognised value laundering itself as a report, and a
// hold whose only tell was a flip nobody surfaced.
import { describe, it, expect, vi } from 'vitest';
import { mergeCheckinModelEffort } from '../../scripts/worker-checkin.cjs';
import { isKnownEffort, isKnownModel } from '../../lib/fleet/tier-ladder.cjs';

describe('recognition predicates', () => {
  it('knows the real efforts and the documented synonym', () => {
    for (const e of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(isKnownEffort(e), `${e} should be known`).toBe(true);
    }
  });
  it('does not know an invented effort', () => {
    expect(isKnownEffort('tuesday')).toBe(false);
    expect(isKnownEffort('')).toBe(false);
    expect(isKnownEffort(undefined)).toBe(false);
  });
  it('knows real model ids and not invented ones', () => {
    expect(isKnownModel('opus')).toBe(true);
    expect(isKnownModel('claude-opus-5[1m]')).toBe(true);
    expect(isKnownModel('gpt-9-turbo')).toBe(false);
  });
});

describe('item (2): a guess is stamped as a guess, not as a report', () => {
  it('an unrecognised --effort stamps conservative_up_guess', () => {
    const { metadata } = mergeCheckinModelEffort({}, { effort: 'tuesday' });
    expect(metadata.effort).toBe('xhigh');                       // value unchanged: still conservative-UP
    expect(metadata.effort_source).toBe('conservative_up_guess'); // provenance now honest
  });

  it('an unrecognised --model stamps conservative_up_guess', () => {
    const { metadata } = mergeCheckinModelEffort({}, { model: 'gpt-9-turbo' });
    expect(metadata.model_source).toBe('conservative_up_guess');
  });

  // POSITIVE CONTROL — without this the suite would pass if EVERYTHING were marked a guess.
  it('a GENUINE --model/--effort report still stamps worker_self_report', () => {
    const { metadata } = mergeCheckinModelEffort({}, { model: 'claude-opus-5[1m]', effort: 'xhigh' });
    expect(metadata.model_source).toBe('worker_self_report');
    expect(metadata.effort_source).toBe('worker_self_report');
  });

  it('a chairman stamp still WINS over a worker effort report (contract preserved)', () => {
    const prior = { effort: 'low', effort_source: 'chairman' };
    const { metadata } = mergeCheckinModelEffort(prior, { effort: 'xhigh' });
    expect(metadata.effort).toBe('low');
    expect(metadata.effort_source).toBe('chairman');
  });

  // The second-order trap this fix created and had to close: a NEW automatic source silently
  // acquires chairman standing, because the guard reads "anything not in this list wins".
  it('a prior conservative_up_guess does NOT outrank a later genuine report', () => {
    const priorE = { effort: 'xhigh', effort_source: 'conservative_up_guess' };
    const afterE = mergeCheckinModelEffort(priorE, { effort: 'low' }).metadata;
    expect(afterE.effort).toBe('low');
    expect(afterE.effort_source).toBe('worker_self_report');

    const priorM = { model: 'gpt-9-turbo', model_source: 'conservative_up_guess' };
    const afterM = mergeCheckinModelEffort(priorM, { model: 'claude-opus-5[1m]' }).metadata;
    expect(afterM.model_source).toBe('worker_self_report');
  });

  it('still a byte-identical no-op when neither flag is passed', () => {
    const prior = { model: 'opus', model_source: 'worker_self_report' };
    const r = mergeCheckinModelEffort(prior, {});
    expect(r.changed).toBe(false);
    expect(r.metadata).toBe(prior); // same reference, not a copy
  });
});

describe('item (4): a model-family re-attestation is SURFACED', () => {
  it('announces the flip that lifts a family-keyed doctrine hold', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // The exact scenario measured on this seat: stamped fable, re-attests as opus.
      mergeCheckinModelEffort({ model: 'fable', model_family: 'fable' }, { model: 'claude-opus-5[1m]' });
      const said = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(said).toContain('MODEL FAMILY RE-ATTESTED');
      expect(said).toContain('fable');
      expect(said).toContain('opus');
    } finally {
      spy.mockRestore();
    }
  });

  it('stays SILENT when the family does not change — the signal must mean something', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Same family, different exact id: a real change, but no doctrine hold can be lifting.
      mergeCheckinModelEffort({ model: 'opus', model_family: 'opus' }, { model: 'claude-opus-5[1m]' });
      const said = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(said).not.toContain('MODEL FAMILY RE-ATTESTED');
    } finally {
      spy.mockRestore();
    }
  });

  it('stays silent on a first stamp — there is no prior family to have held anything', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mergeCheckinModelEffort({}, { model: 'claude-opus-5[1m]' });
      const said = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(said).not.toContain('MODEL FAMILY RE-ATTESTED');
    } finally {
      spy.mockRestore();
    }
  });
});
