import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
const LINT_FILE = '.artifacts/security-capa-a/shell-injection-lint.txt';
const POC_FILE = '.artifacts/security-capa-a/injection-poc.txt';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const results = {
  verdict: 'FAIL',
  confidence: 95,
  timestamp: new Date().toISOString(),
  summary:
    'SEC-1 (HIGH, BLOCKER): confirmed OS command injection at scripts/eva/capa-001-a-baseline-runner.mjs:198. ' +
    'The execFileSync that builds the lhci collect --url=<deployment_url> invocation passes ' +
    'shell: process.platform === win32; this fleet runs on win32, so the argv array is concatenated into a ' +
    'cmd.exe command line WITHOUT escaping (Node emits DEP0190 for exactly this). Reproduced live: a URL carrying ' +
    'an ampersand -- a legal URL query separator -- executed an attacker-chosen command. Independently confirmed by ' +
    'the repo OWN blocking CI lint (scripts/lint/shell-injection-argv-lint.mjs, S2), which reports this as 1 NEW ' +
    'violation and exits 1; the workflow triggers on **/*.mjs with continue-on-error:false, so this branch CANNOT ' +
    'merge as written. Two MEDIUM findings (unvalidated URL trust boundary / SSRF; .lighthouseci cleanup + gitignore ' +
    'gap) and two LOW. Migration + writer RLS: PASS, no authorization gap.',
  execution_time_ms: 1000,
  critical_issues: [
    {
      id: 'SEC-1',
      severity: 'HIGH',
      cwe: 'CWE-78 (OS Command Injection) / CWE-88 (Argument Injection)',
      location: 'scripts/eva/capa-001-a-baseline-runner.mjs:195-199 (runLighthouseCheck)',
      issue:
        'execFileSync(npx, [lhci, collect, --url=${url}, --numberOfRuns=1], { cwd: REPO_ROOT, stdio: pipe, ' +
        'shell: process.platform === win32 }). The argv-array form is safe ONLY with shell:false. With shell:true ' +
        'Node concatenates argv into a single cmd.exe command string and does NOT escape it (DEP0190, observed at ' +
        'runtime on Node v24.12.0). url is interpolated from ventures.deployment_url, so any cmd.exe metacharacter ' +
        'in that column (ampersand, pipe, >, ^, %VAR%) breaks out of the argument. The ampersand is a legal URL query ' +
        'separator, so this fires on benign-looking URLs too, not just hostile ones. Executes with the operator full ' +
        'privileges, cwd=repo root.',
      evidence:
        'PoC (.artifacts/security-capa-a/injection-poc.cjs, output in injection-poc.txt): platform=win32, ' +
        'shell option value=true, INJECTION EXECUTED=true -- the payload after the ampersand created the marker file. ' +
        'Repo lint (.artifacts/security-capa-a/shell-injection-lint.txt): "S2 scripts/eva/capa-001-a-baseline-runner.mjs:198 ' +
        'shell: <non-false>", 1 new violation, EXIT_CODE=1.',
      blocking_reason:
        '.github/workflows/shell-injection-argv-lint.yml is BLOCKING (continue-on-error: false) since ' +
        'SD-MAN-INFRA-FLIP-SHELL-INJECTION-001 (2026-09-11) and triggers on **/*.mjs. Its S2 predicate was widened by ' +
        'SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 (SEC-1) SPECIFICALLY to catch the shape shell: process.platform===win32. ' +
        'Only NEW sites fail; this is a new site. The PR will hard-fail CI.',
      fix:
        'Invoke lhci shell-free via its JS entry rather than the npx shim: ' +
        'const require = createRequire(import.meta.url); const lhciBin = require.resolve("@lhci/cli/src/cli.js"); ' +
        'execFileSync(process.execPath, [lhciBin, "collect", `--url=${url}`, "--numberOfRuns=1"], ' +
        '{ cwd: REPO_ROOT, stdio: "pipe", shell: false, timeout: 300000, maxBuffer: 16*1024*1024 }). ' +
        'VERIFIED WORKING in this worktree on win32: @lhci/cli@0.13.0 declares bin {"lhci":"./src/cli.js"}, the subpath ' +
        'resolves, the CLI launched correctly, and the same hostile ampersand payload did NOT inject. This also clears the ' +
        'lint (S2 only flags shell: set to a non-literal-false) without needing an allowlist entry.',
    },
  ],
  warnings: [
    {
      id: 'SEC-2',
      severity: 'MEDIUM',
      cwe: 'CWE-918 (SSRF) / CWE-20 (Improper Input Validation)',
      location: 'scripts/eva/capa-001-a-baseline-runner.mjs:61-71 (resolveVenture), 220/230 (page.goto), 197 (--url)',
      issue:
        'ventures.deployment_url is consumed verbatim by a real headless Chromium AND a real Lighthouse subprocess with ' +
        'NO shape/scheme/host validation at the read site. The column is NOT a trust boundary: neither write site validates. ' +
        'lib/venture-deploy/promote.js:308 stamps liveUrl taken from a CLOUD DEPLOY ADAPTER API RESPONSE ' +
        '(result.serviceUrl) and lib/venture-acquisition/dns-wiring.js:151 stamps https://${domain} from the acquisition ' +
        'pipeline. So an external API response reaches a browser navigation and (per SEC-1) a Windows shell. Reachable ' +
        'targets if the value is ever wrong/hostile: http://169.254.169.254 (cloud metadata), http://localhost:* (the LEO ' +
        'stack and local Supabase), and file:// -- Playwright loads file:// happily and buildAccessibilityFindings then ' +
        'persists up to 300 chars of that content per node (5 nodes) into evidence_pointer, i.e. local-file disclosure into the DB.',
      mitigating:
        'MEASURED: ventures is RLS-protected against anon (anon SELECT returns 0 rows while service-role sees 3+), so the ' +
        'column is not anon-writable. MEASURED: all 3 live deployment_url values are clean (altifyai.app, a replit.dev host, ' +
        'a run.app host) -- no shell metacharacter, no private host. The runner is a standalone manual script, NOT wired into ' +
        'any cron/CI (grep: zero non-test callers). Precedent: lib/eva/external-observation.js:82 already raw-fetch()es ' +
        'deployment_url, so the trust boundary pre-exists -- this diff escalates it from fetch to browser + shell subprocess.',
      recommendation:
        'Validate at the read site before both the goto and the collect: parse with new URL(), assert protocol is https: ' +
        '(or http:), reject embedded credentials (url.username/url.password), and reject loopback/link-local/private hosts ' +
        '(127.0.0.0/8, ::1, 169.254.0.0/16, 10/8, 172.16/12, 192.168/16, *.internal). Note the sibling validator ' +
        'server/routes/stage19.js HTTPS_URL_RE only forbids whitespace, so it would still admit ampersand-bearing URLs -- ' +
        'do not reuse it as-is.',
    },
    {
      id: 'SEC-3',
      severity: 'MEDIUM-LOW',
      cwe: 'CWE-459 (Incomplete Cleanup) / CWE-212 (Improper Removal of Sensitive Information)',
      location: 'scripts/eva/capa-001-a-baseline-runner.mjs:191-214 (runLighthouseCheck) + .gitignore',
      issue:
        'The post-run rmSync (line 213) executes ONLY on the success path. Every failure path leaves .lighthouseci in place: ' +
        'line 201 (collect failed) and line 206 (no report) return early, and a throw from readFileSync/JSON.parse (209) or ' +
        'loadLighthouseThresholds (210, reads lighthouserc.json) propagates out. MEASURED: .lighthouseci is NOT in .gitignore, ' +
        'while comparable artifact dirs (.playwright/, .cache/) are. Lighthouse LHR JSON embeds full-page base64 screenshots and ' +
        'every network request URL of the scanned page, so a crashed run leaves that untracked in the repo root, one git add -A ' +
        'from being committed.',
      mitigating:
        'DELETION SCOPE IS SAFE -- this limb is CLEARED, not just assumed: the path is a static path.join(REPO_ROOT, ' +
        '".lighthouseci") with no interpolation, so it can only ever target that one directory. MEASURED on a real Windows ' +
        'junction that fs.rmSync(recursive:true, force:true) removes the LINK ONLY and does not follow into the target ' +
        '(target file survived), so the repo documented junction-destruction hazard (which is a git worktree remove behavior) ' +
        'does not apply here.',
      recommendation:
        'Move the cleanup into a finally block so it runs on every path; add .lighthouseci/ to .gitignore. Better still, ' +
        'collect into an os.tmpdir() directory (lhci --outputDir) instead of the repo root, which removes the leak class entirely.',
    },
  ],
  recommendations: [
    'BLOCKER -- SEC-1 must be fixed before the EXEC-TO-PLAN handoff. This is not an advisory style point: the branch will ' +
      'hard-fail the repo own blocking shell-injection CI gate (measured exit 1, 1 NEW violation), and the injection is ' +
      'demonstrated, not theoretical. Fix is a ~4-line change (resolve @lhci/cli/src/cli.js, spawn via process.execPath, ' +
      'shell:false) and was verified working on win32 in this worktree.',
    'SEC-2 -- add a validateDeploymentUrl() guard at the read site (new URL + https-only + no credentials + private/loopback/' +
      'link-local host denylist) applied once before both page.goto and the lhci invocation. Worth doing even after SEC-1 is ' +
      'fixed: shell-free spawning kills the injection but not the SSRF/file:// disclosure limb.',
    'SEC-3 -- move the .lighthouseci rmSync into a finally, and add .lighthouseci/ to .gitignore (the repo already ignores ' +
      '.playwright/ and .cache/ for the same reason). Preferred: pass --outputDir into os.tmpdir() so nothing lands in the repo root.',
    'SEC-4 (LOW, latent) -- buildAccessibilityFindings persists up to 300 chars of RAW third-party page HTML per node (5 nodes ' +
      'per violation) into evidence_pointer. MEASURED: no stored-XSS today (zero evidence_pointer references in src/ or client/, ' +
      'zero dangerouslySetInnerHTML in those trees). Recorded as a constraint on whoever later builds a findings UI: render that ' +
      'field escaped, never via dangerouslySetInnerHTML.',
    'SEC-5 (LOW, robustness) -- the execFileSync has neither timeout nor a maxBuffer override. A slow or hostile URL hangs ' +
      'the runner indefinitely (Playwright goto has a 30s default; the subprocess has none), and lhci stdout exceeding the 1MB ' +
      'default maxBuffer raises ENOBUFS which the catch silently downgrades to a low-severity collect-failed finding. Add both ' +
      '(the suggested SEC-1 fix line already carries them).',
    'NO-FINDING (recorded so a later reader does not re-litigate): the migration is additive-only on a CHECK constraint, which ' +
      'is a data-domain change and not an authorization change -- it touches no policy, no GRANT, no RLS. MEASURED: RLS on ' +
      'venture_quality_findings is enforced, anon INSERT is denied 42501 even for the newly permitted performance category, so ' +
      'the widened constraint opens no write path. The writer additionally requires service-role, and validateFindingShape ' +
      'gates finding_category against the frozen FINDING_CATEGORIES allowlist BEFORE the insert, so the code-level check and the ' +
      'DB CHECK are defense-in-depth rather than a single point. No RLS/authorization gap in this diff.',
    'NO-FINDING -- resolveVenture uses PostgREST .eq() binding for both the UUID and name branches, so the --venture CLI ' +
      'argument carries no SQL injection risk. No hardcoded secrets in the diff (scanned for JWT/service_role/sk- shapes: zero hits).',
  ],
  metadata: {
    phase: 'EXEC',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
    commits_reviewed: ['aa3ca9abd10', '42fec777a2a', 'f62ea68aabc'],
    evidence_provenance: {
      producer:
        'scripts/lint/shell-injection-argv-lint.mjs (repo blocking CI lint) + .artifacts/security-capa-a/injection-poc.cjs',
      lint_artifact: LINT_FILE,
      lint_sha256: sha(LINT_FILE),
      lint_command: 'node scripts/lint/shell-injection-argv-lint.mjs --base=main',
      lint_exit_code: 1,
      lint_new_violations: 1,
      poc_artifact: POC_FILE,
      poc_sha256: sha(POC_FILE),
      poc_command: 'node .artifacts/security-capa-a/injection-poc.cjs',
      poc_injection_executed: true,
      node_version: process.version,
      platform: process.platform,
    },
    ci_gate_status: {
      workflow: '.github/workflows/shell-injection-argv-lint.yml',
      blocking: true,
      continue_on_error: false,
      path_filter_matches: '**/*.mjs matches scripts/eva/capa-001-a-baseline-runner.mjs',
      predicted_result: 'FAIL (1 new S2 violation)',
    },
    rls_probe: {
      method: 'live anon-key client against production',
      ventures_anon_select: '0 rows returned while service-role sees 3+ -> RLS enabled and restrictive for anon',
      venture_quality_findings_anon_insert:
        'DENIED 42501 (new row violates row-level security policy) for finding_category=performance',
      conclusion: 'migration + writer introduce NO RLS/authorization gap',
    },
    live_deployment_urls_scanned: 3,
    live_deployment_urls_with_shell_metachars: 0,
    junction_probe:
      'fs.rmSync(recursive,force) on a real Windows junction removed the link only; target file survived',
    files_reviewed: [
      'scripts/eva/capa-001-a-baseline-runner.mjs',
      'database/migrations/20260913_venture_quality_findings_capa_baseline_categories.sql',
      'database/migrations/20260828_venture_quality_findings_experience_categories.sql',
      'lib/eva/quality-findings/finding-shape.js',
      'lib/eva/quality-findings/sd-generator.js',
      'lib/eva/quality-findings/writer.js',
      'server/routes/stage19.js',
      'lib/venture-deploy/promote.js',
      'lib/venture-acquisition/dns-wiring.js',
      'scripts/lint/shell-injection-argv-lint.mjs',
      '.github/workflows/shell-injection-argv-lint.yml',
    ],
    scope_note:
      'Standard SECURITY review scope: injection, SSRF/trust boundary, secret handling, RLS/authz, temp-file and cleanup ' +
      'hygiene, stored-content rendering. Not in scope and not assessed: FR-C cron remediation-SD behavior and test ' +
      'sufficiency (TESTING row 0e954688-e196-4498-b5ad-6d30f63fe907 covers those).',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  fallback: 'EHG_Engineer',
});
console.log('RESOLUTION:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD, null, results, { phase: 'EXEC', sdKey: SD });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase, 'sd_id=', stored?.sd_id);
