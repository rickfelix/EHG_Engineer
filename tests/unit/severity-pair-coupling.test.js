// SD-LEO-INFRA-THREE-GAPS-APPLIED-001 — FR-2 + FR-3 two-sided fence.
//
// TR-3: every fence must be demonstrated on a SEEDED DEFECT, not accepted on a green
// run. A check that has never failed is indistinguishable from a check that CANNOT
// fail — which is the exact condition this SD exists to remove. So every AGREES case
// below is paired with a DIVERGED case built by mutating the same input.
//
// The "real" fixtures are verbatim from live pg_views / pg_policy on 2026-08-03.

import { describe, it, expect } from 'vitest';
import {
  extractSeverityPair,
  compareSeverityPair,
  compareCountVisibility,
  allCouplingsAgree,
  stripSqlComments,
  AGREES,
  DIVERGED,
  UNREADABLE,
  compareViewBaseParity,
  seedParityDivergence,
} from '../../lib/policy/severity-pair-coupling.js';

// --- Live fixtures (verbatim shape from the database) ------------------------------

// chairman_all_decision_signals: note `severity` appears in the jsonb projection FIRST,
// several hundred chars before the WHERE clause that actually carries the pair. This
// ordering is the reason extraction scans every occurrence rather than only the first.
const REAL_VIEW_EXPR = `
  SELECT f.id,
    'critical'::text AS priority,
    CASE WHEN ((f.severity)::text = 'critical'::text) THEN 'critical'::text ELSE 'high'::text END AS tier,
    jsonb_build_object('id', f.id, 'category', f.category, 'severity', f.severity, 'body', "left"(COALESCE(f.description, ''::text), 280)) AS details,
    ((f.severity)::text = 'critical'::text) AS blocking
   FROM (feedback f)
  WHERE (((f.severity)::text = ANY (ARRAY['critical'::text, 'high'::text])) AND (f.resolved_at IS NULL) AND ((COALESCE(f.status, 'new'::character varying))::text <> ALL (ARRAY['resolved'::text, 'dismissed'::text])))
`;

const REAL_POLICY_EXPR = '(((severity IS NULL) OR ((severity)::text <> ALL ((ARRAY[\'critical\'::character varying, \'high\'::character varying])::text[]))) AND ((category)::text IS DISTINCT FROM \'chairman_decision_deferred\'::text) AND ( SELECT (count(*) < 50) FROM feedback f WHERE (((f.source_type)::text = \'telegram\'::text) AND (f.created_at > (now() - \'01:00:00\'::interval)))))';

const REAL_LIMIT_PREDICATE = '(f.source_type)::text = \'telegram\'::text';
const REAL_ANON_SELECT_PREDICATE = '(source_type)::text = \'telegram\'::text';

// --- extraction --------------------------------------------------------------------

describe('extractSeverityPair', () => {
  it('finds the pair in the real view even though severity appears earlier in a projection', () => {
    // THE REGRESSION GUARD for the first-occurrence bug: a first-match scan lands in
    // the jsonb_build_object window, finds no ARRAY, and reports the pair unreadable.
    const { pair } = extractSeverityPair(REAL_VIEW_EXPR);
    expect(pair).toEqual(['critical', 'high']);
  });

  it('finds the pair in the real policy expression', () => {
    const { pair } = extractSeverityPair(REAL_POLICY_EXPR);
    expect(pair).toEqual(['critical', 'high']);
  });

  it('returns null (not an empty pair) when there is no severity/ARRAY construct', () => {
    expect(extractSeverityPair('SELECT 1 FROM feedback').pair).toBeNull();
  });

  it('does NOT read the pair out of a COMMENT that merely discusses it', () => {
    // A guard that reads text will match the EXPLANATION. Four separate instances of
    // this in one session, including inside a script written to catch it.
    const commentOnly = `
      -- We deliberately do NOT bound on ARRAY['critical','high'] for severity here;
      /* the severity ARRAY['critical','high'] coupling lives in the other policy */
      SELECT 1 FROM feedback
    `;
    expect(extractSeverityPair(commentOnly).pair).toBeNull();
  });

  it('stripSqlComments removes both comment styles', () => {
    expect(stripSqlComments('a -- x\nb /* y */ c')).not.toMatch(/x|y/);
  });
});

// --- FR-2: the severity-pair coupling ----------------------------------------------

describe('FR-2 severity pair coupling', () => {
  it('AGREES on the current live configuration', () => {
    const r = compareSeverityPair({ viewExpr: REAL_VIEW_EXPR, policyExpr: REAL_POLICY_EXPR });
    expect(r.verdict).toBe(AGREES);
    expect(r.viewPair).toEqual(['critical', 'high']);
    expect(r.policyPair).toEqual(['critical', 'high']);
  });

  it('SEEDED DEFECT: narrowing the POLICY pair is caught', () => {
    const seeded = REAL_POLICY_EXPR.replace(
      "ARRAY['critical'::character varying, 'high'::character varying]",
      "ARRAY['critical'::character varying]",
    );
    expect(seeded).not.toBe(REAL_POLICY_EXPR); // the mutation must actually have applied
    const r = compareSeverityPair({ viewExpr: REAL_VIEW_EXPR, policyExpr: seeded });
    expect(r.verdict).toBe(DIVERGED);
    expect(r.detail).toMatch(/DIVERGENCE/);
  });

  it('SEEDED DEFECT: restructuring the VIEW pair is caught — the real-world scenario', () => {
    // This is precisely what a future edit to chairman_all_decision_signals looks like.
    // The pair survived one restructure byte-identical by luck; this asserts luck is
    // no longer load-bearing.
    const seeded = REAL_VIEW_EXPR.replace(
      "ARRAY['critical'::text, 'high'::text]",
      "ARRAY['critical'::text, 'high'::text, 'medium'::text]",
    );
    expect(seeded).not.toBe(REAL_VIEW_EXPR);
    const r = compareSeverityPair({ viewExpr: REAL_VIEW_EXPR.replace(REAL_VIEW_EXPR, seeded), policyExpr: REAL_POLICY_EXPR });
    expect(r.verdict).toBe(DIVERGED);
    expect(r.viewPair).toEqual(['critical', 'high', 'medium']);
  });

  it('opposite operators over the SAME set is AGREES, not a false divergence', () => {
    // The view SELECTS severity IN (pair); the policy REJECTS severity IN (pair).
    // Comparing operators would report divergence on a correctly-coupled pair.
    const r = compareSeverityPair({ viewExpr: REAL_VIEW_EXPR, policyExpr: REAL_POLICY_EXPR });
    expect(r.verdict).toBe(AGREES);
  });

  it('an unreadable side is UNREADABLE, never AGREES', () => {
    const r = compareSeverityPair({ viewExpr: 'SELECT 1', policyExpr: REAL_POLICY_EXPR });
    expect(r.verdict).toBe(UNREADABLE);
    expect(r.verdict).not.toBe(AGREES);
    expect(r.detail).toMatch(/not a pass/i);
  });

  it('both sides missing is UNREADABLE', () => {
    expect(compareSeverityPair({}).verdict).toBe(UNREADABLE);
  });
});

// --- FR-3: the count-visibility coupling -------------------------------------------

describe('FR-3 rate-limit count visibility coupling', () => {
  it('AGREES today: anon SELECT covers the rate-limit predicate exactly', () => {
    // MEASURED: select_feedback_policy binds to AUTHENTICATED, not anon; anon SELECT is
    // telegram_bot_select_feedback USING (source_type='telegram'), which is exactly what
    // the limit counts. The limit is NOT starved today.
    const r = compareCountVisibility({
      limitPredicate: REAL_LIMIT_PREDICATE,
      selectPredicate: REAL_ANON_SELECT_PREDICATE,
    });
    expect(r.verdict).toBe(AGREES);
  });

  it('SEEDED DEFECT: narrowing anon SELECT starves the count and is caught', () => {
    // THE LOAD-BEARING DIRECTION. This is the "obviously safe hardening" that silently
    // disarms the limit: count(*) < 50 becomes unconditionally true.
    const narrowed = '(source_type)::text = \'telegram\'::text AND venture_id IS NOT NULL';
    const r = compareCountVisibility({
      limitPredicate: REAL_LIMIT_PREDICATE,
      selectPredicate: narrowed,
    });
    expect(r.verdict).toBe(DIVERGED);
    expect(r.detail).toMatch(/silently stops limiting/);
  });

  it('SEEDED DEFECT: scoping anon SELECT to a bot identity is caught', () => {
    const r = compareCountVisibility({
      limitPredicate: REAL_LIMIT_PREDICATE,
      selectPredicate: '(source_type)::text = \'telegram\'::text AND (source_application)::text = \'bot\'::text',
    });
    expect(r.verdict).toBe(DIVERGED);
  });

  it('tolerates cast and whitespace spelling differences between the two sides', () => {
    const r = compareCountVisibility({
      limitPredicate: '((f.source_type)::text = \'telegram\'::text)',
      selectPredicate: '(source_type)::character varying = \'telegram\'',
    });
    expect(r.verdict).toBe(AGREES);
  });

  it('an unreadable side is UNREADABLE, never AGREES', () => {
    const r = compareCountVisibility({ limitPredicate: REAL_LIMIT_PREDICATE });
    expect(r.verdict).toBe(UNREADABLE);
    expect(r.verdict).not.toBe(AGREES);
  });
});

// --- FR-3 correlated form (the live policy, as amended mid-SD 2026-08-03) ----------

describe('FR-3 correlated counted-set', () => {
  // The applied policy changed WHILE this SD was open: the rate limit went from a fixed
  // source_type='telegram' to `f.source_type IS NOT DISTINCT FROM feedback.source_type`,
  // i.e. it counts rows sharing the INCOMING row's source_type. The per-source_type
  // qualifier is more correct in intent than a global telegram budget — and it collides
  // with anon SELECT, which exposes exactly one source_type.
  it('DIVERGED when the caller SELECT pins the correlated column to one literal', () => {
    const r = compareCountVisibility({
      correlatedColumn: 'source_type',
      selectPredicate: "(source_type)::text = 'telegram'::text",
    });
    expect(r.verdict).toBe(DIVERGED);
    expect(r.detail).toMatch(/binds ONLY for source_type = 'telegram'/);
    expect(r.detail).toMatch(/starved to 0/);
  });

  it('is DIVERGED, not UNREADABLE — a decidable divergence must not hide as unreadable', () => {
    // Before the correlated branch existed, this exact input reported UNREADABLE, which
    // is non-passing but says "could not measure" when the truth is "measured, and it
    // diverges". Wrong diagnosis on a live fail-open is its own defect.
    const r = compareCountVisibility({
      correlatedColumn: 'source_type',
      selectPredicate: "(source_type)::text = 'telegram'::text",
    });
    expect(r.verdict).not.toBe(UNREADABLE);
  });

  it('UNREADABLE when the caller SELECT does not pin the correlated column', () => {
    const r = compareCountVisibility({ correlatedColumn: 'source_type', selectPredicate: 'venture_id IS NOT NULL' });
    expect(r.verdict).toBe(UNREADABLE);
    expect(r.verdict).not.toBe(AGREES);
    expect(r.detail).toMatch(/anon-role probe/);
  });

  it('UNREADABLE when the caller SELECT is missing entirely', () => {
    expect(compareCountVisibility({ correlatedColumn: 'source_type' }).verdict).toBe(UNREADABLE);
  });
});

// --- the aggregate must not pass on nothing ----------------------------------------

describe('allCouplingsAgree', () => {
  it('is TRUE only when every coupling agrees', () => {
    expect(allCouplingsAgree([{ verdict: AGREES }, { verdict: AGREES }])).toBe(true);
  });

  it('is FALSE when any coupling diverged', () => {
    expect(allCouplingsAgree([{ verdict: AGREES }, { verdict: DIVERGED }])).toBe(false);
  });

  it('is FALSE when any coupling is UNREADABLE — unmeasured is not success', () => {
    expect(allCouplingsAgree([{ verdict: AGREES }, { verdict: UNREADABLE }])).toBe(false);
  });

  it('is FALSE on an EMPTY list — a fence that measured nothing has not passed', () => {
    // Without this, a fence whose inputs all failed to load reports success.
    expect(allCouplingsAgree([])).toBe(false);
  });
});

// ── SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001 — view/base column parity ────────────
//
// The fixtures are VERBATIM from the live catalog on 2026-08-07, not invented: the view serves
// 30 columns against the base table's 29, with six base columns absent. Using the real drift
// means these tests describe a defect that exists rather than one imagined for the occasion.
//
// The TESTING sub-agent named the wrong build a weaker suite would pass: a correct pure
// comparator fed wrong inputs, driven by a loop iterating ZERO views. The cardinality control at
// the bottom is what makes fires-correctly, fires-always and fires-never three distinguishable
// outcomes rather than one.

const BASE_COLS = [
  'pattern_id', 'category', 'severity', 'issue_summary', 'occurrence_count', 'proven_solutions',
  'prevention_checklist', 'trend', 'updated_at', 'created_at', 'source', 'assigned_sd_id',
  'metadata', 'dedup_fingerprint', 'first_seen_sd_id', 'last_seen_sd_id', 'status',
  'data_quality_status', 'content_embedding', 'embedding_updated_at', 'auto_block_on_match',
];
/** The six genuinely absent columns, measured live against the production catalog. */
const ABSENT_LIVE = [
  'metadata', 'dedup_fingerprint', 'data_quality_status',
  'content_embedding', 'embedding_updated_at', 'auto_block_on_match',
];
/** The seven the view COMPUTES and the base table does not have — parity must tolerate these. */
const COMPUTED = [
  'recency_status', 'days_since_update', 'decay_adjusted_confidence',
  'severity_weight', 'composite_score', 'min_occurrence_threshold', 'meets_threshold',
];
const DRIFTED_VIEW_COLS = BASE_COLS.filter((c) => !ABSENT_LIVE.includes(c)).concat(COMPUTED);
const HEALTHY_VIEW_COLS = BASE_COLS.concat(COMPUTED);

describe('compareViewBaseParity — the p.*-refreeze drift class', () => {
  it('TS-1 POSITIVE CONTROL: the REAL measured drift is detected and named', () => {
    const r = compareViewBaseParity({ viewCols: DRIFTED_VIEW_COLS, baseCols: BASE_COLS });
    expect(r.verdict).toBe(DIVERGED);
    expect([...r.missingFromView].sort()).toEqual([...ABSENT_LIVE].sort());
    expect(r.detail).toMatch(/DIVERGENCE/);
  });

  it('TS-4 NEGATIVE CONTROL: a view at parity does NOT fire', () => {
    // Without this, a comparator returning DIVERGED unconditionally would satisfy every positive
    // case above while alarming on all ~185 views in the database, forever.
    const r = compareViewBaseParity({ viewCols: HEALTHY_VIEW_COLS, baseCols: BASE_COLS });
    expect(r.verdict).toBe(AGREES);
    expect(r.missingFromView).toEqual([]);
  });

  it('ASYMMETRY: extra VIEW columns are computed output, never drift', () => {
    // A set-EQUALITY implementation would report permanent false divergence on every correctly
    // coupled view, because a view legitimately computes columns its base table does not have.
    // This is the single most likely wrong implementation, and it looks tidier than the right one.
    const r = compareViewBaseParity({ viewCols: [...BASE_COLS, 'computed_a'], baseCols: BASE_COLS });
    expect(r.verdict).toBe(AGREES);
  });

  it('TS-2 SEEDED (4 cases): an unreadable side is UNREADABLE, never AGREES', () => {
    // [] IS TRUTHY, so `if (!viewCols || !baseCols)` lets it through. The two ARRAY cases are the
    // ones a silently-empty catalog read actually produces, and they are exactly the ones the
    // obvious guard misses.
    for (const args of [
      { viewCols: [], baseCols: BASE_COLS },
      { viewCols: BASE_COLS, baseCols: [] },
      { viewCols: null, baseCols: BASE_COLS },
      { viewCols: BASE_COLS, baseCols: null },
    ]) {
      expect(compareViewBaseParity(args).verdict, JSON.stringify(args).slice(0, 50)).toBe(UNREADABLE);
    }
  });

  it('SEEDED: empty-vs-empty is UNREADABLE — the fail-open the naive guard produces', () => {
    // The most dangerous single input: a catalog query that returned nothing for BOTH sides.
    // "Every base column is in the view" is vacuously TRUE over an empty base list, so a naive
    // implementation returns AGREES — reporting parity about a database it never read.
    expect(compareViewBaseParity({ viewCols: [], baseCols: [] }).verdict).toBe(UNREADABLE);
  });

  it('never returns null, on any input shape', () => {
    // allCouplingsAgree reads `r && r.verdict`, so a null element would count as not-AGREES BY
    // ACCIDENT rather than by decision. Safe today; that is not the same as being a contract.
    for (const args of [undefined, {}, { viewCols: null, baseCols: null }, { viewCols: 'x', baseCols: 7 }]) {
      const r = compareViewBaseParity(args);
      expect(r).toBeTruthy();
      expect(r.verdict).toBe(UNREADABLE);
    }
  });

  it('a DIVERGED parity result fails the aggregate — and the aggregator is UNCHANGED', () => {
    const drifted = compareViewBaseParity({ viewCols: DRIFTED_VIEW_COLS, baseCols: BASE_COLS });
    const healthy = compareViewBaseParity({ viewCols: HEALTHY_VIEW_COLS, baseCols: BASE_COLS });
    expect(allCouplingsAgree([{ verdict: AGREES }, { verdict: AGREES }, drifted])).toBe(false);
    expect(allCouplingsAgree([{ verdict: AGREES }, { verdict: AGREES }, healthy])).toBe(true);
  });
});

describe('TS-5 seedParityDivergence — the parity coupling fails on ITS OWN seed', () => {
  it('the seed makes a HEALTHY view diverge', () => {
    // The fence's exit-3 BROKEN check asserts only that the AGGREGATE seeded run fails, and the
    // two pre-existing seeds already make it fail. Without a parity-specific seed this comparator
    // would ride along permanently untested behind a control that passes for unrelated reasons.
    const r = compareViewBaseParity({ viewCols: seedParityDivergence(HEALTHY_VIEW_COLS), baseCols: BASE_COLS });
    expect(r.verdict).toBe(DIVERGED);
  });

  it('and it fails the aggregate with the OTHER couplings forced to AGREES', () => {
    // Isolation: proves the PARITY leg alone trips the fence, not the pre-existing seeds.
    expect(allCouplingsAgree([
      { verdict: AGREES },
      { verdict: AGREES },
      compareViewBaseParity({ viewCols: seedParityDivergence(HEALTHY_VIEW_COLS), baseCols: BASE_COLS }),
    ])).toBe(false);
  });

  it('[CONTROL] the seed is not a no-op, and is safe on an empty list', () => {
    expect(seedParityDivergence(HEALTHY_VIEW_COLS).length).toBe(HEALTHY_VIEW_COLS.length - 1);
    expect(seedParityDivergence([])).toEqual([]);
  });
});

describe('CARDINALITY CONTROL — fires-correctly vs fires-always vs fires-never', () => {
  it('across N views with exactly K drifted, EXACTLY K fire', () => {
    // Asserting `> 0` would pass for a comparator that fires on everything. A COUNT separates all
    // three outcomes in one assertion — and the wrong build TESTING named (a loop iterating zero
    // views) fails the length check too, because 0 is not 5.
    const views = [
      { name: 'v_a', cols: HEALTHY_VIEW_COLS },
      { name: 'v_b', cols: DRIFTED_VIEW_COLS },
      { name: 'v_c', cols: HEALTHY_VIEW_COLS },
      { name: 'v_d', cols: seedParityDivergence(HEALTHY_VIEW_COLS) },
      { name: 'v_e', cols: HEALTHY_VIEW_COLS },
    ];
    const results = views.map((v) => compareViewBaseParity({ viewCols: v.cols, baseCols: BASE_COLS, viewName: v.name }));
    expect(results.filter((r) => r.verdict === DIVERGED).length).toBe(2);
    expect(results.filter((r) => r.verdict === AGREES).length).toBe(3);
    expect(results.length, 'a loop over zero views passes every other assertion in this file').toBe(5);
  });
});
