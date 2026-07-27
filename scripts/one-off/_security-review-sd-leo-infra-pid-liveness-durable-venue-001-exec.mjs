#!/usr/bin/env node
// One-off: record SECURITY sub-agent adversarial-review evidence for
// SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (EXEC phase).
//
// Manual expert review (not a scripted scan) covering 5 named threats across:
//   scripts/setup-liveness-watcher-task.mjs (NEW)
//   scripts/periodic-liveness-watcher.mjs
//   scripts/stale-session-sweep.cjs
//   lib/fleet/session-liveness.cjs
//   database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql
//
// Writes via the canonical path: storeSubAgentResults (lib/sub-agent-executor/results-storage.js)
// with metadata built by applySubAgentRepoVerdict (lib/sub-agents/resolve-repo.js) per
// CLAUDE.md prologue #11 -- no hand-rolled repo_path/local_path columns.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = 'SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const findings = [
  {
    threat: 'a) command injection in setup-liveness-watcher-task.mjs',
    verdict: 'no_finding',
    detail:
      "schtasks and powershell are invoked via execFileSync(argv[]) with no shell:true -- both " +
      "resolve to real .exe binaries (schtasks.exe, powershell.exe), so argv elements are passed " +
      "via Windows CreateProcess quoting, never parsed by cmd.exe (the CVE-2024-27980 class applies " +
      "only to .bat/.cmd targets, not .exe targets). TASK_NAME/STARTUP_TASK_NAME are hardcoded module " +
      "constants (setup-liveness-watcher-task.mjs:53-54), never attacker-influenced. The one " +
      "string-interpolated PowerShell value -- taskName inside clearBatterySettings' -Command string " +
      "(setup-liveness-watcher-task.mjs:261-272) -- is escaped correctly for a PS single-quoted " +
      "literal (''-doubling, setup-liveness-watcher-task.mjs:264) and its only call site passes the " +
      "hardcoded TASK_NAME (setup-liveness-watcher-task.mjs:394), so the escape path isn't exercised " +
      "with variable input today. repoRoot (interpolated unescaped into the .cmd's `cd /d \"...\"` " +
      "line, buildWrapperScript at setup-liveness-watcher-task.mjs:68) comes from getRepoRoot() " +
      "(lib/repo-paths.js:378-384), which is derived from this module's own __dirname, not from any " +
      "CLI arg, env var, or DB value -- so it cannot carry attacker-supplied quote/metacharacters " +
      "under the current threat model. MINOR hardening suggestion (not a vulnerability): " +
      "buildWrapperScript does not reject/escape a repoRoot containing `\"`, so if this function is " +
      "ever repurposed to accept a caller-supplied repoRoot (e.g. a venture path from " +
      "applications.local_path) that hygiene should be added defensively before that reuse.",
  },
  {
    threat: 'b) widened PostgREST .or() surface in periodic-liveness-watcher.mjs',
    verdict: 'no_finding',
    detail:
      "ALLOWED_METADATA_FILTER_KEYS allowlist (periodic-liveness-watcher.mjs:62) and the " +
      "`metadata->>${k}.eq.${v}` clause construction (line 92) are BYTE-IDENTICAL before and after " +
      "this change -- only .limit(1).maybeSingle() was removed so every matching row is returned " +
      "instead of the single freshest one. The query already ran under the module-level service-role " +
      "Supabase client both before and after, so no new RLS boundary is crossed by widening the row " +
      "count. Only one column was added to the select() -- session_id (claude_sessions PK, an " +
      "internal UUID already used throughout the fleet codebase for coordination, not a secret). No " +
      "new data class becomes reachable; the `v` filter value is still unescaped exactly as before, " +
      "which the code's own pre-existing comment (lines 55-61) accepts as safe because RLS restricts " +
      "writes to service_role and the sole writer hardcodes trusted values -- that risk boundary is " +
      "unchanged by this diff.",
  },
  {
    threat: 'c) fail-direction of PID-blind abstention in stale-session-sweep.cjs',
    verdict: 'confirmed_fail_closed_with_operational_note',
    detail:
      "Confirmed fails CLOSED. status is set to PID_UNVERIFIABLE (stale-session-sweep.cjs:2047-2052) " +
      "BEFORE the isVeryStale/exceedsDesktopCap branch that would otherwise assign DEAD (line 2053), " +
      "so a PID-blind row can never reach status==='DEAD'. The final isStale field is independently " +
      "ANDed with !pidUnverifiable (line 2074). The release loop only iterates " +
      "`classified.filter(s => s.status === 'DEAD')` (line 2309), so no live worker can be reaped due " +
      "to venue PID-blindness. OPERATIONAL NOTE (not a vulnerability, flagging for the record): the " +
      "always-on CI cron (.github/workflows/sweep-cron.yml, runs-on: ubuntu-latest, */5 min) is now " +
      "PERMANENTLY PID-blind by design (marker dir never exists there), so PID-based DEAD verdicts " +
      "can only ever be rendered by the session-bound STANDARD_LOOPS 'sweep' entry (host-local, " +
      "coordinator-startup-check.mjs) when a coordinator session happens to be running it. This is " +
      "the identical durable-venue gap this SD closes for periodic-liveness-watcher.mjs (via " +
      "setup-liveness-watcher-task.mjs) but was NOT similarly hardened for stale-session-sweep.cjs in " +
      "this diff -- a truly-dead PID-verified session could hold its claim indefinitely if no " +
      "coordinator session ever runs the local sweep. Recommend a follow-up SD/QF to register an " +
      "equivalent host-local Scheduled Task for stale-session-sweep.cjs, mirroring FR-3b.",
  },
  {
    threat: 'd) v_active_sessions migration -- additive columns vs SECURITY INVOKER / RLS',
    verdict: 'no_finding',
    detail:
      "Migration is strictly additive: 4 tail-appended passthrough columns (process_alive_at, " +
      "updated_at, expected_silence_until, pid_validated_at), all sourced from the SAME pre-existing " +
      "_cs LEFT JOIN claude_sessions already used for is_alive/has_uncommitted_changes/loop_state -- " +
      "no new join, no new table, no GRANT changes. All 4 are timestamps of the same sensitivity " +
      "class as heartbeat_at/claimed_at, already exposed by this view to the same readers. " +
      "security_invoker=on was set for v_active_sessions by " +
      "20260602_fix_security_definer_views_and_rls_recurrence.sql; CREATE OR REPLACE VIEW does not " +
      "reset a view's stored reloptions (only the underlying query is replaced), and this migration's " +
      "own header (lines 28-31) documents reusing the identical _cs outer-join pattern already " +
      "established by 20260526_v_active_sessions_expose_liveness.sql for the same reason -- verified " +
      "consistent. No RLS boundary crossed.",
  },
  {
    threat: 'e) generated .cmd wrapper -- execution privilege / path-traversal write sink',
    verdict: 'no_finding',
    detail:
      "WRAPPER_REL_PATH (setup-liveness-watcher-task.mjs:55) is a hardcoded relative constant " +
      "(scripts/cron/liveness-watcher-task.cmd) joined with the trusted, module-derived repoRoot -- " +
      "no caller-supplied segment feeds the destination path, so there is no path-traversal write " +
      "sink. Task registration is measured and documented (lines 149-167) to require NO elevation: " +
      "/Create without /RU or /RL runs the task as the registering (interactive) user at default " +
      "privilege, and the file's own comments record that /XML registration (which could specify an " +
      "elevated principal) was deliberately abandoned in favor of /SC because /XML returned 'Access " +
      "is denied' unelevated on this host -- so the actually-used registration path cannot silently " +
      "escalate privilege. buildTaskXml()/XML_REL_PATH remain defined but are dead code in the current " +
      "main() flow (not wired to any registration call), consistent with that documented decision -- " +
      "not a vulnerability, just unused.",
  },
];

const criticalIssues = [];
const warnings = [
  {
    severity: 'MEDIUM',
    issue:
      'stale-session-sweep.cjs has no host-local durable invoker equivalent to ' +
      'setup-liveness-watcher-task.mjs; PID-based DEAD reaping for this script only ever fires from ' +
      'the session-bound STANDARD_LOOPS entry, so a truly-dead session could hold its claim ' +
      'indefinitely if no coordinator session runs it.',
    recommendation:
      'Follow-up SD/QF: register a host-local Scheduled Task for stale-session-sweep.cjs mirroring ' +
      'FR-3b, so PID-capable reaping does not depend on a live coordinator session.',
  },
  {
    severity: 'LOW',
    issue:
      "buildWrapperScript (scripts/setup-liveness-watcher-task.mjs:64-71) interpolates repoRoot into " +
      "a double-quoted cmd `cd /d \"...\"` line without escaping/rejecting an embedded `\"`.",
    recommendation:
      'Not currently exploitable (repoRoot is module-location-derived, never caller-supplied), but ' +
      'add defensive validation/escaping before this helper is ever repurposed to accept a ' +
      'caller-supplied repoRoot (e.g. a venture path).',
  },
];

const summary =
  'Adversarial security review of 5 named threats across the PID-liveness-durable-venue change set: ' +
  '(a) no command-injection finding in setup-liveness-watcher-task.mjs -- argv-form execFileSync ' +
  'against real .exe targets, hardcoded task names, correctly-escaped single PS interpolation point; ' +
  '(b) periodic-liveness-watcher.mjs .or() allowlist/construction unchanged, widened row count adds ' +
  'no new RLS/injection surface (query already ran service-role before and after); ' +
  '(c) stale-session-sweep.cjs PID-blind abstention CONFIRMED fail-closed (cannot release a live ' +
  'claim), with an operational note that PID-based reaping of genuinely-dead sessions now depends ' +
  'entirely on the session-bound sweep loop since the CI cron is permanently PID-blind by design; ' +
  '(d) the v_active_sessions migration is strictly additive, stays SECURITY INVOKER, exposes only ' +
  'timestamps already class-equivalent to existing exposed columns; ' +
  '(e) the generated .cmd wrapper has no path-traversal sink and the registered task runs unelevated ' +
  'by measured design. Overall verdict: CONCERNS (two non-blocking findings recorded above; no ' +
  'exploitable vulnerability identified).';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  critical_issues: criticalIssues,
  warnings,
  recommendations: [
    'Track a follow-up SD/QF for a host-local durable invoker for stale-session-sweep.cjs (mirrors FR-3b).',
    'Add defensive quote-handling to buildWrapperScript repoRoot interpolation before any reuse with a caller-supplied path.',
  ],
  detailed_analysis: { threats: findings, summary },
  metadata: {
    review_type: 'manual_adversarial_diff_review',
    reviewed_files: [
      'lib/fleet/pid-venue.cjs',
      'lib/fleet/resolve-cc-pid.cjs',
      'lib/fleet/session-liveness.cjs',
      'scripts/stale-session-sweep.cjs',
      'scripts/periodic-liveness-watcher.mjs',
      'scripts/setup-liveness-watcher-task.mjs',
      'database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql',
    ],
    diff_base: 'origin/main...HEAD',
  },
};

async function main() {
  const { data: sdRow } = await supabase
    .from('strategic_directives_v2')
    .select('target_application, current_phase')
    .eq('sd_key', SD_ID)
    .maybeSingle();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: sdRow?.target_application || 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect' },
    results,
    { phase: 'EXEC' }
  );

  console.log('\nSTORED ROW ID:', stored?.id);
  console.log('metadata.repo_path:', stored?.metadata?.repo_path);
  console.log('metadata.executed_from_cwd:', stored?.metadata?.executed_from_cwd);
  console.log('verdict (mapped):', stored?.verdict, '| original_verdict:', stored?.metadata?.original_verdict);
}

main().catch((err) => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
