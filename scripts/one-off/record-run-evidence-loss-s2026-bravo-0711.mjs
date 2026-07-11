#!/usr/bin/env node
/**
 * @wire-check-exempt — one-time historical backfill, not a recurring capability.
 *
 * FR-7 (SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001): records the s2026-bravo-0711
 * run's evidence loss as a durable system_events row. The original 59-entry journal
 * is UNRECOVERABLE (its findings survive only via the coordinator packet + H10
 * verifier confirmations) and there is no dedicated harness-run DB table to attach
 * a provenance note to — reusing system_events per the SD's explicit
 * no-new-table/no-schema-change scope. Idempotent (fixed idempotency_key) — safe
 * to re-run.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const RUN_ID = 's2026-bravo-0711';
const IDEMPOTENCY_KEY = `harness_run_evidence_lost:${RUN_ID}`;

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const supabase = createClient(url, key);

  const { data: existing } = await supabase
    .from('system_events')
    .select('id')
    .eq('idempotency_key', IDEMPOTENCY_KEY)
    .maybeSingle();
  if (existing) {
    console.log(`RUN_EVIDENCE_LOSS_ALREADY_RECORDED id=${existing.id} run_id=${RUN_ID}`);
    return;
  }

  const payload = {
    run_id: RUN_ID,
    entries_lost: 57,
    entries_survived: 2,
    reason: 'fixture-scoped/cwd-relative journal path resolution orphaned the original 59-entry journal before SD-LEO-INFRA-RUN-EVIDENCE-DURABILITY-001 landed the run_id-keyed, repo-root-anchored fix; findings survive only via the coordinator packet + H10 verifier confirmations',
    solomon_adjudication: '9b55e2a6 + ba95ac45',
  };
  const { data, error } = await supabase
    .from('system_events')
    .insert({
      event_type: 'harness_run_evidence_lost',
      idempotency_key: IDEMPOTENCY_KEY,
      payload,
      details: payload,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`system_events insert failed: ${error.message}`);
  console.log(`RUN_EVIDENCE_LOSS_RECORDED id=${data.id} run_id=${RUN_ID}`);
}

main().catch((e) => { console.error('RUN_EVIDENCE_LOSS_ERROR', e.message); process.exit(1); });
