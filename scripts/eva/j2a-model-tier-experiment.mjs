#!/usr/bin/env node
/**
 * J2a — EVA Generation-Layer Model-Tier A/B Experiment
 * SD-LEO-INFRA-J2A-EVA-GENERATION-001
 *
 * Solomon-designed (advisory d7f5401c): settle, with evidence, whether EVA's
 * budget-tier generation model (Gemini 2.5 Flash) is undershooting quality in
 * the planning-artifact layer, BEFORE the remediation spec pack
 * (SD-LEO-INFRA-MARKETLENS-REMEDIATION-TRIAGE-001) is written.
 *
 * Pilot sample: MarketLens's `blueprint_user_story_pack` artifact (14 stories,
 * 13 BUILT + 1 PARTIAL at story index 5). Three arms regenerate the whole
 * artifact from the same venture brief; the SAME mechanical evidence-matcher
 * that produced the live scorecard (lib/eva/post-build-verdict-engine.js)
 * re-derives disposition — no rebuild of the venture is required.
 *
 * AMBIGUITY RESOLUTION (per CLAUDE_EXEC.md Step 0): a freshly-regenerated
 * artifact will not reproduce stories in the same order/count as the
 * original, so positional index-matching across arms is unsound. Resolved by
 * keyword-overlap matching (matchClaimToRegenerated): each arm's regenerated
 * claim set is searched for the best keyword match to the ORIGINAL target/
 * control claim text; a zero-overlap match means the model's regeneration did
 * not cover that user intent at all, which conservatively counts as no
 * evidence (mirrors post-build-verdict-engine.js's own "ambiguous -> PARTIAL/
 * MISSING, never BUILT" bias).
 *
 * FR-1: the decision rule below is LOCKED before any generation call runs.
 * EXEC MUST NOT amend it after seeing results.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getLLMClient } from '../../lib/llm/client-factory.js';
import {
  extractUserStoryClaims,
  findEvidenceForClaim,
  computeDisposition,
  resolveVentureRepoPath,
} from '../../lib/eva/post-build-verdict-engine.js';
import { rowCost } from '../../lib/cost/llm-pricing.js';
import { systemPrompt as USER_STORY_PACK_SYSTEM_PROMPT } from '../../lib/eva/blueprint-agents/user-story-pack.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export const SD_KEY = 'SD-LEO-INFRA-J2A-EVA-GENERATION-001';
export const VENTURE_ID = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
export const ARTIFACT_TYPE = 'blueprint_user_story_pack';

// FR-3: 1 PARTIAL flip target + 3 BUILT controls, confirmed live against
// post_build_verdicts before this rule was locked (see PRD FR-3).
export const SAMPLE = Object.freeze({
  targetIndex: 5,
  controlIndices: Object.freeze([0, 1, 6]),
});

export const ARMS = Object.freeze({
  NULL_REROLL: 'null_reroll',
  CONTROL: 'control',
  HIGHER_TIER: 'higher_tier',
});

export const HIGHER_TIER_MODEL = 'claude-sonnet-4-6';

/**
 * FR-1: the pre-registered decision rule, locked BEFORE any generation call.
 */
export const DECISION_RULE = Object.freeze({
  version: 1,
  lockedAt: '2026-07-05',
  description:
    'higher_tier arm PASSES (flip-remediation) iff it flips SAMPLE.targetIndex from PARTIAL to BUILT ' +
    'AND zero SAMPLE.controlIndices regress to non-BUILT under higher_tier, ' +
    'AND null_reroll does NOT ALSO flip SAMPLE.targetIndex to BUILT (a null-baseline flip means the ' +
    'observed flip is reroll luck, not a genuine tier effect -- higher_tier gets no credit for it). ' +
    'If higher_tier flips the target but regresses a control, verdict is partial-retier. Otherwise proceed-unchanged.',
});

const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'should', 'user', 'users', 'story', 'when', 'then', 'able', 'want', 'need', 'their', 'they']);

/** Mirrors post-build-verdict-engine.js's private extractKeywords tokenization for
 * consistency with the disposition engine's own matching philosophy. */
export function extractKeywords(text) {
  return [...new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  )];
}

/**
 * Keyword-overlap match: find the regenerated claim whose keyword set overlaps
 * most with the original claim's keyword set. Returns null (no comparable
 * story) when the best overlap is zero -- conservative, never invents a match.
 * @param {string} originalClaimText
 * @param {string[]} regeneratedClaims
 * @returns {{claim: string, overlap: number}|null}
 */
export function matchClaimToRegenerated(originalClaimText, regeneratedClaims) {
  const originalKeywords = new Set(extractKeywords(originalClaimText));
  if (originalKeywords.size === 0) return null;

  let best = null;
  for (const claim of regeneratedClaims) {
    const claimKeywords = extractKeywords(claim);
    const overlap = claimKeywords.filter((k) => originalKeywords.has(k)).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) {
      best = { claim, overlap };
    }
  }
  return best;
}

/**
 * Pure function: evaluate DECISION_RULE against computed per-arm dispositions.
 * dispositionsByArm: { [arm]: { [sampleIndex]: 'BUILT'|'PARTIAL'|'MISSING' } }
 * No I/O, no LLM calls -- fully unit-testable.
 */
export function evaluateVerdict(dispositionsByArm) {
  const { targetIndex, controlIndices } = SAMPLE;
  const higher = dispositionsByArm[ARMS.HIGHER_TIER] || {};
  const nullArm = dispositionsByArm[ARMS.NULL_REROLL] || {};

  const higherFlipped = higher[targetIndex] === 'BUILT';
  const nullFlipped = nullArm[targetIndex] === 'BUILT';
  const controlsRegressed = controlIndices.filter((i) => higher[i] && higher[i] !== 'BUILT');

  if (nullFlipped) {
    return {
      verdict: 'proceed-unchanged',
      reason: 'null-baseline reroll also flipped the target story to BUILT -- confound not ruled out for this sample',
    };
  }
  if (higherFlipped && controlsRegressed.length === 0) {
    return {
      verdict: 'flip-remediation',
      reason: 'higher-tier arm flipped the target story to BUILT with zero control regressions',
    };
  }
  if (higherFlipped && controlsRegressed.length > 0) {
    return {
      verdict: 'partial-retier',
      reason: `higher-tier arm flipped the target story but regressed control indices [${controlsRegressed.join(', ')}]`,
    };
  }
  return {
    verdict: 'proceed-unchanged',
    reason: 'higher-tier arm did not flip the target story to BUILT',
  };
}

/**
 * Build the user prompt for the blueprint_user_story_pack agent from a live
 * venture row -- mirrors user-story-pack.js's own systemPrompt docstring
 * ("Given the venture brief (problem, solution, target market)...").
 */
export function buildVentureBriefPrompt(venture) {
  return [
    `Venture: ${venture.name}`,
    `Problem: ${venture.problem_statement || venture.description || ''}`,
    venture.solution_approach ? `Solution approach: ${venture.solution_approach}` : null,
    venture.target_market ? `Target market: ${venture.target_market}` : null,
    venture.unique_value_proposition ? `Unique value proposition: ${venture.unique_value_proposition}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Anthropic (unlike Gemini's responseMimeType JSON mode) commonly wraps JSON
 * output in a markdown code fence (```json ... ```). Strip it before parsing.
 * A no-op on content that is already raw JSON.
 */
export function stripMarkdownJsonFence(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  // Strip the opening fence (with optional language tag) and, if present, a
  // closing fence -- tolerant of trailing prose/whitespace after the last
  // fence, which a strict anchored regex would otherwise fail to match.
  const withoutOpening = trimmed.replace(/^```[a-zA-Z]*\s*/, '');
  const lastFenceIdx = withoutOpening.lastIndexOf('```');
  return (lastFenceIdx >= 0 ? withoutOpening.slice(0, lastFenceIdx) : withoutOpening).trim();
}

/**
 * FR-2: regenerate the artifact for a given arm. Returns the artifact_data
 * shape ({epics, personas, mvp_story_count, total_story_points}).
 * cacheTTLMs:0 on every call (TR-3) so the response cache never masks a
 * genuine reroll or a genuine higher-tier call with a stale response.
 */
export async function regenerateArtifact({ arm, venture, sdId, model }) {
  const userPrompt = buildVentureBriefPrompt(venture);
  const client = getLLMClient({
    purpose: 'generation',
    model,
    sdId,
    phase: 'EXEC',
    cacheTTLMs: 0,
  });
  const result = await client.complete(USER_STORY_PACK_SYSTEM_PROMPT, userPrompt, {
    purpose: 'content-generation',
    response_format: { type: 'json_object' },
    maxTokens: 16384, // AnthropicAdapter defaults to 8192, which truncates a full 14-story epics JSON mid-string
  });

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(result.content));
  } catch (err) {
    throw new Error(`[j2a] arm=${arm} model=${result.model || model}: failed to parse JSON response: ${err.message}`);
  }
  return { artifactData: parsed, usage: { model: result.model || model, provider: result.provider, ...result.usage } };
}

/**
 * FR-4: re-derive disposition for the sampled indices against a regenerated
 * (or the existing control) artifact, using the SAME mechanical evidence
 * pipeline that produced the live scorecard. Writes an audit row per
 * (arm, index) proving only claim text + repo evidence reached
 * computeDisposition -- never arm/model identity.
 *
 * findEvidenceForClaim() is called with `repoPath` only (no prebuilt
 * fileIndex) so this reuses post-build-verdict-engine.js exactly as
 * exported, with zero modification to that module (TR-2).
 *
 * @returns {{dispositions: Record<number,string>, auditRows: object[]}}
 */
export function rescoreSample({ arm, artifactData, originalClaims, repoPath }) {
  const regeneratedClaims = extractUserStoryClaims({ artifact_data: artifactData });
  const dispositions = {};
  const auditRows = [];

  const sampleIndices = [SAMPLE.targetIndex, ...SAMPLE.controlIndices];
  for (const index of sampleIndices) {
    const originalClaimText = originalClaims[index];
    const match = matchClaimToRegenerated(originalClaimText, regeneratedClaims);
    const claimTextToScore = match ? match.claim : originalClaimText;

    const { confidence, evidenceRefs } = findEvidenceForClaim({ repoPath, claimText: claimTextToScore });
    const present = confidence !== 'NONE';
    const disposition = computeDisposition({ present, evidenceConfidence: confidence, deviationRecords: [] });

    dispositions[index] = disposition;
    auditRows.push({
      arm,
      sampleIndex: index,
      // NOTE: computeDisposition's own input is logged here for the audit
      // trail -- it never receives `arm` or `model` as a parameter.
      computeDispositionInput: { present, evidenceConfidence: confidence, deviationRecords: [] },
      matchedClaim: claimTextToScore,
      matchOverlap: match?.overlap ?? 0,
      evidenceRefs,
      disposition,
    });
  }

  return { dispositions, auditRows };
}

/**
 * FR-5: cost-per-quality-point readout from model_usage_log for this SD.
 *
 * Scoped to subagent_type='generation' (the purpose this harness's own calls
 * are tagged with -- excludes unrelated LEO gate-evaluation LLM calls that
 * share this sdId via usage-logger's session-claim fallback) and, when
 * `sinceIso` is given, to rows at/after that timestamp (excludes cost from
 * earlier failed/debugging runs of this same harness).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{sdId: string, flipsByArm: Record<string, number>, sinceIso?: string}} opts
 */
export async function computeCostReadout(supabase, { sdId, flipsByArm, sinceIso }) {
  let query = supabase
    .from('model_usage_log')
    .select('reported_model_name, metadata')
    .eq('sd_id', sdId)
    .eq('subagent_type', 'generation');
  if (sinceIso) query = query.gte('captured_at', sinceIso);

  const { data, error } = await query;
  if (error) throw new Error(`[j2a] computeCostReadout: model_usage_log query failed: ${error.message}`);

  const byModel = {};
  for (const row of data || []) {
    const model = row.reported_model_name;
    const { usd, inT, outT } = rowCost(row);
    if (!byModel[model]) byModel[model] = { model, totalTokens: 0, totalCostUsd: 0, calls: 0 };
    byModel[model].totalTokens += inT + outT;
    byModel[model].totalCostUsd += usd;
    byModel[model].calls += 1;
  }

  return Object.values(byModel).map((entry) => ({
    ...entry,
    storiesFlipped: flipsByArm?.[entry.model] || 0,
    costPerFlipUsd: (flipsByArm?.[entry.model] || 0) > 0 ? entry.totalCostUsd / flipsByArm[entry.model] : null,
  }));
}

/**
 * Stage a chairman decision card (advisory row) when the verdict recommends
 * any re-tier -- FR-6. Reuses the existing chairman_decisions surface rather
 * than inventing a new notification channel.
 */
async function stageChairmanDecisionCard(supabase, { verdict, costReadout, dispositionsByArm }) {
  const { error } = await supabase.from('chairman_decisions').insert({
    venture_id: VENTURE_ID,
    lifecycle_stage: 0, // not tied to a specific venture lifecycle stage
    decision_type: 'model_tier_retier_recommendation',
    status: 'pending',
    decision: 'pending',
    blocking: false,
    summary: `J2a: EVA generation-layer model-tier re-tier recommendation -- verdict: ${verdict.verdict}`,
    rationale: verdict.reason,
    context: {
      sd_key: SD_KEY,
      decision_rule: DECISION_RULE,
      verdict,
      cost_readout: costReadout,
      dispositions_by_arm: dispositionsByArm,
    },
  });
  if (error) {
    // Non-fatal: the verdict is already durably recorded on the SD row (main()).
    // A missing/renamed chairman_decisions column must never block the
    // experiment's own result from being recorded.
    console.error('[j2a] stageChairmanDecisionCard failed (non-fatal):', error.message);
    return { staged: false, error: error.message };
  }
  return { staged: true };
}

async function main() {
  const runStartedAt = new Date().toISOString();
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: venture, error: ventureError } = await supabase
    .from('ventures')
    .select('*')
    .eq('id', VENTURE_ID)
    .single();
  if (ventureError) throw new Error(`[j2a] failed to load venture: ${ventureError.message}`);

  const { data: existingRow, error: artifactError } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', VENTURE_ID)
    .eq('artifact_type', ARTIFACT_TYPE)
    .eq('is_current', true)
    .single();
  if (artifactError) throw new Error(`[j2a] failed to load existing artifact: ${artifactError.message}`);

  const originalClaims = extractUserStoryClaims({ artifact_data: existingRow.artifact_data });

  const repoPath = await resolveVentureRepoPath(supabase, { ventureId: VENTURE_ID });
  if (!repoPath) throw new Error('[j2a] could not resolve venture repo path');

  console.log(`[j2a] Running 3-arm experiment against ${VENTURE_ID} / ${ARTIFACT_TYPE}`);
  console.log(`[j2a] Decision rule (locked ${DECISION_RULE.lockedAt}): ${DECISION_RULE.description}`);

  const dispositionsByArm = {};
  const auditRowsAll = [];
  const flipsByArm = {};

  // Control arm: reuse existing artifact_data, zero LLM calls.
  {
    const { dispositions, auditRows } = rescoreSample({
      arm: ARMS.CONTROL,
      artifactData: existingRow.artifact_data,
      originalClaims,
      repoPath,
    });
    dispositionsByArm[ARMS.CONTROL] = dispositions;
    auditRowsAll.push(...auditRows);
  }

  // Null-reroll arm: regenerate with the default (Flash) model.
  {
    const { artifactData, usage } = await regenerateArtifact({ arm: ARMS.NULL_REROLL, venture, sdId: SD_KEY });
    const { dispositions, auditRows } = rescoreSample({ arm: ARMS.NULL_REROLL, artifactData, originalClaims, repoPath });
    dispositionsByArm[ARMS.NULL_REROLL] = dispositions;
    auditRowsAll.push(...auditRows);
    flipsByArm[usage.model] = (flipsByArm[usage.model] || 0) + (dispositions[SAMPLE.targetIndex] === 'BUILT' ? 1 : 0);
  }

  // Higher-tier arm: regenerate with the candidate model.
  {
    const { artifactData, usage } = await regenerateArtifact({
      arm: ARMS.HIGHER_TIER,
      venture,
      sdId: SD_KEY,
      model: HIGHER_TIER_MODEL,
    });
    const { dispositions, auditRows } = rescoreSample({ arm: ARMS.HIGHER_TIER, artifactData, originalClaims, repoPath });
    dispositionsByArm[ARMS.HIGHER_TIER] = dispositions;
    auditRowsAll.push(...auditRows);
    flipsByArm[usage.model] = (flipsByArm[usage.model] || 0) + (dispositions[SAMPLE.targetIndex] === 'BUILT' ? 1 : 0);
  }

  const verdict = evaluateVerdict(dispositionsByArm);
  // lib/llm/usage-logger.js's logUsage() is deliberately fire-and-forget (never
  // awaited by client-factory's wrapper, so LLM calls aren't slowed by logging)
  // -- give its INSERT a moment to land before querying, or the readout can
  // silently miss the most recent call(s).
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const costReadout = await computeCostReadout(supabase, { sdId: SD_KEY, flipsByArm, sinceIso: runStartedAt });

  console.log('[j2a] Dispositions by arm:', JSON.stringify(dispositionsByArm, null, 2));
  console.log('[j2a] Verdict:', JSON.stringify(verdict, null, 2));
  console.log('[j2a] Cost readout:', JSON.stringify(costReadout, null, 2));

  // Persist durably on the SD row so SD-LEO-INFRA-MARKETLENS-REMEDIATION-TRIAGE-001 can read it.
  const { data: sdRow, error: sdReadError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdReadError) throw new Error(`[j2a] failed to read SD row for verdict persistence: ${sdReadError.message}`);

  const { error: sdWriteError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        ...sdRow.metadata,
        j2a_verdict: {
          verdict,
          dispositions_by_arm: dispositionsByArm,
          cost_readout: costReadout,
          audit_rows: auditRowsAll,
          decision_rule: DECISION_RULE,
          computed_at: new Date().toISOString(),
        },
      },
    })
    .eq('sd_key', SD_KEY);
  if (sdWriteError) throw new Error(`[j2a] failed to persist verdict: ${sdWriteError.message}`);

  if (verdict.verdict !== 'proceed-unchanged') {
    await stageChairmanDecisionCard(supabase, { verdict, costReadout, dispositionsByArm });
  }

  console.log('[j2a] Experiment complete.');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[j2a] fatal:', err.message);
    process.exitCode = 1;
  });
}

export default {
  SD_KEY,
  VENTURE_ID,
  ARTIFACT_TYPE,
  SAMPLE,
  ARMS,
  HIGHER_TIER_MODEL,
  DECISION_RULE,
  extractKeywords,
  matchClaimToRegenerated,
  evaluateVerdict,
  buildVentureBriefPrompt,
  stripMarkdownJsonFence,
  regenerateArtifact,
  rescoreSample,
  computeCostReadout,
};
