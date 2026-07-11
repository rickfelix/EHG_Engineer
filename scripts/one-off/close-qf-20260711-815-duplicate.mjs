#!/usr/bin/env node
/**
 * Closes QF-20260711-815 ("Fix promote-retro-action-items.mjs actionText/owner
 * field mismatch") as a duplicate, not a shipped fix.
 *
 * QF-20260711-815 was self-sourced this session after QF-20260711-607's
 * auto-promoted description showed "(no text)" for both action items,
 * independently root-caused to actionText()/the owner fallback missing the
 * real retrospectives.action_items {title, description, owner_role} shape.
 *
 * A concurrent fleet worker had already diagnosed and fixed the identical
 * defect via QF-20260711-253 (commit 658cbc7a939, merged to main at
 * 2026-07-11T02:31:29-04:00 — ahead of this QF's PR #5901). PR #5901 was
 * closed unmerged (superseded, functionally equivalent diff, real merge
 * conflict against the already-landed fix). No new code ships from this QF;
 * cancelling rather than completing avoids a false "shipped" DB record.
 *
 * Run once: node scripts/one-off/close-qf-20260711-815-duplicate.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const notes = [
  'CANCELLED — duplicate of QF-20260711-253, which fixed the identical defect first.',
  '',
  'This QF independently root-caused the same bug (actionText()/owner fallback in',
  'scripts/promote-retro-action-items.mjs missing the real retrospectives.action_items',
  '{title, description, owner_role} shape) after seeing it live in QF-20260711-607\'s',
  '"(no text)" auto-promoted description.',
  '',
  'A concurrent fleet worker had already shipped the same fix via QF-20260711-253',
  '(commit 658cbc7a939f9d4ea6b6497e1a5b1f6fcb83c690, merged to main 2026-07-11',
  '02:31:29 -04:00), before this QF\'s PR #5901 was created. PR #5901 hit a real',
  'GraphQL merge conflict against the already-landed equivalent fix; the diffs are',
  'functionally identical (both extend the fallback chain to item.title/owner_role).',
  '',
  'PR #5901 closed unmerged, branch deleted. No new code ships from this QF.',
].join('\n');

const { data, error } = await supabase
  .from('quick_fixes')
  .update({
    status: 'cancelled',
    verification_notes: notes,
    completed_at: new Date().toISOString(),
  })
  .eq('id', 'QF-20260711-815')
  .select('id, status')
  .single();

if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}
console.log('Closed:', JSON.stringify(data, null, 2));
