/**
 * lib/chairman/decision-retirement.mjs — FR-1, arm-aware retirement.
 * SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001.
 *
 * The status vocabulary is asserted against the CHECK constraint's permitted set, read from
 * database/migrations/20260131_feedback_resolution_enforcement.sql:150-165 — not from what the
 * codebase happens to write. A value outside that set dies at runtime with 23514.
 */
import { describe, it, expect } from 'vitest';
import { planRetirement, applyRetirement, armOf, FEEDBACK_STATUS, DECISION_STATUS, CITATION_COLUMN, RETIRABLE_STATUSES } from '../../../lib/chairman/decision-retirement.mjs';
import { indexDispositions, DEFERRAL_CATEGORY } from '../../../lib/chairman/decision-disposition.mjs';

const NOW = new Date('2026-08-01T21:00:00Z');
const iso = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
// The provenance triple is the live shape (21/21): auto_capture + venture_id NULL + sentry_error.
// All three are required — anon can reach source_type='auto_capture' via venture_user_insert_feedback,
// so source_type alone is NOT a fence. See decision-disposition.mjs.
const deferral = (targetId) => ({
  id: `fb-${targetId}`, category: DEFERRAL_CATEGORY, created_at: iso(1),
  source_type: 'auto_capture', venture_id: null, feedback_type: 'sentry_error',
  description: 'Chairman verbal: "defer both".',
  metadata: { target_id: targetId, decided_by: 'chairman-cli', deferred_at: iso(1) }
});
const withAuth = (id) => indexDispositions([deferral(id)]);

// The exact permitted set of feedback_status_check.
const PERMITTED_FEEDBACK = ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate', 'invalid', 'backlog', 'shipped'];

describe('FR-1 arm routing', () => {
  it('routes each live decision_type to its real source table', () => {
    expect(armOf({ decision_type: 'chairman_approval' })).toBe('arm4');
    expect(armOf({ decision_type: 'flag_review' })).toBe('arm5');
    expect(armOf({ decision_type: 'flag_enablement' })).toBe('arm6');
    expect(armOf({ decision_type: 'something_else' })).toBe('unknown');
  });
});

describe('FR-3 authority gate — absence BLOCKS retirement', () => {
  it('a row with NO disposition yields null, not a permissive plan', () => {
    expect(planRetirement({ id: 'dec-9', decision_type: 'chairman_approval' }, withAuth('dec-1'))).toBe(null);
  });

  it('an UNATTRIBUTABLE record authorises nothing', () => {
    // Full provenance deliberately: this must fail on the MISSING ACTOR, not get filtered by the
    // fence first. Without the triple it would be rejected for the wrong reason (and now throws).
    const m = indexDispositions([{
      id: 'fb-z', category: DEFERRAL_CATEGORY, created_at: iso(1),
      source_type: 'auto_capture', venture_id: null, feedback_type: 'sentry_error',
      metadata: { target_id: 'dec-1', deferred_at: iso(1) }  // no decided_by
    }]);
    expect(planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, m)).toBe(null);
  });

  it('an unknown arm is UNSUPPORTED, not "no authority" — it never guesses a table', () => {
    // The queue emits SEVEN arms (escalation, two gate_decision arms, chairman_approval,
    // flag_review, flag_enablement, okr_acceptance); armOf maps three. Returning bare null made
    // applyRetirement report reason:'no_authority', which asserts the chairman never deferred the
    // row — the opposite of the truth when authority demonstrably exists.
    const plan = planRetirement({ id: 'dec-1', decision_type: 'okr_acceptance' }, withAuth('dec-1'));
    expect(plan.verdict).toBe('unsupported_arm');
    expect(plan.patch).toBe(null);
    expect(plan.table).toBe(null);
    expect(plan.citation).not.toBe(null);          // authority EXISTS — that is the whole point
    expect(plan.reason).toMatch(/no arm handles it/);
  });

  it('applyRetirement reports the unsupported arm as itself, NOT as no_authority', async () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'okr_acceptance' }, withAuth('dec-1'));
    const res = await applyRetirement({ from: () => { throw new Error('must not be called'); } }, plan);
    expect(res.wrote).toBe(false);
    expect(res.verdict).toBe('unsupported_arm');
    expect(res.reason).not.toBe('no_authority');
  });

  it('a genuinely absent plan IS no_authority — the two stay distinguishable', async () => {
    const res = await applyRetirement({ from: () => { throw new Error('must not be called'); } }, null);
    expect(res.reason).toBe('no_authority');
  });

  it('applyRetirement refuses a null plan without touching the db', async () => {
    const res = await applyRetirement({ from: () => { throw new Error('must not be called'); } }, null);
    expect(res.wrote).toBe(false);
    expect(res.reason).toBe('no_authority');
  });
});

describe('FR-1/TR-3 status vocabulary — never assert a decision the chairman did not make', () => {
  it('arm 5 uses ONLY values feedback_status_check permits', () => {
    expect(PERMITTED_FEEDBACK).toContain(FEEDBACK_STATUS.SUPERSEDED);
    expect(PERMITTED_FEEDBACK).toContain(FEEDBACK_STATUS.HELD);
  });

  it('arm 5 NEVER uses resolved or wont_fix — both assert an outcome he did not reach', () => {
    for (const d of ['held', 'superseded']) {
      // superseded on this arm requires a referent — see the chk_duplicate_requires_reference block.
      const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'),
        { disposition: d, supersededBy: 'newer-1' });
      expect(['resolved', 'wont_fix', 'approved', 'rejected']).not.toContain(plan.patch.status);
    }
  });

  it('arm 4 NEVER uses approved or rejected', () => {
    for (const d of ['held', 'superseded']) {
      const plan = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: d });
      expect(['approved', 'rejected']).not.toContain(plan.patch.status);
    }
  });

  it('the two dispositions are distinguishable per arm', () => {
    const a4h = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: 'held' });
    const a4s = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: 'superseded' });
    const a5h = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'held' });
    const a5s = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'superseded', supersededBy: 'newer-1' });
    expect(a4h.patch.status).toBe(DECISION_STATUS.HELD);
    expect(a4s.patch.status).toBe(DECISION_STATUS.SUPERSEDED);
    expect(a5h.patch.status).toBe(FEEDBACK_STATUS.HELD);
    expect(a5s.patch.status).toBe(FEEDBACK_STATUS.SUPERSEDED);
  });

  it('the citation travels WITH the write — a basis in a commit message is not a basis', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'));
    expect(plan.retirementBasis.cited_record).toBe('fb-dec-1');
    expect(plan.retirementBasis.decided_by).toBe('chairman-cli');
    expect(plan.retirementBasis.decided_at).toBeTruthy();
  });

  it('the citation targets a column that ACTUALLY EXISTS on the arm it writes', () => {
    // `retirement_basis` is not a column on either table — an explicit select returns 42703 on
    // feedback AND chairman_decisions, and no migration adds it. The citation therefore nests into
    // an existing jsonb column per arm. Pinned here because the original defect was invisible to a
    // fake that accepted any patch.
    expect(CITATION_COLUMN.chairman_decisions).toBe('brief_data');
    expect(CITATION_COLUMN.feedback).toBe('metadata');
    const a4 = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'));
    const a5 = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'));
    expect(a4.citationColumn).toBe('brief_data');
    expect(a5.citationColumn).toBe('metadata');
    // and the plan must NOT carry a phantom top-level column
    expect(a4.patch).not.toHaveProperty('retirement_basis');
    expect(a5.patch).not.toHaveProperty('retirement_basis');
  });
});

describe('feedback status=duplicate is CHECK-constrained to carry a referent', () => {
  // THE DEFECT THIS GUARDS: FEEDBACK_STATUS.SUPERSEDED is 'duplicate', and feedback has TWO live
  // CHECK constraints demanding a referent for that value —
  //   chk_duplicate_requires_reference: status <> 'duplicate' OR (duplicate_of_id IS NOT NULL AND duplicate_of_id <> id)
  //   chk_feedback_terminal_resolution: WHEN status='duplicate' THEN duplicate_of_id IS NOT NULL
  // All 70 live rows at status='duplicate' carry one (70/70). The first version wrote the status
  // without duplicate_of_id, so EVERY superseded retirement on this arm would have died with 23514.
  //
  // WHY IT WAS MISSED, worth recording: the status ENUM was read from
  // 20260131_feedback_resolution_enforcement.sql:150-165 and the invalidating constraint sits at
  // :235-240 OF THE SAME FILE. Reading the enum is not reading the constraints that govern its
  // values — the second instance of the retirement_basis class in this module.

  it('superseded on the feedback arm REFUSES without a referent rather than writing a doomed status', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'superseded' });
    expect(plan.verdict).toBe('blocked');
    expect(plan.patch).toBe(null);
    expect(plan.reason).toMatch(/duplicate_of_id|requires supersededBy/);
  });

  it('with a referent it writes BOTH status and duplicate_of_id', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'superseded', supersededBy: 'newer-1' });
    expect(plan.verdict).toBe('retire');
    expect(plan.patch.status).toBe(FEEDBACK_STATUS.SUPERSEDED);
    expect(plan.patch.duplicate_of_id).toBe('newer-1');
  });

  it('refuses a self-referential supersession — the constraint forbids duplicate_of_id = id', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'superseded', supersededBy: 'dec-1' });
    expect(plan.verdict).toBe('blocked');
    expect(plan.reason).toMatch(/supersede itself|equals the row id/);
  });

  it('the HELD path is unaffected — no CHECK governs backlog, so no referent is required', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'), { disposition: 'held' });
    expect(plan.verdict).toBe('retire');
    expect(plan.patch.status).toBe(FEEDBACK_STATUS.HELD);
    expect(plan.patch).not.toHaveProperty('duplicate_of_id');
  });

  it('arm 4 never carries duplicate_of_id — chairman_decisions has no such column', () => {
    const plan = planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'), { disposition: 'superseded' });
    expect(plan.verdict).toBe('retire');
    expect(plan.patch).not.toHaveProperty('duplicate_of_id');
  });
});

describe('FR-1 each arm targets its OWN table — a single-table retirement covers a third of the queue', () => {
  it('arm 4 writes chairman_decisions, arm 5 writes feedback', () => {
    expect(planRetirement({ id: 'd', decision_type: 'chairman_approval' }, withAuth('d')).table).toBe('chairman_decisions');
    expect(planRetirement({ id: 'd', decision_type: 'flag_review' }, withAuth('d')).table).toBe('feedback');
  });
});

describe('FR-2 arm 6 is GATED and says so — never a silent skip', () => {
  it('returns an explicit gated verdict naming why', () => {
    const plan = planRetirement({ id: 'flag-1', decision_type: 'flag_enablement' }, withAuth('flag-1'));
    expect(plan.verdict).toBe('gated');
    expect(plan.patch).toBe(null);
    expect(plan.reason).toMatch(/TIER-2|chairman-gated/);
  });

  it('applyRetirement will NOT write a gated plan', async () => {
    const plan = planRetirement({ id: 'flag-1', decision_type: 'flag_enablement' }, withAuth('flag-1'));
    const res = await applyRetirement({ from: () => { throw new Error('must not be called'); } }, plan);
    expect(res.wrote).toBe(false);
  });
});

describe('TR-9 idempotency and the terminal-status refusal', () => {
  // THE FAKE IS SCHEMA-AWARE ON PURPOSE. The previous fake accepted any patch object, which is why
  // it could not witness that `retirement_basis` is not a column on either table — every call would
  // have died with 42703 in production while the suite stayed green. A double that cannot REJECT is
  // not a double, it is an echo. These column sets are the real ones (feedback 65 cols /
  // chairman_decisions 36; only the fields under test are listed, plus the jsonb citation column).
  // duplicate_of_id is REAL (uuid, nullable) and load-bearing for the superseded path — omitting it
  // would make the fake reject a legitimate write with a spurious 42703, which is the mirror of the
  // defect this fake exists to catch. A double that is wrong in EITHER direction is not a double.
  const COLUMNS = {
    feedback: ['id', 'status', 'metadata', 'resolved_at', 'title', 'description', 'category', 'duplicate_of_id'],
    chairman_decisions: ['id', 'status', 'brief_data', 'decision', 'created_at']
  };

  // The builder is CHAINABLE AND THENABLE, exactly like PostgREST's: `.select(...).eq(...)` is
  // valid and the builder itself resolves when awaited. A fake whose select() returns a bare
  // promise cannot express `.select().eq()` at all — and one that is chainable but NOT thenable
  // silently yields undefined when awaited. Both shapes have already produced false greens here.
  function fake(table, rows, opts = {}) {
    const calls = [];
    const store = rows.map(r => ({ ...r }));
    return {
      calls,
      rows: store,
      from: (t) => {
        let sel = store.slice();
        let pending = null;
        let err = null;
        const exec = async () => {
          if (opts.readError && !pending) return { data: null, error: { message: opts.readError } };
          if (opts.writeError && pending) return { data: null, error: { message: opts.writeError } };
          if (err) return { data: null, error: err };
          if (pending) for (const r of sel) Object.assign(r, pending);
          return { data: sel, error: null };
        };
        const api = {
          update: (patch) => {
            for (const k of Object.keys(patch)) {
              if (!COLUMNS[t] || !COLUMNS[t].includes(k)) {
                // exactly what PostgREST returns for an unknown column
                err = { code: '42703', message: `column "${k}" of relation "${t}" does not exist` };
              }
            }
            pending = patch; calls.push({ table: t, patch });
            return api;
          },
          eq: (c, v) => { sel = sel.filter((r) => r[c] === v); return api; },
          neq: (c, v) => { sel = sel.filter((r) => r[c] !== v); return api; },
          in: (c, vs) => { sel = sel.filter((r) => vs.includes(r[c])); return api; },
          select: () => api,
          then: (resolve, reject) => exec().then(resolve, reject)
        };
        return api;
      }
    };
  }
  const a5 = () => planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'));
  const a4 = () => planRetirement({ id: 'dec-1', decision_type: 'chairman_approval' }, withAuth('dec-1'));

  it('arm 5 retirement WRITES even though feedback has no "pending" status', async () => {
    // "pending" is synthesised by the view, not stored. A fence on status='pending' would match
    // zero feedback rows and no-op silently while still reporting success.
    const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null }]);
    const res = await applyRetirement(db, a5());
    expect(res.wrote).toBe(true);
  });

  it('writes ONLY columns that exist — a phantom column would surface as 42703', async () => {
    const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null }]);
    const res = await applyRetirement(db, a5());
    expect(res.wrote).toBe(true);
    expect(res.error).toBeUndefined();
    for (const c of db.calls) for (const k of Object.keys(c.patch)) expect(COLUMNS.feedback).toContain(k);
  });

  it('the citation is MERGED into the jsonb column, not written over it', async () => {
    const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: { keep_me: 'existing', target_id: 'x' } }]);
    await applyRetirement(db, a5());
    expect(db.rows[0].metadata.keep_me).toBe('existing');   // pre-existing keys survive
    expect(db.rows[0].metadata.target_id).toBe('x');
    expect(db.rows[0].metadata.retirement_basis.decided_by).toBe('chairman-cli');
  });

  it('a null jsonb column is handled without throwing', async () => {
    const db = fake('chairman_decisions', [{ id: 'dec-1', status: 'pending', brief_data: null }]);
    const res = await applyRetirement(db, a4());
    expect(res.wrote).toBe(true);
    expect(db.rows[0].brief_data.retirement_basis).toBeTruthy();
  });

  it('a SECOND retire is a no-op, and SAYS SO — "already_retired", not a bare false', async () => {
    // "Already retired" must mean RETIRED — evidenced by the citation, not by the status alone.
    const db = fake('feedback', [{
      id: 'dec-1', status: FEEDBACK_STATUS.HELD,
      metadata: { retirement_basis: { cited_record: 'fb-dec-1', decided_by: 'chairman-cli' } }
    }]);
    const res = await applyRetirement(db, a5());
    expect(res.wrote).toBe(false);
    expect(res.reason).toBe('already_retired');
  });

  it('a HUMAN-parked backlog row is NOT "already retired" — the citation still gets written', async () => {
    // FEEDBACK_STATUS.HELD is 'backlog', which is ALSO an open/retirable status a triager sets by
    // hand. Inferring "already retired" from the status alone told the caller the retirement was
    // done while the basis was never recorded — defeating this SD's core rule that the basis travels
    // with the write. The citation column is already in hand from the read, so it is consulted.
    const db = fake('feedback', [{ id: 'dec-1', status: 'backlog', metadata: { triaged_by: 'a-human' } }]);
    const res = await applyRetirement(db, a5());
    expect(res.reason).toBe('citation_recorded_status_already_matched');
    expect(res.wrote).toBe(true);
    expect(db.rows[0].metadata.retirement_basis.decided_by).toBe('chairman-cli');
    expect(db.rows[0].metadata.triaged_by).toBe('a-human');   // pre-existing keys survive
    expect(db.rows[0].status).toBe('backlog');                // no status re-assertion
  });

  it('the citation branch does NOT outrank the terminal refusal', async () => {
    // Regression for a defect the W2 fix itself introduced. SUPERSEDED is 'duplicate', which is
    // TERMINAL (not in RETIRABLE_STATUSES.feedback). A row already at 'duplicate' was marked so by
    // someone else, so the status-collision branch would have stamped a chairman retirement_basis
    // onto it — an attribution for a retirement that never happened. HELD ('backlog') is different:
    // it IS retirable, which is the case the branch exists for.
    const db = fake('feedback', [{ id: 'dec-1', status: 'duplicate', metadata: { marked_by: 'a-human' }, duplicate_of_id: 'other' }]);
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'),
      { disposition: 'superseded', supersededBy: 'newer-1' });
    const res = await applyRetirement(db, plan);
    expect(res.reason).toBe('refused_terminal_status');
    expect(res.wrote).toBe(false);
    expect(db.rows[0].metadata).toEqual({ marked_by: 'a-human' });   // NOT stamped
  });

  it('REFUSES to merge into a jsonb column that is not a plain object', async () => {
    // typeof [] === 'object', so an array would have spread into {"0":…} and silently changed the
    // column's shape; a scalar would have fallen to {} and been discarded. Both destroy data the
    // read-first exists to preserve.
    for (const bad of [['a', 'b'], 'a-string', 42, true]) {
      const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: bad }]);
      const res = await applyRetirement(db, a5());
      expect(res.wrote, JSON.stringify(bad)).toBe(false);
      expect(res.reason, JSON.stringify(bad)).toBe('citation_column_not_mergeable');
      expect(db.rows[0].metadata, JSON.stringify(bad)).toEqual(bad);   // untouched
    }
  });

  it('REFUSES to overwrite a human-terminal feedback status', async () => {
    // MEASURED: 3 of the 6 live feedback deferral targets sit at status='resolved'. The old
    // .neq(status,target) fence matched them and would have overwritten a resolution.
    for (const status of ['resolved', 'wont_fix', 'duplicate', 'invalid']) {
      const db = fake('feedback', [{ id: 'dec-1', status, metadata: null }]);
      const res = await applyRetirement(db, a5());
      expect(res.wrote, status).toBe(false);
      expect(res.reason, status).toBe('refused_terminal_status');
      expect(db.rows[0].status, status).toBe(status);   // genuinely untouched
    }
  });

  it('REFUSES to erase a chairman approval — the worst case this fence exists for', async () => {
    // MEASURED: 3 of the 7 live chairman_decisions deferral targets sit at status='approved', and
    // chairman_decisions.status has NO CHECK constraint to stop an overwrite. Retiring one would
    // assert a disposition the chairman never made — the exact failure this SD removes.
    for (const status of ['approved', 'rejected', 'cancelled']) {
      const db = fake('chairman_decisions', [{ id: 'dec-1', status, brief_data: null }]);
      const res = await applyRetirement(db, a4());
      expect(res.wrote, status).toBe(false);
      expect(res.reason, status).toBe('refused_terminal_status');
      expect(db.rows[0].status, status).toBe(status);
    }
  });

  it('arm 4 retires only a PENDING decision', async () => {
    const db = fake('chairman_decisions', [{ id: 'dec-1', status: 'pending', brief_data: null }]);
    const res = await applyRetirement(db, a4());
    expect(res.wrote).toBe(true);
  });

  it('a missing row is reported as not_found, not as idempotency', async () => {
    const db = fake('feedback', []);
    const res = await applyRetirement(db, a5());
    expect(res.wrote).toBe(false);
    expect(res.reason).toBe('not_found');
  });

  it('R13: a DB ERROR is never indistinguishable from an idempotent no-op', async () => {
    // The surviving mutant: delete the error branch and a failed write reports {wrote:false} with
    // no error — identical to a correct no-op. Both the read and the write path are asserted.
    const readFail = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null }], { readError: 'boom-read' });
    const r1 = await applyRetirement(readFail, a5());
    expect(r1.wrote).toBe(false);
    expect(r1.reason).toBe('db_error');
    expect(r1.error).toMatch(/boom-read/);

    const writeFail = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null }], { writeError: 'boom-write' });
    const r2 = await applyRetirement(writeFail, a5());
    expect(r2.wrote).toBe(false);
    expect(r2.reason).toBe('db_error');
    expect(r2.error).toMatch(/boom-write/);
  });

  it('retirement does NOT write resolved_at — retirement is not resolution', async () => {
    const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null }]);
    await applyRetirement(db, a5());
    for (const c of db.calls) expect(Object.keys(c.patch)).not.toContain('resolved_at');
  });

  it('the citation column is DERIVED from the table, not taken from the plan', async () => {
    // DQR-SEC-09: `col` is string-interpolated into .select(), so reading it from a caller-supplied
    // plan would make that interpolation caller-controlled. A tampered plan must be ignored, not
    // trusted. Not reachable today — which is exactly why it needs a test rather than a comment.
    const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null }]);
    const tampered = { ...a5(), citationColumn: 'id, status, pg_sleep(10)' };
    const res = await applyRetirement(db, tampered);
    expect(res.wrote).toBe(true);
    expect(res.citationColumn).toBe('metadata');           // derived, not echoed
    expect(db.rows[0].metadata.retirement_basis).toBeTruthy();
  });

  it('the superseded APPLY path writes duplicate_of_id alongside the status', async () => {
    // Closes the loop on the CRITICAL: the plan carrying duplicate_of_id is only half of it — the
    // write must actually send it, or the CHECK still fires at runtime.
    const db = fake('feedback', [{ id: 'dec-1', status: 'new', metadata: null, duplicate_of_id: null }]);
    const plan = planRetirement({ id: 'dec-1', decision_type: 'flag_review' }, withAuth('dec-1'),
      { disposition: 'superseded', supersededBy: 'newer-1' });
    const res = await applyRetirement(db, plan);
    expect(res.wrote).toBe(true);
    expect(res.error).toBeUndefined();
    expect(db.rows[0].status).toBe(FEEDBACK_STATUS.SUPERSEDED);
    expect(db.rows[0].duplicate_of_id).toBe('newer-1');
    expect(db.rows[0].metadata.retirement_basis.disposition).toBe('superseded');
  });

  it('the retirable sets match the real per-arm vocabularies', () => {
    expect(RETIRABLE_STATUSES.chairman_decisions).toEqual(['pending']);
    expect(RETIRABLE_STATUSES.feedback).not.toContain('resolved');
    expect(RETIRABLE_STATUSES.feedback).toContain('backlog');
  });
});
