import 'dotenv/config';
const { getStoredTokens, getAuthenticatedClient } = await import('../../lib/integrations/youtube/oauth-manager.js');
const t = await getStoredTokens();
console.log('getStoredTokens() against LIVE purged row ->', t === null ? 'null (correct: no valid creds)' : 'NON-NULL (!!) ' + JSON.stringify(t).slice(0,200));
try {
  await getAuthenticatedClient();
  console.log('getAuthenticatedClient() -> RETURNED A CLIENT (unexpected)');
} catch (e) {
  console.log('getAuthenticatedClient() -> threw:', JSON.stringify(e.message));
  console.log('is documented re-auth message:', /No stored tokens/.test(e.message));
}
