/**
 * golden-task-loader.test.js — FR-1 loader + FR-2 contamination guard + FR-3
 * fail-closed population path (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-A).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadGoldenTaskSets,
  getAnswerKey,
  populateReference,
  MODEL_CAPABILITY_REFERENCE_CONTRACT,
  SEAL_EVENT_TYPE,
  MIRROR_CATEGORY,
  MIRROR_SUITE,
} from '../golden-task-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = join(__dirname, '..', '..', '..');
const LOADER_SRC_PATH = join(__dirname, '..', 'golden-task-loader.js');

const SHAPE_OF = {
  'FAB5-R2-01': 'R2-negative-space',
  'FAB5-R5-01': 'R5-reversal',
  'FAB5-MECH-01': 'mechanical-baseline',
};
const EFFORTS = ['high', 'medium', 'low'];

/**
 * A distinctive answer-key sentinel assembled AT RUNTIME so the full literal never
 * appears verbatim in any tracked file — that lets the repo-scan guard grep the
 * whole tree for it and legitimately find zero hits.
 */
const KEY_TOKEN = ['ANSWERKEY', 'SENTINEL', 'DONOTCOMMIT'].join('-');
const sentinelFor = (taskId) => `${KEY_TOKEN}::${taskId}::7f3a9c1e`;

/** Build sealed rows for a store. `field` is 'payload' (system_events) or 'metadata' (feedback). */
function buildRows(field, taskIds, { wallClockKey = 'wall_clock', suite = MIRROR_SUITE } = {}) {
  const rows = [];
  let id = 1;
  for (const t of taskIds) {
    // answer_key row (effort=null) — carries the sentinel key that must NEVER surface.
    rows.push({
      id: id++,
      [field]: {
        record_kind: 'answer_key',
        task_id: t,
        shape: SHAPE_OF[t],
        effort: null,
        task_text: `PROMPT for ${t}`,
        answer_key: sentinelFor(t),
        suite,
      },
    });
    // three sealed_run rows (one per effort) — output lives in fable5_answer, no key.
    for (const effort of EFFORTS) {
      rows.push({
        id: id++,
        [field]: {
          record_kind: 'sealed_run',
          task_id: t,
          shape: SHAPE_OF[t],
          effort,
          task_text: `PROMPT for ${t}`,
          fable5_answer: `run output ${t}/${effort}`,
          model_id: 'fable-5',
          tokens: 1000 + EFFORTS.indexOf(effort),
          [wallClockKey]: 5000 + EFFORTS.indexOf(effort),
          run_at: '2026-07-16T00:00:00Z',
          suite,
        },
      });
    }
  }
  return rows;
}

/** Minimal chainable supabase stub. `errors[table]` injects a query error. */
function makeStub({ tables = {}, errors = {} } = {}) {
  return {
    from(table) {
      const filters = [];
      let limit = null;
      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push([col, val]); return builder; },
        limit(n) { limit = n; return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (errors[table]) return { data: null, error: errors[table] };
            let rows = (tables[table] || []).slice();
            for (const [col, val] of filters) rows = rows.filter((r) => r[col] === val);
            if (limit != null) rows = rows.slice(0, limit);
            return { data: rows, error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

/** system_events rows carry event_type; feedback rows carry category — top-level for the stub filter. */
function asSystemEvents(rows) { return rows.map((r) => ({ ...r, event_type: SEAL_EVENT_TYPE })); }
function asFeedback(rows) { return rows.map((r) => ({ ...r, category: MIRROR_CATEGORY })); }

/** Reusable pure guard: scan given files for any of the sentinel substrings. */
function grepFilesForSentinels(files, sentinels, read = (f) => readFileSync(f, 'utf8')) {
  const hits = [];
  for (const f of files) {
    let content;
    try { content = read(f); } catch { continue; }
    for (const s of sentinels) if (content.includes(s)) hits.push({ file: f, sentinel: s });
  }
  return hits;
}

/** Repo-scan: does `sentinel` appear in ANY tracked file? Uses native `git grep -F`. */
function trackedTreeContains(sentinel) {
  try {
    const out = execSync(`git grep -F -l -- ${JSON.stringify(sentinel)}`, {
      cwd: WORKTREE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch (e) {
    // git grep exits 1 with no output when there are zero matches.
    if (e.status === 1 && !e.stdout) return [];
    throw e;
  }
}

describe('golden-task-loader (FR-1)', () => {
  const TASK_IDS = ['FAB5-R2-01', 'FAB5-R5-01', 'FAB5-MECH-01'];

  it('TS-1: assembles one set per task_id with shape, byte-identical task_text, sealed_runs, and NO answer_key', async () => {
    const stub = makeStub({ tables: { system_events: asSystemEvents(buildRows('payload', TASK_IDS)) } });
    const { sets, integrityErrors, source } = await loadGoldenTaskSets(stub);

    expect(source).toBe('system_events');
    expect(integrityErrors).toEqual([]);
    expect(sets.map((s) => s.task_id)).toEqual([...TASK_IDS].sort());

    const shapes = new Set(sets.map((s) => s.shape));
    expect(shapes).toEqual(new Set(['R2-negative-space', 'R5-reversal', 'mechanical-baseline']));

    for (const set of sets) {
      expect(set.task_text).toBe(`PROMPT for ${set.task_id}`);
      expect(set.sealed_runs).toHaveLength(3);
      expect(set.sealed_runs.map((r) => r.effort).sort()).toEqual(['high', 'low', 'medium']);
      for (const run of set.sealed_runs) {
        expect(run.output).toMatch(/^run output /);
        expect(run.model_id).toBe('fable-5');
        expect(typeof run.tokens).toBe('number');
        expect(typeof run.wall_clock).toBe('number');
        // CONTAMINATION GUARD (structural): no answer_key anywhere on a set or run.
        expect('answer_key' in run).toBe(false);
      }
      expect('answer_key' in set).toBe(false);
    }
  });

  it('TS-2: falls back to the feedback mirror ONLY when system_events is empty (and reads wall_clock_ms)', async () => {
    const stub = makeStub({
      tables: {
        system_events: [], // canonical empty
        feedback: asFeedback(buildRows('metadata', TASK_IDS, { wallClockKey: 'wall_clock_ms' })),
      },
    });
    const { sets, source } = await loadGoldenTaskSets(stub);
    expect(source).toBe('feedback');
    expect(sets).toHaveLength(TASK_IDS.length);
    // wall_clock_ms in the mirror is normalized onto wall_clock.
    expect(sets[0].sealed_runs.every((r) => typeof r.wall_clock === 'number')).toBe(true);
  });

  it('TS-2b: prefers canonical system_events over the mirror when BOTH are present', async () => {
    const stub = makeStub({
      tables: {
        system_events: asSystemEvents(buildRows('payload', ['FAB5-R2-01'])),
        feedback: asFeedback(buildRows('metadata', ['FAB5-R5-01', 'FAB5-MECH-01'])),
      },
    });
    const { sets, source } = await loadGoldenTaskSets(stub);
    expect(source).toBe('system_events');
    expect(sets.map((s) => s.task_id)).toEqual(['FAB5-R2-01']); // mirror ignored
  });

  it('TS-5: flags an integrity error when task_text differs across a task\'s rows (not silently merged)', async () => {
    const rows = asSystemEvents(buildRows('payload', ['FAB5-R2-01']));
    // Corrupt one sealed_run row's task_text.
    rows[2].payload.task_text = 'TAMPERED PROMPT';
    const stub = makeStub({ tables: { system_events: rows } });
    const { sets, integrityErrors } = await loadGoldenTaskSets(stub);

    expect(integrityErrors).toHaveLength(1);
    expect(integrityErrors[0]).toMatchObject({ task_id: 'FAB5-R2-01', error: 'TASK_TEXT_MISMATCH' });
    // still returns the set (flagged, not dropped) so callers can decide.
    expect(sets).toHaveLength(1);
  });

  it('throws GoldenTaskLoaderError (named) when both stores are unavailable', async () => {
    const stub = makeStub({
      tables: { system_events: [] },
      errors: { feedback: { message: 'connection refused' } },
    });
    await expect(loadGoldenTaskSets(stub)).rejects.toThrow(/sealed corpus unavailable/);
    await expect(loadGoldenTaskSets(stub)).rejects.toHaveProperty('name', 'GoldenTaskLoaderError');
  });
});

describe('getAnswerKey (FR-2 server-side accessor)', () => {
  it('returns the DB answer_key STRING for a task (the only sanctioned key read)', async () => {
    const stub = makeStub({ tables: { system_events: asSystemEvents(buildRows('payload', ['FAB5-R2-01'])) } });
    const key = await getAnswerKey(stub, 'FAB5-R2-01');
    expect(key).toBe(sentinelFor('FAB5-R2-01'));
    expect(await getAnswerKey(stub, 'NOPE-99')).toBeNull();
  });
});

describe('CONTAMINATION GUARD (FR-2, load-bearing)', () => {
  const TASK_IDS = ['FAB5-R2-01', 'FAB5-R5-01', 'FAB5-MECH-01'];
  const scratchFiles = [];
  afterAll(() => { for (const f of scratchFiles) { try { rmSync(f, { recursive: true, force: true }); } catch { /* noop */ } } });

  it('TS-3a: loadGoldenTaskSets output serialized to JSON contains NONE of the answer_key values', async () => {
    const stub = makeStub({ tables: { system_events: asSystemEvents(buildRows('payload', TASK_IDS)) } });
    const { sets } = await loadGoldenTaskSets(stub);
    const serialized = JSON.stringify(sets);
    expect(serialized).not.toContain(KEY_TOKEN);
    for (const t of TASK_IDS) expect(serialized).not.toContain(sentinelFor(t));
  });

  it('TS-3b: repo-scan — NO answer_key sentinel appears in ANY tracked file', () => {
    for (const t of [...TASK_IDS, 'FAB5-R4-02', 'FAB5-R1-01']) {
      expect(trackedTreeContains(sentinelFor(t))).toEqual([]);
    }
  });

  it('TS-3c: the guard has TEETH — it catches a fixture that WOULD write a key to a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'contam-guard-'));
    scratchFiles.push(dir);
    const leaked = join(dir, 'leaked-key.json');
    // A fixture that DOES what the guard forbids: persist a key into a file.
    writeFileSync(leaked, JSON.stringify({ task_id: 'FAB5-R2-01', answer_key: sentinelFor('FAB5-R2-01') }));

    const hits = grepFilesForSentinels([leaked], [sentinelFor('FAB5-R2-01')]);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe(leaked);
    // and the clean loader-source file yields no hit for the same scanner.
    expect(grepFilesForSentinels([LOADER_SRC_PATH], [sentinelFor('FAB5-R2-01')])).toEqual([]);
  });

  it('TS-3d: the loader module performs NO filesystem write of key material', () => {
    const src = readFileSync(LOADER_SRC_PATH, 'utf8');
    // No fs import and no write API — structural proof, not a comment.
    expect(src).not.toMatch(/from\s+['"]node:fs['"]|require\(['"]fs['"]\)/);
    expect(src).not.toMatch(/writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream/);
  });
});

describe('populateReference (FR-3 fail-closed / CEREMONY_PENDING)', () => {
  it('TS-4: returns {ok:false, status:CEREMONY_PENDING} when model_capability_reference is absent — no throw', async () => {
    // supabase-js resolves a missing-relation query as {error}, not a throw (PGRST205).
    const stub = makeStub({ errors: { model_capability_reference: { code: 'PGRST205', message: "Could not find the table 'public.model_capability_reference'" } } });
    const res = await populateReference(stub, [{ problem_shape: 'R2-negative-space' }]);
    expect(res.ok).toBe(false);
    expect(res.status).toBe('CEREMONY_PENDING');
    expect(res.table).toBe('model_capability_reference');
  });

  it('does not throw and stays non-writing when the table exists (grading is child B)', async () => {
    const stub = makeStub({ tables: { model_capability_reference: [] } });
    const res = await populateReference(stub, [{ problem_shape: 'x' }]);
    expect(res.ok).toBe(false);
    expect(res.status).toBe('GRADING_NOT_IMPLEMENTED_IN_CHILD_A');
    expect(res.would_write).toBe(1);
  });

  it('exports the population contract (key tuple + row shape) for children B/C', () => {
    expect(MODEL_CAPABILITY_REFERENCE_CONTRACT.key_tuple).toEqual(['problem_shape', 'model', 'effort']);
    expect(Object.keys(MODEL_CAPABILITY_REFERENCE_CONTRACT.columns)).toEqual(
      expect.arrayContaining(['clears_bar', 'quality_score', 'tokens', 'wall_clock', 'cost_norm', 'graded_at']),
    );
    expect(MODEL_CAPABILITY_REFERENCE_CONTRACT.staged).toBe(true);
  });
});
