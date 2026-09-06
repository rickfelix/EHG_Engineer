/**
 * Acceptance-Artifact Gate — LEAD-FINAL-APPROVAL handoff gate.
 *
 * SD-LEO-INFRA-LEAD-FINAL-APPROVAL-001-B (sibling of -001-A, which fixed the sd_type
 * blanket-skip; this child fixes the other half: LEAD-FINAL-APPROVAL accepting a completion
 * whose own stated completion criterion names an evidence artifact that is missing,
 * provenance-less, or self-reports unsatisfied).
 *
 * TWO LIVE SPECIMENS THIS CLOSES:
 *   - SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 (completed 2026-09-05): its criterion named
 *     a `launch_uat_report` venture_artifacts row (id 54aa3ec6) that self-reports
 *     {"applies":true,"satisfied":false,"reason":"no UAT run recorded..."} — present, but
 *     honestly reporting its own criterion unmet. No gate anywhere read this before completion.
 *   - SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 (completed 2026-09-06 01:08Z): at the
 *     moment it passed LEAD-FINAL-APPROVAL, zero uat_test_runs rows existed for it at all (the
 *     row now on file, b29e63cc, was written 06:20:43Z — 5h12m AFTER completion). Its honest
 *     verdict at completion time was ARTIFACT_MISSING, not a pass_rate failure.
 *
 * NOT a prose parser. Reads a DECLARED pointer: strategic_directives_v2.metadata.acceptance_artifact.
 * An SD with no declared pointer is completely unaffected (opt-in; measured 0 of 4,919 SDs carry
 * this key as of authoring, so day-one blast radius is genuinely zero).
 *
 * PROVENANCE, HONESTLY SCOPED (NOT a reuse of lib/sub-agent-executor/evidence-provenance.js's
 * gradeProvenance): that reader is hard-bound to sub_agent_execution_results — it grades
 * source/invocation_id/session_id/content_hash, and re-derives content_hash from
 * verdict/summary/etc columns that structurally do not exist on venture_artifacts or
 * uat_test_runs. Measured live: neither table has invocation_id/session_id/content_hash at all,
 * and venture_artifacts.source values are never in gradeProvenance's PRODUCER_ALLOWLIST — pointed
 * at these tables it would produce a 100% false-refusal rate. Per-table predicates below instead
 * (PROVENANCE_PREDICATES) check what each table can actually carry: a non-null `source` on
 * venture_artifacts, a present `metadata.evidence_hash` on uat_test_runs.
 *
 * Reuses lib/eva/reality-gates.js's ARTIFACT_MISSING/ARTIFACT_UNSATISFIED reason codes and its
 * parseSelfReportedVerdict()/refusal-predicate verbatim (`hasVerdict && applies !== false &&
 * satisfied !== true` ⇒ unsatisfied) rather than re-deriving self-reported-verdict parsing.
 * Does NOT touch reality-gates.js's gate_boundary_config/BOUNDARY_CONFIG machinery — that system
 * is scoped to 5 hardcoded venture-lifecycle stage transitions and requires a ventureId every
 * caller here lacks (both specimen SDs, the parent, and this SD itself all have venture_id=null).
 * This is a separate, simpler, SD-completion-scoped reader.
 *
 * SECURITY (baked into v1, not deferred): `metadata.acceptance_artifact` is operator-controlled
 * (anyone who can write strategic_directives_v2.metadata) and resolved with a service-role
 * client. Mitigated by: a hardcoded TABLE_ALLOWLIST; a per-table MATCH_COLUMN_ALLOWLIST and
 * SATISFIED_FIELD_ALLOWLIST; a static per-table SELECT_COLUMNS literal (never `select('*')`);
 * scalar-only match values; and `details`/messages carry only the resolved row's `id` and the
 * reason code, never row contents.
 *
 * DETERMINISM: `order_by` defaults to {column:'created_at', desc:true} + limit(1) whenever the
 * declaration doesn't provide one, so a `match` that resolves multiple rows (e.g. a venture with
 * several launch_uat_report rows) has a stable, documented "most recent" answer instead of
 * depending on unspecified PostgREST row order.
 *
 * OBSERVE-ONLY BY DEFAULT (ACCEPTANCE_ARTIFACT_GATE_BINDING=true to flip): mirrors this
 * directory's established rollout convention (acceptance-tier-downgrade-gate.js,
 * success-criteria-unpopulated-gate.js). Unlike those, this gate is opt-in by construction (an
 * SD must explicitly declare metadata.acceptance_artifact to be affected at all), so binding it
 * changes nothing for the measured-0/4,919 undeclared majority — the observe-only default here
 * is for rollout-convention-consistency, not because binding carries the same untested-risk
 * profile as its siblings.
 *
 * A malformed/non-allowlisted declaration (bad table, bad column, bad satisfied.kind) is treated
 * as DECLARATION_INVALID and passes with a warning — a typo in a declaration is evidence of a
 * typo, never evidence of an unmet criterion. A DB/IO error during resolution fails OPEN (passes
 * with a warning) for the same reason acceptance-tier-downgrade-gate.js's own loaders do: an
 * infra blip on a required gate must never masquerade as passed:false/score:0.
 *
 * SECURITY (EXEC-TO-PLAN review, independent adversarial pass): confirmed clean by measurement,
 * not inspection — supabase-js's .match() serializes through URLSearchParams (percent-encodes,
 * never string-concatenates), so a hostile match VALUE cannot inject a PostgREST filter or reach
 * SQL text; a 48-case suite (6 flag values × 8 hostile declarations) confirmed isBindingEnabled()
 * gates every blocking path with nothing escaping as an unguarded throw.
 *
 * TWO REAL FINDINGS FROM THAT REVIEW, FIXED HERE: (1) the numeric_threshold refusal detail used
 * to echo the resolved row's raw column value into warnings[] — a service-role read of a table an
 * RLS policy would otherwise deny entirely (uat_test_runs has no anon/authenticated SELECT policy
 * at all) is an oracle even in observe-only mode, since BINDING only gates blocking, not this data
 * flow. Fixed: the detail message now names only the operator-supplied threshold, never the
 * resolved value. (2) unbounded, un-escaped interpolation of declaration fields (table, column
 * names, satisfied.kind/field) into warning/issue strings was a log/console injection vector (a
 * declared table value containing ANSI escape codes rendered a forged "PASS" line in this gate's
 * own console output) and an unbounded-length persistence risk. Fixed with safeLabel(), which
 * JSON-stringifies and truncates every interpolated declaration field.
 *
 * ALSO FIXED: the entire declaration is snapshotted via a JSON round-trip (snapshotDeclaration())
 * the moment it is read from ctx.sd, before validateDeclaration() or the query builder touch it a
 * second time — closes a theoretical TOCTOU window where a getter-backed property could answer
 * differently between the validation read and the query read (unreachable today, since a real
 * declaration is always plain JSON off a jsonb column, but a JSON round-trip is also the correct
 * definition of "what this gate is willing to trust" regardless).
 *
 * KNOWN, DEFERRED (documented, not silently dropped — do not "fix" without a dedicated SD):
 *   (a) `match` is not scoped to the declaring SD's own venture_id/sd_id. A declaration can name
 *       any row on an allowlisted table system-wide (e.g. `venture_artifacts` matched only on
 *       `is_current:true` resolved across all ventures). Zero live impact today (0/6,141 SDs
 *       declare the pointer at all), but this MUST be closed (require the match to include the
 *       declaring SD's own identity, or a server-side join) before ACCEPTANCE_ARTIFACT_GATE_BINDING
 *       is ever flipped, or a declaration on one SD could read/leak facts about an unrelated one.
 *   (b) hasProvenance() is a PRESENCE check (non-null source / a present evidence_hash), not a
 *       PRODUCER-INDEPENDENCE check — it does not verify the evidence was authored by a party
 *       other than the one being gated, and does not verify a hash against content. Do not read
 *       ARTIFACT_PROVENANCE_ABSENT as satisfying the chairman-ratified gate-evidence-provenance
 *       rule; it does not, by design, for tables that structurally cannot carry that contract (see
 *       the PROVENANCE section above). A stronger provenance model for these tables is future work.
 */

import { REASON_CODES, parseSelfReportedVerdict } from '../../../../../../lib/eva/reality-gates.js';

const GATE_NAME = 'GATE_ACCEPTANCE_ARTIFACT';

// Own reason code — distinct from evidence-provenance.js's SUBAGENT_EVIDENCE_PROVENANCE_ABSENT,
// which names the four-field sub_agent_execution_results contract this gate does not use.
const ARTIFACT_PROVENANCE_ABSENT = 'ARTIFACT_PROVENANCE_ABSENT';
const DECLARATION_INVALID = 'DECLARATION_INVALID';

// deepFreeze so the nested arrays (matchColumns, selectColumns, and the per-kind field lists)
// can never be mutated at runtime -- a shallow Object.freeze only locks the top-level table
// keys, leaving e.g. TABLE_CONFIG.venture_artifacts.matchColumns.push(...) silently legal.
function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(obj);
}

// TESTING (EXEC-TO-PLAN review, kind/field pairing gap): a flat per-table `satisfiedFields`
// list let a declaration pair `numeric_threshold` with a text column (e.g. uat_test_runs.status)
// or `self_reported_verdict` with a numeric column (venture_artifacts.quality_score) -- valid
// per validateDeclaration, but never satisfiable by any real row. Once BINDING is ever flipped,
// that is a hard block for what is actually a declaration TYPE error, reported as
// ARTIFACT_UNSATISFIED ("the criterion is unmet") -- directly contradicting this gate's own
// stated principle that a malformed declaration is never evidence of an unmet criterion.
// satisfiedFieldsByKind closes this: the allowlist is now keyed by {kind: [fields]}, so a
// numeric_threshold declaration can only ever name a genuinely numeric column and vice versa.
const TABLE_CONFIG = deepFreeze({
  venture_artifacts: {
    selectColumns: ['id', 'venture_id', 'artifact_type', 'is_current', 'source', 'content', 'quality_score', 'created_at'],
    matchColumns: ['id', 'venture_id', 'artifact_type', 'is_current'],
    satisfiedFieldsByKind: {
      self_reported_verdict: ['content'],
      numeric_threshold: ['quality_score'],
    },
    hasProvenance: (row) => row?.source != null,
  },
  uat_test_runs: {
    selectColumns: ['id', 'sd_id', 'status', 'pass_rate', 'metadata', 'created_at'],
    matchColumns: ['id', 'sd_id', 'status'],
    satisfiedFieldsByKind: {
      numeric_threshold: ['pass_rate'],
    },
    hasProvenance: (row) => row?.metadata?.evidence_hash != null,
  },
});

const NUMERIC_OPS = Object.freeze({
  gte: (a, b) => a >= b,
  gt: (a, b) => a > b,
  lte: (a, b) => a <= b,
  lt: (a, b) => a < b,
  eq: (a, b) => a === b,
});

// TESTING (EXEC-TO-PLAN review): a raw `err.message` throws when `err` is not an object with a
// message (a rejected promise or thrown value need not be an Error -- `throw null`/`throw "x"`
// are both legal JS). Never let extracting an error message become a second, masking error.
function errorMessage(err) {
  return err && typeof err === 'object' && typeof err.message === 'string' ? err.message : String(err);
}

// SECURITY (EXEC-TO-PLAN review, SEC-3): an operator-controlled declaration field (table, a
// match/order_by column name, satisfied.kind/field) used to be interpolated RAW into
// warnings/issues strings that reach console output and sd_phase_handoffs. A declared value
// containing ANSI escape codes rendered a forged "PASS" line in this gate's own console output;
// an unbounded-length value would persist without limit. safeLabel() JSON-stringifies (escapes
// control characters, quotes the value unambiguously) and truncates every such interpolation.
function safeLabel(value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

// SECURITY (EXEC-TO-PLAN review, SEC-6): a getter-backed property on `match` (or elsewhere in
// the declaration) could in principle answer differently between validateDeclaration's read and
// the query builder's read -- unreachable today (a real declaration is always plain JSON off a
// jsonb column) but a JSON round-trip is also the correct definition of "what this gate trusts":
// only plain data that would survive a genuine DB round-trip, never a live object with behavior.
// Returns null (never throws) for a declaration that cannot be serialized at all.
function snapshotDeclaration(declaration) {
  try {
    return JSON.parse(JSON.stringify(declaration));
  } catch {
    return null;
  }
}

// TESTING (PLAN-TO-EXEC review, F1/F2): a plain-object `[key]` lookup resolves inherited
// Object.prototype members ('constructor', 'toString', '__proto__', 'hasOwnProperty',
// 'valueOf') as truthy even though they are not real entries — a declared table:'constructor'
// or satisfied.op:'constructor' would silently resolve to a live built-in and either bypass
// validation or throw a TypeError past the try/catch (converting a typo into a hard block that
// violates this gate's own OBSERVE-ONLY-by-default promise). ownLookup() closes both: it never
// resolves anything but the object's OWN enumerable keys, and returns undefined (not a throw)
// for anything else, including non-string keys.
function ownLookup(obj, key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

export function isBindingEnabled(env = process.env) {
  return env.ACCEPTANCE_ARTIFACT_GATE_BINDING === 'true';
}

/**
 * Validate an SD's metadata.acceptance_artifact declaration shape against the allowlists.
 * Pure — no I/O. Returns { valid: true } or { valid: false, reason: string }.
 */
export function validateDeclaration(declaration) {
  if (!declaration || typeof declaration !== 'object') return { valid: false, reason: 'not an object' };
  const { table, match, order_by: orderBy, satisfied } = declaration;

  const tableConfig = ownLookup(TABLE_CONFIG, table);
  if (!tableConfig) return { valid: false, reason: `table ${safeLabel(table)} is not in the allowlist (${Object.keys(TABLE_CONFIG).join(', ')})` };

  if (!match || typeof match !== 'object' || Array.isArray(match) || Object.keys(match).length === 0) {
    return { valid: false, reason: 'match must be a non-empty object' };
  }
  for (const [col, val] of Object.entries(match)) {
    if (!tableConfig.matchColumns.includes(col)) return { valid: false, reason: `match column ${safeLabel(col)} is not allowlisted for ${table}` };
    // F4: null is deliberately NOT accepted as a scalar -- PostgREST's `.match()` serializes a
    // value as `eq.<value>`, which can never match a genuine SQL NULL (that needs `is.null`), so
    // a null match value can only ever resolve zero rows and silently manufacture a false
    // ARTIFACT_MISSING once bound. No declaration needs it: every real declaration names a
    // concrete value.
    if (!['string', 'number', 'boolean'].includes(typeof val)) return { valid: false, reason: `match.${col} must be a non-null scalar value` };
  }

  if (orderBy !== undefined) {
    if (!orderBy || typeof orderBy !== 'object' || typeof orderBy.column !== 'string') return { valid: false, reason: 'order_by.column must be a string' };
    if (!tableConfig.selectColumns.includes(orderBy.column)) return { valid: false, reason: `order_by.column ${safeLabel(orderBy.column)} is not selectable for ${table}` };
    // F3: `desc` must be explicit when order_by is provided at all -- an omitted `desc` used to
    // silently mean "ascending" (oldest row) instead of the documented "most recent" default,
    // and a truthy non-boolean ('false' the string) would have selected the wrong direction too.
    if (typeof orderBy.desc !== 'boolean') return { valid: false, reason: 'order_by.desc must be a boolean when order_by is provided' };
  }

  if (!satisfied || typeof satisfied !== 'object') return { valid: false, reason: 'satisfied must be an object' };
  if (!['self_reported_verdict', 'numeric_threshold', 'row_exists'].includes(satisfied.kind)) {
    return { valid: false, reason: `satisfied.kind ${safeLabel(satisfied.kind)} is not one of self_reported_verdict|numeric_threshold|row_exists` };
  }
  if (satisfied.kind !== 'row_exists') {
    // satisfied.kind is, by this point, guaranteed to be one of the 3 literal enum strings
    // above (never attacker-arbitrary), so a direct property lookup here carries none of
    // ownLookup's prototype-pollution risk -- none of the 3 collide with Object.prototype.
    const allowedFields = tableConfig.satisfiedFieldsByKind[satisfied.kind] || [];
    if (!allowedFields.includes(satisfied.field)) {
      return { valid: false, reason: `satisfied.field ${safeLabel(satisfied.field)} is not allowlisted for satisfied.kind="${satisfied.kind}" on ${table} (allowed: ${allowedFields.join(', ') || 'none'})` };
    }
  }
  if (satisfied.kind === 'numeric_threshold') {
    if (!ownLookup(NUMERIC_OPS, satisfied.op)) return { valid: false, reason: `satisfied.op ${safeLabel(satisfied.op)} is not one of ${Object.keys(NUMERIC_OPS).join(', ')}` };
    if (typeof satisfied.value !== 'number') return { valid: false, reason: 'satisfied.value must be a number for numeric_threshold' };
  }

  return { valid: true };
}

/**
 * Evaluate satisfied.kind against a resolved row. Pure — no I/O.
 * @returns {{satisfied: boolean, detail?: string}}
 */
export function evaluateSatisfied(row, satisfied) {
  if (satisfied.kind === 'row_exists') return { satisfied: true };

  if (satisfied.kind === 'self_reported_verdict') {
    const verdict = parseSelfReportedVerdict(row[satisfied.field]);
    // Mirrors reality-gates.js's own refusal predicate exactly: refuse only when there IS a
    // parseable verdict that applies and reports itself unsatisfied. No verdict at all, or an
    // explicit applies:false, is not evidence of an unmet criterion.
    const unsatisfied = verdict.hasVerdict && verdict.applies !== false && verdict.satisfied !== true;
    return { satisfied: !unsatisfied, detail: JSON.stringify(verdict) };
  }

  // numeric_threshold
  const raw = row[satisfied.field];
  if (typeof raw !== 'number') return { satisfied: false, detail: `field "${satisfied.field}" is not numeric on the resolved row` };
  const op = ownLookup(NUMERIC_OPS, satisfied.op);
  // SECURITY (EXEC-TO-PLAN review, SEC-1): never echo the RESOLVED value -- uat_test_runs has no
  // anon/authenticated SELECT policy at all, so surfacing its actual column value into a warning
  // (readable by anyone who can view this SD, even in observe-only mode) is a service-role-backed
  // read oracle over a table the caller could not otherwise query at all. The operator-supplied
  // threshold (satisfied.value) is not secret -- it's the declaration itself -- so naming that
  // is fine; the row's own value is not.
  return { satisfied: op(raw, satisfied.value), detail: `${satisfied.op} ${satisfied.value}: not satisfied` };
}

function passResult(warnings = [], details = {}) {
  return { passed: true, score: 100, max_score: 100, issues: [], warnings, details };
}

function refuseResult(message, reasonCode, details, bound) {
  if (!bound) return passResult([message], { ...details, reason_code: reasonCode, bound: false });
  return { passed: false, score: 0, max_score: 100, issues: [message], warnings: [], details: { ...details, reason_code: reasonCode, bound: true } };
}

/**
 * Create the acceptance-artifact gate.
 * @param {Object} supabase
 * @returns {Object} Gate configuration
 */
export function createAcceptanceArtifactGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n📎 GATE: Acceptance-Artifact');
      console.log('-'.repeat(50));

      const rawDeclaration = ctx?.sd?.metadata?.acceptance_artifact;
      if (!rawDeclaration) {
        console.log('   ℹ️  No metadata.acceptance_artifact declared — gate not applicable');
        return passResult([], { declared: false });
      }

      // SECURITY (EXEC-TO-PLAN review, SEC-6): snapshot via a JSON round-trip BEFORE validation
      // or query-building ever reads it, so a getter-backed property cannot answer differently
      // between the two reads. A declaration that cannot even be serialized is DECLARATION_INVALID.
      const declaration = snapshotDeclaration(rawDeclaration);
      if (!declaration) {
        console.log('   ⚠️  metadata.acceptance_artifact could not be serialized — treating as not evaluable');
        return passResult(['Acceptance-artifact declaration could not be serialized to plain JSON — a malformed declaration is not evidence of an unmet criterion.'], { declared: true, reason_code: DECLARATION_INVALID });
      }

      // TESTING (PLAN-TO-EXEC review, F2): the whole body below — not just the DB query — is
      // wrapped so ANY unexpected exception (defense in depth beyond ownLookup() above, which
      // already closes the specific prototype-lookup path that could throw) fails open rather
      // than escaping to ValidationOrchestrator and converting a typo'd declaration into a hard
      // block regardless of the BINDING flag. That would violate this gate's own core promise.
      try {
        const check = validateDeclaration(declaration);
        if (!check.valid) {
          console.log(`   ⚠️  Invalid acceptance_artifact declaration (${check.reason}) — treating as not evaluable`);
          return passResult([`Acceptance-artifact declaration is invalid (${check.reason}) — a malformed declaration is not evidence of an unmet criterion.`], { declared: true, reason_code: DECLARATION_INVALID });
        }

        const { table, match, order_by: orderBy, satisfied } = declaration;
        const tableConfig = ownLookup(TABLE_CONFIG, table);
        const bound = isBindingEnabled();

        let rows;
        try {
          let query = supabase.from(table).select(tableConfig.selectColumns.join(',')).match(match);
          const effectiveOrderBy = orderBy || { column: 'created_at', desc: true };
          query = query.order(effectiveOrderBy.column, { ascending: !effectiveOrderBy.desc }).limit(1);
          const { data, error } = await query;
          if (error) throw new Error(errorMessage(error));
          rows = data || [];
        } catch (err) {
          const msg = errorMessage(err);
          console.log(`   ⚠️  Acceptance-artifact lookup error (failing open): ${msg}`);
          return passResult([`Acceptance-artifact check skipped — lookup failed: ${msg}`], { declared: true, reason_code: 'DB_ERROR' });
        }

        if (rows.length === 0) {
          const message = `${GATE_NAME}: declared pointer (table=${table}, match=${safeLabel(match)}) resolved to zero rows.`;
          console.log(bound ? `   ❌ ${message}` : `   ⚠️  ${message} (observe-only)`);
          return refuseResult(message, REASON_CODES.ARTIFACT_MISSING, { declared: true, table }, bound);
        }

        const row = rows[0];
        if (!tableConfig.hasProvenance(row)) {
          const message = `${GATE_NAME}: resolved row ${table}#${row.id} lacks the minimum provenance field required for this table.`;
          console.log(bound ? `   ❌ ${message}` : `   ⚠️  ${message} (observe-only)`);
          return refuseResult(message, ARTIFACT_PROVENANCE_ABSENT, { declared: true, table, row_id: row.id }, bound);
        }

        const evaluation = evaluateSatisfied(row, satisfied);
        if (!evaluation.satisfied) {
          const message = `${GATE_NAME}: resolved row ${table}#${row.id} does not satisfy the declared criterion (${satisfied.kind}${evaluation.detail ? `: ${evaluation.detail}` : ''}).`;
          console.log(bound ? `   ❌ ${message}` : `   ⚠️  ${message} (observe-only)`);
          return refuseResult(message, REASON_CODES.ARTIFACT_UNSATISFIED, { declared: true, table, row_id: row.id }, bound);
        }

        console.log(`   ✅ Acceptance artifact ${table}#${row.id} satisfies the declared criterion.`);
        return passResult([], { declared: true, table, row_id: row.id, bound });
      } catch (err) {
        // TESTING (EXEC-TO-PLAN review): a distinct code from the inner catch's 'DB_ERROR' --
        // this branch means something OTHER than the DB query itself failed (a gate-code bug, a
        // malformed row shape, etc). Conflating the two under one label made a genuine connection
        // error indistinguishable from a real defect in this gate's own code.
        const msg = errorMessage(err);
        console.log(`   ⚠️  Unexpected error evaluating acceptance_artifact (failing open): ${msg}`);
        return passResult([`Acceptance-artifact check skipped — unexpected error: ${msg}`], { declared: true, reason_code: 'UNEXPECTED_ERROR' });
      }
    },
    required: true,
    remediation:
      'Declare metadata.acceptance_artifact as {table, match, satisfied} pointing at the real evidence row for this SD\'s completion criterion, or ensure the resolved row genuinely satisfies it. Observe-only by default -- set ACCEPTANCE_ARTIFACT_GATE_BINDING=true to make this blocking.',
  };
}
