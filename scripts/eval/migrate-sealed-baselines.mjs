#!/usr/bin/env node
/**
 * migrate-sealed-baselines.mjs — runtime move of the 30 sealed Fable-5 runs
 * into model_capability_reference (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001 FR-4).
 *
 * RUNTIME LOADER BY DESIGN: the sealed rows never pass through committed SQL
 * (contamination guard) — the table's migration is schema-only, and this script
 * moves RESULTS-ONLY fields (never answer keys, never task text).
 *
 * Fails soft with CEREMONY_PENDING (exit 2) while the chairman-gated DDL apply
 * has not run yet. Idempotent via the UNIQUE(task_id, model_id, effort,
 * content_hash) constraint + upsert.
 *
 * Run from the repo SHARED ROOT (DB scripts are never run from worktrees):
 *   node scripts/eval/migrate-sealed-baselines.mjs [--dry]
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { toReferenceRow } from '../../lib/eval/capability-scorer.mjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the "table total" line is a
// display gauge over an accumulating eval table; rows.length would silently under-report
// once the table exceeds the PostgREST cap.
import { renderCount } from '../../lib/db/fetch-all-paginated.mjs';

/** Pure: sealed_run feedback row -> results-only reference row (ungraded). */
export function sealedRunToRow(feedbackRow) {
  const m = feedbackRow.metadata || feedbackRow.payload || {};
  if (m.record_kind !== 'sealed_run') return null;
  return toReferenceRow({
    task_id: m.task_id,
    shape: m.shape,
    model_id: m.model_id,
    effort: m.effort,
    tokens: m.tokens ?? null,
    wall_clock_ms: m.wall_clock_ms ?? null,
    run_at: m.run_at ?? null,
    content_hash: m.content_hash,
    source_ref: `feedback:${feedbackRow.id}`,
  });
}

/** Pure: is this PostgREST error a missing-table (pre-ceremony) condition? */
export function isMissingTableError(error) {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`;
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(msg);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const probe = await supabase.from('model_capability_reference').select('id').limit(1);
  if (probe.error && isMissingTableError(probe.error)) {
    console.log('CEREMONY_PENDING: model_capability_reference does not exist yet — the STAGED migration (20260716_model_capability_reference_STAGED.sql) must be applied via the chairman-gated @approved-by ceremony first. Nothing migrated.');
    process.exitCode = 2; return;
  }
  if (probe.error) { console.error('probe failed:', probe.error.message); process.exitCode = 1; return; }

  const src = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', 'model_capability_baseline');
  if (src.error) { console.error('sealed corpus read failed:', src.error.message); process.exitCode = 1; return; }

  const rows = (src.data || []).map(sealedRunToRow).filter(Boolean);
  console.log(`sealed runs found: ${rows.length} (answer_key rows are pointers only — never migrated)`);
  if (dry) { console.log('--dry: no writes'); process.exitCode = 0; return; }

  const up = await supabase
    .from('model_capability_reference')
    .upsert(rows, { onConflict: 'task_id,model_id,effort,content_hash', ignoreDuplicates: true })
    .select('id');
  if (up.error) { console.error('upsert failed:', up.error.message); process.exitCode = 1; return; }
  const total = await supabase.from('model_capability_reference').select('id', { count: 'exact', head: true });
  console.log(`migrated (new this run): ${up.data ? up.data.length : 0}; table total: ${renderCount(total.count)}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exitCode = 1; return; });
