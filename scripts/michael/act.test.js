// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-5, TS-8, TS-9 — the action verbs stamp the revoke signals.
import { describe, it, expect } from 'vitest';
import { runGmailAct, planModify, GMAIL_CLIENT_ABSENT } from './gmail-act.mjs';
import { runTodoistAct, reversesProposal, VERBS } from './todoist-act.mjs';

const NOW = new Date('2026-09-06T09:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

/** Recording stub: reads answer from `tables`, mutations recorded in `writes` and answered by `answerWrite`. */
function recorder({ tables = {}, answerWrite = () => ({ data: { id: 'new-id' }, error: null }), readError = null } = {}) {
  const writes = [];
  const froms = [];
  const client = {
    writes, froms,
    from(table) {
      froms.push(table);
      const ops = [];
      let mutating = false;
      const q = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            return (res, rej) => {
              if (mutating) { writes.push({ table, ops: [...ops] }); return Promise.resolve(answerWrite(table, ops)).then(res, rej); }
              if (readError) return Promise.resolve(readError).then(res, rej);
              const eqs = Object.fromEntries(ops.filter((o) => o.op === 'eq').map((o) => o.args));
              const rows = (tables[table] || []).filter((r) => Object.entries(eqs).every(([k, v]) => r[k] === v));
              return Promise.resolve({ data: rows, error: null }).then(res, rej);
            };
          }
          return (...args) => { if (['insert', 'update', 'upsert', 'delete'].includes(prop)) mutating = true; ops.push({ op: prop, args }); return q; };
        },
      });
      return q;
    },
  };
  return client;
}

describe('gmail-act (TS-9)', () => {
  it('planModify: label adds, archive removes INBOX, unarchive adds INBOX', () => {
    expect(planModify({ label: 'L1', archive: true })).toEqual({ addLabelIds: ['L1'], removeLabelIds: ['INBOX'] });
    expect(planModify({ unarchive: true })).toEqual({ addLabelIds: ['INBOX'], removeLabelIds: [] });
  });
  it('A14: absent seam => exit-2 refusal GMAIL_CLIENT_ABSENT naming child C, ZERO from() calls, nothing written', async () => {
    const sb = recorder();
    const r = await runGmailAct({ sb, argv: ['--thread', 't1', '--archive'], now: NOW, loadClient: async () => null });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe(GMAIL_CLIENT_ABSENT);
    expect(r.message).toMatch(/child C/);
    expect(r.would_call).toEqual({ threadId: 't1', addLabelIds: [], removeLabelIds: ['INBOX'] });
    expect(sb.froms).toHaveLength(0);
    expect(sb.writes).toHaveLength(0);
  });
  it('present seam: --unarchive calls modifyThread and stamps reopened_at on the triage row (upsert by et_date,thread_id)', async () => {
    const calls = [];
    const client = { modifyThread: async (args) => { calls.push(args); return { ok: true, modified: 1 }; } };
    const sb = recorder({ tables: { michael_gmail_triage_items: [{ id: 'row-1', et_date: '2026-09-06', thread_id: 't1', rule_key: 'newsletters-archive', action_intent: 'archive' }] } });
    const r = await runGmailAct({ sb, argv: ['--thread', 't1', '--unarchive'], now: NOW, loadClient: async () => client });
    expect(r).toMatchObject({ ok: true, thread_id: 't1', action_intent: 'unarchive', reopened_at: NOW.toISOString(), modified: 1 });
    expect(calls).toEqual([{ threadId: 't1', addLabelIds: ['INBOX'], removeLabelIds: [] }]);
    const [w] = sb.writes;
    expect(w.ops[0].op).toBe('upsert');
    expect(w.ops[0].args[1]).toEqual({ onConflict: 'et_date,thread_id' });
    expect(w.ops[0].args[0]).toMatchObject({ et_date: '2026-09-06', thread_id: 't1', action_intent: 'unarchive', reopened_at: NOW.toISOString(), rule_key: 'newsletters-archive' });
  });
  it('present seam: --archive does NOT stamp reopened_at; a failed modify writes nothing', async () => {
    const sb = recorder();
    const r = await runGmailAct({ sb, argv: ['--thread', 't2', '--label', 'L9', '--archive', '--rule-key', 'k'], now: NOW, loadClient: async () => ({ modifyThread: async () => ({ ok: true }) }) });
    expect(r.ok).toBe(true);
    expect(r.reopened_at).toBeNull();
    expect(sb.writes[0].ops[0].args[0]).not.toHaveProperty('reopened_at');
    expect(sb.writes[0].ops[0].args[0].rule_key).toBe('k');
    const sb2 = recorder();
    const f = await runGmailAct({ sb: sb2, argv: ['--thread', 't2', '--archive'], now: NOW, loadClient: async () => ({ modifyThread: async () => ({ ok: false, error: 'boom' }) }) });
    expect(f.refusal).toBe('GMAIL_MODIFY_FAILED');
    expect(sb2.writes).toHaveLength(0);
  });
  it('argument refusals and --dry-run (no API call, no write)', async () => {
    expect((await runGmailAct({ sb: recorder(), argv: ['--archive'] })).refusal).toBe('MISSING_ARGS');
    expect((await runGmailAct({ sb: recorder(), argv: ['--thread', 't', '--archive', '--unarchive'] })).refusal).toBe('CONFLICTING_ARGS');
    expect((await runGmailAct({ sb: recorder(), argv: ['--thread', 't'] })).refusal).toBe('MISSING_ARGS');
    let called = false;
    const sb = recorder();
    const r = await runGmailAct({ sb, argv: ['--thread', 't', '--archive', '--dry-run'], now: NOW, loadClient: async () => ({ modifyThread: async () => { called = true; return { ok: true }; } }) });
    expect(r.dry_run).toBe(true);
    expect(called).toBe(false);
    expect(sb.writes).toHaveLength(0);
  });
  it('absent tables after a successful modify: refuses TABLES_ABSENT and says the API change was applied', async () => {
    const sb = recorder({ readError: MISSING });
    const r = await runGmailAct({ sb, argv: ['--thread', 't', '--archive'], now: NOW, loadClient: async () => ({ modifyThread: async () => ({ ok: true }) }) });
    expect(r.refusal).toBe('TABLES_ABSENT');
    expect(r.api_applied).toBe(true);
  });
});

describe('todoist-act (TS-8)', () => {
  const api = (log) => ({
    updateTask: async (id, args) => { log.push(['updateTask', id, args]); return { id }; },
    closeTask: async (id) => { log.push(['closeTask', id]); return true; },
    addTask: async (args) => { log.push(['addTask', args]); return { id: 'new-task', ...args }; },
    addComment: async (args) => { log.push(['addComment', args]); return { id: 'c1' }; },
  });
  it('reversesProposal: only when a proposed_date exists and differs', () => {
    expect(reversesProposal({ proposed_date: '2026-09-08' }, '2026-09-10')).toBe(true);
    expect(reversesProposal({ proposed_date: '2026-09-08' }, '2026-09-08')).toBe(false);
    expect(reversesProposal({ proposed_date: null }, '2026-09-10')).toBe(false);
    expect(reversesProposal(null, '2026-09-10')).toBe(false);
  });
  it('reschedule to a DIFFERENT date than proposed stamps moved_back_at and appends the mutation', async () => {
    const log = [];
    const sb = recorder({ tables: { michael_todoist_snapshot: [{ id: 'r1', et_date: '2026-09-06', task_id: '42', proposed_date: '2026-09-08', rule_key: 'never-tuesday', mutations_applied: [{ verb: 'grade' }] }] } });
    const r = await runTodoistAct({ sb, argv: ['reschedule', '--task', '42', '--date', '2026-09-10'], now: NOW, loadClient: async () => api(log) });
    expect(r).toMatchObject({ ok: true, verb: 'reschedule', task_id: '42', moved_back_at: NOW.toISOString() });
    expect(log).toEqual([['updateTask', '42', { dueDate: '2026-09-10' }]]);
    const row = sb.writes[0].ops[0].args[0];
    expect(sb.writes[0].ops[0].args[1]).toEqual({ onConflict: 'et_date,task_id' });
    expect(row.moved_back_at).toBe(NOW.toISOString());
    expect(row.mutations_applied).toHaveLength(2);
    expect(row.mutations_applied[1]).toMatchObject({ verb: 'reschedule', args: ['42', { dueDate: '2026-09-10' }] });
    expect(row.chosen_action).toBe('reschedule');
    expect(row.rule_key).toBe('never-tuesday');
  });
  it('A13: reschedule to the SAME date as proposed does NOT stamp moved_back_at', async () => {
    const sb = recorder({ tables: { michael_todoist_snapshot: [{ id: 'r1', et_date: '2026-09-06', task_id: '42', proposed_date: '2026-09-08', mutations_applied: [] }] } });
    const r = await runTodoistAct({ sb, argv: ['reschedule', '--task', '42', '--date', '2026-09-08'], now: NOW, loadClient: async () => api([]) });
    expect(r.moved_back_at).toBeNull();
    expect(sb.writes[0].ops[0].args[0]).not.toHaveProperty('moved_back_at');
  });
  it('complete, add and comment call the right client methods and record the row', async () => {
    const log = [];
    const sb = recorder();
    expect((await runTodoistAct({ sb, argv: ['complete', '--task', '7'], now: NOW, loadClient: async () => api(log) })).ok).toBe(true);
    expect((await runTodoistAct({ sb, argv: ['add', '--content', 'Call dentist', '--project', 'p1', '--due', '2026-09-09'], now: NOW, loadClient: async () => api(log) })).task_id).toBe('new-task');
    expect((await runTodoistAct({ sb, argv: ['comment', '--task', '7', '--text', 'done'], now: NOW, loadClient: async () => api(log) })).ok).toBe(true);
    expect(log.map((l) => l[0])).toEqual(['closeTask', 'addTask', 'addComment']);
    expect(log[1][1]).toEqual({ content: 'Call dentist', projectId: 'p1', dueDate: '2026-09-09' });
    expect(log[2][1]).toEqual({ taskId: '7', content: 'done' });
    expect(sb.writes).toHaveLength(3);
    expect(VERBS).toEqual(['reschedule', 'complete', 'add', 'comment']);
  });
  it('refusals: unknown verb, missing args, bad dates; --dry-run never loads the client', async () => {
    expect((await runTodoistAct({ sb: recorder(), argv: ['delete', '--task', '1'] })).refusal).toBe('INVALID_VERB');
    expect((await runTodoistAct({ sb: recorder(), argv: ['reschedule', '--task', '1'] })).refusal).toBe('MISSING_ARGS');
    expect((await runTodoistAct({ sb: recorder(), argv: ['reschedule', '--task', '1', '--date', 'tomorrow'] })).refusal).toBe('DATE_INVALID');
    let loaded = false;
    const r = await runTodoistAct({ sb: recorder(), argv: ['complete', '--task', '1', '--dry-run'], now: NOW, loadClient: async () => { loaded = true; return api([]); } });
    expect(r).toMatchObject({ ok: true, dry_run: true, would_call: { method: 'closeTask', args: ['1'] } });
    expect(loaded).toBe(false);
  });
  it('a client failure is TODOIST_CALL_FAILED with nothing written; a missing token is TODOIST_CLIENT_UNAVAILABLE', async () => {
    const sb = recorder();
    const f = await runTodoistAct({ sb, argv: ['complete', '--task', '1'], now: NOW, loadClient: async () => ({ closeTask: async () => { throw new Error('401'); } }) });
    expect(f.refusal).toBe('TODOIST_CALL_FAILED');
    expect(sb.writes).toHaveLength(0);
    const u = await runTodoistAct({ sb, argv: ['complete', '--task', '1'], now: NOW, loadClient: async () => { throw new Error('TODOIST_API_TOKEN environment variable is required'); } });
    expect(u.refusal).toBe('TODOIST_CLIENT_UNAVAILABLE');
  });
});
