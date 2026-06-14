/**
 * SD-LEO-INFRA-CHAIRMAN-NOTIFY-CAPABILITY-001 — notifyChairman unit tests (MOCKED fetch, zero real API
 * calls, no chairman spam). Pins: task-add + explicit v1 reminder_add (absolute/push/UTC ISO) + verify-via-v1;
 * fail-loud on no-reminder / sync-not-ok; v1 endpoint only (no v9); redacted missing-token; explicit reminder
 * is the push mechanism (not dueDatetime/!-syntax).
 */
import { describe, it, expect } from 'vitest';
import { notifyChairman } from '../../../lib/integrations/todoist/chairman-notify.js';

function mockFetch({ taskId = 'task-1', reminderId = 'rem-1', reminderOk = true, reminders } = {}) {
  const calls = [];
  // matches the REAL Todoist reminder shape: id + item_id + type:'absolute' + is_deleted (no `service` field)
  const remList = reminders ?? [{ id: reminderId, item_id: taskId, type: 'absolute', is_deleted: false }];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/v1/tasks')) {
      return { status: 200, json: async () => ({ id: taskId }) };
    }
    if (url.endsWith('/api/v1/sync')) {
      const cmds = new URLSearchParams(init.body).get('commands');
      if (cmds && cmds.includes('reminder_add')) {
        const cmd = JSON.parse(cmds)[0];
        // reminder_add returns sync_status + temp_id_mapping (temp_id -> real reminder id)
        return { status: 200, json: async () => ({ sync_status: { [cmd.uuid]: reminderOk ? 'ok' : { error: 'CANNOT' } }, temp_id_mapping: { [cmd.temp_id]: reminderId } }) };
      }
      return { status: 200, json: async () => ({ reminders: remList }) }; // verify read
    }
    return { status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

const deps = (mf) => ({ fetch: mf, token: 'test-token-redacted', projectId: 'proj-x' });

describe('notifyChairman (FR-1/FR-3)', () => {
  it('adds a task, attaches an explicit v1 reminder (absolute/push/UTC ISO), verifies via v1 read', async () => {
    const mf = mockFetch();
    const res = await notifyChairman({ title: 'Urgent: gate decision', description: 'd', priority: 'high' }, deps(mf));
    expect(res).toEqual({ taskId: 'task-1', reminderId: 'rem-1', verified: true, due: expect.any(String) });
    expect(res.due).toMatch(/Z$/); // UTC ISO

    // 3 calls: tasks add, sync reminder_add, sync verify
    expect(mf.calls).toHaveLength(3);
    expect(mf.calls[0].url).toBe('https://api.todoist.com/api/v1/tasks');
    expect(mf.calls[1].url).toBe('https://api.todoist.com/api/v1/sync');
    // the push mechanism is an EXPLICIT reminder_add with type:absolute + service:push
    const cmd = JSON.parse(new URLSearchParams(mf.calls[1].init.body).get('commands'))[0];
    expect(cmd.type).toBe('reminder_add');
    expect(cmd.args.type).toBe('absolute');
    expect(cmd.args.service).toBe('push');
    expect(cmd.args.due.date).toMatch(/Z$/);
    expect(cmd.args.item_id).toBe('task-1');
    // verify read requests the reminders resource
    expect(new URLSearchParams(mf.calls[2].init.body).get('resource_types')).toContain('reminders');
  });

  it('uses the v1 endpoint ONLY (no deprecated v9)', async () => {
    const mf = mockFetch();
    await notifyChairman({ title: 't' }, deps(mf));
    for (const c of mf.calls) {
      expect(c.url).toContain('/api/v1/');
      expect(c.url).not.toContain('/v9/');
      expect(c.url).not.toContain('sync/v9');
    }
  });

  it('the task add does NOT rely on dueDatetime/!-syntax for the push (no due on the task itself)', async () => {
    const mf = mockFetch();
    await notifyChairman({ title: 't', dueDatetime: '2030-01-01T00:00:00Z' }, deps(mf));
    const taskBody = JSON.parse(mf.calls[0].init.body);
    expect(taskBody.due_string).toBeUndefined();
    expect(taskBody.due_datetime).toBeUndefined();
    expect(taskBody.content).toBe('t'); // no leading ! quick-add priority hack
    // the due rode the explicit reminder instead:
    const cmd = JSON.parse(new URLSearchParams(mf.calls[1].init.body).get('commands'))[0];
    expect(cmd.args.due.date).toBe('2030-01-01T00:00:00.000Z');
  });

  it('FAIL-LOUD: reminder_add sync_status != ok throws (chairman would not be buzzed)', async () => {
    const mf = mockFetch({ reminderOk: false });
    await expect(notifyChairman({ title: 't' }, deps(mf))).rejects.toThrow(/reminder_add failed/);
  });

  it('FAIL-LOUD: verify-via-v1 finds no reminder at all throws (SDK-blind failure mode)', async () => {
    const mf = mockFetch({ reminders: [] });
    await expect(notifyChairman({ title: 't' }, deps(mf))).rejects.toThrow(/found NO matching absolute reminder/);
  });

  it('FAIL-LOUD: a DIFFERENT reminder on the task (wrong id / not absolute) does NOT pass verify (precise match)', async () => {
    // reminder_add maps temp_id -> 'rem-real', but the read only has a relative reminder with a different id
    const mf = mockFetch({ reminderId: 'rem-real', reminders: [{ id: 'rem-other', item_id: 'task-1', type: 'relative', is_deleted: false }] });
    await expect(notifyChairman({ title: 't' }, deps(mf))).rejects.toThrow(/found NO matching absolute reminder/);
  });

  it('matches the EXACT reminder it created (id from temp_id_mapping), ignoring an unrelated reminder', async () => {
    // two reminders on the task: a stale relative one + the absolute one we created (rem-mine)
    const mf = mockFetch({ reminderId: 'rem-mine', reminders: [
      { id: 'rem-stale', item_id: 'task-1', type: 'relative', is_deleted: false },
      { id: 'rem-mine', item_id: 'task-1', type: 'absolute', is_deleted: false },
    ] });
    const res = await notifyChairman({ title: 't' }, deps(mf));
    expect(res.reminderId).toBe('rem-mine');
    expect(res.verified).toBe(true);
  });

  it('missing TODOIST_API_TOKEN -> fail-loud + REDACTED (no token value in the message)', async () => {
    const saved = process.env.TODOIST_API_TOKEN;
    delete process.env.TODOIST_API_TOKEN;
    try {
      await expect(notifyChairman({ title: 't' }, { fetch: mockFetch() })).rejects.toThrow(/TODOIST_API_TOKEN is not set/);
    } finally {
      if (saved !== undefined) process.env.TODOIST_API_TOKEN = saved;
    }
  });

  it('requires a title', async () => {
    await expect(notifyChairman({}, deps(mockFetch()))).rejects.toThrow(/title/);
  });

  it('maps priority high->4 (urgent) on the task', async () => {
    const mf = mockFetch();
    await notifyChairman({ title: 't', priority: 'high' }, deps(mf));
    expect(JSON.parse(mf.calls[0].init.body).priority).toBe(4);
  });
});
