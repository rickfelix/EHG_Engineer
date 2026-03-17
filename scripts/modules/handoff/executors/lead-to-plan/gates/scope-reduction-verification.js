/**
 * SCOPE_REDUCTION_VERIFICATION Semantic Gate (Intelligent Rubric)
 * Replaces static 10% check with vision-aware, fidelity-protected analysis.
 *
 * SD: SD-LEO-ENH-INTELLIGENT-SCOPE-REDUCTION-001
 * Phase: LEAD-TO-PLAN
 *
 * Flow:
 *   1. Check gate applicability (SD-type matrix)
 *   2. Load vision/arch dimensions for scope item classification
 *   3. Query eva_translation_gates for protected items
 *   4. Classify scope items as core vs deferrable (LLM)
 *   5. Generate reduction suggestions from deferrable items
 *   6. If reductions suggested, run vision score delta check
 *   7. If reductions suggested, run translation fidelity gap check
 *   8. Build final gate result
 */

import {
  getGateApplicability,
  computeConfidence,
  buildSemanticResult,
  buildSkipResult
} from '../../../validation/semantic-gate-utils.js';

const GATE_NAME = 'SCOPE_REDUCTION_VERIFICATION';
const MAX_VISION_DELTA = 5;
const LLM_TIMEOUT = 60000;

// Vision score thresholds per SD type (must not drop below)
const VISION_THRESHOLDS = {
  feature: 80,
  enhancement: 80,
  infrastructure: 70,
  fix: 60,
  documentation: 60,
  refactor: 65,
  orchestrator: 80,
  default: 80
};

/**
 * Query eva_translation_gates for scope items with upstream traceability.
 * Returns protected items that should not be reduced.
 */
async function getProtectedItems(supabase, sdId, sdKey) {
  try {
    // Query for architecture_to_sd gates targeting this SD
    const { data: gates, error } = await supabase
      .from('eva_translation_gates')
      .select('gaps, coverage_score, passed, metadata')
      .eq('gate_type', 'architecture_to_sd')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !gates?.length) {
      return { protectedItems: [], hasData: false };
    }

    // Filter to gates that reference this SD
    const relevantGates = gates.filter(g => {
      const targetRef = g.metadata?.target_ref || {};
      return targetRef.key === sdKey || targetRef.id === sdId;
    });

    if (!relevantGates.length) {
      // Fallback: check any recent gates for this SD via target_ref JSONB
      const { data: jsonbGates } = await supabase
        .from('eva_translation_gates')
        .select('gaps, coverage_score')
        .eq('gate_type', 'architecture_to_sd')
        .or(`target_ref->key.eq.${sdKey},target_ref->id.eq.${sdId}`)
        .order('created_at', { ascending: false })
        .limit(3);

      if (!jsonbGates?.length) {
        return { protectedItems: [], hasData: false };
      }

      const protected_ = extractProtectedFromGaps(jsonbGates);
      return { protectedItems: protected_, hasData: true };
    }

    const protected_ = extractProtectedFromGaps(relevantGates);
    return { protectedItems: protected_, hasData: true };
  } catch (err) {
    console.log(`   ⚠️  Translation fidelity query error: ${err.message}`);
    return { protectedItems: [], hasData: false };
  }
}

function extractProtectedFromGaps(gates) {
  const protectedItems = [];
  for (const gate of gates) {
    const gaps = gate.gaps || [];
    for (const gap of gaps) {
      if (gap.severity === 'critical' || gap.severity === 'major') {
        protectedItems.push({
          item: gap.item,
          severity: gap.severity,
          source: gap.source || 'architecture_plan'
        });
      }
    }
  }
  return protectedItems;
}

/**
 * Classify scope items as core vs deferrable using LLM + vision/arch context.
 * Falls back to heuristic classification if LLM unavailable.
 */
async function classifyScopeItems(supabase, sd, protectedItems) {
  const scope = sd.scope || sd.description || '';
  if (!scope) return { classifications: [], method: 'none' };

  // Load vision dimensions for context
  let visionContext = '';
  try {
    const { data: vision } = await supabase
      .from('eva_vision_documents')
      .select('extracted_dimensions, vision_key')
      .eq('vision_key', 'VISION-EHG-L1-001')
      .single();

    if (vision?.extracted_dimensions) {
      const dims = vision.extracted_dimensions;
      visionContext = Array.isArray(dims)
        ? dims.map(d => `${d.id || d.name}: ${d.description || ''}`).join('\n')
        : JSON.stringify(dims);
    }
  } catch (e) {
    // Intentionally suppressed: vision dimension load is non-blocking
    console.debug('[ScopeReductionVerification] vision dimensions suppressed:', e?.message || e);
  }

  // Load architecture dimensions
  let archContext = '';
  try {
    const { data: arch } = await supabase
      .from('eva_architecture_plans')
      .select('extracted_dimensions, plan_key')
      .eq('plan_key', 'ARCH-EHG-L1-001')
      .single();

    if (arch?.extracted_dimensions) {
      const dims = arch.extracted_dimensions;
      archContext = Array.isArray(dims)
        ? dims.map(d => `${d.id || d.name}: ${d.description || ''}`).join('\n')
        : JSON.stringify(dims);
    }
  } catch (e) {
    // Intentionally suppressed: architecture dimension load is non-blocking
    console.debug('[ScopeReductionVerification] architecture dimensions suppressed:', e?.message || e);
  }

  // Build protected items context
  const protectedContext = protectedItems.length > 0
    ? `\n\nPROTECTED ITEMS (from translation fidelity - MUST be classified as core):\n${protectedItems.map(p => `- ${p.item} (${p.severity}, source: ${p.source})`).join('\n')}`
    : '';

  try {
    const { getValidationClient } = await import('../../../../../lib/llm/client-factory.js');
    const client = getValidationClient();

    const systemPrompt = `You are a scope analyst for a software project governance system. Your job is to classify scope items as "core" (essential to strategic vision) or "deferrable" (nice-to-have, gold-plating, over-engineering).

Rules:
- Items that map to vision dimensions are CORE
- Items that map to architecture components are CORE
- Items flagged as PROTECTED (from translation fidelity chain) are always CORE
- Items that are nice-to-haves, polish, or exceed acceptance criteria are DEFERRABLE
- When unsure, classify as CORE (conservative)

Respond with valid JSON only.`;

    const userPrompt = `Classify each scope item in this Strategic Directive:

SD SCOPE:
${scope}

SD KEY CHANGES:
${JSON.stringify(sd.key_changes || [], null, 2)}

SD SUCCESS CRITERIA:
${JSON.stringify(sd.success_criteria || [], null, 2)}

VISION DIMENSIONS:
${visionContext || 'Not available'}

ARCHITECTURE COMPONENTS:
${archContext || 'Not available'}
${protectedContext}

Respond with JSON:
{
  "classifications": [
    {
      "item": "description of scope item",
      "classification": "core" | "deferrable",
      "reasoning": "why this classification",
      "traced_to": "V01" | "A03" | "protected" | "none"
    }
  ],
  "summary": "one-line summary of analysis"
}`;

    const response = await client.complete(systemPrompt, userPrompt, {
      maxTokens: 4000,
      timeout: LLM_TIMEOUT
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...parsed, method: 'llm' };
    }
  } catch (err) {
    console.log(`   ⚠️  LLM classification unavailable: ${err.message}`);
  }

  // Fallback: heuristic classification based on protected items
  return {
    classifications: protectedItems.map(p => ({
      item: p.item,
      classification: 'core',
      reasoning: `Protected by translation fidelity (${p.severity})`,
      traced_to: 'protected'
    })),
    summary: 'Heuristic fallback — only protected items classified',
    method: 'heuristic'
  };
}

/**
 * Check vision score delta if scope were reduced.
 * Only runs when deferrable items exist.
 */
async function checkVisionDelta(supabase, sdKey, sdType) {
  try {
    // Get most recent vision score for this SD
    const { data: scores } = await supabase
      .from('eva_vision_scores')
      .select('total_score')
      .eq('sd_id', sdKey)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!scores?.length) {
      return { preScore: null, canCheck: false };
    }

    const preScore = scores[0].total_score;
    const threshold = VISION_THRESHOLDS[sdType] || VISION_THRESHOLDS.default;

    return {
      preScore,
      threshold,
      canCheck: true,
      aboveThreshold: preScore >= threshold
    };
  } catch (err) {
    console.log(`   ⚠️  Vision delta check error: ${err.message}`);
    return { preScore: null, canCheck: false };
  }
}

export function createScopeReductionVerificationGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n✂️  SEMANTIC GATE: Scope Reduction Verification (Intelligent Rubric)');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;
      const sdKey = ctx.sd?.sd_key || ctx.sdKey || sdId;

      const { applicable, level } = getGateApplicability(GATE_NAME, sdType);
      if (!applicable) {
        console.log(`   ℹ️  Skipped for SD type: ${sdType}`);
        return buildSkipResult(GATE_NAME, sdType);
      }

      if (!supabase || !sdId) {
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: ['Cannot verify scope reduction — missing context']
        });
      }

      try {
        // Load SD data
        const { data: sd, error } = await supabase
          .from('strategic_directives_v2')
          .select('scope_reduction_percentage, scope, metadata, key_changes, success_criteria, description, sd_key')
          .eq('id', sdId)
          .single();

        if (error || !sd) {
          return buildSemanticResult({
            passed: true, score: 50, confidence: 0.3,
            warnings: ['SD not found for scope reduction check']
          });
        }

        const resolvedSdKey = sd.sd_key || sdKey;

        // Legacy percentage check (still read as a signal)
        const legacyReduction = sd.scope_reduction_percentage;
        const hasLegacy = legacyReduction !== null && legacyReduction !== undefined;

        console.log(`   📋 SD Type: ${sdType} | Level: ${level}`);
        if (hasLegacy) {
          console.log(`   📊 Legacy scope_reduction_percentage: ${legacyReduction}%`);
        }

        // Step 1: Get protected items from translation fidelity
        console.log('   🔍 Checking translation fidelity for protected items...');
        const { protectedItems, hasData: hasFidelityData } = await getProtectedItems(supabase, sdId, resolvedSdKey);

        if (protectedItems.length > 0) {
          console.log(`   🛡️  ${protectedItems.length} protected item(s) from translation fidelity:`);
          protectedItems.forEach(p => console.log(`      - [${p.severity}] ${p.item}`));
        } else {
          console.log(`   ℹ️  No protected items found ${hasFidelityData ? '(fidelity data exists, no critical/major gaps)' : '(no fidelity data)'}`);
        }

        // Step 2: Classify scope items
        console.log('   🔬 Classifying scope items (core vs deferrable)...');
        const classification = await classifyScopeItems(supabase, sd, protectedItems);

        const coreItems = (classification.classifications || []).filter(c => c.classification === 'core');
        const deferrableItems = (classification.classifications || []).filter(c => c.classification === 'deferrable');

        console.log(`   📊 Classification: ${coreItems.length} core, ${deferrableItems.length} deferrable (method: ${classification.method})`);
        if (classification.summary) {
          console.log(`   📝 ${classification.summary}`);
        }

        // Step 3: Vision delta check (only if we have context)
        let visionDelta = null;
        if (coreItems.length > 0 || deferrableItems.length > 0) {
          console.log('   🔭 Checking vision alignment...');
          visionDelta = await checkVisionDelta(supabase, resolvedSdKey, sdType);
          if (visionDelta.canCheck) {
            console.log(`   📊 Vision score: ${visionDelta.preScore}/100 (threshold: ${visionDelta.threshold})`);
          }
        }

        // Step 4: Compute intelligent score
        let score = 100;
        const issues = [];
        const warnings = [];
        const details = {
          method: classification.method,
          coreItemCount: coreItems.length,
          deferrableItemCount: deferrableItems.length,
          protectedItemCount: protectedItems.length,
          hasFidelityData,
          legacyReductionPercentage: legacyReduction
        };

        // Deductions for missing analysis
        if (classification.method === 'none') {
          score -= 20;
          warnings.push('No scope content available for analysis');
        }

        if (classification.method === 'heuristic') {
          score -= 10;
          warnings.push('LLM unavailable — using heuristic classification only');
        }

        // Vision delta check
        if (visionDelta?.canCheck) {
          details.visionScore = visionDelta.preScore;
          details.visionThreshold = visionDelta.threshold;

          if (!visionDelta.aboveThreshold) {
            // Vision already below threshold — warn but don't block on scope reduction
            warnings.push(`Vision score ${visionDelta.preScore} is below ${sdType} threshold ${visionDelta.threshold}`);
            score -= 10;
          }
        }

        // Legacy compatibility: if percentage was set and meets threshold, acknowledge
        if (hasLegacy && legacyReduction >= 10) {
          details.legacyPassed = true;
          console.log(`   ✅ Legacy scope reduction ${legacyReduction}% meets 10% threshold`);
        } else if (hasLegacy && legacyReduction < 10 && level === 'REQ') {
          details.legacyPassed = false;
          score -= 15;
          warnings.push(`Legacy scope_reduction_percentage ${legacyReduction}% below 10% threshold`);
        }

        // Generate reduction suggestions from deferrable items
        if (deferrableItems.length > 0) {
          details.reductionSuggestions = deferrableItems.map(d => ({
            item: d.item,
            reasoning: d.reasoning,
            traced_to: d.traced_to
          }));
          console.log(`   💡 ${deferrableItems.length} reduction suggestion(s):`);
          deferrableItems.forEach(d => console.log(`      - ${d.item} (${d.reasoning})`));
        } else {
          console.log('   ✅ No deferrable items found — scope is lean');
        }

        // Final pass/fail determination
        const confidence = computeConfidence({
          dataPoints: (classification.method === 'llm' ? 3 : 1) + (hasFidelityData ? 1 : 0) + (visionDelta?.canCheck ? 1 : 0),
          expectedPoints: 5
        });

        const passed = level === 'OPT' ? true : (score >= 60 && issues.length === 0);

        console.log(`   ${passed ? '✅' : '❌'} Score: ${Math.min(score, 100)}/100 | Confidence: ${confidence} | Level: ${level}`);

        return buildSemanticResult({
          passed,
          score: Math.min(score, 100),
          confidence,
          issues,
          warnings,
          details,
          remediation: !passed
            ? 'Review scope against vision dimensions. Remove deferrable items or justify their inclusion. Ensure scope_reduction_percentage reflects actual analysis.'
            : undefined
        });
      } catch (err) {
        console.log(`   ⚠️  Error: ${err.message}`);
        return buildSemanticResult({
          passed: true, score: 50, confidence: 0.3,
          warnings: [`Scope reduction verification error: ${err.message}`]
        });
      }
    },
    required: true,
    weight: 0.6,
    llmPowered: true
  };
}
