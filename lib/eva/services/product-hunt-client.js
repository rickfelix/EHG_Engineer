/**
 * Product Hunt GraphQL Client
 * SD: SD-MAN-INFRA-PRODUCT-HUNT-GRAPHQL-001
 *
 * Queries Product Hunt API v2 (GraphQL) for top-rated products
 * matching a venture's domain/category. Used by Stage 15 wireframe
 * generator for UX pattern references.
 *
 * Features:
 * - OAuth token management via PRODUCT_HUNT_TOKEN env var
 * - Category-based product search via GraphQL
 * - In-memory cache with 24h TTL per category
 * - Graceful fallback: returns [] on any error
 */

const PH_API_URL = 'https://api.producthunt.com/v2/api/graphql';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SEARCH_QUERY = `
  query SearchByTopic($topic: String!, $first: Int!) {
    posts(topic: $topic, first: $first, order: VOTES) {
      edges {
        node {
          name
          tagline
          url
          votesCount
          description
          topics(first: 3) {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

// In-memory cache: Map<string, { data: Array, cachedAt: number }>
const cache = new Map();

/**
 * Search Product Hunt for top products in a given category/topic.
 *
 * @param {string} category - Topic/category string (e.g., "artificial-intelligence", "fintech")
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Max results to return
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {Promise<Array<{name: string, tagline: string, url: string, votesCount: number, topics: string[], description: string}>>}
 */
export async function searchByCategory(category, { limit = 10, logger = console } = {}) {
  if (!category) {
    logger.warn?.('[ProductHunt] No category provided — returning empty');
    return [];
  }

  const token = process.env.PRODUCT_HUNT_TOKEN;
  if (!token) {
    logger.warn?.('[ProductHunt] PRODUCT_HUNT_TOKEN not configured — returning empty');
    return [];
  }

  // Check cache
  const cacheKey = `${category}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
    logger.log?.('[ProductHunt] Cache hit for category:', category);
    return cached.data;
  }

  try {
    const response = await fetch(PH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { topic: category, first: limit },
      }),
    });

    if (!response.ok) {
      logger.warn?.(`[ProductHunt] API returned ${response.status} — returning empty`);
      return [];
    }

    const json = await response.json();

    if (json.errors) {
      logger.warn?.('[ProductHunt] GraphQL errors:', json.errors[0]?.message);
      return [];
    }

    const edges = json.data?.posts?.edges || [];
    const products = edges.map(({ node }) => ({
      name: node.name,
      tagline: node.tagline,
      url: node.url,
      votesCount: node.votesCount,
      description: node.description || '',
      topics: (node.topics?.edges || []).map(t => t.node.name),
    }));

    // Cache results
    cache.set(cacheKey, { data: products, cachedAt: Date.now() });
    logger.log?.(`[ProductHunt] Fetched ${products.length} products for category: ${category}`);

    return products;
  } catch (err) {
    logger.warn?.('[ProductHunt] API request failed:', err.message);
    return [];
  }
}

/**
 * Clear the product cache. Useful for testing or forced refresh.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache size (for monitoring/debugging).
 * @returns {number}
 */
export function getCacheSize() {
  return cache.size;
}

// Export internals for testing
export { cache, CACHE_TTL_MS, PH_API_URL };
