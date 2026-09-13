import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
const LINT_POSTFIX = '.artifacts/security-capa-a/shell-injection-lint-postfix.txt';
const SSRF_PROBE = '.artifacts/security-capa-a/ssrf-validator-probe.txt';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  timestamp: new Date().toISOString(),
  summary:
    'RE-REVIEW of HEAD 769fb4857c4 (supersedes FAIL row cbe22c8c-3af9-413f-9133-bd4e7f6d2ae4). ' +
    'SEC-1 (the HIGH blocker) is CLOSED and independently re-verified: the npx/shell:true invocation is replaced by ' +
    'execFileSync(process.execPath, [require.resolve("@lhci/cli/src/cli.js"), ...], { shell: false, timeout, maxBuffer }), ' +
    'and the repo blocking CI lint now reports 0 new violations at exit 0 against this HEAD. SEC-3 CLOSED: cleanup moved ' +
    'into a finally that covers all four exit paths, and .lighthouseci/ is confirmed ignored via git check-ignore. ' +
    'SEC-5 CLOSED: timeout 300s + maxBuffer 16MB added. SEC-2 SUBSTANTIALLY CLOSED: a new validateDeploymentUrl() choke ' +
    'point in resolveVenture() runs before BOTH the browser navigation and the Lighthouse subprocess, and measurably ' +
    'blocks file://, plain http, embedded credentials, cloud-metadata 169.254.169.254, every IPv4 private range, IPv6 ' +
    '::1 in both bracketed and expanded form, AND the decimal/hex/short-form IPv4 encodings that string filters usually ' +
    'miss. CONDITIONAL on one residual: 6 measured host-filter gaps remain, two of which (IPv6 link-local and internal ' +
    'DNS suffixes) were named explicitly in the original SEC-2 recommendation. Low severity under the current threat ' +
    'model and NOT handoff-blocking; recorded as a follow-up hardening condition, not a defect to re-open EXEC for.',
  execution_time_ms: 1000,
  conditions: [
    {
      action:
        'Harden validateDeploymentUrl() host filtering for the 6 measured residuals: IPv4-mapped IPv6 loopback ' +
        '([::ffff:127.0.0.1]), IPv6 link-local (fe80::/10), IPv6 unique-local (fc00::/7), carrier-grade NAT (100.64/10), ' +
        'bare single-label hostnames (https://supabase/), and internal DNS suffixes (.internal, .local, .svc.cluster.local). ' +
        'The structurally complete fix is to resolve the hostname and range-check the resulting IP rather than pattern-match ' +
        'the host string; a string filter cannot close DNS-rebinding-class gaps. Track as a follow-up on this SD family, not ' +
        'as an EXEC re-open.',
      priority: 'low',
      blocking: false,
    },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS because two of the six measured residual host-filter gaps (IPv6 link-local and ' +
    'internal DNS suffixes such as .internal / .svc.cluster.local) were named explicitly in the original SEC-2 ' +
    'recommendation this fix answers, so closure is partial rather than complete. It is an ACCEPTING verdict and does not ' +
    'block the EXEC-TO-PLAN handoff: the HIGH blocker (SEC-1) is fully closed and CI-verified at exit 0, the primary SEC-2 ' +
    'limb (file:// local-file disclosure into evidence_pointer) and the cloud-metadata IP are both blocked, and exploiting ' +
    'any residual requires service-role write access to the RLS-protected ventures.deployment_url column on a script that ' +
    'has no cron or CI caller.',
  critical_issues: [],
  warnings: [
    {
      id: 'SEC-2-RESIDUAL',
      severity: 'LOW',
      cwe: 'CWE-918 (SSRF)',
      location: 'scripts/eva/capa-001-a-baseline-runner.mjs:69 (PRIVATE_OR_LOOPBACK_HOST_RE)',
      issue:
        'The host denylist is a string pattern over URL#hostname. MEASURED via a 23-case battery against the real exported ' +
        'validateDeploymentUrl(): 17 of 23 behave correctly, 6 deviate from a strict SSRF posture and are ALLOWED -- ' +
        '[::ffff:127.0.0.1] (IPv4-mapped IPv6 loopback, routes to 127.0.0.1), [fe80::1] (IPv6 link-local), [fd00::1] ' +
        '(IPv6 unique-local), 100.64.0.1 (carrier-grade NAT), https://supabase/ (bare single-label internal host), and ' +
        'https://kubernetes.default.svc.cluster.local/ (internal cluster DNS). A hostname-string filter also cannot close ' +
        'DNS-rebinding (a public name resolving to 127.0.0.1).',
      mitigating:
        'The high-value targets ARE blocked: file:// (the local-file-disclosure limb that was the sharpest part of the ' +
        'original SEC-2), plain http, embedded credentials, 169.254.169.254 cloud metadata, 10/8, 172.16/12, 192.168/16, ' +
        '127/8, 0.0.0.0, localhost, [::1] and [0:0:0:0:0:0:0:1]. Notably the WHATWG-normalised IPv4 encodings that defeat ' +
        'most hand-rolled filters (2130706433 decimal, 0x7f000001 hex, 127.1 short form) are all correctly blocked, because ' +
        'the check runs on the post-new-URL() normalised hostname rather than the raw string. Threat model: ' +
        'ventures.deployment_url is service-role-only writable (ventures is RLS-restrictive to anon -- re-confirmed) and ' +
        'the runner has zero cron/CI callers.',
      recommendation:
        'Follow-up hardening only. Resolve-then-range-check the IP instead of pattern-matching the host string.',
    },
  ],
  recommendations: [
    'SEC-1 (HIGH, BLOCKER) -- CLOSED AND RE-VERIFIED INDEPENDENTLY, not accepted on report. Re-ran the repo blocking gate ' +
      'myself against HEAD 769fb4857c4: node scripts/lint/shell-injection-argv-lint.mjs --base=main -> "1196 added line(s) ' +
      'scanned, 0 new violation(s)", real exit code 0 (was exit 1 / 1 new violation at the FAIL row). Read the final code: ' +
      'shell: false, and the only remaining `shell:` matches in the SD diff are inside comments and string literals. The ' +
      'argv now reaches the child as a real array, so the ampersand case that executed a command in the pre-fix PoC cannot.',
    'SEC-2 -- SUBSTANTIALLY CLOSED, one low residual. validateDeploymentUrl() is a genuine single choke point: it is called ' +
      'at line 100 inside resolveVenture(), which main() awaits at line 308 BEFORE chromium.launch() (312) and before ' +
      'runLighthouseCheck() (322), so both consumers are covered by one validation and the normalised URL is written back ' +
      'onto the venture object. Correctly does NOT reject a legal ampersand in a query string (verified) -- that is now ' +
      'shell:false territory, not the validator job. See SEC-2-RESIDUAL warning for the 6 remaining host-filter gaps.',
    'SEC-3 -- CLOSED AND RE-VERIFIED. The finally block wraps the whole body, so all four exit paths clean up: the ' +
      'collect-failed early return, the no-report early return, the success return, and an uncaught throw from ' +
      'readFileSync/JSON.parse/loadLighthouseThresholds. MEASURED separately that .lighthouseci/ is now genuinely ignored: ' +
      'git check-ignore -v reports .gitignore:84 matching .lighthouseci/lhr-1.json (I created and removed a probe file ' +
      'rather than trusting the .gitignore diff).',
    'SEC-5 -- CLOSED. timeout: 300_000 and maxBuffer: 16 * 1024 * 1024 are both present on the execFileSync, so a hung ' +
      'target no longer stalls the runner indefinitely and a large lhci stdout no longer raises ENOBUFS that the catch ' +
      'would silently downgrade to a low-severity collect-failed finding.',
    'SEC-4 (LOW, latent) -- UNCHANGED and still correct to leave: buildAccessibilityFindings persists up to 300 chars of raw ' +
      'third-party page HTML per node into evidence_pointer. Still no renderer (zero evidence_pointer references in src/ or ' +
      'client/, zero dangerouslySetInnerHTML). Remains a constraint on whoever later builds a findings UI.',
    'EVIDENCE-CHAIN NOTE -- removing .artifacts/security-capa-a/injection-poc.cjs was the right call (it deliberately ' +
      'reproduced the vulnerable shell:true shape and would have re-tripped the same blocking lint on itself). The chain is ' +
      'intact: both pre-fix .txt outputs remain tracked, and I re-verified their sha256 values still match the hashes ' +
      'recorded in the superseded FAIL row cbe22c8c (lint b3e4a382..., poc bf38864d...), so the pre-fix evidence is still ' +
      'cryptographically anchored to that row even though the generator script is gone.',
    'NO-FINDING (re-confirmed at this HEAD) -- migration + writer introduce no RLS/authorization gap; the CHECK-constraint ' +
      'widening is a data-domain change touching no policy, GRANT or RLS. No hardcoded secrets in the diff. resolveVenture ' +
      'still uses PostgREST .eq() binding, so --venture carries no SQL injection risk.',
  ],
  metadata: {
    phase: 'EXEC',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
    head_commit: '769fb4857c4a8b6e7290472458dbb578210b3dae',
    supersedes_row: 'cbe22c8c-3af9-413f-9133-bd4e7f6d2ae4',
    fix_commits_reviewed: ['8a7c850140e', '769fb4857c4'],
    verification_posture:
      'Re-verified independently against the pushed HEAD rather than accepting the fix report: re-ran the blocking lint, ' +
      'read the final code, drove the real exported validator with a 23-case bypass battery, re-ran the unit suite, and ' +
      'probed .gitignore with a real file via git check-ignore.',
    evidence_provenance: {
      producer:
        'scripts/lint/shell-injection-argv-lint.mjs (repo blocking CI lint) + .artifacts/security-capa-a/ssrf-validator-probe.mjs',
      lint_artifact: LINT_POSTFIX,
      lint_sha256: sha(LINT_POSTFIX),
      lint_command: 'node scripts/lint/shell-injection-argv-lint.mjs --base=main',
      lint_exit_code: 0,
      lint_new_violations: 0,
      ssrf_probe_artifact: SSRF_PROBE,
      ssrf_probe_sha256: sha(SSRF_PROBE),
      ssrf_probe_command: 'node .artifacts/security-capa-a/ssrf-validator-probe.mjs',
      ssrf_probe_cases: 23,
      ssrf_probe_correct: 17,
      ssrf_probe_deviations: 6,
      node_version: process.version,
      platform: process.platform,
    },
    prior_evidence_chain_verified: {
      lint_sha256_match: true,
      poc_sha256_match: true,
      note:
        'Pre-fix artifacts .artifacts/security-capa-a/shell-injection-lint.txt and injection-poc.txt still hash to the ' +
        'values recorded in the superseded FAIL row, so that row remains verifiable after injection-poc.cjs was deleted.',
    },
    ci_gate_status: {
      workflow: '.github/workflows/shell-injection-argv-lint.yml',
      blocking: true,
      before_fix: 'exit 1, 1 new S2 violation at capa-001-a-baseline-runner.mjs:198',
      after_fix: 'exit 0, 0 new violations, 1196 added lines scanned',
    },
    test_rerun: {
      command: 'npx vitest run --project unit tests/unit/eva/quality-findings/ tests/unit/eva/stage-templates/analysis-steps/',
      files: '44 passed | 1 skipped',
      tests: '684 passed | 5 skipped | 0 failed',
      note: 'Independent re-run of a subset of the coordinator-reported suite; consistent and green.',
    },
    cleanup_paths_covered: [
      'collect-failed early return',
      'no-report early return',
      'success return',
      'uncaught throw from readFileSync/JSON.parse/loadLighthouseThresholds',
    ],
    gitignore_probe: 'git check-ignore -v -> .gitignore:84 .lighthouseci/ matches .lighthouseci/lhr-1.json',
    files_reviewed: [
      'scripts/eva/capa-001-a-baseline-runner.mjs',
      '.gitignore',
      'tests/unit/eva/quality-findings/capa-001-a-baseline-runner.test.js',
      'scripts/lint/shell-injection-argv-lint.mjs',
      '.github/workflows/shell-injection-argv-lint.yml',
    ],
    scope_note:
      'Standard SECURITY re-review scope against the fixed HEAD: injection, SSRF/trust boundary, secret handling, RLS/authz, ' +
      'temp-file and cleanup hygiene, stored-content rendering. FR-C cron behavior and test sufficiency remain TESTING scope.',
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
