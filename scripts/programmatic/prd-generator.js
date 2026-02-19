#!/usr/bin/env node
/**
 * Programmatic PRD Generator — Enhancement 2
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Generates a PRD for an SD using the tool-use loop, self-validating
 * all 7 required fields before insert to eliminate PLAN-TO-EXEC failures.
 *
 * Usage:
 *   node scripts/programmatic/prd-generator.js --sd-id SD-XXX-001 [--dry-run]
 *
 * Output (stdout): JSON { prd_id, sd_id, status, fields_validated, dry_run? }
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool, createSupabaseUpsertTool } from '../../lib/programmatic/tools/supabase-tool.js';

const REQUIRED_PRD_FIELDS = [
  'executive_summary',
  'functional_requirements',
  'system_architecture',
  'acceptance_criteria',
  'test_scenarios',
  'implementation_approach',
  'risks',
];

const { values: args } = parseArgs({
  options: {
    'sd-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const sdId = args['sd-id'];
const dryRun = args['dry-run'];

if (!sdId) {
  console.error('Usage: node scripts/programmatic/prd-generator.js --sd-id SD-XXX-001 [--dry-run]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tools = [
  createSupabaseTool(supabase),
  createSupabaseUpsertTool(supabase),
];

const SYSTEM_PROMPT = `You are a PRD generator for the LEO Protocol. You:
1. Fetch the SD's requirements from the database
2. Check if a PRD already exists
3. Generate a comprehensive PRD with all 7 required fields
4. Validate the PRD before inserting
5. Insert the approved PRD

Required PRD fields: ${REQUIRED_PRD_FIELDS.join(', ')}

CRITICAL constraints:
- user_stories priority MUST be 'critical' (not 'high', 'medium', etc.)
- story_key format MUST be NNN:US-NNN (e.g., 077:US-001)
- functional_requirements MUST be a native array (not a JSON string)
- acceptance_criteria MUST be present and non-empty
- No placeholder text ("TBD", "to be defined", "will be determined")

Output ONLY valid JSON in your final message:
{"prd_id": "...", "sd_id": "...", "status": "approved", "fields_validated": [...]}`;

const USER_PROMPT = `Generate and insert a PRD for SD "${sdId}".

Steps:
1. Query strategic_directives_v2 WHERE sd_key = '${sdId}', select all fields
2. Query product_requirements_v2 WHERE sd_id = '${sdId}', select id,status (check if PRD exists)
3. If PRD already exists and status != 'draft', output: {"prd_id": "<existing>", "sd_id": "${sdId}", "status": "exists", "fields_validated": []}
4. Generate PRD content based on SD data with all 7 required fields
5. Validate all required fields are present and non-empty
6. ${dryRun ? 'DRY RUN: Do NOT upsert. Return the generated PRD JSON with dry_run: true' : 'Upsert into product_requirements_v2 with status="approved"'}
7. Output final JSON result

PRD ID to use: PRD-${sdId}`;

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    dryRun,
    maxTokens: 8192,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON in prd-generator output:', result.substring(0, 300));
    process.exit(1);
  }

  const prdData = JSON.parse(jsonMatch[0]);
  if (dryRun) prdData.dry_run = true;

  console.log(JSON.stringify(prdData));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
