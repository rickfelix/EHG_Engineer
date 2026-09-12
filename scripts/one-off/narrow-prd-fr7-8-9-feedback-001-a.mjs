#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: narrow the PRD's functional_requirements to mark
 * FR-7/FR-8/FR-9 CANCELLED.
 *
 * PREMISE FALSIFIED (chairman/coordinator STOP-AND-VERIFY directive 2c068299, 2026-09-12T12:13Z,
 * following Alpha-2's identical finding for sibling child B): FR-7's entire design rested on
 * public.feedback.metadata being blocked by the append-only trigger. A newer, since-applied
 * migration (database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql, live as
 * of 2026-09-12T10:53Z, decision ba4055b7) narrowed feedback_no_update to a WHEN-clause guarding
 * CONTENT columns only; `metadata` is NOT in that guarded list. Verified live 2026-09-12T12:2x:
 * (1) pg_get_triggerdef confirms the WHEN clause on public.feedback omits metadata; (2) a
 * BEGIN/ROLLBACK probe UPDATE touching only metadata succeeded with zero trigger rejection.
 * withheld-registry.mjs and feedback-fingerprint-promoter.mjs's existing `.update({metadata:...})`
 * call sites (FR-7's entire "owned" scope) touch ONLY the metadata column -- they now work
 * unmodified. FR-7 (new table), FR-8 (backfill), FR-9 (cutover) are unnecessary.
 *
 * FR-1..FR-6 are UNAFFECTED (already shipped, merged, tested) -- they touch lifecycle columns
 * that were ALREADY on the exempt list, but were converted to insert-correction BEFORE the
 * allowlist migration existed, when the blanket-reject trigger was still live; the conversion is
 * a strict superset that remains correct and is not reverted.
 *
 * Usage: node scripts/one-off/narrow-prd-fr7-8-9-feedback-001-a.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CANCELLATION_NOTE = 'CANCELLED 2026-09-12 (STOP-AND-VERIFY directive 2c068299): premise '
  + 'falsified by database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql '
  + '(live 2026-09-12T10:53Z) -- metadata is exempt from feedback_no_update\'s WHEN clause, '
  + 'verified live via pg_get_triggerdef + a BEGIN/ROLLBACK probe UPDATE. '
  + 'withheld-registry.mjs and feedback-fingerprint-promoter.mjs (FR-7\'s entire owned scope) '
  + 'write ONLY the metadata column and now work unmodified. The migration, backfill script, and '
  + 'their tests have been removed (dead code for an abandoned design); reverted in a follow-up '
  + 'commit on this same branch.';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const PRD_ID = 'PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A';
  const { data: prd, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements')
    .eq('id', PRD_ID)
    .single();
  if (readErr) { console.error('READ_FAILED', readErr.message); process.exitCode = 1; return; }

  const CANCEL_IDS = new Set(['FR-7', 'FR-8', 'FR-9']);
  let touched = 0;
  const updated = (prd.functional_requirements || []).map((fr) => {
    if (!CANCEL_IDS.has(fr.id)) return fr;
    touched++;
    return { ...fr, status: 'cancelled', cancellation_reason: CANCELLATION_NOTE };
  });

  if (touched !== CANCEL_IDS.size) {
    console.error(`EXPECTED ${CANCEL_IDS.size} FRs to match, found ${touched} -- refusing to write`);
    process.exitCode = 1;
    return;
  }

  const { error: writeErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: updated })
    .eq('id', PRD_ID);
  if (writeErr) { console.error('WRITE_FAILED', writeErr.message); process.exitCode = 1; return; }

  console.log(`OK: marked ${touched} FR(s) cancelled (FR-7, FR-8, FR-9) on ${PRD_ID}`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
