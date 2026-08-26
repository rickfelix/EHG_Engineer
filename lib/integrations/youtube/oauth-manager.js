/**
 * YouTube OAuth Manager
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001C
 * SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 (FR-3): tokens are now encrypted at rest.
 *
 * Handles Google OAuth 2.0 flow for YouTube Data API access.
 * Tokens stored in eva_sync_state.source_metadata JSONB, ENCRYPTED via
 * lib/security/encryption.cjs (AES-256-GCM, the same module already used by
 * lib/operator/cash-sources/token-vault.js for a comparable long-lived-credential
 * problem) -- never plaintext. A refresh_token was previously found plaintext in
 * this exact table/row (eva_sync_state id 5ea38ba3-6b46-4f17-be5a-3a87a4075143);
 * a revoke call against it returned invalid_token (it was already dead -- likely
 * natural expiry, since its own refresh_token_expires_in was ~1.4h and the row
 * was over a month old), independently confirmed dead via an actual refresh-grant
 * exchange attempt (invalid_grant). It has been purged, and this module's write
 * path no longer permits that class of exposure to recur.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';
import credentialEncryption from '../../security/encryption.cjs';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/youtube'];
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;
// Exported so callers (e.g. scripts/eva-idea-sync-cron-assert.mjs) can exclude this
// credential-storage row from eva_sync_state without duplicating the literal string.
export const SYNC_STATE_IDENTIFIER = 'youtube_oauth';
// A human-readable label recorded in the ciphertext's metadata for operational
// identification (which credential class this blob belongs to) -- NOT a
// cryptographic domain separator: encryption.cjs#decrypt ignores its metadata
// argument entirely, and every encrypt() call already derives its key from a
// fresh random salt regardless of appId (VALIDATION finding F2). Mirrors
// lib/operator/cash-sources/token-vault.js's BANK_READ_APP_ID naming
// convention for consistency, not for any security property it confers.
const TOKEN_VAULT_APP_ID = 'youtube-oauth-tokens';

/**
 * Create an OAuth2 client
 * @returns {OAuth2Client}
 */
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables required.\n' +
      'Create OAuth credentials at: https://console.cloud.google.com/apis/credentials'
    );
  }

  return new OAuth2Client(clientId, clientSecret, REDIRECT_URI);
}

/**
 * Get stored tokens from database, decrypting the at-rest ciphertext.
 * Fail-soft on a missing/legacy row: returns null (never throws) so the caller's
 * normal "no stored tokens -> re-auth" path handles it, matching
 * lib/operator/cash-sources/token-vault.js#loadBankReadToken's contract.
 * @returns {Promise<Object|null>} Stored token data or null
 */
export async function getStoredTokens({ enc = credentialEncryption } = {}) {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase
    .from('eva_sync_state')
    .select('source_metadata')
    .eq('source_type', 'youtube')
    .eq('source_identifier', SYNC_STATE_IDENTIFIER)
    .maybeSingle();

  const vault = data?.source_metadata?.encrypted_tokens;
  if (!vault?.encrypted) return null;

  try {
    return await enc.decrypt(vault.encrypted, vault.metadata);
  } catch (err) {
    // A genuine decrypt failure (corrupted vault, rotated key) must not crash the
    // caller -- treat it identically to "no stored tokens" and force re-auth.
    console.warn(`[youtube-oauth] WARN stored token vault present but UNREADABLE (tamper/corruption/key-rotation?) -- forcing re-auth: ${err.message}`);
    return null;
  }
}

/**
 * Store tokens to database, ENCRYPTED at rest (AES-256-GCM via
 * lib/security/encryption.cjs). Never writes a plaintext token to source_metadata.
 * @param {Object} tokens - OAuth tokens
 */
export async function storeTokens(tokens, { enc = credentialEncryption } = {}) {
  const supabase = createSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('eva_sync_state')
    .select('id, source_metadata')
    .eq('source_type', 'youtube')
    .eq('source_identifier', SYNC_STATE_IDENTIFIER)
    .maybeSingle();

  const encrypted_tokens = await enc.encrypt(tokens, TOKEN_VAULT_APP_ID);
  // Legacy plaintext `tokens` key is deliberately dropped here (not merged forward)
  // -- any row still carrying it from before this fix is scrubbed on next write.
  const { tokens: _legacyPlaintext, ...restMetadata } = existing?.source_metadata || {};
  const metadata = { ...restMetadata, encrypted_tokens };

  if (existing) {
    const { error } = await supabase
      .from('eva_sync_state')
      .update({ source_metadata: metadata })
      .eq('id', existing.id);
    // VALIDATION finding F8: a silently-swallowed write failure here would leave the
    // caller believing fresh credentials were persisted when they were not -- the next
    // getStoredTokens() call would then see stale (or, worse, still-legacy-plaintext)
    // data. Must throw, not return quietly, since token persistence failing is itself
    // security-relevant (a caller that doesn't know the write failed keeps operating on
    // a token it thinks is safely stored).
    if (error) throw new Error(`storeTokens: failed to persist encrypted tokens: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('eva_sync_state')
      .insert({
        source_type: 'youtube',
        source_identifier: SYNC_STATE_IDENTIFIER,
        source_metadata: metadata
      });
    if (error) throw new Error(`storeTokens: failed to insert encrypted tokens: ${error.message}`);
  }
}

/**
 * Get an authenticated OAuth2 client (uses stored tokens or initiates flow)
 * @param {Object} options
 * @param {boolean} [options.forceReauth=false] - Force new auth flow
 * @returns {Promise<OAuth2Client>} Authenticated client
 */
export async function getAuthenticatedClient(options = {}) {
  const oauth2Client = createOAuth2Client();

  if (!options.forceReauth) {
    const tokens = await getStoredTokens();
    if (tokens) {
      oauth2Client.setCredentials(tokens);

      // Refresh if expired
      if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await storeTokens(credentials);
        oauth2Client.setCredentials(credentials);
      }

      return oauth2Client;
    }
  }

  throw new Error('No stored tokens. Run `npm run eva:ideas:auth:youtube` to authenticate.');
}

/**
 * Run interactive OAuth flow (opens browser, catches callback)
 * @returns {Promise<Object>} Token data
 */
export async function runOAuthFlow() {
  const oauth2Client = createOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n  Opening browser for Google authorization...');
  console.log(`  If browser doesn't open, visit:\n  ${authUrl}\n`);

  // Open browser
  const { exec } = await import('child_process');
  const platform = process.platform;
  if (platform === 'win32') {
    // Windows: start "" "url" - first quoted arg is window title
    exec(`start "" "${authUrl}"`);
  } else {
    const cmd = platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} "${authUrl}"`);
  }

  // Start local server to catch callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Authorization Failed</h1><p>You can close this window.</p></body></html>');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');
        server.close();
        resolve(authCode);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`  Waiting for authorization callback on port ${REDIRECT_PORT}...`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout - no callback received within 5 minutes'));
    }, 300000);
  });

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);
  await storeTokens(tokens);

  console.log('  Authorization successful! Tokens stored in database.');
  return tokens;
}

export default { createOAuth2Client, getAuthenticatedClient, getStoredTokens, storeTokens, runOAuthFlow };
