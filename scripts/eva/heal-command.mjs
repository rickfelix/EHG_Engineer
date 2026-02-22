#!/usr/bin/env node
/**
 * heal-command.mjs — Unified Heal Command
 *
 * Two modes:
 *   1. VISION heal — Delegates to existing vision-heal.js
 *   2. SD heal     — Score codebase against completed Strategic Directives
 *
 * Usage:
 *   node scripts/eva/heal-command.mjs vision [score|persist|generate|status|loop]
 *   node scripts/eva/heal-command.mjs sd [--today|--sd-id X|--last N]
 *   node scripts/eva/heal-command.mjs sd persist '<JSON>'
 *   node scripts/eva/heal-command.mjs sd generate <score-id>
 *   node scripts/eva/heal-command.mjs status
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ACCEPT_THRESHOLD = 93;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ─── VISION: Delegate to vision-heal.js ──────────────────────────────────────

function cmdVision(args) {
  const visionScript = join(__dirname, 'vision-heal.js');
  try {
    execFileSync('node', [visionScript, ...args], { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

// ─── SD HEAL: Score codebase against completed SDs ───────────────────────────

function parseSDArgs(args) {
  const opts = { mode: 'query', today: false, sdId: null, last: 5, since: null, until: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'persist') {
      opts.mode = 'persist';
      opts.persistJson = args[i + 1];
      break;
    }
    if (arg === 'generate') {
      opts.mode = 'generate';
      opts.scoreId = args[i + 1];
      break;
    }
    if (arg === '--today') opts.today = true;
    if (arg === '--sd-id' && args[i + 1]) { opts.sdId = args[i + 1]; i++; }
    if (arg === '--last' && args[i + 1]) { opts.last = parseInt(args[i + 1], 10) || 5; i++; }
    if (arg === '--since' && args[i + 1]) { opts.since = args[i + 1]; i++; }
    if (arg === '--until' && args[i + 1]) { opts.until = args[i + 1]; i++; }
  }

  return opts;
}

async function cmdSDQuery(opts) {
  const supabase = getSupabase();

  let query = supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, key_changes, success_criteria, success_metrics, strategic_objectives, smoke_test_steps, delivers_capabilities, completion_date, status')
    .eq('status', 'completed')
    .order('completion_date', { ascending: false });

  if (opts.sdId) {
    query = query.eq('sd_key', opts.sdId);
  } else if (opts.today) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    query = query.gte('completion_date', todayStart.toISOString());
  } else if (opts.since) {
    const sinceDate = new Date(opts.since);
    sinceDate.setHours(0, 0, 0, 0);
    query = query.gte('completion_date', sinceDate.toISOString());
    if (opts.until) {
      const untilDate = new Date(opts.until);
      untilDate.setHours(23, 59, 59, 999);
      query = query.lte('completion_date', untilDate.toISOString());
    }
  } else {
    query = query.limit(opts.last);
  }

  const { data: sds, error } = await query;

  if (error) {
    console.error(`Error querying SDs: ${error.message}`);
    process.exit(1);
  }

  if (!sds || sds.length === 0) {
    console.log('\nNo completed SDs found matching the filter.');
    if (opts.today) console.log('  (No SDs completed today)');
    if (opts.sdId) console.log(`  (SD ${opts.sdId} not found or not completed)`);
    process.exit(0);
  }

  console.log(`\nFound ${sds.length} completed SD(s) to heal against:\n`);
  for (const sd of sds) {
    console.log(`  ${sd.sd_key} — ${sd.title}`);
    console.log(`    Completed: ${sd.completion_date || 'unknown'}`);
  }

  // Build inline scoring context
  const scoringContext = {
    mode: 'SD_HEAL_SCORE',
    instruction: [
      'Claude Code: For each SD below, verify that its PROMISES were actually delivered in the codebase.',
      'Score each SD on the dimensions listed. Check the actual codebase files, not just metadata.',
      '',
      'Scoring dimensions per SD:',
      '  - key_changes_delivered (0-100): Were the stated key_changes actually implemented?',
      '  - success_criteria_met (0-100): Are the success_criteria verifiable in the codebase?',
      '  - success_metrics_achieved (0-100): Do the success_metrics hold true?',
      '  - smoke_tests_pass (0-100): Would the smoke_test_steps pass if executed?',
      '  - capabilities_present (0-100): Are delivers_capabilities actually functional?',
      '',
      'After scoring, run:',
      '  node scripts/eva/heal-command.mjs sd persist \'<YOUR_JSON>\'',
    ].join('\n'),
    sds: sds.map(sd => ({
      sd_key: sd.sd_key,
      title: sd.title,
      completion_date: sd.completion_date,
      promises: {
        key_changes: sd.key_changes,
        success_criteria: sd.success_criteria,
        success_metrics: sd.success_metrics,
        strategic_objectives: sd.strategic_objectives,
        smoke_test_steps: sd.smoke_test_steps,
        delivers_capabilities: sd.delivers_capabilities,
      },
    })),
    responseFormat: {
      sd_scores: [
        {
          sd_key: 'SD-XXX-001',
          dimensions: [
            { id: 'key_changes_delivered', score: 0, reasoning: '...' },
            { id: 'success_criteria_met', score: 0, reasoning: '...' },
            { id: 'success_metrics_achieved', score: 0, reasoning: '...' },
            { id: 'smoke_tests_pass', score: 0, reasoning: '...' },
            { id: 'capabilities_present', score: 0, reasoning: '...' },
          ],
          total_score: 0,
          gaps: ['gap1'],
          summary: '1-2 sentence assessment',
        },
      ],
      overall_score: 0,
      overall_summary: '1-2 sentence overall assessment',
    },
  };

  console.log('\n===SD_HEAL_SCORE_CONTEXT===');
  console.log(JSON.stringify(scoringContext, null, 2));
  console.log('===END_CONTEXT===');
}

async function cmdSDPersist(scoreJson) {
  const supabase = getSupabase();
  const parsed = JSON.parse(scoreJson);

  if (!parsed.sd_scores || !Array.isArray(parsed.sd_scores)) {
    console.error('Invalid format: expected { sd_scores: [...], overall_score: N }');
    process.exit(1);
  }

  // Load vision doc IDs for the foreign key (reuse same vision/arch refs)
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id')
    .eq('vision_key', 'VISION-EHG-L1-001')
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('id')
    .eq('plan_key', 'ARCH-EHG-L1-001')
    .single();

  const insertedIds = [];

  for (const sdScore of parsed.sd_scores) {
    const dimensionScores = {};
    for (const dim of sdScore.dimensions) {
      dimensionScores[dim.id] = {
        name: dim.id,
        score: dim.score,
        reasoning: dim.reasoning,
        source: 'sd-heal',
      };
    }

    let thresholdAction = 'accept';
    if (sdScore.total_score < 70) thresholdAction = 'escalate';
    else if (sdScore.total_score < 83) thresholdAction = 'gap_closure_sd';
    else if (sdScore.total_score < 93) thresholdAction = 'minor_sd';

    const { data: inserted, error } = await supabase
      .from('eva_vision_scores')
      .insert({
        vision_id: vision?.id || null,
        arch_plan_id: arch?.id || null,
        sd_id: sdScore.sd_key,
        total_score: sdScore.total_score,
        dimension_scores: dimensionScores,
        threshold_action: thresholdAction,
        rubric_snapshot: {
          mode: 'sd-heal',
          sd_key: sdScore.sd_key,
          gaps: sdScore.gaps || [],
          summary: sdScore.summary,
          scored_by: 'claude-code-inline',
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Failed to persist score for ${sdScore.sd_key}: ${error.message}`);
      continue;
    }

    insertedIds.push({ sdKey: sdScore.sd_key, scoreId: inserted.id, score: sdScore.total_score, action: thresholdAction });

    // Per-SD output
    console.log(`\n  ${sdScore.sd_key}: ${sdScore.total_score}/100 (${thresholdAction})`);
    for (const dim of sdScore.dimensions) {
      const bar = '\u2588'.repeat(Math.round(dim.score / 10)) + '\u2591'.repeat(10 - Math.round(dim.score / 10));
      console.log(`    ${dim.id.padEnd(28)} ${bar} ${dim.score}/100`);
    }
    if (sdScore.gaps?.length > 0) {
      console.log(`    Gaps: ${sdScore.gaps.join('; ')}`);
    }
  }

  // Summary
  console.log('\n\u2500\u2500\u2500 SD Heal Summary \u2500\u2500\u2500');
  console.log(`  Overall: ${parsed.overall_score}/100`);
  console.log(`  SDs scored: ${insertedIds.length}`);

  const needsCorrection = insertedIds.filter(s => s.action !== 'accept');
  if (needsCorrection.length > 0) {
    console.log(`\n  ${needsCorrection.length} SD(s) below threshold (${ACCEPT_THRESHOLD}):`);
    for (const s of needsCorrection) {
      console.log(`    ${s.sdKey}: ${s.score}/100 — run: node scripts/eva/heal-command.mjs sd generate ${s.scoreId}`);
    }
    console.log(`\nHEAL_STATUS=NEEDS_CORRECTION`);
    console.log(`HEAL_SCORE_IDS=${needsCorrection.map(s => s.scoreId).join(',')}`);
    console.log(`HEAL_NEXT_CMD=node scripts/eva/heal-command.mjs sd generate ${needsCorrection[0].scoreId}`);
  } else {
    console.log(`\n  All SDs pass threshold! No corrective action needed.`);
    console.log(`\nHEAL_STATUS=PASS`);
  }
}

async function cmdSDGenerate(scoreId) {
  const { generateCorrectiveSD } = await import('./corrective-sd-generator.mjs');
  const result = await generateCorrectiveSD(scoreId);
  console.log(JSON.stringify(result, null, 2));

  if (result.created && result.sds) {
    console.log(`\nCorrective SDs created (${result.sds.length}):`);
    for (const sd of result.sds) {
      console.log(`  ${sd.sdKey} \u2014 ${sd.label} (${sd.dims.map(d => d.dimId).join(', ')})`);
    }
    console.log('\n  Work each SD through LEAD\u2192PLAN\u2192EXEC\u2192completion,');
    console.log('  then run: node scripts/eva/heal-command.mjs sd --today');
  } else if (!result.created) {
    console.log(`\n  No SDs created: ${result.reason || result.action}`);
  }
}

// ─── STATUS: Combined vision + SD heal status ───────────────────────────────

async function cmdStatus() {
  const supabase = getSupabase();

  // Latest vision score (sd_id IS NULL = portfolio-level)
  const { data: latestVision } = await supabase
    .from('eva_vision_scores')
    .select('id, total_score, threshold_action, scored_at, rubric_snapshot')
    .is('sd_id', null)
    .order('scored_at', { ascending: false })
    .limit(1)
    .single();

  // Latest SD heal scores (sd_id IS NOT NULL)
  const { data: sdScores } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, total_score, threshold_action, scored_at, rubric_snapshot')
    .not('sd_id', 'is', null)
    .order('scored_at', { ascending: false })
    .limit(10);

  console.log('\n\u2500\u2500\u2500 Heal Status \u2500\u2500\u2500\n');

  // Vision section
  console.log('  Vision Heal:');
  if (latestVision) {
    console.log(`    Score: ${latestVision.total_score}/100 (${latestVision.threshold_action})`);
    console.log(`    Date:  ${latestVision.scored_at}`);
  } else {
    console.log('    No vision scores. Run: /heal vision');
  }

  // SD section
  console.log('\n  SD Heal:');
  if (sdScores?.length > 0) {
    for (const s of sdScores) {
      const mode = s.rubric_snapshot?.mode || 'unknown';
      console.log(`    ${(s.sd_id || '?').padEnd(45)} ${s.total_score}/100 (${s.threshold_action}) ${s.scored_at}`);
    }
  } else {
    console.log('    No SD heal scores. Run: /heal sd --today');
  }

  // Active corrective SDs
  const { data: correctives } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, progress')
    .not('vision_origin_score_id', 'is', null)
    .not('status', 'in', '("completed","cancelled")')
    .order('created_at', { ascending: false })
    .limit(10);

  if (correctives?.length > 0) {
    console.log(`\n  Active Corrective SDs (${correctives.length}):`);
    for (const sd of correctives) {
      console.log(`    ${sd.sd_key} [${sd.status}] ${sd.progress || 0}% \u2014 ${sd.title?.substring(0, 55)}`);
    }
  }

  console.log('');
}

// ─── CLI Router ──────────────────────────────────────────────────────────────

const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  const cmd = process.argv[2];
  const rest = process.argv.slice(3);

  switch (cmd) {
    case 'vision':
      cmdVision(rest);
      break;

    case 'sd': {
      const opts = parseSDArgs(rest);
      if (opts.mode === 'persist') {
        if (!opts.persistJson) { console.error('Usage: heal sd persist \'<JSON>\''); process.exit(1); }
        cmdSDPersist(opts.persistJson).catch(e => { console.error(e.message); process.exit(1); });
      } else if (opts.mode === 'generate') {
        if (!opts.scoreId) { console.error('Usage: heal sd generate <score-id>'); process.exit(1); }
        cmdSDGenerate(opts.scoreId).catch(e => { console.error(e.message); process.exit(1); });
      } else {
        cmdSDQuery(opts).catch(e => { console.error(e.message); process.exit(1); });
      }
      break;
    }

    case 'status':
      cmdStatus().catch(e => { console.error(e.message); process.exit(1); });
      break;

    default:
      console.log('Usage: node scripts/eva/heal-command.mjs <command>\n');
      console.log('Commands:');
      console.log('  vision [subcommand]                    Vision heal (delegates to vision-heal.js)');
      console.log('  sd [--today|--sd-id|--last|--since]    SD heal (verify completed SD promises)');
      console.log('  sd persist <JSON>                      Persist SD heal scores');
      console.log('  sd generate <score-id>                 Create corrective SDs from gaps');
      console.log('  status                                 Combined heal status');
      console.log('');
      console.log('SD filters:');
      console.log('  --today                  SDs completed today');
      console.log('  --sd-id <key>            Specific SD by key');
      console.log('  --last <N>               Last N completed SDs (default 5)');
      console.log('  --since <YYYY-MM-DD>     SDs completed on or after date');
      console.log('  --until <YYYY-MM-DD>     SDs completed on or before date (use with --since)');
      process.exit(1);
  }
}
