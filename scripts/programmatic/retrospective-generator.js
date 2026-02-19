#!/usr/bin/env node
/**
 * Programmatic Retrospective Generator — Enhancement 3
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Auto-populates SD retrospectives with specific insights, real file references,
 * and concrete action items — eliminating manual enrichment after every SD.
 *
 * Usage:
 *   node scripts/programmatic/retrospective-generator.js \
 *     --sd-id SD-XXX-001 --branch feat/SD-XXX-001 [--dry-run]
 *
 * Output (stdout): JSON { retrospective_id, quality_score, sd_id, dry_run? }
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { runProgrammaticTask } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool, createSupabaseUpsertTool } from '../../lib/programmatic/tools/supabase-tool.js';
import { createGitTools } from '../../lib/programmatic/tools/git-tool.js';

const { values: args } = parseArgs({
  options: {
    'sd-id': { type: 'string' },
    'branch': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const sdId = args['sd-id'];
const branch = args['branch'] ?? `feat/${sdId}`;
const dryRun = args['dry-run'];

if (!sdId) {
  console.error('Usage: node scripts/programmatic/retrospective-generator.js --sd-id SD-XXX-001 [--branch feat/SD-XXX-001] [--dry-run]');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { gitDiff, changedFiles } = createGitTools();
const tools = [
  createSupabaseTool(supabase),
  createSupabaseUpsertTool(supabase),
  gitDiff,
  changedFiles,
];

const SYSTEM_PROMPT = `You are a LEO Protocol retrospective author. You generate high-quality retrospectives
that pass the RETROSPECTIVE_QUALITY_GATE (requires score >= 70/100).

Quality gate requirements:
- key_learnings: SD-specific insights referencing actual files changed (not boilerplate)
- action_items: Array of {action, owner, deadline, verification} objects (min 2 items)
- improvement_areas: Array of {area, analysis, prevention} objects (min 1)
- what_went_well: Specific to this SD (not generic)
- what_needs_improvement: Specific friction points encountered

NEVER use boilerplate like "EXEC phase quality score: 80%". Reference real files and behaviors.

Output ONLY valid JSON in your final message:
{"retrospective_id": "...", "quality_score": N, "sd_id": "..."}`;

const USER_PROMPT = `Generate a high-quality retrospective for SD "${sdId}" (branch: ${branch}).

Steps:
1. Query strategic_directives_v2 WHERE sd_key = '${sdId}', select: title, description, sd_type, strategic_objectives
2. Query sd_phase_handoffs WHERE sd_id = '${sdId}', select: handoff_type, status, gate_score, created_at — get all handoffs
3. Call git_changed_files for branch "${branch}" to get list of changed files
4. Call git_diff for branch "${branch}" to get diff stats
5. Query retrospectives WHERE sd_id = '${sdId}', select id (check if one exists already)
6. Generate retrospective content:
   - key_learnings: 3+ items, each referencing specific files from changed_files
   - action_items: 2+ items with owner="future-claude", deadline="next-sd", verification fields
   - improvement_areas: 1+ items with specific analysis
   - what_went_well and what_needs_improvement: SD-specific, not boilerplate
7. ${dryRun ? 'DRY RUN: Do NOT upsert. Return the generated content with dry_run: true and mock quality_score: 75' : 'Upsert into retrospectives table'}
8. Output final JSON result`;

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    dryRun,
    maxTokens: 6144,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON in retrospective-generator output:', result.substring(0, 300));
    process.exit(1);
  }

  const retroData = JSON.parse(jsonMatch[0]);
  if (dryRun) retroData.dry_run = true;

  console.log(JSON.stringify(retroData));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}
