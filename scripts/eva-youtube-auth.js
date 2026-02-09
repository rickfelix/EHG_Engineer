#!/usr/bin/env node

/**
 * YouTube OAuth Setup CLI
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001C
 *
 * Interactive OAuth flow for YouTube Data API.
 * Opens browser for Google consent, stores tokens in database.
 *
 * Usage:
 *   npm run eva:ideas:auth:youtube
 *   npm run eva:ideas:auth:youtube -- --force  (re-authenticate)
 */

import dotenv from 'dotenv';
dotenv.config();

import { runOAuthFlow, getStoredTokens } from '../lib/integrations/youtube/oauth-manager.js';

const forceReauth = process.argv.includes('--force');

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('YouTube OAuth Setup');
  console.log('='.repeat(60));
  console.log('');

  // Check prerequisites
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('  Missing environment variables:');
    console.error('  - GOOGLE_CLIENT_ID');
    console.error('  - GOOGLE_CLIENT_SECRET');
    console.error('');
    console.error('  Create OAuth credentials at:');
    console.error('  https://console.cloud.google.com/apis/credentials');
    console.error('');
    console.error('  Add redirect URI: http://localhost:3456/oauth2callback');
    process.exit(1);
  }

  // Check if already authenticated
  if (!forceReauth) {
    const existing = await getStoredTokens();
    if (existing) {
      console.log('  Already authenticated. Tokens stored in database.');
      console.log('  Use --force to re-authenticate.');
      console.log('');
      return;
    }
  }

  // Run OAuth flow
  console.log('  Starting OAuth flow...');
  console.log('  This will open your browser for Google authorization.');
  console.log('');

  await runOAuthFlow();

  console.log('');
  console.log('='.repeat(60));
  console.log('Setup Complete');
  console.log('='.repeat(60));
  console.log('');
  console.log('  You can now sync YouTube videos:');
  console.log('  npm run eva:ideas:sync -- --source youtube');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
