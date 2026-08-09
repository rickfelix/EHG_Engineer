import { createClient } from '@supabase/supabase-js';

const SD = 'SD-LEO-INFRA-TREND-EYES-OFF-001';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: before, error: readErr } = await sb
  .from('strategic_directives_v2').select('id,metadata').eq('sd_key', SD).single();
if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(2); }

// A RESUME BRIEF written so a seat with NO memory of this session can finish the SD.
// Written now, deliberately, because the two futures that need it — my own context being
// compacted, or the claim being handed to a fresh seat — both destroy the only place this
// knowledge currently lives. Neither future announces itself in advance.
const resume_brief = {
  written_by: 'Alpha-2 (session a3f4b741), 2026-08-07',
  why_this_exists: 'The SD is deliberately held mid-EXEC on an external blocker, so the normal SD-boundary handoff will not happen for a while. Compaction or a claim re-route would otherwise lose the sequencing constraint below, and losing it is not recoverable from the code alone.',

  state: 'EXEC. Code complete and pushed on feat/SD-LEO-INFRA-TREND-EYES-OFF-001. 71 unit tests green (tests/unit/solomon/). EXEC-TO-PLAN precheck passes at 87%. NOT merged, deliberately.',

  the_one_thing_that_must_not_be_lost: {
    rule: 'DO NOT MERGE until the RLS policy is applied AND read back. Ratified as binding by the coordinator.',
    why: 'The workflow ships an ACTIVE 06:00 daily schedule. Merging first makes the sweep eligible to write its first run-receipt into codebase_health_snapshots while that table still carries a blanket authenticated SELECT — which is precisely the exposure the chairman ratified the policy to close. Zero receipts exist today; that is the entire timing argument, and merge-first spends it.',
    do_not_reason_around_it: 'A later reader will see a green precheck and an approved chairman decision and conclude the merge is safe. It is not, until the apply lands.',
  },

  blocker: {
    what: 'The live RLS apply sits on the chairman 3-factor token path (apply-migration.js --issue-token then --prod-deploy), one level above the coordinator.',
    my_access: 'A worker seat CANNOT run it. node scripts/apply-migration.js is classifier-denied even in read-only --dry-run form, confirmed stable across two ticks on separate passes. Do NOT retry it; that is the deliberate boundary, not the stochastic denial class.',
    who_owns_it: 'The chairman keyboard step, or the coordinator at his word. They own the apply-confirmed signal.',
    chairman_decision: '74f2a2c9 (verbatim Yes, 2026-08-07 12:58:56Z)',
    migration_file: 'database/migrations/20260807_trend_eyes_receipt_service_role_only_STAGED.sql — contains its own apply / verify / rollback steps.',
  },

  what_to_do_when_apply_is_confirmed: [
    '1. Run: node scripts/solomon/trend-eyes-receipt-rls-probe.mjs --verify (from the worktree). It exits 1 on failure and cleans up its seed on every path. Its pre-apply baseline is already captured in .artifacts/receipt-rls-baseline.json and is NOT re-obtainable — do not delete it.',
    '2. The catalog arm (pg_policies read-back) is NOT yours and structurally cannot be — PostgREST has no pg_policies and no exec_sql RPC exists. It rides the apply seat pg connection.',
    '3. Merge unblocks on BOTH arms green: catalog read-back (apply seat) + the probe (this seat).',
    '4. Then run EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL, then the post-completion tail.',
  ],

  decisions_already_made_do_not_relitigate: {
    T3: 'DESCOPED from V1 by Solomon (via Adam a31ae727) after his counterfactual was MEASURED: issue_patterns.source_feedback_ids is a non-null EMPTY array on all 1,693 rows, so chain coverage is 0.00%. Return trigger must test NON-EMPTY, never non-null — non-null is already 100% and would fire falsely. Encoded in T3_DESCOPE and pinned by test.',
    receipt_contents: 'NOT redacted, per the SECURITY sub-agent recommendation: classifier_coverage is the anti-narrowing instrument, so removing it reinstates blindness while leaving the more sensitive topic labels in place. The content is required; the ACCESS was what was wrong.',
    filename: 'The entrypoint MUST keep a -sweep suffix. lib/invocation-detector/requires-invocation.js:26 is name-keyed; the original trend-eyes-scan.mjs was invisible to INVOCATION_PATH_PROOF, the same blind spot that let two eva trend scripts ship unwired. TS-12 pins both directions.',
  },

  hard_won_lessons_in_this_code: [
    'VERIFY AT THE CONSUMER, not where you made the change. Four separate defects here had that shape; the worst was a one-token revert (?? undefined -> ?? []) that restored a false all-clear with all 52 tests green, because runSweep had no tests and the test asserted on an expression written inline in the test itself.',
    'UNKNOWN IS NOT FLAT. The resolvers return null (not []) when the corpus cannot answer, so the probe reports UNKNOWN rather than a reassuring FLAT. If you ever change that conversion, toProbeFacts is the single place it lives and it is tested directly.',
    'A test written by whoever wrote the fix inherits the fix assumption unless the fixture comes from OUTSIDE it — real corpus rows, or the mutation. Two of my tests here were vacuous until a mutation proved it.',
  ],

  evidence_rows: {
    VALIDATION_lead: 'd539b2c6-4c21-4fc6-ab29-482f46f8262c',
    Explore_lead: '7d07830b-6b39-49bc-b88b-3e9ac855dd99',
    TESTING_exec_recheck: '77dbfe52-b36a-43ad-965d-72722fdfce3e',
    SECURITY_exec_recheck: '42357fdf-41cd-4147-b5bb-0352c37abcea',
  },
};

const nextMd = { ...(before.metadata || {}), resume_brief };

const { data: updated, error: updErr } = await sb
  .from('strategic_directives_v2').update({ metadata: nextMd }).eq('sd_key', SD).select('id');
if (updErr) { console.error('UPDATE FAILED:', updErr.message); process.exit(2); }
if (!updated || updated.length !== 1) {
  console.error(`UPDATE MATCHED ${updated ? updated.length : 0} ROWS, expected 1 — treating as FAILURE`);
  process.exit(3);
}

const { data: after, error: verifyErr } = await sb
  .from('strategic_directives_v2').select('metadata').eq('sd_key', SD).single();
if (verifyErr) { console.error('READBACK FAILED:', verifyErr.message); process.exit(2); }
console.log('rows_updated=1');
console.log('resume_brief persisted:', after.metadata?.resume_brief ? 'yes' : 'MISSING');
console.log('merge-hold rule present:', after.metadata?.resume_brief?.the_one_thing_that_must_not_be_lost?.rule ? 'yes' : 'MISSING');
console.log('prior metadata keys preserved:', Object.keys(before.metadata || {}).every((k) => k in after.metadata) ? 'ALL PRESERVED' : 'LOSS DETECTED');
console.log('trend_eyes_go still present:', after.metadata?.trend_eyes_go ? 'yes' : 'NO — REGRESSION');
console.log('lead_acceptance_conditions still present:', after.metadata?.lead_acceptance_conditions ? 'yes' : 'NO — REGRESSION');
