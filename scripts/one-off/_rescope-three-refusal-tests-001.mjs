#!/usr/bin/env node
/**
 * One-off: LEAD re-scope of SD-LEO-INFRA-THREE-REFUSAL-TESTS-001.
 *
 * Required by the coordinator ruling (msg 52646e3b) and by
 * metadata.coordinator_fence_review_20260727.headline_correction: the SD headline is FALSIFIED by
 * the test output and must be restated before PLAN.
 *
 * The original description is PRESERVED verbatim below the correction — the provenance (Alpha-3's
 * baseline reproduction, the binding no-edit ruling) is the valuable part of the row and the point
 * of a re-scope is to stop the next reader inheriting a false premise, not to erase the history.
 */
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-THREE-REFUSAL-TESTS-001';

const NEW_TITLE = 'Three refusal tests take their verdict from operator .env and never exercise the guard they assert - host-environment leakage into the unit tier, NOT a fail-open';

const CORRECTION = `*** LEAD RE-SCOPE 2026-07-27 (Alpha-4, worker 39aa8a1e). THE HEADLINE BELOW WAS FALSIFIED BY MEASUREMENT. READ THIS FIRST. ***

THERE IS NO FAIL-OPEN. ALL THREE REFUSALS ARE INTACT. The original title asserted "a profile-stamped
restart can launch without its isolation and report success". It does not: the FR-6 failure diff shows
the spawn env carried CLAUDE_CONFIG_DIR=C:\\Users\\rickf\\.claude-fleet-profiles\\canary, i.e. it launched
WITH its isolation, to a directory that exists on this host. Materially less severe than the headline.

THE NEGATIVE CONTROL — the required first acceptance evidence, on the SAME commit that yields 3 failures
under ambient env, with UNMODIFIED tests and UNMODIFIED source:
  baseline                                                    -> 3 failed / 66 passed
  FLEET_SPAWN_CONTROL_LIVE=false FLEET_ACCOUNT_PROFILES_DIR=  -> 69 passed / 0 failed
The earlier throwaway-worktree reproduction could NOT discriminate a code regression from host env,
because .env is gitignored and reaches every checkout on this host identically. This control can.

ONE ROOT CAUSE, NOT THREE: \`opts.X ?? process.env.Y\`, where a test passes a NULLISH opt meaning
"absent" and ?? falls through to an operator env var that this repo's own .env sets.
  - lib/fleet/spawn-control.js:227  \`const live = opts.live ?? isLiveEnabled();\` — isLiveEnabled() is
    called with NO ARGUMENT, so it reads process.env and BYPASSES the \`env: GUARD_ENV\` the cp3 tests
    thread in precisely to control it (GUARD_ENV is only {FLEET_CANARY_KILL_ENABLED}). .env:186 sets
    FLEET_SPAWN_CONTROL_LIVE=true, so "opts.live absent" resolves LIVE and the spawn the test forbids
    is CORRECT behaviour on this host. Accounts for cp3 tests 1 and 2.
  - lib/fleet/spawn-control.js:103  \`const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null;\`
    The FR-6 test passes baseDir:null meaning "no profiles dir"; ?? treats explicit null as absent and
    .env supplies one, so the fail-loud never arms. Accounts for test 3.

THE ACTUAL DEFECT, STATED NARROWLY: three REFUSAL tests silently take their verdict from operator
environment, so on any host where these vars are set the guard they exist to prove is NEVER EXERCISED —
they report green or red for the wrong reason. A refusal test that cannot establish its own precondition
is not evidence. The root cause sits one level above the call sites: vitest.config.js:16-17 loads the
real .env into the PARENT process and pool:'forks' inherits it into every unit worker, so
tests/setup.unit.js's \`||=\` sentinels never fire. That same gap independently explains the red
tests/unit/setup/env-isolation-guard.test.js (its SUPABASE_URL sentinel is never applied).

RULED SCOPE (coordinator msg 52646e3b + metadata.coordinator_fence_review_20260727):
  IN  — (i) test-side: spawn-control.test.js FR-6 baseDir:null -> baseDir:"" so the test establishes its
        own precondition regardless of host; AND the durable half, fix the HARNESS LEAK so the unit tier
        does not inherit operator .env. Editable files are exactly: tests/unit/fleet/spawn-control.test.js,
        tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js, vitest.config.js.
  OUT — (ii) source-side (making resolveProfileDir honour an explicitly-passed null). It is the RIGHT fix
        — ?? is the wrong operator for a caller-supplied "none" — but lib/fleet/spawn-control.js is
        CONTESTED: SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 has ~20 open PRs and every one modifies it.
        The coordinator owns filing it, sequenced behind that stack. DO NOT scope-creep into it.
  NOTE — the two cp3 tests CANNOT be fixed test-side: their whole subject is the "opts.live ABSENT"
        call shape, so passing live:false to make them host-independent would delete the case under test.
        The harness fix is the only correct lever for those two.

THE BINDING NO-EDIT RULING WAS RIGHT AND IT HELD. Greening these by editing the assertions would have
destroyed three good guards to chase a host config. The ruling permitted a proposal once the refusal
question was answered; it now is, by two independent paths (this determination and the coordinator's
14-agent fence review), which is why the test-side edit is authorised rather than forbidden.

=================== ORIGINAL DESCRIPTION AS FILED (PRESERVED, PREMISE FALSIFIED ABOVE) ===================

`;

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error: readErr } = await supabase
    .from('strategic_directives_v2').select('id, title, description, metadata').eq('sd_key', SD_KEY).maybeSingle();
  if (readErr) throw new Error(`read failed: ${readErr.message}`);
  if (!row) throw new Error('SD not found');

  if (String(row.description || '').includes('LEAD RE-SCOPE 2026-07-27')) {
    console.log('Already re-scoped (idempotent no-op).');
    return;
  }

  const metadata = {
    ...(row.metadata || {}),
    lead_rescope_20260727: {
      at: new Date().toISOString(),
      by: 'Alpha-4 (worker 39aa8a1e)',
      original_title: row.title,
      verdict: 'NO fail-open; all three refusals intact. Host-environment leakage into the unit tier.',
      negative_control: 'FLEET_SPAWN_CONTROL_LIVE=false FLEET_ACCOUNT_PROFILES_DIR= npx vitest run <both files> => 69 passed / 0 failed on the same commit that yields 3 failed / 66 passed under ambient env.',
      authorised_scope: ['tests/unit/fleet/spawn-control.test.js', 'tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js', 'vitest.config.js'],
      excluded_scope: 'lib/fleet/spawn-control.js — contested by SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 (~20 open PRs); source-side fix owned by coordinator, sequenced behind that stack.',
      ruling_ref: 'coordinator msg 52646e3b + metadata.coordinator_fence_review_20260727',
    },
  };

  const { error: updErr } = await supabase.from('strategic_directives_v2')
    .update({ title: NEW_TITLE, description: CORRECTION + String(row.description || ''), metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);
  console.log('Re-scoped', SD_KEY);
  console.log('  new title:', NEW_TITLE);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
