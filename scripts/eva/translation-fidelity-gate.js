/**
 * Translation Fidelity Gate Engine
 *
 * Compares upstream EVA artifacts against downstream artifacts to detect
 * translation gaps where ideas, constraints, and decisions are lost.
 *
 * Gate types:
 *   - brainstorm_to_vision: Brainstorm session → Vision document
 *   - vision_to_architecture: Vision → Architecture plan
 *   - architecture_to_sd: Architecture plan → Strategic Directive
 *
 * @module scripts/eva/translation-fidelity-gate
 * @created 2026-03-11 SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Sanitize string by replacing invalid Unicode surrogates with U+FFFD.
 * JSON.stringify can produce \uD8XX sequences from lone surrogates in source data,
 * which are invalid JSON per RFC 8259 and rejected by LLM APIs.
 */
function sanitizeUnicode(value) {
  if (typeof value !== 'string') return String(value);
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += value[i] + value[i + 1];
        i++;
      } else {
        result += '\uFFFD';
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      result += '\uFFFD';
    } else {
      result += value[i];
    }
  }
  return result;
}

/**
 * Evaluate translation fidelity between upstream and downstream artifacts.
 *
 * @param {Object} upstream - Upstream content {type, id, key, content, dimensions}
 * @param {Object} downstream - Downstream content {type, id, key, content, dimensions}
 * @param {string} gateType - One of: brainstorm_to_vision, vision_to_architecture, architecture_to_sd
 * @returns {Object} Gate result: {passed, score, maxScore, gaps, details}
 */
export async function evaluateTranslationFidelity(upstream, downstream, gateType) {
  const startTime = Date.now();

  try {
    // Build comparison prompt based on gate type
    const { systemPrompt, userPrompt } = buildPrompts(upstream, downstream, gateType);

    // Call LLM for comparison
    let client;
    try {
      const { getValidationClient } = await import('../../lib/llm/client-factory.js');
      client = getValidationClient();
    } catch (e) {
      console.warn(`   ⚠️  LLM client unavailable: ${e.message}`);
      return buildFallbackResult(gateType, 'LLM client unavailable');
    }

    let response;
    try {
      response = await client.complete(systemPrompt, userPrompt);
    } catch (e) {
      console.warn(`   ⚠️  LLM call failed: ${e.message}`);
      return buildFallbackResult(gateType, `LLM call failed: ${e.message}`);
    }

    // Parse LLM response
    const text = typeof response === 'string' ? response : response?.content || response?.text || '';
    const parsed = parseGateResponse(text);

    const result = {
      passed: parsed.score >= 70,
      score: parsed.score,
      maxScore: 100,
      gaps: parsed.gaps || [],
      issues: parsed.gaps?.filter(g => g.severity === 'critical') || [],
      warnings: parsed.gaps?.filter(g => g.severity !== 'critical') || [],
      details: {
        gate_type: gateType,
        model_used: client.modelId || 'unknown',
        duration_ms: Date.now() - startTime,
        reasoning: parsed.reasoning || '',
        coverage_areas: parsed.coverage_areas || [],
      }
    };

    return result;
  } catch (e) {
    console.warn(`   ⚠️  Translation gate error: ${e.message}`);
    return buildFallbackResult(gateType, e.message);
  }
}

/**
 * Run a gate and persist the result to eva_translation_gates.
 * Non-blocking — errors are logged but don't throw.
 */
export async function runAndPersistGate(upstream, downstream, gateType) {
  try {
    console.log(`\n🔍 Translation Fidelity Gate: ${formatGateType(gateType)}`);

    const result = await evaluateTranslationFidelity(upstream, downstream, gateType);

    // Persist to database
    const { error } = await supabase
      .from('eva_translation_gates')
      .insert({
        gate_type: gateType,
        source_refs: Array.isArray(upstream) ? upstream.map(u => ({ type: u.type, id: u.id, key: u.key })) : [{ type: upstream.type, id: upstream.id, key: upstream.key }],
        target_ref: { type: downstream.type, id: downstream.id, key: downstream.key },
        coverage_score: result.score,
        gaps: result.gaps,
        passed: result.passed,
        metadata: result.details,
      });

    if (error) {
      console.warn(`   ⚠️  Gate result persistence failed: ${error.message}`);
    } else {
      const icon = result.passed ? '✅' : '⚠️';
      console.log(`   ${icon} Coverage: ${result.score}/100 | Gaps: ${result.gaps.length} | ${result.passed ? 'PASSED' : 'NEEDS REVIEW'}`);
    }

    return result;
  } catch (e) {
    console.warn(`   ⚠️  Translation gate failed (non-blocking): ${e.message}`);
    return null;
  }
}

// --- Gate 1: Brainstorm → Vision ---

export async function runBrainstormToVisionGate(brainstormId, visionData) {
  // Fetch brainstorm session
  const { data: brainstorm, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, domain, outcome_type, matched_capabilities, new_capability_candidates, metadata')
    .eq('id', brainstormId)
    .single();

  if (error || !brainstorm) {
    console.warn(`   ⚠️  Brainstorm ${brainstormId} not found, skipping Gate 1`);
    return null;
  }

  const upstream = {
    type: 'brainstorm_session',
    id: brainstorm.id,
    key: brainstormId,
    content: JSON.stringify({
      domain: brainstorm.domain,
      outcome_type: brainstorm.outcome_type,
      capabilities: brainstorm.matched_capabilities,
      new_candidates: brainstorm.new_capability_candidates,
      metadata: brainstorm.metadata,
    }),
    dimensions: [],
  };

  const downstream = {
    type: 'eva_vision_document',
    id: visionData.id,
    key: visionData.vision_key,
    content: visionData.content || '',
    dimensions: visionData.extracted_dimensions || [],
  };

  return runAndPersistGate(upstream, downstream, 'brainstorm_to_vision');
}

// --- Gate 2: Vision → Architecture ---

export async function runVisionToArchitectureGate(visionId, archData) {
  // Fetch vision document
  const { data: vision, error } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, content, extracted_dimensions, source_brainstorm_id')
    .eq('id', visionId)
    .single();

  if (error || !vision) {
    console.warn(`   ⚠️  Vision ${visionId} not found, skipping Gate 2`);
    return null;
  }

  const upstreams = [
    {
      type: 'eva_vision_document',
      id: vision.id,
      key: vision.vision_key,
      content: vision.content || '',
      dimensions: vision.extracted_dimensions || [],
    }
  ];

  // Also include brainstorm if available
  if (vision.source_brainstorm_id) {
    const { data: brainstorm } = await supabase
      .from('brainstorm_sessions')
      .select('id, domain, matched_capabilities, metadata')
      .eq('id', vision.source_brainstorm_id)
      .single();

    if (brainstorm) {
      upstreams.push({
        type: 'brainstorm_session',
        id: brainstorm.id,
        key: vision.source_brainstorm_id,
        content: JSON.stringify(brainstorm.metadata || {}),
        dimensions: [],
      });
    }
  }

  const downstream = {
    type: 'eva_architecture_plan',
    id: archData.id,
    key: archData.plan_key,
    content: archData.content || '',
    dimensions: archData.extracted_dimensions || [],
  };

  return runAndPersistGate(upstreams, downstream, 'vision_to_architecture');
}

// --- Gate 3: Architecture → SD ---

export async function runArchitectureToSDGate(archKey, sdData) {
  // Fetch architecture plan
  const { data: arch, error } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, content, extracted_dimensions, vision_id, sections')
    .eq('plan_key', archKey)
    .single();

  if (error || !arch) {
    console.warn(`   ⚠️  Architecture plan ${archKey} not found, skipping Gate 3`);
    return null;
  }

  const upstreams = [
    {
      type: 'eva_architecture_plan',
      id: arch.id,
      key: arch.plan_key,
      content: arch.content || '',
      dimensions: arch.extracted_dimensions || [],
      sections: arch.sections,
    }
  ];

  // Include vision if linked
  if (arch.vision_id) {
    const { data: vision } = await supabase
      .from('eva_vision_documents')
      .select('id, vision_key, extracted_dimensions')
      .eq('id', arch.vision_id)
      .single();

    if (vision) {
      upstreams.push({
        type: 'eva_vision_document',
        id: vision.id,
        key: vision.vision_key,
        content: '',
        dimensions: vision.extracted_dimensions || [],
      });
    }
  }

  const downstream = {
    type: 'strategic_directive',
    id: sdData.id || sdData.sd_key,
    key: sdData.sd_key,
    content: JSON.stringify({
      title: sdData.title,
      description: sdData.description,
      key_changes: sdData.key_changes,
      success_criteria: sdData.success_criteria,
    }),
    dimensions: [],
  };

  return runAndPersistGate(upstreams, downstream, 'architecture_to_sd');
}

// --- Prompt Building ---

function buildPrompts(upstream, downstream, gateType) {
  const upstreams = Array.isArray(upstream) ? upstream : [upstream];

  const systemPrompt = `You are a Translation Fidelity Analyst. Your job is to compare upstream source artifacts against a downstream artifact and identify translation gaps — ideas, constraints, decisions, or requirements that were present upstream but lost or diluted downstream.

Respond with valid JSON only:
{
  "score": <integer 0-100>,
  "reasoning": "<brief explanation>",
  "coverage_areas": [{"area": "<topic>", "covered": <boolean>, "notes": "<detail>"}],
  "gaps": [{"item": "<what was lost>", "source": "<upstream artifact>", "severity": "critical|major|minor"}]
}

Scoring guide:
- 90-100: Excellent fidelity, all key items preserved
- 70-89: Good fidelity, minor items may be missing
- 50-69: Moderate gaps, some important items lost
- 0-49: Significant translation loss`;

  const gateDescriptions = {
    brainstorm_to_vision: 'Brainstorm Session → Vision Document. Check that brainstorm themes, constraints, personas, and decisions are reflected in the vision.',
    vision_to_architecture: 'Vision Document → Architecture Plan. Check that vision dimensions are addressed by architecture components and that constraints are honored.',
    architecture_to_sd: 'Architecture Plan → Strategic Directive. Check that architecture phases decompose into the SD scope and that vision goals are actionable.',
  };

  const upstreamText = upstreams.map((u, i) => {
    let text = `--- Upstream ${i + 1}: ${u.type} (${u.key}) ---\n`;
    if (u.dimensions?.length) {
      text += `Dimensions: ${sanitizeUnicode(JSON.stringify(u.dimensions))}\n`;
    }
    if (u.content) {
      text += `Content: ${sanitizeUnicode(u.content.substring(0, 3000))}\n`;
    }
    return text;
  }).join('\n');

  const downstreamText = `--- Downstream: ${downstream.type} (${downstream.key}) ---
${downstream.dimensions?.length ? `Dimensions: ${sanitizeUnicode(JSON.stringify(downstream.dimensions))}\n` : ''}Content: ${sanitizeUnicode((downstream.content || '').substring(0, 3000))}`;

  const userPrompt = `Gate: ${gateDescriptions[gateType]}

${upstreamText}

${downstreamText}

Analyze the translation fidelity. Identify what was preserved and what was lost.`;

  return { systemPrompt, userPrompt };
}

// --- Response Parsing ---

function parseGateResponse(text) {
  // Try to extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.min(100, Math.max(0, parseInt(parsed.score) || 0)),
        reasoning: parsed.reasoning || '',
        coverage_areas: parsed.coverage_areas || [],
        gaps: (parsed.gaps || []).map(g => ({
          item: g.item || 'Unknown',
          source: g.source || 'Unknown',
          severity: ['critical', 'major', 'minor'].includes(g.severity) ? g.severity : 'minor',
        })),
      };
    } catch (e) {
      // JSON parse failed
    }
  }

  // Fallback: couldn't parse
  return { score: 0, reasoning: 'Could not parse LLM response', gaps: [], coverage_areas: [] };
}

function buildFallbackResult(gateType, reason) {
  return {
    passed: true, // Advisory — don't block on failure
    score: 0,
    maxScore: 100,
    gaps: [],
    issues: [],
    warnings: [{ message: `Gate skipped: ${reason}` }],
    details: {
      gate_type: gateType,
      error: reason,
      duration_ms: 0,
    }
  };
}

function formatGateType(gateType) {
  const labels = {
    brainstorm_to_vision: 'Brainstorm → Vision',
    vision_to_architecture: 'Vision → Architecture',
    architecture_to_sd: 'Architecture → SD',
  };
  return labels[gateType] || gateType;
}
