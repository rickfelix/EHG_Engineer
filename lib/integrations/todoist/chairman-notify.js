/**
 * Chairman phone-notify capability — SD-LEO-INFRA-CHAIRMAN-NOTIFY-CAPABILITY-001.
 *
 * notifyChairman({title, description, priority, dueDatetime?, reminder?}) is the ONE canonical way for
 * Adam AND the coordinator to buzz the chairman's phone for urgent decisions / human action-items. It:
 *   1. adds a task to the EHG Todoist project,
 *   2. attaches an EXPLICIT v1 reminder via the Sync API reminder_add (the @doist SDK is BLIND to reminders
 *      — they are a Sync-API-only resource; SDK addTask alone attaches 0 reminders and never pushes), and
 *   3. VERIFIES the reminder actually attached via a v1 read (fail-loud if not).
 *
 * Phone-push is a LAYER on top of the coordinator decision-queue / fn_chairman_decide — complement, never
 * replace. v1 endpoint ONLY (the deprecated v9 sync endpoint is never used). dueDatetime / the ! quick-add
 * syntax attach 0 reminders and never push — only the explicit reminder_add buzzes the phone.
 *
 * Safety: TODOIST_API_TOKEN is read from env and NEVER logged; a missing token fails loud + REDACTED.
 * fetch + token + projectId are injectable (deps) so unit tests never call the real API (no chairman spam).
 */
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const V1_SYNC_URL = 'https://api.todoist.com/api/v1/sync';
const V1_TASKS_URL = 'https://api.todoist.com/api/v1/tasks';
const DEFAULT_PROJECT_ID = '6grHWpvVM8QXrj5W'; // EHG chairman project
const DEFAULT_REMINDER_LEAD_MS = 60 * 1000;    // default reminder fires ~now+1min if no due given

/** Todoist API priority: 4 = urgent (p1) … 1 = normal (p4). Chairman notifications default to urgent. */
function priorityToTodoist(p) {
  return { high: 4, medium: 3, low: 2 }[String(p || '').toLowerCase()] || 4;
}

/** Absolute UTC ISO due. reminder overrides dueDatetime; both absent -> now + lead. Throws on invalid. */
function toUtcIso(when) {
  const d = when ? new Date(when) : new Date(Date.now() + DEFAULT_REMINDER_LEAD_MS);
  if (Number.isNaN(d.getTime())) throw new Error('notifyChairman: invalid dueDatetime/reminder timestamp');
  return d.toISOString();
}

function resolveToken(deps) {
  const token = (deps && deps.token) || process.env.TODOIST_API_TOKEN;
  if (!token) {
    // fail-loud but REDACTED — never surface the token value
    throw new Error('notifyChairman: TODOIST_API_TOKEN is not set — cannot reach the chairman (the explicit v1 reminder requires a token)');
  }
  return token;
}

/**
 * Add a chairman task + an explicit verified push reminder.
 * @param {object} opts
 * @param {string}  opts.title
 * @param {string}  [opts.description]
 * @param {string}  [opts.priority='high']  high|medium|low
 * @param {string|number|Date} [opts.dueDatetime]  absolute reminder time (UTC ISO recommended)
 * @param {string|number|Date} [opts.reminder]     alias for dueDatetime (overrides it)
 * @param {object} [deps]  {fetch, token, projectId} — injected for tests
 * @returns {Promise<{taskId:string, reminderId:(string|null), verified:true, due:string}>}
 */
export async function notifyChairman({ title, description = '', priority = 'high', dueDatetime, reminder } = {}, deps = {}) {
  if (!title || typeof title !== 'string') throw new Error('notifyChairman: title (non-empty string) is required');
  const doFetch = deps.fetch || fetch;
  const token = deps.token || resolveToken(deps);
  const projectId = deps.projectId || process.env.CHAIRMAN_TODOIST_PROJECT_ID || DEFAULT_PROJECT_ID;
  const authHeader = { Authorization: `Bearer ${token}` };
  const dueIso = toUtcIso(reminder ?? dueDatetime);

  // 1) add the task (REST v1) — returns the created task with its id
  const taskResp = await doFetch(V1_TASKS_URL, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: title, description, project_id: projectId, priority: priorityToTodoist(priority) }),
  });
  const task = await taskResp.json();
  const taskId = task && task.id != null ? String(task.id) : null;
  if (!taskId) throw new Error(`notifyChairman: task creation failed (no id, status ${taskResp.status})`);

  // 2) attach the EXPLICIT reminder via Sync v1 reminder_add (SDK is blind to this).
  // service:'push' requests the phone push (the live reminder object does NOT echo `service` back — it
  // carries notify_uid + type instead — so we never verify on `service`). temp_id lets us read back the
  // real reminder id from temp_id_mapping for a PRECISE verify (match the reminder we created, not just any).
  const uuid = randomUUID();
  const tempId = randomUUID();
  const reminderBody = new URLSearchParams({
    commands: JSON.stringify([{
      type: 'reminder_add',
      uuid,
      temp_id: tempId,
      args: { type: 'absolute', item_id: taskId, service: 'push', due: { date: dueIso, is_recurring: false } },
    }]),
  });
  const remResp = await doFetch(V1_SYNC_URL, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: reminderBody.toString(),
  });
  const remData = await remResp.json();
  if (remData?.sync_status?.[uuid] !== 'ok') {
    throw new Error(`notifyChairman: reminder_add failed (sync_status=${JSON.stringify(remData?.sync_status?.[uuid])}) — the chairman would NOT be buzzed`);
  }
  const createdReminderId = remData?.temp_id_mapping?.[tempId] != null ? String(remData.temp_id_mapping[tempId]) : null;

  // 3) VERIFY via a v1 read — the SDK sync is blind to v1 reminders, so confirm THE reminder we created
  // actually attached: match its real id (from temp_id_mapping) + that it is a live absolute reminder on
  // this task. We do NOT assert `service` (not returned) or a byte-exact due (Todoist drops sub-second
  // precision) — that would false-throw on a reminder that DID push.
  const verifyBody = new URLSearchParams({ sync_token: '*', resource_types: JSON.stringify(['reminders']) });
  const verResp = await doFetch(V1_SYNC_URL, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyBody.toString(),
  });
  const verData = await verResp.json();
  const reminders = Array.isArray(verData?.reminders) ? verData.reminders : [];
  const found = reminders.find((r) =>
    !r.is_deleted &&
    String(r.item_id) === taskId &&
    r.type === 'absolute' &&
    (createdReminderId ? String(r.id) === createdReminderId : true)
  );
  if (!found) {
    throw new Error(`notifyChairman: verify-via-v1 found NO matching absolute reminder (id ${createdReminderId ?? 'n/a'}) for task ${taskId} — the reminder did not attach (SDK-blind failure mode)`);
  }
  return { taskId, reminderId: found.id != null ? String(found.id) : createdReminderId, verified: true, due: dueIso };
}

/** CLI: node lib/integrations/todoist/chairman-notify.js --title "<t>" [--description ..] [--priority ..] [--due "<UTC ISO>"] */
async function cli(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const title = get('--title');
  if (!title) {
    console.error('Usage: node lib/integrations/todoist/chairman-notify.js --title "<t>" [--description "<d>"] [--priority high|medium|low] [--due "<UTC ISO>"]');
    process.exitCode = 1;
    return;
  }
  try {
    const res = await notifyChairman({ title, description: get('--description') || '', priority: get('--priority') || 'high', dueDatetime: get('--due') });
    console.log(`[chairman-notify] task ${res.taskId} + verified push reminder ${res.reminderId ?? '(id n/a)'} due ${res.due}`);
  } catch (err) {
    console.error(`[chairman-notify] FAILED: ${err?.message || err}`); // err messages are redacted by design
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2));
}
