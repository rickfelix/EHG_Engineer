#!/usr/bin/env node
/**
 * One-off: write VALIDATION LEAD-phase evidence for
 * SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A (backend half of the TRUE HIDE
 * decomposition, parent SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001).
 *
 * Adversarial pre-build premise validation: independently re-verified each of
 * the 5 corrected premises the description asserts, the 2 named safety guards
 * plus a search for a 3rd unnamed destructive case, and judged the 8
 * LEAD-authored smoke_test_steps against the 9 success_criteria for vacuous
 * coverage.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) per CLAUDE.md prologue rule 11 — no hand-rolled insert.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'd90eedc6-8c96-4685-9a99-ca0267306615';
const SD_KEY = 'SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 80,
    findings: [
      {
        id: 'P1-seat-discovery-independent-of-window-enumeration-HOLDS',
        severity: 'INFO',
        summary: "lib/fleet/console-reaper.mjs:29-32 states window presence is EXCLUDED from the dead-seat test and is ANTI-CORRELATED with life (all 15 live claude.exe on the measured host are Cursor/powershell grandchildren with no window object; the 148 reaped consoles were top-level windows containing nothing); lines 34-36 state outright 'SEAT-TO-WINDOW BINDING IS NOT ATTEMPTED and must not be.' Liveness is legA=absent-from-Win32_Process-claude.exe-image-set AND legB=last_tool_at sampling (console-reaper.mjs:47-73), not window state. Repo-wide git grep for enumerateWindow/EnumWindows returns exactly 6 hits, all in lib/fleet/console-reaper.mjs, lib/fleet/spawn-control.js, lib/fleet/window-handle.js and their own tests/setup script — zero hits in scripts/stale-session-sweep.cjs or scripts/fleet-rollcall.cjs (the sweep and dashboard consumers). console-reaper.mjs's OWN use of window enumeration (FR-5a, enumerateWindowsStrict) is for descendant-count reachability of a CONSOLE candidate, not seat discovery. HOLDS.",
      },
      {
        id: 'P2-no-server-side-visibility-truth-HOLDS-both-halves',
        severity: 'INFO',
        summary: "Backend: grep -n \"window_visible\" server/routes/fleet-panel.js returns zero matches; repo-wide git grep for \"window_visible\" across all of EHG_Engineer also returns zero — formatSessionRow (fleet-panel.js:103-134) emits callsign/identity_kind/model_effort/status/etc. but never window_visible. UI half (out of EHG_Engineer scope, confirmed in the sibling ehg repo per -B's own description): C:/Users/rickf/Projects/_EHG/ehg/src/pages/chairman-v3/BuilderSessionsPage.tsx:193 `const [visible, setVisible] = useState<boolean>(row.window_visible ?? false);` and :384 `onClick={visible ? handleHide : handleOpen}` — since row.window_visible is never produced by the EHG_Engineer backend, `visible` always initializes false and the control always renders 'Open' on every remount, exactly as claimed. Independently confirmed handleHide (:202-205) is a genuine honest-failure toast ('Hiding is not wired yet...'), not a silent no-op or fake success. HOLDS.",
      },
      {
        id: 'P3-window-handle-durable-association-HOLDS',
        severity: 'INFO',
        summary: 'Writer: lib/fleet/spawn-control.js:487 `window_handle: handleResult.handle` inside the post-spawn session-bind block. Reader: lib/fleet/spawn-control.js:557-577 `attach()`, line 568 `const handle = row && row.metadata && row.metadata.window_handle;`, refusing with reason:no_captured_handle when absent (:569-572) and calling focusWindow(handle) otherwise (:574). Same field name on both ends. HOLDS.',
      },
      {
        id: 'P4-pid-capture-deleted-title-matching-forbidden-HOLDS-with-real-capture',
        severity: 'INFO',
        summary: "lib/fleet/window-handle.js:9-38 documents the FR-7 deletion of the whole pid-based capture family (assertValidPid, buildHandleCaptureCommand, parseHandleOutput, captureWindowHandle) with the reason: `(Get-Process -Id <pid>).MainWindowHandle` queried the wt.exe LAUNCHER pid, which exits immediately after handing the tab to WindowsTerminal.exe, so the query always ran against a dead process; deleted after being verified to have ZERO production callers. Title matching is forbidden at :73-77 ('NEVER MATCH ON TITLE') with a REAL capture behind it: tests/unit/fleet/window-enum.test.js:15-16 documents two DIFFERENT processes (SystemSettings pid 15964, ApplicationFrameHost pid 27040) both presenting a window titled exactly 'Settings' (fixture lines 57-58, asserted at :108). HOLDS — a build that reaches for either mechanism would be reintroducing code already proven broken/unreliable in this exact codebase.",
      },
      {
        id: 'P5-read-spread-write-is-the-DOMINANT-but-NOT-universal-pattern-PARTIALLY-OVERSTATED',
        severity: 'WARNING',
        summary: "Confirmed read-spread-write for claude_sessions.metadata in: lib/fleet/spawn-control.js:463-544 (the exact write window_visible would need to join — SELECT metadata, spread ...current.metadata, UPDATE), lib/checkin/steps/model-effort-merge.cjs:21, lib/fleet/canary-guard.js:197-198, scripts/stale-session-sweep.cjs:261-264, and adam-register.cjs's JS-merge fallback path. HOWEVER the absolute claim 'every claude_sessions metadata write in the repo today is read-spread-write' is NOT literally true: database/migrations/20260630_role_handoff_atomic_solomon_flag.sql defines set_solomon_flag/clear_solomon_flag as SECURITY DEFINER Postgres functions doing an in-DB `metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(...)` merge (single-statement, row-locked, no JS read-then-write), and these ARE live today — independently queried `SELECT proname FROM pg_proc WHERE proname IN ('set_adam_flag','clear_adam_flag','set_solomon_flag','clear_solomon_flag')` against the engineer DB and got exactly {clear_solomon_flag, set_solomon_flag} (the Adam sibling migration has NOT been applied). scripts/solomon-register.cjs calls this RPC as its primary path with a JS-merge fallback only when the RPC errors. This does not undercut the SD's build decision — window_visible needs a NEW field, not the narrow 3-key Adam/Solomon flag shape — but it does mean the premise as stated is an overstatement (there is one live exception) and it surfaces the CHEAPEST correct pattern to copy: lib/coordinator/safe-metadata-merge.mjs:69-74, `UPDATE <table> SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE <key> = $1` via a raw pg connection (scripts/lib/supabase-connection.js createDatabaseClient) — hardcoded today to strategic_directives_v2/sd_key but directly adaptable to claude_sessions/session_id, and unlike the RPC route it needs NO chairman-gated migration since it is a plain parameterized UPDATE, not a new DB function.",
      },
      {
        id: 'P6-THIRD-DESTRUCTIVE-CASE-pid-reuse-within-one-terminal-host-and-asymmetric-SW_SHOW-guard',
        severity: 'HIGH',
        summary: "The two named guards (handle-less REFUSE; recycled-HWND-to-a-different-PID REFUSE before SW_HIDE) do not cover a third case the codebase's OWN documentation establishes as real: lib/fleet/window-handle.js:66-67 states 'MainWindowHandle is per-PROCESS: many terminal windows share ONE host process' and TERMINAL_PROCESS_NAME (:85) is 'WindowsTerminal' — i.e. one PID legitimately owns MANY session windows (tabs) over its lifetime. A stale HWND that gets recycled to a DIFFERENT tab of the SAME WindowsTerminal PID (not a different PID) would PASS the stated 'handle valid AND owning PID matches' guard while still being the wrong window — hiding or showing an unrelated live session's tab. The guard as named re-derives exactly the signal (PID) this codebase's own header already rejected as insufficient for naming a SPECIFIC window under this same one-process-many-windows model (window-handle.js:61-67), and does not add anything (e.g. a title/geometry/z-order cross-check, or accepting that PID-only re-validation is a WEAKER guarantee here than in a one-window-per-process app and stating that limitation explicitly). SECOND, narrower gap: the refusal guard and its smoke step (success_criteria item 6 / smoke step 5) are stated only for the SW_HIDE path; there is no symmetric named guard or step for SW_SHOW, even though a hidden window can sit dormant indefinitely (until an operator clicks Show) — a materially LONGER exposure window for HWND recycling than the ~500ms-10s capture-to-first-attach race the existing code already defends against. Recommend PLAN require: (a) explicitly stating the PID-based guard's known weakness under WindowsTerminal's shared-host model rather than presenting it as airtight, and (b) applying the same re-validate-before-touch guard symmetrically to SW_SHOW, not only SW_HIDE.",
      },
      {
        id: 'P7-smoke-steps-vs-success-criteria-one-genuine-gap-step2-is-load-bearing-not-vacuous',
        severity: 'WARNING',
        summary: "8 of 9 success_criteria have a directly corresponding smoke_test_step (durability->step6, concurrent-writer survival->step6, true-hide-vs-minimize->steps1+2, deterministic-restore->step3, handle-less-refusal->step4, stale-handle-refusal->step5, formatSessionRow-emits-field->step7, disposable-window-methodology->baked into every step's instruction). Step 2 (SW_MINIMIZE control) IS genuinely load-bearing, not vacuous: Win32 IsWindowVisible reflects only the WS_VISIBLE style bit, which SW_MINIMIZE preserves (a minimized window still reports IsWindowVisible=TRUE) while SW_HIDE clears it — the control is a positive-control on the MEASUREMENT ITSELF (proving IsWindowVisible can and does read TRUE under a real, adjacent OS operation), not a redundant re-assertion of step 1; without it there is no proof the metric discriminates hide from minimize at all, which is the entire premise the 'TRUE HIDE' project name rests on. GENUINE GAP: success_criterion 9 ('Seat discovery is provably unchanged... a test asserts none of them reads window_visible') has NO corresponding smoke_test_step among the 8 listed — the nearest, step 6, tests that window_visible SURVIVES a stale-session-sweep write (durability), not that the sweep/reaper's OWN dead/reapable decision logic is independent of window_visible. Given P1 (seat-discovery independence) is the load-bearing corrected premise for the whole SD, its own success criterion having zero LEAD-authored smoke coverage is worth PLAN closing explicitly (e.g. a step that runs isSeatDead/isConsoleReapable against a fixture row carrying window_visible and asserts the verdict is unchanged, or a static grep-based test).",
      },
      {
        id: 'scope-and-dependency-check-A-is-independently-buildable',
        severity: 'INFO',
        summary: 'Confirmed genuinely greenfield: `grep -n \"^export \" lib/fleet/spawn-control.js` shows no hide/show/minimize verb among the existing exports (spawn/attach/stop/restart/relaunchUnderProfile/drainAndRestart only), and grep for hide/SW_HIDE/SW_SHOW/minimize in server/routes/fleet-panel.js returns no route. Confirmed sibling child -B (fetched from strategic_directives_v2, parent_sd_id=e5a2ef1d-d28e-4afd-9c2a-4ce57edd6289) is real, correctly one-directional (-B depends on -A\'s endpoint; -A does not reference -B), and lives entirely in a different repo (C:/Users/rickf/Projects/_EHG/ehg). -A\'s own smoke_test_steps (disposable window + hide/show routes + DB row reads + a GET on the API) require no UI element and no code from the ehg repo — no hidden reverse dependency found; -A is independently buildable and testable as scoped.',
      },
    ],
    warnings: [
      'P5 is an overstatement as a literal absolute (one live atomic exception exists: set_solomon_flag), though it does not change the build decision — flagged so PLAN cites it precisely rather than repeating the absolute claim, and so the cheaper safe-metadata-merge.mjs-style pattern (no migration required) is considered alongside a full RPC.',
      'P6 (HIGH): the PID-based recycled-handle guard is weaker than presented under the WindowsTerminal one-process-many-windows model this codebase itself documents; PLAN should require the guard limitation to be stated and the same re-validation applied symmetrically to SW_SHOW, not only SW_HIDE.',
      'P7: success_criterion 9 (seat-discovery independence, the load-bearing corrected premise of this whole SD) has no corresponding LEAD-authored smoke_test_step; PLAN should add explicit coverage rather than relying on step 6 durability testing as a proxy.',
    ],
    recommendations: [
      'Proceed to PLAN. Premises 1-4 independently HOLD with direct file:line evidence; buildability is confirmed greenfield with no duplicate/partial implementation to reconcile.',
      'PLAN should require the PRD to (a) state the PID-guard limitation under shared-host WindowsTerminal PIDs rather than presenting handle+PID re-validation as fully sufficient, (b) apply the same re-validation guard to SW_SHOW symmetrically with SW_HIDE, and (c) add explicit test coverage for success_criterion 9 (seat-discovery/reaper/sweep code paths provably do not read window_visible), none of which are covered by the 8 LEAD smoke_test_steps as written.',
      'For the atomic-merge implementation, evaluate copying lib/coordinator/safe-metadata-merge.mjs\'s raw-pg `COALESCE(metadata,\'{}\'::jsonb) || $2::jsonb` UPDATE pattern against claude_sessions/session_id (no migration needed) as a lower-cost alternative to a new SECURITY DEFINER RPC function.',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      verification_method: 'Direct file reads + git grep/scoped-path greps across the EHG_Engineer worktree and the sibling ehg repo (BuilderSessionsPage.tsx), plus a live pg_proc query against the engineer DB to check whether set_adam_flag/set_solomon_flag are actually applied.',
      premise_verdicts: {
        p1_seat_discovery_independent_of_window_enum: 'HOLDS',
        p2_no_server_side_visibility_truth: 'HOLDS (both backend-emission and UI-toggle halves independently confirmed)',
        p3_window_handle_durable_association: 'HOLDS',
        p4_pid_deleted_title_forbidden: 'HOLDS (real two-process same-title fixture cited)',
        p5_every_write_is_read_spread_write: 'PARTIALLY OVERSTATED — one live atomic exception (set_solomon_flag RPC); dominant pattern is still read-spread-write for the general case window_visible needs',
      },
      third_destructive_case: 'PID re-validation is insufficient to prove SAME-window identity under WindowsTerminal\'s one-process-many-windows model (window-handle.js:61-67 documents this exact weakness for capture); a recycled HWND reassigned to a different tab of the SAME PID passes the named guard. Symmetric gap: no named guard/step for SW_SHOW despite a materially longer dormancy window than the capture race.',
      smoke_step_gap: 'success_criterion 9 (seat-discovery provably unchanged) has zero corresponding smoke_test_step; step 2 (SW_MINIMIZE control) independently confirmed genuinely load-bearing, not vacuous.',
      live_db_check: "pg_proc query returned exactly {clear_solomon_flag, set_solomon_flag}; set_adam_flag/clear_adam_flag NOT present live (migration written but not applied).",
    }),
    metadata: {
      premises_checked: 5,
      premises_holding: 4,
      premises_overstated: 1,
      third_destructive_case_found: true,
      smoke_step_gap_found: true,
      greenfield_confirmed: true,
      ui_half_repo: 'C:/Users/rickf/Projects/_EHG/ehg (out of scope for -A, confirmed BuilderSessionsPage.tsx matches the description)',
    },
    phase: 'LEAD',
    validation_mode: 'prospective',
    summary: "PASS (with concerns) for LEAD-TO-PLAN. Independently re-verified all 5 corrected premises against the actual codebase: seat-discovery independence from window enumeration HOLDS (console-reaper.mjs:29-36, zero enumerateWindow references in the sweep/rollcall consumers); the backend-emits-nothing + UI-seeds-from-nothing claim HOLDS on both sides (0 occurrences of window_visible anywhere in EHG_Engineer; independently confirmed BuilderSessionsPage.tsx:193/384 in the sibling ehg repo); window_handle's writer/reader pair HOLDS (spawn-control.js:487/568); the deleted-pid/forbidden-title claim HOLDS with a real two-process same-title capture cited as evidence (window-enum.test.js:57-58). One premise is an overstatement: not EVERY claude_sessions metadata write is read-spread-write — set_solomon_flag is a live, atomic SECURITY DEFINER RPC (confirmed present in pg_proc), though the general window_visible field still needs a new merge path and the repo's safe-metadata-merge.mjs pattern is the cheaper, migration-free template to copy. Highest-value finding: a genuine THIRD destructive case the SD does not name — PID re-validation is insufficient to prove same-window identity under WindowsTerminal's documented one-process-many-windows model, and the recycled-handle guard is asymmetric (named only for SW_HIDE, not SW_SHOW, despite SW_SHOW's materially longer dormancy exposure). Smoke-step review found step 2 (SW_MINIMIZE control) genuinely load-bearing (proves the measurement instrument discriminates hide from minimize) but found success_criterion 9 (seat-discovery independence, the SD's own load-bearing premise) has zero corresponding LEAD smoke coverage. Scope check confirmed -A is genuinely greenfield (no existing hide/show verb or route) and independently buildable without -B, whose sibling description and BuilderSessionsPage.tsx were independently cross-checked in the ehg repo. Recommend proceeding to PLAN with the PID-guard-limitation, SW_SHOW-symmetry, and success-criterion-9-coverage findings carried into the PRD as explicit requirements.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('VALIDATION result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
