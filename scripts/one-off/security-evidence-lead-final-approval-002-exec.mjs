#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for SD-LEO-FIX-LEAD-FINAL-APPROVAL-002, EXEC_TO_PLAN phase.
 * Formal verdict for the new success-criteria-unpopulated LEAD-FINAL-APPROVAL gate.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-LEAD-FINAL-APPROVAL-002';

const findings = [
  {
    id: 'zero-new-io-surface-confirmed-by-grep',
    severity: 'INFO',
    summary: 'MEASURED, not assumed: grep -c for "supabase|from(|.rpc(" over success-criteria-unpopulated-gate.js returns 0. The factory createSuccessCriteriaUnpopulatedGate() takes NO arguments (no supabase, no prdRepo), unlike every sibling gate. No fs, no child_process, no network, no dynamic import. The gate reads exactly one already-loaded in-memory value (ctx.sd.success_criteria) and returns a plain object. Attack surface added by this SD: none.',
  },
  {
    id: 'no-injection-sink-classifyentry-is-exact-equality-only',
    severity: 'INFO',
    summary: 'The sole imported dependency lib/sd-fields/unpopulated.js is UNMODIFIED by this commit (git log -1 on that path returns ae75cf8dbd1, an earlier SD; git diff HEAD~1 HEAD -- lib/ is empty). Read its source in full: classifyEntry() uses only === string comparison and Array.prototype.includes over a frozen 3-element constant. ZERO regular expressions anywhere in the module, so no ReDoS. No eval, no new Function, no template-to-SQL, no shell. The criterion/measure values never reach an interpreter of any kind.',
  },
  {
    id: 'no-prototype-pollution-fuzz-verified',
    severity: 'INFO',
    summary: 'Fuzzed with a JSON __proto__ payload as a success_criteria entry; ({}).polluted was undefined afterwards (printed "no"). Structurally sound: the gate performs zero property WRITES to any input object, and the only property read uses the hardcoded literal key "measure" -- valueKey is never attacker-controlled, so there is no dynamic-key read/write pair to exploit.',
  },
  {
    id: 'env-var-handling-is-fail-safe-in-the-strict-direction',
    severity: 'INFO',
    summary: 'SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING is compared with strict === "true". Coercion matrix executed live: "true" -> bound, and "TRUE"/"True"/"1"/"yes"/" true"/"true "/boolean true/number 1/undefined ALL -> unbound. Security-relevant polarity: the flag can only make the gate STRICTER than the shipped default; there is no value of the variable that weakens the gate below observe-only, so an attacker who controls the environment gains nothing. It is a boolean feature flag, not a credential, and is correctly absent from every env/secret file.',
  },
  {
    id: 'no-secrets-introduced',
    severity: 'INFO',
    summary: 'git show HEAD --name-only filtered for .env/secret/credential/.pem/.key/id_rsa returns NONE. Scanned all four changed files for eval/new Function/child_process/execSync/spawn/writeFileSync/SERVICE_ROLE/SUPABASE_*KEY/sk-*/api_key/password/secret/token/Bearer: the new gate matches only two benign process.env default-parameter reads; the one-off evidence script matches nothing at all and authenticates via getSupabaseClient() (env-based) using the canonical applySubAgentRepoVerdict writer per CLAUDE.md prologue rule 11.',
  },
  {
    id: 'no-algorithmic-dos',
    severity: 'INFO',
    summary: 'A 50,000-entry success_criteria fixture classified in 23ms. Single linear forEach, no regex backtracking, no nested iteration, no unbounded recursion. The only growth term is the joined "named" string built from offending entries, which is bounded by the DB column size of success_criteria itself.',
  },
  {
    id: 'MEDIUM-new-env-flag-gate-absent-from-the-gate-census-registry',
    severity: 'MEDIUM',
    summary: 'THE ONE REAL DEFECT FOUND, and it is a RECURRENCE. gate-census.js maintains ENV_FLAG_GATES, the committed registry of every LFA gate whose real enforcement sits behind a feature flag independent of its static required declaration. The new gate is NOT registered there. MEASURED by running the census CLI (node scripts/gate-census-lead-final-approval.mjs), whose live output row is: "GATE_SUCCESS_CRITERIA_UNPOPULATED  true  -  -" -- i.e. the artifact whose entire stated purpose is "which gates are really required / really enforced" now reports this observe-only gate as an unconditionally-required, fully-enforced gate with no flag and no disposition. Census totals moved to 24 registered / 19 required:true. This is the exact defect a prior SECURITY adversarial review already caught in this same file on 2026-09-05 (finding L6/#7, which added GATE_ACTIVATION_INVARIANT after the census "previously omitted this 5th env-flag-gated gate"). This one is the 6th. It also falsifies the commit message claim that the gate mirrors acceptance-tier-downgrade-gate.js env-flip pattern "exactly" -- that gate IS census-registered (gate-census.js:33-38); this one is not. NOT exploitable and NOT a security-control failure, so it does not sink the verdict; it is an integrity defect in a governance artifact, and the fix is ~6 lines.',
  },
  {
    id: 'LOW-sd-null-throws-but-fails-closed-not-open',
    severity: 'LOW',
    summary: 'validateSuccessCriteriaMeasured(sd = {}) uses a default parameter, which applies to undefined but NOT to null; the validator passes ctx.sd unguarded, so a null ctx.sd throws TypeError: Cannot read properties of null (reading "success_criteria") -- reproduced. Every sibling LFA gate uses optional chaining (ctx.sd?.id, ctx.sd?.sd_key) instead. TRACED THE BLAST RADIUS RATHER THAN ASSUMING IT: ValidationOrchestrator.validateGate wraps every validator in try/catch (ValidationOrchestrator.js:212-223) and converts a throw into {passed:false, score:0}, and the blocking predicate at :412 (!gateResult.passed && gate.required !== false) keys on passed. So the failure mode is a spurious FAIL, i.e. FAIL-CLOSED. Not a vulnerability; a robustness nit worth one "?." for consistency with its siblings.',
  },
  {
    id: 'LOW-unsanitized-db-text-interpolated-into-console-output',
    severity: 'LOW',
    summary: 'The DB-sourced criterion string is interpolated verbatim into console.log and into warnings[]. Verified live: an ANSI escape payload and a newline payload both pass through unescaped, so a crafted criterion could emit terminal escapes or forge an extra gate-output line in a CI log. PRE-EXISTING REPO-WIDE PATTERN, not introduced here -- every sibling gate interpolates DB strings into console.log the same way (acceptance-tier-downgrade-gate.js:298,306,310). Write path is the supabase JS client (structured JSON, parameterized), so there is no SQL or command sink beyond the terminal. Recorded for completeness at LOW; fixing it belongs in a repo-wide gate-output hardening SD, not this one.',
  },
  {
    id: 'additive-only-no-bypass-or-score-dilution-vector',
    severity: 'INFO',
    summary: 'Checked whether an always-100 observe-only gate can dilute the weighted-average normalizedScore enough to float a marginal handoff. It cannot affect blocking: required-gate enforcement is a PER-GATE boolean at ValidationOrchestrator.js:412 (!gateResult.passed && gate.required !== false), evaluated independently of the aggregate, so no other failing gate can be rescued by this gate score. The gate does add +100 to weightedScoreSum/totalWeight, a reporting-metric effect identical to the already-ratified acceptance-tier-downgrade-gate.js precedent. The gates.js delta is 10 lines (import/export/push/default-export) and touches none of the execSync/execFileSync region that SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 hardened against RCE in this same file.',
  },
  {
    id: 'gate-is-not-verdict-cacheable-no-stale-pass-replay',
    severity: 'INFO',
    summary: 'Evidence-integrity check against the gate-verdict cache: GATE_SUCCESS_CRITERIA_UNPOPULATED appears in no declared-inputs or GATE_CODE_VERSION registry (grep outside its own file returns nothing), so probeVerdictCache computes a null inputHash and returns {hit:false} at gate-verdict-cache.js:185. The gate therefore always re-evaluates against the live SD and can never replay a stale PASS from a run where success_criteria differed.',
  },
  {
    id: 'tests-green-no-regression',
    severity: 'INFO',
    summary: 'Ran the suites rather than trusting the commit message: 12/12 pass in success-criteria-unpopulated-gate.test.js, and 99/99 pass across all 6 test files in the lead-final-approval/gates/ directory. No regression in sibling gates.',
  },
];

const warnings = [
  'MEDIUM (should be closed before LEAD-FINAL-APPROVAL, ~6 lines): register the new gate in gate-census.js ENV_FLAG_GATES as GATE_SUCCESS_CRITERIA_UNPOPULATED with env_flag SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING, polarity opt-in, resolve () => process.env.SUCCESS_CRITERIA_UNPOPULATED_GATE_BINDING === "true", and an OBSERVE-ONLY disposition. Until then the census -- the artifact that exists specifically to stop "which gates are really enforced" from drifting -- reports this observe-only gate as fully enforced (measured live: "GATE_SUCCESS_CRITERIA_UNPOPULATED  true  -  -").',
  'LOW: use ctx.sd?.success_criteria (or default the whole arg) so a null ctx.sd does not throw; behaviour today is fail-closed via the orchestrator catch, so this is consistency-with-siblings, not a security fix.',
  'LOW (pre-existing, repo-wide): DB-sourced criterion text reaches console.log and warnings[] unescaped; ANSI/newline payloads render verbatim. Out of scope for this SD.',
];

const recommendations = [
  'PASS the EXEC-TO-PLAN security gate. The security scope proper -- injection, unsafe eval, secrets, unsafe env-var handling, unvalidated input reaching an unsafe sink, access control -- is genuinely clean, and that conclusion is measured (fuzz run, sink trace, grep counts, live census run), not inferred from the change being small.',
  'Close the MEDIUM census-registry gap in this SD rather than deferring it: it is a ~6-line addition to a file this SD already conceptually touches, and it is the second occurrence of a defect class a prior SECURITY review already flagged in that exact file.',
  'When the future BINDING flip happens, re-run SECURITY: flipping to blocking turns the criterion string into a hard-block input and makes the LOW log-interpolation finding materially more interesting (a gate that blocks on attacker-influenced text deserves output escaping).',
];

const summary = 'SECURITY PASS for SD-LEO-FIX-LEAD-FINAL-APPROVAL-002 (EXEC_TO_PLAN). Verified rather than rubber-stamped: fuzzed the gate with 12 hostile fixtures (null/undefined/non-array/scalar entries, ANSI and newline log-injection payloads, a SQL-ish criterion, a JSON __proto__ payload, a 50k-entry array) and traced every sink. Results: zero DB/fs/process references in the new file (grep count 0, and the factory takes no supabase argument at all); the imported classifyEntry() is exact-equality string comparison with ZERO regex, and lib/sd-fields/unpopulated.js is provably unmodified by this commit; no prototype pollution (Object.prototype clean after the __proto__ fixture, and the only property read uses a hardcoded key); the env var is strict === "true" so it can only make the gate stricter, never weaker, than the shipped default; no secrets or env files in the commit; 50k entries in 23ms so no algorithmic DoS; the gate is not verdict-cacheable so it cannot replay a stale PASS; and it is purely additive with no bypass vector, since required-gate blocking is a per-gate boolean independent of the weighted-average score. 12/12 and 99/99 tests green when run. ONE REAL DEFECT, MEDIUM and non-security-blocking: the new env-flag-gated gate is missing from gate-census.js ENV_FLAG_GATES, so the committed "which gates are really enforced" census now reports this observe-only gate as fully enforced -- measured by running the census CLI ("GATE_SUCCESS_CRITERIA_UNPOPULATED  true  -  -"). That is a RECURRENCE of finding L6/#7 from the 2026-09-05 adversarial review of that same file, and it falsifies the commit message claim that the gate mirrors acceptance-tier-downgrade-gate.js "exactly" (that gate is census-registered; this one is not). Two LOW notes: a null ctx.sd throws (fail-CLOSED via ValidationOrchestrator.js:212-223, so not a vulnerability, just inconsistent with siblings ctx.sd?. style), and unescaped DB text reaching console.log/warnings (pre-existing repo-wide pattern, not introduced here).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 94,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      commit_reviewed: 'dcf9f2d093ce2e6b5384860a5828c9ba174384bb',
      security_checklist: {
        injection_sql: 'N/A - zero DB calls in the gate (grep count 0); write path elsewhere is the parameterized supabase JS client',
        injection_command: 'PASS - no child_process/execSync/spawn/eval/new Function in the new file',
        redos: 'PASS - zero regular expressions in the gate or in the imported classifyEntry()',
        prototype_pollution: 'PASS - fuzz-verified clean; zero property writes, hardcoded read key',
        secrets_hardcoded: 'PASS - none; no env/key/credential files in the commit',
        env_var_handling: 'PASS - strict === true; fail-safe polarity (can only tighten, never weaken)',
        input_validation: 'PASS - Array.isArray guard, typeof guards, String(x ?? "") coercion; all hostile shapes handled',
        output_encoding: 'LOW - DB text interpolated unescaped into console.log/warnings (pre-existing repo-wide pattern)',
        access_control: 'N/A - no auth surface; gate performs no privileged operation',
        fail_open_vs_closed: 'PASS - fails CLOSED; orchestrator catch converts a throw to passed:false',
        bypass_surface: 'PASS - additive only; per-gate required boolean means no other gate can be rescued',
        evidence_integrity: 'PASS - not verdict-cacheable, always re-evaluates fresh',
      },
      verification_performed: [
        'git show HEAD -- <gate>.js gates.js  (full diff read)',
        'git log -1 -- lib/sd-fields/unpopulated.js + git diff HEAD~1 HEAD -- lib/  (dependency proven unmodified)',
        '12-case hostile-input fuzz incl. __proto__, ANSI, newline, SQL-ish, 50k-entry payloads',
        'env-var coercion matrix across 10 values',
        'sink trace: ValidationOrchestrator.js:190-223 (catch) and :412 (required blocking predicate)',
        'gate-verdict-cache.js:185 cacheability check',
        'node scripts/gate-census-lead-final-approval.mjs  (live census run -- found the MEDIUM)',
        'npx vitest run <gate>.test.js  (12/12) and lead-final-approval/gates/  (99/99)',
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase: EXEC_TO_PLAN');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
