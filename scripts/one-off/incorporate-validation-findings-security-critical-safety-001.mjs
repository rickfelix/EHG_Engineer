#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';

const key_changes = [
  {
    change: 'Confirmed the leaked Google OAuth refresh_token (eva_sync_state row 5ea38ba3) is dead: a revoke call against it returned invalid_token (VALIDATION correction -- this means the token was ALREADY invalid before the call, i.e. the revoke was a no-op, not an active revocation; likely natural expiry, since its own refresh_token_expires_in was ~1.4h and the row was over a month old). Independently re-confirmed via an actual refresh-grant exchange attempt (oauth2.googleapis.com/token), which returned invalid_grant -- the SD\'s own literal proof criterion.',
    impact: 'The leaked credential cannot be used to obtain YouTube API access. End state achieved, though the mechanism was natural expiry rather than this SD\'s revoke call actively terminating a live session.',
  },
  {
    change: 'Purged the plaintext access_token/refresh_token from eva_sync_state.source_metadata (row 5ea38ba3), after archiving a structure-only (values redacted, lengths/prefixes preserved) evidence snapshot to this SD\'s own metadata.pre_purge_evidence. Readback confirmed zero token-shaped strings remain in the row.',
    impact: 'Removes the at-rest plaintext exposure from the database entirely.',
  },
  {
    change: 'lib/integrations/youtube/oauth-manager.js#getStoredTokens/storeTokens now encrypt tokens at rest via the existing lib/security/encryption.cjs AES-256-GCM module (the same one lib/operator/cash-sources/token-vault.js already uses for a comparable long-lived-credential problem), under source_metadata.encrypted_tokens. The legacy plaintext source_metadata.tokens key is never written and is scrubbed from any row still carrying it on next write. storeTokens now throws on a DB write failure (VALIDATION finding F8: silently swallowing a persist error would leave a caller believing credentials were saved when they were not).',
    impact: 'Prevents this exact exposure class from recurring on the next real OAuth flow / token refresh, without introducing a new bespoke crypto implementation.',
  },
  {
    change: 'Added lib/integrations/youtube/oauth-manager.test.js (6 tests): plaintext-never-written, legacy-key-scrubbed, encrypted round-trip, missing-vault returns null, corrupted-vault fails soft, and a row with only the legacy plaintext key is NOT read as valid credentials. Independently re-run by both a LEAD-phase EXPLORE dispatch and a VALIDATION dispatch -- 6/6 passing both times, and confirmed the "never writes plaintext" assertion genuinely inspects the written payload rather than a return value.',
    impact: 'Regression coverage for the encrypt-at-rest contract and the fail-closed re-auth path, independently re-verified twice.',
  },
  {
    change: 'Verified live against the purged row that getAuthenticatedClient() reaches its documented "No stored tokens" re-auth-required error cleanly, without crashing.',
    impact: 'Confirms the connector\'s existing re-auth flow (npm run eva:ideas:auth:youtube) is the correct, intact recovery path post-purge.',
  },
];

const risks = [
  {
    risk: 'VALIDATION finding F1: the shared lib/security/encryption.cjs master key file (.leo-keys) is created with mode 0o600 in code, but on Windows this mode bit is not enforced the same way as POSIX -- the file was independently confirmed world-readable (644) on this host. This is a PRE-EXISTING limitation of a shared module already used by other consumers (lib/operator/cash-sources/token-vault.js), not something introduced or fixable within this SD\'s scope.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'Out of scope for this SD to fix cross-platform file-permission enforcement in a shared module with other consumers -- documented here as a known gap. A future SD scoped to lib/security/encryption.cjs itself should address Windows ACL-based permission enforcement or migrate to an OS-keychain-backed key store.',
  },
  {
    risk: 'VALIDATION finding F2: the TOKEN_VAULT_APP_ID label is NOT a cryptographic domain separator -- encryption.cjs#decrypt ignores its metadata argument, and encrypt() derives its key from a fresh random salt per call regardless of appId. The naming convention is for operational/human identification only, not a security boundary. Corrected in code comments to avoid a future reader assuming stronger isolation than exists.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'No functional gap: confidentiality already comes from the per-call random salt+IV+PBKDF2, independent of appId. Comment corrected so this is not mis-relied-upon later.',
  },
  {
    risk: 'Criterion #5 (provider-side third-party-access verification) is satisfied only for THIS SPECIFIC TOKEN INSTANCE (confirmed dead via revoke + refresh-attempt), not for the underlying OAuth consent GRANT itself (whether this app still appears in the user\'s Google "third-party apps with account access" list) -- verifying the grant itself would require either a still-valid access_token (which no longer exists, by design) or chairman console access (myaccount.google.com/connections), offered as an optional fallback per this SD\'s own success criteria, not required for completion.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'The specific leaked credential is confirmed unusable, which is the material security outcome. Full consent-grant-level verification remains available to the chairman as a one-look optional follow-up, per the SD\'s own stated fallback path.',
  },
];

const validation_census = {
  performed_at: new Date().toISOString(),
  method: 'Scanned all rows of eva_sync_state.source_metadata for token-shaped value patterns (ya29\\. or 1//0[a-zA-Z0-9] regex); separately checked marketing_channels.credentials; ran an information_schema.columns census repo-wide for oauth/credential/token/secret-named columns.',
  eva_sync_state_rows_scanned: 5,
  eva_sync_state_flagged_before_purge: 1,
  eva_sync_state_flagged_after_purge: 0,
  marketing_channels_rows_scanned: 0,
  marketing_channels_note: 'table empty, no exposure possible',
  other_credential_columns_reviewed: [
    'applications.metrics_api_key_ref', 'chairman_stepup_tokens.credential_id', 'chairman_webauthn_credentials.credential_id',
    'cleanup_orchestration_state.credential_id/credential_type', 'decrypted_secrets.secret/decrypted_secret', 'secrets.secret',
    'sms_relay_secret.secret_value', 'uat_credential_history.old_credentials/new_credentials', 'uat_credentials.credentials',
    'venture_channel_secrets.secret_ref', 'venture_db_secrets.secret_ref', 'venture_distribution_channels.credential_ref',
    'venture_ingest_keys.ingest_secret_hash',
  ],
  other_credential_columns_verdict: 'None of these were within this SD\'s scope (a different credential class each -- webauthn, stepup, cleanup orchestration, UAT fixtures, venture-scoped secret REFERENCES not values) and none pattern-matched a live Google OAuth token; not re-scanned value-by-value beyond the youtube_oauth-specific exposure this SD was created to remediate.',
};

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw fetchErr;

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      key_changes,
      risks,
      metadata: { ...existing.metadata, validation_census },
    })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('Incorporated VALIDATION findings into SD fields for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
