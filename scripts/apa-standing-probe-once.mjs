#!/usr/bin/env node
/**
 * Manual/smoke-test invocation for the APA Phase-2 standing round.
 *
 * SD-LEO-INFRA-APA-PHASE-STANDING-001. Production invocation happens via the
 * live eva-master-scheduler daemon's 'apa_standing' round (registered in
 * lib/eva/eva-master-scheduler.js _registerDefaultRounds — daily cadence,
 * auto-discovered into periodic_process_registry via the existing
 * eva_scheduler_heartbeat mechanism). This script exists ONLY for manual
 * runs and the SD's own smoke_test_steps — it calls runApaStandingRound
 * directly and registers nothing (TR-3: no bespoke cron/registry wiring).
 *
 * Usage:
 *   node scripts/apa-standing-probe-once.mjs --once
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { runApaStandingRound } from '../lib/apa/standing-assessment-round.mjs';

export async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const result = await runApaStandingRound({ deps: { supabase } });
  console.log(`apa-standing-probe-once: assessedCount=${result.assessedCount}`);
  return { exitCode: 0, result };
}

export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch {
    // undici absent — natural drain still applies
  }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main()
    .then(({ exitCode }) => gracefulExit(exitCode))
    .catch((err) => {
      console.error('apa-standing-probe-once fatal:', err.message);
      return gracefulExit(1);
    });
}
