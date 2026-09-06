#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';
const RUN_ID = '7ec6874e-f240-497b-a4fb-c29a5b7120ef';
const SHA = 'daf75d6dfd7';
const DIFF_CMD = 'git diff 9126e8903f2..daf75d6dfd7 -- lib/security/encryption.cjs lib/integrations/google/ lib/michael/ scripts/michael/ server/routes/michael.js server/routes/michael.test.js server/index.js';

const findings = [
  { id: 'S-1', disposition: 'CLOSED_AND_MEASURED', severity: 'high', title: 'Host-venue guard is injectable and carries no test bypass',
    evidence: 'chairman-oauth.js:49-53 assertHostVenue(env = process.env) reads the injected env at call time; called at getStoredTokens:118, storeTokens:139, runConsentFlow:202 and transitively from getAuthenticatedClient:167 and google-consent.mjs:59. chairman-oauth.test.js:59-60 reads its own source and asserts it matches no /NODE_ENV|VITEST|SKIP_VENUE|keyPath|readFile/. MEASURED HERE: CI=true GITHUB_ACTIONS=true npx vitest run --project unit over the four files gives 4 files / 29 tests passed, identical to the unset run, so the PLAN-phase prediction that the guard would redden the unit tier is refuted and no weakening was needed.' },
  { id: 'S-2', disposition: 'CLOSED', severity: 'high', title: 'Consent flow: state nonce + PKCE S256 + loopback-only listener started before the browser',
    evidence: 'chairman-oauth.js:208 state = crypto.randomBytes(16).toString("hex") (128 bits); :209 generateCodeVerifierAsync(); :210 generateAuthUrl passes state, code_challenge and code_challenge_method S256; :238 getToken({ code, codeVerifier }). :219 requires url.pathname === "/oauth2callback" AND a timing-safe state compare (:186, length-checked crypto.timingSafeEqual) AND (code||error). :212 every non-match, including a URL parse throw (:220 catch sets matches=false), answers 400 and keeps listening. :231 server.listen(3456, "127.0.0.1") and the browser launches only inside the listen callback (:233). :230 EADDRINUSE becomes coded REDIRECT_PORT_IN_USE. Pinned by chairman-oauth.test.js:214-240 (wrong state, missing code, multibyte same-character-count state and malformed URL all 400; good 200; verifier reaches getToken) and :241-246.' },
  { id: 'S-3', disposition: 'CLOSED', severity: 'medium', title: 'KEY_FINGERPRINT_MISMATCH is a coded throw, not a truthy return',
    evidence: 'chairman-oauth.js:124 throws codedError KEY_FINGERPRINT_MISMATCH before the decrypt at :126. getAuthenticatedClient:167 awaits getStoredTokens before setCredentials:169, so setCredentials is structurally unreachable on a mismatch. chairman-oauth.test.js:105-112 asserts both codes and decrypts === 0. GAP (low): the recommended test asserting getAuthenticatedClient surfaces the code and never calls setCredentials was not written; the property holds by call order, not by assertion.' },
  { id: 'S-4', disposition: 'CLOSED', severity: 'medium', title: 'Null stored fingerprint fails closed',
    evidence: 'chairman-oauth.js:123 a falsy row.key_fingerprint throws KEY_FINGERPRINT_ABSENT before decrypt (code name is _ABSENT, not the recommended _MISSING). A malformed non-16-hex value falls to the :124 inequality and refuses as MISMATCH. storeTokens:141 derives key_fingerprint from enc.fingerprint(), which throws when the key is missing or malformed, so a null fingerprint can never be written. Pinned at chairman-oauth.test.js:109.' },
  { id: 'S-5', disposition: 'CLOSED_WITH_DEVIATION', severity: 'medium', title: 'Fingerprint is over raw bytes with a known-answer vector; domain separation not applied',
    evidence: 'chairman-oauth.js:56-58 keyFingerprint(keyBuffer) = sha256(raw bytes) hex sliced to 16. readHostKey:64 returns Buffer.from(hex, "hex"), so the hex string is never hashed. Known-answer test chairman-oauth.test.js:52 pins keyFingerprint(Buffer.alloc(32,0)) === 66687aadf862bd77, independently the sha256 of 32 zero bytes. DEVIATION: the PLAN recommendation preferred sha256("michael-key-fp-v1" || key); the shipped digest is not domain separated. Hygiene only, per the PLAN rationale a 64-bit tag over a 256-bit random key is not brute-forceable.' },
  { id: 'S-6', disposition: 'OPEN_RESIDUAL_PARTIALLY_RECORDED', severity: 'medium', title: 'No revoke path anywhere in the child; recorded only in the PRD rollback_procedure',
    evidence: 'MEASURED: grep -rn revoke over lib/integrations/google/, lib/michael/gmail-client.mjs, scripts/michael/google-consent.mjs and server/routes/michael.js returns ONE hit, the word "revoked" inside a test error fixture (chairman-oauth.test.js:121). runConsentFlow:238-239 exchanges the code and calls storeTokens with no revoke on failure. The PRD records the manual fallback ONLY in metadata.rollback_procedure ("revoke the grant at myaccount.google.com/permissions"); the PLAN row listed S-6 in conditions_for_pass and the google-consent.mjs header runbook (lines 5-17) does not mention revocation. Window: between a successful getToken and a failed upsert, Google holds a live gmail.modify refresh token that nothing in the repo records or can kill. The TABLES_ABSENT pre-flight (:207) closes the largest instance of that window; a transient write failure is the remainder. Unreachable today: michael_credentials still returns PGRST205, so no grant exists yet.' },
  { id: 'S-7', disposition: 'CLOSED', severity: 'medium', title: '/api/michael mounted with requireAuth + requireAdminRole',
    evidence: 'server/index.js:272 app.use("/api/michael", requireAuth, requireAdminRole, michaelRoutes), placed before the "/api" optionalAuth catch-all at :275. requireAdminRole (server/routes/protocol-lint.js:48-59) allows chairman|executive|system_admin_ops|admin, else 403 NOT_ADMIN. server/routes/michael.test.js:37-45 reads server/index.js source and asserts exactly one /api/michael line matching requireAuth,requireAdminRole and that it precedes the catch-all. The route selects STATUS_COLUMNS only, which excludes encrypted_blob and encryption_metadata, and never decrypts. INHERITED (not introduced): requireAuth (server/middleware/auth.js:56-60) sets req.isAdmin=true for any holder of INTERNAL_API_KEY, which short-circuits requireAdminRole for every admin route in the repo. Payload here is non-secret metadata, so impact is disclosure of grant health only.' },
  { id: 'S-8', disposition: 'PARTIALLY_CLOSED', severity: 'low', title: 'Venue guard now covers every key-touching entry point; CI matching remains exact-string',
    evidence: 'chairman-oauth.js:50 refuses GITHUB_ACTIONS === "true" || CI === "true" || CI === "1". CI="True" or "yes" would not refuse; GitHub Actions is covered twice over, so the invariant that matters holds. The write path IS guarded (storeTokens:139), which was the substantive half of the finding.' },
  { id: 'S-9', disposition: 'RECORDED', severity: 'low', title: 'drive.readonly and calendar.readonly granted with no consumer in this child',
    evidence: 'chairman-oauth.js:23-27 SCOPES unchanged from the PRD; consumers land in later children. Spec-sanctioned, no action.' },
  { id: 'S-10', disposition: 'CLOSED_WITH_GAP', severity: 'low', title: 'Logging and fixture hygiene',
    evidence: 'MEASURED: no console call in any shipped module logs a token, an authorization code, req.url or encrypted_blob (only the auth URL at :232, whose client_id and code_challenge are public by construction, plus refusal text). storeTokens is pinned by key-set equality (test :83) plus a negative scan for every fixture token string (:93). The status route and the CLI select STATUS_COLUMNS and are pinned by MUST-NOT-LEAK assertions (michael.test.js:24, google-consent.test.js:40 and :43). GAPS: no console-spy test, and the fixtures read "ya29.fixture-access" and "1//fixture-refresh" rather than the recommended unmistakable DO-NOT-USE form.' },
  { id: 'S-11', disposition: 'RE_MEASURED_CLEAN', severity: 'informational', title: 'Secret-venue invariants still hold at daf75d6dfd7',
    evidence: 'grep -rn "MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET" .github/workflows exits 1 with zero hits. .gitignore lines 4, 5, 49 and 50 cover .env, .env.*, .leo-keys and .leo-keys.backup*; git ls-files shows no .env or .leo-keys tracked (only .env.claude, .env.claude.example and .env.example, all pre-existing). Scan of the 882-line merged diff for ya29 with 20+ chars, 1// with 20+ chars, GOCSPX-, AIza, BEGIN or service_role returns zero real-shaped secrets, only the two short fixture lines. PR bodies #8346 and #8351 carry no credential material.' },
  { id: 'R-A', disposition: 'INHERITED_RESIDUAL_RECORDED', severity: 'medium', title: 'Host .env master key is in-process for every dotenv script that also holds a service-role client',
    evidence: 'google-consent.mjs:18 imports dotenv/config (81 vars injected per run observed here), which loads MICHAEL_ENCRYPTION_KEY beside SUPABASE_SERVICE_ROLE_KEY. Any repo script doing the same can both read encrypted_blob and decrypt it. Named in the PRD; structural to the .env venue choice, not introduced by this child.' },
  { id: 'R-B', disposition: 'INHERITED_RESIDUAL_RECORDED', severity: 'medium', title: 'encryption.cjs has no AAD binding',
    evidence: 'VERIFIED in source at lib/security/encryption.cjs: encrypt(data, appId) puts appId only into the returned metadata object and never calls cipher.setAAD; decrypt(encryptedData, _metadata = {}) ignores its second argument entirely. TOKEN_VAULT_APP_ID "michael-google-chairman-oauth" (chairman-oauth.js:35) is therefore an operational label, not a domain separator: any holder of the same master key can decrypt the Michael blob. Named in the PRD and in the module header comment.' },
  { id: 'R-C', disposition: 'ADVERSARIAL_RESIDUAL_RECORDED', severity: 'low', title: 'invalid_grant inside the access-token lifetime is not written to last_error until the next refresh',
    evidence: 'getAuthenticatedClient:170 refreshes only when tokens.expiry_date && now >= tokens.expiry_date, and recordLastError is reached only from the refresh catch at :177. A grant revoked at Google mid-lifetime surfaces as an opaque API 401 while the gauge column stays null for up to the access-token lifetime. ADDITIONAL EDGE FOUND HERE: if the stored token object carries no expiry_date at all, the refresh branch never runs, so last_error is never written on that path either.' },
  { id: 'F-1', disposition: 'NEW_LOW', severity: 'low', title: 'REDIRECT_URI names localhost while the listener binds 127.0.0.1 only',
    evidence: 'chairman-oauth.js:31 REDIRECT_URI is http://localhost:3456/oauth2callback but :231 listens on 127.0.0.1. On a host where localhost resolves to ::1 first the callback can fail to connect; browsers normally fall back to IPv4. Recorded so that if a callback ever hangs, the repair is a second ::1 listener or a 127.0.0.1 redirect URI, NEVER widening the bind to all interfaces, which is the exact defect S-2 removed from the YouTube precedent.' },
  { id: 'F-2', disposition: 'NEW_LOW', severity: 'low', title: 'Source-assertion regex is narrower than the PLAN recommendation',
    evidence: 'chairman-oauth.test.js:60 matches /NODE_ENV|VITEST|SKIP_VENUE|keyPath|readFile/. A future bypass keyed on JEST_WORKER_ID, npm_lifecycle_event or ALLOW_CI_VENUE would pass the guard test. Widening the alternation is a one-line change.' },
  { id: 'F-3', disposition: 'OPERATIONAL', severity: 'low', title: 'MICHAEL_ENCRYPTION_KEY is not provisioned on the host yet',
    evidence: 'MEASURED: zero occurrences of MICHAEL_ENCRYPTION_KEY in the host .env. The first consent will refuse with MICHAEL_ENCRYPTION_KEY_MISSING carrying the provisioning command (chairman-oauth.js:42-44), which is the designed behaviour. Recorded because the same host smoke also needs michael_credentials, which returns PGRST205 live: child B is still unapplied, so nothing in this child has been exercised against a real grant.' },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 93,
  summary:
    'EXEC-phase SECURITY review of the merged child-C diff at daf75d6dfd7 (PRs #8346 and #8351, 805 added lines across 10 files), read as code rather than as summaries. Every PLAN-phase condition S-1..S-7 was verified against the shipped source; six are closed, one (S-6) shipped open. The two highs are genuinely closed and one is refuted by measurement rather than by assertion: S-1 predicted that assertHostVenue would redden the unit tier under GitHub Actions, and running the four test files with CI=true GITHUB_ACTIONS=true gives the same 29/29 pass as the unset run, because the guard takes an injectable env and every test supplies its own, with a source-assertion test (chairman-oauth.test.js:59-60) pinning the absence of a test-mode bypass. S-2 is closed in full: 128-bit state nonce, PKCE S256 with the verifier reaching getToken, listener bound to 127.0.0.1 and started before the browser opens, path check, timing-safe state compare, and 400 (never a throw, never a close) on wrong state, missing code, a multibyte same-character-count state and an unparseable URL. S-3 and S-4 are coded throws placed before the decrypt call, with decrypts === 0 asserted. S-5 hashes the raw key bytes with a hard-coded known-answer vector. S-7 mounts /api/michael behind requireAuth AND requireAdminRole ahead of the optionalAuth catch-all, pinned by a mount-table source assertion, and the route selects only non-secret columns. The key is refuse-never-generate (MICHAEL_ENCRYPTION_KEY only, 64 hex, three named refusals), writes are ciphertext-only proven by key-set equality plus a negative scan for every fixture token string, granted scopes are stored so a granular grant reads partial_scope, and TRASH and SPAM are refused before any Gmail API call. Secret venue re-measured clean at this commit: zero workflow hits, .env and .leo-keys ignored and untracked, no secret-shaped string in the diff or in either PR body, and no shipped module logs a token, an authorization code or the blob. CONDITIONAL rather than PASS for one reason: S-6 was listed in the PLAN row conditions_for_pass and did not ship. There is no revoke verb anywhere in the child and no revoke line in the google-consent.mjs runbook header; the only record is the PRD rollback_procedure. Nothing is exploitable today, because michael_credentials still returns PGRST205 and MICHAEL_ENCRYPTION_KEY is absent from the host .env, so the conditions are non-blocking, but they must close before the chairman consents. Three residuals are recorded as scoped rather than rediscovered: the host key is in-process for every dotenv script that also holds a service-role client; encryption.cjs binds no AAD (decrypt ignores its metadata argument, verified in source), so TOKEN_VAULT_APP_ID is a label and not a domain separator; and an invalid_grant occurring inside the access-token lifetime is not written to last_error until the next refresh, with the additional edge found here that a stored token object carrying no expiry_date never reaches the refresh branch at all.',
  findings,
  critical_issues: [],
  warnings: [
    'S-6 shipped open: no revoke path and no revoke line in the google-consent.mjs runbook header, though the PLAN row listed it in conditions_for_pass. Close before the first real consent.',
    'requireAuth grants req.isAdmin to any holder of INTERNAL_API_KEY, short-circuiting requireAdminRole. Inherited repo-wide, but /api/michael now inherits it and child E extends this router with more sensitive data.',
    'Nothing in this child has been exercised against a real grant: michael_credentials returns PGRST205 and MICHAEL_ENCRYPTION_KEY is absent from the host .env. Merging is not evidence that the grant works.',
  ],
  recommendations: [
    'Add the revoke fallback to the google-consent.mjs header runbook (myaccount.google.com/permissions) and, in runConsentFlow, POST the token to oauth2.googleapis.com/revoke when storeTokens throws, before rethrowing. Closes S-6 where an operator will look.',
    'Widen the source-assertion alternation in chairman-oauth.test.js:60 to cover JEST, npm_lifecycle and ALLOW_.*VENUE so a future bypass cannot be added under a name the guard does not watch.',
    'Add the assertion the PLAN row asked for: getAuthenticatedClient surfaces KEY_FINGERPRINT_MISMATCH and never calls setCredentials. The property holds by call order today; nothing pins it.',
    'If the loopback callback ever fails to connect, add an ::1 listener or change REDIRECT_URI to 127.0.0.1. Never widen the bind to all interfaces.',
    'Sequence child G (michael-oauth-health) or the manual --status check before the first consent, so R-C and a lapsed grant are visible rather than surfacing as a degraded brief.',
  ],
  conditions: [
    { action: 'S-6: ship a revoke path (automatic on post-getToken persist failure) and name revocation in the google-consent.mjs runbook header, before the chairman runs the first real consent.', blocking: false, priority: 'medium' },
    { action: 'Re-run this SECURITY review as a host smoke after the child B migration is chairman-applied: consent, --status, gmail-act --dry-run. Every assertion here is an injected-client unit test.', blocking: false, priority: 'medium' },
    { action: 'Record R-A, R-B and R-C on the parent so children D, E and G inherit them explicitly rather than rediscovering them.', blocking: false, priority: 'low' },
  ],
  metadata: {
    producer: 'security-agent via sub_agent_executor',
    run_id: RUN_ID,
    content_hash_input: 'computeContentHash(record) over the assembled sub_agent_execution_results record for this write: sd_id, sub_agent_code SECURITY, phase EXEC, verdict, confidence, summary, critical_issues, warnings, recommendations, conditions and metadata. Findings content is stripped by the writer and its key list recorded in metadata._findings_had_keys; the full findings array is preserved in metadata.security_findings. The hash does NOT cover the reviewed source; that is covered by evaluated_commit_sha daf75d6dfd7 plus reviewed_diff_sha256 below.',
    reviewed_diff_sha256: 'REPLACED_AT_RUNTIME',
    reviewed_diff_command: DIFF_CMD + ' (882 lines)',
    evaluated_commit_sha: SHA,
    recorded_by: 'security-agent (Task tool dispatch, EXEC phase)',
    assessment_type: 'exec_phase_code_security_review',
    reviewed_artifact: 'merged child-C diff 9126e8903f2..daf75d6dfd7 (PR #8346 and PR #8351), 10 files, +805 lines',
    prior_evidence_row: '5f31b9b9-acb6-4a17-884b-5ac25b07c6bb (SECURITY, PLAN, CONDITIONAL_PASS, S-1..S-11)',
    branch: 'main',
    ratifications: ['ff4ef5b4 credential venue host-only decrypt', '0daf3bd8 no key in GitHub Actions', '6c263823 gate evidence carries provenance'],
    security_findings: findings,
    files_read_in_full: [
      'lib/integrations/google/chairman-oauth.js (242 lines)',
      'lib/integrations/google/chairman-oauth.test.js (247 lines)',
      'lib/michael/gmail-client.mjs (41 lines)',
      'lib/michael/gmail-client.test.js (38 lines)',
      'scripts/michael/google-consent.mjs (79 lines)',
      'scripts/michael/google-consent.test.js (52 lines)',
      'server/routes/michael.js (53 lines)',
      'server/routes/michael.test.js (46 lines)',
      'server/index.js (the /api/michael mount block and the import line, via diff)',
      'lib/security/encryption.cjs (encrypt and decrypt bodies, lines 60-140, plus the +3-line export diff)',
      'server/middleware/auth.js (requireAuth and optionalAuth, lines 1-110)',
      'server/routes/protocol-lint.js (requireAdminRole, lines 20-59)',
    ],
    measurements: {
      tests_host: 'npx vitest run --project unit over the 4 shipped test files: 4 files / 29 tests passed (537ms)',
      tests_ci_simulated: 'CI=true GITHUB_ACTIONS=true, same command: 4 files / 29 tests passed (481ms). S-1 prediction refuted; no bypass needed.',
      workflow_secret_grep: 'grep -rn "MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET" .github/workflows exits 1, zero hits',
      gitignore: '.gitignore lines 4, 5, 49 and 50 cover .env, .env.*, .leo-keys and .leo-keys.backup*; git ls-files shows no .env or .leo-keys tracked',
      diff_secret_scan: 'zero matches for ya29 20+, 1// 20+, GOCSPX-, AIza, BEGIN or service_role across the 882-line diff; only ya29.fixture-access and 1//fixture-refresh test fixtures',
      pr_bodies: 'gh pr view 8346 and 8351: no credential material in either body',
      revoke_grep: 'grep -rn revoke over the four shipped source paths: 1 hit, a test error-message fixture. No revoke verb exists.',
      encryption_aad: 'lib/security/encryption.cjs encrypt() never calls cipher.setAAD; decrypt(encryptedData, _metadata = {}) ignores its second argument. Confirmed by reading both bodies.',
      michael_credentials_live: 'PGRST205, child B migration still unapplied',
      host_key_present: 'grep -c MICHAEL_ENCRYPTION_KEY .env returns 0, not provisioned yet',
      mount_line: 'server/index.js:272 app.use(/api/michael, requireAuth, requireAdminRole, michaelRoutes), before app.use(/api, optionalAuth, ...) at :275',
      logging_scan: 'no console call in any shipped module logs a token, an authorization code, req.url or encrypted_blob; only the auth URL and refusal text',
    },
    conditions_carried_from_plan: { S1: 'closed_and_measured', S2: 'closed', S3: 'closed', S4: 'closed', S5: 'closed_with_deviation_no_domain_separation', S6: 'open_residual_partially_recorded', S7: 'closed' },
  },
};

const diff = execSync(DIFF_CMD, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 }).toString();
results.metadata.reviewed_diff_sha256 = crypto.createHash('sha256').update(diff).digest('hex');
console.log('REVIEWED_DIFF_SHA256=' + results.metadata.reviewed_diff_sha256);
console.log('DIFF_LINES=' + diff.split('\n').length);

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, { phase: 'EXEC', source: 'sub_agent_executor' });
console.log('STORED_ROW_ID=' + (stored?.id || JSON.stringify(stored)));
console.log('RUN_ID=' + RUN_ID);
console.log('VERDICT=' + (stored?.verdict || results.verdict));
console.log('PHASE=' + (stored?.phase || 'EXEC'));
console.log('CONTENT_HASH=' + (stored?.metadata?.content_hash || 'MISSING'));
