#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-1) — the cron's once-per-hour gate.
 *
 * The adam-exec-email workflow is over-scheduled (~every 15 min) to beat GitHub Actions dropping
 * scheduled runs. This CLI decides ONCE per trigger whether this run should proceed to send (and
 * historize), and writes `should_send=true|false` to $GITHUB_OUTPUT. Both the vision:gauge
 * historize step and the send step gate on it, so the email lands ~hourly with no duplicates and
 * the trend is historized exactly once per hour (not 4x).
 *
 * DRY-RUN runs (ADAM_EMAIL_LIVE != 'true', or the workflow_dispatch dry_run input = 'true') ALWAYS
 * proceed (should_send=true): they never send a real email and never write a marker, so the guard
 * must not suppress manual/observe-only testing. Only LIVE runs consult the once-per-hour marker.
 */
import 'dotenv/config';
import { appendFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { shouldSendNow } from '../lib/fleet/exec-email-send-guard.js';

function emit(shouldSend, reason) {
  const line = `should_send=${shouldSend ? 'true' : 'false'}`;
  console.log(`[exec-email-guard] ${line} (${reason})`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) { try { appendFileSync(out, line + '\n'); } catch (e) { console.warn('[exec-email-guard] GITHUB_OUTPUT write failed: ' + (e?.message || e)); } }
}

async function main() {
  const live = process.env.ADAM_EMAIL_LIVE === 'true';
  const forceDry = process.env.FORCE_DRY_RUN === 'true';
  if (!live || forceDry) { emit(true, live ? 'forced dry-run' : 'observe-only (ADAM_EMAIL_LIVE!=true)'); return; }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { emit(false, 'no DB creds (fail-closed)'); return; } // fail-closed: don't risk a duplicate
  const db = createClient(url, key);
  const r = await shouldSendNow(db);
  emit(r.send, r.reason);
}

main().catch((e) => { emit(false, 'guard exception (fail-closed): ' + (e?.message || e)); });
