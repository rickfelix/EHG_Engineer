/**
 * golden-task-loader.mjs — DB-side golden-task + answer-key loader
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-2).
 *
 * Loads the sealed capability suite at RUNTIME from
 * feedback.category='model_capability_baseline' (fallback:
 * system_events.event_type='fable5_baseline_seal').
 *
 * REDACTION CONTRACT: answer_key and task_text never appear on any serialized
 * surface. GoldenTask#toJSON exposes only {task_id, shape, content_hash,
 * answer_key_ref}; the full task text is reachable only via .taskText (WeakMap
 * backing, invisible to JSON.stringify/console.log enumeration), and keys only
 * via suite.getKey(task_id). Error messages must never interpolate either.
 */

const SECRET = new WeakMap(); // GoldenTask -> { taskText }

export class GoldenTask {
  constructor({ task_id, shape, task_text, content_hash, answer_key_ref }) {
    this.task_id = task_id;
    this.shape = shape;
    this.content_hash = content_hash;
    this.answer_key_ref = answer_key_ref || null;
    SECRET.set(this, { taskText: task_text });
  }
  /** Full prompt text — memory-only accessor; never serialized. */
  get taskText() {
    return SECRET.get(this).taskText;
  }
  toJSON() {
    return {
      task_id: this.task_id,
      shape: this.shape,
      content_hash: this.content_hash,
      answer_key_ref: this.answer_key_ref,
    };
  }
}

export class GoldenSuite {
  constructor(tasks, keysById) {
    this.tasks = tasks;
    // Map serializes to {} under JSON.stringify — keys stay off every surface.
    this._keys = keysById;
  }
  /** Answer key for one task — memory-only; callers must not persist it. */
  getKey(taskId) {
    return this._keys.get(taskId) || null;
  }
  get size() {
    return this.tasks.length;
  }
  toJSON() {
    return { tasks: this.tasks, task_count: this.tasks.length };
  }
}

/** Pure: build a GoldenSuite from feedback-style rows ({metadata} objects). */
export function buildSuite(rows) {
  const tasks = [];
  const keys = new Map();
  for (const row of rows || []) {
    const m = row.metadata || row.payload || {};
    if (m.record_kind !== 'answer_key') continue;
    tasks.push(new GoldenTask({
      task_id: m.task_id,
      shape: m.shape,
      task_text: m.task_text,
      content_hash: m.content_hash,
      answer_key_ref: `db:${row.id || m.task_id}`,
    }));
    keys.set(m.task_id, { answer_key: m.answer_key, answer_key_ref: `db:${row.id || m.task_id}` });
  }
  tasks.sort((a, b) => a.task_id.localeCompare(b.task_id));
  return new GoldenSuite(tasks, keys);
}

/** Load the sealed suite from the DB. Throws generic errors — never key text. */
export async function loadGoldenSuite(supabase) {
  const primary = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', 'model_capability_baseline');
  if (!primary.error && primary.data && primary.data.length) return buildSuite(primary.data);

  const mirror = await supabase
    .from('system_events')
    .select('id, payload')
    .eq('event_type', 'fable5_baseline_seal');
  if (mirror.error) throw new Error('golden-task-loader: sealed corpus unavailable from both stores');
  return buildSuite(mirror.data);
}
