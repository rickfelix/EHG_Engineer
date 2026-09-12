#!/usr/bin/env node
/**
 * QF-20260911-299: batch-drives the retro -> issue_patterns extraction hop. The hop itself
 * (extractPatternsFromRetrospective, already idempotent per-row) had no invoker at all --
 * 568/608 retrospectives in 14d never got learning_extracted_at stamped, while issue_patterns
 * is read on the sub-agent, handoff, /learn and cron paths. Loops over every retrospective
 * still missing learning_extracted_at; a row already stamped is never re-processed (both by
 * this driver's own IS NULL query and by extractPatternsFromRetrospective's own guard).
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { extractPatternsFromRetrospective } from './auto-extract-patterns-from-retro.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export const LAG_ALARM_HOURS = 48;
const BATCH_LIMIT = 100; // bounded per run; the hourly cron picks up any remainder next cycle

/**
 * @param {{supabase?: object, extractFn?: Function, limit?: number}} [opts] injectable for tests
 */
export async function extractPendingRetroPatterns({ supabase, extractFn = extractPatternsFromRetrospective, limit = BATCH_LIMIT } = {}) {
  const sb = supabase || createSupabaseServiceClient();
  const { data: pending, error } = await sb
    .from('retrospectives')
    .select('id, created_at')
    .is('learning_extracted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  let processed = 0;
  const failures = [];
  for (const row of pending || []) {
    try {
      await extractFn(row.id);
      processed++;
    } catch (err) {
      failures.push({ id: row.id, error: err.message });
    }
  }

  const oldestAgeHours = pending?.length
    ? (Date.now() - new Date(pending[0].created_at).getTime()) / 3_600_000
    : 0;

  return {
    candidates: pending?.length || 0,
    processed,
    failed: failures.length,
    failures,
    oldestAgeHours,
    alarm: oldestAgeHours > LAG_ALARM_HOURS,
  };
}

async function main() {
  const result = await extractPendingRetroPatterns();
  console.log(JSON.stringify(result, null, 2));
  if (result.alarm) {
    console.error(`[extract-pending-retro-patterns] ALARM: oldest unextracted retrospective is ${Math.round(result.oldestAgeHours)}h old (> ${LAG_ALARM_HOURS}h threshold)`);
  }
  process.exit(result.failed > 0 || result.alarm ? 1 : 0);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
