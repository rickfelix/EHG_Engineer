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
import { critiquePlanProposal, COULD_NOT_CHECK, computeContentHash, buildCritiqueUserPrompt } from '../../../../../../lib/eva/devils-advocate.js';
import { runInvariantChecks } from '../../../../../../lib/eva/invariant-library.js';
import { getOpenAIModel } from '../../../../../../lib/config/model-config.js';

const MAX_FINDING_PREVIEW = 3;
const OVERRIDE_LOOKBACK_DAYS = 14;
const SEVERITY_RANK = { block: 3, warn: 2, note: 1, pass: 0 };

// SD-LEO-INFRA-CRITIQUE-GATE-NON-001.
//
// HARD CONSTRAINT (Solomon, accepted by Adam, carried by the coordinator's review-clear — see
// this SD's metadata.success_criterion): the success criterion is DISCRIMINATION — a known-good
// plan PASSES, a known-bad plan BLOCKS — NEVER the pass rate. "Re-thresholding a never-passing
// gate until it passes" is early-return trigger (iii) of ratification 09f14b64 (criteria changed
// so a number improves without outcome improvement). The measured background below explains WHY a
// fix was needed; it is NOT what proves this fix correct — see the golden-corpus discrimination
// tests in pre-plan-critique.test.js (a real, independently-verified-clean SD's PRD run LIVE
// through this exact code stays 'warn'; a PRD modeled on a real cited incident
// (lib/eva/invariant-library.js INV-002) still reaches 'block') for that proof.
//
// MEASURED BACKGROUND: plan_critiques (373 rows, 2026-04-07..2026-09-03) had 0 PASS verdicts ever
// recorded — 358 block (96%), 15 warn (4%). Of a 50-row sample of block verdicts, 43 (86%) carried
// exactly ONE block-severity finding, and 49 of the 56 block-severity findings across that sample
// (87.5%) were category 'missing_criteria' — a category the LLM's OWN rubric defined as
// addressable by PLAN/EXEC (add the missing criterion), not a genuine escalation. Pure
// max()-over-findings aggregation meant any single low-stakes finding force-blocked the whole
// handoff, which was structurally guaranteed on real PRDs (an adversarial critic asked to "pick
// the most consequential findings" on 5+ months of real plans essentially always found SOMETHING
// to call missing_criteria).
//
// SUFFICIENCY_THRESHOLD + HIGH_AUTHORITY_CATEGORIES implement "sufficiency threshold" +
// "anchor block-severity to decision-authority cost" from this SD's own scope: a block-severity
// finding counts toward the gate's combined verdict only if (a) it is in a category that
// plausibly requires authority beyond PLAN/EXEC to resolve unilaterally (a genuine contradiction
// between two SD-spine claims, or a missing rollback plan for an irreversible/destructive
// operation), or (b) there are at least SUFFICIENCY_THRESHOLD independent block-severity findings
// (cross-cutting evidence of genuine incompleteness, not one reviewer's single nitpick). This
// mirrors the invariant library's own already-established design philosophy one file over
// (lib/eva/invariant-library.js: "only a check that PROVES untestability may block, and regexes
// prove nothing") — applying the same discipline to the LLM half of the critic, which never had it.
// The LLM's own system prompt (lib/eva/devils-advocate.js) was independently rewritten with the
// same decision-authority anchoring, so the discipline applies at BOTH the source and the
// aggregator (defense in depth, not redundant — either half fixed alone still leaves a gap).
//
// DOES NOT touch the PR #6927 anti-laundering fix ("verdict cannot be laundered through findings
// shape" — a block verdict with EMPTY findings must never downgrade): this downgrade applies
// ONLY when findings.length > 0 — an unbacked block claim (no findings listed at all) is a
// DIFFERENT, more suspicious shape than a backed-but-insufficient one, and stays fail-closed.
const SUFFICIENCY_THRESHOLD = 2;
// TESTING sub-agent prospective finding (MUST-FIX #1/#2): this was originally a
// HIGH_AUTHORITY_CATEGORIES *allowlist* deciding which categories are eligible to block —
// fail-OPEN, because anything not on the list (a deterministic invariant's own 'invariant'
// category if it ever emits block severity, an off-vocabulary/missing/malformed category, or the
// LLM's own 'other' catch-all) silently downgraded. Flipped to a LOW_AUTHORITY_CATEGORIES
// *denylist*: only a finding whose category is explicitly one PLAN/EXEC can resolve unilaterally
// downgrades; anything else — including 'invariant', 'other', or a missing/malformed value —
// stays block-eligible by default (fail-closed). The rewritten system prompt (devils-advocate.js)
// additionally instructs the LLM that a block-severity finding MUST be categorized
// 'contradiction' or 'missing_rollback', so 'other' on a genuine escalation is now a
// prompt-contract violation this gate treats conservatively, not silently discarded.
const LOW_AUTHORITY_CATEGORIES = new Set(['missing_criteria', 'scope_incoherence', 'reuse_opportunity']);

/**
 * Pure aggregation core (golden-corpus-testable without a DB or an LLM call): given the LLM's
 * self-reported overall_severity and the merged (LLM + invariant) findings list, derive the
 * gate's combined verdict severity. Findings can only RAISE the seeded severity (existing
 * PR #6927 invariant, preserved) EXCEPT for the new sufficiency-threshold downgrade, which is a
 * narrower, additional check applied only when block-severity findings are present but don't
 * meet the decision-authority/count bar.
 *
 * @param {Object} args
 * @param {string} args.llmOverall - The LLM's raw self-reported overall_severity (lowercased by caller)
 * @param {Array} args.findings - Merged LLM + invariant findings
 * @returns {string} combined severity: 'pass'|'note'|'warn'|'block'
 */
export function deriveCombinedSeverity({ llmOverall, findings = [] }) {
  // TESTING prospective finding (should-fix, robustness): findings elements are LLM/deterministic
  // output, never schema-validated upstream — a null/non-object element must not throw here.
  const safeFindings = Array.isArray(findings) ? findings.filter((f) => f && typeof f === 'object') : [];

  const seed = llmOverall in SEVERITY_RANK ? llmOverall : 'pass';
  let combined = seed;

  for (const f of safeFindings) {
    const raw = String(f.severity || 'note').trim().toLowerCase();
    // Off-vocabulary severities ('critical', 'high', …) must not rank BELOW pass by falling out
    // of the table — map unknowns conservatively to 'warn'.
    const s = raw in SEVERITY_RANK ? raw : 'warn';
    if (SEVERITY_RANK[s] > SEVERITY_RANK[combined]) combined = s;
  }

  if (combined === 'block' && safeFindings.length > 0) {
    const blockFindings = safeFindings.filter((f) => {
      const raw = String(f.severity || 'note').trim().toLowerCase();
      return (raw in SEVERITY_RANK ? raw : 'warn') === 'block';
    });
    // Deny-by-default: a block finding downgrades ONLY when EVERY one of its co-occurring block
    // findings is explicitly low-authority. A single high-authority (or unrecognized-category)
    // block finding among several keeps the whole verdict at block.
    const allLowAuthority = blockFindings.length > 0
      && blockFindings.every((f) => LOW_AUTHORITY_CATEGORIES.has(String(f.category || '').trim().toLowerCase()));
    // TESTING prospective finding (should-fix #4): "independent" findings, deduped by
    // severity+category+message so an LLM restating the same gap across "up to 5 findings"
    // cannot manufacture sufficiency by repetition.
    const distinctBlockFindings = new Set(
      blockFindings.map((f) => `${String(f.severity || '').trim().toLowerCase()}::${String(f.category || '').trim().toLowerCase()}::${String(f.message || '').trim().toLowerCase()}`)
    );
    const sufficientCount = distinctBlockFindings.size >= SUFFICIENCY_THRESHOLD;
    // blockFindings.length === 0 here means the seed came from llmOverall alone while the listed
    // findings are all sub-block — the same "unbacked claim" shape as the empty-findings case,
    // just with contradicting findings attached. Stays block (seed untouched), conservative.
    if (blockFindings.length > 0 && allLowAuthority && !sufficientCount) {
      combined = 'warn';
    }
  }

  return combined;
}

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
      // QF-20260816-546: these two were already SELECTed above but omitted here, so the
      // critique never saw architecture or approach content at all (sibling of the shipped
      // truncation fix, not covered by that SD's scope).
      system_architecture: prd.system_architecture,
      implementation_approach: prd.implementation_approach,
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

  // FR-2: invariant library — deterministic, runs even when the LLM half cannot. Moved AHEAD of
  // the replay-guard below (TESTING sub-agent prospective finding N2): invariant checks are free
  // (no LLM, no network), so there is no reason the replay-pass path should ever reuse a STALE
  // invariant snapshot from the original run — if a new invariant has been added to the library
  // since, it must still fire on unchanged content, exactly as it would on any other run.
  const invariant = runInvariantChecks({ prdContent, archContent });

  // QF-20260902-181: refuse re-execute while content_hash is unchanged since the last blocking
  // verdict — 23 handoffs in the 7-day cohort retried 4-5x within minutes on unchanged content
  // (finding COUNT is the wrong key here — the critic is nondeterministic — content_hash, the
  // same predicate findActiveOverride already binds on, is the correct one). Replays the prior
  // findings and STILL persists a row (never a silent skip); only fires when no override applies.
  const { prdRawText, archRawText } = buildCritiqueUserPrompt({ prdContent: prdSections, archContent, sdContext: {} });
  const retryHash = computeContentHash({ prdRawText, archRawText, archLoadStatus, model: getOpenAIModel('validation') });
  const lastBlock = await findLastBlockingCritique(supabase, sd.id);
  if (lastBlock && lastBlock.content_hash === retryHash) {
    const { override } = await findActiveOverride(supabase, sd.id, retryHash);
    if (!override) {
      // TESTING sub-agent prospective finding (MUST-FIX #3): this branch used to persist and
      // return a HARDCODED overall_severity:'block' — bypassing deriveCombinedSeverity entirely.
      // That meant this SD's own fix could never reach the population that motivated it: every
      // one of the 358 historically-blocked SDs sitting on unchanged content would keep
      // hard-blocking forever, regardless of the new sufficiency/decision-authority rules. The
      // underlying LLM findings are unchanged (content_hash matches), so no LLM re-call is
      // needed — but the invariant half IS re-run fresh (above, N2) and merged in here, so a
      // library change since the original run is never silently missed.
      const lastLlmOverall = String(lastBlock.metadata?.llm_result?.overall_severity || 'block').toLowerCase();
      // metadata.llm_result.findings is the RAW pre-merge LLM output (see devils-advocate.js's
      // own persist comment) — reused here so re-merging with FRESH invariant.findings never
      // double-counts the invariant findings baked into lastBlock.findings from the original run.
      // Older rows without this shape fall back to the merged historical findings as-is.
      const lastLlmFindings = Array.isArray(lastBlock.metadata?.llm_result?.findings)
        ? lastBlock.metadata.llm_result.findings
        : (lastBlock.findings || []);
      const replayFindings = [...lastLlmFindings, ...invariant.findings];
      const reDerived = deriveCombinedSeverity({ llmOverall: lastLlmOverall, findings: replayFindings });
      if (reDerived === 'block') {
        const msg = 'Re-execute refused: content_hash unchanged since the last blocking critique ' +
          `(${lastBlock.id}, ${lastBlock.created_at}) — replaying prior findings (LLM half reused, ` +
          'invariant half re-run fresh), which still combine to block under the current ' +
          'aggregation rules. Fix the plan (changes the hash) or record an audited override.';
        console.log(`   ⚠️  ${msg}`);
        await persistCritique(supabase, {
          sd_id: sd.id, prd_id: prdId, findings: replayFindings, overall_severity: 'block',
          model_used: lastBlock.model_used, token_usage: null, content_hash: retryHash,
          // TESTING sub-agent finding (minor, PLAN-TO-EXEC re-verification): metadata.llm_result
          // must carry the raw LLM-only findings here too — on a SECOND consecutive replay,
          // findLastBlockingCritique would otherwise read this row's already-invariant-merged
          // `findings` back as `lastLlmFindings` (the metadata.llm_result fallback), duplicating
          // the invariant finding a second time. Verdict is unaffected (dedup absorbs it), but
          // this keeps the persisted data itself accurate across repeated replay cycles.
          metadata: { retry_refused: true, replayed_from: lastBlock.id, llm_result: { findings: lastLlmFindings, overall_severity: lastLlmOverall } },
        }, [msg]);
        return { pass: false, score: SCORE_BY_OUTCOME.block, max_score: 100, issues: [msg], warnings: [msg] };
      }
      const msg = `Prior block (${lastBlock.id}, ${lastBlock.created_at}) no longer earns 'block' ` +
        `under the current aggregation rules — re-derived as '${reDerived}'. Content unchanged, so ` +
        're-using the prior LLM findings (invariant half re-run fresh); no new LLM call needed.';
      console.log(`   ℹ️  ${msg}`);
      await persistCritique(supabase, {
        sd_id: sd.id, prd_id: prdId, findings: replayFindings, overall_severity: reDerived,
        model_used: lastBlock.model_used, token_usage: null, content_hash: retryHash,
        metadata: { retry_refused: false, re_derived_from: lastBlock.id, re_derived_llm_overall: lastLlmOverall, llm_result: { findings: lastLlmFindings, overall_severity: lastLlmOverall } },
      }, [msg]);
      return {
        pass: true,
        score: SCORE_BY_OUTCOME[reDerived] ?? 75,
        max_score: 100,
        issues: [],
        warnings: [msg],
      };
    }
  }

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
  // class this SD removes. Findings can raise the seed, never lower it (except the
  // sufficiency-threshold downgrade in deriveCombinedSeverity, see its own docstring).
  const llmOverall = String(critique.overall_severity || '').toLowerCase();
  let combined = deriveCombinedSeverity({ llmOverall, findings });
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

  // TESTING (EXEC-phase evidence, HIGH finding #2): llm_result is the RAW pre-merge LLM output
  // (critique.findings/overall_severity, BEFORE invariant.findings is merged in below and BEFORE
  // combined severity is derived) — persisted UNCONDITIONALLY on every row so lookupCacheHit
  // (devils-advocate.js) always has genuine raw content to reuse on a future hit. Reusing the
  // top-level findings/overall_severity columns instead would hand a future call the GATE's
  // already-combined result, which then gets invariant findings re-merged a second time and an
  // already-derived severity re-seeded as if it were fresh — compounding every hit within the
  // cache TTL (PT-9: cache the CRITIQUE RESULT, never a pre-derived final gate VERDICT).
  const llmResultMetadata = { findings: critique.findings || [], overall_severity: critique.overall_severity };

  const metadata = { llm_result: llmResultMetadata, ...(truncatedMetadata ? { truncated: truncatedMetadata } : {}), ...cacheMetadata };

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
    metadata,
  }, warnings);

  // FR-1: verdict. 'block' fails unless an audited override exists FOR THIS EXACT CONTENT
  // (FR-4/FR-5 — content_hash REPLACES findingsFingerprint as the binding predicate; see
  // findActiveOverride's own docstring for why).
  if (combined === 'block') {
    const { override, schemaMissing } = await findActiveOverride(supabase, sd.id, critique.contentHash);
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
    // VALIDATION VAL-1: a schema-missing lookup failure is NOT "no override recorded" — say so
    // loudly, distinct from the generic block-issue text below, matching FR-6's own precedent.
    if (schemaMissing) {
      const msg = 'plan_critiques SCHEMA MISSING on override lookup — the writer shipped ahead of its migration (database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql). No override can bind until the migration applies; this is NOT evidence that no override was ever recorded. Do not treat this block as unoverridable-by-design.';
      console.warn(`   ⚠️  ${msg}`);
      warnings.push(msg);
    }
    return {
      pass: false,
      score: SCORE_BY_OUTCOME.block,
      max_score: 100,
      issues: [
        `Adversarial critique found BLOCK-severity planning gaps (${findings.length} finding(s)). ` +
        'Fix the plan, or record an audited override on the blocking plan_critiques row via ' +
        '`node scripts/critique-override.js <SD-KEY> --by <who> --reason "<why>"` — the override ' +
        'binds to this exact PRD/arch content (a content_hash match, not a findings-set match: ' +
        'it excuses any findings this same reviewed text produces, and re-blocks the moment the ' +
        'content changes) and downgrades rather than deletes the findings.',
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
 * Stable fingerprint of a findings set: severity + category (+ invariant id) pairs, sorted.
 *
 * NO LONGER the override-binding predicate (SECURITY EXEC-phase finding SEC-MED-1 — this
 * docstring previously said it was, which is now stale/misleading): FR-4/FR-5 replaced
 * findings-set binding with content_hash equality (findActiveOverride, this file). This function
 * has zero production callers today — kept exported for its own still-meaningful invariant (used
 * by tests to assert truncation/formatting changes never perturb a findings-derived fingerprint)
 * and as a historical record of the KIND-of-finding binding approach findActiveOverride's own
 * docstring explains was insufficient once the LLM is nondeterministic even on unchanged input.
 * Deliberately NOT keyed on message text: LLM messages are re-worded on every run, so a
 * message-keyed fingerprint never matches twice (adversarial ship review, PR #6927).
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
 * TR-5: a null/undefined currentContentHash returns {override: null} WITHOUT querying — never
 * calls .eq('content_hash', null). This is deliberately more conservative than relying on
 * Postgres's own NULL != NULL semantics (which already protects the other direction: a stored row
 * with content_hash IS NULL can never match a real hash value, and needs no special-casing here) —
 * an override should never bind to a could-not-check block whose content identity was never
 * measured in the first place.
 *
 * VALIDATION (PLAN_VERIFICATION evidence, VAL-1, HIGH): returns {override, schemaMissing}, not a
 * bare value — a schema-missing error (content_hash/metadata not yet migrated) must be
 * DISTINGUISHABLE from a genuine "no override recorded" outcome, the same distinction FR-6 already
 * gives persistCritique. Before this fix, `if (error || ...) return null` treated a 42703/PGRST204
 * identically to "checked the table, no override exists" — measured live: while TR-3's migration
 * is staged (not applied), EVERY blocking critique is silently unoverridable fleet-wide (30/30
 * plan_critiques rows in the last 14 days were block-severity, 7 carried an override attempt) with
 * no loud signal on this specific path, even though FR-6/the ROLLOUT PRECONDITION claimed the
 * gate "degrades LOUDLY, never silently" for exactly this pre-migration window. The block still
 * correctly stands either way (fail-closed is right — an override cannot apply if the table can't
 * be queried) — what changes is that the OPERATOR now learns WHY, instead of concluding no
 * override was ever recorded.
 */
async function findActiveOverride(supabase, sdId, currentContentHash) {
  if (!currentContentHash) return { override: null, schemaMissing: false };
  try {
    const since = new Date(Date.now() - OVERRIDE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('plan_critiques')
      // content_hash is TR-3's staged column, not yet live in the schema snapshot — remove this
      // pragma and re-run `npm run schema:snapshot:lint` once ceremony N+1 applies the migration.
      .select('id, content_hash, override_reason, override_by, created_at') // schema-lint-disable-line
      .eq('sd_id', sdId)
      .eq('overall_severity', 'block')
      .eq('content_hash', currentContentHash)
      .not('override_reason', 'is', null)
      .not('override_by', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return { override: null, schemaMissing: SCHEMA_MISSING_CODES.has(error.code) };
    if (!data || data.length === 0) return { override: null, schemaMissing: false };
    for (const row of data) {
      if (!String(row.override_reason).trim() || !String(row.override_by).trim()) continue;
      return { override: row, schemaMissing: false };
    }
    return { override: null, schemaMissing: false };
  } catch {
    // Fail-closed: an unreadable override table means NO override — the block stands.
    return { override: null, schemaMissing: false };
  }
}

/**
 * QF-20260902-181: the retry guard's source of truth — the most recent BLOCK-severity
 * plan_critiques row for this SD, whatever content_hash it carries. Fail-open on any read
 * error (null): a lookup failure must never itself manufacture a refusal.
 */
async function findLastBlockingCritique(supabase, sdId) {
  try {
    // SD-LEO-INFRA-CRITIQUE-GATE-NON-001 (MUST-FIX #3): metadata now selected so the caller can
    // re-derive under the current aggregation rules using the LLM's own original seed
    // (metadata.llm_result.overall_severity) instead of always assuming 'block'.
    const { data, error } = await supabase
      .from('plan_critiques')
      .select('id, content_hash, findings, metadata, model_used, created_at') // schema-lint-disable-line
      .eq('sd_id', sdId)
      .eq('overall_severity', 'block')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  } catch {
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
