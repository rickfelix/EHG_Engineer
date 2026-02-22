/**
 * Product Hunt GraphQL Poller
 * Fetches trending products by topic from the Product Hunt API.
 *
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-003)
 */

import { normalizeProductHuntEntry } from './normalizer.js';

const PH_API_URL = 'https://api.producthunt.com/v2/api/graphql';

const DEFAULT_TOPICS = ['artificial-intelligence', 'saas', 'fintech', 'health', 'productivity'];

const POSTS_QUERY = `
  query($first: Int!, $topic: String) {
    posts(order: VOTES, first: $first, topic: $topic) {
      edges {
        node {
          id
          name
          tagline
          votesCount
          url
          website
          createdAt
        }
      }
    }
  }
`;

/**
 * Poll Product Hunt for trending posts.
 *
 * @param {Object} params
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger] - Logger (default: console)
 * @param {Array}  [params.topics] - Topics to poll
 * @param {string} [params.apiToken] - Product Hunt API bearer token
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function pollProductHunt({ supabase, logger = console, topics, apiToken } = {}) {
  if (!apiToken) {
    logger.log('Product Hunt: no API token configured, skipping');
    return { success: false, count: 0, error: 'no_token' };
  }

  const topicList = topics || DEFAULT_TOPICS;
  let totalUpserted = 0;

  for (const topic of topicList) {
    try {
      const response = await fetch(PH_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: POSTS_QUERY,
          variables: { first: 50, topic },
        }),
      });

      if (response.status === 401) {
        logger.log('Product Hunt error: 401 Unauthorized');
        return { success: false, count: totalUpserted, error: '401 Unauthorized' };
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '?';
        logger.log(`Product Hunt rate limited, retry after ${retryAfter}s`);
        return { success: false, count: totalUpserted, error: '429 Rate Limited' };
      }

      if (!response.ok) {
        logger.log(`Product Hunt error for ${topic}: ${response.status}`);
        continue;
      }

      const json = await response.json();
      const edges = json?.data?.posts?.edges || [];
      const rows = edges.map((edge, idx) => normalizeProductHuntEntry(edge.node, idx + 1));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('app_rankings')
          .upsert(rows, { onConflict: 'source,app_url' });

        if (error) {
          logger.log(`Product Hunt upsert error for ${topic}: ${error.message}`);
        } else {
          totalUpserted += rows.length;
        }
      }
    } catch (err) {
      logger.log(`Product Hunt error for ${topic}: ${err.message}`);
    }
  }

  if (totalUpserted === 0) {
    return { success: false, count: 0, error: 'No data collected from any topic' };
  }

  return { success: true, count: totalUpserted };
}
