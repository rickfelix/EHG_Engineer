#!/usr/bin/env node
/**
 * Session start hook: Telemetry auto-trigger
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C
 *
 * Checks if telemetry analysis is stale and enqueues a run if needed.
 * Runs during SessionStart hook - must complete within 5s timeout.
 * Analysis itself runs asynchronously and does NOT block session startup.
 */

const path = require('path');

async function main() {
  // Check feature flag
  if (process.env.TELEMETRY_AUTO_ANALYSIS_ENABLED === 'false') {
    return;
  }

  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  } catch {
    // dotenv not critical
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return; // Silent exit if no DB config
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch {
    return; // Silent exit if dependency missing
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Dynamic import for ESM module
  let triggerIfStale;
  try {
    const mod = await import('../../lib/telemetry/auto-trigger.js');
    triggerIfStale = mod.triggerIfStale;
  } catch (err) {
    process.stderr.write(`[telemetry:auto] Module load error: ${err.message}\n`);
    return;
  }

  const result = await triggerIfStale(supabase, {
    scopeType: 'workspace',
    scopeId: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  });

  if (result.decision === 'enqueued') {
    console.log(`[TELEMETRY] Auto-analysis enqueued (stale > 7 days)`);
  } else if (result.decision === 'already_queued') {
    // Silent - don't clutter session start
  }
  // 'skipped_fresh' and 'error_non_fatal' are silent
}

main().catch(() => {
  // Never fail session start
});
