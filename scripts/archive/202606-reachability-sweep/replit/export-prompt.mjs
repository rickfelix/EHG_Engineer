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
import { formatReplitPrompt, formatReplitOptimized } from '../../lib/eva/bridge/replit-prompt-formatter.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from '../../lib/eva/bridge/replit-format-strategies.js';

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
  Exports venture planning artifacts (Stages 1-17) as Replit Agent prompts.

Usage:
  node scripts/replit/export-prompt.mjs <venture-id>                           Monolithic (legacy)
  node scripts/replit/export-prompt.mjs <id> --format=replit-optimized         3-format bundle
  node scripts/replit/export-prompt.mjs <id> --format=replit-md-only           Just replit.md
  node scripts/replit/export-prompt.mjs <id> --format=plan-only               Just plan prompt
  node scripts/replit/export-prompt.mjs <id> --format=features-only            Feature prompts
  node scripts/replit/export-prompt.mjs <id> --output-dir ./my-export          Custom output dir

Flags:
  --format=<type>     monolithic (default), replit-optimized, replit-md-only, plan-only, features-only
  --output-dir <dir>  Output directory for replit-optimized format
  --compact           Truncate verbose sections (monolithic mode)
  --json              Output metadata as JSON
`);
    process.exit(0);
  }

  const compact = args.includes('--compact');
  const json = args.includes('--json');
  const formatFlag = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'monolithic';
  const outputDirFlag = args.find(a => a.startsWith('--output-dir='))?.split('=')[1]
    || args[args.indexOf('--output-dir') + 1];
  const scope = args.find(a => a.startsWith('--scope='))?.split('=')[1] || 'sprint';
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

  // Route to the appropriate format
  if (formatFlag === 'monolithic') {
    const result = await formatReplitPrompt(ventureId, { compact });
    if (result.warnings.length > 0) {
      console.error('Warnings:');
      result.warnings.forEach(w => console.error(`  ⚠ ${w}`));
    }
    if (json) {
      console.error(JSON.stringify({ ventureId, charCount: result.charCount, groupCount: result.groupCount, warnings: result.warnings }, null, 2));
    } else {
      console.error(`\n[${result.charCount} chars, ~${Math.ceil(result.charCount / 4)} tokens, ${result.groupCount} groups]`);
    }
    console.log(result.prompt);
    return;
  }

  // All other formats use the optimized formatter
  const result = await formatReplitOptimized(ventureId, { scope });

  if (formatFlag === 'replit-md-only') {
    console.log(result.replitMd.content);
    return;
  }
  if (formatFlag === 'plan-only') {
    console.log(result.planModePrompt.content);
    return;
  }
  if (formatFlag === 'features-only') {
    for (const f of result.featurePrompts) {
      console.log(`--- ${f.filename} (${f.charCount} chars) ---`);
      console.log(f.content);
      console.log('');
    }
    return;
  }

  // replit-optimized: write to output directory
  const ventureSlug = slugify(result.manifest.ventureName);
  const outputDir = outputDirFlag || `./replit-export-${ventureSlug}`;
  const featuresDir = join(outputDir, 'features');

  mkdirSync(featuresDir, { recursive: true });
  writeFileSync(join(outputDir, 'replit.md'), result.replitMd.content);
  writeFileSync(join(outputDir, 'plan-mode-prompt.md'), result.planModePrompt.content);
  for (const f of result.featurePrompts) {
    writeFileSync(join(featuresDir, f.filename), f.content);
  }
  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(result.manifest, null, 2));

  if (result.warnings.length > 0) {
    console.error('Warnings:');
    result.warnings.forEach(w => console.error(`  ⚠ ${w}`));
  }

  console.error(`\nExported to ${outputDir}/`);
  console.error(`  replit.md              ${result.replitMd.charCount} chars`);
  console.error(`  plan-mode-prompt.md    ${result.planModePrompt.charCount} chars`);
  console.error(`  features/              ${result.featurePrompts.length} prompts`);
  console.error(`  Total: ${result.manifest.totalCharCount} chars`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
