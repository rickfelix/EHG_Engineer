/**
 * Pre-PLAN Adversarial Critique Gate for LEAD-TO-PLAN
 * SD: SD-LEO-INFRA-PRE-PLAN-ADVERSARIAL-001 (Phase 1, advisory)
 * SD: SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (promotion to verdict-bearing)
 *
 * VERDICT-BEARING. Measured basis for the promotion: plan_critiques held 217 rows,
 * 213 of them BLOCK severity, and not one ever blocked a handoff — an adversarial
 * critic whose findings are structurally ignorable is indistinguishable from none.
 *
 * - 'block' fails the gate UNLESS an audited override exists on the most recent
 *   blocking plan_critiques row (override_reason + override_by, the columns that have
 *   existed since the table was created). Override DOWNGRADES (gate passes at reduced
 *   score, override cited in output) — it never silences (the block row and findings
 *   remain persisted).
 * - Every could-not-run outcome reports COULD_NOT_CHECK (FR-3), passes degraded (score
 *   50) with a loud warning, and is persisted so the catch-rate monitor can separate
 *   checked-clean from could-not-check (FR-4). Blocking every handoff on a missing LLM
 *   key would be a fleet outage; hiding the blindness would be worse. This is the
 *   documented middle: degraded pass, never silent pass.
 * - The codified invariant library (FR-2) runs alongside the LLM pass and still runs
 *   when the LLM cannot.
 * - Output reports COVERAGE, never completeness (FR-3): what was checked, and that
 *   novel gap-classes require tier-2/human review.
 */

import crypto from 'node:crypto';
import { critiquePlanProposal, COULD_NOT_CHECK } from '../../../../../../lib/eva/devils-advocate.js';
import { runInvariantChecks } from '../../../../../../lib/eva/invariant-library.js';

const MAX_FINDING_PREVIEW = 3;
const OVERRIDE_LOOKBACK_DAYS = 14;
const SEVERITY_RANK = { block: 3, warn: 2, note: 1, pass: 0 };
const SCORE_BY_OUTCOME = {
  pass: 100,
  note: 90,
  warn: 75,
  [COULD_NOT_CHECK]: 50,
  block_overridden: 60,
  block: 0,
};

/**
 * Run pre-PLAN critique (LLM + invariant library) against the SD's PRD and arch plan.
 *
 * @param {Object} ctx - Gate context with sd, supabase, etc.
 * @returns {Promise<Object>} Gate result (verdict-bearing)
 */
export async function validatePrePlanCritique(ctx) {
  const { sd, supabase } = ctx;
  const warnings = [];

  if (!sd || !sd.id) {
    // Nothing to critique is NOT_APPLICABLE — distinct from checked-clean and from
    // could-not-check. Missing context is a caller defect; say so and do not block.
    return notApplicable(['SD context missing — nothing to critique (NOT_APPLICABLE, not checked-clean)']);
  }

  let prdContent = '';
  let prdSections = null;
  let archContent = '';
  let prdId = null;

  // Load PRD content. No PRD at LEAD-TO-PLAN is the normal state for a fresh SD (the
  // PRD is created during PLAN) — NOT_APPLICABLE, never a failure, never checked-clean.
  // ABSENCE ≠ READ FAILURE: .single() errors on outages and RLS faults too, and mapping
  // those to NOT_APPLICABLE at score 100 is a could-not-check outcome wearing
  // not-applicable's clothes (adversarial ship review, PR #6927). PGRST116 is the
  // zero-rows code — only that is genuine absence.
  try {
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('id, executive_summary, functional_requirements, system_architecture, acceptance_criteria, test_scenarios, implementation_approach, risks')
      .eq('sd_id', sd.id)
      .single();
    if (error && error.code !== 'PGRST116') {
      return couldNotCheckVerdict([`PRD read FAILED (${error.code || '?'}: ${error.message}) — COULD_NOT_CHECK, not absence: nothing was critiqued and nothing could persist`]);
    }
    if (!prd) {
      return notApplicable([`No PRD exists yet for SD ${sd.sd_key || sd.id} — critique NOT_APPLICABLE (a fresh SD gets its PRD in PLAN)`]);
    }
    prdId = prd.id;
    prdSections = {
      executive_summary: prd.executive_summary,
      functional_requirements: prd.functional_requirements,
      acceptance_criteria: prd.acceptance_criteria,
      test_scenarios: prd.test_scenarios,
      risks: prd.risks,
    };
    // Flat string kept for runInvariantChecks (unchanged, out of this SD's scope) — the
    // structured prdSections object below is what enables FR-2 section-aware budgeting.
    prdContent = JSON.stringify(prdSections);
  } catch (err) {
    return couldNotCheckVerdict([`PRD load threw (${err.message}) — COULD_NOT_CHECK, not absence`]);
  }

  // Load architecture plan content (best effort — not required).
  // FR-4 PT-8: archLoadStatus distinguishes a genuine "no arch plan" state ('not_found' — no
  // arch_key configured, or PGRST116 zero-rows) from a transient read failure ('load_failed' —
  // any other error, or a thrown exception). Both leave archContent='', but only 'ok' content_hash
  // inputs should be treated as equivalent to each other; a flake must never hash the same as a
  // real, examined absence, or a transient failure could force an unwanted cache miss / silently
  // invalidate a fresh override binding for a reason unrelated to the actual PRD/arch content.
  let archLoadStatus = 'not_found';
  try {
    const archKey = sd.metadata?.arch_key;
    if (archKey) {
      const { data: arch, error: archError } = await supabase
        .from('eva_architecture_plans')
        .select('content')
        .eq('plan_key', archKey)
        .single();
      if (archError) {
        archLoadStatus = archError.code === 'PGRST116' ? 'not_found' : 'load_failed';
      } else if (arch?.content) {
        archContent = arch.content;
        archLoadStatus = 'ok';
      }
    }
  } catch {
    archLoadStatus = 'load_failed';
  }

  // FR-2: invariant library — deterministic, runs even when the LLM half cannot.
  const invariant = runInvariantChecks({ prdContent, archContent });

  // LLM adversarial critique. All its could-not-run paths return COULD_NOT_CHECK (FR-3);
  // a throw here is the same outcome, reported the same way.
  let critique;
  try {
    critique = await critiquePlanProposal({
      // FR-2: the structured object (not the pre-stringified prdContent above) so
      // buildCritiqueUserPrompt can apply section-aware budgets instead of one flat cut.
      prdContent: prdSections,
      archContent,
      archLoadStatus, // FR-4 PT-8: folded into content_hash so a flake never hashes like absence
      sdContext: { sd_key: sd.sd_key, sd_id: sd.id, title: sd.title },
    }, { supabase });
  } catch (err) {
    critique = { findings: [], overall_severity: COULD_NOT_CHECK, model_used: null, token_usage: null, fallback_reason: `Critique invocation error: ${err.message}`, truncated: null };
  }

  const llmBlind = critique.overall_severity === COULD_NOT_CHECK;
  const findings = [...(critique.findings || []), ...invariant.findings];

  // Combined severity. SEEDED FROM THE LLM'S OWN VERDICT, never re-derived from findings
  // alone: the adversarial ship review (PR #6927) showed that deriving purely from
  // per-finding severities let {findings: [], overall_severity: 'block'} score 100 and
  // persist as 'pass' — a blocking verdict silently converted to checked-clean, the exact
  // class this SD removes. Findings can raise the seed, never lower it.
  const llmOverall = String(critique.overall_severity || '').toLowerCase();
  let combined = llmOverall in SEVERITY_RANK ? llmOverall : 'pass';
  for (const f of findings) {
    const raw = String(f.severity || 'note').toLowerCase();
    // Off-vocabulary severities ('critical', 'high', …) must not rank BELOW pass by
    // falling out of the table — map unknowns conservatively to 'warn'.
    const s = raw in SEVERITY_RANK ? raw : 'warn';
    if (SEVERITY_RANK[s] > SEVERITY_RANK[combined]) combined = s;
  }
  // could_not_check survives as the outcome ONLY when the LLM was blind AND no finding
  // exists — "found nothing" from a half-blind instrument is not checked-clean.
  if (findings.length === 0 && llmBlind) combined = COULD_NOT_CHECK;

  // FR-3: COVERAGE line, never completeness.
  const coverage = llmBlind
    ? `COVERAGE: invariant classes [${invariant.checked_classes.join(', ')}] checked; LLM adversarial critique COULD_NOT_CHECK (${critique.fallback_reason}). Novel gap-classes require tier-2/human review.`
    : `COVERAGE: LLM adversarial critique (${critique.model_used || 'unknown model'}) + invariant classes [${invariant.checked_classes.join(', ')}] checked. No claim of completeness — novel gap-classes require tier-2/human review.`;
  console.log(`   ${coverage}`);
  warnings.push(coverage);

  // FR-1: loud, never silent — same warnings-array style as COVERAGE, same "read N/M chars"
  // wording as vision-score.js's truncationWarning (AC-3 — reused convention, not a new dialect).
  const prdWasTruncated = critique.truncated?.prd?.truncated;
  const archWasTruncated = critique.truncated?.arch?.truncated;
  if (prdWasTruncated || archWasTruncated) {
    const parts = [];
    if (prdWasTruncated) parts.push(`prd ${critique.truncated.prd.charsRead}/${critique.truncated.prd.charsTotal}`);
    if (archWasTruncated) parts.push(`arch ${critique.truncated.arch.charsRead}/${critique.truncated.arch.charsTotal}`);
    const truncMsg = `Input truncated before critique — findings may not reflect the full PRD/arch (${parts.join(', ')})`;
    console.log(`   ⚠️  ${truncMsg}`);
    warnings.push(truncMsg);
  }

  // Surface findings inline
  console.log(`   Critique severity: ${combined.toUpperCase()} (${findings.length} finding${findings.length === 1 ? '' : 's'})`);
  findings.slice(0, MAX_FINDING_PREVIEW).forEach((f) => {
    console.log(`   [${(f.severity || 'note').toUpperCase()}] ${f.location || '?'}: ${(f.message || '').substring(0, 120)}`);
    warnings.push(`[${(f.severity || 'note').toUpperCase()}] ${f.location || '?'}: ${(f.message || '').substring(0, 200)}`);
  });
  if (findings.length > MAX_FINDING_PREVIEW) {
    console.log(`   ... and ${findings.length - MAX_FINDING_PREVIEW} more (see plan_critiques table)`);
  }

  // FR-1 AC-4/AC-5: metadata.truncated.prd/arch are literal booleans (not the richer internal
  // {truncated, charsRead, charsTotal} shape) so a direct `metadata.truncated.prd === true/false`
  // read matches the AC's own wording; shown/total travel as separate, side-qualified keys so an
  // independent prd-only or arch-only truncation is never ambiguous about which side they describe.
  // Undefined (not present) when critique.truncated is null — a could-not-check path that failed
  // before the prompt was ever built (see couldNotCheckResult's tri-state contract) has nothing
  // honest to report here; omitting the key is the not-measured state, never a fabricated false.
  const truncatedMetadata = critique.truncated ? {
    prd: critique.truncated.prd.truncated,
    arch: critique.truncated.arch.truncated,
    shownPrd: critique.truncated.prd.charsRead,
    totalPrd: critique.truncated.prd.charsTotal,
    shownArch: critique.truncated.arch.charsRead,
    totalArch: critique.truncated.arch.charsTotal,
  } : undefined;

  // FR-4 AC-5/PT-1: a cache hit STILL inserts a row (never a bare early-return), flagged
  // cache-derived so scripts/critique-catch-rate-monitor.js's ratios stay computed over a
  // complete, honest row set instead of going blind to hit runs.
  const cacheMetadata = critique.cacheHit ? { cache_hit: true, cache_source_id: critique.cacheSourceId } : undefined;
  const metadata = (truncatedMetadata || cacheMetadata)
    ? { ...(truncatedMetadata ? { truncated: truncatedMetadata } : {}), ...cacheMetadata }
    : undefined;

  // FR-4 (of the ORIGINAL SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001, a different, already-
  // shipped SD — not this SD's own FR-4): persist BEFORE deriving the verdict, on EVERY path that
  // has a PRD — including could_not_check. The old code returned from skip/fail paths before
  // persisting, which is exactly why plan_critiques could not distinguish never-ran from ran-clean.
  await persistCritique(supabase, {
    sd_id: sd.id,
    prd_id: prdId,
    findings,
    overall_severity: combined,
    model_used: critique.model_used,
    token_usage: critique.token_usage,
    content_hash: critique.contentHash ?? null,
    ...(metadata ? { metadata } : {}),
  }, warnings);

  // FR-1: verdict. 'block' fails unless an audited override exists FOR THIS EXACT CONTENT
  // (FR-4/FR-5 — content_hash REPLACES findingsFingerprint as the binding predicate; see
  // findActiveOverride's own docstring for why).
  if (combined === 'block') {
    const override = await findActiveOverride(supabase, sd.id, critique.contentHash);
    if (override) {
      const msg = `BLOCK downgraded by audited override: ${override.override_by} — "${override.override_reason}" (critique ${override.id}, ${override.created_at})`;
      console.log(`   ⚠️  ${msg}`);
      warnings.push(msg);
      return {
        pass: true,
        score: SCORE_BY_OUTCOME.block_overridden,
        max_score: 100,
        issues: [],
        warnings,
      };
    }
    return {
      pass: false,
      score: SCORE_BY_OUTCOME.block,
      max_score: 100,
      issues: [
        `Adversarial critique found BLOCK-severity planning gaps (${findings.length} finding(s)). ` +
        'Fix the plan, or record an audited override on the blocking plan_critiques row via ' +
        '`node scripts/critique-override.js <SD-KEY> --by <who> --reason "<why>"` — the override ' +
        'binds to this exact findings set (a changed set re-blocks) and downgrades rather than ' +
        'deletes the findings.',
      ],
      warnings,
    };
  }

  return {
    pass: true,
    score: SCORE_BY_OUTCOME[combined] ?? 75,
    max_score: 100,
    issues: [],
    warnings,
  };
}

// FR-6: PostgREST's schema-cache-miss code (unknown column on INSERT) and Postgres's own
// "column does not exist" code — both confirmed live against this exact table (2026-08-16,
// pre-migration): SELECT of a missing column returns 42703; INSERT including one returns
// PGRST204. Either means the writer shipped ahead of its migration, not a data problem.
const SCHEMA_MISSING_CODES = new Set(['PGRST204', '42703']);

/**
 * Persist the critique row.
 *
 * FR-6 (testing-agent PT-3, BLOCKING, live-demonstrated during this SD's own LEAD-phase evidence
 * write): a schema-missing error (metadata/content_hash not yet migrated — SCHEMA_MISSING_CODES)
 * gets its own loud, NAMED branch, distinct from a generic insert failure. Before this fix, EVERY
 * non-23514 error — including "the writer shipped ahead of its migration" — fell into the same
 * generic 'plan_critiques insert failed' message; if FR-1/FR-4's writer merged before TR-3's
 * migration applied in production, persistence would silently stop entirely while the gate kept
 * passing, and scripts/critique-catch-rate-monitor.js would read zero runs as zero runs, not as
 * blind runs — worse than the could_not_check state this table exists to distinguish.
 */
async function persistCritique(supabase, row, warnings) {
  try {
    const { error } = await supabase.from('plan_critiques').insert(row);
    if (error) {
      let msg;
      if (SCHEMA_MISSING_CODES.has(error.code)) {
        msg = `plan_critiques SCHEMA MISSING (${error.code}): ${error.message} — the writer shipped ahead of its migration (database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql). Outcome NOT persisted; the catch-rate monitor is blind to this run. Do not treat this as a generic insert failure — apply the migration.`;
      } else if (error.code === '23514') {
        msg = `plan_critiques CHECK constraint violation (${error.code}): ${error.message}. Outcome NOT persisted.`;
      } else {
        msg = `plan_critiques insert failed: ${error.message}`;
      }
      console.warn(`   ⚠️  ${msg}`);
      warnings.push(msg);
    }
  } catch (err) {
    console.warn(`   ⚠️  plan_critiques persist error: ${err.message}`);
    warnings.push(`Persistence error: ${err.message}`);
  }
}

/**
 * Stable fingerprint of a findings set: severity + category (+ invariant id) pairs,
 * sorted. Binds an override to the KIND of findings it excuses. Deliberately NOT keyed on
 * message text: LLM messages are re-worded on every run, so a message-keyed fingerprint
 * never matches twice and the override becomes structurally dead for LLM-originated
 * blocks (adversarial ship review, PR #6927) — trading "excuses too much" for "excuses
 * nothing". Category is enum-constrained on the LLM side and invariant_id is exact on the
 * library side, so a new KIND of block re-blocks while a re-worded same-kind block stays
 * excused.
 */
export function findingsFingerprint(findings) {
  const pairs = (findings || [])
    .map((f) => `${String(f.severity || '').toLowerCase()}::${String(f.category || '').toLowerCase()}::${String(f.invariant_id || '')}`)
    .sort();
  return crypto.createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

/**
 * Audited escape hatch. BINDING PREDICATE (FR-4/FR-5, testing-agent T1/T12 — resolves a real
 * contradiction with the original TR-2, see TR-2's rewrite): content_hash REPLACES
 * findingsFingerprint here — it does not AND with it. content-identity is a strictly stronger
 * binding signal than "these specific findings recurred": a human override is realistically
 * recorded minutes-to-days after a block (the scripts/critique-override.js timeline), well
 * outside any single-call caching window, and the LLM's findings composition is non-deterministic
 * even on byte-identical input — findingsFingerprint alone could never bind across that gap
 * (SECURITY MEDIUM-1, evidence row e77d1c4b, is what closing this gap must not reopen: an
 * override binds to WHAT WAS REVIEWED, never widening to excuse content it never saw). The
 * content_hash filter is applied via .eq() before .limit(10), so it narrows the candidate set
 * FIRST — FR-5's fix for the pre-existing burst-limit gap (SDs measured up to 17 critiques; a
 * matching override could fall outside a bare .limit(10) purely on row count, independent of
 * content).
 *
 * TR-5: a null/undefined currentContentHash returns null WITHOUT querying — never calls
 * .eq('content_hash', null). This is deliberately more conservative than relying on Postgres's
 * own NULL != NULL semantics (which already protects the other direction: a stored row with
 * content_hash IS NULL can never match a real hash value, and needs no special-casing here) —
 * an override should never bind to a could-not-check block whose content identity was never
 * measured in the first place.
 */
async function findActiveOverride(supabase, sdId, currentContentHash) {
  if (!currentContentHash) return null;
  try {
    const since = new Date(Date.now() - OVERRIDE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('plan_critiques')
      .select('id, content_hash, override_reason, override_by, created_at')
      .eq('sd_id', sdId)
      .eq('overall_severity', 'block')
      .eq('content_hash', currentContentHash)
      .not('override_reason', 'is', null)
      .not('override_by', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || !data || data.length === 0) return null;
    for (const row of data) {
      if (!String(row.override_reason).trim() || !String(row.override_by).trim()) continue;
      return row;
    }
    return null;
  } catch {
    // Fail-closed: an unreadable override table means NO override — the block stands.
    return null;
  }
}

function notApplicable(warnings = []) {
  return { pass: true, score: 100, max_score: 100, issues: [], warnings };
}

// A PRD read that FAILED is a could-not-check outcome: degraded pass (same score as the
// LLM-blind path), loud, and honest that nothing persisted (no prd_id exists to persist
// against — plan_critiques.prd_id is NOT NULL).
function couldNotCheckVerdict(warnings = []) {
  for (const w of warnings) console.warn(`   ⚠️  ${w}`);
  return { pass: true, score: SCORE_BY_OUTCOME[COULD_NOT_CHECK], max_score: 100, issues: [], warnings };
}

/**
 * Factory: create the Pre-PLAN Adversarial Critique Gate (verdict-bearing).
 */
export function createPrePlanCritiqueGate(supabase) {
  return {
    name: 'PRE_PLAN_ADVERSARIAL_CRITIQUE',
    validator: async (ctx) => {
      console.log('\n🎭 GATE: Pre-PLAN Adversarial Critique (Verdict-Bearing)');
      console.log('-'.repeat(50));
      return validatePrePlanCritique({ ...ctx, supabase: ctx.supabase || supabase });
    },
    required: true,
    weight: 1.0,
    remediation:
      'Review findings in plan_critiques. BLOCK severity fails this gate: fix the plan, or record ' +
      'an audited override (set override_reason + override_by on the blocking plan_critiques row) ' +
      'to downgrade — findings persist either way. COULD_NOT_CHECK passes degraded (score 50), ' +
      'never silently.',
  };
}
