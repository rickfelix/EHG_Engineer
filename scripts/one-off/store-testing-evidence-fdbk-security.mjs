import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary:
    'Shipped code is correct and all 6 new tests pass and ARE collected by CI (vitest --project unit). ' +
    'But an adversarial mutation pass I ran against the suite scored 0/8 killed: every sabotage of the exact ' +
    'properties FR-3 exists to protect survives the tests green. Most severe: replacing real AES-256-GCM with a ' +
    'base64 passthrough (zero confidentiality) passes all 6 tests, because the only confidentiality assertion is ' +
    'substring-absence, which any encoding satisfies. FR-3 acceptance criterion #5 (storeTokens throws on DB write ' +
    'failure) has no test AND no corresponding PRD test_scenario. The storeTokens INSERT branch -- the first-ever-auth ' +
    'path, i.e. the exact path that produced the original plaintext exposure -- is 100% uncovered. ' +
    'I authored and verified an 8-test hardened suite that is green on unmutated source and kills 8/8 mutants; ' +
    'adopting it is the remediation. No defect found in the shipped production code itself.',
  findings: [
    { id: 'F1', severity: 'high', title: 'Mutation score 0/8 -- the FR-3 regression suite is not load-bearing',
      detail: 'Ran 8 targeted mutants against lib/integrations/youtube/oauth-manager.js, each re-running the 6-test suite. ALL 8 SURVIVED (suite stayed 6/6 green). Reproducer: scripts/one-off/tmp-mutate-oauth-manager.mjs.' },
    { id: 'F2', severity: 'high', title: 'Encryption can be silently disabled without any test failing (probe #2 CONFIRMED)',
      detail: 'Mutant M1 replaced credentialEncryption with {encrypt: base64(JSON.stringify), decrypt: JSON.parse(base64decode)} -- no key, no cipher, no integrity, fully reversible by anyone. All 6 tests passed. Root cause: the sole confidentiality assertion is JSON.stringify(payload) not.toContain(rawToken), which base64/rot13/reverse all satisfy while providing zero confidentiality. Mitigating: lib/security/encryption.test.js DOES test the primitive (random IV/salt non-determinism at line 152, tamper + corruption). So both ENDS are green; nothing pins the WIRE -- that oauth-manager actually invokes real crypto. Fix (verified to kill M1): pin vault.metadata.algorithm === "aes-256-gcm", and assert Buffer.from(vault.encrypted,"base64").toString("utf8") does not contain the token or the literal "refresh_token".' },
    { id: 'F3', severity: 'high', title: 'FR-3 acceptance criterion #5 (throw on DB write failure) is untested AND has no PRD test_scenario',
      detail: 'PRD FR-3 AC#5: "A DB write failure inside storeTokens throws rather than returning silently" -- added per VALIDATION finding F8. TS-1..TS-8 contain no scenario for it. The test mock hardcodes {error: null} on both update and insert, so neither `if (error) throw` at oauth-manager.js:123 and :132 is ever executed. Mutants M4 and M5 deleted each throw; both survived 6/6 green. This is a PRD-level plan gap, not just a test gap: an AC with no TS.' },
    { id: 'F4', severity: 'high', title: 'storeTokens INSERT branch is 100% uncovered -- the first-ever-auth path',
      detail: 'Every test seeds an existing row, so only the UPDATE branch (oauth-manager.js:112-123) runs; the INSERT branch (:124-133) never executes. Mutant M3 made the INSERT branch write PLAINTEXT `{ tokens }` -- i.e. exactly reintroduce the original CVE-class exposure on the first-ever authorization -- and all 6 tests passed. This is the highest-consequence gap: the leaked row 5ea38ba3 was itself created by a first-auth write.' },
    { id: 'F5', severity: 'medium', title: 'No test proves fresh salt/IV per call at the oauth-manager level (probe #4)',
      detail: 'No test calls storeTokens twice and compares ciphertext. Partially mitigated: encryption.test.js:152 covers this for the primitive, so the property does hold in production (I verified two storeTokens calls yield different ciphertext). Severity reduced from high to medium on that basis, but a deterministic-cipher regression introduced at the oauth-manager layer would still go unseen.' },
    { id: 'F6', severity: 'medium', title: 'Sibling source_metadata keys can be destroyed with no test failing',
      detail: 'Mutant M2 changed `{...restMetadata, encrypted_tokens}` to `{encrypted_tokens}`, silently dropping every other key in eva_sync_state.source_metadata (e.g. sync cursors/checkpoints). All 6 tests passed. Data-loss regression, invisible to the suite.' },
    { id: 'F7', severity: 'low', title: 'Row-targeting literals unpinned (SYNC_STATE_IDENTIFIER, source_type, TOKEN_VAULT_APP_ID)',
      detail: 'The mock ignores .eq() filter args, so mutants M6 (SYNC_STATE_IDENTIFIER -> MUTATED_identifier), M8 (source_type -> MUTATED_type) and M7 (TOKEN_VAULT_APP_ID -> MUTATED) all survived. SYNC_STATE_IDENTIFIER is exported and consumed by scripts/eva-idea-sync-cron-assert.mjs, so drifting it silently decouples that caller. M7 is near-equivalent (the code correctly documents appId is not a cryptographic domain separator -- decrypt ignores metadata), but pinning metadata.appId is a free literal-pin that also happens to kill M1.' },
    { id: 'F8', severity: 'info', title: 'Probe #3 (tokens containing a literal `encrypted_tokens` key) is a genuine non-issue -- measured, not assumed',
      detail: 'I tested storeTokens({...TOKENS, encrypted_tokens: "not-a-vault"}): it round-trips exactly and the inner value never appears in the outer payload, because the whole tokens object is encrypted as an opaque blob and the outer key is written last. Confirms your judgment: not worth a permanent test (I include it as H8 only because it was free).' },
    { id: 'F9', severity: 'info', title: 'Positives verified',
      detail: 'All 6 tests pass (6/6, 325ms). TS-1..TS-6 map 1:1 to the 6 tests. The suite IS collected by the default `unit` project (confirmed via `vitest list --project unit`) so it runs in CI -- not quarantined/CI-blind. Tests exercise the REAL encryption module (no enc injection), so genuine AES-256-GCM runs. The round-trip assertion uses an exact toEqual(TOKENS) deep-equal, not a weak shape check. Production code logic is correct on every path I inspected. .leo-keys is gitignored and untracked (no key leak).' },
  ],
  warnings: [
    'Test-suite blindness only -- I found NO defect in the shipped production code. Do not read CONDITIONAL_PASS as "the security fix is wrong"; the fix is sound, its regression guard is not.',
    'The oauth-manager test run invokes the real encryption module, which auto-generates <repo>/.leo-keys via getMasterKey() when absent. On a fresh CI clone this silently creates a master key as a test side effect. Benign today (gitignored, and the tests only round-trip), but it means the suite can never fail for a missing-key reason, masking key-management regressions.',
    'FR-1/FR-2/FR-4/FR-5 are live-DB/provider integration criteria (TS-7, TS-8) outside this unit suite; this review did not re-verify them.',
  ],
  recommendations: [
    'ADOPT the 8-test hardened suite at scripts/one-off/tmp-hardened-oauth-tests.txt (replace ./TARGET_MODULE with ./oauth-manager.js). I verified it: GREEN 8/8 on unmutated source, and it KILLS 8/8 mutants. This is executed code, not proposed prose.',
    'H1 (pin metadata.algorithm === "aes-256-gcm" + assert base64-decoded blob has no plaintext) -- kills the silent-encryption-disabled class. Highest value single test.',
    'H4 (INSERT branch: asserts ciphertext, source_type, source_identifier, no plaintext) -- covers the first-ever-auth path that caused the original incident.',
    'H5 + H6 (rejects.toThrow on update/insert DB error) -- closes FR-3 AC#5. ALSO add a matching TS-9 to the PRD test_scenarios, since AC#5 currently has no scenario at all.',
    'H3 (sibling metadata preservation) and H7 (pin source_type/source_identifier filter args; requires the mock to capture .eq() args) -- close the data-loss and row-targeting gaps.',
    'Consider adding a cheap mutation-sanity check for security-critical crypto wiring generally: "would this test still pass if encryption were a no-op?" is the question the current substring-absence assertion cannot answer.',
  ],
  validation_mode: 'retrospective',
  metadata: {
    recorded_by: 'testing-agent (Task tool dispatch)',
    assessment_type: 'plan_to_exec_test_plan_review',
    tests_run: 'npx vitest run lib/integrations/youtube/oauth-manager.test.js',
    tests_result: '6 passed (6), 325ms',
    ci_collection_verified: 'vitest list --project unit -> all 6 collected',
    mutation_score_current: '0/8 killed',
    mutation_score_hardened_candidate: '8/8 killed (baseline green 8/8)',
    mutants: ['M1-crypto-bypass', 'M2-sibling-metadata-clobber', 'M3-insert-writes-plaintext', 'M4-update-throw-removed', 'M5-insert-throw-removed', 'M6-sync-state-identifier', 'M7-token-vault-app-id', 'M8-source-type'],
    reproducers: [
      'scripts/one-off/tmp-mutate-oauth-manager.mjs (0/8 baseline)',
      'scripts/one-off/tmp-verify-hardened.mjs (8/8 hardened)',
      'scripts/one-off/tmp-hardened-oauth-tests.txt (candidate suite)',
    ],
    prd_gap: 'FR-3 acceptance_criteria[4] has no corresponding entry in test_scenarios (TS-1..TS-8)',
    probes_answered: {
      p1_inspects_written_payload: 'YES - reads mockSupabase.__getRow().source_metadata, genuinely the written payload, not a return value',
      p2_catches_disabled_encryption: 'NO - base64 passthrough mutant survives all 6 tests (CONFIRMED GAP)',
      p3_encrypted_tokens_literal_key: 'non-issue, empirically verified round-trips cleanly',
      p4_two_calls_differ: 'NO test at oauth-manager level; property holds and IS covered in encryption.test.js:152',
      p5_db_failure_throws_tested: 'NO - untested, and no PRD test_scenario exists for it',
    },
  },
};

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN_TO_EXEC' });
console.log('Stored TESTING evidence id:', stored.id);
console.log('verdict:', results.verdict, '| confidence:', results.confidence);
