#!/usr/bin/env node
/**
 * Incorporate the PLAN-phase TESTING sub-agent's findings (evidence 810ecf43-4bc2-4344-b292-c5ada912a0ae,
 * CONDITIONAL_PASS) into the PRD for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001, before EXEC starts.
 *
 * C-2 is the most consequential: FR-3's AC-2 as originally written ("durable:false / a non-noop
 * action") could be read as "trigger some OTHER action" -- decidePrepark has 3 consumers including
 * scripts/prepark-wip.cjs, the documented WORKER PARK path every session's stop-hook calls. A
 * non-noop return there would auto-commit every worker's dirty main branch on park, and break
 * fleet-auto-push-wip.test.js:34. The correct, SAFE fix is durable:false ONLY while action stays
 * 'noop' -- "don't report false confidence it's safe to kill", not "do something else instead".
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '1eadc0ce-2dd4-4841-b09c-cbd5f08c52b0';

const { data: prd, error: prdErr } = await supabase.from('product_requirements_v2').select('functional_requirements, test_scenarios').eq('sd_id', SD_ID).maybeSingle();
if (prdErr || !prd) { console.error('PRD lookup failed', prdErr); process.exit(1); }

const frs = prd.functional_requirements;
const fr1 = frs.find((f) => f.id === 'FR-1');
const fr3 = frs.find((f) => f.id === 'FR-3');
const fr4 = frs.find((f) => f.id === 'FR-4');

// C-1: FR-1's TS-1 must exercise defaultResolveHolderId with a supabase double that HONORS
// .gte() -- not deps.resolveHolderId injection (already used by every case in
// addsession-singleton-refusal.test.js, and the amber verdict is already asserted green at
// singleton-spawn-decision.test.js:60 via that injection seam -- a test written the "normal" way
// is vacuous, passes on unfixed code).
fr1.description += ' PLAN-PHASE TESTING CORRECTION (evidence 810ecf43-4bc2-4344-b292-c5ada912a0ae, finding C-1): the acceptance test for the stale-holder path must NOT use the deps.resolveHolderId injection seam that resolveSingletonSpawnVerdict already exposes -- every existing holder case in tests/unit/fleet/addsession-singleton-refusal.test.js already injects a custom resolver there, bypassing defaultResolveHolderId entirely (the actual function whose .gte(heartbeat_at, cutoff) at adam-identity.cjs:98 is this FR-1 defect). A test written that way is VACUOUS -- it would pass even on unfixed code, and the amber verdict is already asserted green at singleton-spawn-decision.test.js:60 via that same injection seam. The new test MUST exercise defaultResolveHolderId directly, with a Supabase test double that genuinely HONORS the .gte() filter (simulating real DB behavior) -- that honoring-double is the load-bearing element that makes the test discriminate pre-fix from post-fix.';
fr1.acceptance_criteria.push('The stale-holder acceptance test exercises defaultResolveHolderId directly (not the deps.resolveHolderId injection seam already used elsewhere), with a Supabase double that genuinely honors .gte() filtering -- verified vacuous otherwise (a double that ignores .gte() would pass identically pre- and post-fix)');

// C-2 + C-3: FR-3's most consequential correction.
fr3.description += ' PLAN-PHASE TESTING CORRECTION, CRITICAL (evidence 810ecf43-4bc2-4344-b292-c5ada912a0ae, findings C-2/C-3): AC-2s original wording ("durable:false / a non-noop action") is DANGEROUS if read as "trigger a different action". decidePrepark has THREE consumers, including scripts/prepark-wip.cjs -- the documented WORKER PARK path every sessions stop-hook calls (stop-loop-wakeup-reminder.cjs:376, session-role-orient.cjs:37). A non-noop return there would auto-commit EVERY workers dirty main branch on park, and would break the existing fleet-auto-push-wip.test.js:34. THE CORRECT, SAFE FIX: for a protected-branch + dirty-tree combination, return durable:false ONLY -- action REMAINS noop. The fix communicates "do not report false confidence that killing this is safe", not "do something else instead". Additionally (C-3): the fix must key on graceful-kill.mjs\'s own wasDirty variable (the value threaded in from isWorktreeDirty), NOT prepark-wip.cjs\'s internal checkWorktreeWIP function -- keying on the wrong signal would make the mutation test (AC-1) and TS-10 fail to actually discriminate on the real fix.';
fr3.acceptance_criteria = fr3.acceptance_criteria.map((c) =>
  c.includes("decidePrepark (or the case:'noop' handling immediately downstream of it) is fixed so a protected-branch + dirty-tree combination reports durable:false / a non-noop action, not the current unconditional durable:true")
    ? "decidePrepark (or the case:'noop' handling immediately downstream of it) is fixed so a protected-branch + dirty-tree combination reports durable:false -- action REMAINS 'noop' (CRITICAL: a non-noop action here would auto-commit dirty main branches fleet-wide via scripts/prepark-wip.cjs's worker-park path and break fleet-auto-push-wip.test.js:34; this FR changes ONLY the durability signal, never the action taken)"
    : c
);
fr3.acceptance_criteria.push('The fix keys on graceful-kill.mjs\'s own wasDirty (threaded from isWorktreeDirty), not prepark-wip.cjs\'s internal checkWorktreeWIP -- verified by a test that would fail to discriminate if the wrong signal were used');
fr3.acceptance_criteria.push('isWorktreeDirty synchronicity (TR-2) is verified by a CONCRETE, falsifiable mechanism: a runtime type/return-value check (e.g. asserting the return is a boolean, not a thenable/Promise) at the call site or in a dedicated unit test -- not merely a code-review convention');

// C-5/C-6: FR-4 negative control + gating re-measure.
fr4.acceptance_criteria.push('AC-1 (regex widening) includes a NEGATIVE CONTROL: a deliberately non-violating aliased read pattern (e.g. an alias of an unrelated metadata field) must still PASS after the widening, proving the widened check does not become uselessly permissive');
fr4.acceptance_criteria = fr4.acceptance_criteria.map((c) =>
  c.startsWith("The '1 of 13,025 rows' staleness figure is re-measured")
    ? "The '1 of 13,025 rows' staleness figure is re-measured against current main BEFORE deciding the fix shape -- this re-measure GATES the widen-vs-allowlist decision (per PLAN-phase TESTING finding C-6: the guard's original premise may itself be inverted now that capture-session-id.cjs writes resume_uuid into metadata routinely; do not treat the re-measure as a formality performed after the fix is already chosen)"
    : c
);

// Baseline note (the false-positive this session self-caught and fixed).
fr4.description += ' BASELINE NOTE: the PLAN-phase TESTING pass measured a transient RED baseline (90/91, resume-context.test.js) caused by an unrelated one-off script in this SDs own scripts/one-off/ containing a dotted-expression mention of the resume UUID metadata field in descriptive prose (not an actual code read) -- self-caught and fixed same-session (the phrasing was reworded); baseline reconfirmed clean 15/15 before this correction was written.';

const testScenarios = prd.test_scenarios || [];
testScenarios.push({ id: 'TS-11', scenario: 'FR-3 non-noop-action regression guard', type: 'unit', expected: 'A protected-branch + dirty-tree kill decision returns durable:false with action still noop -- fleet-auto-push-wip.test.js and other prepark-wip.cjs consumers are unaffected' });
testScenarios.push({ id: 'TS-12', scenario: 'FR-4 negative control for the widened/allowlisted regex', type: 'unit', expected: 'A non-violating aliased-metadata-read pattern still passes after the fix; the check does not become uselessly permissive' });

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs, test_scenarios: testScenarios })
  .eq('sd_id', SD_ID);
if (updErr) { console.error('PRD update failed', updErr); process.exit(1); }
console.log('PRD corrected with PLAN-phase TESTING findings (C-1 through C-6). FR-3s dangerous auto-commit blast-radius risk is now explicitly fenced off.');
