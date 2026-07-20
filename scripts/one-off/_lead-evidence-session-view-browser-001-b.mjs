#!/usr/bin/env node
/**
 * One-off: write VALIDATION + Explore LEAD-phase evidence for
 * SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B ("v1 terminal attach-focus via SD-B
 * window-handle registry"), ahead of its LEAD-TO-PLAN handoff. Findings below are
 * drawn from real Explore/validation-agent investigation performed this session:
 * confirming attach()'s already-built {ok,reason,session_id} contract, tracing the
 * ctx%/last-tool/wakeup data sources (claude_sessions raw columns + context_usage_log
 * table, NOT the mis-grained get_context_usage_summary RPC), confirming the starved
 * context_usage_log feed (session_id join is currently dead in production), confirming
 * no action-history table exists anywhere in the fleet namespace, and identifying
 * session-watchdog.js's classifyWatchdogState() as the renderer-precedent to mirror.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) per CLAUDE.md prologue rule 11 — no hand-rolled insert.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'adaa690d-8950-4bd3-9e35-3d8c95bcbfdc';
const SD_KEY = 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B';

async function writeExplore(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 88,
    findings: [
      { id: 'F1-attach-already-built', severity: 'INFO', summary: "lib/fleet/spawn-control.js's attach(target, opts) is already built and merged (PR #6360): resolves a session by callsign/session_id via resolveLiveSession, reads claude_sessions.metadata.window_handle, calls window-handle.js's focusWindow(), returns {ok, reason, session_id} with reason in {not_resolved:<x>, no_captured_handle, stale_handle}. This already satisfies 'wiring the attach action to the attach() verb' at the function level — EHG_Engineer has no UI/card layer to wire in (no apps/ui, no src/components); sibling child -A (SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A, merged) explicitly scoped itself the same way (backend/control-plane only, frontend deferred until a fleet launcher UI shell exists)." },
      { id: 'F2-no-ctx-lastool-wakeup-in-SD-A-registry', severity: 'INFO', summary: "SD-A (SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001, merged) — session-registry.js/session-manifest.js/session-metering.js carry only identity (session_id/terminal_id/pid/callsign) and role-count drift, NOT ctx%/last-tool/wakeup/history. Those raw signals live directly on claude_sessions/v_active_sessions: current_tool, current_tool_expected_end_at, last_activity_kind, last_tool_at, expected_silence_until — already consumed today by scripts/fleet-dashboard.cjs's formatActivity()/formatSilentUntil()." },
      { id: 'F3-ctx-percent-wrong-grain-and-starved', severity: 'WARNING', summary: "ctx% lives in a separate table, context_usage_log (usage_percent column), NOT part of SD-A's registry surface. The get_context_usage_summary RPC is fleet-wide aggregate only (no session_id param) — wrong grain for a per-session detail pane; must read context_usage_log directly. Live-verified the table has 12 rows total with only session_id values 'unknown'/'' — the feed is starved (matches in-repo comments in .claude/context-usage-feed.cjs and statusline.cjs) so today's real claude_sessions.session_id values join to ZERO rows. ctxPercent must be built fail-soft/nullable; fixing the feed is a separate, out-of-scope concern." },
      { id: 'F4-no-action-history-table', severity: 'INFO', summary: "No per-session tool-call scrollback/history table exists anywhere in the fleet namespace. coordination_events (lib/coordinator/coordination-events.cjs) is a general fleet-event log, not per-session action history. Building true multi-entry history would require a new append-only table + a writer wired into every session's tool loop — a materially larger, separate SD, not this child's sliver." },
      { id: 'F5-renderer-precedent-session-watchdog', severity: 'INFO', summary: "lib/fleet/session-watchdog.js's classifyWatchdogState(session, opts) -> {state, remediation, session_id} is the live precedent to mirror: pure function, no DB/IO inside, flat structured-object return — the right template for a not-yet-built frontend consumer (vs. fleet-view-badges.cjs's plain-string CLI formatters, which are the wrong shape here). No 'renderer'/'viewModel' named precedent exists, but this object-return convention is the de facto equivalent." },
      { id: 'F6-no-duplicate-inflight-work', severity: 'INFO', summary: 'No lib/fleet/session-detail-view.js or attachSession() symbol exists anywhere in the repo — clean build, no overlap with sibling -A (already merged, browser-pane-only) or the parent orchestrator (still in PLAN_PRD, no scaffold committed).' },
    ],
    warnings: [
      'context_usage_log feed is starved in production (session_id join currently dead) — ctxPercent will read as null for real sessions until a separate fix lands; this SD must not claim ctx% as a live working field.',
    ],
    recommendations: [
      "PLAN: scope the detail-pane renderer to {ctxPercent (nullable), lastTool, lastToolAt, lastActivityKind, silentUntil, attachState:{ok, reason, degraded}} — no multi-entry action history, no RPC dependency.",
      'EXEC: mirror session-watchdog.js\'s pure-function/injected-input test convention (tests/unit/fleet/<module>.test.js), no live DB/PowerShell in unit tests.',
    ],
    detailed_analysis: JSON.stringify({
      files_read: ['lib/fleet/spawn-control.js', 'lib/fleet/window-handle.js', 'lib/fleet/session-registry.js', 'lib/fleet/session-manifest.js', 'lib/fleet/session-metering.js', 'lib/fleet/session-registry-adapter.js', 'lib/fleet/session-watchdog.js', 'lib/fleet/fleet-view-badges.cjs', 'scripts/fleet-dashboard.cjs', 'scripts/sync-context-usage.js', '.claude/context-usage-feed.cjs', '.prd-payloads/PRD-SESSION-VIEW-BROWSER-001-A.json'],
      live_db_check: 'context_usage_log queried live: 12 rows total, distinct session_id values only {"unknown",""} — zero join with real claude_sessions.session_id format (session_<hash>_win<n>_<pid>). get_context_usage_summary RPC invoked live: returns fleet-wide aggregate {total_sessions, avg_usage_percent, max_usage_percent, ...}, no session_id parameter.',
    }),
    metadata: { files_identified: ['lib/fleet/session-detail-view.js', 'tests/unit/fleet/session-detail-view.test.js'] },
    phase: 'LEAD',
    validation_mode: 'prospective',
    source: 'Explore',
    summary: "Confirmed attach() is already fully built (no card layer exists to wire in this backend-only repo); traced the real data sources for ctx%/last-tool/wakeup (claude_sessions raw columns + context_usage_log table, not SD-A's registry and not the mis-grained summary RPC); confirmed the ctx% feed is live-verified starved in production; confirmed no action-history table exists; identified classifyWatchdogState() as the renderer-precedent to mirror. No duplicate in-flight work.",
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('Explore', SD_ID, { name: 'Codebase Explorer' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function writeValidation(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 85,
    findings: [
      { id: 'F1-feasible-with-scope-cut', severity: 'INFO', summary: "Verdict: FEASIBLE-WITH-SCOPE-CUT. Buildable as a small, single-file-plus-tests child SD: a new pure lib/fleet/session-detail-view.js exporting buildSessionDetailView(session, ctxRow, attachResult) -> flat view-model, patterned directly on classifyWatchdogState, plus a thin fail-soft adapter performing one claude_sessions read, one best-effort context_usage_log read, and one attach() call. No schema changes, no new tables." },
      { id: 'F2-no-bare-attach-wrapper', severity: 'INFO', summary: "Recommend against a bare attachSession() re-export of spawn-control's attach() — it already returns the right shape ({ok, reason, session_id}); a wrapper adds no value unless real adaptation (mapping reason -> attachState.degraded) is needed, which belongs inside buildSessionDetailView itself, not a separate wrapper function." },
      { id: 'F3-action-history-scope-cut', severity: 'WARNING', summary: 'The SD description names \"action history\" but no data source for a multi-entry scrollback exists (see Explore F4). Recommend cutting true history from this SD\'s scope: render {lastTool, lastToolAt, lastActivityKind} (\"most recent action\", already available on claude_sessions) and explicitly document the gap in the PRD rather than silently dropping the word. A true multi-entry history is a separate, larger future SD (new append-only table + writer wired into every session\'s tool loop).' },
      { id: 'F4-ctx-percent-scope-cut', severity: 'WARNING', summary: 'ctxPercent must be scoped as best-effort/nullable, sourced from context_usage_log directly (not the get_context_usage_summary RPC, which is fleet-wide-only). Given the live-confirmed starved feed, the PRD must not claim this as a working live field for real sessions today — document as degraded-by-default until a separate feed fix lands.' },
      { id: 'F5-reuse-confirmed-no-better-source', severity: 'INFO', summary: 'Confirmed reuse posture is correct: attach() as-is for terminal focus, claude_sessions raw columns for the live slice, context_usage_log table (not the RPC) for ctx%, classifyWatchdogState-style pure-object-return for the renderer convention. No better existing source surfaced.' },
      { id: 'F6-no-hard-feasibility-blocker', severity: 'INFO', summary: 'No RLS/schema/cross-table-join blocker: the adapter performs two independent single-table reads keyed by session_id (no SQL join needed) plus one attach() call, all fail-soft. focusWindow() widening for finer-grained degraded reasons touches a sibling-owned file (window-handle.js) — flagged as a future improvement, not required; attachState.degraded derives fully from attach()\'s existing three reason values.' },
    ],
    warnings: [
      'ctxPercent will read null for real sessions today given the confirmed-starved context_usage_log feed — must be documented as a known, accepted gap, not silently masked.',
      'action-history is scoped down to single most-recent-action fields; the SD description\'s literal word "history" should be clarified in the PRD to avoid a future reviewer expecting a scrollback.',
    ],
    recommendations: [
      "PLAN: net buildable scope = lib/fleet/session-detail-view.js (buildSessionDetailView) + thin fail-soft adapter + tests/unit/fleet/session-detail-view.test.js, no schema changes.",
      'EXEC: unit-test with injected inputs only (no live DB/PowerShell), mirroring session-watchdog.test.js/window-handle.test.js convention.',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001',
      dependency_sd_key: 'SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001',
      dependency_status: 'completed_and_merged (PR #6360)',
      sibling_sd_key: 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A',
      sibling_status: 'completed_and_merged, same backend-only-scope precedent',
      live_db_checks: 'context_usage_log: 12 rows, session_id join dead (only "unknown"/""). get_context_usage_summary RPC: fleet-wide aggregate, no session_id param — wrong grain, excluded as a data source.',
    }),
    metadata: { files_identified: ['lib/fleet/session-detail-view.js', 'tests/unit/fleet/session-detail-view.test.js'] },
    phase: 'LEAD',
    validation_mode: 'prospective',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const explore = await writeExplore(supabase);
  const validation = await writeValidation(supabase);
  console.log('Explore:', explore.id, explore.verdict, explore.confidence);
  console.log('VALIDATION:', validation.id, validation.verdict, validation.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
