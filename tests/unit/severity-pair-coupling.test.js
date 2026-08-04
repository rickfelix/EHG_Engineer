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
