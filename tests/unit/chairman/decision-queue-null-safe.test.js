/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 — static half (FR-1, FR-2, FR-3, FR-5 axes split).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE CAN AND CANNOT PROVE, STATED UP FRONT SO NO GREEN RUN IS MISREAD
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FR-1 and FR-2 ship as TIER-2 chairman-gated DDL. They are STAGED, NOT APPLIED — so their
 * RUNTIME behaviour cannot be exercised here. Those cases live in the db tier:
 *   tests/database/chairman-decision-queue-null-safe.db.test.js
 * which is gated OFF against production by design (vitest.config.js DB_INCLUDE_GATED). They run
 * when that suite is pointed at a non-production database with the DDL applied.
 *
 * THIS FILE IS PURE STATIC ANALYSIS OF THE STAGED SQL, plus one pinned fixture. It opens no
 * database connection — an earlier version did, which is what the DB-test guard correctly caught:
 * a unit test reaching for live credentials is a unit test in name only.
 *
 * THE FIXTURE IS A SNAPSHOT AND ITS LIMIT IS REAL. live-facts.json records the 18 decision_types
 * and 29 legal decision values present on 2026-08-04. So "every live type is mapped" here means
 * "every type that existed at capture time". A type added after the capture is invisible to this
 * suite. That gap is covered at the moment it matters — .claude-work/validate-staged-ddl.mjs
 * re-runs the same coverage query against the LIVE catalog, and is run at apply time, which is the
 * only instant where an unmapped type can actually block the chairman.
 *
 * What IS proven here, without applying anything and without a database:
 *   - every decision_type in the capture has a mapping (else the chairman meets
 *     UNMAPPED_DECISION_TYPE at the moment he tries to decide that type)
 *   - every value the mapping can emit is legal under the CHECK constraint as captured
 *   - the axes are SEPARATE: the mapping consults decision_type and never venture_id
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const MIGRATION = 'database/chairman-gated/20260803_chairman_decide_null_safe_and_type_honest.sql';
const VIEW_MIGRATION = 'database/chairman-gated/20260803_chairman_queue_truthful_render.sql';
const FACTS = 'docs/chairman-decision-queue-capture-2026-08-03/live-facts.json';

const sql = readFileSync(MIGRATION, 'utf8');
const facts = JSON.parse(readFileSync(FACTS, 'utf8'));
const liveTypes = facts.decision_types;
const allowedDecisions = new Set(facts.allowed_decision_values);

/** The CASE body of fn_chairman_decision_value — bounded, so comment prose above it cannot leak in. */
function mappingBody() {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_chairman_decision_value');
  const end = sql.indexOf('$function$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/** decision_types named in WHEN clauses — the ones actually mapped, not the ones merely discussed. */
function mappedTypes() {
  const clauses = [...mappingBody().matchAll(/WHEN p_decision_type (?:=|IN)\s*\(?([^)]*?)\)?\s*THEN/gs)].map((m) => m[1]);
  return new Set(clauses.flatMap((c) => [...c.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])));
}

/** Values the mapping can return. */
function emittedValues() {
  return new Set([...mappingBody().matchAll(/THEN '([a-z_]+)' ELSE '([a-z_]+)' END/g)].flatMap((m) => [m[1], m[2]]));
}

describe('FR-2 — the mapping is complete and legal (provable while STAGED)', () => {
  it('the pinned fixture is real and carries its own provenance', () => {
    // Guard against the fixture silently emptying — every coverage assertion below would then
    // pass vacuously, which is the failure mode this whole SD is about.
    expect(liveTypes.length).toBeGreaterThan(0);
    expect(allowedDecisions.size).toBeGreaterThan(0);
    expect(facts._provenance.captured_at_utc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('maps EVERY decision_type present in the capture', () => {
    // The SD enumerates two types. The table carries eighteen. A type with no mapping does not
    // degrade gracefully — it returns UNMAPPED_DECISION_TYPE, i.e. the chairman is blocked again,
    // by the fix. So completeness is a correctness property, not tidiness.
    const mapped = mappedTypes();
    expect(liveTypes.filter((t) => !mapped.has(t))).toEqual([]);
  });

  it('emits only values inside chairman_decisions_decision_check', () => {
    const emitted = [...emittedValues()];
    expect(emitted.length).toBeGreaterThan(0);     // guard: a regex that matched nothing would "pass"
    for (const v of emitted) expect(allowedDecisions.has(v), `${v} not in constraint`).toBe(true);
  });

  it('[FR-5 axes split] the mapping consults decision_type and NEVER venture_id', () => {
    // This is the structural half of the axes split, and it is the half that can be proven without
    // applying: if the mapping function ever reads venture_id, the two axes have been merged into
    // one predicate — the exact thing the SD forbids.
    const body = mappingBody();
    expect(body).toMatch(/p_decision_type/);
    expect(body).not.toMatch(/venture_id/);
    expect(body).not.toMatch(/IS NULL/);
  });

  it('[FR-2] non-venture types do NOT receive venture-kill semantics', () => {
    const body = mappingBody();
    // Locate the branch containing session_question (a type with no venture) and assert it cannot
    // produce 'kill'. Measured motivation: session_question already carries decision='kill' on 4
    // live rows, written by the old unconditional CASE. This is remediation, not prevention.
    const branch = body.split(/WHEN p_decision_type/).find((b) => b.includes("'session_question'"));
    expect(branch, 'session_question branch not found').toBeTruthy();
    expect(branch).not.toMatch(/'kill'/);
  });

  it('[FR-2] venture-scoped types MAY still use kill — the fix is targeted, not a blanket ban', () => {
    // Negative control for the test above. If this ever fails, the fix over-corrected and venture
    // kills stopped working, which is a different outage.
    const body = mappingBody();
    const branch = body.split(/WHEN p_decision_type/).find((b) => b.includes("'venture_disposition'"));
    expect(branch, 'venture_disposition branch not found').toBeTruthy();
    expect(branch).toMatch(/'kill'/);
  });
});

describe('FR-1 — null-safety is on the COLUMN, and the reject path is guarded', () => {
  it('uses a LEFT JOIN so a venture-less row is found', () => {
    expect(sql).toMatch(/LEFT JOIN ventures v ON v\.id = cd\.venture_id/);
    expect(sql).not.toMatch(/\n\s+JOIN ventures v ON/);   // no bare INNER join remains
  });

  it('guards the kill-audit call on venture presence — the statement that actually needed it', () => {
    // Two of the three venture-coupled statements are NULL-predicate no-ops. The third passes
    // venture_id into fn_write_kill_audit_trail, where NULL is either a constraint failure or a
    // meaningless audit row. Assert the whole reject block is branched, not merely tolerant.
    expect(sql).toMatch(/IF p_action = 'rejected' AND v_has_venture THEN/);
  });

  it('makes the STALE_CONTEXT guard explicit rather than relying on NULL comparison', () => {
    // Previously `venture_updated_at > created_at` was NULL for venture-less rows, which is not
    // TRUE, so the guard did not fire — correct outcome, accidental mechanism.
    expect(sql).toMatch(/IF v_has_venture AND NOT p_force_stale/);
  });

  it('refuses an unmapped decision_type instead of defaulting', () => {
    expect(sql).toMatch(/UNMAPPED_DECISION_TYPE/);
  });
});

describe('FR-3 — truthful render (staged view)', () => {
  const view = readFileSync(VIEW_MIGRATION, 'utf8');
  const viewBody = view.slice(view.indexOf('CREATE OR REPLACE VIEW'));

  it('renders the real decision_type, not a constant', () => {
    expect(viewBody).toMatch(/cd\.decision_type,/);
    expect(viewBody).not.toMatch(/'chairman_approval'::text AS decision_type/);
  });

  it('renders a PARK as HELD in BOTH branches — park writes to both tables', () => {
    // The defect existed twice. park_venture_decision updates chairman_decisions AND
    // venture_decisions, so fixing one branch leaves half of all parked decisions still reading
    // back to the chairman as rejected.
    expect(viewBody).toMatch(/WHEN cd\.decision::text = 'pause'::text THEN 'held'::text/);
    expect(viewBody).toMatch(/WHEN vd\.decision = 'pause'::text THEN 'held'::text/);
    expect(viewBody).not.toMatch(/ARRAY\['kill'[^\]]*'pause'/);
  });

  it('priority is no longer unconditionally critical', () => {
    expect(viewBody).not.toMatch(/'critical'::text AS priority/);
    expect(viewBody).toMatch(/WHEN cd\.blocking THEN 'critical'::text/);
  });
});
