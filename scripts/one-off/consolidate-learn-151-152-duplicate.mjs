#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151 (LEAD phase): SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152 is
 * a confirmed full duplicate (identical source_items: PAT-LES-1a22954978cc, PAT-LES-7fd10bfaf89a,
 * PAT-LES-e72314a404ae), minted 1 minute apart by a race in /learn's ALREADY_ASSIGNED_OPEN_SD
 * filter (per coordinator directive on session_coordination row 271fc58a, correlation
 * 7e7b3c23-7783-4618-b807-a6657dee97aa). Independently re-verified: 152's source_items match
 * exactly, and 152's claiming_session_id (961a30d3-1a94-4f10-8b06-b48fa2306361) is confirmed
 * STALE -- that session's own claude_sessions.sd_key is null and status='idle' with a live
 * heartbeat, i.e. it moved on without clearing the SD row's claim.
 *
 * Following the established precedent (Alpha-2, PAT-LES-338e7a02477c / LES-011 vs LES-012):
 * cancel the duplicate, continue under the survivor. Here that means: cancel 152 (this session's
 * dispatched row, 151, already has a live claim + worktree), and reassign the 3 issue_patterns
 * rows' assigned_sd_id from 152 to 151 so the closure-loop resolves them correctly when 151
 * completes -- last-write-wins minting had pointed them at 152, the one NOT being built.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const SURVIVOR = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const DUPLICATE = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152';
const PATTERN_IDS = ['PAT-LES-1a22954978cc', 'PAT-LES-7fd10bfaf89a', 'PAT-LES-e72314a404ae'];

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Cancel the duplicate SD, clearing its stale claim in the same statement.
  // Read-merge-write on metadata -- never replace the whole blob (unsafe-sd-metadata-full-
  // blob-write-lint exists specifically to catch this class of destructive overwrite).
  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', DUPLICATE)
    .single();
  if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(1); }

  const mergedMetadata = {
    ...existing.metadata,
    cancellation_reason: `Confirmed full duplicate of ${SURVIVOR} (identical source_items, minted 1 minute apart via a race in /learn's ALREADY_ASSIGNED_OPEN_SD filter). Consolidated under ${SURVIVOR}, which held a live claim + worktree at the time of this decision. Prior claiming_session_id was stale (session idle, sd_key null, live heartbeat) -- cleared as part of this cancellation.`,
  };

  const { data: cancelled, error: cancelErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'cancelled',
      claiming_session_id: null,
      is_working_on: false,
      metadata: mergedMetadata,
    })
    .eq('sd_key', DUPLICATE)
    .select('sd_key, status')
    .single();

  if (cancelErr) { console.error('CANCEL FAILED:', cancelErr.message); process.exit(1); }
  console.log('CANCELLED:', cancelled.sd_key, '->', cancelled.status);

  // 2. Reassign the 3 shared patterns' assigned_sd_id to the survivor.
  for (const patternId of PATTERN_IDS) {
    const { data, error } = await supabase
      .from('issue_patterns')
      .update({ assigned_sd_id: SURVIVOR })
      .eq('pattern_id', patternId)
      .select('pattern_id, assigned_sd_id')
      .single();
    if (error) { console.error(`REASSIGN FAILED (${patternId}):`, error.message); process.exit(1); }
    console.log('REASSIGNED:', data.pattern_id, '->', data.assigned_sd_id);
  }

  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
