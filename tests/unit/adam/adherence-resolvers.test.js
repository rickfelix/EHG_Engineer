/**
 * Adam self-adherence RESOLVER + "actually catches drift" regression tests.
 * SD-LEO-INFRA-ADAM-SELF-AUDIT-RESOLVERS-001 — FR-5 (+ resolver coverage for FR-1b/2/3/4).
 *
 * These exercise the REAL resolveFacts() / runSelfAdherenceReview() over a MOCKED supabase
 * (zero live DB, zero real feedback rows). The probes (lib/adam/adherence-probes.js) are
 * imported AS-IS and never modified — the test asserts the resolver layer feeds them honest
 * facts and that the full audit detects a seeded drift condition while leaving genuinely
 * unmeasurable facts as 'unknown'.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveFacts,
  runSelfAdherenceReview,
  sourceRemediation,
  recordVisionGaugeRead,
} from '../../../scripts/adam-self-adherence-review.mjs';
import { runAdherenceProbes, hasDrift } from '../../../lib/adam/adherence-probes.js';

/**
 * Build a chainable supabase mock. `spec` maps table name -> a handler that returns the
 * terminal result the resolvers await ({ count, data, error }) or, for insert chains, the
 * single-row result. The builder is a thenable so `await builder` resolves to the result; it
 * also supports `.select().single()` for insert flows. Every chained filter is a no-op that
 * records nothing (the resolvers' correctness, not the query strings, is under test — the
 * live PostgREST queries were separately verified to run).
 */
function makeSupabase(spec) {
  const calls = { feedbackInsert: [], auditInsert: [], ledgerInsert: [] };
  function from(table) {
    const handler = spec[table];
    const result = typeof handler === 'function' ? handler() : (handler ?? { count: 0, data: [], error: null });
    const builder = {
      // read-chain no-ops (return `this` so any order/combination chains)
      select() { return builder; },
      gte() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      not() { return builder; },
      // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: the sourcedInWindow QF lane switched from a
      // head-count to `.select('id, title').limit(1000)` so it can filter fixture-titled QFs.
      limit() { return builder; },
      // FR-6 batch 9 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): several read lanes above
      // now paginate via fetchAllPaginated, which calls .order() (chainable) then .range() —
      // range() is the new TERMINAL call for those lanes, resolving the same result .then() did.
      order() { return builder; },
      range() { return Promise.resolve(result); },
      // insert flows: capture the row, then allow .select().single()
      insert(row) {
        if (table === 'feedback') calls.feedbackInsert.push(row);
        if (table === 'audit_log') calls.auditInsert.push(row);
        if (table === 'adam_adherence_ledger') calls.ledgerInsert.push(row);
        const insertResult = (typeof handler === 'function' ? handler() : handler) || {};
        const single = async () => ({ data: insertResult.data ?? { id: insertResult.id ?? 'mock-id' }, error: insertResult.error ?? null });
        return { select() { return { single, maybeSingle: single }; }, single, maybeSingle: single };
      },
      // terminal: head/count read resolves the builder itself
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return builder;
  }
  return { from, _calls: calls };
}

const COUNT = (n) => () => ({ count: n, data: null, error: null });
const ERR = (msg) => () => ({ count: null, data: null, error: new Error(msg) });
const ROWS = (rows) => () => ({ count: null, data: rows, error: null });

describe('resolveFacts (FR-1b/2/3/4) — measured vs honestly-unknown', () => {
  it('reliable sources -> all facts are finite/real; propose_only MEASURED via role-claim census', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(4), // FR-P3 signals: 4 Adam signals (head-count)
      strategic_directives_v2: COUNT(2), // FR-1b sourced
      issue_patterns: ROWS([{ trend: 'stable' }, { trend: 'decreasing' }]), // FR-2: 1 live-recurring (stable), decreasing excluded
      claude_sessions: COUNT(0), // FR-1 propose_only: 0 adam-role sessions hold a build-claim
      audit_log: COUNT(1), // FR-4 vision read present (Adam-authored)
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.sourcedInWindow).toBe(2); // FR-1b measured
    expect(facts.signalsInWindow).toBe(4); // FR-P3 measured
    expect(facts.recurrencesInWindow).toBe(1); // FR-2 measured (stable counts, decreasing excluded)
    expect(facts.visionGaugeReadInWindow).toBe(true); // FR-4 measured (>=1 Adam marker)
    // FR-1: propose_only is now MEASURED via the COUNTERFACTUAL-PRESENCE signal (claude_sessions
    // metadata.role='adam' holding a non-null sd_key). A real 0 is a real PASS (Adam stayed
    // propose-only) — no longer honestly-unmeasurable, no longer unknown-forever.
    expect(facts.adamAuthoredBuildsInWindow).toBe(0);
  });

  it('FR-1b: a real 0 sourced stays 0 (NOT unknown) — cadence stall is measurable', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: COUNT(0),
      issue_patterns: ROWS([]),
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.sourcedInWindow).toBe(0); // real 0, not null
  });

  it('FR-1b: a query ERROR leaves sourcedInWindow null -> unknown (honesty)', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: ERR('db down'),
      issue_patterns: ROWS([]),
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.sourcedInWindow).toBeNull();
  });

  it('QF-20260703-537: zero Adam-sourced SDs but 5 quick_fixes in-window -> sourcedInWindow=5, no false FAIL', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: COUNT(0), // no SD drafts this window
      // SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001: the QF lane now fetches rows (id+title) and
      // counts non-fixture ones, so seed 5 REAL-titled QFs (not a head-count). A fixture-
      // titled row here would be correctly excluded — proven separately in the exclusion suite.
      quick_fixes: ROWS([
        { id: 'QF-1', title: 'real fix one' }, { id: 'QF-2', title: 'real fix two' },
        { id: 'QF-3', title: 'real fix three' }, { id: 'QF-4', title: 'real fix four' },
        { id: 'QF-5', title: 'real fix five' },
      ]), // 5 QFs filed in-window — the previously-blind lane
      issue_patterns: ROWS([]),
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.sourcedInWindow).toBe(5); // unified across both lanes, not just SDs
  });

  it('QF-20260703-537: an error on the quick_fixes query alone also leaves sourcedInWindow null (never silently falls back to SD-only count)', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: COUNT(3), // this lane resolved fine
      quick_fixes: ERR('db down'),
      issue_patterns: ROWS([]),
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.sourcedInWindow).toBeNull();
  });

  it('FR-1 propose_only: signal is the adam-ROLE claim census, NOT sub_agent_execution_results lineage', async () => {
    // The counterfactual-presence signal keys on claude_sessions metadata.role='adam' holding an
    // sd_key (Adam in the build lane). sub_agent_execution_results is NOT consulted — mixed-role
    // lineage would fabricate a FAIL, so even a large build fleet must NOT bleed into the fact.
    const sb = makeSupabase({
      session_coordination: COUNT(2),
      strategic_directives_v2: COUNT(1),
      issue_patterns: ROWS([]),
      sub_agent_execution_results: COUNT(99), // MUST NOT be consulted
      claude_sessions: COUNT(3), // 3 adam-role sessions hold a build-claim -> a real violation
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.adamAuthoredBuildsInWindow).toBe(3); // measured from the role-claim census
    // 3 > 0 => a real CONST-002 propose-only violation (falsifiable FAIL, never fabricated).
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'propose_only').verdict).toBe('fail');
  });

  it('FR-1 propose_only: a claude_sessions query ERROR leaves the fact null -> unknown (honesty preserved)', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: COUNT(1),
      issue_patterns: ROWS([]),
      claude_sessions: ERR('db down'),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.adamAuthoredBuildsInWindow).toBeNull(); // query error -> unknown, never fabricated
  });

  it('FR-2: case-insensitive + widened allow-set (stable/increasing/persistent/recurring/new); wound-down trends excluded', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: COUNT(0),
      // 5 live-recurring (incl. an uppercase STABLE) + 3 wound-down that must be excluded.
      issue_patterns: ROWS([
        { trend: 'stable' }, { trend: 'increasing' }, { trend: 'persistent' },
        { trend: 'recurring' }, { trend: 'STABLE' },
        { trend: 'decreasing' }, { trend: 'resolved' }, { trend: 'improving' },
      ]),
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.recurrencesInWindow).toBe(5); // 4 distinct live trends + the uppercase STABLE
  });

  it('FR-2: a query ERROR leaves recurrencesInWindow null -> unknown (honesty)', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(0),
      strategic_directives_v2: COUNT(0),
      issue_patterns: ERR('db down'),
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(0),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.recurrencesInWindow).toBeNull();
  });

  it('FR-1 vision: a SUCCESSFUL 0-marker window -> visionGaugeReadInWindow=false (FAIL, not unknown-forever)', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(1),
      strategic_directives_v2: COUNT(1),
      issue_patterns: ROWS([]),
      audit_log: COUNT(0), // no Adam vision-read marker in the window (a MEASURED absence)
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    // Post-FR-1: a measured absence of the durable read-marker is a falsifiable FAIL, not an
    // unknown-forever gauge. ("An unknown-forever probe is worse than none.")
    expect(facts.visionGaugeReadInWindow).toBe(false);
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'vision_monitoring').verdict).toBe('fail');
  });

  it('FR-1 vision: a query ERROR still leaves visionGaugeReadInWindow null -> unknown (honesty boundary preserved)', async () => {
    const sb = makeSupabase({
      session_coordination: COUNT(1),
      strategic_directives_v2: COUNT(1),
      issue_patterns: ROWS([]),
      audit_log: ERR('db down'), // infra fault != measured absence
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.visionGaugeReadInWindow).toBeNull();
  });
});

describe('FR-5: the audit ACTUALLY CATCHES drift', () => {
  it('seeded SOURCING drift (zero sourcing) -> sourcing_cadence FAIL + a sourced adam_adherence_drift feedback row', async () => {
    // Seed: 0 sourced in window (cadence stalled), everything else clean/measurable. This is the
    // canonical "actually catches drift" proof now that propose_only is honestly 'unknown' — a
    // MEASURABLE FAIL (sourcing) drives drift detection + the propose-only remediation.
    const sb = makeSupabase({
      session_coordination: COUNT(2), // signals present
      strategic_directives_v2: COUNT(0), // <-- DRIFT: zero Adam sourcing
      issue_patterns: ROWS([]), // no recurrences -> friction pass
      sub_agent_execution_results: COUNT(0), // FR-3 not consulted (propose_only stays unknown)
      audit_log: COUNT(1), // vision read present
      feedback: () => ({ id: 'fb-remediation-1' }), // sourceRemediation insert
      adam_adherence_ledger: () => ({ id: 'ledger-1' }), // recordAdherence insert
    });
    const res = await runSelfAdherenceReview(sb, { windowDays: 1, runId: 'run-drift' });

    // The sourcing_cadence probe must read FAIL off the real measured 0.
    const sourcing = res.bars.find((b) => b.probe === 'sourcing_cadence');
    expect(sourcing.verdict).toBe('fail');
    expect(hasDrift(res.bars)).toBe(true);

    // propose_only now MEASURES the adam-role claim census; the mock seeds 0 (default) -> PASS.
    const proposeOnly = res.bars.find((b) => b.probe === 'propose_only');
    expect(proposeOnly.verdict).toBe('pass');

    // A propose-only remediation feedback row was sourced with the canonical category.
    expect(res.remediationRef).toBe('fb-remediation-1');
    expect(sb._calls.feedbackInsert).toHaveLength(1);
    expect(sb._calls.feedbackInsert[0].category).toBe('adam_adherence_drift');
    expect(sb._calls.feedbackInsert[0].type).toBe('issue');
  });

  it('seeded FRICTION drift (recurrences but 0 signals) -> friction_signaling FAIL + remediation sourced', async () => {
    // A second MEASURABLE drift dimension: live recurrences exist but Adam sent no signals.
    const sb = makeSupabase({
      session_coordination: COUNT(0), // <-- 0 signals
      strategic_directives_v2: COUNT(2), // sourcing fine
      issue_patterns: ROWS([{ trend: 'increasing' }, { trend: 'persistent' }]), // <-- 2 live recurrences
      sub_agent_execution_results: COUNT(0),
      audit_log: COUNT(1),
      feedback: () => ({ id: 'fb-friction' }),
      adam_adherence_ledger: () => ({ id: 'ledger-2' }),
    });
    const res = await runSelfAdherenceReview(sb, { windowDays: 1, runId: 'run-friction' });
    const friction = res.bars.find((b) => b.probe === 'friction_signaling');
    expect(friction.verdict).toBe('fail'); // recurrences but no signals
    expect(hasDrift(res.bars)).toBe(true);
    expect(res.remediationRef).toBe('fb-friction');
    expect(sb._calls.feedbackInsert[0].category).toBe('adam_adherence_drift');
  });

  it('HONESTY: a genuinely-unresolved fact (query error) yields unknown and does NOT, alone, trigger remediation', async () => {
    // All MEASURED dims clean; friction is honestly 'unknown' because its recurrence SOURCE errored
    // (a real infra fault, not a measured absence). An 'unknown' is neither pass nor fail -> hasDrift
    // stays false -> no remediation. (Post-FR-1, vision-absence and propose-presence are MEASURED, so
    // the honest 'could-not-measure' path is now a query ERROR — the only remaining unknown source.)
    const sb = makeSupabase({
      session_coordination: COUNT(1), // signals present
      strategic_directives_v2: COUNT(3), // sourcing pass
      issue_patterns: ERR('db down'), // <-- recurrence source ERROR -> friction unknown
      claude_sessions: COUNT(0), // propose_only measured 0 -> pass
      audit_log: COUNT(1), // vision read present -> pass
      feedback: () => ({ id: 'fb-should-not-be-written' }),
      adam_adherence_ledger: () => ({ id: 'ledger-3' }),
    });
    const res = await runSelfAdherenceReview(sb, { windowDays: 1, runId: 'run-unknown' });
    const friction = res.bars.find((b) => b.probe === 'friction_signaling');
    expect(friction.verdict).toBe('unknown'); // query error -> honest unknown, never coerced to fail
    const proposeOnly = res.bars.find((b) => b.probe === 'propose_only');
    expect(proposeOnly.verdict).toBe('pass'); // measured 0 build-claims
    expect(hasDrift(res.bars)).toBe(false); // an unknown alone is NOT drift (no probe FAILED)
    expect(res.remediationRef).toBeNull(); // no remediation sourced
    expect(sb._calls.feedbackInsert).toHaveLength(0); // NO real/feedback row written for an unknown
  });
});

describe('FR-1: belt_starvation + dispatch_boundary resolve from LIVE claim tables (297/297-unknown class extinct)', () => {
  const nowIso = () => new Date().toISOString();

  it('belt_starvation: healthy belt (unclaimed claimable SD + idle worker + backlog) => PASS', async () => {
    const sb = makeSupabase({
      strategic_directives_v2: ROWS([
        { sd_key: 'SD-A', sd_type: 'implementation', status: 'active', dependencies: [], claiming_session_id: null }, // unclaimed + claimable
        { sd_key: 'SD-B', sd_type: 'implementation', status: 'active', dependencies: [], claiming_session_id: 'sess-1' }, // claimed
      ]),
      claude_sessions: ROWS([
        { session_id: 'sess-2', metadata: { role: 'worker' }, sd_key: null, status: 'active', heartbeat_at: nowIso() }, // idle worker
      ]),
      feedback: ROWS([{ id: 'fb1', status: 'open', title: 'real backlog item', metadata: {} }]),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.claimableBelt).toBe(1); // SD-A only (SD-B is claimed)
    expect(facts.idleWorkers).toBe(1); // sess-2 holds no claim
    expect(facts.sourceableBacklogCount).toBe(1);
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'belt_starvation').verdict).toBe('pass');
  });

  it('belt_starvation: belt=0 while a worker is idle and backlog exists => FAIL (real drift, not unknown)', async () => {
    const sb = makeSupabase({
      strategic_directives_v2: ROWS([
        { sd_key: 'SD-C', sd_type: 'implementation', status: 'active', dependencies: [], claiming_session_id: 'sess-9' }, // all claimed
      ]),
      claude_sessions: ROWS([
        { session_id: 'sess-idle', metadata: { role: 'worker' }, sd_key: null, status: 'idle', heartbeat_at: nowIso() },
      ]),
      feedback: ROWS([{ id: 'fb', status: 'open', title: 'genuine sourceable work', metadata: {} }]),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.claimableBelt).toBe(0);
    expect(facts.idleWorkers).toBe(1);
    expect(facts.sourceableBacklogCount).toBe(1);
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'belt_starvation').verdict).toBe('fail');
  });

  it('belt_starvation: a claim-census query ERROR leaves the facts null -> unknown (honesty)', async () => {
    const sb = makeSupabase({
      strategic_directives_v2: ERR('db down'),
      claude_sessions: ERR('db down'),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(facts.claimableBelt).toBeNull();
    expect(facts.idleWorkers).toBeNull();
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'belt_starvation').verdict).toBe('unknown');
  });

  it('dispatch_boundary: an advisory carrying fleet-dispatch language => FAIL', async () => {
    const sb = makeSupabase({
      session_coordination: ROWS([
        { payload: { kind: 'adam_advisory', body: 'Status: sourcing looks healthy.' }, created_at: 't1' },
        { payload: { kind: 'adam_advisory', body: 'We should spin up a worker to cover the gap.' }, created_at: 't2' },
      ]),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(typeof facts.advisoryBody).toBe('string');
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'dispatch_boundary').verdict).toBe('fail');
  });

  it('dispatch_boundary: a clean advisory corpus => PASS (resolved, not unknown)', async () => {
    const sb = makeSupabase({
      session_coordination: ROWS([
        { payload: { kind: 'adam_advisory', body: 'Recommend we defer SD-X; belt is healthy.' }, created_at: 't1' },
      ]),
    });
    const facts = await resolveFacts(sb, { windowDays: 1 });
    expect(runAdherenceProbes(facts).find((b) => b.probe === 'dispatch_boundary').verdict).toBe('pass');
  });
});

describe('recordVisionGaugeRead (FR-4 durable marker) — fail-soft', () => {
  it('writes an audit_log vision_gauge_read row and returns its id', async () => {
    const sb = makeSupabase({ audit_log: () => ({ id: 'audit-1' }) });
    const id = await recordVisionGaugeRead(sb, { sessionId: 'adam-sess', pct: 42 });
    expect(id).toBe('audit-1');
    expect(sb._calls.auditInsert).toHaveLength(1);
    expect(sb._calls.auditInsert[0].event_type).toBe('vision_gauge_read');
    expect(sb._calls.auditInsert[0].metadata.session_id).toBe('adam-sess');
  });

  it('a write error returns null and never throws (fail-soft, never blocks the email)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sb = makeSupabase({ audit_log: () => ({ error: new Error('insert blocked') }) });
    const id = await recordVisionGaugeRead(sb, { sessionId: 'adam-sess', pct: 42 });
    expect(id).toBeNull();
    warn.mockRestore();
  });
});
