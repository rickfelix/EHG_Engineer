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

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool } from '../../lib/programmatic/tools/supabase-tool.js';
import { createOllamaTool } from '../../lib/programmatic/tools/ollama-tool.js';
import { extractScoreJson, buildVisionScoreRow } from '../../lib/programmatic/vision-score-row.js';

const { values: args } = parseArgs({
  options: {
    'sd-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const sdId = args['sd-id'];
const dryRun = args['dry-run'];

// QF-20260609-493: resolve the EHG portfolio vision/arch by KEY. eva_vision_documents has
// NO is_active column, so the old `WHERE is_active = true LIMIT 1` matched nothing (or a
// random venture vision) — a second reason the score never persisted. Default to the L1
// portfolio docs; honour the same env overrides the LEAD-TO-PLAN vision gate uses.
const VISION_KEY = process.env.LEO_VISION_KEY_OVERRIDE || 'VISION-EHG-L1-001';
const ARCH_KEY = process.env.LEO_ARCH_KEY_OVERRIDE || 'ARCH-EHG-L1-001';

if (!sdId) {
  console.error('Usage: node scripts/programmatic/vision-scorer.js --sd-id SD-XXX-001 [--dry-run]');
  process.exit(1);
}

const supabase = createSupabaseServiceClient();

const tools = [
  createSupabaseTool(supabase),
  // QF-20260609-493: NO upsert tool — the model scores only; the caller persists the row in
  // JS (buildVisionScoreRow) so the model's final message is reliably the score JSON (the
  // upsert tool round-trip is what made the Gemini fallback drop the JSON → "No JSON found").
  // SD-FDBK-FIX-VISION-SCORER-DETERMINISM-001 (FR-4): pin sampling on the LIVE
  // programmatic scoring path (seed matches the cloud-path VISION_SCORE_SEED=1729).
  createOllamaTool({ temperature: 0, seed: 1729 }),
];

const SYSTEM_PROMPT = `You are an EVA vision alignment scorer. Your task is to:
1. Fetch the SD context using supabase_query on strategic_directives_v2
2. Fetch vision dimensions using supabase_query on eva_vision_documents
3. Fetch architecture dimensions using supabase_query on eva_architecture_plans
4. Build a scoring prompt from the SD and dimensions
5. Call call_local_llm with the scoring system prompt and built prompt
6. Parse the score JSON from the response
7. Do NOT call any upsert/persist tool — the caller persists the score row
8. Output ONLY the final JSON: {"total_score": N, "action": "...", "dimension_scores": {...}}

The score JSON from the LLM must have: total_score (0-100), action (one of: proceed, minor_sd, corrective_sd, block), dimension_scores (object).

For the scoring system prompt, use this rubric:
- Score 0-100 across 5 dimensions: innovation (20pts), strategic_alignment (25pts), feasibility (20pts), impact (25pts), sustainability (10pts)
- IMPORTANT: feasibility measures implementation tractability — how achievable is this work given existing tools, codebase, and team capabilities? Well-defined bug fixes and infrastructure tasks with clear scope should score HIGH on feasibility (15-20). Do NOT conflate feasibility with ambition or innovation.
- IMPORTANT: innovation measures novel approaches or improvements to existing systems. Infrastructure work innovates on process reliability, tooling quality, and developer experience — not product features. Bug fixes and maintenance tasks should score 10-15 on innovation. Only score below 10 if the work is purely routine with zero improvement.
- IMPORTANT: impact measures the effect on the overall system and its users. Internal tooling and infrastructure improvements impact developer velocity, system reliability, and operational stability. Infrastructure SDs with clear operational benefits should score 18-22 on impact. Do NOT discount impact just because end-users are developers rather than customers.
- IMPORTANT: sustainability measures long-term maintainability and durability of the changes. Infrastructure fixes, bug fixes, and tooling improvements directly enhance long-term system maintainability. Fixing recurring issues and improving reliability should score 7-10 on sustainability. Only score below 5 if the change is a temporary workaround.
- IMPORTANT: strategic_alignment measures how well the work serves the organization's strategic objectives. Bug fixes and infrastructure work directly serve strategic objectives by maintaining system stability, enabling future development, and reducing technical debt. SDs that fix known issues or improve core tooling should score 20-25 on strategic_alignment.
- total_score = sum of all dimensions
- action: proceed (>=85), minor_sd (70-84), corrective_sd (50-69), block (<50) — adjust thresholds for infrastructure SDs (proceed >= 80)

Always output valid JSON in your final message.`;

const USER_PROMPT = `Score SD "${sdId}" against the EVA vision.

Steps:
1. Query strategic_directives_v2 WHERE sd_key = '${sdId}', select: title, description, strategic_objectives, key_changes, sd_type
2. Query eva_vision_documents WHERE vision_key = '${VISION_KEY}', select: id, extracted_dimensions, vision_key, limit 1
3. Query eva_architecture_plans WHERE plan_key = '${ARCH_KEY}', select: id, extracted_dimensions, limit 1
4. Build scoring prompt using SD data + vision/arch dimensions
5. Call call_local_llm with the EVA scoring rubric system prompt and your built prompt
6. Parse JSON from the response (strip markdown fences if present)
7. Do NOT call any upsert/persist tool — the caller persists the score row. Just return the score.
8. Output ONLY the final score JSON`;

// QF-20260609-493: score-only model + JS persist. Retry on an empty/non-JSON final
// message (flaky Gemini fallback), then write the row ourselves — never silent-empty.
const MAX_SCORE_ATTEMPTS = 3;

try {
  let scoreData = null;
  let lastPreview = '';
  for (let attempt = 1; attempt <= MAX_SCORE_ATTEMPTS; attempt++) {
    const result = await runProgrammaticTask(USER_PROMPT, tools, { systemPrompt: SYSTEM_PROMPT, dryRun });
    const parsed = extractScoreJson(result);
    if (parsed && typeof parsed.total_score === 'number') { scoreData = parsed; break; }
    lastPreview = (result || '').substring(0, 200);
    if (attempt < MAX_SCORE_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }

  // Fail LOUDLY (non-zero exit + structured error) so the caller can tell a scorer outage
  // apart from a legitimate low score — never silent-empty (the old "No JSON found" bug).
  if (!scoreData) {
    console.error(JSON.stringify({
      error: 'SCORER_NO_JSON', sd_id: sdId, attempts: MAX_SCORE_ATTEMPTS,
      message: `vision-scorer produced no parseable score after ${MAX_SCORE_ATTEMPTS} attempts; no row written.`,
      last_output_preview: lastPreview,
    }));
    process.exit(2);
  }

  if (dryRun) {
    scoreData.dry_run = true;
  } else {
    const { data: vis } = await supabase.from('eva_vision_documents').select('id').eq('vision_key', VISION_KEY).limit(1);
    const visionId = vis?.[0]?.id;
    if (!visionId) {
      console.error(JSON.stringify({ error: 'SCORER_NO_ACTIVE_VISION', sd_id: sdId, vision_key: VISION_KEY,
        message: `Vision document '${VISION_KEY}' not found; cannot persist vision score.` }));
      process.exit(3);
    }
    const { data: arch } = await supabase.from('eva_architecture_plans').select('id').eq('plan_key', ARCH_KEY).limit(1);
    const { error: insErr } = await supabase
      .from('eva_vision_scores')
      .insert(buildVisionScoreRow({ scoreData, visionId, archPlanId: arch?.[0]?.id, sdId }));
    if (insErr) {
      console.error(JSON.stringify({ error: 'SCORER_PERSIST_FAILED', sd_id: sdId, message: insErr.message }));
      process.exit(4);
    }
  }

  console.log(JSON.stringify(scoreData));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
