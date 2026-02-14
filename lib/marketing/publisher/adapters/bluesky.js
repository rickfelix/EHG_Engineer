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
    const response = await fetch(`${this.service}/xrpc/com.atproto.repo.createRecord`, {
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
    const response = await fetch(`${this.service}/xrpc/com.atproto.server.createSession`, {
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
}
