#!/usr/bin/env node
/**
 * Programmatic On-Demand Protocol Querying — Enhancement 6
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Fetches only the specific protocol sections needed for the current phase/SD type,
 * reducing session token burn vs reading full CLAUDE_LEAD_DIGEST.md (16K tokens).
 *
 * Opt-in via PROGRAMMATIC_PROTOCOL=true env var.
 *
 * Usage:
 *   node scripts/programmatic/protocol-query.js \
 *     --sections gate_thresholds,vision_rules --sd-type infrastructure
 *
 * Output (stdout): JSON { sections: [...], total_tokens_approx: N }
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool } from '../../lib/programmatic/tools/supabase-tool.js';

const { values: args } = parseArgs({
  options: {
    'sections': { type: 'string' },
    'sd-type': { type: 'string', default: 'all' },
    'phase': { type: 'string', default: 'LEAD' },
  },
});

const sections = args['sections']?.split(',').map(s => s.trim()) ?? [];
const sdType = args['sd-type'];
const phase = args['phase'];

if (sections.length === 0) {
  console.error('Usage: node scripts/programmatic/protocol-query.js --sections <s1,s2,...> [--sd-type infrastructure] [--phase LEAD]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tools = [createSupabaseTool(supabase)];

const SYSTEM_PROMPT = `You are a protocol section retriever. Query the claude_protocol_sections table
(if it exists) and return only the sections relevant to the request. If the table doesn't exist,
return a message indicating it's not yet populated.
Output ONLY valid JSON.`;

const USER_PROMPT = `Fetch protocol sections for sd_type="${sdType}", phase="${phase}".
Requested sections: ${sections.join(', ')}

Steps:
1. Try to query claude_protocol_sections WHERE section_name IN (${sections.map(s => `'${s}'`).join(',')})
   AND (sd_type = '${sdType}' OR sd_type = 'all'), select: section_name, content, sd_type, phase
2. If query fails (table doesn't exist), return: {"sections": [], "message": "claude_protocol_sections table not yet populated", "fallback": "Read CLAUDE_LEAD_DIGEST.md"}
3. Return: {"sections": [{"section_name": "...", "content": "..."}], "total_tokens_approx": N}
   where total_tokens_approx = sum(len(content) / 4) for all sections`;

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 4096,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON in protocol-query output:', result.substring(0, 200));
    process.exit(1);
  }

  console.log(JSON.stringify(JSON.parse(jsonMatch[0])));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
