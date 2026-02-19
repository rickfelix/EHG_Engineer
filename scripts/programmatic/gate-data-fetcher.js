#!/usr/bin/env node
/**
 * Programmatic Gate Validation Data Prefetch — Enhancement 5
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Pre-fetches all gate prerequisite data in a single programmatic call,
 * returning a compact bundle that gates read from instead of making
 * individual Supabase queries.
 *
 * Usage:
 *   node scripts/programmatic/gate-data-fetcher.js --sd-id SD-XXX-001
 *
 * Output (stdout): JSON { handoffs, user_stories, retrospective, vision_score, prd_summary }
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool } from '../../lib/programmatic/tools/supabase-tool.js';

const { values: args } = parseArgs({
  options: {
    'sd-id': { type: 'string' },
  },
});

const sdId = args['sd-id'];

if (!sdId) {
  console.error('Usage: node scripts/programmatic/gate-data-fetcher.js --sd-id SD-XXX-001');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tools = [createSupabaseTool(supabase)];

const SYSTEM_PROMPT = `You are a gate data prefetcher. Fetch all prerequisite data needed by
validation gates for a given SD, then return a compact JSON bundle.
Each field in the bundle should contain only what gates actually need — not full rows.
Output ONLY valid JSON in your final message.`;

const USER_PROMPT = `Prefetch all gate prerequisite data for SD "${sdId}".

Fetch these in sequence (supabase_query doesn't support parallel, so do them one by one):
1. sd_phase_handoffs WHERE sd_id = '${sdId}', select: handoff_type,status,gate_score,created_at, limit 20
2. user_stories WHERE sd_id = '${sdId}', select: id,status,story_key,priority, limit 20
3. retrospectives WHERE sd_id = '${sdId}', select: id,quality_score,status, limit 1, order by created_at desc
4. eva_vision_scores WHERE sd_id = '${sdId}', select: total_score,threshold_action,scoring_method,created_at, limit 1, order by created_at desc
5. product_requirements_v2 WHERE sd_id = '${sdId}', select: id,status,title, limit 1

Build compact bundle:
- handoffs: array of {handoff_type, status, gate_score}
- user_stories: {count, all_ready: bool, story_keys: [...]}
- retrospective: {id, quality_score, status} or null
- vision_score: {total_score, threshold_action} or null
- prd: {id, status} or null

Output the compact bundle as JSON.`;

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 2048,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON in gate-data-fetcher output:', result.substring(0, 200));
    process.exit(1);
  }

  console.log(JSON.stringify(JSON.parse(jsonMatch[0])));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
