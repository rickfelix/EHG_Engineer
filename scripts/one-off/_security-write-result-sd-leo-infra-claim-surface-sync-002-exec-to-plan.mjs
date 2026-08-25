#!/usr/bin/env node
/**
 * SECURITY sub-agent evidence writer — SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002, EXEC-TO-PLAN gate.
 *
 * Adapted from this SD's own TESTING writer (_testing-write-result-...-exec-to-plan.mjs), which in
 * turn follows scripts/record-explore-evidence.js: same storeSubAgentResults() call, same
 * metadata.repo_path / executed_from_cwd contract required by v_sub_agent_repo_compliance, same
 * read-back-after-write (a success return is not persistence).
 *
 * Phase spelling is MEASURED at run time against live SECURITY rows rather than assumed.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002';

const FINDINGS = [
  'RPC UNCHANGED — CONFIRMED BY MEASUREMENT, NOT BY PROSE. `git status --porcelain -- database/` is empty and `git diff HEAD --name-only` matches no .sql/migration path. release_sd\'s SECURITY DEFINER body is untouched, so the hardening is purely additive caller-side defense-in-depth. The code says so honestly too: best-effort-release.mjs:20-24 states plainly that making the RPC SD-scoped is a chairman-gated DDL change and that this is "the sanctioned alternative". NO OVERCLAIM — the SD does not present a caller-side guard as a fix to the RPC\'s SESSION-scoped design.',

  'NO SECRETS INTRODUCED. Scanned every added/modified file for service-role keys, JWT-shaped literals (eyJ...), postgres:// connection strings, sk-* tokens, and inline password/api_key assignments: ZERO hits. The new lint files read NO environment variables at all (no process.env anywhere in eslint-rules/require-release-sd-wrapper.js or scripts/lint/require-release-sd-wrapper-lint.mjs) and open no DB connection.',

  'LINT EXECUTES NO UNTRUSTED INPUT — and the specific way it avoids doing so is a genuine design strength worth recording. It uses ESLint\'s `Linter` API (scripts/lint/require-release-sd-wrapper-lint.mjs:36,178) with an INLINE FLAT_CONFIG (:53-69). This matters: the `ESLint` class would resolve and LOAD `eslint.config.js` from the scanned tree, which is arbitrary JS that executes. `Linter.verify()` only parses to an AST and walks it — scanned content is never evaluated. Dangerous-primitive scan of both new lint files: no eval, no `new Function`, no child_process/execSync/spawnSync, no vm, no dynamic require/import of scanned content. Input is fs.readFileSync from the local tree; --root/--allowlist come from argv (operator-controlled).',

  'CI WORKFLOW POSTURE IS SAFE. .github/workflows/require-release-sd-wrapper-lint.yml triggers on `pull_request` — NOT `pull_request_target` — so a fork PR runs without repo secrets and without a privileged token. Plain actions/checkout@v4, no secrets referenced, no script injection via ${{ github.event.* }} interpolation into a run: block. MINOR HARDENING NOTE (non-blocking, matches sibling workflows): no explicit top-level `permissions:` block, so the repo-default GITHUB_TOKEN scope applies; `permissions: contents: read` would be tighter. `npm ci` executes PR-authored lifecycle scripts, but that is the pre-existing pattern across this repo\'s PR workflows and is unprivileged under `pull_request`.',

  'THE CONTROL IS LIVE, NOT DECORATIVE, AND ITS COUNT-ANCHOR IS EXACT. Ran it: exit 0, "0 ungoverned violations across 4852 file(s) scanned (scripts/**, lib/**); 13 call site(s) in 9 file(s) governed by allowlist." The allowlist entries sum to exactly 13 (2+1+1+1+1+3+2+1+1) — no padding, so the ratchet cannot silently absorb a new raw call. The count-anchored design (vs the sibling control\'s file-keyed boolean) is the correct choice for this corpus specifically because files like sd-start.js mix raw and already-wrapped call sites.',

  'INFORMATION-DISCLOSURE — THE TASKING ASSUMPTION ("console/stdout in this codebase") IS FALSIFIED. There IS a persistent sink. lib/checkin/steps/release-request.cjs:91-100 calls bestEffortReleaseSd WITH {expectedSdKey: row.sd_key} — so the CHANGED scope_unverifiable path is reachable there — and then writes the result into the database: `sb.from(\'system_events\').insert({ ..., payload: { ..., release_error: rel.error } })`. The propagated raw DB message therefore lands in a durable table, not just a terminal.',

  'AND THAT SINK IS ANON-READABLE — VERIFIED LIVE AGAINST THE DATABASE, NOT INFERRED FROM MIGRATION TEXT. database/migrations/20251220_create_system_events.sql:163-168 defines policy system_events_anon_select FOR SELECT TO anon USING (true). Because a migration file is not proof of applied state, I probed the live DB with the project ANON key: it returned 160,449 readable system_events rows. So anyone holding the anon key can read payload.release_error. Current realized impact is ZERO: the same anon probe found 0 rows of event_type=\'work_release_request_honored\', so no release_error payload has actually landed yet.',

  'BUT THIS EXPOSURE IS PRE-EXISTING, NOT INTRODUCED BY THIS SD — measured against HEAD, not assumed. `git show HEAD:lib/fleet/best-effort-release.mjs` already returned raw DB text in `error` on TWO untouched paths: the res.error branch (HEAD:73-75, `const msg = res.error.message || String(res.error); return {released:false, error: msg}`) and the catch block (HEAD:81-83). Both already flowed into system_events.payload.release_error. This SD adds a THIRD contributor (the scope_unverifiable path) to an existing channel; it does not open a new class. Severity of the DELTA: LOW. Only `held.error.message` is propagated — NOT PostgREST\'s `details`/`hint` fields, which are the ones that typically echo row values. Realistic messages on a service-role SELECT are infrastructure/schema strings (timeout, connection reset, PGRST205), not credentials.',

  'OTHER SINKS CHECKED AND CLEARED. helpers.js passes `console.log` (stdout only). claim-swapper.js and lib/fleet/spawn-control.js:1048 and scripts/fleet-kill.mjs:113 pass `() => {}` (discarded). scripts/sd-start.js passes `console.error` (stderr). scripts/stale-session-sweep.cjs:224 pushes into a local `warnings` array BUT does NOT pass expectedSdKey — so the changed scope_unverifiable path is UNREACHABLE from that site regardless of where warnings go.',

  'PRIMARY FINDING — A FAIL-OPEN REGRESSION IN claim-swapper.js releaseClaim() ON A FALSY sdKey, DEMONSTRATED EMPIRICALLY ON BOTH SIDES (I ran it; I did not reason it). bestEffortReleaseSd engages its fail-CLOSED scope guard only when expectedSdKey is TRUTHY (best-effort-release.mjs:47-48, `if (expectedSdKey)`). A falsy value silently degrades to the legacy UNSCOPED release. releaseClaim (claim-swapper.js:101-103) forwards `sdKey` with no truthiness validation. Against a mock session actually holding SD-OTHER-LIVE: NEW code with sdKey=undefined/\'\'/null -> RPC FIRES, the unrelated live claim is dropped, and it returns {success:true, reason:"Released undefined"}. PRE-CHANGE code, same three inputs -> RPC does NOT fire, returns {success:false, reason:"Session does not hold claim on undefined"}. The old inline `session.sd_key !== sdKey` strict-inequality check happened to fail-closed on falsy input; the new delegation loses that property.',

  'WHY THAT FINDING MATTERS DESPITE BEING UNREACHABLE TODAY. It reproduces the EXACT defect class the SD exists to close (QF-20260726-593 / RCA a7d374f4b77ae2a1b: a caller-side path that silently drops an unrelated live claim) inside the SD that closes it. Reachability today is NIL — this SD\'s own TESTING evidence establishes releaseClaim has ZERO production callers, which I re-confirmed (only auto-chain-executor.js imports claim-swapper.js, and only swapClaim/refreshHeartbeat). So there is no live exploit path and no data-loss risk now. The reason to fix it anyway is that FR-4 ships a CI lint whose entire purpose is to funnel FUTURE callers into this wrapper — the fail-open shape sits directly on the on-ramp the SD is actively building.',

  'THE SIBLING CALL SITE IS SAFE IN PRACTICE. helpers.js:437 computes `const claimId = sd.sd_key || sd.id`. sd.id is the UUID primary key and is always present at LEAD-FINAL-APPROVAL, so claimId cannot realistically be falsy and the guard always engages there. Same latent shape, no realistic trigger.',

  'RESIDUAL (inherent, not a regression): the expectedSdKey guard is a TOCTOU read — it SELECTs claude_sessions.sd_key and then calls the RPC as a separate round trip, so a session that switches SDs inside that window would still have the new SD released. This is unavoidable without the chairman-gated DDL change, it is strictly narrower than the pre-change window, and the code does not claim otherwise. Recording it so it is not later mistaken for an authorization control.',

  'NO OTHER SECURITY-RELEVANT SURFACE. No auth/authn/authz code, no RLS policy changes, no user input parsing, no XSS/SQLi surface, no new network egress, no new file writes outside tests. All DB access remains parameterized PostgREST/RPC calls.'
];

const SUMMARY = [
  'SECURITY verdict: CONCERNS (non-blocking). The core hardening is sound and the SD makes no false claims: I measured that NO SQL/migration file is touched, so release_sd\'s SESSION-scoped SECURITY DEFINER body is unchanged and the work is honestly presented as caller-side defense-in-depth rather than an RPC fix. Zero secrets/credentials/connection strings introduced. The new lint executes nothing untrusted — it uses ESLint\'s Linter API with an inline flat config, so unlike the ESLint class it never loads (and never executes) an eslint.config.js from the scanned tree; no eval, Function, vm, or child_process anywhere. The CI workflow is pull_request (not pull_request_target), so no secrets reach fork PRs. I ran the control: exit 0, 4852 files scanned, 0 ungoverned violations, and the allowlist sums to exactly the 13 governed sites (no padding).',
  'ONE MATERIAL FINDING, demonstrated by running both sides rather than by reading. claim-swapper.js\'s new releaseClaim() forwards sdKey to bestEffortReleaseSd without validating truthiness, and the helper engages its fail-CLOSED scope guard only when expectedSdKey is truthy. With sdKey = undefined / \'\' / null against a session actually holding an unrelated SD, the NEW code fires the unscoped RPC, drops that unrelated live claim, and reports {success:true, reason:"Released undefined"}; the PRE-CHANGE code fired no RPC and returned success:false for all three. That is a fail-open regression reproducing the exact QF-20260726-593 class this SD exists to close. Reachability today is NIL (releaseClaim has zero production callers), so no live exploit and nothing to block on — but FR-4\'s lint is purpose-built to funnel future callers onto this exact on-ramp, so it should be closed cheaply now.',
  'One tasking assumption FALSIFIED, and it is worth stating plainly: the propagated DB error message does NOT stay on console. lib/checkin/steps/release-request.cjs passes expectedSdKey (so the changed path is reachable) and persists rel.error into system_events.payload.release_error. I verified against the LIVE database with the project anon key — not from migration text — that anon can read all 160,449 system_events rows (policy system_events_anon_select USING (true)). HOWEVER this is a PRE-EXISTING channel, measured against HEAD: the untouched res.error and catch paths already propagated raw DB text into that same field. This SD adds a third contributor, propagates only .message (not PostgREST .details/.hint, which are what echo row values), and 0 such rows exist today. Delta severity: LOW.',
  'Nothing here blocks the handoff on security grounds. Recommend a small follow-on fix for the falsy-sdKey fail-open, and a separate, out-of-scope look at the pre-existing anon-readable system_events audit surface.'
].join(' ');

const RECOMMENDATIONS = [
  'PRIMARY (small, ~5 LOC, recommended before the FR-4 lint starts attracting new callers): make a falsy-but-supplied expectedSdKey fail CLOSED instead of silently degrading to unscoped. Best fixed once in the helper — distinguish "expectedSdKey absent from opts" (legacy unscoped, deliberate per best-effort-release.mjs:29-30) from "expectedSdKey present but falsy" (caller bug -> refuse to release), e.g. `if (\'expectedSdKey\' in opts)` gating with a falsy-value refusal. Fixing it in the helper protects every current and future caller at once; fixing it only in releaseClaim leaves the same trap for the next migrated site.',
  'Add the regression test this exposed: releaseClaim(client, sessionId, undefined) against a session holding a DIFFERENT SD must NOT call rpc and must return success:false. Today that case returns {success:true, reason:"Released undefined"} and no test covers it.',
  'OUT OF SCOPE for this SD, worth a separate ticket: system_events carries an unconditional `TO anon USING (true)` SELECT policy over a 160k-row audit log whose jsonb payload accumulates arbitrary DB error text from many writers. Re-evaluate whether anon SELECT is still needed ("for public dashboards, if needed" per the migration comment) or should be narrowed to authenticated/service_role. This predates this SD entirely.',
  'Consider having bestEffortReleaseSd keep the stable discriminator (`skipped`) as the caller-facing value and route the raw DB message to the `log` callback ONLY, rather than into `error`, at sites that persist `error`. That would let release-request.cjs keep its audit trail without widening what reaches an anon-readable payload. Low priority given the channel is pre-existing.',
  'Add `permissions: contents: read` to .github/workflows/require-release-sd-wrapper-lint.yml. Minor least-privilege hardening; the workflow needs nothing more and currently inherits the repo-default token scope.'
];

export async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const client = await getSupabaseClient();

  // Measure the dominant phase spelling for SECURITY rows rather than assuming it.
  const { data: spellings } = await client
    .from('sub_agent_execution_results')
    .select('phase')
    .eq('sub_agent_code', 'SECURITY')
    .in('phase', ['EXEC-TO-PLAN', 'EXEC_TO_PLAN']);
  const counts = (spellings || []).reduce((m, r) => { m[r.phase] = (m[r.phase] || 0) + 1; return m; }, {});
  const phase = (counts['EXEC_TO_PLAN'] || 0) > (counts['EXEC-TO-PLAN'] || 0) ? 'EXEC_TO_PLAN' : 'EXEC-TO-PLAN';
  console.log(`Phase spelling measured: EXEC-TO-PLAN=${counts['EXEC-TO-PLAN'] || 0}, EXEC_TO_PLAN=${counts['EXEC_TO_PLAN'] || 0} -> using '${phase}'`);

  const results = {
    verdict: 'CONCERNS',
    confidence: 88,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: RECOMMENDATIONS,
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/_security-write-result-sd-leo-infra-claim-surface-sync-002-exec-to-plan.mjs',
      assessment_type: 'security_review_exec_to_plan',
      blocking: false,
      rpc_unchanged_verified: {
        method: 'git status --porcelain -- database/ (empty) + git diff HEAD --name-only matched no .sql/migration path',
        conclusion: 'release_sd SECURITY DEFINER body untouched; hardening is purely caller-side defense-in-depth',
        overclaim_check: 'PASS — best-effort-release.mjs:20-24 explicitly states SD-scoping the RPC is a chairman-gated DDL change and this is the sanctioned caller-side alternative'
      },
      secrets_scan: { patterns: ['service_role', 'JWT eyJ*', 'postgres://', 'sk-*', 'password=', 'api_key='], hits: 0, new_db_connections: 0, env_reads_in_new_lint_files: 0 },
      lint_security: {
        executes_untrusted_input: false,
        api_used: 'ESLint Linter (parse/AST-walk only)',
        why_it_matters: 'the ESLint class would resolve and execute eslint.config.js from the scanned tree; Linter + inline FLAT_CONFIG never does',
        dangerous_primitives: { eval: 0, new_Function: 0, child_process: 0, vm: 0, dynamic_require_of_scanned_content: 0 },
        input_sources: ['fs.readFileSync of local tree', 'argv --root/--allowlist (operator-controlled)']
      },
      ci_workflow: {
        trigger: 'pull_request',
        pull_request_target: false,
        secrets_referenced: 0,
        script_injection_via_event_context: false,
        hardening_note: 'no explicit permissions: block; inherits repo-default GITHUB_TOKEN scope (minor, matches sibling workflows)'
      },
      control_live_run: { exit: 0, scanned: 4852, ungoverned_violations: 0, governed_call_sites: 13, governed_files: 9, allowlist_sum: 13, padding: 0 },
      information_disclosure: {
        tasking_assumption: 'console/stdout only',
        assumption_status: 'FALSIFIED',
        persistent_sink: 'lib/checkin/steps/release-request.cjs:91-100 -> system_events.payload.release_error (site passes expectedSdKey, so the changed path is reachable)',
        sink_exposure: 'anon SELECT USING(true) via policy system_events_anon_select',
        verification_method: 'LIVE anon-key probe against the database, not migration text',
        live_probe_result: { anon_readable_rows: 160449, work_release_request_honored_rows: 0 },
        pre_existing: true,
        pre_existing_evidence: 'git show HEAD:lib/fleet/best-effort-release.mjs lines 73-75 (res.error) and 81-83 (catch) already returned raw DB text in `error` and already fed the same field',
        delta_severity: 'LOW',
        mitigating_factors: ['only .message propagated, not PostgREST .details/.hint which echo row values', '0 such rows exist today', 'realistic messages are infra/schema strings, not credentials'],
        sinks_cleared: {
          'helpers.js': 'console.log (stdout)',
          'claim-swapper.js': 'noop log; zero production callers',
          'lib/fleet/spawn-control.js:1048': 'noop log',
          'scripts/fleet-kill.mjs:113': 'noop log',
          'scripts/sd-start.js': 'console.error (stderr)',
          'scripts/stale-session-sweep.cjs:224': 'local warnings array; does NOT pass expectedSdKey so the changed path is unreachable there'
        }
      },
      primary_finding: {
        id: 'falsy-expectedSdKey-fail-open-regression',
        severity: 'medium_non_blocking',
        location: 'scripts/modules/handoff/claim-swapper.js:101-103 forwarding into lib/fleet/best-effort-release.mjs:47-48',
        mechanism: 'bestEffortReleaseSd engages its fail-CLOSED scope guard only when expectedSdKey is TRUTHY; releaseClaim forwards sdKey with no truthiness validation, so a falsy value silently degrades to the legacy UNSCOPED release',
        method: 'empirical — ran both the new and the pre-change (git show HEAD) implementations against an identical mock whose session holds SD-OTHER-LIVE',
        measured_new: { 'sdKey=undefined': 'RPC FIRED -> {success:true, reason:"Released undefined"}', 'sdKey=empty-string': 'RPC FIRED -> {success:true}', 'sdKey=null': 'RPC FIRED -> {success:true}' },
        measured_pre_change: { 'sdKey=undefined': 'RPC NOT fired -> {success:false}', 'sdKey=empty-string': 'RPC NOT fired -> {success:false}', 'sdKey=null': 'RPC NOT fired -> {success:false}' },
        regression: true,
        reachability_today: 'NIL — releaseClaim has zero production callers (auto-chain-executor.js imports only swapClaim/refreshHeartbeat); re-confirmed independently',
        why_fix_anyway: 'reproduces the exact QF-20260726-593 class the SD exists to close, and sits directly on the on-ramp FR-4 lint is purpose-built to funnel future callers onto',
        sibling_site_status: 'helpers.js safe in practice — claimId = sd.sd_key || sd.id, and sd.id (UUID PK) is always present at LEAD-FINAL-APPROVAL'
      },
      residual_risks: [
        'expectedSdKey guard is inherently TOCTOU (SELECT then RPC as separate round trips) — unavoidable without the chairman-gated DDL change, strictly narrower than the pre-change window, and not overclaimed by the code',
        'pre-existing anon-readable system_events audit surface (out of scope for this SD)'
      ],
      surfaces_absent: ['auth/authn/authz code', 'RLS policy changes', 'user input parsing', 'XSS/SQLi surface', 'new network egress', 'new file writes outside tests'],
      files_reviewed: [
        'lib/fleet/best-effort-release.mjs',
        'scripts/modules/handoff/claim-swapper.js',
        'scripts/modules/handoff/executors/lead-final-approval/helpers.js',
        'eslint-rules/require-release-sd-wrapper.js',
        'scripts/lint/require-release-sd-wrapper-lint.mjs',
        'scripts/lint/require-release-sd-wrapper-allowlist.json',
        '.github/workflows/require-release-sd-wrapper-lint.yml',
        'lib/checkin/steps/release-request.cjs',
        'scripts/stale-session-sweep.cjs',
        'database/migrations/20251220_create_system_events.sql'
      ]
    }
  };

  const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, { phase });

  // A success return is not persistence — read the row back.
  const { data, error } = await client
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nSECURITY evidence recorded and read back:');
  console.log(`  id         ${data.id}`);
  console.log(`  code       ${data.sub_agent_code}`);
  console.log(`  phase      ${data.phase}`);
  console.log(`  verdict    ${data.verdict}`);
  console.log(`  confidence ${data.confidence}`);
  console.log(`  created_at ${data.created_at}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
