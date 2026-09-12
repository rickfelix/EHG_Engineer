/**
 * X (Twitter) Platform Adapter
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Implements publish() interface for X API Basic tier.
 * Rate limits: 50 posts per 15 minutes, 15K reads per month.
 */

const X_CHAR_LIMIT = 280;

export class XAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.X_API_KEY;
    this.apiSecret = options.apiSecret || process.env.X_API_SECRET;
    this.accessToken = options.accessToken || process.env.X_ACCESS_TOKEN;
    this.accessTokenSecret = options.accessTokenSecret || process.env.X_ACCESS_TOKEN_SECRET;
    // SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 TR-7: injectable fetch, default global
    // fetch — gives unit tests a clean seam without stubbing globalThis.fetch.
    this.fetchImpl = options.fetchImpl || fetch;
  }

  /**
   * Publish content to X
   * @param {object} content - { headline, body, cta, url, utm }
   * @returns {Promise<{success: boolean, postId?: string, postUrl?: string}>}
   */
  async publish(content) {
    // Rate limiting is enforced upstream by lib/marketing/autonomy-gate.js's
    // checkRateLimit() (a durable, DB-backed counter keyed by venture+channel+window),
    // called from publisher/index.js's publish() before this adapter is constructed.
    // The prior in-memory window here was inert in practice — publisher/index.js
    // constructs a fresh adapter per publish() call, resetting it every time — and has
    // been removed rather than left as a misleading no-op protection.

    // Format content to 280 char limit
    const text = this.formatForX(content);

    if (!this.apiKey) {
      // Dry-run mode when no credentials configured
      console.log(`[X Adapter] DRY RUN: Would post (${text.length} chars): ${text.substring(0, 100)}...`);
      return { success: true, postId: `dry-run-${Date.now()}`, postUrl: null, dryRun: true };
    }

    // POST to X API v2
    const response = await this.fetchImpl('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`X API error ${response.status}: ${error.detail || error.title || 'Unknown error'}`);
    }

    const result = await response.json();

    return {
      success: true,
      postId: result.data?.id,
      postUrl: result.data?.id ? `https://x.com/i/status/${result.data.id}` : null
    };
  }

  /**
   * Format content for X's 280 char limit
   */
  formatForX(content) {
    const parts = [];

    if (content.headline) parts.push(content.headline);
    if (content.body) parts.push(content.body);
    if (content.cta) parts.push(content.cta);

    let text = parts.join('\n\n');

    // Truncate if over limit (leaving room for ellipsis)
    if (text.length > X_CHAR_LIMIT) {
      text = text.substring(0, X_CHAR_LIMIT - 1) + '\u2026';
    }

    return text;
  }

  /**
   * SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 FR-3: read-only post-lookup, used by the
   * outcome observer only (never by publish()). Counts against the Basic-tier 15K
   * reads/month budget (TR-4) -- callers must batch/back off, never poll unboundedly.
   * @param {string} tweetId
   * @returns {Promise<{exists: boolean|null, transient: boolean, raw: object|null}>}
   *   exists:true = tweet found (shipped_clean candidate); exists:false = confirmed
   *   absent (404, reverted candidate); exists:null + transient:true = lookup failed for
   *   a reason unrelated to the tweet's existence (401/403/429/5xx/network/timeout) --
   *   caller must leave the outcome 'unknown' and retry, never guess (FR-7). 429 is
   *   explicitly transient, never a terminal outcome.
   */
  async getTweet(tweetId) {
    // SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 SECURITY finding SEC-1: tweetId was
    // interpolated raw into the URL path with no shape check. An external_post_id like
    // '../../2/users/me' (only reachable via a DB write or a compromised X response --
    // never from content-generator.js) would issue a bearer-authenticated request to a
    // DIFFERENT endpoint on the same host; a 200 there would misclassify exists:true and
    // manufacture false graduation credit. X tweet ids are always digit strings.
    if (!/^\d+$/.test(String(tweetId))) {
      return { exists: null, transient: true, raw: null };
    }

    let response;
    try {
      response = await this.fetchImpl(`https://api.twitter.com/2/tweets/${tweetId}`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
    } catch {
      return { exists: null, transient: true, raw: null };
    }

    if (response.status === 404) {
      return { exists: false, transient: false, raw: null };
    }
    if (!response.ok) {
      // 401/403/429/5xx are all transient from the observer's perspective: none of
      // them confirms the tweet is actually gone.
      return { exists: null, transient: true, raw: null };
    }

    const raw = await response.json().catch(() => null);
    return { exists: true, transient: false, raw };
  }
}
