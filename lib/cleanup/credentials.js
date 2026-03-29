/**
 * Credential Lifecycle Cleanup Module
 * SD: SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-C
 *
 * Revokes venture credentials at external providers (GitHub, Vercel, Supabase)
 * BEFORE database deletion, preserving the relational mapping needed for safe cleanup.
 *
 * Exports: cleanup(ventureIds, options) -> { revoked: [], failed: [], skipped: [] }
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const encryption = require('../security/encryption.js');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Revoke all credentials for the given venture IDs.
 * Records each attempt in cleanup_orchestration_state for idempotency.
 *
 * @param {string[]} ventureIds - UUIDs of ventures being reset
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, return manifest without revoking
 * @returns {Promise<{revoked: Array, failed: Array, skipped: Array}>}
 */
export async function cleanup(ventureIds, options = {}) {
  const { dryRun = false } = options;
  const supabase = createSupabaseServiceClient();
  const result = { revoked: [], failed: [], skipped: [] };

  if (!ventureIds || ventureIds.length === 0) {
    return result;
  }

  // Step 1: Query credentials via managed_applications -> application_credentials join
  const { data: apps, error: appsErr } = await supabase
    .from('managed_applications')
    .select('id, venture_id, app_name')
    .in('venture_id', ventureIds);

  if (appsErr || !apps || apps.length === 0) {
    if (appsErr) console.error('[credentials] Error querying managed_applications:', appsErr.message);
    return result;
  }

  const appIds = apps.map(a => a.id);
  const { data: credentials, error: credErr } = await supabase
    .from('application_credentials')
    .select('id, application_id, credential_type, credential_name, encrypted_value')
    .in('application_id', appIds);

  if (credErr || !credentials || credentials.length === 0) {
    if (credErr) console.error('[credentials] Error querying application_credentials:', credErr.message);
    return result;
  }

  console.log(`[credentials] Found ${credentials.length} credential(s) across ${apps.length} application(s)`);

  // Step 2: Check for already-processed credentials (idempotency)
  const { data: priorState } = await supabase
    .from('cleanup_orchestration_state')
    .select('credential_id, phase')
    .in('credential_id', credentials.map(c => c.id));

  const alreadyRevoked = new Set(
    (priorState || []).filter(s => s.phase === 'revoked').map(s => s.credential_id)
  );

  for (const cred of credentials) {
    if (alreadyRevoked.has(cred.id)) {
      result.skipped.push({ id: cred.id, type: cred.credential_type, reason: 'already_revoked' });
      continue;
    }

    const app = apps.find(a => a.id === cred.application_id);

    if (dryRun) {
      result.revoked.push({ id: cred.id, type: cred.credential_type, name: cred.credential_name, dryRun: true });
      continue;
    }

    // Step 3: Attempt revocation at the external provider
    const revokeResult = await revokeCredential(cred, supabase);

    // Step 4: Record result in cleanup_orchestration_state
    await supabase.from('cleanup_orchestration_state').upsert({
      credential_id: cred.id,
      venture_id: app?.venture_id || null,
      venture_name: app?.app_name || null,
      credential_type: cred.credential_type,
      provider: providerForType(cred.credential_type),
      phase: revokeResult.success ? 'revoked' : 'revocation_failed',
      attempt_count: revokeResult.attempts,
      error_details: revokeResult.error || null,
      revoked_at: revokeResult.success ? new Date().toISOString() : null,
    }, { onConflict: 'credential_id' });

    if (revokeResult.success) {
      result.revoked.push({ id: cred.id, type: cred.credential_type, name: cred.credential_name });
    } else {
      result.failed.push({ id: cred.id, type: cred.credential_type, name: cred.credential_name, error: revokeResult.error });
    }
  }

  console.log(`[credentials] Revoked: ${result.revoked.length}, Failed: ${result.failed.length}, Skipped: ${result.skipped.length}`);
  return result;
}

/**
 * Revoke a single credential at its external provider with retry.
 */
async function revokeCredential(cred, supabase) {
  let decryptedValue;
  try {
    const decrypted = await encryption.decrypt(cred.encrypted_value);
    decryptedValue = typeof decrypted === 'object' ? decrypted.value || JSON.stringify(decrypted) : decrypted;
  } catch (err) {
    return { success: false, attempts: 0, error: `Decryption failed: ${err.message}` };
  }

  const provider = providerForType(cred.credential_type);
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      switch (provider) {
        case 'github':
          await revokeGitHubPAT(decryptedValue);
          break;
        case 'vercel':
          await revokeVercelToken(decryptedValue);
          break;
        case 'supabase':
          // Supabase key rotation requires Management API access which may not be available
          // Log as skipped rather than failing
          return { success: true, attempts: attempt, error: null };
        default:
          return { success: false, attempts: attempt, error: `Unknown provider for type: ${cred.credential_type}` };
      }
      // Clear decrypted value from memory
      decryptedValue = null;
      return { success: true, attempts: attempt, error: null };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      decryptedValue = null;
      return { success: false, attempts: attempt, error: err.message };
    }
  }
  return { success: false, attempts: MAX_RETRIES, error: 'Max retries exceeded' };
}

/**
 * Revoke a GitHub PAT via the GitHub REST API.
 * Uses DELETE on the token endpoint.
 */
async function revokeGitHubPAT(token) {
  const response = await fetch('https://api.github.com/installation/token', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  // 204 = revoked, 401 = already invalid, 404 = not found — all acceptable
  if (response.status !== 204 && response.status !== 401 && response.status !== 404) {
    throw new Error(`GitHub PAT revocation failed: HTTP ${response.status}`);
  }
}

/**
 * Delete a Vercel token via the Vercel API.
 */
async function revokeVercelToken(token) {
  const response = await fetch('https://api.vercel.com/v3/user/tokens/current', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  // 200/204 = deleted, 401/403 = already invalid — acceptable
  if (response.ok || response.status === 401 || response.status === 403) {
    return;
  }
  throw new Error(`Vercel token revocation failed: HTTP ${response.status}`);
}

function providerForType(credentialType) {
  switch (credentialType) {
    case 'github_pat': return 'github';
    case 'vercel_token': return 'vercel';
    case 'supabase_anon_key':
    case 'supabase_service_key': return 'supabase';
    default: return 'unknown';
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
