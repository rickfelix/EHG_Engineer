#!/usr/bin/env node
/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001: fold the coordinator's 2026-09-02T18:12Z scope note
 * (Golf-3 signal 5bd643ca, coordinator_directive 3b472f37) into the PRD as FR-8, and stamp
 * strategic_directives_v2.metadata.coordinator_scope_note_post_merge_reverify per the
 * directive's own instruction ("the note is stamped on the SD metadata as
 * coordinator_scope_note_post_merge_reverify"). One-shot, idempotent (checks for existing
 * FR-8 / stamp before writing).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001';

const FR8 = {
  id: 'FR-8',
  title: 'Post-merge re-verify mode for the TESTING runner (--diff-range)',
  description: 'The canonical TESTING sub-agent\'s checkForNonUISdType() zero-UI-by-diff gate computes changed files via `git diff --name-only main...HEAD`. Once an SD\'s branch is merged, HEAD is an ancestor of main and this diff is empty, so the gate fails closed (as designed for a genuinely missing diff) and the run falls through to the full E2E flow, which BLOCKs a genuinely zero-UI, already-merged SD that has no other way to be honestly re-evidenced. Add an explicit --diff-range <from>..<to> option (e.g. the SD\'s last commit vs its pre-merge parent) that the TESTING runner (scripts/execute-subagent.js) and checkForNonUISdType() accept, validated before use (the value is interpolated into a shell command), so a completed SD can be re-evidenced by the runner producer=vitest/Playwright, artifact path + sha256 stamped, evidence_reused=false (source: fresh). Consumed by the uncomplete path (reactivate-sd.js / mark-completion-evidence-invalid.js) to honestly re-open and re-evidence the 4 SDs named in the coordinator scope note (HUMAN-ACTION-FENCES, STAGE-WALK-PASSES, KPI-COUNTS-CHEAP, RESTORE-REHEARSAL-CRON).',
  priority: 'high',
  acceptance_criteria: [
    '--diff-range is parsed as an explicit string-valued CLI flag on scripts/execute-subagent.js (never boolean-coerced)',
    'checkForNonUISdType() uses the supplied range for its git diff instead of main...HEAD when the value is valid',
    'A malformed or unsafe --diff-range value is rejected (never interpolated unvalidated into the shell command) and falls back to the default main...HEAD range',
    'An empty diff still fails closed (requires E2E / no exemption) even with an explicit --diff-range supplied',
  ],
  source: 'coordinator_directive',
  coordinator_directive_id: '3b472f37-6ffc-4cf8-a752-2123ad7a69c2',
  scope_note_ref: 'Golf-3 signal 5bd643ca',
};

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_key, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) throw new Error(`SD not found: ${sdErr?.message}`);

  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements')
    .eq('directive_id', SD_KEY)
    .maybeSingle();
  if (prdErr || !prd) throw new Error(`PRD not found: ${prdErr?.message}`);

  const existingFRs = Array.isArray(prd.functional_requirements) ? prd.functional_requirements : [];
  const alreadyHasFR8 = existingFRs.some((fr) => fr?.id === 'FR-8');
  if (!alreadyHasFR8) {
    const { error: updErr } = await supabase
      .from('product_requirements_v2')
      .update({ functional_requirements: [...existingFRs, FR8] })
      .eq('id', prd.id);
    if (updErr) throw new Error(`PRD update failed: ${updErr.message}`);
    console.log(`✓ FR-8 appended to ${prd.id} (${existingFRs.length} -> ${existingFRs.length + 1} FRs)`);
  } else {
    console.log(`✓ FR-8 already present on ${prd.id} (no-op)`);
  }

  const priorMeta = (sd.metadata && typeof sd.metadata === 'object' && !Array.isArray(sd.metadata)) ? sd.metadata : {};
  if (!priorMeta.coordinator_scope_note_post_merge_reverify) {
    const nextMeta = {
      ...priorMeta,
      coordinator_scope_note_post_merge_reverify: {
        coordinator_directive_id: '3b472f37-6ffc-4cf8-a752-2123ad7a69c2',
        scope_note_ref: 'Golf-3 signal 5bd643ca',
        received_at: '2026-09-02T18:10:54.875762+00:00',
        acked_at: new Date().toISOString(),
        folded_into: 'FR-8',
        summary: 'Post-merge re-verify mode for the TESTING runner via --diff-range, so an already-merged SD can be honestly re-evidenced instead of falling through to a BLOCKED E2E flow on an empty main...HEAD diff.',
      },
    };
    const { error: metaErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: nextMeta })
      .eq('id', sd.id);
    if (metaErr) throw new Error(`SD metadata stamp failed: ${metaErr.message}`);
    console.log(`✓ strategic_directives_v2.metadata.coordinator_scope_note_post_merge_reverify stamped on ${sd.sd_key}`);
  } else {
    console.log(`✓ coordinator_scope_note_post_merge_reverify already stamped on ${sd.sd_key} (no-op)`);
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
