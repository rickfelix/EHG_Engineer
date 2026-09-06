import 'dotenv/config';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 87,
  summary:
    'PLAN-phase design review of PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C against docs/michael/02-SPEC.md section 4 and the code the design builds on (no code exists for this child yet). The core credential posture is SOUND and, in three places, better than the precedent it generalizes: refusing rather than generating the master key is correct and measurable (encryption.cjs:33-54 catches ANY read error and mints+overwrites a fresh random key, so a consent run under the singleton from a worktree would encrypt the chairman refresh token unrecoverably while reporting success); ciphertext-only storage of the whole token object with no token property as a column is right; the key_fingerprint compare is the ONLY possible wrong-key discriminator because encryption.cjs#decrypt ignores its metadata argument entirely (encryption.cjs:116); and the DB layer is already locked down (michael_credentials RLS enabled, one FOR ALL TO service_role policy, REVOKE ALL from anon/authenticated/PUBLIC, GRANT to service_role, plus an in-migration DO block asserting no non-service table OR column grant exists -- migration lines 306-310 and 416-427), so the service-role key in GHA reaches ciphertext and nothing else. Verified live that no workflow references MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET, and that .env, .env.* and .leo-keys are gitignored -- the ratification ff4ef5b4 / 0daf3bd8 invariant holds today. ELEVEN findings, none requiring a redesign, all additive. Two are conditions on EXEC: (S-1) the host-venue guard as specified will fail the repo unit tier, because GitHub Actions sets CI=true and GITHUB_ACTIONS=true on every runner and vitest.config.js does not clear them, so TS-1/TS-3/TS-4/TS-5 throw HOST_VENUE_REQUIRED in CI while passing on the host -- the predictable EXEC repair is to weaken the guard, which destroys the invariant the child exists to create; (S-2) the consent flow inherits oauth-manager.js:171-223 wholesale, which has no state nonce, no PKCE, and binds the callback listener to all interfaces, so for five minutes any host on the same network can inject an authorization code and bind a gmail.modify grant to an attacker Google account.',
  findings: [
    {
      id: 'S-1',
      severity: 'high',
      status: 'design_defect_condition_on_exec',
      title: 'assertHostVenue as specified fails the repo unit tier in GitHub Actions, inviting EXEC to weaken the guard',
      location: 'PRD FR-2 / TR-3 / TS-1,TS-3,TS-4,TS-5; .github/workflows/unit-tier.yml:60 (npx vitest run --project unit); vitest.config.js:270-306',
      detail:
        'GitHub Actions sets CI=true and GITHUB_ACTIONS=true in every runner environment. unit-tier.yml runs "npx vitest run --project unit" on ubuntu-latest for every push to main and every pull_request, and the vitest unit project env block (vitest.config.js:280-287) blanks SUPABASE_POOLER_URL/DATABASE_URL/SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD but NOT CI or GITHUB_ACTIONS. FR-2 places assertHostVenue "before any decrypt and before the consent flow", and TS-1/TS-3/TS-4/TS-5 all exercise getStoredTokens / storeTokens / getAuthenticatedClient. Those four tests therefore pass on the chairman host (where neither var is set) and throw HOST_VENUE_REQUIRED in CI. The failure is deterministic, not flaky, and it lands on the branch that carries the guard. The realistic EXEC repair under a red main is to add a NODE_ENV/VITEST escape hatch or to drop the CI check and keep only GITHUB_ACTIONS -- either of which converts a code invariant back into a convention, which is precisely what TR-3 exists to prevent.',
      recommendation:
        'Specify the seam in the PRD before EXEC: assertHostVenue({ env = process.env } = {}) reads env at call time and takes an injectable env, every non-TS-6 test constructs its own env object (or uses vi.stubEnv to clear CI and GITHUB_ACTIONS in beforeEach), and the module contains NO test-mode bypass. Add an acceptance criterion asserting the chairman-oauth.js source matches no /NODE_ENV|VITEST|JEST|npm_lifecycle|ALLOW_.*VENUE/ escape, so a future weakening is a test failure rather than a quiet edit.',
    },
    {
      id: 'S-2',
      severity: 'high',
      status: 'inherited_defect_amplified_by_scope',
      title: 'Consent flow has no state nonce, no PKCE, and listens on all interfaces: authorization-code injection during the five-minute window',
      location: 'PRD FR-4 ("exactly in the oauth-manager.js:166-230 shape"); lib/integrations/youtube/oauth-manager.js:171-175 (generateAuthUrl) and :192-223 (callback server, server.listen(REDIRECT_PORT) with no host argument)',
      detail:
        'The precedent generateAuthUrl call passes only access_type, scope and prompt -- no state parameter -- and the callback handler accepts any request carrying ?code= regardless of path or origin, then resolves the promise with it. server.listen(3456) with no host binds 0.0.0.0, so the listener is reachable from the whole local network, not just loopback. For the five-minute window: (a) any process or web page on the host, and any host on the same LAN, can reach http://<host>:3456/oauth2callback?code=<attacker_code> and win the race against the chairman browser redirect, causing getToken to exchange an attacker-controlled code and storeTokens to persist a grant on an ATTACKER Google account -- classic authorization code injection / login CSRF; (b) the same reachability lets an outsider cancel the flow with ?error=. Scope matters here in a way it did not for the YouTube module: this grant is gmail.modify on the chairman mailbox, and the chairman works from hotel and public networks (an operating condition already on record). Without state there is also no binding between the browser that started the flow and the callback that finishes it.',
      recommendation:
        'Three additions to FR-4, all cheap and all inside the shape already specified. (1) state: const state = crypto.randomBytes(32).toString("hex"), passed to generateAuthUrl, compared with crypto.timingSafeEqual on the callback; mismatch rejects with a named refusal and closes the server. (2) PKCE: google-auth-library exposes generateCodeVerifierAsync(); pass code_challenge + code_challenge_method "S256" to generateAuthUrl and codeVerifier to getToken, so a stolen code is not redeemable. (3) server.listen(REDIRECT_PORT, "127.0.0.1") and reject any request whose URL pathname is not /oauth2callback. Pin all three with unit tests on the pure callback handler (wrong state -> refusal, code never exchanged).',
    },
    {
      id: 'S-3',
      severity: 'medium',
      status: 'design_ambiguity_condition_on_exec',
      title: 'getStoredTokens tri-state return makes KEY_FINGERPRINT_MISMATCH truthy to the caller that consumes it',
      location: 'PRD FR-3 (returns null | tokens | { error: "KEY_FINGERPRINT_MISMATCH" }); precedent caller lib/integrations/youtube/oauth-manager.js:146-148',
      detail:
        'FR-3 gives getStoredTokens three return shapes and FR-3 also specifies getAuthenticatedClient in the precedent shape, which is "const tokens = await getStoredTokens(); if (tokens) { oauth2Client.setCredentials(tokens); ... }". The mismatch object is truthy, so it flows straight into setCredentials, which accepts an arbitrary object without validation. The named refusal the whole fingerprint mechanism exists to produce is then lost, and the chairman sees an opaque Google 401 instead of "wrong MICHAEL_ENCRYPTION_KEY". The mismatch case is also the exact case a rotated or wrong host key produces, i.e. the one this design is meant to make diagnosable in one line.',
      recommendation:
        'Make the refusal impossible to mistake for tokens: either throw an Error with err.code = "KEY_FINGERPRINT_MISMATCH", or return a discriminated { ok: false, code } that getAuthenticatedClient explicitly tests before any truthiness check. Add a test that getAuthenticatedClient surfaces the code and that setCredentials is never called on a mismatch.',
    },
    {
      id: 'S-4',
      severity: 'medium',
      status: 'fail_open_gap_condition_on_exec',
      title: 'The fingerprint guard is bypassable on a NULL stored fingerprint (fail-open on the column the migration ships nullable)',
      location: 'PRD FR-3 ("returns KEY_FINGERPRINT_MISMATCH ... when they differ"); database/migrations/20260906_michael_tables.sql:296 (key_fingerprint TEXT NULL)',
      detail:
        'key_fingerprint is nullable in the -B migration, and FR-3 only defines behaviour when the stored value DIFFERS from the current one. The likely implementation, "if (row.key_fingerprint && row.key_fingerprint !== current)", skips the guard entirely for a row with no fingerprint and proceeds to decrypt. A row can reach that state from a partial write, a hand-inserted row, or any future writer that does not stamp the column. The guard should be fail-closed: absent provenance is absent, not weak.',
      recommendation:
        'Specify explicitly: a missing, empty or non-16-hex stored fingerprint is its own named refusal (KEY_FINGERPRINT_MISSING), decrypt is not attempted, and storeTokens never writes a null fingerprint. Add it as a test case beside TS-3.',
    },
    {
      id: 'S-5',
      severity: 'medium',
      status: 'spec_ambiguity_with_lockout_consequence',
      title: 'Fingerprint hash input is ambiguous between the 32 raw bytes and the 64-char hex string, and the digest is not domain-separated',
      location: 'PRD FR-2 ("sha256(raw key bytes).hex.slice(0,16)") vs TS-2 ("key_fingerprint = sha256(key).slice(0,16)")',
      detail:
        'Two statements of the same value in one PRD, one over the raw 32 bytes and one over an unqualified "key". If an implementation or a later reimplementation hashes the hex STRING, every fingerprint disagrees with every fingerprint produced by the other reading, and the symptom is a false KEY_FINGERPRINT_MISMATCH that looks exactly like a rotated key -- the chairman would be told to re-consent when the key is correct. Separately, an undomain-separated sha256 prefix of a key is a value some other tool could also publish over the same input; a 64-bit tag over a 256-bit random key is not brute-forceable, so this is hygiene rather than exposure, but the fix is free.',
      recommendation:
        'One exported keyFingerprint(keyBuffer) with a hard-coded known-answer test vector (a fixed 64-hex key mapping to a literal 16-hex fingerprint written into the test) so any reimplementation is caught immediately. Prefer a domain-separated digest, sha256(Buffer.concat([Buffer.from("michael-key-fp-v1"), keyBytes])), and delete the ambiguous wording from TS-2.',
    },
    {
      id: 'S-6',
      severity: 'medium',
      status: 'known_class_unaddressed_recurrence',
      title: 'A burned consent can still orphan a live refresh token, and there is no revoke path anywhere in the child',
      location: 'PRD FR-4 (getToken then storeTokens); precedent oauth-manager.js:226-227; prior SECURITY finding S-5 on SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001',
      detail:
        'The TABLES_ABSENT pre-flight closes the largest window and is the right call. It does not close the rest: between a successful getToken and a successful upsert, storeTokens can fail on encryption, on WRITE_FAILED from writeRows, or on any transient Supabase error. FR-3 correctly makes that throw rather than swallow, but at that moment Google holds a live long-lived refresh token for gmail.modify that nothing in the repo records and nothing can revoke. This exact finding was raised as S-5 against the YouTube module and was never implemented, so generalizing that module carries it forward. The child also ships no revoke verb and no documented revoke step, so the chairman has no in-repo answer to "kill this grant now".',
      recommendation:
        'In runConsentFlow, wrap storeTokens: on failure POST the token to https://oauth2.googleapis.com/revoke before rethrowing, and include the manual fallback (https://myaccount.google.com/permissions) in the refusal text. Name revocation in the google-consent.mjs header runbook alongside re-consent.',
    },
    {
      id: 'S-7',
      severity: 'medium',
      status: 'authz_weaker_than_repo_precedent',
      title: '/api/michael behind requireAuth only exposes chairman credential state to every signed-in user',
      location: 'PRD FR-6; server/middleware/auth.js:52-89; server/index.js:252 and :267',
      detail:
        'requireAuth authenticates but does not authorize: it accepts ANY valid Supabase JWT for the project (verifyToken -> supabase.auth.getUser, no role check) or the internal API key. So the /oauth/status payload -- scopes, expires_at, last_refreshed_at, last_error, key_fingerprint -- is readable by every signed-in application user, and child E extends this same router with the chairman brief, which is materially more sensitive. The repo already has two stronger precedents on this exact mount table: /api/chairman uses requireAuth + createChairmanScopeGuard({ blocking: true }) (server/index.js:252) and the read-only admin dashboard uses requireAuth + requireAdminRole (server/index.js:267). requireAdminRole reads req.user.app_metadata.role, which is service-role-writable only, and short-circuits on req.isAdmin so the internal-API-key path still works (protocol-lint.js:48-59); it was hardened for precisely this defect class under SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001.',
      recommendation:
        'Mount app.use("/api/michael", requireAuth, requireAdminRole, michaelRoutes), importing requireAdminRole from server/routes/protocol-lint.js as server/index.js:68 already does. FR-6 grep-based acceptance (one mount line containing requireAuth) still passes unchanged; extend the mount-table assertion in server/routes/michael.test.js to require the admin gate too, so child E inherits it.',
    },
    {
      id: 'S-8',
      severity: 'low',
      status: 'guard_too_narrow',
      title: 'CI venue check is exact-string and the guard is not applied on the write path',
      location: 'PRD FR-2 (process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true")',
      detail:
        'GitHub Actions does set both to the literal string "true", so the guard works there. It misses CI=1, and other runners that merely set the variable -- a fail-open default for a guard whose whole purpose is to be a code invariant that survives environment changes. FR-2 also scopes the call to "before any decrypt and before the consent flow"; storeTokens encrypts and writes, and a hostile or misconfigured non-host process holding the key could overwrite the chairman row.',
      recommendation:
        'Refuse when GITHUB_ACTIONS is set to any non-empty value, or CI is set and its lowercased value is not one of "", "0", "false". Call assertHostVenue at the top of every exported entry point that touches the key, storeTokens included.',
    },
    {
      id: 'S-9',
      severity: 'low',
      status: 'spec_sanctioned_recorded_not_blocking',
      title: 'drive.readonly and calendar.readonly are granted at consent with no consumer in this child',
      location: 'PRD FR-2 SCOPES; docs/michael/02-SPEC.md section 4',
      detail:
        'The child implements exactly one consumer, the Gmail modify client. gmail.modify is correctly the narrowest scope for label-plus-archive and notably does NOT permit permanent deletion, which is the right least-privilege call. calendar.readonly and drive.readonly, however, grant read of every calendar and the entire Drive from the moment of consent, enlarging the blast radius of the single stored refresh token before anything uses them. Spec section 4 explicitly mandates all three at v1 "for the Tasks bridge", so this is sanctioned and NOT a blocker -- recorded so it is a decision on the record rather than an unexamined default.',
      recommendation:
        'Record in the PRD which child consumes each scope. Note that adding the youtube scope at v1.1 forces a fresh consent anyway, so deferring drive.readonly to the child that first reads Drive would cost nothing extra under the seven-day re-consent posture.',
    },
    {
      id: 'S-10',
      severity: 'low',
      status: 'hygiene',
      title: 'Logging and test-fixture hygiene are unspecified around the two places secrets can leak',
      location: 'PRD FR-3 (decrypt failure "logs a warning") and FR-4 (browser open / callback server); TS-2 fixture shape',
      detail:
        'Two concrete leak surfaces. (a) The callback handler receives req.url carrying the authorization code; the precedent does not log it, but nothing in the PRD forbids adding a debug line, and an authorization code in a terminal scrollback or a captured CI log is a live credential for its lifetime. (b) The precedent prints the full auth URL to stdout, which carries the client_id -- acceptable and needed for the manual-open fallback, worth being deliberate about. On fixtures: TS-2 specifies ya29./1// prefixed values, which matches the existing oauth-manager.test.js precedent, and there is no gitleaks or detect-secrets workflow in this repo, so there is no gate risk today; the concern is only that a future scanner or GitHub push protection would fire on the diff.',
      recommendation:
        'State in FR-3/FR-4 that req.url, the authorization code, the token object and encrypted_blob are never logged, and assert it in a test that spies console. Use unmistakably synthetic fixtures (ya29.FAKE-TEST-TOKEN-DO-NOT-USE, 1//FAKE-TEST-REFRESH-DO-NOT-USE) so a scanner never has to be triaged.',
    },
    {
      id: 'S-11',
      severity: 'informational',
      status: 'verified_clean',
      title: 'Verified: DB lockdown, GHA cleanliness and the refuse-never-generate rationale all hold as the PRD claims',
      location: 'database/migrations/20260906_michael_tables.sql:306-310 and :416-427; .github/workflows/; .gitignore:4-7,49-50; lib/security/encryption.cjs:33-54,116',
      detail:
        'Measured, not inferred. (1) michael_credentials: ENABLE ROW LEVEL SECURITY, exactly one policy FOR ALL TO service_role, REVOKE ALL FROM anon, authenticated, PUBLIC, GRANT ALL TO service_role, plus an in-migration DO block that asserts no non-service TABLE grant and no non-service COLUMN grant exists on each michael_ table -- so the ciphertext is not reachable by anon or authenticated even before encryption is considered. (2) grep of .github/workflows for MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET returns zero hits today, so the FR-2 acceptance criterion currently holds and the ratification ff4ef5b4 / 0daf3bd8 invariant is intact. (3) .env, .env.* and .leo-keys (plus .leo-keys.backup*) are gitignored. (4) The refuse-never-generate decision is justified exactly as TR-1 states: encryption.cjs:33 is a bare catch on fs.access + readFile + JSON.parse that unconditionally mints a new random key and writes it over the path, and encryption.cjs:116 takes _metadata and ignores it, so a wrong key is indistinguishable from corruption without the fingerprint. Both readings confirm the PRD; they are not restated from it.',
      recommendation: 'No action. Recorded so a later reviewer does not re-measure.',
    },
  ],
  warnings: [
    'S-1 will turn main red on the first PR carrying this child unless the env seam is specified before EXEC; the tempting repair weakens the very invariant TR-3 creates.',
    'S-2: the consent flow is the one place the design copies a precedent wholesale rather than improving it, and the scope it now carries (gmail.modify on the chairman mailbox) is materially larger than the precedent it inherits from.',
    'S-7: child E extends this same router with the chairman brief, so the authorization decision made here is inherited by more sensitive data later.',
  ],
  recommendations: [
    'CONDITIONAL_PASS. Amend the PRD with S-1 (injectable env seam plus a no-bypass source assertion) and S-2 (state nonce, PKCE, loopback-only bind) before EXEC begins; both are additive and neither changes the architecture.',
    'Fold S-3 (discriminated refusal), S-4 (null fingerprint fails closed), S-5 (known-answer fingerprint vector, domain separation) and S-6 (revoke on persist failure) into FR-2/FR-3/FR-4 as acceptance criteria rather than tracking them separately.',
    'Change the FR-6 mount to requireAuth + requireAdminRole to match the repo precedent for chairman-scope and admin-read data (S-7), and extend the mount-table test to assert both.',
    'Keep the design decisions that are already right: refuse-never-generate, ciphertext-only whole-object storage, fingerprint-before-decrypt, TABLES_ABSENT pre-flight before the browser opens, no DDL in this child, and import-time purity.',
  ],
  validation_mode: 'prospective',
  metadata: {
    recorded_by: 'security-agent (Task tool dispatch, PLAN phase)',
    assessment_type: 'plan_phase_design_review',
    reviewed_artifact: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (product_requirements_v2, status approved, phase planning)',
    branch: 'main',
    no_code_exists_yet: true,
    files_read_in_full: [
      'lib/security/encryption.cjs',
      'lib/integrations/youtube/oauth-manager.js',
      'lib/michael/db.mjs',
      'server/middleware/auth.js',
      'scripts/michael/gmail-act.mjs (1-90)',
      'server/index.js (225-295, the requireAuth mount block)',
      'database/migrations/20260906_michael_tables.sql (michael_credentials 290-312 and the verification DO block 340-427)',
      'docs/michael/02-SPEC.md section 4',
      'server/routes/protocol-lint.js (getSupabase + requireAdminRole)',
      '.github/workflows/unit-tier.yml',
      'vitest.config.js (unit project include/env, 270-310)',
    ],
    measurements: {
      workflow_secret_grep: 'zero hits for MICHAEL_ENCRYPTION_KEY | GOOGLE_CLIENT_ID | GOOGLE_CLIENT_SECRET across .github/workflows/',
      michael_credentials_rls: 'ENABLE ROW LEVEL SECURITY + single FOR ALL TO service_role policy + REVOKE ALL FROM anon,authenticated,PUBLIC + GRANT ALL TO service_role + in-migration non-service table AND column grant assertions',
      gitignore: '.env, .env.*, .leo-keys, .leo-keys.backup* all ignored',
      encryption_getMasterKey: 'encryption.cjs:33 bare catch mints and overwrites a new random 32-byte key on ANY read error',
      encryption_decrypt_metadata: 'encryption.cjs:116 signature is decrypt(encryptedData, _metadata = {}) -- argument ignored',
      requireAuth_authz: 'server/middleware/auth.js:52-89 authenticates any project JWT; no role check; req.isAdmin only via INTERNAL_API_KEY',
      ci_env_in_gha: 'GitHub Actions sets CI=true and GITHUB_ACTIONS=true; vitest.config.js unit-project env block does not clear either',
      oauth_precedent_listener: 'oauth-manager.js:214 server.listen(REDIRECT_PORT) with no host argument (binds all interfaces); generateAuthUrl at :171-175 passes no state and no PKCE challenge',
      secret_scanner_gates: 'no gitleaks / detect-secrets workflow present; ya29. fixtures already exist in lib/integrations/youtube/oauth-manager.test.js',
    },
    conditions_for_pass: ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7'],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, { phase: 'PLAN' });
console.log('STORED_ROW_ID=' + (stored?.id || JSON.stringify(stored)));
console.log('VERDICT=' + (stored?.verdict || results.verdict));
console.log('PHASE=' + (stored?.phase || 'PLAN'));
console.log('CONTENT_HASH=' + (stored?.metadata?.content_hash || 'MISSING'));
console.log('SESSION_ID=' + (stored?.metadata?.session_id || 'MISSING'));
console.log('EVAL_SHA=' + (stored?.metadata?.evaluated_commit_sha || 'MISSING'));
console.log('REPO_PATH=' + (stored?.metadata?.repo_path || 'MISSING'));
console.log('EXEC_CWD=' + (stored?.metadata?.executed_from_cwd || 'MISSING'));
