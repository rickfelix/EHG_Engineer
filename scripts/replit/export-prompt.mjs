#!/usr/bin/env node
/**
 * Export a venture's planning artifacts as a Replit Agent prompt.
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (FR-1)
 *
 * Usage:
 *   node scripts/replit/export-prompt.mjs <venture-id> [--compact] [--json]
 *   node scripts/replit/export-prompt.mjs --venture-name "My Venture" [--compact]
 *
 * The prompt is written to stdout for piping/clipboard.
 * Warnings and metadata go to stderr.
 */
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { formatReplitPrompt } from '../../lib/eva/bridge/replit-prompt-formatter.js';

async function resolveVentureId(input) {
  if (/^[0-9a-f-]{36}$/i.test(input)) return input;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name')
    .ilike('name', `%${input}%`)
    .limit(5);

  if (error || !data || data.length === 0) {
    throw new Error(`No venture found matching "${input}"`);
  }
  if (data.length > 1) {
    console.error('Multiple ventures match:');
    data.forEach(v => console.error(`  ${v.id} — ${v.name}`));
    throw new Error('Ambiguous venture name. Use the UUID instead.');
  }
  console.error(`Resolved: "${data[0].name}" → ${data[0].id}`);
  return data[0].id;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.error(`
Replit Prompt Exporter
  Exports venture planning artifacts (Stages 1-17) as a Replit Agent prompt.

Usage:
  node scripts/replit/export-prompt.mjs <venture-id>       Export by UUID
  node scripts/replit/export-prompt.mjs "Venture Name"     Export by name
  node scripts/replit/export-prompt.mjs <id> --compact     Truncate verbose sections
  node scripts/replit/export-prompt.mjs <id> --json        Output metadata as JSON

Output goes to stdout (pipe to clipboard or file).
Warnings go to stderr.
`);
    process.exit(0);
  }

  const compact = args.includes('--compact');
  const json = args.includes('--json');
  const ventureNameIdx = args.indexOf('--venture-name');
  let input;

  if (ventureNameIdx >= 0 && args[ventureNameIdx + 1]) {
    input = args[ventureNameIdx + 1];
  } else {
    input = args.find(a => !a.startsWith('--'));
  }

  if (!input) {
    console.error('Error: No venture ID or name provided.');
    process.exit(1);
  }

  const ventureId = await resolveVentureId(input);
  const result = await formatReplitPrompt(ventureId, { compact });

  if (result.warnings.length > 0) {
    console.error('Warnings:');
    result.warnings.forEach(w => console.error(`  ⚠ ${w}`));
  }

  if (json) {
    console.error(JSON.stringify({
      ventureId,
      charCount: result.charCount,
      groupCount: result.groupCount,
      warnings: result.warnings,
      tokenEstimate: Math.ceil(result.charCount / 4)
    }, null, 2));
  } else {
    console.error(`\n[${result.charCount} chars, ~${Math.ceil(result.charCount / 4)} tokens, ${result.groupCount} groups]`);
  }

  // Prompt to stdout
  console.log(result.prompt);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
