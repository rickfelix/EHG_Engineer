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
    const response = await fetch('https://api.twitter.com/2/tweets', {
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
}
