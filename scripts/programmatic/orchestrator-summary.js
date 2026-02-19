#!/usr/bin/env node
/**
 * Programmatic Orchestrator Child Aggregation — Enhancement 4
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Batches all child SD queries inside the tool-use loop, returning a compact
 * summary JSON without loading full SD records into the main context window.
 *
 * Usage:
 *   node scripts/programmatic/orchestrator-summary.js --parent-id SD-XXX-001
 *
 * Output (stdout): JSON { total, completed, by_status, gate_scores, audit }
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool } from '../../lib/programmatic/tools/supabase-tool.js';

const { values: args } = parseArgs({
  options: {
    'parent-id': { type: 'string' },
  },
});

const parentId = args['parent-id'];

if (!parentId) {
  console.error('Usage: node scripts/programmatic/orchestrator-summary.js --parent-id SD-XXX-001');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tools = [createSupabaseTool(supabase)];

const SYSTEM_PROMPT = `You are an orchestrator status aggregator. Fetch child SD data and return
a compact summary JSON. Do not return full SD records — only the fields needed for orchestrator decisions.

Output ONLY valid JSON in your final message:
{"total": N, "completed": N, "by_status": {}, "gate_scores": {}, "audit": {}}`;

const USER_PROMPT = `Aggregate status for all children of orchestrator "${parentId}".

Steps:
1. Query strategic_directives_v2 WHERE parent_sd_id = '${parentId}', select: sd_key,status,progress,sd_type
2. Query sd_phase_handoffs WHERE sd_id in (the sd_keys from step 1), select: sd_id,handoff_type,status,gate_score — get latest per sd_key
3. Build compact summary:
   - total: count of children
   - completed: count where status = 'completed'
   - by_status: {draft:N, in_progress:N, completed:N, ...}
   - gate_scores: {sd_key: avg_gate_score, ...} (only populated keys)
   - audit: {children_done: N, pct_complete: X%}
4. Output final compact JSON (< 2KB)`;

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 2048,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON in orchestrator-summary output:', result.substring(0, 200));
    process.exit(1);
  }

  console.log(JSON.stringify(JSON.parse(jsonMatch[0])));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
