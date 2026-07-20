#!/usr/bin/env node

/**
 * Feedback Pipeline Health Check
 *
 * Asserts the end-to-end pipeline invariant:
 *   count(status='new' AND ai_triage_classification IS NULL AND age > 2h) == 0
 *
 * Exits 0 on clean state, 1 on breach. Emits JSON on stderr for workflow
 * consumption: { breach, count, threshold_hours, oldest_age_hours, sample_ids }.
 *
 * CAPA-6 of SD-LEO-INFRA-FEEDBACK-PIPELINE-HEALTH-001
 * @module scripts/modules/inbox/check-pipeline-health
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: this gauge previously used
// rows.length with no .limit() — the exact incident pattern this SD closes (a capped read
// silently under-reports the breach count/severity).
import { renderCount } from '../../../lib/db/fetch-all-paginated.mjs';

const THRESHOLD_HOURS = 2;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[check-pipeline-health] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  return createClient(url, key);
}

async function checkHealth() {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

  // Exact count — a rows.length gauge here would silently truncate at the PostgREST cap and
  // under-report the breach count/severity (the exact incident pattern this SD closes).
  const { count, error } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')
    .is('ai_triage_classification', null)
    .lt('created_at', cutoff);

  if (error) {
    console.error('[check-pipeline-health] Query failed:', error.message);
    process.exit(2);
  }

  const renderedCount = renderCount(count);
  if (renderedCount === 'unavailable') {
    // A failed measurement (count=null, error=null) must never render as a healthy 0.
    console.error('[check-pipeline-health] Count measurement unavailable');
    process.exit(2);
  }

  // Sample rows (oldest + up to 10 ids) for the diagnostic payload — a small, explicitly
  // bounded read, independent of the exact count above.
  const { data: sampleRows, error: sampleError } = await supabase
    .from('feedback')
    .select('id, created_at')
    .eq('status', 'new')
    .is('ai_triage_classification', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(10);

  if (sampleError) {
    console.error('[check-pipeline-health] Query failed:', sampleError.message);
    process.exit(2);
  }

  const rows = sampleRows || [];
  const oldestAgeHours = rows.length > 0
    ? (Date.now() - new Date(rows[0].created_at).getTime()) / (60 * 60 * 1000)
    : 0;
  const sampleIds = rows.map(r => r.id);

  const payload = {
    breach: renderedCount > 0,
    count: renderedCount,
    threshold_hours: THRESHOLD_HOURS,
    oldest_age_hours: Number(oldestAgeHours.toFixed(2)),
    sample_ids: sampleIds,
    checked_at: new Date().toISOString(),
  };

  console.error(JSON.stringify(payload, null, 2));

  if (payload.breach) {
    console.log(`BREACH: ${renderedCount} stale-untriaged feedback rows older than ${THRESHOLD_HOURS}h (oldest: ${payload.oldest_age_hours}h)`);
    process.exit(1);
  } else {
    console.log(`OK: 0 stale-untriaged feedback rows (threshold: ${THRESHOLD_HOURS}h)`);
    process.exit(0);
  }
}

checkHealth().catch(err => {
  console.error('[check-pipeline-health] Unexpected error:', err.message);
  process.exit(2);
});
