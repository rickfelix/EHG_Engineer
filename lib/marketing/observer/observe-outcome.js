/**
 * Publish outcome observer — SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 FR-1/FR-7.
 *
 * Reads the ACTUAL real-world state of a previously-published post and classifies its
 * outcome for recordPublishOutcome(). Called ONLY from a scheduled step
 * (scripts/cron/publish-outcome-observer.mjs), never from publisher/index.js's publish()
 * itself — that would be exactly the self-report anti-pattern the ledger exists to
 * prevent (autonomy-gate.js's own module docstring).
 *
 * Join: venture_channel_publish_ledger.correlation_id = campaign_content.idempotency_key.
 * Both are the SAME string for a given publish decision as of the FR-1 root-cause fix in
 * publisher/index.js (dispatchKey = authCheck.correlationId) — prior to that fix this join
 * was dead by construction on the approval-gated (fail-closed default) path.
 */
import { XAdapter } from '../publisher/adapters/x.js';
import { BlueskyAdapter } from '../publisher/adapters/bluesky.js';
import { resolveChannelCredentials } from '../channel-secrets.js';

// SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 FR-9: scope bound literally to the
// publishable intersection {x, bluesky} — the other five ventures.metadata.thesis.
// reached_how channel families have no adapter and are explicitly out of scope.
export const ADAPTERS = { x: XAdapter, bluesky: BlueskyAdapter };

// Both adapters emit this literal sentinel prefix in dry-run mode (no credentials
// configured) — a dry-run postId is never a real, joinable post.
const DRY_RUN_SENTINEL_RE = /^dry-run-/;

// VERIFY-phase VALIDATION finding F1 (HIGH): on the approval-gated (fail-closed default)
// path, the chairman can flip a ledger row's decision to 'accepted' out of band (no code
// in this repo does it -- only the autonomous tier's own insert does), while the actual
// publish() retry that creates the campaign_content row is human-paced and can lag by
// hours. Without a grace window, a scheduled tick landing in that gap would see no
// joinable campaign_content row and classify the row 'unmeasurable' -- a TERMINAL,
// never-revisited state (the row leaves the outcome='unknown' candidate set forever) --
// even though the post WILL exist once the retry happens. That directly contradicts FR-1's
// own definition of unmeasurable ("does not exist and never will"): here it merely does
// not exist YET. 24h is generous enough for a human-paced retry while still eventually
// resolving genuinely-abandoned rows to a terminal state.
export const OBSERVATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.correlationId - venture_channel_publish_ledger.correlation_id
 * @param {object} [params.adapters] - platform -> AdapterClass map, injectable for tests
 * @param {Function} [params.resolveCredentials] - injectable for tests; defaults to
 *   lib/marketing/channel-secrets.js resolveChannelCredentials, the SAME per-venture
 *   secret_ref lookup publish() uses — never a flat/shared credentials map (SECURITY
 *   finding SEC-3).
 * @returns {Promise<{outcome: 'shipped_clean'|'reverted'|'unknown'|'unmeasurable', outcomeRef: string|null, reason: string, joined: boolean}>}
 *   `joined` (TESTING finding, EXEC phase, HIGH): true once a real, non-sentinel
 *   external_post_id was recovered via the ledger-to-campaign_content join -- lets the
 *   caller distinguish "the join itself never succeeded" from "the join succeeded but the
 *   platform lookup came back transient/out-of-scope", which the outcome value alone
 *   collapses (both are otherwise invisible in a simple unmeasurable/unknown count).
 */
export async function observeOutcome({ supabase, correlationId, adapters = ADAPTERS, resolveCredentials = resolveChannelCredentials, now = () => Date.now() }) {
  const { data: ledgerRow, error: ledgerError } = await supabase
    .from('venture_channel_publish_ledger')
    .select('id, venture_id, channel_type, correlation_id, created_at')
    .eq('correlation_id', correlationId)
    .maybeSingle();

  if (ledgerError) {
    return { outcome: 'unknown', outcomeRef: null, reason: `ledger read failed: ${ledgerError.message}`, joined: false };
  }
  if (!ledgerRow) {
    return { outcome: 'unmeasurable', outcomeRef: null, reason: 'no ledger row for this correlationId', joined: false };
  }

  const { data: contentRow, error: contentError } = await supabase
    .from('campaign_content')
    .select('id, external_post_id, platform')
    .eq('idempotency_key', correlationId)
    .maybeSingle();

  if (contentError) {
    return { outcome: 'unknown', outcomeRef: null, reason: `campaign_content read failed: ${contentError.message}`, joined: false };
  }

  const externalPostId = contentRow?.external_post_id;
  // FR-1: campaign_content row existence alone never proves a successful publish — the
  // upsert is guarded by `if (result.success && campaignId)`, and campaign_content is
  // ALSO written ungated by content-generator.js under a different key scheme, so a
  // matching row here is guaranteed to be the publisher's own dispatch record, but its
  // external_post_id can still be null (dry-run) or a dry-run sentinel — reject both.
  if (!externalPostId || DRY_RUN_SENTINEL_RE.test(externalPostId)) {
    // VALIDATION finding F1: a join-miss is only genuinely "will never exist" once the
    // fixed observation window has elapsed since the ledger row was created (FR-4/FR-7).
    // Within the window, the human-paced approval-gated retry may simply not have
    // happened yet -- leave it 'unknown' (retried next run), never a premature terminal.
    const ageMs = now() - new Date(ledgerRow.created_at).getTime();
    if (ageMs < OBSERVATION_WINDOW_MS) {
      return { outcome: 'unknown', outcomeRef: null, reason: 'no joinable post id yet, but still inside the observation window -- retry next run', joined: false };
    }
    return { outcome: 'unmeasurable', outcomeRef: null, reason: 'no joinable real post id (missing campaign_content row, null external_post_id, or a dry-run sentinel) after the observation window elapsed', joined: false };
  }

  // The join itself succeeded from here on — everything below is about WHETHER the
  // platform can be looked up, never about whether the join found a real post id.
  const platform = contentRow.platform || ledgerRow.channel_type;
  const AdapterClass = adapters[platform];
  if (!AdapterClass) {
    return { outcome: 'unmeasurable', outcomeRef: externalPostId, reason: `no adapter for platform '${platform}' (out of scope for this SD — FR-9)`, joined: true };
  }

  // SECURITY finding SEC-3: resolve THIS venture's own per-venture credential (the same
  // mechanism publish() uses), never fall through to an adapter's shared/environment-wide
  // credential fallback — that is the exact cross-venture identity leak publish() itself
  // is hardened against (lib/marketing/publisher/index.js's null-credential dry-run
  // short-circuit). No resolvable credential means this observer cannot make an
  // authenticated lookup for this venture's channel; leave it 'unknown' for retry rather
  // than risk querying with the wrong identity.
  const credentials = await resolveCredentials({ supabase, ventureId: ledgerRow.venture_id, channelType: platform });
  if (!credentials) {
    return { outcome: 'unknown', outcomeRef: externalPostId, reason: `no per-venture credential resolvable for platform '${platform}' — never falls back to a shared identity`, joined: true };
  }

  const adapter = new AdapterClass(credentials);
  const lookup = platform === 'x'
    ? await adapter.getTweet(externalPostId)
    : await adapter.getPostRecord(externalPostId);

  // FR-7: the 3-way discrimination that is the "never guess" guarantee. transient ->
  // stays 'unknown' (retried next run); confirmed-absent -> 'reverted'; confirmed-present
  // -> 'shipped_clean'. caused_rework is explicitly unreachable this increment — no
  // rework signal exists anywhere in the codebase (confirmed by direct read of
  // lib/marketing/ai/metrics-ingestor.js and variant-outcome-derivation.js).
  if (lookup.transient) {
    return { outcome: 'unknown', outcomeRef: externalPostId, reason: 'transient lookup failure — retry next scheduled run', joined: true };
  }
  if (lookup.exists === false) {
    return { outcome: 'reverted', outcomeRef: externalPostId, reason: 'post confirmed absent (deleted or never existed)', joined: true };
  }
  return { outcome: 'shipped_clean', outcomeRef: externalPostId, reason: 'post confirmed present', joined: true };
}
