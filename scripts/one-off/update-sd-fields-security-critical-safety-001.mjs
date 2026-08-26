#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';

const title = 'Remediate exposed YouTube OAuth token: revoke, purge, encrypt-at-rest';

const key_changes = [
  {
    change: 'Revoked the live-exposed Google OAuth refresh_token (eva_sync_state row 5ea38ba3) provider-side via oauth2.googleapis.com/revoke, then independently confirmed dead via an actual refresh-token-exchange attempt (oauth2.googleapis.com/token), which returned invalid_grant.',
    impact: 'The leaked credential can no longer be used to obtain YouTube API access, closing the live exposure window.',
  },
  {
    change: 'Purged the plaintext access_token/refresh_token from eva_sync_state.source_metadata (row 5ea38ba3), after archiving a structure-only (values redacted, lengths/prefixes preserved) evidence snapshot to this SD\'s own metadata.pre_purge_evidence. Readback confirmed zero token-shaped strings remain in the row.',
    impact: 'Removes the at-rest plaintext exposure from the database entirely.',
  },
  {
    change: 'lib/integrations/youtube/oauth-manager.js#getStoredTokens/storeTokens now encrypt tokens at rest via the existing lib/security/encryption.cjs AES-256-GCM module (the same one lib/operator/cash-sources/token-vault.js already uses for a comparable long-lived-credential problem), under source_metadata.encrypted_tokens. The legacy plaintext source_metadata.tokens key is never written and is scrubbed from any row still carrying it on next write.',
    impact: 'Prevents this exact exposure class from recurring on the next real OAuth flow / token refresh, without introducing a new bespoke crypto implementation.',
  },
  {
    change: 'Added lib/integrations/youtube/oauth-manager.test.js (6 tests): plaintext-never-written, legacy-key-scrubbed, encrypted round-trip, missing-vault returns null, corrupted-vault fails soft, and a row with only the legacy plaintext key is NOT read as valid credentials.',
    impact: 'Regression coverage for the encrypt-at-rest contract and the fail-closed re-auth path.',
  },
  {
    change: 'Verified live against the purged row that getAuthenticatedClient() reaches its documented "No stored tokens" re-auth-required error cleanly, without crashing.',
    impact: 'Confirms the connector\'s existing re-auth flow (npm run eva:ideas:auth:youtube) is the correct, intact recovery path post-purge.',
  },
];

const risks = [
  {
    risk: 'The refresh_token had a short (5201-second) refresh_token_expires_in and the row was last updated 2026-07-24 (over a month before this remediation), so it may have naturally expired before this SD started -- meaning the live-exposure window may have already closed on its own before the SD was created. This does not reduce the value of the remediation (purge/encrypt/verify all still needed), only the urgency framing.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Both the revoke call and an actual refresh-attempt independently confirmed the token dead (invalid_token / invalid_grant) -- the remediation goal (credential unusable) is achieved regardless of whether natural expiry or the revoke call was the proximate cause.',
  },
  {
    risk: 'The encryption module\'s master key lives in a local .leo-keys file (0o600, gitignored) -- if that file is lost, all encrypted tokens (including any newly re-authenticated YouTube credentials) become unrecoverable and require a fresh OAuth flow.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'Acceptable for this credential class: the connector already has a documented, working re-auth flow (npm run eva:ideas:auth:youtube) that mints fresh credentials from scratch, so key loss degrades to "re-authenticate," not permanent data loss.',
  },
];

const success_metrics = [
  { metric: 'Revocation proof', target: 'invalid_grant on refresh attempt', actual: 'Confirmed live' },
  { metric: 'DB purge proof', target: 'zero token-shaped strings in row', actual: 'Confirmed live readback' },
  { metric: 'Encrypt-at-rest test coverage', target: '>=1 fixture roundtrip test', actual: '6 tests, all passing' },
];

const smoke_test_steps = [
  { instruction: 'Query eva_sync_state row 5ea38ba3-6b46-4f17-be5a-3a87a4075143 and inspect source_metadata.', expected_outcome: 'No `tokens` key present; no access_token/refresh_token-shaped string anywhere in the JSON.' },
  { instruction: 'Attempt a POST to https://oauth2.googleapis.com/token with the old (pre-purge) refresh_token, client_id, client_secret, grant_type=refresh_token.', expected_outcome: 'Returns HTTP 400 {"error":"invalid_grant"}.' },
  { instruction: 'Call lib/integrations/youtube/oauth-manager.js#getAuthenticatedClient() against the live (purged) row.', expected_outcome: 'Throws "No stored tokens. Run `npm run eva:ideas:auth:youtube` to authenticate." cleanly, no crash.' },
  { instruction: 'Run npx vitest run lib/integrations/youtube/oauth-manager.test.js', expected_outcome: 'All 6 tests pass, including the plaintext-never-written and encrypted-roundtrip assertions.' },
];

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
      title,
      key_changes,
      risks,
      smoke_test_steps,
      metadata: { ...existing.metadata, success_metrics, needs_enrichment: false },
    })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('Updated SD fields for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
