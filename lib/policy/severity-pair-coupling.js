/**
 * SD-LEO-INFRA-THREE-GAPS-APPLIED-001 — FR-2 + FR-3.
 *
 * These are ONE defect class, not two: an UNDECLARED DEPENDENCY BETWEEN TWO
 * SEPARATELY-EDITABLE OBJECTS. Both sides agree today, neither knows the other
 * exists, and nothing notices when they stop agreeing.
 *
 *   FR-2  policy severity pair        <- view severity pair
 *   FR-3  rate-limit subquery breadth <- anon SELECT policy breadth
 *
 * Hence one fence parameterised over both couplings rather than two unrelated checks.
 *
 * WHY A COMMENT IS NOT AN ACCEPTABLE FIX HERE (FR-2 says so explicitly): comments are
 * what already failed. `chairman_all_decision_signals` was restructured during
 * SD-LEO-INFRA-CHAIRMAN-DECISION-VIEW-001 and the pair survived byte-identical by
 * luck — the person doing that restructure (this author) had no idea a permission
 * policy read the same pair. A fence that executes is the only thing that would have
 * caught it.
 *
 * DESIGN RULE THROUGHOUT: an unreadable side yields UNREADABLE, never AGREES. A check
 * that reports success when it could not read its inputs is exactly the fail-open
 * shape this SD exists to remove.
 */

/** Verdicts. UNREADABLE is deliberately NOT a pass. */
export const AGREES = 'AGREES';
export const DIVERGED = 'DIVERGED';
export const UNREADABLE = 'UNREADABLE';

/**
 * Strip SQL comments so a pattern never matches the prose ABOUT the pattern.
 *
 * Learned the hard way four times in one session: a guard that reads text will match
 * the EXPLANATION. A view or policy body that documents "we deliberately exclude
 * ARRAY['critical','high'] here" would otherwise be parsed as declaring the pair.
 */
export function stripSqlComments(sql) {
  if (typeof sql !== 'string') return '';
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/**
 * Extract the severity literal set that `expr` compares `severity` against.
 *
 * Handles the two forms Postgres round-trips these as:
 *   (f.severity)::text = ANY (ARRAY['critical'::text, 'high'::text])
 *   (severity)::text <> ALL ((ARRAY['critical'::character varying, ...])::text[])
 *
 * @returns {{ pair: string[]|null, form: string|null }} pair is sorted+lowercased;
 *   null when no severity-vs-ARRAY construct is present (which is UNREADABLE, not empty).
 */
export function extractSeverityPair(expr) {
  const sql = stripSqlComments(expr);
  if (!sql) return { pair: null, form: null };

  // Scan EVERY `severity` occurrence and take the first whose nearby window actually
  // contains an ARRAY[...] comparison.
  //
  // Anchoring on the FIRST occurrence alone is wrong, and the real view proves it:
  // chairman_all_decision_signals mentions severity inside a jsonb_build_object(...)
  // projection well before the WHERE clause that carries the pair. A first-match scan
  // reads the projection window, finds no ARRAY, and reports UNREADABLE on a view whose
  // pair is plainly present. Anchoring on any ARRAY[...] in the body is wrong in the
  // other direction — a 7kB definition has unrelated arrays.
  const windowSize = 400;
  for (const m of sql.matchAll(/\bseverity\b/gi)) {
    const window = sql.slice(m.index, m.index + windowSize);
    const arrayMatch = window.match(/ARRAY\s*\[([^\]]*)\]/i);
    if (!arrayMatch) continue;

    const literals = [...arrayMatch[1].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase());
    if (literals.length === 0) continue;

    const opMatch = window.match(/=\s*ANY|<>\s*ALL|!=\s*ALL/i);
    return {
      pair: [...new Set(literals)].sort(),
      form: opMatch ? opMatch[0].replace(/\s+/g, ' ').toUpperCase() : null,
    };
  }
  return { pair: null, form: null };
}

/**
 * Compare the pair the VIEW selects on against the pair the POLICY bounds on.
 *
 * NOTE ON POLARITY — this is the subtle part and worth stating rather than assuming.
 * The view SELECTS rows whose severity is IN the pair (that is what arms the chairman
 * queue). The policy REJECTS anon inserts whose severity is IN the pair (`<> ALL`).
 * Opposite operators, SAME SET — and the set is what must stay coupled. Comparing the
 * operators would report a false divergence; comparing the sets is the real invariant.
 */
export function compareSeverityPair({ viewExpr, policyExpr } = {}) {
  const view = extractSeverityPair(viewExpr);
  const policy = extractSeverityPair(policyExpr);

  if (!view.pair || !policy.pair) {
    return {
      verdict: UNREADABLE,
      viewPair: view.pair,
      policyPair: policy.pair,
      detail:
        'Could not read a severity/ARRAY construct from '
        + [!view.pair && 'the view', !policy.pair && 'the policy'].filter(Boolean).join(' and ')
        + '. UNREADABLE is not a pass: the coupling is unverified, which is the condition this fence exists to surface.',
    };
  }

  const same = view.pair.length === policy.pair.length
    && view.pair.every((v, i) => v === policy.pair[i]);

  return {
    verdict: same ? AGREES : DIVERGED,
    viewPair: view.pair,
    policyPair: policy.pair,
    detail: same
      ? `Both sides bound the same severity set [${view.pair.join(', ')}] (view ${view.form || 'n/a'}, policy ${policy.form || 'n/a'}).`
      : `DIVERGENCE: view=[${view.pair.join(', ')}] policy=[${policy.pair.join(', ')}]. The chairman-queue arm and the anon ingress bound no longer describe the same severity set.`,
  };
}

/**
 * FR-3: the rate limit counts rows matching `limitPredicate` while running under the
 * calling role's SELECT policy `selectPredicate`. If the SELECT policy stops covering
 * everything the limit counts, the subquery is starved, `count(*) < N` goes
 * unconditionally true, and the limit silently stops limiting.
 *
 * MEASURED 2026-08-03: it is covered today — the limit counts source_type='telegram'
 * and anon's SELECT is telegram_bot_select_feedback USING (source_type='telegram').
 * That is exact coverage, so this returns AGREES. The hazard is that narrowing the
 * SELECT policy — an obviously-safe-looking hardening — silently breaks it.
 *
 * Deliberately conservative: anything it cannot prove is coverage is reported as
 * DIVERGED, because a rate limit that MIGHT be starved is not a rate limit you can rely on.
 */
export function compareCountVisibility({ limitPredicate, selectPredicate, correlatedColumn } = {}) {
  // CORRELATED FORM — added after the live policy changed underneath this SD on
  // 2026-08-03. The rate limit was rewritten from a fixed `source_type = 'telegram'`
  // to `f.source_type IS NOT DISTINCT FROM feedback.source_type`, i.e. it counts rows
  // sharing the INCOMING row's source_type.
  //
  // A correlated counted-set cannot be compared to a fixed SELECT predicate by string
  // equality, and treating it as unreadable would hide the very thing FR-3 exists to
  // catch. The right question is: does the caller's SELECT expose EVERY value the
  // counted set can take? A SELECT policy pinning the column to ONE literal answers no —
  // coverage holds for that single value and starves for all others, so the limit binds
  // only for that value and silently does not bind for the rest.
  if (correlatedColumn) {
    const select = normalisePredicate(selectPredicate);
    if (!select) {
      return {
        verdict: UNREADABLE, limitPredicate: `correlated on ${correlatedColumn}`, selectPredicate: null,
        detail: 'Could not read the caller SELECT predicate. UNREADABLE is not a pass.',
      };
    }
    const pinned = select.match(new RegExp(`\\b${correlatedColumn}\\b\\s*=\\s*'([^']+)'`, 'i'));
    if (pinned) {
      return {
        verdict: DIVERGED,
        limitPredicate: `correlated on ${correlatedColumn} (counts rows matching the incoming row)`,
        selectPredicate: select,
        detail:
          `DIVERGENCE: the limit counts rows sharing the incoming row's ${correlatedColumn}, but the caller can only SELECT `
          + `${correlatedColumn} = '${pinned[1]}'. The limit therefore binds ONLY for ${correlatedColumn} = '${pinned[1]}'; `
          + 'for every other value the count is starved to 0, count(*) < N is unconditionally true, and the limit silently does not bind.',
      };
    }
    return {
      verdict: UNREADABLE,
      limitPredicate: `correlated on ${correlatedColumn}`,
      selectPredicate: select,
      detail:
        `The limit is correlated on ${correlatedColumn} and the caller SELECT predicate does not pin that column to a literal, `
        + 'so coverage could not be decided by inspection. UNREADABLE is not a pass — this needs an anon-role probe.',
    };
  }

  const limit = normalisePredicate(limitPredicate);
  const select = normalisePredicate(selectPredicate);

  if (!limit || !select) {
    return {
      verdict: UNREADABLE,
      limitPredicate: limit || null,
      selectPredicate: select || null,
      detail:
        'Could not read '
        + [!limit && 'the rate-limit predicate', !select && 'the anon SELECT predicate'].filter(Boolean).join(' and ')
        + '. UNREADABLE is not a pass.',
    };
  }

  // Exact coverage is the only thing provable by comparison alone. A SELECT predicate
  // that merely CONTAINS the limit predicate as a substring is not proof of coverage
  // (it may add conjuncts that narrow it), so anything short of equality is reported.
  const covered = limit === select;

  return {
    verdict: covered ? AGREES : DIVERGED,
    limitPredicate: limit,
    selectPredicate: select,
    detail: covered
      ? `The anon SELECT predicate covers the rate-limit predicate exactly (${limit}); the count cannot be starved by RLS at present.`
      : `DIVERGENCE: the rate limit counts rows matching [${limit}] but anon SELECT exposes [${select}]. The counting subquery may be starved, in which case count(*) < N is unconditionally true and the limit silently stops limiting.`,
  };
}

/**
 * Collapse whitespace/casing/casts/qualifiers so two spellings of one predicate compare equal.
 *
 * TABLE-QUALIFIER STRIPPING IS AN ASSUMPTION, SO IT IS STATED HERE RATHER THAN HIDDEN:
 * both inputs must be predicates over the SAME table. That holds for this fence's only
 * use — the rate-limit subquery predicate (written `(f.source_type)::text = 'telegram'`,
 * aliased because it sits in a subquery) versus the anon SELECT policy predicate
 * (written bare as `(source_type)::text = 'telegram'`, because a policy body needs no
 * alias). Same column, incidental spelling. Without this, the fence reports a permanent
 * false DIVERGENCE on a correctly-coupled pair — caught by its own tests before shipping.
 *
 * The cost of the assumption: predicates over DIFFERENT tables that happen to share a
 * column name would compare equal. Callers must not feed cross-table predicates here.
 */
function normalisePredicate(p) {
  if (typeof p !== 'string') return '';
  return stripSqlComments(p)
    .replace(/::\s*(text|character varying|varchar)/gi, '')
    .replace(/\b[a-z_][a-z0-9_]*\s*\.\s*(?=[a-z_])/gi, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** True only when every supplied coupling verdict is AGREES. UNREADABLE never passes. */
export function allCouplingsAgree(results) {
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) return false; // nothing measured is not success
  return list.every((r) => r && r.verdict === AGREES);
}

/**
 * VIEW-vs-BASE-TABLE COLUMN PARITY — SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001.
 *
 * THE DEFECT CLASS: a view defined with `p.*` has its column list EXPANDED AND FROZEN at
 * CREATE. The base table then gains a column and the view does not. Nothing errors, nothing
 * alarms, and the view quietly stops exposing what its own definition claims to.
 *
 * THIS IS NOT HYPOTHETICAL AND IT IS NOT HISTORICAL. Measured live on 2026-08-07:
 * v_patterns_with_decay serves 30 columns against issue_patterns' 29, with SIX base columns
 * absent (metadata, dedup_fingerprint, data_quality_status, content_embedding,
 * embedding_updated_at, auto_block_on_match) — including BOTH columns its only direct
 * consumer selects. So scripts/modules/learning/context-builder.js raises 42703 on every
 * run and silently falls back to the base table. The drift is active right now, and no
 * instrument in this repo noticed it for months.
 *
 * ── WHY THIS LIVES BESIDE THE SEVERITY-PAIR COMPARATORS RATHER THAN IN A NEW SCRIPT ────────
 * The fence that runs these comparators was fully built, correct, and NEVER INVOKED — zero
 * workflow references, zero npm scripts, and zero rows in the live periodic_process_registry
 * across 246 registered processes. A new detector beside it would have made two instruments
 * for one question and left the working one dormant. Extending it means the wire that gives
 * this comparator a schedule also ends the fence's own dormancy: the never-invoked instrument
 * dies with its extension.
 *
 * ── ASYMMETRY IS THE WHOLE POINT: THIS IS NOT A SET-EQUALITY CHECK ─────────────────────────
 * A view LEGITIMATELY carries columns the base table does not — v_patterns_with_decay computes
 * seven (recency_status, days_since_update, decay_adjusted_confidence, …). Comparing the sets
 * for equality would report a permanent false DIVERGENCE on every correctly-coupled view in
 * the database. The invariant is ONE-DIRECTIONAL: every BASE column must appear in the VIEW.
 * Extra view columns are computed output and are not drift.
 *
 * ── EMPTY IS UNREADABLE, NEVER AGREES, AND [] IS THE TRAP ──────────────────────────────────
 * The natural guard `if (!viewCols || !baseCols)` LETS AN EMPTY ARRAY THROUGH, because `[]` is
 * truthy. Empty-vs-empty then compares equal and a naive "every base column is in the view"
 * returns AGREES — a parity check reporting agreement about a catalog it never read. That is
 * the exact fail-open this module's design rule forbids, and it is the shape a silently-empty
 * catalog query actually takes. Length is checked, not just presence.
 *
 * @param {object} o
 * @param {string[]} o.viewCols   column names the view exposes
 * @param {string[]} o.baseCols   column names the base table has
 * @param {string} [o.viewName]   for the detail message only
 * @param {string} [o.baseName]   for the detail message only
 * @returns {{verdict: string, viewCols: string[]|null, baseCols: string[]|null, missingFromView: string[], detail: string}}
 */
export function compareViewBaseParity({ viewCols, baseCols, viewName = 'the view', baseName = 'the base table' } = {}) {
  const readable = (v) => Array.isArray(v) && v.length > 0;

  // ALWAYS returns an object — never null. allCouplingsAgree reads `r && r.verdict`, so a null
  // element would be counted as not-AGREES BY ACCIDENT rather than by decision. Safe today,
  // and not a contract; a later refactor of the aggregator would silently change what it means.
  if (!readable(viewCols) || !readable(baseCols)) {
    return {
      verdict: UNREADABLE,
      viewCols: Array.isArray(viewCols) ? viewCols : null,
      baseCols: Array.isArray(baseCols) ? baseCols : null,
      missingFromView: [],
      detail:
        'Could not read a column list for '
        + [!readable(viewCols) && viewName, !readable(baseCols) && baseName].filter(Boolean).join(' and ')
        + '. UNREADABLE is not a pass: an empty catalog read and a view at parity are the same '
        + 'answer to a check that only asks whether anything is missing.',
    };
  }

  const view = new Set(viewCols.map((c) => String(c).toLowerCase()));
  const missingFromView = baseCols.filter((c) => !view.has(String(c).toLowerCase()));

  if (missingFromView.length > 0) {
    return {
      verdict: DIVERGED,
      viewCols,
      baseCols,
      missingFromView,
      detail:
        `DIVERGENCE: ${viewName} is missing ${missingFromView.length} column(s) present on `
        + `${baseName}: ${missingFromView.join(', ')}. A p.* view freezes its column list at CREATE, `
        + 'so the base table gained these and the view did not. Any consumer selecting them gets '
        + '42703 — and a consumer that catches that error degrades silently.',
    };
  }

  return {
    verdict: AGREES,
    viewCols,
    baseCols,
    missingFromView: [],
    detail:
      `${viewName} exposes every column on ${baseName} (${baseCols.length} base column(s) covered by `
      + `${viewCols.length} view column(s)). Extra view columns are computed output, not drift.`,
  };
}

/**
 * The parity half of --seed-divergence. SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001, FR-3.
 *
 * EXPORTED AND PURE ON PURPOSE. The fence's exit-3 BROKEN check asserts only that the AGGREGATE
 * seeded run FAILS — and the two pre-existing seeds already make it fail. A parity comparator with
 * no seed of its own would therefore ride along PERMANENTLY UNTESTED behind a control that passes
 * for reasons unrelated to it: a positive control that validates the mechanism while proving
 * nothing about the pattern just added.
 *
 * Pure and exported rather than an inline mutation inside main() because the fence has no
 * injection seam — argv is parsed at module scope, main() runs at import, and every terminus calls
 * process.exit(), so the seeded path cannot be imported and asserted. This shape lets a unit test
 * prove the parity coupling fails ON ITS OWN SEED without a database and without refactoring main().
 *
 * @param {string[]} viewCols
 * @returns {string[]} the view's columns with one dropped, so parity must report DIVERGED
 */
export function seedParityDivergence(viewCols) {
  if (!Array.isArray(viewCols) || viewCols.length === 0) return [];
  return viewCols.slice(1);
}
