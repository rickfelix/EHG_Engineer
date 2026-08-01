/**
 * Gauge-emission dedup at the routeFinding chokepoint.
 * SD-FDBK-INFRA-LESSONS-CONVERSION-WIRING-001 (scope-gate piece; FR-1/FR-2 held by ruling).
 *
 * WHAT THIS GUARDS. routeFinding's insert was unconditional and 12 of 13 emitting detectors never
 * opted into skipRoute, producing 5,374 rows for ~13 conditions at 0% disposition. The dedup is now
 * default-on at the chokepoint.
 *
 * THE DANGEROUS HALF, AND WHY HALF THIS FILE IS ABOUT OBSERVABILITY RATHER THAN DEDUP.
 * Nothing in this repo ever CLEARS a gauge finding — all 5,374 rows are status='new'. So once every
 * tripping gauge holds an open row, this runner stops inserting FOREVER. plan-drift-mix, the one
 * detector that already opted in, has exactly ONE row ever: tripped once, silently muted since.
 * A quiet run and a broken run then look identical. The routing tally is the only thing that tells
 * them apart, which is why 'suppressed' is asserted as a positive signal and not merely as "no row".
 */

import { describe, it, expect, vi } from 'vitest';
import { routeFinding, buildFindingRow, DEDUP_LOOKUP_TIMEOUT_MS } from '../../../scripts/gauge-runner.mjs';
import { OPEN_FINDING_STATUSES, hasOpenFinding } from '../../../lib/governance/plan-drift-detectors.js';

const ENTRY = { id: 'test-gauge', name: 'Test Gauge', ownerRole: 'coordinator', remediation: 'do the thing' };

/** Resolve a postgrest `metadata->>key` selector against a plain fixture row. */
function matchJsonPath(row, selector) {
  const [col, key] = selector.split('->>');
  const v = row[col];
  return v && typeof v === 'object' ? v[key] : undefined;
}

/**
 * Minimal supabase double. Records what was asked for so the assertions can check the SHAPE of the
 * query, not just its outcome — a dedup that returns the right verdict off the wrong query is the
 * defect this SD is about.
 */
/**
 * DB DEFAULTS THE RUNNER NEVER SETS. buildFindingRow omits these three columns entirely, so every
 * row it writes takes the column default. Verified live against information_schema.columns:
 *   feedback_type  NOT NULL DEFAULT 'sentry_error'   (0 of 15,394 rows are NULL — they cannot be)
 *   archived_at    NULL     DEFAULT null
 *   occurrence_count                                  (seeded on insert by the runner)
 * Mirrored rather than imported ON PURPOSE: this is the schema's half of the contract, and a test
 * that reads the same source as the code under test cannot catch the code disagreeing with the DB.
 */
const DB_DEFAULTS = { feedback_type: 'sentry_error', archived_at: null };

/** The row this runner actually writes, as the database would hold it. */
export function realGaugeRow(overrides = {}) {
  return { id: 'row-1', occurrence_count: 1, ...buildFindingRow(ENTRY, { count: 1 }), ...DB_DEFAULTS, ...overrides };
}

function makeSupabase({ openRow = null, selectError = null, updateError = null, insertError = null, selectDelayMs = 0 } = {}) {
  const calls = { selects: [], updates: [], inserts: [], statusFilter: null, isFilters: [], order: null };
  // FILTERS ARE APPLIED, NOT MERELY RECORDED — and this is the whole point of the rewrite.
  // The previous double recorded every predicate and then returned `openRow` regardless. So when
  // findOpenFinding asked `.is('feedback_type', null)` — a predicate NO row can satisfy, because
  // the column is NOT NULL DEFAULT 'sentry_error' — the double answered "found it" and 162 tests
  // went green over a dedup that could never fire once. Worse, the assertion I wrote to PROVE the
  // fix was `expect(isFilters).toContainEqual({col:'feedback_type', val:null})`: the test pinned
  // the fatal predicate AS the acceptance criterion. Recording a filter is not applying it.
  // Now the fixture row carries real column semantics and the predicates run against it, so a
  // filter that cannot match what the runner writes fails HERE instead of shipping silently.
  const preds = [];
  const matches = (row) => preds.every((p) => p(row));
  return {
    calls,
    from() {
      const q = {
        _isSelect: false,
        select(cols) { q._isSelect = true; calls.selects.push(cols); return q; },
        eq(col, val) {
          if (col === 'id') { calls.updates.at(-1).id = val; return q; }
          calls.selects.push(`${col}=${val}`);
          preds.push((row) => row[col] === val || (col.includes('->>') && matchJsonPath(row, col) === val));
          return q;
        },
        in(col, vals) { calls.statusFilter = { col, vals }; preds.push((row) => vals.includes(row[col])); return q; },
        is(col, val) { calls.isFilters.push({ col, val }); preds.push((row) => (row[col] ?? null) === val); return q; },
        order(col, opts) { calls.order = { col, ...opts }; return q; },
        async limit() {
          if (selectDelayMs) await new Promise((r) => setTimeout(r, selectDelayMs));
          if (selectError) return { data: null, error: { message: selectError } };
          return { data: openRow && matches(openRow) ? [openRow] : [], error: null };
        },
        update(payload) { calls.updates.push({ payload }); return q; },
        async insert(row) { calls.inserts.push(row); return { error: insertError ? { message: insertError } : null }; },
      };
      // The UPDATE is its OWN builder, not the select's. It was a one-shot `{ eq: async () => … }`,
      // which broke the moment the UPDATE re-asserted category and open-status alongside the id.
      // It now takes any number of filters, RECORDS each one, and resolves as a thenable the way
      // postgrest-js does — so `await …update().eq().eq().in()` works and the filters are assertable.
      const origUpdate = q.update;
      q.update = (payload) => {
        origUpdate(payload);
        const upreds = [];
        const u = {
          eq(col, val) {
            if (col === 'id') { calls.updates.at(-1).id = val; return u; }
            calls.updates.at(-1)[col] = val;
            upreds.push((row) => row[col] === val);
            return u;
          },
          in(col, vals) { calls.updates.at(-1)[col] = vals; upreds.push((row) => vals.includes(row[col])); return u; },
          is(col, val) { calls.updates.at(-1)[col] = val; upreds.push((row) => (row[col] ?? null) === val); return u; },
          // .select() makes the UPDATE return its matched rows. The double applies the same
          // predicates to the fixture, so an update whose filters exclude the row it is stamping
          // resolves to [] here exactly as postgrest would — which is what turns a silent
          // zero-row 'suppressed' into a visible error.
          select() {
            const matched = openRow && upreds.every((p) => p(openRow)) ? [{ id: openRow.id }] : [];
            return Promise.resolve({ data: updateError ? null : matched, error: updateError ? { message: updateError } : null });
          },
          then(resolve, reject) { return Promise.resolve({ error: updateError ? { message: updateError } : null }).then(resolve, reject); },
        };
        return u;
      };
      return q;
    },
  };
}

describe('THE LOOKUP MUST MATCH A ROW THE RUNNER ACTUALLY WROTE', () => {
  // THE REGRESSION THAT ALMOST SHIPPED. findOpenFinding first filtered .is("feedback_type", null),
  // reasoning from an RLS policy that mentions the column instead of from the column, which is NOT
  // NULL DEFAULT 'sentry_error'. Every predicate was individually defensible; their CONJUNCTION
  // could not match a single one of the 15,394 live rows, so the dedup was inert AND hasOpenFinding
  // — the one function the PR promised not to change the value of — regressed to always-false,
  // defeating plan-drift-mix's FR-5 re-surface-once dedup and re-firing its FR-6 dual-recipient
  // push every hour. Two reviewers found it against the live DB; 162 green tests did not.

  it('finds a row built by THIS runner and stored with the DB defaults it never sets', async () => {
    // The fixture is buildFindingRow() output plus the real column defaults. If any filter in the
    // lookup cannot be satisfied by the row the runner itself writes, this fails — which is the
    // whole class of defect, not just the feedback_type instance.
    const sb = makeSupabase({ openRow: realGaugeRow() });
    expect(await routeFinding(sb, ENTRY, { count: 1 })).toBe('suppressed');
    expect(sb.calls.inserts).toEqual([]);
  });

  it('hasOpenFinding still sees an existing open row — value preserved, not just type', async () => {
    // hasOpenFinding was re-expressed as a coercion of findOpenFinding and silently inherited three
    // new filters. Its type was preserved and its VALUE was not. Its sole production caller feeds
    // it straight into skipRoute, so always-false is a live behaviour change, invisible to a test
    // that only checks it returns a boolean.
    const sb = makeSupabase({ openRow: realGaugeRow({ metadata: { gauge_id: 'plan-drift-mix' } }) });
    expect(await hasOpenFinding(sb, 'plan-drift-mix')).toBe(true);
  });

  it('a row planted through an anon INSERT policy CANNOT mute a gauge', async () => {
    // The reason the filters exist at all. Verified live in pg_policies: anon holds exactly two
    // INSERT paths and every other feedback INSERT policy is service_role.
    const telegram = makeSupabase({ openRow: realGaugeRow({ source_type: 'telegram' }) });
    expect(await routeFinding(telegram, ENTRY, { count: 1 })).toBe('inserted');
    const venture = makeSupabase({ openRow: realGaugeRow({ feedback_type: 'user_bug' }) });
    expect(await routeFinding(venture, ENTRY, { count: 1 })).toBe('inserted');
  });

  it('an UPDATE that matches zero rows is an ERROR, never a silent suppressed', async () => {
    // A row triaged or archived out of scope between lookup and stamp. supabase-js returns
    // {error:null} for an UPDATE that touched nothing, so without the .select() this trip would be
    // dropped AND counted as healthy dedup on the tally that exists to detect silence.
    const sb = makeSupabase({ openRow: realGaugeRow() });
    const origFrom = sb.from.bind(sb);
    sb.from = () => { const q = origFrom(); const origUpdate = q.update;
      q.update = (payload) => { const u = origUpdate(payload); const origSelect = u.select;
        u.select = () => { void origSelect; return Promise.resolve({ data: [], error: null }); }; return u; }; return q; };
    expect(await routeFinding(sb, ENTRY, { count: 1 })).toBe('error');
  });
});

describe('routeFinding: re-emission is stamped, not re-inserted', () => {
  it('SUPPRESSES a re-emission and stamps last_seen + occurrence_count on the existing row', async () => {
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 7 }) });
    const verdict = await routeFinding(sb, ENTRY, { count: 1 });
    expect(verdict).toBe('suppressed');
    expect(sb.calls.inserts).toEqual([]);           // the whole point: no new row
    expect(sb.calls.updates).toHaveLength(1);
    expect(sb.calls.updates[0].payload.occurrence_count).toBe(8);
    expect(sb.calls.updates[0].payload.last_seen).toEqual(expect.any(String));
    // THE UPDATE RE-ASSERTS ITS OWN SCOPE. The lookup already proved category and open-status, but
    // the named anti-precedent in this very PR (gh-failure-monitor, live-bumping a RESOLVED row to
    // occurrence_count 586) is precisely a correct-looking UPDATE fed by a lookup that lost a
    // predicate. Split across two files, that invariant is one careless edit from gone.
    expect(sb.calls.updates[0].category).toBe('invariant_gauge_finding');
    expect(sb.calls.updates[0].status).toEqual(OPEN_FINDING_STATUSES);
  });

  it('INSERTS a first emission and stamps BOTH first_seen and last_seen', async () => {
    // Regression: all 5,374 existing gauge rows have first_seen AND last_seen NULL. If the insert
    // path does not seed them, the dedup branch has nothing to advance and "freshness retained"
    // is half-built. My original spec claimed these were already populated — that figure was the
    // ci_failure population, measured on the wrong set.
    const sb = makeSupabase({ openRow: null });
    const verdict = await routeFinding(sb, ENTRY, { count: 1 });
    expect(verdict).toBe('inserted');
    expect(sb.calls.updates).toEqual([]);
    expect(sb.calls.inserts).toHaveLength(1);
    expect(sb.calls.inserts[0].first_seen).toEqual(expect.any(String));
    expect(sb.calls.inserts[0].last_seen).toEqual(expect.any(String));
    expect(sb.calls.inserts[0].category).toBe('invariant_gauge_finding');
  });

  it('treats occurrence_count NULL as 1 rather than producing NaN', async () => {
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: null }) });
    await routeFinding(sb, ENTRY, { count: 1 });
    expect(sb.calls.updates[0].payload.occurrence_count).toBe(2);
  });
});

describe('the dedup must not destroy recurrence information', () => {
  it('the open-status set does NOT treat backlog as cleared', () => {
    // TRIP-CLEAR-TRIP depends entirely on this set. If `backlog` counted as cleared, a triaged
    // finding would start re-inserting; if `resolved` counted as open, a genuine re-trip would be
    // suppressed forever. The set IS the contract, so it is asserted directly.
    expect(OPEN_FINDING_STATUSES).toContain('new');
    expect(OPEN_FINDING_STATUSES).toContain('backlog');
    expect(OPEN_FINDING_STATUSES).toContain('in_progress');
    expect(OPEN_FINDING_STATUSES).not.toContain('resolved');
    expect(OPEN_FINDING_STATUSES).not.toContain('wont_fix');
  });

  it('is checked against the FULL live status domain, so an omission cannot hide', () => {
    // The assertions above are not.toContain checks, which BY CONSTRUCTION cannot catch a MISSING
    // open status. That is exactly how 'triaged' was dropped from the first version while the suite
    // stayed green: the live feedback_status_check domain contains it, and omitting it would have
    // re-armed hourly amplification the moment anyone started triaging the 5,382-row backlog --
    // i.e. on first contact with the intended use. Partition the WHOLE domain instead.
    const LIVE_STATUS_DOMAIN = ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate', 'invalid', 'backlog', 'shipped'];
    const CLOSED = ['resolved', 'wont_fix', 'duplicate', 'invalid', 'shipped'];
    const open = LIVE_STATUS_DOMAIN.filter((s) => !CLOSED.includes(s));
    expect([...OPEN_FINDING_STATUSES].sort()).toEqual([...open].sort());
  });

  it('PREDICATE ONLY — trip, CLEAR, trip yields a second row', async () => {
    // LABELLED PREDICATE, DELIBERATELY. Nothing in production clears a gauge finding today: all
    // 5,374 rows are status='new', every automated closer is scoped to other categories, and the
    // purpose-built drain writes to a table with zero rows ever written. So this pins the
    // PREDICATE, not an observable production behaviour, and calling it an end-to-end guarantee
    // would be the overclaim this SD family keeps producing.
    // The clear is modelled as wont_fix because chk_resolved_requires_reference demands
    // resolution_notes or an FK for 'resolved' — a naive clear violates a constraint a double
    // cannot see.
    const open = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 1 }) });
    expect(await routeFinding(open, ENTRY, { count: 1 })).toBe('suppressed');

    const cleared = makeSupabase({ openRow: null });   // wont_fix -> no longer in OPEN_FINDING_STATUSES
    expect(await routeFinding(cleared, ENTRY, { count: 1 })).toBe('inserted');
    expect(cleared.calls.inserts).toHaveLength(1);
  });
});

describe('fail direction: toward a duplicate row, never toward silence', () => {
  it('INSERTS when the dedup lookup ERRORS', async () => {
    const sb = makeSupabase({ selectError: 'connection reset' });
    const verdict = await routeFinding(sb, ENTRY, { count: 1 });
    expect(verdict).toBe('inserted');
    expect(sb.calls.inserts).toHaveLength(1);
  });

  it('INSERTS when the dedup lookup TIMES OUT rather than hanging the pass', async () => {
    // A hanging (not erroring) lookup across 22 gauges could exhaust the workflow budget and kill
    // a pass mid-flight, which reads as a fleet-down alarm — a dedup change causing a false outage.
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 1 }), selectDelayMs: DEDUP_LOOKUP_TIMEOUT_MS + 200 });
    const verdict = await routeFinding(sb, ENTRY, { count: 1 });
    expect(verdict).toBe('inserted');
  }, DEDUP_LOOKUP_TIMEOUT_MS + 3000);

  it('reports error (not silent success) when the stamp itself fails', async () => {
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 1 }), updateError: 'permission denied' });
    expect(await routeFinding(sb, ENTRY, { count: 1 })).toBe('error');
  });

  it('reports error when the insert fails', async () => {
    const sb = makeSupabase({ openRow: null, insertError: 'constraint violation' });
    expect(await routeFinding(sb, ENTRY, { count: 1 })).toBe('error');
  });
});

describe('OBSERVABILITY: zero-inserted must mean tolerated, never unparsed', () => {
  it('a suppressed re-emission is reported as SUPPRESSED, not as nothing-happened', async () => {
    // This is the acceptance criterion the coordinator ruled IS the gate. Once nothing clears and
    // every gauge holds an open row, `inserted` is permanently 0 — so a run that suppressed 13
    // re-emissions and a run where every gauge silently broke both insert nothing. Only a distinct
    // 'suppressed' verdict separates them.
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 3 }) });
    const verdict = await routeFinding(sb, ENTRY, { count: 1 });
    expect(verdict).toBe('suppressed');
    expect(verdict).not.toBe('skipped');   // skipRoute is a DIFFERENT reason for silence
  });

  it('detector self-suppression stays distinguishable from dedup suppression', async () => {
    // skipRoute also covers the starved short-circuit, which is not a re-emission at all. Folding
    // the two into one verdict would conflate "already reported" with "not a real finding".
    const sb = makeSupabase({ openRow: null });
    expect(await routeFinding(sb, ENTRY, { count: 1, skipRoute: true })).toBe('skipped');
    expect(sb.calls.inserts).toEqual([]);
    expect(sb.calls.selects).toEqual([]);   // and it short-circuits BEFORE the lookup
  });

  it('CONTROL: the four verdicts are distinct, so the tally cannot collapse', () => {
    const verdicts = new Set(['inserted', 'suppressed', 'skipped', 'error']);
    expect(verdicts.size).toBe(4);
  });
});

describe('the dedup query asks the right question', () => {
  it('filters on the OPEN statuses — an unfiltered lookup would bump counts on closed rows', async () => {
    // NAMED ANTI-PRECEDENT (PRD TR-4): gh-failure-monitor.cjs:91-95 looks up by hash with NO status
    // filter, and live it is incrementing a RESOLVED row to occurrence_count 586. Only its UPDATE
    // half was reused here. This asserts we did not inherit its lookup.
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 1 }) });
    await routeFinding(sb, ENTRY, { count: 1 });
    expect(sb.calls.statusFilter).not.toBeNull();
    expect(sb.calls.statusFilter.col).toBe('status');
    expect(sb.calls.statusFilter.vals).toEqual(OPEN_FINDING_STATUSES);
  });

  it('SECURITY: restricts to rows this runner could have written, so an anon row cannot mute a gauge', async () => {
    // RLS grants anon an INSERT path constrained on source_type='telegram' ONLY — category, status
    // and metadata are caller-supplied, and the anon key is public. Without these predicates a
    // planted lookalike row would PERMANENTLY mute that invariant, because nothing clears a gauge
    // finding. This diff is what makes planting effective: while the insert was unconditional a
    // planted row suppressed nothing.
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 1 }) });
    await routeFinding(sb, ENTRY, { count: 1 });
    expect(sb.calls.selects.join('|')).toContain('source_type=auto_capture');
    expect(sb.calls.selects.join('|')).toContain('feedback_type=sentry_error');
    // NOT .is(feedback_type, null). That was the first version, and it was the defect: the column is
    // NOT NULL DEFAULT 'sentry_error', so the predicate was unsatisfiable and Postgres folded the
    // whole lookup to a One-Time Filter: false. The dedup could never fire, and this very assertion
    // — written to prove the fix — pinned the broken predicate as the acceptance criterion. What
    // makes it catchable now is the line above plus a double that APPLIES filters: realGaugeRow()
    // carries feedback_type='sentry_error', so any predicate the runner's own row cannot satisfy
    // fails here. sentry_error still excludes both anon INSERT policies (venture requires
    // feedback_type LIKE 'user_%'), so the mute defence is intact — verified live in pg_policies.
    // The category filter is what keeps the dedup key inside this runner's own row family; without
    // it any auto_capture row with a matching gauge_id would mute the gauge.
    expect(sb.calls.selects.join('|')).toContain('category=invariant_gauge_finding');
    // An archived row still holds an open STATUS — archiving is not a status transition — so only
    // this predicate stops an archived finding from muting its gauge from behind a filtered view.
    expect(sb.calls.isFilters).toContainEqual({ col: 'archived_at', val: null });
  });

  it('picks the open row DETERMINISTICALLY — .limit(1) without .order() stamps an arbitrary sibling', async () => {
    // Up to 692 open rows share one gauge_id today. An unordered limit(1) picks arbitrarily and
    // then UPDATEs, perturbing the ordering it depended on, scattering occurrence_count across
    // hundreds of identical siblings with no authoritative row.
    const sb = makeSupabase({ openRow: realGaugeRow({ occurrence_count: 1 }) });
    await routeFinding(sb, ENTRY, { count: 1 });
    expect(sb.calls.order).toEqual({ col: 'created_at', ascending: false });
  });

  it('keys on the gauge id, which buildFindingRow also writes', async () => {
    const row = buildFindingRow(ENTRY, { count: 1 });
    expect(row.metadata.gauge_id).toBe(ENTRY.id);
    const sb = makeSupabase({ openRow: null });
    await routeFinding(sb, ENTRY, { count: 1 });
    expect(sb.calls.selects.join('|')).toContain(`metadata->>gauge_id=${ENTRY.id}`);
  });
});
