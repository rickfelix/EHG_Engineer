#!/usr/bin/env node
/**
 * QF-20260830-939: the registry-stamped backstop for THE TRIANGULATION AUDIT (leo_protocol_sections
 * id=601, ratification 7b28b8f0). The audit is an agent-judgment tick (no dedicated worker script),
 * so its own tooling half — scripts/adam-startup-check.mjs's 'triangulation-audit' ADAM_LOOPS entry
 * — instructs the agent to run this AS THE LAST STEP of every cycle, right after writing the
 * cycle's one self_analytics feedback row. Without this, a missed Monday is silent; with it, a
 * missed Monday reads OVERDUE against expected_interval_seconds=7d in periodic_process_registry
 * (row seeded by scripts/one-off/seed-triangulation-audit-registry.mjs).
 *
 * stampLastFired only UPDATES an already-registered self_stamped row (additive-only, never
 * auto-creates) — see lib/periodic-liveness/stamp-last-fired.js.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

export const PROCESS_KEY = 'adam:triangulation-audit';

async function main() {
  const supabase = createSupabaseServiceClient();
  const result = await stampLastFired(supabase, PROCESS_KEY);
  if (!result.stamped) {
    console.error(`[adam-triangulation-audit-stamp] NOT stamped: ${result.reason}. Run scripts/one-off/seed-triangulation-audit-registry.mjs first.`);
    process.exit(1);
  }
  console.log(`[adam-triangulation-audit-stamp] stamped ${PROCESS_KEY}${result.cleared_overdue ? ' (cleared a stale OVERDUE)' : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('adam-triangulation-audit-stamp failed:', err?.message || err); process.exit(1); });
}
