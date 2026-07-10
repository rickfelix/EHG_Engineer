/**
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-5): IO-recording mock supabase for the frozen
 * pre-refactor snapshot. Records every DB/storage call the post-stage hooks make as a
 * flat, serializable call log — the hooks' observable behavior at the IO boundary.
 * The SAME recorder drives both the pre-refactor capture and the post-refactor
 * equivalence runs, so equality of logs = behavior preservation for the scenario.
 *
 * Scenario steering: `responses` maps a "table|op" key (e.g. 'venture_stage_work|select')
 * to the data returned, consumed FIFO when an array of responses is provided.
 */
export function makeRecordingSupabase(responses = {}) {
  const log = [];
  const queues = new Map(Object.entries(responses).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const nextResponse = (key) => {
    const q = queues.get(key);
    if (!q || q.length === 0) return { data: null, error: null };
    return q.length === 1 ? q[0] : q.shift();
  };

  function tableChain(table) {
    const entry = { table, op: null, filters: [], args: null };
    const chain = {
      select(cols) { entry.op = entry.op || 'select'; entry.args = cols; return chain; },
      insert(row) { entry.op = 'insert'; entry.args = row; return chain; },
      update(patch) { entry.op = 'update'; entry.args = patch; return chain; },
      upsert(row, opts) { entry.op = 'upsert'; entry.args = { row, opts }; return chain; },
      eq(col, val) { entry.filters.push(['eq', col, String(val)]); return chain; },
      gte(col, val) { entry.filters.push(['gte', col, String(val)]); return chain; },
      order(col, opts) { entry.filters.push(['order', col, JSON.stringify(opts ?? null)]); return chain; },
      limit(n) { entry.filters.push(['limit', String(n)]); return chain; },
      maybeSingle() { entry.filters.push(['maybeSingle']); return finish(); },
      single() { entry.filters.push(['single']); return finish(); },
      then(resolve, reject) { return finish().then(resolve, reject); },
    };
    async function finish() {
      log.push({ kind: 'db', table, op: entry.op, filters: entry.filters, args: summarize(entry.args) });
      return nextResponse(`${table}|${entry.op}`);
    }
    return chain;
  }

  const storage = {
    from(bucket) {
      return {
        async upload(path, _buf, opts) {
          log.push({ kind: 'storage', bucket, op: 'upload', path, opts: summarize(opts) });
          return nextResponse(`storage:${bucket}|upload`);
        },
        getPublicUrl(path) {
          log.push({ kind: 'storage', bucket, op: 'getPublicUrl', path });
          return { data: { publicUrl: `https://public.example/${path}` } };
        },
      };
    },
    async createBucket(name, opts) {
      log.push({ kind: 'storage', op: 'createBucket', name, opts: summarize(opts) });
      return { data: null, error: null };
    },
  };

  return { supabase: { from: tableChain, storage }, log };
}

/** Stable, shallow serialization for call-log comparison (drops volatile values). */
function summarize(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v !== 'object') return String(v);
  // Keys only (sorted) — values often carry timestamps/buffers; the SHAPE is the contract.
  return Object.keys(v).sort();
}

/** Silent logger capturing lines (log lines are part of observable behavior but noisy —
 * the snapshot compares only the count per level to catch dropped/added branches). */
export function makeRecordingLogger() {
  const lines = { log: 0, warn: 0, error: 0 };
  return {
    lines,
    log: () => { lines.log++; },
    warn: () => { lines.warn++; },
    error: () => { lines.error++; },
  };
}
