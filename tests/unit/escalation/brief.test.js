// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — TS-8: the x5 rung is an interrogative brief.
import { describe, it, expect } from 'vitest';
import { buildBrief, briefIsActionable, REQUIRED_BRIEF_FIELDS } from '../../../lib/escalation/brief.js';

const complete = () => ({
  position: 'Wave 3 / roadmap #12',
  days_unmoved: 9,
  blocker: 'awaiting chairman ruling on DDL',
  owner: 'adam',
  question: 'do we apply the migration or defer to next wave?',
});

describe('TS-8 — a complete brief carries every field the chairman needs to ACT', () => {
  it('renders position, days, blocker, owner, and the x3 question', () => {
    const { line, fields } = buildBrief(complete());
    for (const f of REQUIRED_BRIEF_FIELDS) {
      expect(line).toContain(String(fields[f]));
    }
  });

  it('the question is carried VERBATIM so x5 escalates rather than re-asks', () => {
    // The point of carrying the x3 question is that the chairman sees what is already in
    // flight. A paraphrase would make it look like a second, different question.
    const s = complete();
    expect(buildBrief(s).line).toContain(s.question);
  });
});

describe('TS-8 — a BARE COUNT fails, and so does every partial', () => {
  it('refuses a bare count outright', () => {
    // The literal failure FR_C names: "3 items unmoved" is a volume, not a decision.
    expect(() => buildBrief({ count: 3 })).toThrow(/never a bare count/i);
  });

  for (const field of REQUIRED_BRIEF_FIELDS) {
    it(`refuses when '${field}' is missing, and NAMES it`, () => {
      // Each field individually, because a brief missing exactly one still renders and still
      // reads like a report — that is the silent degradation this guards. A single
      // all-fields-present test cannot see which field a future edit dropped.
      const s = complete();
      delete s[field];
      expect(() => buildBrief(s)).toThrow(new RegExp(`missing: .*${field}`));
    });
  }

  it('treats an EMPTY blocker as missing — a blank where the reason belongs is not a reason', () => {
    // The plausible-but-useless case: blocker: '' renders a brief with a gap in it. Truthiness
    // checks alone would let this through, and the output looks structurally correct.
    expect(() => buildBrief({ ...complete(), blocker: '   ' })).toThrow(/missing: .*blocker/);
  });

  it('names ALL missing fields at once rather than one per attempt', () => {
    const err = (() => { try { buildBrief({ owner: 'adam' }); } catch (e) { return e.message; } })();
    for (const f of ['position', 'days_unmoved', 'blocker', 'question']) {
      expect(err).toContain(f);
    }
  });
});

describe('briefIsActionable — checks VALUES, not labels', () => {
  it('accepts a line that carries the values', () => {
    const s = complete();
    expect(briefIsActionable(buildBrief(s).line, s)).toBe(true);
  });

  it('REJECTS a line with the labels but empty values', () => {
    // The load-bearing case. A template that printed
    //   "position: — unmoved d — blocker: — owner: — asked at x3:"
    // passes any label-presence check while carrying no information at all. Checking for the
    // VALUES is what distinguishes a brief from its skeleton.
    const s = complete();
    const skeleton = 'position: — unmoved d — blocker: — owner: — asked at x3: ""';
    expect(briefIsActionable(skeleton, s)).toBe(false);
  });

  it('rejects an empty or non-string line', () => {
    const s = complete();
    for (const bad of ['', '   ', null, undefined, 42]) {
      expect(briefIsActionable(bad, s)).toBe(false);
    }
  });

  it('rejects when the underlying stall is itself incomplete', () => {
    const s = complete();
    const line = buildBrief(s).line;
    delete s.blocker;
    expect(briefIsActionable(line, s)).toBe(false);
  });
});
