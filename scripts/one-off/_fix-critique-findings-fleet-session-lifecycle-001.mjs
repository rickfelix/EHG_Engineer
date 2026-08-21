#!/usr/bin/env node
/**
 * Address all 6 PRE_PLAN_ADVERSARIAL_CRITIQUE findings (plan_critiques 8a58c846-4bb2-475d-aa5e-baacc6eec359)
 * for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001, and fix the SD's generic-placeholder smoke_test_steps.
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

const SD_KEY = 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001';
const SD_ID = '1eadc0ce-2dd4-4841-b09c-cbd5f08c52b0';

// Fix 1: SD's smoke_test_steps (real, specific -- was the generic auto-placeholder)
const smokeSteps = [
  { step_number: 1, instruction: 'With a fixture Adam session heartbeat aged 600-3600s (stale but present), call the fleet spawn-check route (server/routes/fleet-actions.js) and inspect the response body', expected_outcome: 'Response body includes uiLabel/uiEnabled reflecting the amber stale-holder verdict, not a generic Start/Blocked state' },
  { step_number: 2, instruction: 'Run schtasks /Query /TN LEO-ConsoleReaper on the fleet host after FR-2 lands, then roll back via the unregister path', expected_outcome: 'Task is found registered before rollback, and NOT FOUND after rollback -- proving the change is reversible' },
  { step_number: 3, instruction: 'Simulate a session on a protected branch (main) with an uncommitted change, then run the graceful-kill decision path', expected_outcome: 'The session is judged durable:false (not killed) and the recorded reason references the dirty worktree, not clean tree -- fails on pre-fix code, passes after' },
  { step_number: 4, instruction: 'Run the resume-context test suite while session-registry-adapter.js still contains its aliased read of the session metadata resume UUID field', expected_outcome: 'Test FAILS (proving detection of the alias), then passes once the fix/allowlist lands' },
];

const { error: sdErr } = await supabase.from('strategic_directives_v2').update({ smoke_test_steps: smokeSteps }).eq('sd_key', SD_KEY);
if (sdErr) { console.error('SD smoke_test_steps update failed', sdErr); process.exit(1); }
console.log('SD.smoke_test_steps replaced with real, specific steps.');

// Fix 2: PRD corrections
const { data: prd, error: prdErr } = await supabase.from('product_requirements_v2').select('functional_requirements, system_architecture, test_scenarios').eq('sd_id', SD_ID).maybeSingle();
if (prdErr || !prd) { console.error('PRD lookup failed', prdErr); process.exit(1); }

const frs = prd.functional_requirements;
const fr1 = frs.find((f) => f.id === 'FR-1');
const fr2 = frs.find((f) => f.id === 'FR-2');
const fr3 = frs.find((f) => f.id === 'FR-3');

fr1.description += ' ADVERSARIAL-CRITIQUE CORRECTIONS (LEAD phase, plan_critiques 8a58c846-4bb2-475d-aa5e-baacc6eec359): (1) the filtered-to-unfiltered resolver swap belongs in the RESOLVER-OWNING module (lib/coordinator/adam-identity.cjs getActiveAdamId / lib/coordinator/solomon-identity.cjs getActiveSolomonId -- or the fleet-actions.js route call site that invokes them), NOT in singleton-spawn-decision.mjs itself, which is a pure decision function fed whatever holder its caller resolves; singleton-spawn-decision.mjs needs at most a doc-comment correction, not a logic change. (2) The specific existing helper to reuse for staleness detection is fetchAllAdamsStrict / fetchAllSolomonsStrict (lib/coordinator/adam-identity.cjs / solomon-identity.cjs) -- committed explicitly here to avoid a second, parallel unfiltered-lookup implementation. (3) The UI component that must actually render uiLabel/uiEnabled is server/public/fleet-ui/fleet-panel.js (the only fleet UI surface that exists; vanilla JS, confirmed by Explore evidence -- NOT a React/src component). It must fetch/bind the new response fields as plain data and render them; per tests/unit/fleet/fleet-panel-no-ui-only-gate.test.js it must NEVER reimplement decideSingletonSpawn/isSingletonRole client-side.';
fr1.acceptance_criteria.push('The filtered-to-unfiltered resolver swap lands in the resolver-owning module (getActiveAdamId/getActiveSolomonId or their fleet-actions.js call site), not in singleton-spawn-decision.mjs, and reuses fetchAllAdamsStrict/fetchAllSolomonsStrict rather than a new parallel lookup');
fr1.acceptance_criteria.push('server/public/fleet-ui/fleet-panel.js is the identified UI component that fetches/binds and renders uiLabel/uiEnabled from the route response, without reimplementing any decision logic client-side (tests/unit/fleet/fleet-panel-no-ui-only-gate.test.js must continue to pass unchanged)');

fr2.acceptance_criteria.push('Rollback is proven, not just forward activation: the unregister path removes the LEO-ConsoleReaper task, the FLEET_CONSOLE_REAPER_ENABLED flag can be cleanly unset, and a post-rollback check confirms the reaper is inert again');
fr2.acceptance_criteria.push('Mutation-verified like the other FRs: removing the creation-time capture hook reproduces the scan-time gap (TS-4 fails again); unsetting the enable flag or unregistering the task reproduces inertness (activation checks fail again)');

fr3.acceptance_criteria.push('isWorktreeDirty fails CLOSED, not open: if the underlying git-status check cannot run (not a git repo, git not found, permission error, non-zero unexpected exit), the check reports dirty=true (never silently treats an unknown state as clean) -- consistent with this FRs safety purpose of never silently losing uncommitted work; a test proves a git-status failure still blocks the kill rather than defaulting to durable:true');

const testScenarios = prd.test_scenarios || [];
testScenarios.push({ id: 'TS-9', scenario: 'FR-2 rollback: unregister the console reaper task and revert the enable flag', type: 'integration', expected: 'Task reports NOT FOUND after rollback; reaper confirmed inert again' });
testScenarios.push({ id: 'TS-10', scenario: 'isWorktreeDirty fail-closed on a git-status error', type: 'unit', expected: 'A simulated git-status failure is treated as dirty=true, not silently clean' });

let sa = typeof prd.system_architecture === 'string' ? JSON.parse(prd.system_architecture) : prd.system_architecture;
const ssdIdx = sa.components.findIndex((c) => c.name === 'lib/fleet/singleton-spawn-decision.mjs');
sa.components[ssdIdx].change = 'doc-comment correction only (stale panel-consumer claim) -- the resolver swap itself lands in the resolver-owning module, see next two entries (FR-1)';
sa.components.splice(
  ssdIdx + 1,
  0,
  { name: 'lib/coordinator/adam-identity.cjs / lib/coordinator/solomon-identity.cjs (getActiveAdamId/getActiveSolomonId) or their fleet-actions.js call site', change: 'swapped to fetchAllAdamsStrict/fetchAllSolomonsStrict (unfiltered) for staleness detection, explicitly committed to avoid a parallel lookup implementation (FR-1)' },
  { name: 'server/public/fleet-ui/fleet-panel.js', change: 'the actual UI consumer -- fetches/binds and renders uiLabel/uiEnabled as plain server-provided data (FR-1)' }
);

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs, system_architecture: JSON.stringify(sa), test_scenarios: testScenarios })
  .eq('sd_id', SD_ID);
if (updErr) { console.error('PRD update failed', updErr); process.exit(1); }
console.log('PRD corrected: all 6 adversarial-critique findings addressed.');
