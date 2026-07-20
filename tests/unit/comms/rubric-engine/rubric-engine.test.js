import { describe, it, expect, vi } from 'vitest';
import { evaluate, authorityClass, effectiveType } from '../../../../lib/comms/adam-outbound/rubric-engine/index.js';

/** A well-formed decision message (passes every deterministic lint check). */
function wellFormedDecision(overrides = {}) {
  return {
    type: 'decision',
    body: 'Approve the deploy? Reply A or B. Reply DETAILS for the rationale.',
    options: [{ label: 'A) ship now' }, { label: 'B) hold until morning' }],
    decisionCount: 1,
    replyInstruction: 'Reply A or B (or DETAILS)',
    replyId: 'dec-123',
    noReplyConsequence: 'no reply by 5pm ET -> I hold (reversible)',
    ...overrides,
  };
}

const DAYTIME = { nowHourET: 14, rateCap: 10, sentInWindow: 0 };

describe('rubric-engine evaluate()', () => {
  it('TS-1: malformed decision (missing labeled options) is blocked BEFORE any LLM call', async () => {
    const reviewer = vi.fn();
    const msg = wellFormedDecision({ options: [] });
    const res = await evaluate(msg, DAYTIME, { reviewer });
    expect(res.verdict).toBe('blocked');
    expect(res.blockedReasons.some((r) => r.startsWith('labeled_options'))).toBe(true);
    expect(res.llmReview).toBeNull();
    expect(reviewer).not.toHaveBeenCalled(); // structural F3 fix: no review on a lint block
  });

  it('TS-2: well-formed decision passes lint, THEN runs the independent review (separate call)', async () => {
    const reviewer = vi.fn(() => ({ verdict: 'pass', classification: 'decision', reducible: true, reasons: [], reviewer: 'stub' }));
    const res = await evaluate(wellFormedDecision(), DAYTIME, { reviewer });
    expect(res.verdict).toBe('pass');
    expect(reviewer).toHaveBeenCalledTimes(1);
    // the reviewer receives the finished message, never a composer
    expect(reviewer.mock.calls[0][0]).toMatchObject({ type: 'decision' });
    expect(res.llmReview).toMatchObject({ reviewer: 'stub' });
  });

  it('TS-3: spend/irreversible decision routes to console regardless of YES/NO reducibility', async () => {
    const reviewer = vi.fn(() => ({ verdict: 'pass', reasons: [] }));
    const res = await evaluate(wellFormedDecision({ authority: 'spend' }), DAYTIME, { reviewer });
    expect(res.authorityClass).toBe('console');
    // irreversible + chairman_only too
    expect(authorityClass({ authority: 'irreversible' })).toBe('console');
    expect(authorityClass({ authority: 'chairman_only' })).toBe('console');
    expect(authorityClass({ authority: 'reducible' })).toBe('sms');
  });

  it('TS-4: type=status carrying options is classified as a DECISION and gets decision checks', async () => {
    const reviewer = vi.fn();
    // claims status, but has options and no reply instruction -> decision checks must fire and block
    const msg = { type: 'status', body: 'Pick one: A) x  B) y', options: [{ label: 'A) x' }, { label: 'B) y' }] };
    expect(effectiveType(msg)).toBe('decision');
    const res = await evaluate(msg, DAYTIME, { reviewer });
    expect(res.effectiveType).toBe('decision');
    expect(res.verdict).toBe('blocked'); // missing reply instruction / details / replyId / no-reply-consequence
    expect(reviewer).not.toHaveBeenCalled();
  });

  it('TS-5: a send inside quiet hours (22:00-06:00 ET) is blocked', async () => {
    const reviewer = vi.fn();
    const res = await evaluate(wellFormedDecision(), { ...DAYTIME, nowHourET: 23 }, { reviewer });
    expect(res.verdict).toBe('blocked');
    expect(res.blockedReasons.some((r) => r.startsWith('quiet_hours'))).toBe(true);
    expect(reviewer).not.toHaveBeenCalled();
  });

  it('TS-6: no live LLM calls — the default reviewer is deterministic and blocks never invoke it', async () => {
    // default (no injected reviewer): deterministic heuristic, no network
    const passed = await evaluate(wellFormedDecision(), DAYTIME);
    expect(passed.verdict).toBe('pass');
    expect(passed.llmReview.reviewer).toBe('heuristic-default');
    // a secret in the body is blocked by lint and never reaches any reviewer
    const reviewer = vi.fn();
    // Build an AWS-key-shaped token at runtime so no literal secret enters git history
    // (the pre-commit secret scanner would flag a literal), while still exercising the lint.
    const fakeAwsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const withSecret = await evaluate(
      wellFormedDecision({ body: `Approve? A or B. DETAILS. token ${fakeAwsKey}` }),
      DAYTIME,
      { reviewer },
    );
    expect(withSecret.verdict).toBe('blocked');
    expect(withSecret.blockedReasons.some((r) => r.startsWith('no_secrets'))).toBe(true);
    expect(reviewer).not.toHaveBeenCalled();
  });

  it('a decision missing its no-reply consequence is blocked (consent integrity)', async () => {
    const res = await evaluate(wellFormedDecision({ noReplyConsequence: undefined }), DAYTIME);
    expect(res.verdict).toBe('blocked');
    expect(res.blockedReasons.some((r) => r.startsWith('no_reply_consequence'))).toBe(true);
  });
});

describe('QF-20260719-793 — explicit status raises the reclassification bar', () => {
  it('live false positives stay status: bare interrogative words in prose', () => {
    expect(effectiveType({ type: 'status', body: 'Cursor verdict v2: regardless of which host wins, the runner stays pinned.' })).toBe('status');
    expect(effectiveType({ type: 'status', body: 'Heartbeat 13:15 — dedupe keys resolved; no reply needed from you.' })).toBe('status');
  });

  it('live false positive stays status: hyphen bullets in a status summary', () => {
    expect(effectiveType({ type: 'status', body: 'Overnight summary:\n- three QFs shipped\n- belt drained\n- fleet green' })).toBe('status');
  });

  it('explicit status STILL upgrades on strong evidence (decision dressed as status)', () => {
    expect(effectiveType({ type: 'status', body: 'Should I proceed with the migration?' })).toBe('decision'); // trailing ?
    expect(effectiveType({ type: 'status', body: 'Two paths:\n- A) ship now\n- B) wait for soak\nreply A or B' })).toBe('decision'); // options + interrogative
    expect(effectiveType({ type: 'status', body: 'x', options: ['a', 'b'] })).toBe('decision'); // structured options always decisive
  });

  it('undeclared/ambiguous types keep the aggressive single-signal promotion', () => {
    expect(effectiveType({ body: 'which one do you want' })).toBe('decision');
    expect(effectiveType({ body: '- A) yes\n- B) no' })).toBe('decision');
  });
});
