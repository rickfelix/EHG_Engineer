#!/usr/bin/env node
/**
 * SECURITY (Chief Security Architect) EXEC-TO-PLAN verdict for
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F.
 * Canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e59034d1-0e8c-4bb8-8846-5de21c47abbf';
const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F';

const findings = [
  {
    id: 'S1-command-injection-none',
    severity: 'INFO',
    summary: 'COMMAND INJECTION: NONE, measured not assumed. detectPruneCandidates (lib/worktree-reaper/orphan-sweep.js:518) calls execSync with the FIXED literal string "git worktree prune --dry-run -v"; repoRoot is passed as the cwd OPTION, which node never shell-parses. Probe: detectPruneCandidates({repoRoot: "C:/tmp; rm -rf /", gitRunner}) delivered args=["worktree","prune","--dry-run","-v"] and cwd="C:/tmp; rm -rf /" -- an argv array plus an inert cwd value, no shell string assembly anywhere. This matches the pre-existing safe pattern at line 227. Parsed candidate NAMES never reach any exec/spawn: repo-wide grep confirms the only consumers of parsePruneCandidates output are buildPruneCandidateRows -> writeRows (the audit_log insert). Adversarial names "$(whoami)", "`id`", "a; rm -rf /" parse to inert data strings and stop there.',
  },
  {
    id: 'S2-sql-injection-none-proven-by-rollback-probe',
    severity: 'INFO',
    summary: 'SQL INJECTION: NONE, proven by live rolled-back probe against the real audit_log table. supabase.from("audit_log").insert(rows) is a PostgREST JSON body (parameterized end to end), so a crafted worktree/branch name is data, never statement text. Probe inserted entity_id and metadata.name = `evil\'; DROP TABLE audit_log; -- <script>alert(1)</script> \\u2028 "quote" \\backslash + 5000 chars` inside BEGIN/ROLLBACK: both roundtripped BYTE-EXACT, to_regclass(\'public.audit_log\') still present, post-rollback probe-row count = 0 (nothing persisted). entity_id is unbounded `text`, so a long name cannot overflow a length constraint either. No log-injection surface: scripts/worktree-reaper.mjs:1337 logs only the COUNT and run_id, never a candidate name.',
  },
  {
    id: 'S3-not-null-entity-id-cannot-be-violated',
    severity: 'INFO',
    summary: 'audit_log.entity_id is NOT NULL. Both new row builders satisfy it by construction. parsePruneCandidates regex /^Removing worktrees\\/(.+?):\\s*(.+)$/ requires >=1 char in the name group, so a malformed git line cannot yield a null/empty entity_id -- probed: "Removing worktrees/: empty-name" and "Removing worktrees/no-colon-reason" both correctly DO NOT match (6 of 9 adversarial lines matched, the 3 non-matches being the two malformed ones plus a non-Removing line). buildHuskShipPathRows uses wtPath, which is guarded by fs.existsSync(wtPath) === true on the husk branch, so it is always a non-empty string.',
  },
  {
    id: 'S4-dynamic-import-no-traversal',
    severity: 'INFO',
    summary: 'DYNAMIC IMPORT: no path-traversal or arbitrary-module-load risk. scripts/modules/shipping/post-merge-worktree-cleanup.js:409 uses a STATIC relative string literal, `await import("../../../lib/worktree-reaper/audit-sink.js")` -- zero interpolation, zero external input, not reachable by any attacker-influenced value. Verified it resolves to <repoRoot>/lib/worktree-reaper/audit-sink.js and the module loads (writeRows is a function). It is the same shape as three pre-existing dynamic imports in the same file (lines 440, 533, 539), so it introduces no new loading pattern.',
  },
  {
    id: 'S5-no-secret-exposure-in-audit-log-metadata',
    severity: 'INFO',
    summary: 'SECRET EXPOSURE: none, traced to the error producer. The only free-text field written is metadata.error on the husk row, sourced from err?.message where err comes from safeRecursiveRm (lib/worktree-manager.js:1243) -- i.e. fs.rmSync/lstatSync errors (EBUSY/EPERM/ENOTEMPTY) or the synthetic "safeRecursiveRm: path does not exist: <path>". Those messages carry filesystem paths only: no env vars, no connection strings, no tokens. The other metadata fields (run_id, name, reason, sd_key, wtPath, detected_at) are reaper-computed identifiers. Supabase/PostgREST error text is passed to the `logger` (console) inside writeRows and is NEVER written into a row, and PostgREST error bodies do not echo the Authorization header. The pg pooler connection string (which does embed a password) is used by no code path on this diff. Secret-pattern grep over every ADDED line (api_key|secret|password|token|Bearer|eyJ...|sk-|service_role_key): ZERO hits.',
  },
  {
    id: 'S6-rls-service-role-only-no-new-anon-write-path',
    severity: 'INFO',
    summary: 'RLS/ACCESS CONTROL CONFIRMED AGAINST THE LIVE DB, not from docs. public.audit_log: relrowsecurity=true, and exactly TWO policies, both TO service_role -- service_role_insert_audit_log (cmd=a, with_check=true) and service_role_select_audit_log (cmd=r, using=true). information_schema.role_table_grants shows grants ONLY to postgres and service_role; anon and authenticated hold ZERO privileges on the table. Both new writers (buildPruneCandidateRows from worktree-reaper.mjs, buildHuskShipPathRows from post-merge-worktree-cleanup.js) go through the SAME shared writeRows insert call site into the SAME pre-existing table. No new table, no new policy, no new RLS surface, and no anon-accessible write path is created.',
  },
  {
    id: 'S7-rows-will-actually-land-severity-and-event-type-verified',
    severity: 'INFO',
    summary: 'The historical silent-rejection failure class for this exact module (PRESERVE-001 FR-3: severity low/medium violated audit_log_severity_check and EVERY non-keep row was invisibly dropped) is NOT reintroduced. Measured on the live schema: the only CHECK is audit_log_severity_check = severity IN (info, warning, error, critical); DEFAULT_SEVERITY used by both new builders is "warning" (valid). There is NO check constraint on event_type and ZERO non-internal triggers on audit_log, so the two new values (worktree_prune_candidate, worktree_husk_ship_path) insert cleanly -- confirmed by the rolled-back probe, both INSERTs returned ids.',
  },
  {
    id: 'S8-anon-key-fallback-degrades-durability-not-security',
    severity: 'LOW',
    summary: 'ADVISORY, pre-existing, NOT introduced by this diff and NOT a security hole. _getSupabaseServiceClient (post-merge-worktree-cleanup.js:127-137) falls back to SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY when SUPABASE_SERVICE_ROLE_KEY is absent. Because anon has zero grants on audit_log (S6), that fallback CANNOT write -- so it creates no privilege-escalation or anon-write exposure. What it does create is a silent durability hole: the insert returns a permission error, writeRows swallows it by design (never-throws contract) and the ship-path husk record is dropped with only a console.warn. That is the same silent-rejection shape the module\'s own header documents from PRESERVE-001 FR-3. Security verdict unaffected; routed to PLAN as an acceptance-criterion caveat.',
  },
  {
    id: 'S9-nul-byte-encoding-note',
    severity: 'INFO',
    summary: 'Completeness note from the probe: a NUL byte in entity_id/metadata is rejected by Postgres with `invalid byte sequence for encoding "UTF8": 0x00` (measured). Unreachable in practice -- git ref names cannot contain NUL and `git worktree prune --dry-run -v` output is line-based text -- and the failure mode is fail-soft (writeRows catches, returns ok:false, the reaper continues). No action required; recorded so a future reader does not re-derive it.',
  },
];

const warnings = [
  'S8 (LOW): the ship-path husk write inherits _getSupabaseServiceClient\'s anon-key fallback. anon has ZERO grants on audit_log, so this is a dropped-record risk, not an exposure risk. PLAN should keep the acceptance criterion as "SELECT the row back from audit_log", never "writeRows returned ok" -- writeRows returns fail-soft on a permission denial exactly as it did for the historical severity bug.',
];

const recommendations = [
  'PASS -- merge from a security standpoint. No command injection, no SQL injection, no path traversal, no secret exposure, no new anon-accessible write path. All four questions posed by the team lead were answered by direct measurement (argv/cwd probe, rolled-back adversarial INSERT, live pg_policy/grants read, error-producer trace), not by reading the code alone.',
  'No security changes requested. The only follow-up is the S8 durability caveat, which belongs to PLAN\'s acceptance criterion rather than to this security verdict.',
];

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    fallback: 'EHG_Engineer',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 94,
    findings,
    warnings,
    recommendations,
    summary: 'PASS. Internal worktree-reaper observability change with no auth/user-facing surface. Command injection: none (fixed literal command, repoRoot as cwd option, gitRunner argv array -- probed). SQL injection: none (PostgREST parameterized insert; adversarial "evil\'; DROP TABLE audit_log; --" roundtripped byte-exact inside BEGIN/ROLLBACK with the table intact and 0 residual rows). Dynamic import: static literal, no interpolation, resolves correctly, same shape as 3 pre-existing imports in the file. Secrets: metadata.error is strictly an fs error from safeRecursiveRm (paths only); supabase error text goes to console, never to a row; zero secret-pattern hits in added lines. Access control: audit_log RLS enabled with exactly two service_role-only policies and zero anon/authenticated grants -- no new write path. Also verified the new rows actually land (severity "warning" is valid, no event_type CHECK, no triggers), closing the PRESERVE-001 FR-3 silent-rejection class. One LOW advisory (S8): the pre-existing anon-key fallback degrades durability, not security.',
    metadata: {
      gate: 'EXEC-TO-PLAN — SECURITY validation',
      scope: 'internal fleet-maintenance observability; no auth, no user-facing surface, no new table or migration',
      injection_check: 'PASS — command injection none (argv/cwd probe), SQL injection none (rolled-back adversarial INSERT), log injection none (count-only logging)',
      module_load_check: 'PASS — static relative literal dynamic import, resolves to <root>/lib/worktree-reaper/audit-sink.js, no external influence',
      secret_exposure_check: 'PASS — error field traced to fs errors only; supabase error text never persisted; 0 secret-pattern hits on added lines',
      access_control_check: 'PASS — audit_log RLS on, 2 policies both TO service_role, anon/authenticated hold zero grants',
      constraint_check: 'PASS — audit_log_severity_check allows {info,warning,error,critical}; DEFAULT_SEVERITY=warning; no event_type CHECK; zero non-internal triggers',
      probe_method: 'live pg (SUPABASE_POOLER_URL) reads of pg_policy/pg_class/role_table_grants/pg_constraint/pg_trigger + a BEGIN/ROLLBACK adversarial insert (post-rollback residual rows verified 0) + node probe of parsePruneCandidates/detectPruneCandidates',
      files_examined: [
        'lib/worktree-reaper/orphan-sweep.js',
        'lib/worktree-reaper/audit-sink.js',
        'scripts/modules/shipping/post-merge-worktree-cleanup.js',
        'scripts/worktree-reaper.mjs',
        'lib/worktree-manager.js',
        'database/schema-reference-snapshot.json',
      ],
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F',
      branch: 'feat/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F',
      blocking_findings: 0,
      advisory_findings: 1,
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect (security-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
