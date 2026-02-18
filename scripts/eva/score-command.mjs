#!/usr/bin/env node
/**
 * score-command.mjs
 * Orchestrates a full EVA vision scoring run:
 *   1. Calls scoreSD() from vision-scorer.js
 *   2. Calls generateCorrectiveSD() from corrective-sd-generator.mjs (if not dry-run)
 *   3. Returns a combined result object
 *
 * Usage:
 *   node scripts/eva/score-command.mjs --sd-id <SD-KEY> [--vision-key <KEY>] [--arch-key <KEY>] [--dry-run]
 *
 * Part of: SD-MAN-INFRA-EVA-SCORE-COMMAND-001
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

// ─── Lazy imports (dynamic to avoid circular refs) ───────────────────────────

async function getScoreSD() {
  const mod = await import('./vision-scorer.js');
  return mod.scoreSD;
}

async function getGenerateCorrectiveSD() {
  const mod = await import('./corrective-sd-generator.mjs');
  return mod.generateCorrectiveSD;
}

// ─── Default key loading ──────────────────────────────────────────────────────

/**
 * Load the most-recently-published vision key from eva_vision_documents.
 */
async function loadDefaultVisionKey(supabase) {
  const { data } = await supabase
    .from('eva_vision_documents')
    .select('vision_key')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.vision_key ?? 'VISION-EHG-L1-001';
}

/**
 * Load the most-recently-published arch key from eva_architecture_plans.
 */
async function loadDefaultArchKey(supabase) {
  const { data } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.plan_key ?? 'ARCH-EHG-L1-001';
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Run a full EVA scoring cycle: score → optionally generate corrective SD.
 *
 * @param {Object} options
 * @param {string} [options.sdKey] - SD key to score (e.g. 'SD-X')
 * @param {string} [options.visionKey] - Vision doc key. Auto-loads from DB if omitted.
 * @param {string} [options.archKey] - Architecture plan key. Auto-loads from DB if omitted.
 * @param {string} [options.scope] - Custom scope description (alternative to sdKey)
 * @param {boolean} [options.dryRun=false] - Preview without DB writes
 * @returns {Promise<{score: Object, corrective: Object|null, visionKey: string, archKey: string}>}
 */
export async function runScore(options = {}) {
  const { sdKey, scope, dryRun = false } = options;

  if (!sdKey && !scope) {
    throw new Error('--sd-id or --scope is required');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Resolve keys (dynamic defaults if not provided)
  const visionKey = options.visionKey || await loadDefaultVisionKey(supabase);
  const archKey = options.archKey || await loadDefaultArchKey(supabase);

  // Step 1: Score
  const scoreSD = await getScoreSD();
  const score = await scoreSD({ sdKey, visionKey, archKey, scope, dryRun });

  // Step 2: Generate corrective SD (only when score has a DB record)
  let corrective = null;
  if (!dryRun && score.id) {
    const generateCorrectiveSD = await getGenerateCorrectiveSD();
    corrective = await generateCorrectiveSD(score.id);
  }

  return { score, corrective, visionKey, archKey };
}

// ─── CLI output formatter ─────────────────────────────────────────────────────

function formatResult({ score, corrective, visionKey, archKey, dryRun }) {
  const divider = '═'.repeat(62);
  const lines = [
    '',
    divider,
    `  /eva score${dryRun ? ' [DRY RUN]' : ''}`,
    divider,
    `  Vision:       ${visionKey}`,
    `  Architecture: ${archKey}`,
    score.sd_id ? `  SD:           ${score.sd_id}` : `  Scope:        (custom)`,
    '',
    '┌─ DIMENSION SCORES ─────────────────────────────────────────┐',
  ];

  const dims = score.dimension_scores || {};
  for (const [id, dim] of Object.entries(dims)) {
    const bar = '█'.repeat(Math.round((dim.score / 100) * 10)) + '░'.repeat(10 - Math.round((dim.score / 100) * 10));
    lines.push(`│  ${id.padEnd(5)} [${bar}] ${String(dim.score).padStart(3)}/100  ${dim.name || ''}`);
  }

  lines.push('└────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push(`  Total Score:  ${score.total_score}/100`);
  lines.push(`  Action:       ${score.threshold_action?.toUpperCase() ?? 'UNKNOWN'}`);

  if (score.summary) {
    lines.push(`  Summary:      ${score.summary.slice(0, 120)}`);
  }

  lines.push('');

  if (dryRun) {
    lines.push('  ⚠️  DRY RUN — no records written to database');
  } else if (score.id) {
    lines.push(`  Score ID:     ${score.id}`);
  }

  if (corrective) {
    if (corrective.created) {
      lines.push(`  Corrective SD: ${corrective.sdKey} (${corrective.action})`);
    } else {
      lines.push(`  Corrective SD: none (score ${corrective.action === 'accept' ? 'above threshold' : `→ existing: ${corrective.sdKey}`})`);
    }
  }

  lines.push(divider);
  lines.push('');

  return lines.join('\n');
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

  const sdKey = getArg('--sd-id');
  const visionKey = getArg('--vision-key') || undefined;
  const archKey = getArg('--arch-key') || undefined;
  const scope = getArg('--scope') || undefined;
  const dryRun = args.includes('--dry-run');

  if (!sdKey && !scope) {
    console.error('Usage: node scripts/eva/score-command.mjs --sd-id <SD-KEY> [--vision-key <KEY>] [--arch-key <KEY>] [--scope <text>] [--dry-run]');
    process.exit(1);
  }

  runScore({ sdKey, visionKey, archKey, scope, dryRun })
    .then(({ score, corrective, visionKey: vk, archKey: ak }) => {
      console.log(formatResult({ score, corrective, visionKey: vk, archKey: ak, dryRun }));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
