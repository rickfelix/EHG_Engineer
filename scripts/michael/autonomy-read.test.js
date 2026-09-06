// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-4, TS-5, TS-6, TS-15 — earned autonomy as a read.
import { describe, it, expect } from 'vitest';
import { computeStreaks, resolveThreshold, evaluateAutonomy, revocationsFor, runAutonomyRead, DEFAULT_THRESHOLD, REVOKE_SIGNALS } from './autonomy-read.mjs';

const rule = (key, over = {}) => ({ id: `id-${key}`, domain: 'gmail', rule_key: key, rule_text: key, status: 'active', auto_apply: false, auto_apply_verb: null, rule_json: { verb: 'archive' }, ...over });
const day = (et_date, dispositions) => ({ et_date, dispositions });
const disp = (rule_key, chosen) => ({ topic: 'gmail', rule_key, chosen });
const approves = (key, n, start = 1) => Array.from({ length: n }, (_, i) => day(`2026-09-${String(start + i).padStart(2, '0')}`, [disp(key, 'approve')]));

describe('computeStreaks', () => {
  it('counts the trailing consecutive approves per rule, in et_date order regardless of row order', () => {
    const ledger = [...approves('A', 3, 2), day('2026-09-01', [disp('A', 'override')])].reverse();
    const s = computeStreaks(ledger);
    expect(s.get('A').streak).toBe(3);
    expect(s.get('A').last_three).toEqual(['approve', 'approve', 'approve']);
  });
  it('override, skip and auto each reset the streak; gap days are ignored', () => {
    for (const resetter of ['override', 'skip', 'auto']) {
      const ledger = [...approves('A', 6), day('2026-09-07', [disp('A', resetter)]), day('2026-09-09', [disp('A', 'approve')])];
      expect(computeStreaks(ledger).get('A').streak, resetter).toBe(1);
    }
    const gapped = [day('2026-09-01', [disp('A', 'approve')]), day('2026-09-02', [disp('B', 'override')]), day('2026-09-05', [disp('A', 'approve')])];
    expect(computeStreaks(gapped).get('A').streak).toBe(2);
  });
  it('dispositions without a rule_key are ignored', () => {
    expect(computeStreaks([day('2026-09-01', [{ topic: 'x', chosen: 'approve' }])]).size).toBe(0);
  });
});

describe('resolveThreshold precedence (A6)', () => {
  it('--threshold beats the brief rule beats the default 7', () => {
    const rules = [rule('autonomy_threshold', { domain: 'brief', rule_json: { value: 3 } })];
    expect(resolveThreshold({ argThreshold: '5', rules })).toEqual({ threshold: 5, source: 'arg' });
    expect(resolveThreshold({ argThreshold: null, rules })).toEqual({ threshold: 3, source: 'michael_rules' });
    expect(resolveThreshold({ argThreshold: null, rules: [] })).toEqual({ threshold: DEFAULT_THRESHOLD, source: 'default' });
    expect(resolveThreshold({ argThreshold: 'lots', rules: [] }).threshold).toBe(7);
  });
  it('a seeded threshold of 3 yields a proposal at streak 3 (kills a hard-coded 7)', () => {
    const rules = [rule('A'), rule('autonomy_threshold', { domain: 'brief', rule_json: { value: 3 } })];
    const r = evaluateAutonomy({ rules, ledger: approves('A', 3) });
    expect(r.threshold).toBe(3);
    expect(r.proposals).toEqual([{ rule_key: 'A', action: 'flip_auto_apply', verb: 'archive', streak: 3, threshold: 3 }]);
  });
});

describe('TS-5: proposals', () => {
  it('seven consecutive approves on a label/archive/reschedule rule yields exactly one proposal', () => {
    for (const verb of ['label', 'archive', 'reschedule']) {
      const r = evaluateAutonomy({ rules: [rule('A', { rule_json: { verb } })], ledger: approves('A', 7) });
      expect(r.proposals, verb).toHaveLength(1);
      expect(r.proposals[0].verb).toBe(verb);
    }
  });
  it('six approves then an override yields no proposal', () => {
    const r = evaluateAutonomy({ rules: [rule('A')], ledger: [...approves('A', 6), day('2026-09-07', [disp('A', 'override')])] });
    expect(r.proposals).toEqual([]);
    expect(r.streaks.A.streak).toBe(0);
  });
  it('complete and delete never propose, whatever the streak', () => {
    for (const verb of ['complete', 'delete']) {
      const r = evaluateAutonomy({ rules: [rule('A', { rule_json: { verb } })], ledger: approves('A', 9) });
      expect(r.proposals, verb).toEqual([]);
    }
  });
  it('A7 mixed-rule ledger: seven approves on A and seven overrides on B on the same days => one proposal, for A', () => {
    const ledger = Array.from({ length: 7 }, (_, i) => day(`2026-09-0${i + 1}`, [disp('A', 'approve'), disp('B', 'override')]));
    const r = evaluateAutonomy({ rules: [rule('A'), rule('B')], ledger });
    expect(r.proposals.map((p) => p.rule_key)).toEqual(['A']);
    expect(r.revocations.map((x) => x.rule_key)).toEqual(['B']);
    expect(r.revocations[0].signal).toBe(REVOKE_SIGNALS.THREE_OVERRIDES);
  });
  it('an already auto-applied rule is not re-proposed', () => {
    const r = evaluateAutonomy({ rules: [rule('A', { auto_apply: true, auto_apply_verb: 'archive' })], ledger: approves('A', 9) });
    expect(r.proposals).toEqual([]);
  });
});

describe('TS-6: revocations fire first', () => {
  it('a reopened_at on a thread the rule archived revokes immediately', () => {
    const triage = [{ et_date: '2026-09-05', thread_id: 't1', rule_key: 'A', action_intent: 'archive', action_taken_at: '2026-09-05T09:00:00Z', reopened_at: '2026-09-05T12:00:00Z' }];
    const r = evaluateAutonomy({ rules: [rule('A', { auto_apply: true, auto_apply_verb: 'archive' })], ledger: [], triage });
    expect(r.revocations).toEqual([{ rule_key: 'A', action: 'revoke', signal: 'reopened_at', thread_id: 't1', et_date: '2026-09-05' }]);
  });
  it('A11: a reopened_at EARLIER than action_taken_at is not a revoke; a moved_back_at on a rescheduled task is', () => {
    const triage = [{ thread_id: 't1', rule_key: 'A', action_intent: 'archive', action_taken_at: '2026-09-05T12:00:00Z', reopened_at: '2026-09-05T09:00:00Z' }];
    expect(revocationsFor(rule('A'), { triage })).toEqual([]);
    const snapshot = [{ et_date: '2026-09-05', task_id: 'k9', rule_key: 'A', moved_back_at: '2026-09-05T13:00:00Z' }];
    expect(revocationsFor(rule('A'), { snapshot })).toEqual([{ rule_key: 'A', action: 'revoke', signal: 'moved_back_at', task_id: 'k9', et_date: '2026-09-05' }]);
  });
  it('three consecutive overrides revoke; two do not', () => {
    const three = [day('2026-09-01', [disp('A', 'override')]), day('2026-09-02', [disp('A', 'override')]), day('2026-09-03', [disp('A', 'override')])];
    expect(evaluateAutonomy({ rules: [rule('A')], ledger: three }).revocations[0].signal).toBe('three_overrides');
    expect(evaluateAutonomy({ rules: [rule('A')], ledger: three.slice(1) }).revocations).toEqual([]);
  });
  it('A10 ordering: a rule at threshold that also has a reopened_at is in revocations and NOT in proposals', () => {
    const triage = [{ thread_id: 't1', rule_key: 'A', action_intent: 'archive', action_taken_at: null, reopened_at: '2026-09-05T12:00:00Z' }];
    const r = evaluateAutonomy({ rules: [rule('A')], ledger: approves('A', 8), triage });
    expect(r.revocations.map((x) => x.rule_key)).toEqual(['A']);
    expect(r.proposals).toEqual([]);
  });
  it('signals on another rule do not touch this one (rule_key equality, never substring)', () => {
    const triage = [{ thread_id: 't1', rule_key: 'A-extended', action_intent: 'archive', reopened_at: '2026-09-05T12:00:00Z' }];
    expect(revocationsFor(rule('A'), { triage })).toEqual([]);
  });
});

describe('runAutonomyRead against injected clients', () => {
  function stub(answers) {
    return {
      from(table) {
        const ops = [];
        const q = new Proxy({}, {
          get(_t, prop) {
            if (prop === 'then') return (res, rej) => Promise.resolve(answers(table, ops)).then(res, rej);
            return (...args) => { ops.push({ op: prop, args }); return q; };
          },
        });
        return q;
      },
    };
  }
  it('absent tables => inert: ok, empty arrays, tables_absent=true, default threshold', async () => {
    const r = await runAutonomyRead({ sb: stub(() => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } })), argv: ['--json'] });
    expect(r).toEqual({ ok: true, tables_absent: true, threshold: 7, proposals: [], revocations: [], streaks: {} });
  });
  it('--stage writes one rule_edit staged item per revocation and skips an existing open duplicate', async () => {
    const writes = [];
    const data = {
      michael_rules: [rule('A'), rule('B')],
      michael_feedback_ledger: [],
      michael_gmail_triage_items: [{ thread_id: 't1', rule_key: 'A', action_intent: 'archive', reopened_at: '2026-09-05T12:00:00Z' }, { thread_id: 't2', rule_key: 'B', action_intent: 'archive', reopened_at: '2026-09-05T12:00:00Z' }],
      michael_todoist_snapshot: [],
      michael_staged_items: [{ id: 'open-1', payload: { rule_key: 'B', signal: 'reopened_at' } }],
    };
    const sb = stub((table, ops) => {
      if (ops.some((o) => o.op === 'insert')) { writes.push(ops.find((o) => o.op === 'insert').args[0]); return { data: { id: 'staged-1' }, error: null }; }
      return { data: data[table] || [], error: null };
    });
    const r = await runAutonomyRead({ sb, argv: ['--stage'], now: new Date('2026-09-06T09:00:00Z') });
    expect(r.ok).toBe(true);
    expect(r.revocations).toHaveLength(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: 'rule_edit', payload: { rule_key: 'A', signal: 'reopened_at' } });
    expect(r.staged).toEqual([
      { rule_key: 'A', signal: 'reopened_at', id: 'staged-1', existing: false },
      { rule_key: 'B', signal: 'reopened_at', id: 'open-1', existing: true },
    ]);
  });
  it('--rule filters to one rule and --threshold overrides', async () => {
    const data = { michael_rules: [rule('A'), rule('B')], michael_feedback_ledger: approves('A', 2), michael_gmail_triage_items: [], michael_todoist_snapshot: [] };
    const sb = stub((table) => ({ data: data[table] || [], error: null }));
    const r = await runAutonomyRead({ sb, argv: ['--rule', 'A', '--threshold', '2'] });
    expect(r.threshold).toBe(2);
    expect(r.proposals.map((p) => p.rule_key)).toEqual(['A']);
  });
});
