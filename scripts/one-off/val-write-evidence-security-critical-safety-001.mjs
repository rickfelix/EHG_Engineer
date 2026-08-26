import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';
const supabase = await getSupabaseClient();

const summary = [
  'Independently re-verified the completed remediation rather than accepting the SD narrative.',
  'The three load-bearing security claims are TRUE:',
  '(1) live row 5ea38ba3 source_metadata is literally {} - no legacy tokens key, no encrypted_tokens, no ya29. or 1//0 substring;',
  'a census of ALL 5 eva_sync_state rows returns zero provider-token-shape hits, and the PostgREST OpenAPI spec confirms',
  'eva_sync_state.source_metadata is the ONLY source_metadata column across 1044 tables, so that census is complete by construction.',
  '(2) oauth-manager.js genuinely routes through lib/security/encryption.cjs (real AES-256-GCM: 64B random salt, 16B IV,',
  'PBKDF2-SHA256 100k iterations, auth tag verified on decrypt) - not a no-op or partial change; getStoredTokens reads ONLY',
  'source_metadata.encrypted_tokens and requires vault?.encrypted, so a legacy-plaintext-only row correctly yields null.',
  '(3) 6/6 tests pass on my own run, and the never-writes-plaintext test genuinely inspects the WRITTEN payload via an update',
  'spy (not a return value), with encryption.cjs deliberately NOT mocked so the round-trip exercises real crypto.',
  'No token leakage in git (git log --all -p -S ya29. returns zero commits), .env and .leo-keys are both gitignored and were',
  'never tracked, the remediation scripts do not echo token values, and an anon-key probe returns 0 rows (RLS enforced).',
  'CONDITIONAL because three SD statements are contradicted or unevidenced by measurement (F1/F2/F5) - all narrative-accuracy',
  'defects, none of which reopens the exposure.',
].join(' ');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary,
  findings: [
    {
      id: 'F1',
      severity: 'medium',
      title: '.leo-keys is mode 644, not 0600 as the SD asserts',
      detail: 'SD risks[1] mitigation states the master key lives in a ".leo-keys file (0o600, gitignored)". Measured stat -c %a .leo-keys = 644. encryption.cjs does pass {mode: 0o600} to fs.writeFile, but that is not honoured on this Windows/NTFS host. Gitignored is TRUE (.gitignore:49, never tracked); 0600 is FALSE. The AES master key that protects all FUTURE YouTube tokens is world-readable on disk.',
      evidence: 'stat -c %a .leo-keys -> 644; git check-ignore -v .leo-keys -> .gitignore:49; lib/security/encryption.cjs:44-48',
    },
    {
      id: 'F2',
      severity: 'medium',
      title: 'appId namespacing is cosmetic, not cryptographic - the SD overstates it',
      detail: 'lib/security/encryption.cjs#decrypt(encryptedData, _metadata = {}) IGNORES the metadata argument entirely (note the underscore-prefixed param name). appId is written into metadata as a label only and never enters deriveKey() - the salt is random per-encrypt and the key derives from the master key alone. TOKEN_VAULT_APP_ID therefore provides ZERO domain separation from BANK_READ_APP_ID; any caller of this module can decrypt any other caller ciphertext. SD metadata.mechanism_verifications[2] describes this as "the app-id-namespaced encrypt/decrypt pattern", which implies an isolation boundary that does not exist. Pre-existing module behaviour, not a regression introduced by this SD.',
      evidence: 'lib/security/encryption.cjs:116 (decrypt signature), :60-62 (deriveKey uses masterKey+salt only), :67-107 (appId only lands in metadata)',
    },
    {
      id: 'F5',
      severity: 'medium',
      title: 'Revocation is stated as an accomplished action, but the archived evidence shows the token was ALREADY dead',
      detail: 'SD key_changes[0] states "Revoked the live-exposed Google OAuth refresh_token ... provider-side via oauth2.googleapis.com/revoke". But metadata.pre_purge_evidence.revocation_evidence.revoke_endpoint_response = "invalid_token (already dead)" - the revoke call did NOT revoke anything, it reported there was nothing to revoke. Combined with the SD own risks[0] (refresh_token_expires_in 5201s, row last updated 2026-07-24, over a month before remediation), the likeliest truth is natural expiry weeks earlier and a no-op revoke. The end state (credential unusable) is confirmed twice over, so this is narrative accuracy rather than a security gap - but key_changes claims an action the evidence contradicts. Separately, success_criteria[4] "PROVIDER-SIDE VERIFICATION: third-party-access state confirmed clean" has no recorded artifact: neither a myaccount.google.com/connections look nor an API-side grant listing was performed.',
      evidence: 'SD metadata.pre_purge_evidence.revocation_evidence vs SD key_changes[0]; SD risks[0] self-admission',
    },
    {
      id: 'F3',
      severity: 'low',
      title: 'Sibling-exposure census is asserted in success_criteria but not evidenced in SD metadata',
      detail: 'success_criteria[1] requires purge of "row 5ea38ba3 and any sibling rows found by a key-name census across source_metadata". metadata.pre_purge_evidence documents ONLY the single row - there is no census artifact recording which tables, rows, or key names were scanned. I had to run the census myself to confirm the claim. The underlying fact IS true (5/5 eva_sync_state rows clean; only 1 source_metadata column schema-wide out of 1044 PostgREST-visible tables), so the criterion is materially met - but as shipped it is an assertion a reviewer must independently reproduce, not evidence.',
      evidence: 'SD metadata.pre_purge_evidence contains row_id/token_shape_redacted only, no census key; my census: 5 rows, 0 hits',
    },
    {
      id: 'F4',
      severity: 'low',
      title: 'Master key is worktree-local and auto-regenerates silently; encrypt path never exercised against the live row',
      detail: 'encryption.cjs keyPath resolves to <repo-root>/.leo-keys. It exists ONLY in this worktree (created today at 11:01, i.e. generated during this SD own work by the first encrypt call); the main repo checkout has no .leo-keys. getMasterKey() SILENTLY generates a fresh key on miss rather than failing loudly. Consequence: tokens encrypted here are undecryptable from main, another worktree, or CI, degrading to silent re-auth. Harmless today because zero encrypted tokens exist (row is {}), but it also means the encrypt-at-rest write path has only ever run against fixtures, never against the live row. success_criteria[2] asks for "a fixture write+read roundtrip that shows ciphertext in the column", which the test does satisfy as written.',
      evidence: 'lib/security/encryption.cjs:20 (keyPath), :26-55 (silent auto-generate); .leo-keys present in worktree, absent at ../../.leo-keys',
    },
    {
      id: 'F8',
      severity: 'low',
      title: 'storeTokens discards the Supabase update/insert error - a failed encrypted write is silent',
      detail: 'oauth-manager.js:104-117 awaits .update() and .insert() but never destructures or checks { error }. If the write fails (RLS, network, constraint), storeTokens resolves normally and the caller believes tokens were persisted; the next getStoredTokens returns null and the user is bounced to re-auth with no diagnostic. The fail-soft direction is safe, but the silence costs debuggability. Not covered by the 6 tests, because both mock spies return { error: null } unconditionally.',
      evidence: 'lib/integrations/youtube/oauth-manager.js:104-117; test mock createMockSupabase returns { error: null } unconditionally',
    },
    {
      id: 'F6',
      severity: 'info',
      title: 'Same exposure CLASS still exists outside this SD scope: plaintext Google refresh token in .env',
      detail: '.env line 176 holds GOOGLE_CHAIRMAN_DRIVE_REFRESH_TOKEN with a live-shaped 1//0-prefixed value - a different credential of exactly the class this SD remediated (long-lived Google refresh token, plaintext at rest). .env IS gitignored (.gitignore:4) and has never been committed (git log --all -- .env is empty), so this is conventional secret handling and NOT an exposure. Recorded only so the "class eliminated" framing is not over-read: this SD closed one row, not the class.',
      evidence: 'grep .env:176; git check-ignore -v .env -> .gitignore:4; git log --all --oneline -- .env -> empty',
    },
    {
      id: 'F7',
      severity: 'info',
      title: 'Upstream urgency framing rested on a stale anon-exposure claim I could not reproduce',
      detail: 'scripts/one-off/insert-user-stories-ideation-ingestion-connectors-001.mjs:281 asserts the plaintext token was "reachable right now by any authenticated user - SECURITY confirmed it with a live anon-key HTTP GET returning 200". My independent anon-key probe of eva_sync_state returns HTTP 200 with 0 rows - RLS filters the table. That earlier claim appears to have conflated a 200 status code with data exposure (PostgREST returns 200 plus an empty array for an RLS-filtered read). This does not change the remediation value, but the actively-leaking-to-the-public framing it fed was likely overstated.',
      evidence: 'scripts/one-off/val-anon-rls-probe-eva-sync-state.mjs -> status 200, rows 0, error none',
    },
    {
      id: 'F9',
      severity: 'info',
      title: 'POSITIVE: test quality holds up to the adversarial question asked of it',
      detail: 'I checked specifically whether the never-writes-plaintext test inspects the written payload or merely a return value. It genuinely inspects the payload: createMockSupabase updateSpy captures { source_metadata } into the row, and the assertion runs JSON.stringify(stored.source_metadata) against the literal TOKENS.access_token and refresh_token values, plus asserts encrypted_tokens.encrypted is a String and source_metadata.tokens is undefined. encryption.cjs is deliberately NOT mocked, so the round-trip test (expect(roundTripped).toEqual(TOKENS)) exercises real AES-256-GCM end to end. Test 6 directly covers the legacy-plaintext-only row returning null, which was the specific regression I was asked to probe. 6/6 passed on my own run in 316ms.',
      evidence: 'lib/integrations/youtube/oauth-manager.test.js:42-57, :73-83, :103-110; npx vitest run -> 6 passed (6)',
    },
  ],
  warnings: [
    'SD key_changes[0] asserts a provider-side revocation that its own archived evidence (invalid_token = already dead) does not support. Correct the wording before LEAD final approval so the durable record is not a false positive a future audit inherits.',
    'The 0o600 claim in risks[1] is false as measured on this Windows host (644). Any future reader trusting that line will believe the master key is owner-only when it is world-readable.',
    'Zero encrypted tokens exist in production today (row is {}), so the encrypt-at-rest path is fixture-proven only. The first real proof arrives on the next actual OAuth run of npm run eva:ideas:auth:youtube.',
  ],
  recommendations: [
    'Correct SD key_changes[0] to state what the evidence shows: attempted provider-side revoke; endpoint returned invalid_token confirming the token was already dead, independently corroborated by an invalid_grant refresh-exchange attempt. This preserves the true end state without claiming an action that did not occur.',
    'Correct metadata.mechanism_verifications[2]: note that appId is a LABEL in this module, not a cryptographic boundary (decrypt ignores metadata), so no domain separation should be inferred between TOKEN_VAULT_APP_ID and BANK_READ_APP_ID.',
    'Either fix risks[1] to read "0600 requested but not enforced on Windows/NTFS - observed 644", or chmod the file and re-measure. Do not leave an unverified permission claim in the durable record.',
    'Write the census result into metadata (tables scanned = eva_sync_state only, justified by it being the sole source_metadata column across 1044 PostgREST-visible tables; rows scanned = 5; provider-token-shape hits = 0) so success_criteria[1] is evidenced rather than merely re-derivable.',
    'Add { error } checking to the storeTokens update/insert path (F8) plus one test where the mock returns an error, so a failed encrypted write is loud rather than silent.',
    'Optional follow-up SD (explicitly out of this scope): the same credential class persists unencrypted in .env (GOOGLE_CHAIRMAN_DRIVE_REFRESH_TOKEN). Gitignored and uncommitted, so low risk, but it is the remaining instance of the pattern this SD set out to eliminate.',
  ],
  validation_mode: 'retrospective',
  metadata: {
    recorded_by: 'validation-agent (Task tool dispatch)',
    assessment_type: 'lead_phase_due_diligence',
    sd_key: SD_KEY,
    independently_reproduced: [
      'eva_sync_state row 5ea38ba3 source_metadata === {} (no tokens key, no encrypted_tokens, no ya29. or 1//0 substring)',
      'full eva_sync_state census: 5 rows, 0 provider-token-shape hits',
      'PostgREST OpenAPI: eva_sync_state.source_metadata is the only source_metadata column across 1044 tables (census complete by construction)',
      'sibling credential columns (uat_credentials.credentials, marketing_channels.credentials, uat_credential_history.old_credentials, venture_distribution_channels.credential_ref, uat_test_users.password) -> 0 provider-token-shape hits',
      'npx vitest run lib/integrations/youtube/oauth-manager.test.js -> 6 passed / 6',
      'live getStoredTokens() -> null; live getAuthenticatedClient() -> documented No stored tokens error (success_criteria[3] genuinely met)',
      'git log --all -p -S ya29. -> zero commits; .env and .leo-keys gitignored and never tracked',
      'anon-key read of eva_sync_state -> HTTP 200, 0 rows (RLS enforced)',
      'remediation one-off scripts audited: no console output echoes token values',
    ],
    gates_assessed: {
      gate1_lead_pre_approval: 'PASS (no duplicate implementation; correctly reuses existing encryption.cjs rather than new bespoke crypto - token-vault.js precedent confirmed)',
      gate4_plan_verification: 'CONDITIONAL (delivery matches scope; narrative-accuracy corrections F1/F2/F5 required before the durable record is trustworthy)',
    },
    verification_scripts: [
      'scripts/one-off/val-verify-eva-sync-state-tokens.mjs',
      'scripts/one-off/val-anon-rls-probe-eva-sync-state.mjs',
      'scripts/one-off/val-openapi-census.mjs',
      'scripts/one-off/val-sibling-cred-columns.mjs',
      'scripts/one-off/val-live-reauth-check.mjs',
    ],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD_TO_PLAN' });
console.log('Stored VALIDATION evidence id:', stored.id);
console.log('verdict:', results.verdict, '| confidence:', results.confidence, '| findings:', results.findings.length);
console.log('repo_path:', results.metadata?.repo_path);
console.log('executed_from_cwd:', results.metadata?.executed_from_cwd);
