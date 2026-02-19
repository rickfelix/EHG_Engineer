#!/usr/bin/env node
/**
 * Programmatic Vision Scorer — Enhancement 1
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Scores an SD against the EVA vision using local Ollama (qwen3-coder:30b)
 * via the tool-use loop. Replaces the OpenAI gpt-5.2 path that times out.
 *
 * Usage:
 *   node scripts/programmatic/vision-scorer.js --sd-id SD-XXX-001 [--dry-run]
 *
 * Output (stdout): JSON { total_score, action, dimension_scores, dry_run? }
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool, createSupabaseUpsertTool } from '../../lib/programmatic/tools/supabase-tool.js';
import { createOllamaTool } from '../../lib/programmatic/tools/ollama-tool.js';

const { values: args } = parseArgs({
  options: {
    'sd-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const sdId = args['sd-id'];
const dryRun = args['dry-run'];

if (!sdId) {
  console.error('Usage: node scripts/programmatic/vision-scorer.js --sd-id SD-XXX-001 [--dry-run]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tools = [
  createSupabaseTool(supabase),
  createSupabaseUpsertTool(supabase),
  createOllamaTool(),
];

const SYSTEM_PROMPT = `You are an EVA vision alignment scorer. Your task is to:
1. Fetch the SD context using supabase_query on strategic_directives_v2
2. Fetch vision dimensions using supabase_query on eva_vision_documents
3. Fetch architecture dimensions using supabase_query on eva_architecture_plans
4. Build a scoring prompt from the SD and dimensions
5. Call call_local_llm with the scoring system prompt and built prompt
6. Parse the score JSON from the response
7. Persist the score using supabase_upsert on eva_vision_scores
8. Output ONLY the final JSON: {"total_score": N, "action": "...", "dimension_scores": {...}}

The score JSON from the LLM must have: total_score (0-100), action (one of: proceed, minor_sd, corrective_sd, block), dimension_scores (object).

For the scoring system prompt, use this rubric:
- Score 0-100 across 5 dimensions: innovation (20pts), strategic_alignment (25pts), feasibility (20pts), impact (25pts), sustainability (10pts)
- total_score = sum of all dimensions
- action: proceed (>=85), minor_sd (70-84), corrective_sd (50-69), block (<50) — adjust thresholds for infrastructure SDs (proceed >= 80)

Always output valid JSON in your final message.`;

const USER_PROMPT = `Score SD "${sdId}" against the EVA vision.

Steps:
1. Query strategic_directives_v2 WHERE sd_key = '${sdId}', select: title, description, strategic_objectives, key_changes, sd_type
2. Query eva_vision_documents WHERE is_active = true, select: id, extracted_dimensions, vision_key, limit 1
3. Query eva_architecture_plans WHERE is_active = true, select: id, extracted_dimensions, limit 1
4. Build scoring prompt using SD data + vision/arch dimensions
5. Call call_local_llm with the EVA scoring rubric system prompt and your built prompt
6. Parse JSON from the response (strip markdown fences if present)
7. If dry_run flag detected, do NOT call supabase_upsert — just return the score
8. Otherwise, upsert into eva_vision_scores: { sd_id: '${sdId}', total_score, dimension_scores, threshold_action: action, scoring_method: 'programmatic-ollama', created_by: 'vision-scorer-programmatic' }
9. Output final JSON

${dryRun ? 'DRY RUN MODE: Skip the supabase_upsert call. Add dry_run: true to output.' : ''}`;

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    dryRun,
  });

  // Extract JSON from result
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON found in scorer output:', result.substring(0, 200));
    process.exit(1);
  }

  const scoreData = JSON.parse(jsonMatch[0]);
  if (dryRun) scoreData.dry_run = true;

  console.log(JSON.stringify(scoreData));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
