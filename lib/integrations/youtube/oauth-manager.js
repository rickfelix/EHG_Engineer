/**
 * YouTube OAuth Manager
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001C
 *
 * Handles Google OAuth 2.0 flow for YouTube Data API access.
 * Tokens stored in eva_sync_state.source_metadata JSONB.
 */

import { OAuth2Client } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;
const SYNC_STATE_IDENTIFIER = 'youtube_oauth';

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
 * Get stored tokens from database
 * @returns {Promise<Object|null>} Stored token data or null
 */
export async function getStoredTokens() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data } = await supabase
    .from('eva_sync_state')
    .select('source_metadata')
    .eq('source_type', 'youtube')
    .eq('source_identifier', SYNC_STATE_IDENTIFIER)
    .maybeSingle();

  return data?.source_metadata?.tokens || null;
}

/**
 * Store tokens to database
 * @param {Object} tokens - OAuth tokens
 */
export async function storeTokens(tokens) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: existing } = await supabase
    .from('eva_sync_state')
    .select('id, source_metadata')
    .eq('source_type', 'youtube')
    .eq('source_identifier', SYNC_STATE_IDENTIFIER)
    .maybeSingle();

  const metadata = { ...(existing?.source_metadata || {}), tokens };

  if (existing) {
    await supabase
      .from('eva_sync_state')
      .update({ source_metadata: metadata })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('eva_sync_state')
      .insert({
        source_type: 'youtube',
        source_identifier: SYNC_STATE_IDENTIFIER,
        source_metadata: metadata
      });
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
  const cmd = platform === 'win32' ? 'start' :
              platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} "${authUrl}"`);

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

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout - no callback received within 2 minutes'));
    }, 120000);
  });

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);
  await storeTokens(tokens);

  console.log('  Authorization successful! Tokens stored in database.');
  return tokens;
}

export default { createOAuth2Client, getAuthenticatedClient, getStoredTokens, storeTokens, runOAuthFlow };
