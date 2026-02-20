#!/usr/bin/env node

/**
 * Dynamic Vision Alignment Scoring Engine
 * SD: SD-MAN-INFRA-DYNAMIC-VISION-ALIGNMENT-001
 *
 * Reads Vision + Architecture documents from eva_vision_documents /
 * eva_architecture_plans, converts extracted_dimensions to rubric criteria,
 * calls the LLM to score a given SD or build scope against each dimension,
 * and persists results to eva_vision_scores.
 *
 * Reuses the evaluateWithAI() pattern from rubric-evaluator.js.
 * LLM calls use getValidationClient().complete(systemPrompt, userPrompt).
 *
 * Usage:
 *   node scripts/eva/vision-scorer.js --sd-id <SD-KEY>
 *   node scripts/eva/vision-scorer.js --sd-id <SD-KEY> --vision-key <KEY> --arch-key <KEY>
 *   node scripts/eva/vision-scorer.js --sd-id <SD-KEY> --dry-run
 *   node scripts/eva/vision-scorer.js --sd-id <SD-KEY> --scope "custom description"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getValidationClient, isLocalLLMEnabled } from '../../lib/llm/client-factory.js';
import { spawnSync } from 'child_process';
import { GRADE } from '../../lib/standards/grade-scale.js';
import { publishVisionEvent, VISION_EVENTS, registerVisionScoredHandlers } from '../../lib/eva/event-bus/index.js';

dotenv.config();

const MAX_CONTENT_CHARS = 8000;
const MAX_PARSE_RETRIES = 1;

// Score thresholds (FR-004) — standard U.S. grading scale (lib/standards/grade-scale.js)
const THRESHOLDS = {
  ACCEPT:        GRADE.A,        // 93+ — A grade, no corrective action needed
  MINOR_SD:      GRADE.B,        // 83-92 — B/A- range, minor enhancement SD
  GAP_CLOSURE_SD: GRADE.C_MINUS, // 70-82 — C/B- range, gap-closure SD
};

/**
 * Load Vision dimensions from eva_vision_documents.
 * @param {Object} supabase
 * @param {string} visionKey - e.g. 'VISION-EHG-L1-001'
 * @returns {Promise<{id: string, dimensions: Array}>}
 */
async function loadVisionDimensions(supabase, visionKey) {
  const { data, error } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, extracted_dimensions, status')
    .eq('vision_key', visionKey)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Vision document not found: ${visionKey} (${error?.message || 'no rows'})`);
  }

  if (!data.extracted_dimensions?.length) {
    throw new Error(`Vision ${visionKey} has no extracted_dimensions`);
  }

  return { id: data.id, dimensions: data.extracted_dimensions };
}

/**
 * Load Architecture dimensions from eva_architecture_plans.
 * @param {Object} supabase
 * @param {string} archKey - e.g. 'ARCH-EHG-L1-001'
 * @returns {Promise<{id: string, dimensions: Array}>}
 */
async function loadArchDimensions(supabase, archKey) {
  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, extracted_dimensions, status')
    .eq('plan_key', archKey)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Architecture plan not found: ${archKey} (${error?.message || 'no rows'})`);
  }

  if (!data.extracted_dimensions?.length) {
    throw new Error(`Architecture plan ${archKey} has no extracted_dimensions`);
  }

  return { id: data.id, dimensions: data.extracted_dimensions };
}

/**
 * Load SD description from strategic_directives_v2.
 * @param {Object} supabase
 * @param {string} sdKey
 * @returns {Promise<{uuid: string, title: string, description: string}>}
 */
async function loadSDContext(supabase, sdKey) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, description, key_changes, success_criteria, sd_type')
    .eq('sd_key', sdKey)
    .single();

  if (error || !data) {
    throw new Error(`SD not found: ${sdKey}`);
  }

  return {
    uuid: data.id,
    title: data.title,
    description: data.description || '',
    key_changes: data.key_changes || [],
    success_criteria: data.success_criteria || [],
    sd_type: data.sd_type,
  };
}

/**
 * Convert extracted_dimensions to rubric criteria format.
 * Each dimension becomes a scoring criterion with id, name, weight, description.
 * @param {Array} dimensions
 * @param {string} prefix - 'V' for vision, 'A' for architecture
 * @returns {Array}
 */
function dimensionsToCriteria(dimensions, prefix) {
  return dimensions.map((dim, i) => ({
    id: `${prefix}${String(i + 1).padStart(2, '0')}`,
    name: dim.name,
    weight: dim.weight || (1 / dimensions.length),
    description: dim.description,
    source_section: dim.source_section || '',
  }));
}

/**
 * Build the LLM system prompt for vision alignment scoring.
 */
function buildScoringSystemPrompt(visionCriteria, archCriteria) {
  const allCriteria = [...visionCriteria, ...archCriteria];

  const criteriaList = allCriteria.map(c =>
    `- ${c.id} [${c.name}] (weight: ${c.weight.toFixed(2)}): ${c.description}`
  ).join('\n');

  return `You are an expert EVA Vision Alignment Evaluator for the EHG portfolio governance system.
Your task is to score a Strategic Directive (SD) against ${allCriteria.length} vision and architecture dimensions.

SCORING DIMENSIONS:
${criteriaList}

SCORING SCALE:
- 0-59:  F — SD fails to address or conflicts with this dimension
- 60-69: D — SD partially addresses dimension with significant gaps
- 70-79: C — SD meets minimum dimension requirements
- 80-89: B — SD aligns well with this dimension
- 90-100: A — SD exemplifies or strongly advances this dimension (A-: 90-92, A: 93-96, A+: 97-100)

RESPOND WITH ONLY valid JSON matching this exact structure:
{
  "dimensions": [
    {
      "id": "<dimension_id>",
      "name": "<dimension_name>",
      "score": <0-100>,
      "reasoning": "<2-3 sentence explanation of score>",
      "gaps": ["<gap 1>", "<gap 2>"]
    }
  ],
  "total_score": <0-100>,
  "summary": "<1-2 sentence overall alignment summary>"
}

You MUST include ALL ${allCriteria.length} dimensions: ${allCriteria.map(c => c.id).join(', ')}.
Return ONLY the JSON object. No markdown code fences. No additional text.`;
}

/**
 * Build the LLM user prompt describing the SD/scope to score.
 */
function buildScoringUserPrompt(sdContext, customScope) {
  const scope = customScope || [
    `Title: ${sdContext.title}`,
    sdContext.description ? `Description: ${sdContext.description.substring(0, MAX_CONTENT_CHARS)}` : '',
    sdContext.key_changes?.length
      ? `Key Changes: ${sdContext.key_changes.map(k => (typeof k === 'string' ? k : k.description || JSON.stringify(k))).join('; ')}`
      : '',
    sdContext.success_criteria?.length
      ? `Success Criteria: ${sdContext.success_criteria.map(s => (typeof s === 'string' ? s : JSON.stringify(s))).join('; ')}`
      : '',
    `SD Type: ${sdContext.sd_type}`,
  ].filter(Boolean).join('\n');

  return `STRATEGIC DIRECTIVE TO EVALUATE:
${scope}

Evaluate this SD against ALL provided vision and architecture dimensions.
Return ONLY valid JSON as specified.`;
}

/**
 * Parse and validate LLM response.
 */
function parseAndValidateResponse(text, allCriteria) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.dimensions)) {
    throw new Error('Response missing "dimensions" array');
  }

  if (typeof parsed.total_score !== 'number' || parsed.total_score < 0 || parsed.total_score > 100) {
    throw new Error(`Invalid total_score: ${parsed.total_score}`);
  }

  const expectedIds = new Set(allCriteria.map(c => c.id));
  const foundIds = new Set(parsed.dimensions.map(d => d.id));

  for (const id of expectedIds) {
    if (!foundIds.has(id)) {
      throw new Error(`Missing dimension in response: ${id}`);
    }
  }

  return parsed;
}

/**
 * Classify total score into threshold action.
 */
function classifyScore(totalScore) {
  if (totalScore >= THRESHOLDS.ACCEPT) return 'accept';
  if (totalScore >= THRESHOLDS.MINOR_SD) return 'minor_sd';
  if (totalScore >= THRESHOLDS.GAP_CLOSURE_SD) return 'gap_closure_sd';
  return 'escalate';
}

/**
 * Main scoring function.
 * @param {Object} options
 * @param {string} options.sdKey - SD key to score (e.g. 'SD-MAN-INFRA-...')
 * @param {string} [options.visionKey] - Vision key (default: 'VISION-EHG-L1-001')
 * @param {string} [options.archKey] - Architecture key (default: 'ARCH-EHG-L1-001')
 * @param {string} [options.scope] - Custom scope description (overrides SD lookup)
 * @param {boolean} [options.dryRun] - Skip DB writes
 * @param {Object} [options.supabase] - Supabase client override
 * @param {Object} [options.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Scoring result
 */

/**
 * Write dimension-level gaps to eva_vision_gaps after a below-threshold score.
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-034 / PAT-MAN-17c94d08
 *
 * Only writes dimensions that score below the escalate threshold (70).
 * Skips dimensions that already have an open gap to avoid duplicates.
 */
async function writeVisionGaps(supabase, sdKey, scoreId, dimensionScores) {
  const ESCALATE_THRESHOLD = 70;
  const weakDims = Object.entries(dimensionScores)
    .filter(([, score]) => typeof score === 'number' && score < ESCALATE_THRESHOLD);

  if (weakDims.length === 0) return;

  // Check existing open gaps for this SD to avoid duplicates
  const { data: existing } = await supabase
    .from('eva_vision_gaps')
    .select('dimension_key')
    .eq('sd_id', sdKey)
    .eq('status', 'open');
  const existingDims = new Set((existing || []).map(r => r.dimension_key));

  const gaps = weakDims
    .filter(([key]) => !existingDims.has(key))
    .map(([key, score]) => ({
      sd_id: sdKey,
      vision_score_id: scoreId,
      dimension_key: key,
      dimension_score: score,
      severity: score < 50 ? 'high' : 'medium',
      status: 'open',
      gap_description: `Dimension ${key} scored ${score}/100 (below escalate threshold of ${ESCALATE_THRESHOLD})`,
    }));

  if (gaps.length === 0) return;

  const { error } = await supabase.from('eva_vision_gaps').insert(gaps);
  if (error) throw new Error(`eva_vision_gaps insert failed: ${error.message}`);
  console.log(`   📊 Wrote ${gaps.length} gap(s) to eva_vision_gaps for ${sdKey}`);
}

export async function scoreSD(options = {}) {
  const {
    sdKey,
    visionKey = 'VISION-EHG-L1-001',
    archKey = 'ARCH-EHG-L1-001',
    scope: customScope,
    dryRun = false,
    supabase: supabaseOverride,
    llmClient: llmClientOverride,
  } = options;

  const supabase = supabaseOverride || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Register vision event handlers (idempotent — safe to call on every scoreSD() invocation).
  // Handlers are subscribed here so they are always registered before vision.scored is published,
  // even in standalone CLI usage (SD-MAN-INFRA-EVENT-BUS-BACKBONE-001).
  if (!dryRun) registerVisionScoredHandlers();

  // Load dimensions
  const [visionResult, archResult] = await Promise.all([
    loadVisionDimensions(supabase, visionKey),
    loadArchDimensions(supabase, archKey),
  ]);

  const visionCriteria = dimensionsToCriteria(visionResult.dimensions, 'V');
  const archCriteria = dimensionsToCriteria(archResult.dimensions, 'A');
  const allCriteria = [...visionCriteria, ...archCriteria];

  // Load SD context (unless custom scope provided)
  let sdContext = null;
  let sdUuid = null;
  if (sdKey) {
    sdContext = await loadSDContext(supabase, sdKey);
    sdUuid = sdContext.uuid;
  }

  // Build prompts
  const systemPrompt = buildScoringSystemPrompt(visionCriteria, archCriteria);
  const userPrompt = buildScoringUserPrompt(sdContext || {}, customScope);

  // SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001:
  // Route to local programmatic scorer when USE_PROGRAMMATIC=true or local LLM is enabled.
  // This avoids the OpenAI gpt-5.2 timeout that blocks EVA SDs at GATE_VISION_SCORE.
  if (!llmClientOverride && (process.env.USE_PROGRAMMATIC === 'true' || isLocalLLMEnabled())) {
    const scriptPath = fileURLToPath(new URL('../programmatic/vision-scorer.js', import.meta.url));
    const result = spawnSync(
      process.execPath,
      [scriptPath, '--sd-id', sdKey ?? 'unknown'],
      { encoding: 'utf8', timeout: 55000, env: process.env }
    );
    if (result.status === 0 && result.stdout) {
      try {
        const scoreData = JSON.parse(result.stdout.trim());
        console.log(`   ✅ Programmatic vision scorer: ${scoreData.total_score}/100 (${scoreData.action})`);
        return scoreData;
      } catch {
        console.warn('   ⚠️  Programmatic scorer output parse failed — falling back to cloud LLM');
      }
    } else {
      console.warn(`   ⚠️  Programmatic scorer failed (exit ${result.status}) — falling back to cloud LLM`);
      if (result.stderr) console.warn('   Stderr:', result.stderr.substring(0, 200));
    }
  }

  // Get LLM client
  const llmClient = llmClientOverride || getValidationClient();

  // Call LLM
  let rawResponse;
  let parsed;
  const startTime = Date.now();

  try {
    const result = await llmClient.complete(systemPrompt, userPrompt, { maxTokens: 4000 });
    rawResponse = result.content;
  } catch (err) {
    throw new Error(`LLM call failed: ${err.message}`);
  }

  // Parse with one retry
  try {
    parsed = parseAndValidateResponse(rawResponse, allCriteria);
  } catch (parseErr) {
    // Retry with repair prompt
    try {
      const repairPrompt = `Your previous response had errors: ${parseErr.message}
Fix and return ONLY valid JSON with all ${allCriteria.length} dimensions.
Previous response (truncated):
${rawResponse.substring(0, 1000)}`;
      const retry = await llmClient.complete(systemPrompt, repairPrompt, { maxTokens: 4000 });
      parsed = parseAndValidateResponse(retry.content, allCriteria);
    } catch {
      throw new Error(`LLM response parse failed after retry: ${parseErr.message}`);
    }
  }

  const latencyMs = Date.now() - startTime;

  // Build dimension scores JSONB
  const dimensionScores = {};
  for (const dim of parsed.dimensions) {
    const criterion = allCriteria.find(c => c.id === dim.id);
    dimensionScores[dim.id] = {
      name: dim.name,
      score: dim.score,
      weight: criterion?.weight || 0,
      reasoning: dim.reasoning,
      gaps: dim.gaps || [],
      source: dim.id.startsWith('V') ? 'vision' : 'architecture',
    };
  }

  const thresholdAction = classifyScore(parsed.total_score);

  // sd_id is a TEXT soft reference to the SD key (not UUID) in eva_vision_scores
  const scoreRecord = {
    vision_id: visionResult.id,
    arch_plan_id: archResult.id,
    sd_id: sdKey || null,  // TEXT column — store the SD key string, not UUID
    total_score: parsed.total_score,
    dimension_scores: dimensionScores,
    threshold_action: thresholdAction,
    rubric_snapshot: {
      vision_key: visionKey,
      arch_key: archKey,
      criteria_count: allCriteria.length,
      criteria: allCriteria.map(c => ({ id: c.id, name: c.name, weight: c.weight })),
      summary: parsed.summary,
      latency_ms: latencyMs,
    },
  };

  // Persist to DB (unless dry run)
  if (!dryRun) {
    const { data: inserted, error: insertError } = await supabase
      .from('eva_vision_scores')
      .insert(scoreRecord)
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`Failed to persist score: ${insertError.message}`);
    }

    scoreRecord.id = inserted.id;

    // Publish vision.scored event — notification orchestrator and Telegram adapter
    // subscribe via event bus (SD-MAN-INFRA-EVENT-BUS-BACKBONE-001).
    // Errors are caught per-subscriber in the event bus; never fail the scoring run.
    publishVisionEvent(VISION_EVENTS.SCORED, {
      supabase,
      sdKey: sdKey || '(custom scope)',
      sdTitle: sdContext?.title || '',
      totalScore: parsed.total_score,
      dimensionScores,
      scoreId: inserted.id,
    });

    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-034: write gaps to eva_vision_gaps when dimensions
    // score below threshold. Non-blocking — never fail the scoring run.
    // PAT-MAN-17c94d08: eva_vision_gaps table had no writer; this closes the loop.
    if (sdKey && thresholdAction !== 'accept' && dimensionScores) {
      writeVisionGaps(supabase, sdKey, inserted.id, dimensionScores).catch(err =>
        console.warn(`[vision-scorer] Gap write failed for ${sdKey}: ${err.message}`)
      );
    }

    // SD-CORR-VIS-A05-EVENT-BUS-001: Publish gap_detected for low-scoring dimensions
    if (sdKey && dimensionScores) {
      for (const [dimId, dim] of Object.entries(dimensionScores)) {
        if (typeof dim.score === 'number' && dim.score < 60) {
          publishVisionEvent(VISION_EVENTS.GAP_DETECTED, {
            sdKey,
            dimension: dim.name || dimId,
            dimId,
            score: dim.score,
            threshold: 60,
            scoreId: inserted.id,
            supabase,
          });
        }
      }
    }
  }

  // Expose summary and latency for callers even though they're in rubric_snapshot
  scoreRecord.summary = parsed.summary;
  scoreRecord.latency_ms = latencyMs;

  return scoreRecord;
}

// ============================================================================
// CLI entry point
// ============================================================================

const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  const args = process.argv.slice(2);

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const sdKey = getArg('--sd-id');
  const visionKey = getArg('--vision-key') || 'VISION-EHG-L1-001';
  const archKey = getArg('--arch-key') || 'ARCH-EHG-L1-001';
  const scope = getArg('--scope');
  const dryRun = args.includes('--dry-run');

  if (!sdKey && !scope) {
    console.error('Usage: node scripts/eva/vision-scorer.js --sd-id <SD-KEY> [--vision-key <KEY>] [--arch-key <KEY>] [--dry-run]');
    process.exit(1);
  }

  console.log('\n🔍 EVA Vision Alignment Scorer');
  console.log(`   SD:       ${sdKey || '(custom scope)'}`);
  console.log(`   Vision:   ${visionKey}`);
  console.log(`   Arch:     ${archKey}`);
  console.log(`   Dry Run:  ${dryRun}`);
  console.log('');

  scoreSD({ sdKey, visionKey, archKey, scope, dryRun })
    .then((result) => {
      console.log(`✅ Vision Alignment Score: ${result.total_score}/100`);
      console.log(`   Action: ${result.threshold_action.toUpperCase()}`);
      console.log(`   Dimensions scored: ${Object.keys(result.dimension_scores).length}`);
      if (result.summary) {
        console.log(`   Summary: ${result.summary}`);
      }
      if (dryRun) {
        console.log('\n   [DRY RUN] Score NOT persisted to database');
      } else {
        console.log(`   Score ID: ${result.id}`);
      }
      console.log('');

      // Print per-dimension scores
      console.log('   Per-Dimension Scores:');
      for (const [id, dim] of Object.entries(result.dimension_scores)) {
        const bar = '█'.repeat(Math.round(dim.score / 10)) + '░'.repeat(10 - Math.round(dim.score / 10));
        console.log(`   ${id} [${dim.source[0].toUpperCase()}] ${bar} ${dim.score}/100 — ${dim.name}`);
      }
    })
    .catch((err) => {
      // Graceful exit for "not found" errors (AC-004)
      if (err.message.includes('not found') || err.message.includes('no rows')) {
        console.warn('\n⚠️  Vision/Architecture document not found — scoring skipped');
        console.warn(`   Reason: ${err.message}`);
        process.exit(0);
      }
      console.error(`\n❌ Scoring failed: ${err.message}`);
      process.exit(1);
    });
}
