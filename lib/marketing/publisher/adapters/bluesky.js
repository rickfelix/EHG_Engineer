/**
 * Bluesky Platform Adapter
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Implements publish() interface for Bluesky (AT Protocol).
 * Max 300 characters per post.
 */

const BLUESKY_CHAR_LIMIT = 300;

export class BlueskyAdapter {
  constructor(options = {}) {
    this.handle = options.handle || process.env.BLUESKY_HANDLE;
    this.password = options.password || process.env.BLUESKY_APP_PASSWORD;
    this.service = options.service || process.env.BLUESKY_SERVICE || 'https://bsky.social';
    this.session = null;
    // SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 TR-7: injectable fetch, default global
    // fetch — gives unit tests a clean seam without stubbing globalThis.fetch.
    this.fetchImpl = options.fetchImpl || fetch;
  }

  /**
   * Publish content to Bluesky
   * @param {object} content - { headline, body, cta }
   * @returns {Promise<{success: boolean, postId?: string, postUrl?: string}>}
   */
  async publish(content) {
    const text = this.formatForBluesky(content);

    if (!this.handle || !this.password) {
      console.log(`[Bluesky Adapter] DRY RUN: Would post (${text.length} chars): ${text.substring(0, 100)}...`);
      return { success: true, postId: `dry-run-${Date.now()}`, postUrl: null, dryRun: true };
    }

    // Authenticate if no session
    if (!this.session) {
      await this.authenticate();
    }

    // Create post via AT Protocol
    const response = await this.fetchImpl(`${this.service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.session.accessJwt}`
      },
      body: JSON.stringify({
        repo: this.session.did,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text,
          createdAt: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Bluesky API error ${response.status}: ${error.message || 'Unknown error'}`);
    }

    const result = await response.json();
    const rkey = result.uri?.split('/').pop();

    return {
      success: true,
      postId: result.uri,
      postUrl: rkey ? `https://bsky.app/profile/${this.handle}/post/${rkey}` : null
    };
  }

  /**
   * Authenticate with Bluesky
   */
  async authenticate() {
    const response = await this.fetchImpl(`${this.service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: this.handle,
        password: this.password
      })
    });

    if (!response.ok) {
      throw new Error(`Bluesky auth failed: ${response.status}`);
    }

    this.session = await response.json();
  }

  /**
   * Format content for Bluesky's 300 char limit
   */
  formatForBluesky(content) {
    const parts = [];
    if (content.headline) parts.push(content.headline);
    if (content.body) parts.push(content.body);
    if (content.cta) parts.push(content.cta);

    let text = parts.join('\n\n');
    if (text.length > BLUESKY_CHAR_LIMIT) {
      text = text.substring(0, BLUESKY_CHAR_LIMIT - 1) + '\u2026';
    }
    return text;
  }

  /**
   * SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 FR-2: read-only post-lookup, used by the
   * outcome observer only (never by publish()). Public AT Protocol read \u2014 no auth
   * required. postUri is the at:// URI publish() returned as postId (e.g.
   * "at://did:plc:abc/app.bsky.feed.post/rkey").
   * @param {string} postUri
   * @returns {Promise<{exists: boolean|null, transient: boolean, raw: object|null}>}
   *   exists:true = record found (shipped_clean candidate); exists:false = confirmed
   *   absent, e.g. 404/RecordNotFound (reverted candidate); exists:null + transient:true
   *   = lookup failed for a reason unrelated to the record's existence (5xx/network/
   *   timeout) -- caller must leave the outcome 'unknown' and retry, never guess (FR-7).
   */
  async getPostRecord(postUri) {
    const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(postUri || '');
    if (!match) {
      return { exists: null, transient: true, raw: null };
    }
    const [, repo, collection, rkey] = match;
    const url = `${this.service}/xrpc/com.atproto.repo.getRecord?${new URLSearchParams({ repo, collection, rkey })}`;

    let response;
    try {
      response = await this.fetchImpl(url);
    } catch {
      return { exists: null, transient: true, raw: null };
    }

    if (response.status === 404) {
      return { exists: false, transient: false, raw: null };
    }
    if (!response.ok) {
      return { exists: null, transient: true, raw: null };
    }

    const raw = await response.json().catch(() => null);
    return { exists: true, transient: false, raw };
  }
}
