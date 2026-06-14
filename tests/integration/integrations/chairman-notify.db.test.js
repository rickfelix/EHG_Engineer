/**
 * SD-LEO-INFRA-CHAIRMAN-NOTIFY-CAPABILITY-001 — opt-in LIVE verify (real Todoist v1 API).
 * Confirms the helper's reminder_add recipe actually creates a VERIFIED push reminder against the real API,
 * then DELETES the test task (which removes its reminder) so the chairman is NEVER buzzed. Self-skips without
 * TODOIST_API_TOKEN. Runs only under the opt-in `db` project (npm run test:db) — never in the default unit run.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { notifyChairman } from '../../../lib/integrations/todoist/chairman-notify.js';

const TOKEN = process.env.TODOIST_API_TOKEN;
const PROJECT_ID = process.env.CHAIRMAN_TODOIST_PROJECT_ID || '6grHWpvVM8QXrj5W';
const MARKER = 'chairman-notify capability verification';

afterAll(async () => {
  // Sweep the chairman project for ANY marker-tagged test task and delete it — robust even if notifyChairman
  // THREW after creating the task (reminder_add/verify failed), which would otherwise orphan it. The 30-min-out
  // reminder is removed with the task, so it never fires.
  if (!TOKEN) return;
  try {
    const resp = await fetch(`https://api.todoist.com/api/v1/tasks?project_id=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await resp.json();
    const tasks = Array.isArray(data) ? data : data.results || data.items || [];
    for (const t of tasks.filter((x) => (x.content || '').includes(MARKER))) {
      await fetch(`https://api.todoist.com/api/v1/tasks/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
    }
  } catch { /* best-effort cleanup */ }
});

describe.skipIf(!TOKEN)('notifyChairman LIVE verify (opt-in, self-cleaning, non-disruptive)', () => {
  it('creates a VERIFIED push reminder via the real v1 API, then the task is deleted (never buzzes)', async () => {
    const due = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30min out — deleted long before it could fire
    const res = await notifyChairman({
      title: '[TEST] chairman-notify capability verification (auto-deleted, ignore)',
      description: 'SD-LEO-INFRA-CHAIRMAN-NOTIFY-CAPABILITY-001 live verify — this task self-deletes',
      priority: 'low',
      dueDatetime: due,
    });
    expect(res.verified).toBe(true);
    expect(res.taskId).toBeTruthy();
    expect(res.reminderId).toBeTruthy();
    expect(res.due).toBe(due);
  }, 30000);
});
