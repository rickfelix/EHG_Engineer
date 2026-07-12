#!/usr/bin/env node
/**
 * Closes QF-20260712-778 ("[Fingerprint x1] CRITICAL SECURITY FINDING
 * (Pause Point #5)") as a duplicate, not a new work item.
 *
 * QF-20260712-778 auto-promoted from Charlie's signal about the anon-role
 * venture_user_select_feedback RLS policy on public.feedback (unbound
 * tenant predicate -- any anon-key holder can read every venture's user
 * feedback). Alpha-6 independently flagged this as mis-triaged/duplicate
 * (feedback id 29e1657a-20d7-4bdf-b09b-52e0afab60eb): the fix already
 * exists, built and shipped, as SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001
 * (status=completed as of this check), which drops/recreates the policy in
 * database/migrations/20260712_drop_venture_user_select_feedback_STAGED.sql.
 *
 * Verified live via pg_policies (2026-07-12): venture_user_select_feedback
 * is STILL unbound in production -- the exposure is real and open -- but
 * that is because the fix is STAGED / chairman-gated-apply-pending, not
 * because no fix exists. Opening a new SD/QF for this would be a second
 * duplicate of an already-completed SD; the correct next action is a
 * chairman-approved apply of the existing staged migration, not new work.
 *
 * Run once: node scripts/one-off/close-qf-20260712-778-duplicate.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const notes = [
  'CANCELLED — duplicate of SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001 (status=completed),',
  'which already built the fix for this exact policy.',
  '',
  'This QF auto-promoted from Charlie\'s critical signal about the anon-role',
  'venture_user_select_feedback RLS policy on public.feedback (unbound tenant',
  'predicate -- any anon-key holder can read every venture\'s user feedback).',
  '',
  'Alpha-6 independently flagged this as mis-triaged/duplicate (feedback',
  '29e1657a-20d7-4bdf-b09b-52e0afab60eb): SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001',
  'already shipped a fix as database/migrations/',
  '20260712_drop_venture_user_select_feedback_STAGED.sql (STAGED / chairman-gated apply).',
  '',
  'Verified live via pg_policies (2026-07-12): the policy is still unbound in',
  'production right now -- the exposure is real and open -- but that is because',
  'the existing staged migration has not yet been chairman-applied, not because',
  'no fix exists. Sibling residual (authenticated-role select_feedback_policy)',
  'has the same shape: fixed via SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001',
  '(also completed, also staged/chairman-gated, migration',
  '20260712_feedback_authenticated_select_caller_venture_STAGED.sql).',
  '',
  'Both staged migrations are ready; the correct next action is a chairman-',
  'approved apply of both, not a new SD/QF. Escalated via /signal to the',
  'coordinator instead of opening more duplicate work.',
].join('\n');

const { data, error } = await supabase
  .from('quick_fixes')
  .update({
    status: 'cancelled',
    verification_notes: notes,
    completed_at: new Date().toISOString(),
  })
  .eq('id', 'QF-20260712-778')
  .select('id, status')
  .single();

if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}
console.log('Closed:', JSON.stringify(data, null, 2));
