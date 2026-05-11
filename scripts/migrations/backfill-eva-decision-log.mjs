#!/usr/bin/env node
/**
 * scripts/migrations/backfill-eva-decision-log.mjs
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / FR-7, TR-6, US-007
 *
 * Idempotent run-once parser: reads Todoist comments on EVA project tasks,
 * runs decision-log-formatter.parse() on each, INSERTs the envelopes into
 * eva_support_decision_log with ON CONFLICT (task_id, sequence) DO NOTHING.
 *
 * Resumable: per-batch checkpoint (every 50 entries) written to
 * scripts/one-off/backfill-eva-decision-log-progress.json so a partial run can
 * resume from the last completed task. Re-running after a successful complete
 * run yields inserted=0 (idempotent).
 *
 * Usage:
 *   node scripts/migrations/backfill-eva-decision-log.mjs --dry-run
 *   node scripts/migrations/backfill-eva-decision-log.mjs
 *   node scripts/migrations/backfill-eva-decision-log.mjs --reset  (clear checkpoint)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse as parseEnvelope } from '../eva-support/decision-log-formatter.js';

const CHECKPOINT_PATH = resolve(process.cwd(), 'scripts/one-off/backfill-eva-decision-log-progress.json');
const TARGET_PROJECT_NAMES = ['EVA', 'EVA Next Steps'];
const BATCH_SIZE = 50;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const RESET = args.has('--reset');

function loadCheckpoint() {
  if (RESET || !existsSync(CHECKPOINT_PATH)) {
    return { processedTaskIds: [], inserted: 0, skipped: 0, scanned: 0, started_at: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return { processedTaskIds: [], inserted: 0, skipped: 0, scanned: 0, started_at: new Date().toISOString() };
  }
}

function saveCheckpoint(checkpoint) {
  mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.results)) return response.results;
  return [];
}

async function main() {
  const todoistToken = process.env.TODOIST_API_TOKEN;
  if (!todoistToken) {
    console.error('Error: TODOIST_API_TOKEN required. Get one from https://todoist.com/app/settings/integrations/developer');
    process.exit(1);
  }
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }

  const todoist = new TodoistApi(todoistToken);
  const supabase = createClient(supaUrl, supaKey);

  const checkpoint = loadCheckpoint();
  const processed = new Set(checkpoint.processedTaskIds || []);

  console.log('=== backfill-eva-decision-log ===');
  console.log('Mode:', DRY_RUN ? 'DRY-RUN' : 'LIVE');
  console.log('Checkpoint:', CHECKPOINT_PATH);
  console.log(`Resuming: ${processed.size} task(s) already processed, ${checkpoint.inserted} inserted, ${checkpoint.skipped} skipped`);

  // 1. Find target projects.
  const projects = normalizeListResponse(await todoist.getProjects());
  const targetProjects = projects.filter((p) => TARGET_PROJECT_NAMES.includes(p.name));
  if (targetProjects.length === 0) {
    console.log('No target projects found (looking for: ' + TARGET_PROJECT_NAMES.join(', ') + ')');
    process.exit(0);
  }
  console.log(`Found ${targetProjects.length} target project(s): ${targetProjects.map((p) => p.name).join(', ')}`);

  // 2. Collect all tasks across target projects.
  const tasks = [];
  for (const p of targetProjects) {
    const t = normalizeListResponse(await todoist.getTasks({ projectId: p.id }));
    t.forEach((task) => tasks.push({ ...task, _project: p.name }));
  }
  console.log(`Total active tasks: ${tasks.length}`);

  // 3. Iterate tasks → comments → parse → INSERT.
  let batchCount = 0;
  for (const task of tasks) {
    if (processed.has(task.id)) {
      continue;
    }
    const comments = normalizeListResponse(await todoist.getComments({ taskId: task.id }));
    for (const c of comments) {
      checkpoint.scanned += 1;
      const envelope = parseEnvelope(c.content || '');
      if (!envelope) continue; // Not a decision-log comment.

      if (DRY_RUN) {
        checkpoint.inserted += 1; // counted as would-insert
        continue;
      }

      // Mirror REQUIRED_FIELDS verbatim into the row.
      const row = {};
      for (const k of ['schema_version', 'task_id', 'sequence', 'timestamp', 'flow', 'eva_reply_summary', 'operator_input_summary', 'override_reason', 'model', 'tokens_in', 'tokens_out', 'references']) {
        row[k] = envelope[k];
      }

      const { error } = await supabase.from('eva_support_decision_log').insert(row);
      if (error) {
        if (error.code === '23505') {
          // Unique violation — already imported. Idempotent skip.
          checkpoint.skipped += 1;
        } else if (error.code === 'PGRST205' || error.code === '42P01' || /schema cache/i.test(error.message)) {
          console.error(`Error: eva_support_decision_log table not found. Apply migrations first.`);
          saveCheckpoint(checkpoint);
          process.exit(1);
        } else {
          console.error(`Insert failed for task=${envelope.task_id} sequence=${envelope.sequence}: ${error.message}`);
          checkpoint.skipped += 1;
        }
      } else {
        checkpoint.inserted += 1;
      }
    }

    processed.add(task.id);
    checkpoint.processedTaskIds = [...processed];
    batchCount += 1;

    if (batchCount % BATCH_SIZE === 0) {
      saveCheckpoint(checkpoint);
      console.log(`[checkpoint] ${batchCount} task(s) processed | inserted=${checkpoint.inserted} skipped=${checkpoint.skipped} scanned=${checkpoint.scanned}`);
    }
  }

  saveCheckpoint(checkpoint);
  console.log('\n=== Backfill complete ===');
  console.log(`Tasks processed: ${processed.size} / ${tasks.length}`);
  console.log(`Comments scanned: ${checkpoint.scanned}`);
  console.log(`Envelopes ${DRY_RUN ? 'would-insert' : 'inserted'}: ${checkpoint.inserted}`);
  console.log(`Skipped (already imported or insert error): ${checkpoint.skipped}`);
  if (DRY_RUN) console.log('\nThis was a DRY-RUN — no rows were written. Re-run without --dry-run to apply.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
