/**
 * Per-venture channel credential references — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C
 * FR-1/FR-2. Backs organic-channel-provisioning.js's previously-unimplemented storeSecret
 * dependency, and is the credential source publisher/index.js resolves before constructing
 * an adapter.
 *
 * Never stores or returns a plaintext credential — venture_channel_secrets.secret_ref is a
 * REFERENCE only. Today's minimal implementation stores the actual credential payload in
 * an env-scoped keyring (process.env.VENTURE_CHANNEL_SECRET_STORE, a JSON map of
 * secret_ref -> credentials, injected at deploy time by ops tooling) rather than an
 * external secret manager, matching venture_db_secrets' existing secret_ref convention
 * for this codebase. Swapping the keyring for a real secret-manager call is a drop-in
 * change to resolveSecret's implementation only — callers never see the difference.
 */

function readKeyring() {
  const raw = process.env.VENTURE_CHANNEL_SECRET_STORE;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Stores a credential reference for a (venture, channel). Returns the secret_ref the
 * caller should persist onto venture_distribution_channels.credential_ref.
 * NOTE: does not persist the credential literal to the database — only the reference.
 */
export async function storeSecret({ supabase, ventureId, channelType, provider, credentials }) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('storeSecret: credentials must be an object');
  }

  const secretRef = `venture_channel_secrets:${ventureId}:${channelType}`;

  const { error } = await supabase
    .from('venture_channel_secrets')
    .upsert(
      { venture_id: ventureId, channel_type: channelType, provider: provider || null, secret_ref: secretRef },
      { onConflict: 'venture_id,channel_type' }
    );

  if (error) {
    throw new Error(`storeSecret: failed to persist secret_ref: ${error.message}`);
  }

  return secretRef;
}

/**
 * Resolves a secret_ref to the actual credential object at call time. Fails CLOSED
 * (returns null) on any missing/unresolvable reference — callers must treat null as
 * "no credentials available" and fall back to dry-run/block, never to a shared default
 * identity.
 */
export function resolveSecret(secretRef) {
  if (!secretRef) return null;
  const keyring = readKeyring();
  return keyring[secretRef] || null;
}

/**
 * Convenience: look up a venture's secret_ref for a channel_type (the publisher/index.js
 * `platform` key — 'x', 'bluesky') and resolve it in one call. Returns null (fail-closed)
 * if no ref is on record or it can't be resolved — never falls through to a shared or
 * default identity.
 *
 * Deliberately keyed on channel_type directly against venture_channel_secrets, NOT via
 * venture_distribution_channels/distribution_channels.credential_ref — those tables use
 * a separate, pre-existing channel_type taxonomy (e.g. 'twitter_x') for the distribution
 * PLAN side that does not (yet) cover every publisher `platform` key (there is no
 * 'bluesky' entry in organic-channel-provisioning's allowlist today). Reconciling that
 * taxonomy gap is out of this FR's scope; venture_channel_secrets uses `platform` as its
 * own self-consistent key space.
 */
export async function resolveChannelCredentials({ supabase, ventureId, channelType }) {
  const { data, error } = await supabase
    .from('venture_channel_secrets')
    .select('secret_ref')
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .maybeSingle();

  if (error || !data?.secret_ref) return null;
  return resolveSecret(data.secret_ref);
}

export default { storeSecret, resolveSecret, resolveChannelCredentials };
