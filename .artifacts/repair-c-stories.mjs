import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { validateUserStoryQuality } from '../scripts/modules/user-story-quality-validation.js';
dotenv.config();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '591400cf-7b88-4974-832a-6043e4f59152';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';

const REFUSALS = [
  '**Refusal codes this story must honour** (exit 2 / named Error code, never a bare throw):',
  '- `MICHAEL_ENCRYPTION_KEY_MISSING` - process.env.MICHAEL_ENCRYPTION_KEY absent. Sibling `MICHAEL_ENCRYPTION_KEY_INVALID` for a value that is not exactly 64 hex chars.',
  "- `HOST_VENUE_REQUIRED` - GITHUB_ACTIONS === 'true' or CI === 'true'; raised by assertHostVenue() before any decrypt and before consent.",
  '- `TABLES_ABSENT` - michael_credentials relation missing (PostgREST PGRST205 / Postgres 42P01), surfaced by lib/michael/db.mjs readRows/writeRows, never a client throw.',
  '- `KEY_FINGERPRINT_MISMATCH` - stored key_fingerprint differs from keyFingerprint(currentKey); returned BEFORE enc.decrypt is called.'
].join('\n');

const FILES = [
  '**Files in play**',
  '- lib/security/encryption.cjs (existing AES-256-GCM + PBKDF2 module; line 247 singleton export)',
  '- lib/integrations/google/chairman-oauth.js (new: HostKeyEncryption, keyFingerprint, assertHostVenue, createOAuth2Client, getStoredTokens, storeTokens, getAuthenticatedClient, runConsentFlow)',
  '- scripts/michael/google-consent.mjs (new CLI: default action + --status + --json)',
  '- lib/michael/gmail-client.mjs (new: modifyThread)',
  '- server/routes/michael.js + the server/index.js mount (new route, requireAuth block at server/index.js:243-270)',
  '- lib/michael/db.mjs (readRows/writeRows/refusal/emit/parseArgs - the TABLES_ABSENT contract)',
  '- Precedent to mirror: lib/integrations/youtube/oauth-manager.js and lib/integrations/youtube/oauth-manager.test.js'
].join('\n');

const TESTING = [
  '**Testing**',
  'Tests are *.test.js (NOT .test.mjs - vitest.config.js:288-303 collects **/*.test.js only) under lib/integrations/google/, lib/michael/ and server/routes/. Inject sb/enc/gmailFactory; at least one case uses the real AES-256-GCM path with an aes-256-gcm algorithm pin.'
].join('\n');

const VENUE = [
  '**Venue invariant**',
  "This code runs on the chairman's Windows host only. MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET live in the host .env and must never appear in .github/workflows/."
].join('\n');

function ctx(specific) {
  return ['## Implementation Context', '', specific, '', FILES, '', REFUSALS, '', TESTING, '', VENUE].join('\n');
}

const stories = [
  {
    n: 1,
    fr: 'FR-1',
    title: 'Export the CredentialEncryption class so a host-bound key source can subclass it',
    user_role: 'DevOps engineer maintaining the shared credential-encryption module',
    user_want: 'lib/security/encryption.cjs to additionally export the CredentialEncryption class alongside its existing singleton default, with no behavioural change to any current consumer',
    user_benefit: 'So that a host-only subclass can override getMasterKey to bind its own key source without duplicating a single line of the audited AES-256-GCM or PBKDF2 code, and the three existing consumers keep working byte-for-byte.',
    story_points: 1,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Named class export resolves from ESM', given: 'lib/security/encryption.cjs has module.exports.CredentialEncryption appended after the singleton export at line 247', when: "an ESM module runs import { CredentialEncryption } from '../../security/encryption.cjs'", then: 'the binding is the class constructor, and the default import is still the singleton instance' },
      { scenario: 'Existing consumers are unchanged', given: 'lib/operator/cash-sources/token-vault.js:21, lib/integrations/youtube/oauth-manager.js:24 and lib/cleanup/credentials.js:14 import the default', when: 'lib/integrations/youtube/oauth-manager.test.js and the lib/security tests run', then: 'every test stays green with no change to any consumer file' },
      { scenario: 'The change is one line plus its comment', given: 'the EXEC diff for this story', when: 'git diff lib/security/encryption.cjs is inspected', then: 'it contains exactly one appended export line and its explanatory comment, and no edit to the encrypt, decrypt, getMasterKey or PBKDF2 bodies' },
      { scenario: 'Key source is overridable through inheritance', given: 'a subclass overriding getMasterKey()', when: 'encrypt and decrypt are exercised', then: 'both route through this.getMasterKey (measured by VALIDATION b4ed3c2c), so the override binds the key source for both directions' }
    ],
    context: [
      'Append `module.exports.CredentialEncryption = CredentialEncryption` after the existing singleton export at lib/security/encryption.cjs:247. This is a purely additive export. The default export stays the singleton so lib/operator/cash-sources/token-vault.js:21, lib/integrations/youtube/oauth-manager.js:24 and lib/cleanup/credentials.js:14 are untouched.',
      '',
      'VALIDATION b4ed3c2c measured that encrypt and decrypt both route through this.getMasterKey, which is why subclassing (rather than copying the cipher code) is the correct seam for the HostKeyEncryption class in FR-2.'
    ].join('\n')
  },
  {
    n: 2,
    fr: 'FR-2',
    title: 'Bind the master key to MICHAEL_ENCRYPTION_KEY only, with a host-venue guard and a key fingerprint',
    user_role: 'EHG Chairman acting as host operator',
    user_want: 'the Google chairman OAuth module to take its master key exclusively from the host .env MICHAEL_ENCRYPTION_KEY, refuse to run in CI, and stamp a non-secret fingerprint of that key',
    user_benefit: 'So that my Google refresh token can never be encrypted under a silently self-generated throwaway key that makes it unrecoverable, and a wrong or rotated host key is diagnosable in one line instead of looking like ciphertext corruption.',
    story_points: 5,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Missing host key refuses before any database write', given: 'MICHAEL_ENCRYPTION_KEY is unset and an injected Supabase client carries write spies', when: 'getStoredTokens, storeTokens or runConsentFlow is called', then: 'each rejects with code MICHAEL_ENCRYPTION_KEY_MISSING and no write spy was ever called' },
      { scenario: 'Malformed host key is a distinct named refusal', given: 'MICHAEL_ENCRYPTION_KEY is 63 characters long or contains a non-hex character', when: 'getMasterKey runs', then: 'it throws code MICHAEL_ENCRYPTION_KEY_INVALID, never falls back to .leo-keys, and never generates a key' },
      { scenario: 'Fingerprint is the first 16 hex of sha256 over the raw key bytes', given: 'a valid 64-hex MICHAEL_ENCRYPTION_KEY', when: "keyFingerprint(Buffer.from(hex, 'hex')) is computed", then: 'it equals the first 16 hex characters of sha256 over the 32 raw key bytes and leaks nothing about the key itself' },
      { scenario: 'CI venue is refused before any decrypt', given: 'GITHUB_ACTIONS=true (or CI=true) in the environment', when: 'assertHostVenue() runs ahead of any decrypt and ahead of the consent flow', then: 'it throws code HOST_VENUE_REQUIRED, and a grep of .github/workflows for MICHAEL_ENCRYPTION_KEY, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET returns nothing' },
      { scenario: 'Nothing executes at import time', given: 'a process with no Google or Michael environment variables set', when: 'lib/integrations/google/chairman-oauth.js is imported', then: 'the import resolves without reading env, constructing a client or touching the network' }
    ],
    context: [
      'class HostKeyEncryption extends CredentialEncryption overrides getMasterKey() to read process.env.MICHAEL_ENCRYPTION_KEY, accept exactly 64 hex characters, and return Buffer.from(hex, \'hex\'). It never calls the inherited self-generating method and never touches .leo-keys (TR-1). VALIDATION b4ed3c2c measured the stock module generating a different throwaway key on a missing key file and then failing GCM authentication on read-back, which would encrypt the chairman refresh token unrecoverably while reporting success.',
      '',
      'Also export keyFingerprint(keyBuffer) = sha256(rawKeyBytes).hex.slice(0,16) (TR-4: decrypt ignores its metadata argument, so without a fingerprint a wrong key is indistinguishable from corruption) and assertHostVenue() (TR-3).',
      '',
      "Constants: SCOPES = ['https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/calendar.readonly','https://www.googleapis.com/auth/drive.readonly'] (youtube deferred to v1.1), REDIRECT_PORT 3456, REDIRECT_URI http://localhost:3456/oauth2callback, CREDENTIAL_IDENTIFIER 'google_chairman_oauth', TOKEN_VAULT_APP_ID 'michael-google-chairman-oauth' (an operational label, not a domain separator - oauth-manager.js:34-40). createOAuth2Client() mirrors oauth-manager.js:47-59 on GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from the host .env."
    ].join('\n')
  },
  {
    n: 3,
    fr: 'FR-3',
    title: 'Read and write michael_credentials as ciphertext only, writing the gauge predicates as columns',
    user_role: 'Michael feeder running unattended under Windows Task Scheduler',
    user_want: 'token storage, retrieval and refresh to persist only an encrypted blob plus non-secret columns, and to record invalid_grant and expiry on the row',
    user_benefit: 'So that a database read can never yield a usable token, and the health gauge can tell whether the chairman grant is dying without any component having to decrypt anything.',
    story_points: 8,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'Every write is ciphertext with no token property as a column', given: 'a 64-hex MICHAEL_ENCRYPTION_KEY and a token fixture with ya29. and 1// prefixed values, using the real encryption.cjs AES-256-GCM path', when: 'storeTokens(tokens, { sb, enc }) upserts by identifier google_chairman_oauth', then: 'the payload carries encrypted_blob, encryption_metadata (algorithm aes-256-gcm), key_fingerprint, scopes, expires_at, last_refreshed_at and last_error null, has no key named access_token, refresh_token, id_token or expiry_date, and its serialization contains neither fixture token string' },
      { scenario: 'Fingerprint mismatch refuses before decrypt', given: 'a stored row whose key_fingerprint is deadbeefdeadbeef while the current key fingerprints differently, plus an enc spy', when: 'getStoredTokens({ sb, enc }) runs', then: "it returns { error: 'KEY_FINGERPRINT_MISMATCH' } and enc.decrypt was never called" },
      { scenario: 'invalid_grant is recorded for the health gauge', given: 'a stored expired token and an OAuth2 client whose refreshAccessToken rejects with an invalid_grant error', when: 'getAuthenticatedClient({ sb, enc }) runs', then: "the row is updated with last_error='invalid_grant', the encrypted blob is left in place, and the call rethrows" },
      { scenario: 'Successful refresh updates expiry', given: 'a stored token whose expiry_date has passed and a client whose refresh resolves with a new expiry_date', when: 'getAuthenticatedClient runs', then: 'storeTokens is called with the refreshed credentials and the row gets a new expires_at, a new last_refreshed_at and last_error null' },
      { scenario: 'A missing table is a refusal, not a throw', given: 'the child B migration is unapplied so michael_credentials does not exist', when: 'getStoredTokens reads through the lib/michael/db.mjs readRows helper', then: 'TABLES_ABSENT surfaces as a refusal object and getStoredTokens returns null rather than throwing; a genuine decrypt failure logs a warning and also returns null, per the oauth-manager.js:83-88 contract' }
    ],
    context: [
      'getStoredTokens({ sb, enc }) selects encrypted_blob, encryption_metadata, key_fingerprint, expires_at and last_error for identifier=google_chairman_oauth via readRows from lib/michael/db.mjs. Order matters: compare key_fingerprint and return KEY_FINGERPRINT_MISMATCH BEFORE attempting decrypt.',
      '',
      'storeTokens encrypts the whole token object with enc.encrypt(tokens, TOKEN_VAULT_APP_ID) and upserts by identifier. No property of the token object is ever written as a column. A failed persist throws (oauth-manager.js:123, rationale F8).',
      '',
      "getAuthenticatedClient({ sb, enc, forceReauth }) sets credentials, refreshes when expiry_date has passed, and stores the refreshed credentials. On invalid_grant it writes last_error='invalid_grant' (leaving the blob) and rethrows - this is what makes the spec section 9 predicate (last_error = 'invalid_grant' OR expires_at < now() + 48h) satisfiable by child G with no further writes."
    ].join('\n')
  },
  {
    n: 4,
    fr: 'FR-4',
    title: 'Make google-consent.mjs the one-command re-consent runbook that refuses before opening a browser',
    user_role: 'EHG Chairman acting as host operator',
    user_want: 'a single command on my own machine that walks me through the Google consent screen, and that refuses up front whenever it could not record the result',
    user_benefit: 'So that re-consenting under the seven-day posture is one command with no runbook archaeology, and a grant I give is never burned on a store that cannot keep it.',
    story_points: 5,
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'Missing host key refuses without opening a browser', given: 'MICHAEL_ENCRYPTION_KEY is empty in the environment', when: 'node scripts/michael/google-consent.mjs --status --json runs', then: 'it exits 2 with code MICHAEL_ENCRYPTION_KEY_MISSING, emits exactly one JSON object, and opens no browser' },
      { scenario: 'CI venue refuses before any Google call', given: 'GITHUB_ACTIONS=true', when: 'node scripts/michael/google-consent.mjs --json runs', then: 'it exits 2 with code HOST_VENUE_REQUIRED before generateAuthUrl or any other Google call' },
      { scenario: 'An unrecordable store refuses before the auth URL is generated', given: 'an injected Supabase client returning 42P01 for michael_credentials and a generateAuthUrl spy', when: 'the default action runs', then: 'it exits 2 with code TABLES_ABSENT and generateAuthUrl was never called, so no chairman grant is burned into an unrecordable store' },
      { scenario: 'Status shows non-secret columns only', given: 'a stored credential row', when: 'the pure render function behind --status runs', then: 'the output contains identifier, scopes, expires_at, last_refreshed_at, last_error, key_fingerprint and hours_to_expiry, and contains no encrypted_blob or encryption_metadata key' },
      { scenario: 'Happy path completes the grant', given: 'a valid host key, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET present, a non-CI venue, and the michael_credentials table applied', when: 'the default action runs and the chairman approves in the browser', then: 'the localhost:3456/oauth2callback handler resolves on the code parameter, getToken then storeTokens persist the grant, and the process exits 0' }
    ],
    context: [
      'A CLI in the scripts/michael verb shape: lib/utils/is-main-module.js guard, plus parseArgs/refusal/emit from lib/michael/db.mjs. The default action is runConsentFlow in the oauth-manager.js:166-230 shape - generateAuthUrl with access_type offline, scope SCOPES and prompt consent; open the browser per platform; http.createServer on port 3456 resolving on the code parameter and rejecting on the error parameter; a 5-minute timeout; then getToken and storeTokens.',
      '',
      'Pre-flight order is load-bearing and runs before the auth URL is generated: assertHostVenue (HOST_VENUE_REQUIRED), then key present and valid (MICHAEL_ENCRYPTION_KEY_MISSING / MICHAEL_ENCRYPTION_KEY_INVALID), then GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET present (GOOGLE_CLIENT_MISSING), then a readRows probe of michael_credentials that refuses TABLES_ABSENT while the child B migration is unapplied. VALIDATION condition 2: a consent completed into an unrecordable store burns a chairman grant.',
      '',
      'Every refusal exits 2 with a code; success exits 0. The header comment states the runbook: re-consent under the seven-day posture (D4, 8e6ac764) is `node scripts/michael/google-consent.mjs` on the chairman host, and names the Task Scheduler precedent for child D (scripts/setup-alarm-cron-tasks.mjs plus scripts/cron/run-hidden.vbs), because the two paths named at spec line 105 do not exist.'
    ].join('\n')
  },
  {
    n: 5,
    fr: 'FR-5',
    title: 'Land the Gmail modify leg child B deferred, with zero work at import time',
    user_role: 'Michael feeder running unattended under Windows Task Scheduler',
    user_want: 'a gmail-client module exposing modifyThread over the chairman OAuth client that returns a result object instead of throwing, and does nothing at import',
    user_benefit: 'So that the gmail-act verb stops refusing GMAIL_CLIENT_ABSENT and can actually label and archive threads, and a misconfigured host still produces the designed exit-2 refusal instead of an opaque exit 1.',
    story_points: 3,
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'The gmail-act verb stops refusing', given: 'lib/michael/gmail-client.mjs exists and exports modifyThread', when: 'node scripts/michael/gmail-act.mjs --thread smoke --archive --dry-run --json runs', then: 'it prints dry_run true with would_call and no longer refuses GMAIL_CLIENT_ABSENT' },
      { scenario: 'modifyThread maps to the Gmail threads.modify call', given: 'an injected gmail factory that records calls', when: "modifyThread({ threadId: 't1', addLabelIds: ['L'], removeLabelIds: ['INBOX'] }) runs", then: "users.threads.modify is called with userId 'me', id 't1' and requestBody { addLabelIds: ['L'], removeLabelIds: ['INBOX'] }, and the return value is { ok: true, modified: { id, labelIds } }" },
      { scenario: 'Failures are returned, never thrown', given: 'an injected gmail factory whose call rejects, or an auth step that fails', when: 'modifyThread runs', then: 'it returns { ok: false, error: message } and does not throw' },
      { scenario: 'Import-time purity', given: 'a process with no Google or Michael environment variables set', when: 'lib/michael/gmail-client.mjs is imported', then: 'the import does not throw, reads no env, builds no client and makes no network call' }
    ],
    context: [
      "Export async function modifyThread({ threadId, addLabelIds = [], removeLabelIds = [] }, { auth, gmailFactory } = {}). It lazily obtains the chairman OAuth client via getAuthenticatedClient and calls google.gmail({ version: 'v1', auth }).users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds, removeLabelIds } }).",
      '',
      'The contract is exactly the one scripts/michael/gmail-act.mjs:5-8 and :66-68 already consume - child B fixed the consumer side and deferred this module.',
      '',
      'Import-time purity is a correctness requirement, not a style preference (TR-5): gmail-act.mjs:30-39 re-throws any import error that is not module-not-found, so an import-time throw here turns the designed exit-2 refusal into exit 1 (VALIDATION condition 3). Import only static dependencies; read no env and build no client at module load.'
    ].join('\n')
  },
  {
    n: 6,
    fr: 'FR-6',
    title: 'Expose GET /api/michael/oauth/status behind requireAuth, returning no token material',
    user_role: 'Child G health-gauge and child H dashboard consumer',
    user_want: 'a read-only status endpoint that reports the non-secret credential columns plus hours to expiry, mounted behind authentication',
    user_benefit: 'So that the OAuth health gauge and the chairman dashboard can see a dying grant without any consumer decrypting anything, and an unauthenticated caller learns nothing at all.',
    story_points: 3,
    priority: 'high',
    acceptance_criteria: [
      { scenario: 'The mount is authenticated and singular', given: 'server/index.js with the michael router imported', when: "grep -n \"'/api/michael'\" server/index.js runs", then: 'it shows exactly one mount, that same line contains requireAuth, and the mount sits inside the requireAuth block at server/index.js:243-270, ahead of the /api optionalAuth mount at line 272' },
      { scenario: 'Status returns non-secret columns only', given: 'a credential row exists and the caller is authenticated', when: 'GET /api/michael/oauth/status is served', then: 'the 200 payload carries identifier, scopes, expires_at, last_refreshed_at, last_error, key_fingerprint and a derived hours_to_expiry, has no encrypted_blob or encryption_metadata key, and the route never decrypts' },
      { scenario: 'Absent row and absent table are distinguishable', given: 'an authenticated caller', when: 'the row is missing, and separately when the relation is missing (PGRST205 / 42P01)', then: "the route returns 404 { code: 'NO_CREDENTIAL' } for the first case and 503 { code: 'TABLES_ABSENT' } for the second" },
      { scenario: 'The mount-table assertion the repo lacked', given: 'the new server/routes/michael.test.js', when: 'the test reads the server/index.js source', then: 'it asserts that the /api/michael mount line contains requireAuth, because the repo mount audit inspects mutating methods only and a GET-only route under optionalAuth would otherwise pass silently (VALIDATION condition 4)' },
      { scenario: 'Auth middleware is reused, not reimplemented', given: 'the EXEC diff', when: 'server/middleware/auth.test.js runs', then: 'it stays green, and requireAuth is imported from server/middleware/auth.js rather than re-implemented inside the route' }
    ],
    context: [
      'Create server/routes/michael.js exporting an express Router with GET /oauth/status. Use the service-role client in the server/routes/protocol-lint.js:27-31 getSupabase shape. Select identifier, scopes, expires_at, last_refreshed_at, last_error and key_fingerprint from michael_credentials, add hours_to_expiry, and never select encrypted_blob or encryption_metadata.',
      '',
      "Mount it in server/index.js as app.use('/api/michael', requireAuth, michaelRoutes) INSIDE the requireAuth block (server/index.js:243-270), before the /api optionalAuth mount at line 272.",
      '',
      'Child C creates this file; child E later extends it with the brief routes. Child G michael-oauth-health reads last_error and expires_at directly from the table, so this route serves child H dashboard and human inspection.'
    ].join('\n')
  },
  {
    n: 7,
    fr: 'FR-7',
    title: 'Ship zero DDL and produce a provenance-carrying SECURITY evidence row before EXEC-TO-PLAN',
    user_role: 'DevOps engineer shepherding the child through its EXEC-TO-PLAN gate',
    user_want: 'this child to contain no migration at all, and a SECURITY sub-agent row written by the canonical executor with producer, run id and content hash before the handoff',
    user_benefit: 'So that the chairman-gated michael_credentials migration stays the sole property of child B, and the completion gate reads evidence it did not author itself.',
    story_points: 2,
    priority: 'critical',
    acceptance_criteria: [
      { scenario: 'No migration ships in this child', given: 'the EXEC branch for this strategic directive', when: 'git diff --stat against main is inspected', then: 'no file under database/migrations/ appears, because michael_credentials with key_fingerprint is already declared at database/migrations/20260906_michael_tables.sql:292-310 (child B, chairman-gated) and pinned by tests/unit/migrations/michael-tables-migration-shape.test.js' },
      { scenario: 'SECURITY evidence exists with full provenance before the handoff', given: 'the EXEC diff is complete', when: 'the SECURITY sub-agent is invoked through the canonical executor', then: 'sub_agent_execution_results holds a SECURITY row for this SD with phase EXEC whose metadata carries non-null content_hash, session_id, sub_agent_version and evaluated_commit_sha, created before the EXEC-TO-PLAN handoff row (ratification 6c263823: producer, run id, content hash)' },
      { scenario: 'The security review scope is the named list', given: 'the SECURITY invocation for this child', when: 'the review runs', then: 'it explicitly covers no plaintext token column, key never auto-generated, GHA venue refusal, fingerprint compared before decrypt, /api/michael mounted under requireAuth, and no secret in logs or test fixtures' },
      { scenario: 'An oversized pull request carries its justification', given: 'five greenfield files plus tests exceed the 100 LOC target', when: 'the pull request is opened', then: 'the body states the exceedance with justification under the tiered PR size rule (max 400 LOC non-test)' }
    ],
    context: [
      'This story is the gate discipline of the child, not feature code. It ships ZERO DDL: michael_credentials (including key_fingerprint) is declared in database/migrations/20260906_michael_tables.sql:292-310 by child B, is chairman-gated, and was unapplied live at PLAN time - which is exactly why FR-3 and FR-4 must refuse TABLES_ABSENT rather than assume the table exists.',
      '',
      'Before EXEC-TO-PLAN, invoke the SECURITY sub-agent on the EXEC diff through the canonical executor (node scripts/execute-subagent.js --code SECURITY --sd-id <SD> --phase EXEC) so the row is written by storeSubAgentResults in lib/sub-agent-executor/results-storage.js together with applySubAgentRepoVerdict from lib/sub-agents/resolve-repo.js. Metadata then carries repo_path, executed_from_cwd, session_id, content_hash, sub_agent_version and evaluated_commit_sha. Never hand-write top-level path columns.'
    ].join('\n')
  }
];

let ok = 0;
for (const s of stories) {
  const story_key = `${SD_KEY}:US-${String(s.n).padStart(3, '0')}`;
  const row = {
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    story_points: s.story_points,
    priority: s.priority,
    status: 'ready',
    acceptance_criteria: s.acceptance_criteria,
    implementation_context: ctx(s.context),
    created_by: 'PLAN_LLM',
    technical_notes: JSON.stringify({
      generated_by: 'LLM',
      source_requirement_id: s.fr,
      original_criterion: s.title,
      gaps_detected: []
    })
  };

  let q = { score: 'n/a', valid: 'n/a', issues: [], warnings: [] };
  try {
    q = await validateUserStoryQuality({ story_key, ...row }, { sdType: 'infrastructure' });
  } catch (e) {
    console.log(`   quality check errored: ${e.message}`);
  }
  console.log(`${story_key} [${s.fr}] quality=${q.score} valid=${q.valid}`);
  (q.issues || []).forEach(i => console.log('   issue:', i));
  (q.warnings || []).forEach(w => console.log('   warn:', w));

  const { error } = await sb.from('user_stories').update(row).eq('story_key', story_key).eq('sd_id', SD_UUID);
  if (error) { console.log('   UPDATE FAILED:', error.message); continue; }
  ok++;
}
console.log(`\nUpdated ${ok}/7 stories`);
