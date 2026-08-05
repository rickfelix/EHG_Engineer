/**
 * SD-LEO-INFRA-FORCE-ROLE-SESSIONS-001 — role capture gate.
 *
 * EVERY TEST HERE IS TWO-SIDED ON PURPOSE. A one-sided assertion ("the empty window reports
 * REQUIRED") passes just as happily against a gate that can NEVER be satisfied, and a gate that
 * always blocks is not a stricter gate — it is a broken one that teaches the seat to ignore it.
 *
 * FIXTURE DISCIPLINE, LEARNED THE HARD WAY ON THE PRECEDING SD: a fixture unlike production does
 * not merely weaken a test, it can NULLIFY it entirely while leaving it green. The no-capture
 * fixture text below MUST NOT contain a slash-qualified file path, an SD-/QF-/PAT- key, a
 * "table x" phrase or an "error: x" phrase — any one of those satisfies the concrete-referent
 * check in lib/eva/lesson-quality-guard.js, the text would score 1, and TS-3 would pass for a
 * reason that has nothing to do with the marker path being unscored.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, ROLE_CAPTURE_WINDOWS, EMISSION_CAPTURE, EMISSION_MARKER, GATE_STATE,
  isKnownRole, windowSecondsFor,
  evaluateRoleCaptureGate, recordForcedCapture, recordNoCaptureMarker,
} from '../../../lib/learning/role-capture-gate.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** An honest absence declaration. Deliberately carries NO concrete referent — see the header. */
const MARKER_TEXT = 'nothing worth recording came up this period';
/** A real learning. Carries a slash-qualified path, which is what the referent check requires. */
const REAL_LESSON =
  'The capture gate in lib/learning/role-capture-gate.js must keep its marker path off the scorer, '
  + 'because an honest absence declaration can never satisfy the concrete-referent check.';

/**
 * Supabase double.
 * `rows` is the fake issue_patterns table; queries are filtered the way PostgREST would.
 * `failOn` forces the store to error, for the fail-soft arm.
 */
function makeDb({ rows = [], failOn = null } = {}) {
  const inserted = [];
  const client = {
    inserted,
    from(table) {
      const filters = {};
      const q = {
        _table: table,
        select() { return q; },
        eq(col, val) { filters[col] = val; return q; },
        gte(col, val) { filters[`gte:${col}`] = val; return q; },
        order() { return q; },
        limit() { return q.then ? q : q; },
        insert(row) {
          if (failOn === 'insert') return Promise.resolve({ error: { message: 'insert exploded' } });
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
        // Thenable so `await supabase.from(...).select(...)...limit(1)` resolves.
        then(onFulfilled) {
          if (failOn === 'select') return Promise.resolve({ data: null, error: { message: 'select exploded' } }).then(onFulfilled);
          const matched = rows.filter((r) => {
            if (filters['metadata->>role'] && r.metadata?.role !== filters['metadata->>role']) return false;
            if (filters['metadata->>emission_type'] && r.metadata?.emission_type !== filters['metadata->>emission_type']) return false;
            const gte = filters['gte:created_at'];
            if (gte && Date.parse(r.created_at) < Date.parse(gte)) return false;
            return true;
          });
          return Promise.resolve({ data: matched, error: null }).then(onFulfilled);
        },
      };
      return q;
    },
  };
  return client;
}

const at = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const artifactRow = (role, emission, secondsAgo) => ({
  pattern_id: `PAT-RCG-${role}-${secondsAgo}`,
  created_at: at(secondsAgo),
  issue_summary: 'x',
  metadata: { role, emission_type: emission },
});

describe('TS-1: the gate reports REQUIRED on an empty window and SATISFIED on a real capture', () => {
  it('reports REQUIRED when the window holds nothing', async () => {
    const r = await evaluateRoleCaptureGate({ supabase: makeDb({ rows: [] }), role: 'adam' });
    expect(r.state).toBe(GATE_STATE.REQUIRED);
    expect(r.kind).toBeNull();
  });

  it('reports SATISFIED with kind=capture when the window holds a real capture', async () => {
    const db = makeDb({ rows: [artifactRow('adam', EMISSION_CAPTURE, 60)] });
    const r = await evaluateRoleCaptureGate({ supabase: db, role: 'adam' });
    expect(r.state).toBe(GATE_STATE.SATISFIED);
    expect(r.kind).toBe('capture');
  });
});

describe('TS-2: an explicit no-capture marker SATISFIES the gate and stays distinguishable', () => {
  it('is accepted, and is reported as a marker rather than as a capture', async () => {
    const db = makeDb({ rows: [artifactRow('coordinator', EMISSION_MARKER, 60)] });
    const r = await evaluateRoleCaptureGate({ supabase: db, role: 'coordinator' });
    expect(r.state).toBe(GATE_STATE.SATISFIED);
    // Satisfying-but-indistinguishable is the failure mode that rebuilds alert fatigue: it would
    // hide a role that only ever markers inside an aggregate "satisfied" count.
    expect(r.kind).toBe('no_capture_marker');
    expect(EMISSION_MARKER).not.toBe(EMISSION_CAPTURE);
  });

  it('prefers a real capture over a marker when the window holds both', async () => {
    const db = makeDb({ rows: [artifactRow('adam', EMISSION_CAPTURE, 30), artifactRow('adam', EMISSION_MARKER, 10)] });
    const r = await evaluateRoleCaptureGate({ supabase: db, role: 'adam' });
    expect(r.kind).toBe('capture');
  });
});

describe('TS-3 (F7 REGRESSION GUARD): the same text is REJECTED as a capture and ACCEPTED as a marker', () => {
  // This is the whole reason the two write paths are structurally separate. Measured against the
  // live guard: all four plausible honest "nothing to capture" phrasings score 0, every one on the
  // concrete-referent check, because an absence declaration cannot name a referent by
  // construction. Routing the marker through the scorer would reject the very artifact the gate
  // must accept, exactly when a role legitimately has nothing to report.
  it('refuses the marker text through the SCORED path, and says why', async () => {
    const db = makeDb();
    const r = await recordForcedCapture({ supabase: db, role: 'adam', text: MARKER_TEXT });
    expect(r.recorded).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/concrete referent/);
    expect(db.inserted).toHaveLength(0);
  });

  it('accepts the IDENTICAL text through the UNSCORED marker path', async () => {
    const db = makeDb();
    const r = await recordNoCaptureMarker({ supabase: db, role: 'adam', note: MARKER_TEXT });
    expect(r.recorded).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].metadata.emission_type).toBe(EMISSION_MARKER);
  });

  it('accepts a genuine referent-bearing learning through the scored path', async () => {
    // The other arm: if the scored path rejected everything, the test above would pass for the
    // wrong reason and the gate would be unsatisfiable by design.
    const db = makeDb();
    const r = await recordForcedCapture({ supabase: db, role: 'coordinator', text: REAL_LESSON });
    expect(r.recorded).toBe(true);
    expect(db.inserted[0].metadata.emission_type).toBe(EMISSION_CAPTURE);
  });
});

describe('TS-4 (MUTATION PROOF): the marker path contains no route to the scorer', () => {
  // A behavioural test alone cannot hold this line: a future refactor that unified the two write
  // paths would leave TS-3 green whenever its fixture text happened to carry a referent. This
  // reads the source so the structural separation itself is asserted.
  //
  // Proven by mutation during EXEC: routing recordNoCaptureMarker through scoreLessonQuality makes
  // the TS-3 marker case fail (recorded:false, "no concrete referent"), and reverting restores
  // green. Both arms observed — a guard is only proven by the mutation that would expose it.
  const SRC = readFileSync(resolve(REPO_ROOT, 'lib/learning/role-capture-gate.js'), 'utf8');

  it('recordNoCaptureMarker never calls scoreLessonQuality', () => {
    const body = SRC.slice(SRC.indexOf('export async function recordNoCaptureMarker'));
    expect(body).not.toContain('scoreLessonQuality');
  });

  it('recordForcedCapture DOES call scoreLessonQuality', () => {
    const start = SRC.indexOf('export async function recordForcedCapture');
    const body = SRC.slice(start, SRC.indexOf('export async function recordNoCaptureMarker'));
    expect(body).toContain('scoreLessonQuality');
  });
});

describe('TS-5: a store failure is visible, never silent and never thrown', () => {
  it('evaluate reports STORE_ERROR rather than throwing or reporting SATISFIED', async () => {
    const r = await evaluateRoleCaptureGate({ supabase: makeDb({ failOn: 'select' }), role: 'adam' });
    expect(r.state).toBe(GATE_STATE.STORE_ERROR);
    // The dangerous failure is not the error — it is a broken store reading as a cleared obligation.
    expect(r.state).not.toBe(GATE_STATE.SATISFIED);
    expect(r.error).toMatch(/select exploded/);
  });

  it('record and marker return the error instead of throwing', async () => {
    const cap = await recordForcedCapture({ supabase: makeDb({ failOn: 'insert' }), role: 'adam', text: REAL_LESSON });
    expect(cap.recorded).toBe(false);
    expect(cap.error).toMatch(/insert exploded/);
    const mark = await recordNoCaptureMarker({ supabase: makeDb({ failOn: 'insert' }), role: 'adam' });
    expect(mark.recorded).toBe(false);
    expect(mark.error).toMatch(/insert exploded/);
  });

  it('a missing client or unknown role is named, never silently defaulted', async () => {
    expect((await evaluateRoleCaptureGate({ supabase: null, role: 'adam' })).state).toBe(GATE_STATE.STORE_ERROR);
    const bogus = await evaluateRoleCaptureGate({ supabase: makeDb(), role: 'nobody' });
    expect(bogus.state).toBe(GATE_STATE.STORE_ERROR);
    expect(bogus.error).toMatch(/unknown role/);
    expect(isKnownRole('nobody')).toBe(false);
  });
});

describe('TS-6: all three chairman-named roles are wired, asserted BY NAME', () => {
  // Adam and the coordinator share a COMPOSED_CORES registration pattern that Solomon does not
  // have. That asymmetry is exactly how two-of-three ships while looking like three.
  const read = (p) => readFileSync(resolve(REPO_ROOT, p), 'utf8');

  it('covers Adam, Solomon and the coordinator — no role missing', () => {
    expect(ROLES).toEqual(['adam', 'coordinator', 'solomon']);
  });

  it('adam-quiet-tick registers the capture gate as a core', () => {
    const src = read('scripts/adam-quiet-tick.mjs');
    expect(src).toContain('role-capture-gate.mjs');
    expect(src).toMatch(/'--role',\s*'adam'/);
  });

  it('coordinator-quiet-tick registers it AND does not skip it when quiescent', () => {
    const src = read('scripts/coordinator-quiet-tick.mjs');
    const entry = src.split('\n').find((l) => l.includes("key: 'capture-gate'"));
    expect(entry).toBeTruthy();
    expect(entry).toMatch(/'--role',\s*'coordinator'/);
    // Load-bearing: an obligation that evaporates when the fleet is quiet exempts the seat most
    // likely to be the wedged one.
    expect(entry).toContain('quiescentSkip: false');
  });

  it('solomon-self-adherence-review evaluates the gate for solomon', () => {
    const src = read('scripts/solomon-self-adherence-review.mjs');
    expect(src).toContain('role-capture-gate.js');
    expect(src).toMatch(/role:\s*'solomon'/);
  });

  it('the durable cron checks all three roles and never records for them', () => {
    const yml = read('.github/workflows/role-capture-gate-cron.yml');
    for (const role of ROLES) expect(yml).toContain(`--role ${role}`);
    // A gate that can satisfy itself measures nothing.
    expect(yml).not.toMatch(/role-capture-gate\.mjs\s+(record|no-capture)/);
  });
});

describe('TS-7: a forced capture lands in the pipeline in the shape /learn admits', () => {
  it('writes source=retrospective with the forced emission type and the role', async () => {
    const db = makeDb();
    await recordForcedCapture({ supabase: db, role: 'solomon', text: REAL_LESSON });
    const row = db.inserted[0];
    // 'retrospective' is already admitted by the /learn noise filter; a new source value would
    // fail the issue_patterns_source_check CHECK enum outright, which is why origin rides on
    // metadata.emission_type instead.
    expect(row.source).toBe('retrospective');
    expect(row.metadata.emission_type).toBe(EMISSION_CAPTURE);
    expect(row.metadata.role).toBe('solomon');
    expect(row.issue_summary).toBe(REAL_LESSON);
  });

  it('does not depend on the uninvoked role-learning promoter', () => {
    // That promoter has zero production callers and has promoted zero of 669 eligible rows, so
    // routing the forced lane through it would make end-to-end landing depend on dead code.
    const src = readFileSync(resolve(REPO_ROOT, 'lib/learning/role-capture-gate.js'), 'utf8');
    expect(src).not.toContain("from '../learning/role-learning-promoter.js'");
    expect(src).not.toContain('promoteRoleLearnings');
  });
});

describe('TS-8: the window boundary holds in both directions, per role', () => {
  it('an artifact inside the window satisfies; one outside it does not', async () => {
    const inside = makeDb({ rows: [artifactRow('adam', EMISSION_CAPTURE, 1700)] });
    expect((await evaluateRoleCaptureGate({ supabase: inside, role: 'adam' })).state).toBe(GATE_STATE.SATISFIED);
    const outside = makeDb({ rows: [artifactRow('adam', EMISSION_CAPTURE, 1900)] });
    expect((await evaluateRoleCaptureGate({ supabase: outside, role: 'adam' })).state).toBe(GATE_STATE.REQUIRED);
  });

  it('Solomon carries a longer window than Adam and the coordinator', async () => {
    // Not a uniform constant, deliberately: Solomon's only recurring choke runs on a 12h cadence,
    // and a window shorter than the choke that evaluates it could never be satisfied.
    expect(windowSecondsFor('adam')).toBe(1800);
    expect(windowSecondsFor('coordinator')).toBe(1800);
    expect(windowSecondsFor('solomon')).toBe(43200);
    // The same 3h-old artifact: stale for Adam, still live for Solomon.
    const adam = makeDb({ rows: [artifactRow('adam', EMISSION_CAPTURE, 10800)] });
    expect((await evaluateRoleCaptureGate({ supabase: adam, role: 'adam' })).state).toBe(GATE_STATE.REQUIRED);
    const sol = makeDb({ rows: [artifactRow('solomon', EMISSION_CAPTURE, 10800)] });
    expect((await evaluateRoleCaptureGate({ supabase: sol, role: 'solomon' })).state).toBe(GATE_STATE.SATISFIED);
  });

  it('one role cannot satisfy another role obligation', async () => {
    const db = makeDb({ rows: [artifactRow('adam', EMISSION_CAPTURE, 60)] });
    expect((await evaluateRoleCaptureGate({ supabase: db, role: 'coordinator' })).state).toBe(GATE_STATE.REQUIRED);
  });

  it('every role has a pinned window — no role falls through to a default', () => {
    for (const role of ROLES) expect(ROLE_CAPTURE_WINDOWS[role]).toBeGreaterThan(0);
    expect(windowSecondsFor('nobody')).toBeNull();
  });
});
