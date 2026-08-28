#!/usr/bin/env node
/**
 * Stage-20 experience-design review, standalone adapter -- persistence.
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-3/FR-4/FR-5), Unit B.
 *
 * Consumes the findings a Claude Code session produced from
 * gather-context.mjs's prompt (see that script's doc) and persists them
 * through the existing Stage-20 finding pipeline + a telemetry row.
 *
 * Usage:
 *   node scripts/experience-review/record-review.mjs --venture-id <uuid> \
 *     --run-id <unique-id> --content @findings.json \
 *     [--run-mode in_traversal|out_of_band_annex] [--deployment-url <url>] \
 *     [--duration-ms <n>] [--cost-usd <n>]
 *
 * --content accepts @<path>, "-" (stdin), or a literal JSON array string --
 * a JSON array of { category, severity, title, detail, evidence_pointer }.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { persistExperienceReview } from '../../lib/eva/experience-review/persist.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

function loadFindings(rawValue) {
  if (!rawValue) throw new Error('--content requires a value (@<path>, "-" for stdin, or literal JSON)');
  let raw;
  if (rawValue === '-') raw = fs.readFileSync(0, { encoding: 'utf8' });
  else if (rawValue.startsWith('@')) raw = fs.readFileSync(rawValue.slice(1), 'utf8');
  else raw = rawValue;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('--content payload must be a JSON array of findings');
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.venture_id || !args.run_id || !args.content) {
    console.error('Usage: node scripts/experience-review/record-review.mjs --venture-id <uuid> --run-id <id> --content @findings.json [--run-mode in_traversal|out_of_band_annex]');
    process.exit(1);
  }

  const rawFindings = loadFindings(args.content);
  const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const result = await persistExperienceReview({
    supabase,
    ventureId: args.venture_id,
    runId: args.run_id,
    runMode: args.run_mode || 'in_traversal',
    rawFindings,
    telemetry: {
      durationMs: args.duration_ms ? Number(args.duration_ms) : undefined,
      costUsd: args.cost_usd ? Number(args.cost_usd) : undefined,
      deploymentUrl: args.deployment_url,
    },
  });

  console.log(`[record-review] findings written: ${result.findingsWritten}, errors: ${result.findingsErrors.length}, run row: ${result.runRowId}`);
  if (result.findingsErrors.length) {
    console.error('[record-review] finding write errors:', JSON.stringify(result.findingsErrors, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[record-review] FATAL:', err.message);
  process.exit(1);
});
