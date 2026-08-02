/**
 * SD-LEO-INFRA-DECISION-RESURFACE-GUARDS-001 — fail closed when there is no durable sink.
 *
 * THE DEFECT: sms_outbound_obligations has no answered / resurface_count /
 * resurfaced_this_window columns (Postgres 42703 on each, confirmed against a control
 * query on id/kind/decision_id that returned cleanly in the same session). buildOwedStore
 * therefore hardcoded all three guard inputs to the PERMISSIVE value, which does not make
 * the policy "run safely" — it makes it UNABLE TO FIRE. away-bridge tests
 * resurfacedThisWindow (always false → never skips) and compares resurfaceCount (always 0)
 * against K (→ never trips). markResurfaced is a no-op, so nothing persists between the
 * hourly ticks either.
 *
 * WHY NOTHING HAS BEEN SENT: the only remaining brake is the isAway presence check, and
 * presence reads MAX(claude_sessions.heartbeat_at), which fleet workers keep fresh. That
 * is an accident of fleet liveness, not a control — so EVERY rate-guard scenario below
 * runs with isAway TRUE. If any of them passed because the chairman looked present, this
 * suite would be re-creating today's accidental containment inside its own fixtures and
 * proving nothing about the guards.
 */
import { describe, it, expect, vi } from 'vitest';
import { processOwedDecisions, isAway } from '../../lib/comms/adam-outbound/away-bridge/index.js';
import { buildOwedStore } from '../../lib/comms/adam-outbound/decision-scheduler/index.js';

const NOW = Date.UTC(2026, 7, 1, 18, 0, 0);
/** isAway TRUE — every rate-guard scenario uses this. */
const AWAY = { now: NOW, lastInputAt: NOW - 6 * 60 * 60 * 1000 };
/** isAway FALSE — used ONCE, and never as evidence the guards work. */
const PRESENT = { now: NOW, lastInputAt: NOW - 1000 };

const owed = (over = {}) => ({
  owedId: 'owed-1',
  decisionId: 'dec-1',
  message: { body: 'Still pending: choose A or B', decisionId: 'dec-1' },
  answered: false,
  resurfaceCount: 0,
  resurfacedThisWindow: false,
  ...over,
});

/** Store whose durability is ABSENT — today's real production state. */
const noSinkStore = (entries) => ({
  getOwedDecisions: async () => entries.map((e) => ({ ...e, durabilityUnavailable: true })),
  markResurfaced: vi.fn(async () => {}),
});

/** Store WITH a working sink — what exists once the migration lands the three columns. */
const durableStore = (entries, marked) => ({
  getOwedDecisions: async () => entries,
  markResurfaced: marked,
});

const run = (context, store, opts = {}) => processOwedDecisions(context, {
  owedStore: store,
  sender: opts.sender ?? vi.fn(async () => {}),
  escalateEmail: opts.escalateEmail ?? vi.fn(async () => {}),
  K: opts.K ?? 2,
});

describe('the fixtures actually exercise the intended presence state', () => {
  // Control. If AWAY did not make isAway true, every "guard held" assertion below would be
  // satisfied by skipped_present instead — the exact substitution this SD exists to stop.
  it('AWAY is away and PRESENT is present', () => {
    expect(isAway(AWAY)).toBe(true);
    expect(isAway(PRESENT)).toBe(false);
  });
});

describe('FR-1: no durable sink → REFUSE to send', () => {
  it('TWO consecutive ticks produce ZERO sends and a distinct refusal', async () => {
    // TWO ticks is the point. One tick cannot distinguish "sent once, correctly" from
    // "will send every hour forever", and the second is what the defect actually causes.
    const sender = vi.fn(async () => {});
    const store = noSinkStore([owed()]);

    const first = await run(AWAY, store, { sender });
    const second = await run(AWAY, store, { sender });

    expect(sender).not.toHaveBeenCalled();
    expect(first[0].action).toBe('skipped_no_durable_sink');
    expect(second[0].action).toBe('skipped_no_durable_sink');
  });

  it('the refusal is distinguishable from skipped_present', async () => {
    // Collapsing these would make "no brakes at all" look identical to "the chairman is
    // reading the screen" — the most misleading conflation available on this path.
    const away = await run(AWAY, noSinkStore([owed()]));
    const present = await run(PRESENT, noSinkStore([owed()]));
    expect(away[0].action).toBe('skipped_no_durable_sink');
    expect(present[0].action).toBe('skipped_present');
  });
});

describe('FR-1 ordering: the refusal must precede guards that cannot fire', () => {
  it('refuses even when the two dead guards would have passed', async () => {
    // resurfacedThisWindow=false and resurfaceCount=0 are precisely the inputs that make
    // the window-skip and K-cap unreachable. A durability check placed BELOW them would
    // never run — it would read as a fix and change nothing. Asserting the ACTION proves
    // position rather than assuming it.
    const sender = vi.fn(async () => {});
    const results = await run(AWAY, noSinkStore([owed({ resurfacedThisWindow: false, resurfaceCount: 0 })]), { sender });
    expect(results[0].action).toBe('skipped_no_durable_sink');
    expect(sender).not.toHaveBeenCalled();
  });

  it('an ANSWERED decision is still dropped first — the refusal does not mask a real drop', async () => {
    const results = await run(AWAY, noSinkStore([owed({ answered: true })]));
    expect(results[0].action).toBe('dropped_answered');
  });
});

describe('FR-2 OPPOSITE POLARITY: with a working sink the feature still works', () => {
  // A fix that refuses in BOTH directions is a permanent mute — silent, unreported, and
  // worse than the defect, because the defect at least sends something.
  it('sends when the sink is available, and marks it', async () => {
    const sender = vi.fn(async () => {});
    const marked = vi.fn(async () => {});
    const results = await run(AWAY, durableStore([owed()], marked), { sender });
    expect(results[0].action).not.toBe('skipped_no_durable_sink');
    expect(sender).toHaveBeenCalledTimes(1);
    // markResurfaced must actually be CALLED. It is a no-op today, so a fix that leaves it
    // uncalled would regress silently the moment the columns land.
    expect(marked).toHaveBeenCalled();
  });

  it('the window-skip suppresses a second re-surface', async () => {
    const sender = vi.fn(async () => {});
    const results = await run(AWAY, durableStore([owed({ resurfacedThisWindow: true })], vi.fn()), { sender });
    expect(results[0].action).toBe('skipped_idempotent');
    expect(sender).not.toHaveBeenCalled();
  });

  it('the K-cap ESCALATES to email rather than muting', async () => {
    const sender = vi.fn(async () => {});
    const escalateEmail = vi.fn(async () => {});
    const results = await run(AWAY, durableStore([owed({ resurfaceCount: 2 })], vi.fn()), { sender, escalateEmail, K: 2 });
    expect(results[0].action).toBe('escalated_email');
    expect(escalateEmail).toHaveBeenCalledTimes(1);
    expect(sender).not.toHaveBeenCalled();
  });
});

describe('FR-4: presence is not carrying the guards', () => {
  it('the refusals above happened with isAway TRUE — presence never suppressed them', async () => {
    // If this suite relied on skipped_present to reach zero sends, a green run would prove
    // only that the chairman looked present. Assert that negative directly.
    const results = await run(AWAY, noSinkStore([owed(), owed({ owedId: 'owed-2' })]));
    expect(results.map((r) => r.action)).toEqual(['skipped_no_durable_sink', 'skipped_no_durable_sink']);
    expect(results.some((r) => r.action === 'skipped_present')).toBe(false);
  });
});

describe('ORDERING — the refusal must outrank a guard that WOULD fire', () => {
  // MY OWN MUTATION HARNESS CORRECTED ME HERE. I had claimed a refusal placed below the
  // window-skip and K-cap would be "unreachable". That is wrong: those branches only
  // `continue` when they FIRE, and with permissive hardcoded inputs they never do, so
  // execution falls through and the refusal still runs. Moving it below therefore did NOT
  // fail the suite.
  //
  // What ordering actually protects is the TRUTHFULNESS OF THE REPORTED REASON. When a
  // guard input is present-but-untrustworthy, the lower placement reports skipped_idempotent
  // — asserting an idempotency the store demonstrably cannot know, because there is no
  // column behind it. Same non-send either way; completely different claim in the log,
  // and the log is what a human reads when deciding whether the brakes work.
  it('durability absent AND resurfacedThisWindow true -> reports NO-DURABLE-SINK, not idempotent', async () => {
    const sender = vi.fn(async () => {});
    const store = {
      getOwedDecisions: async () => [owed({ resurfacedThisWindow: true, durabilityUnavailable: true })],
      markResurfaced: vi.fn(async () => {}),
    };
    const results = await run(AWAY, store, { sender });
    expect(results[0].action).toBe('skipped_no_durable_sink');
    expect(results[0].action).not.toBe('skipped_idempotent');
    expect(sender).not.toHaveBeenCalled();
  });

  it('durability absent AND resurfaceCount at K -> refuses rather than claiming escalation', async () => {
    const escalateEmail = vi.fn(async () => {});
    const store = {
      getOwedDecisions: async () => [owed({ resurfaceCount: 5, durabilityUnavailable: true })],
      markResurfaced: vi.fn(async () => {}),
    };
    const results = await run(AWAY, store, { escalateEmail, K: 2 });
    expect(results[0].action).toBe('skipped_no_durable_sink');
    // Escalating on a count read from nothing would send a real email on a fabricated number.
    expect(escalateEmail).not.toHaveBeenCalled();
  });
});

describe('THE REAL STORE marks the gap — not just the test fixture', () => {
  // SECOND SURVIVOR MY HARNESS FOUND: renaming durabilityUnavailable in the production
  // store killed nothing, because every scenario above builds its own fixture that sets
  // the flag itself. The bridge was tested; the STORE never was. That is stubbed-writer
  // blindness — the same shape as the FR-4 constant-only gap a reviewer found on the
  // previous SD, reproduced by me one module over, in the SD whose subject is guards that
  // report without measuring.
  it('buildOwedStore stamps durabilityUnavailable on every owed decision it returns', async () => {
    const rows = [
      { id: 'o1', decision_id: 'd1', body: 'Still pending: A or B', status: 'queued' },
      { id: 'o2', decision_id: 'd2', body: 'Still pending: C or D', status: 'queued' },
    ];
    // getOwedDecisions goes through fetchAllPaginated, which paginates with .range() —
    // the store's own comment notes the PostgREST 1000-row cap would otherwise silently
    // drop owed decisions. So .order() must stay CHAINABLE and .range() is what resolves;
    // a mock that resolves at .order() returns nothing and the test fails for the wrong
    // reason. (I got this wrong first — the cap that comment warns about is the same one
    // that made a capped sample look like a clean result twice for me today.)
    let page = 0;
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      not() { return builder; },
      order() { return builder; },
      // smsOutboundObligationsLive probes .select('id').limit(1) and treats ANY error as
      // "table absent" -> the store fail-softs to []. Omitting limit() here made the mock
      // throw, the probe report dead, and the assertion fail for a reason that had nothing
      // to do with the behaviour under test.
      limit() { return Promise.resolve({ data: [], error: null }); },
      range() { return Promise.resolve({ data: page++ === 0 ? rows : [], error: null }); },
      then(res) { return Promise.resolve({ data: rows, error: null }).then(res); },
    };
    const supabase = { from: () => builder };

    const store = buildOwedStore(supabase);
    const owedDecisions = await store.getOwedDecisions();

    // If the store stops marking, the bridge silently reverts to the unbounded path and
    // nothing in the bridge-level tests would notice.
    expect(owedDecisions.length).toBeGreaterThan(0);
    for (const o of owedDecisions) {
      expect(o.durabilityUnavailable, `owed ${o.owedId}`).toBe(true);

      // ===== answered:false IS LOAD-BEARING, AND ITS ABSENCE HERE WAS A LIVE SURVIVOR =====
      // Mutating the adapter's `answered: false` to `true` left ALL 12 tests green. It is not a
      // cosmetic field: away-bridge's answered-drop (:63) runs BEFORE the durability refusal
      // (:91), so an always-answered store makes THIS SD'S GUARD UNREACHABLE — every owed
      // decision exits as 'dropped_answered', which reads in the log like a legitimate drop
      // rather than a disabled brake. A one-line adapter change silently removes the feature.
      //
      // The comment above ("if the store stops marking … nothing would notice") was written for
      // exactly this hazard and then closed it for ONE field. Pinning every mapped field is the
      // general form: a stubbed writer is only witnessed for the values you actually assert.
      expect(o.answered, `owed ${o.owedId} answered`).toBe(false);
      expect(o.resurfaceCount, `owed ${o.owedId} resurfaceCount`).toBe(0);
      expect(o.resurfacedThisWindow, `owed ${o.owedId} resurfacedThisWindow`).toBe(false);
      expect(o.owedId, 'owedId must be mapped').toBeTruthy();
      expect(o.message, 'message must be mapped').toBeTruthy();
    }
  });

  it('an always-answered store would make the refusal UNREACHABLE — the drop precedes it', async () => {
    // Proves the consequence the assertion above guards against, at the bridge level: with
    // answered:true the refusal never runs, so the outcome is 'dropped_answered' and NOT
    // 'skipped_no_durable_sink'. Ordering is the whole point — the drop is upstream of the guard.
    const answeredStore = {
      getOwedDecisions: async () => [{ ...owed(), answered: true, durabilityUnavailable: true }],
      markResurfaced: async () => {},
    };
    const results = await run(AWAY, answeredStore);
    expect(results.map((r) => r.action)).toEqual(['dropped_answered']);
    expect(results.map((r) => r.action)).not.toContain('skipped_no_durable_sink');
  });
});
