#!/usr/bin/env node
/**
 * Stamp the chairman-apply gate on SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
 *
 * WHY THIS EXISTS. FR-2's core deliverable is a CREATE OR REPLACE FUNCTION
 * (database/migrations/20260727_release_sd_qf_reopen.sql). The apply-guards classify that DDL
 * class NON-DELEGATABLE — no worker, coordinator or Adam may apply it, and no worker may stamp
 * the `-- @approved-by:` header, because that header IS the proof of deliberate human authority
 * the 3-factor gate exists to capture. So the SD is BUILT but cannot be COMPLETE until the
 * chairman grants the apply-GO.
 *
 * The 2026-06-28 sourcing lesson says this must be pre-flagged at SOURCING precisely so the
 * worker can plan completion around it; this SD's metadata did NOT carry it, so the gate was
 * discovered at EXEC — the exact late-discovery pathology that lesson names, recurring. RETRO
 * independently confirmed via the feedback table that a different SD hit the identical named gap
 * five weeks earlier.
 *
 * WHAT THIS PROTECTS AGAINST. sd-start.js now AUTO-CHAINS LEAD-FINAL-APPROVAL
 * (SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001). Nothing in the gate pipeline knows about
 * verify-release-sd-qf-branch.mjs, so once the PR merges, a LEAD-FINAL run would very likely PASS
 * and mark this SD `completed` while FR-2's acceptance criterion ("Migration is applied and
 * verified against the live function definition, not just the .sql file") is measurably UNMET.
 * That is a status assertion contradicted by the live system — the precise camouflage class this
 * SD exists to remove, committed by the SD itself at the last step.
 *
 * Read-modify-write of two metadata keys only. Idempotent.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';

const NOTE = [
  'CHAIRMAN APPLY-GO REQUIRED BEFORE LEAD-FINAL-APPROVAL.',
  'FR-2 deliverable database/migrations/20260727_release_sd_qf_reopen.sql is CREATE OR REPLACE',
  'FUNCTION public.release_sd — non-delegatable DDL. Staged, reviewed, dry-run clean',
  '(sha256=3d867f110a8da4cae999be3caf6c9073562f3fadab953c70e233cace306a2be3, 1 declared object,',
  'not already applied), but NOT applied: scripts/one-off/verify-release-sd-qf-branch.mjs reports',
  '5/5 FAIL against the live pg_get_functiondef. Verified independently by TESTING, SECURITY,',
  'VALIDATION and RETRO.',
  '',
  'DO NOT run LEAD-FINAL-APPROVAL until the apply lands — no gate checks the live function, so it',
  'would pass and assert completion against an unmet FR-2 acceptance criterion.',
  '',
  'CEREMONY ONCE THE CHAIRMAN GRANTS IT (per the 2026-07-11 verbal-approval policy: he approves,',
  'a session executes as scribe — never make him type it):',
  '  1. node scripts/apply-migration.js --issue-token',
  '  2. stamp `-- @approved-by: <his git user.email>` into the .sql file',
  '  3. COMMIT the stamped file (the git_committed guard rejects apply-then-commit)',
  '  4. MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js <path> --prod-deploy',
  '  5. node scripts/one-off/verify-release-sd-qf-branch.mjs   (must print 5/5 PASS)',
  '  6. re-measure the stranded-row population as a NUMBER and record before/after',
  '  7. then LEAD-FINAL-APPROVAL',
  '',
  'Everything else in the SD is delivered and green: FR-1/3/4/5/6/7 shipped, SD-owned suite 74/74,',
  'five sub-agent verdicts all CONDITIONAL_PASS, EXEC-TO-PLAN 93, PLAN-TO-LEAD 92.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, current_phase, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(`read failed: ${readErr.message}`);

  const metadata = {
    ...(sd.metadata || {}),
    requires_chairman_apply: true,
    chairman_apply_note: NOTE,
  };

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('id', sd.id);
  if (writeErr) throw new Error(`write failed: ${writeErr.message}`);

  // Read back rather than trusting the write — a silent no-op reports identically to a clean pass.
  const { data: after, error: verifyErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sd.id)
    .single();
  if (verifyErr) throw new Error(`verify failed: ${verifyErr.message}`);

  console.log('SD:', sd.sd_key, '| status:', sd.status, '| phase:', sd.current_phase);
  console.log('requires_chairman_apply:', after.metadata?.requires_chairman_apply);
  console.log('chairman_apply_note present:', Boolean(after.metadata?.chairman_apply_note));
  if (after.metadata?.requires_chairman_apply !== true) {
    console.error('FAILED: flag did not land.');
    process.exit(1);
  }
  console.log('\nFlag stamped and verified by read-back.');
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
