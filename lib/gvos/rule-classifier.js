/**
 * GVOS rule-based archetype classifier — Node.js port for EHG_Engineer worker.
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-4
 *
 * Mirrors the rule_only path of EHG/src/lib/gvos/auto-classifier.ts. Keeps
 * worker-side classification synchronous-ish (one DB read) with zero LLM
 * invocations, guaranteed by construction (this module never imports any LLM SDK).
 *
 * Parity contract: this module's decision for a given input MUST equal
 * EHG/src/lib/gvos/auto-classifier.ts when called with mode='rule_only'.
 * Drift is regression-tested via tests/integration/rule-classifier-parity.test.js
 * (followup; see retrospective).
 *
 * Public API:
 *   classifyArchetypeRuleOnly({ industryTags, audienceTags, businessModelClass }, supabaseClient)
 *     -> { archetypeId, archetypePromptToken, method, confidence, rationale }
 */

const CONFIDENCE_THRESHOLD = 0.7;
const EMERGENCY_DEFAULT_TOKEN = 'Sovereign-Operator';

/**
 * @param {{ industryTags?: string[], audienceTags?: string[], businessModelClass?: string|null }} input
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function classifyArchetypeRuleOnly(input, supabase) {
  const { data, error } = await supabase
    .from('gvos_archetypes')
    .select('id, prompt_token, industry_tags, audience_tags, business_model_tags, gating_class, excluded');
  if (error) throw new Error(`Failed to load gvos_archetypes: ${error.message}`);
  const archetypes = (data || []).filter((a) => !a.excluded);

  const ruleScored = scoreByRules(input, archetypes);
  const topRule = ruleScored[0];

  if (topRule && topRule.confidence >= CONFIDENCE_THRESHOLD) {
    const honored = honorGating(topRule, ruleScored, input);
    if (honored) {
      return outputFromRule(
        honored,
        'rule_based',
        `rule overlap=${topRule.overlap}, confidence=${topRule.confidence.toFixed(2)} ≥ ${CONFIDENCE_THRESHOLD}`,
      );
    }
  }

  if (topRule) {
    const honored = honorGating(topRule, ruleScored, input);
    if (honored) {
      return outputFromRule(
        honored,
        'rule_fallback_below_threshold',
        `mode=rule_only; LLM skipped; best rule match: confidence=${honored.confidence.toFixed(2)}`,
      );
    }
  }

  const emergency = archetypes.find((a) => a.prompt_token === EMERGENCY_DEFAULT_TOKEN);
  return {
    archetypeId: emergency?.id ?? '',
    archetypePromptToken: EMERGENCY_DEFAULT_TOKEN,
    method: 'emergency_default',
    confidence: 0,
    rationale: `mode=rule_only; no eligible rule match above threshold; emergency default ${EMERGENCY_DEFAULT_TOKEN}`,
  };
}

function scoreByRules(input, archetypes) {
  const inputTags = new Set(
    [...(input.industryTags || []), ...(input.audienceTags || [])]
      .map((t) => (t || '').toLowerCase().trim())
      .filter(Boolean),
  );
  if (input.businessModelClass) inputTags.add(`bm:${input.businessModelClass.toLowerCase()}`);
  if (inputTags.size === 0) return archetypes.map((a) => ({ archetype: a, confidence: 0, overlap: 0 }));

  const denom = Math.max(inputTags.size, 3);
  return archetypes
    .map((a) => {
      const archetypeTags = new Set(
        [
          ...(a.industry_tags || []),
          ...(a.audience_tags || []),
          ...(a.business_model_tags || []).map((t) => `bm:${(t || '').toLowerCase()}`),
        ]
          .map((t) => (t || '').toLowerCase().trim())
          .filter(Boolean),
      );
      let overlap = 0;
      for (const t of inputTags) if (archetypeTags.has(t)) overlap++;
      return { archetype: a, confidence: overlap / denom, overlap };
    })
    .sort((x, y) => y.confidence - x.confidence);
}

function honorGating(top, ranked, input) {
  if (!top.archetype.gating_class) return top;
  if (input.businessModelClass === top.archetype.gating_class) return top;
  for (const s of ranked) {
    if (s === top) continue;
    if (s.archetype.gating_class && s.archetype.gating_class !== input.businessModelClass) continue;
    if (s.confidence >= CONFIDENCE_THRESHOLD) return s;
  }
  return null;
}

function outputFromRule(rule, method, rationale) {
  return {
    archetypeId: rule.archetype.id,
    archetypePromptToken: rule.archetype.prompt_token,
    method,
    confidence: rule.confidence,
    rationale,
  };
}

export { CONFIDENCE_THRESHOLD, EMERGENCY_DEFAULT_TOKEN };
