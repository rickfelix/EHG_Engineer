/**
 * Product Hunt GraphQL Client
 * SD: SD-MAN-INFRA-PRODUCT-HUNT-GRAPHQL-001
 *
 * Queries Product Hunt API v2 (GraphQL) for top-rated products
 * matching a venture's domain/category. Used by Stage 15 wireframe
 * generator for UX pattern references.
 *
 * DUAL-MODE:
 *   1. API mode   -- If PRODUCT_HUNT_TOKEN env var exists, real GraphQL calls
 *   2. Fallback   -- If no token, returns a built-in static dataset of trending products
 *
 * Also provides Supabase-backed cache via product_hunt_cache table (24h TTL).
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const PH_API_URL = 'https://api.producthunt.com/v2/api/graphql';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SEARCH_QUERY = `
  query SearchByTopic($topic: String!, $first: Int!) {
    posts(topic: $topic, first: $first, order: VOTES) {
      edges {
        node {
          id
          name
          tagline
          url
          votesCount
          website
          description
          topics { edges { node { name } } }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Static fallback dataset -- 36 products across 6 categories (6 per category)
// ---------------------------------------------------------------------------

const STATIC_PRODUCTS = [
  // === artificial-intelligence (6) ===
  { name: 'ChatGPT', tagline: 'AI-powered conversational assistant by OpenAI', url: 'https://www.producthunt.com/posts/chatgpt', votesCount: 4520, website: 'https://chat.openai.com', description: 'An AI chatbot that uses GPT-4 to understand and generate human-like text for a wide range of tasks.', topics: ['artificial-intelligence', 'productivity'], category: 'artificial-intelligence' },
  { name: 'Midjourney', tagline: 'AI image generation from text prompts', url: 'https://www.producthunt.com/posts/midjourney', votesCount: 3890, website: 'https://midjourney.com', description: 'Create stunning AI-generated artwork and images from natural language descriptions.', topics: ['artificial-intelligence', 'design-tools'], category: 'artificial-intelligence' },
  { name: 'Perplexity AI', tagline: 'AI-powered answer engine with citations', url: 'https://www.producthunt.com/posts/perplexity-ai', votesCount: 3210, website: 'https://perplexity.ai', description: 'Ask anything and get instant, cited answers from across the web using AI.', topics: ['artificial-intelligence', 'productivity'], category: 'artificial-intelligence' },
  { name: 'Runway ML', tagline: 'AI-powered creative tools for video and images', url: 'https://www.producthunt.com/posts/runway-ml', votesCount: 2870, website: 'https://runwayml.com', description: 'Professional AI tools for video editing, generation, and creative production.', topics: ['artificial-intelligence', 'video'], category: 'artificial-intelligence' },
  { name: 'Jasper', tagline: 'AI copilot for enterprise marketing teams', url: 'https://www.producthunt.com/posts/jasper-ai', votesCount: 2540, website: 'https://jasper.ai', description: 'Enterprise AI platform for creating on-brand marketing content at scale.', topics: ['artificial-intelligence', 'marketing'], category: 'artificial-intelligence' },
  { name: 'Hugging Face', tagline: 'The AI community building the future', url: 'https://www.producthunt.com/posts/hugging-face', votesCount: 2310, website: 'https://huggingface.co', description: 'Open-source platform for machine learning models, datasets, and collaborative AI development.', topics: ['artificial-intelligence', 'developer-tools'], category: 'artificial-intelligence' },

  // === saas (6) ===
  { name: 'Notion', tagline: 'All-in-one workspace for notes, tasks, wikis', url: 'https://www.producthunt.com/posts/notion', votesCount: 5120, website: 'https://notion.so', description: 'A unified workspace that combines notes, databases, kanban boards, and collaboration tools.', topics: ['saas', 'productivity'], category: 'saas' },
  { name: 'Linear', tagline: 'The issue tracking tool you will enjoy using', url: 'https://www.producthunt.com/posts/linear', votesCount: 4300, website: 'https://linear.app', description: 'Streamline software project management with fast, keyboard-first issue tracking.', topics: ['saas', 'developer-tools'], category: 'saas' },
  { name: 'Vercel', tagline: 'Develop. Preview. Ship.', url: 'https://www.producthunt.com/posts/vercel', votesCount: 3780, website: 'https://vercel.com', description: 'Frontend cloud platform for deploying web applications with zero configuration.', topics: ['saas', 'developer-tools'], category: 'saas' },
  { name: 'Loom', tagline: 'Record quick videos of your screen and cam', url: 'https://www.producthunt.com/posts/loom', votesCount: 3450, website: 'https://loom.com', description: 'Asynchronous video messaging for faster, clearer workplace communication.', topics: ['saas', 'productivity'], category: 'saas' },
  { name: 'Airtable', tagline: 'Part spreadsheet, part database, entirely flexible', url: 'https://www.producthunt.com/posts/airtable', votesCount: 3100, website: 'https://airtable.com', description: 'Low-code platform to build collaborative apps that organize your data, workflows, and processes.', topics: ['saas', 'productivity'], category: 'saas' },
  { name: 'Calendly', tagline: 'Free online appointment scheduling software', url: 'https://www.producthunt.com/posts/calendly', votesCount: 2890, website: 'https://calendly.com', description: 'Scheduling automation platform that eliminates the back-and-forth of arranging meetings.', topics: ['saas', 'productivity'], category: 'saas' },

  // === fintech (6) ===
  { name: 'Stripe', tagline: 'Online payment processing for internet businesses', url: 'https://www.producthunt.com/posts/stripe', votesCount: 4800, website: 'https://stripe.com', description: 'Financial infrastructure platform powering payments, billing, and treasury for millions of businesses.', topics: ['fintech', 'developer-tools'], category: 'fintech' },
  { name: 'Wise', tagline: 'The cheap, fast way to send money abroad', url: 'https://www.producthunt.com/posts/wise', votesCount: 3600, website: 'https://wise.com', description: 'International money transfer service with transparent fees and real exchange rates.', topics: ['fintech', 'payments'], category: 'fintech' },
  { name: 'Plaid', tagline: 'Connect your bank to your favorite financial apps', url: 'https://www.producthunt.com/posts/plaid', votesCount: 3200, website: 'https://plaid.com', description: 'Infrastructure powering financial data connectivity between apps and bank accounts.', topics: ['fintech', 'developer-tools'], category: 'fintech' },
  { name: 'Mercury', tagline: 'Banking built for startups', url: 'https://www.producthunt.com/posts/mercury', votesCount: 2950, website: 'https://mercury.com', description: 'Business banking platform designed specifically for startups with modern treasury and spend management.', topics: ['fintech', 'saas'], category: 'fintech' },
  { name: 'Brex', tagline: 'Corporate credit cards for startups', url: 'https://www.producthunt.com/posts/brex', votesCount: 2700, website: 'https://brex.com', description: 'All-in-one financial platform with corporate cards, expense management, and bill pay for growing companies.', topics: ['fintech', 'saas'], category: 'fintech' },
  { name: 'Ramp', tagline: 'The corporate card that saves you money', url: 'https://www.producthunt.com/posts/ramp', votesCount: 2450, website: 'https://ramp.com', description: 'Finance automation platform that helps companies manage spend, close books faster, and save money.', topics: ['fintech', 'productivity'], category: 'fintech' },

  // === health (6) ===
  { name: 'Headspace', tagline: 'Meditation made simple', url: 'https://www.producthunt.com/posts/headspace', votesCount: 3400, website: 'https://headspace.com', description: 'Guided meditation and mindfulness app for stress, sleep, and focus improvement.', topics: ['health', 'wellness'], category: 'health' },
  { name: 'Whoop', tagline: 'The most advanced fitness and health wearable', url: 'https://www.producthunt.com/posts/whoop', votesCount: 2900, website: 'https://whoop.com', description: 'Wearable health tracker that monitors strain, recovery, and sleep with personalized coaching.', topics: ['health', 'wearables'], category: 'health' },
  { name: 'Oura Ring', tagline: 'Smart ring that tracks sleep and readiness', url: 'https://www.producthunt.com/posts/oura-ring', votesCount: 2650, website: 'https://ouraring.com', description: 'Health-tracking smart ring monitoring sleep quality, activity, and daily readiness scores.', topics: ['health', 'wearables'], category: 'health' },
  { name: 'Noom', tagline: 'Stop dieting. Get life-long results.', url: 'https://www.producthunt.com/posts/noom', votesCount: 2400, website: 'https://noom.com', description: 'Psychology-based health platform for sustainable weight management and behavior change.', topics: ['health', 'wellness'], category: 'health' },
  { name: 'Calm', tagline: 'The app for meditation and sleep', url: 'https://www.producthunt.com/posts/calm', votesCount: 2200, website: 'https://calm.com', description: 'Mental wellness app offering meditation, sleep stories, and relaxation content.', topics: ['health', 'wellness'], category: 'health' },
  { name: 'Levels', tagline: 'See how food affects your health', url: 'https://www.producthunt.com/posts/levels-health', votesCount: 1980, website: 'https://levels.link', description: 'Metabolic health platform using continuous glucose monitors to provide real-time dietary feedback.', topics: ['health', 'biotech'], category: 'health' },

  // === productivity (6) ===
  { name: 'Obsidian', tagline: 'A knowledge base that works on local Markdown files', url: 'https://www.producthunt.com/posts/obsidian', votesCount: 3650, website: 'https://obsidian.md', description: 'Private knowledge management app using linked Markdown files with a powerful graph view.', topics: ['productivity', 'note-taking'], category: 'productivity' },
  { name: 'Raycast', tagline: 'Supercharged productivity for Mac', url: 'https://www.producthunt.com/posts/raycast', votesCount: 3400, website: 'https://raycast.com', description: 'Blazingly fast launcher and productivity tool replacing Spotlight with extensible commands.', topics: ['productivity', 'developer-tools'], category: 'productivity' },
  { name: 'Todoist', tagline: 'To-do list and task manager for organized work', url: 'https://www.producthunt.com/posts/todoist', votesCount: 3100, website: 'https://todoist.com', description: 'Task management app helping millions organize work and life with projects, labels, and filters.', topics: ['productivity', 'task-management'], category: 'productivity' },
  { name: 'Arc Browser', tagline: 'The internet computer', url: 'https://www.producthunt.com/posts/arc-browser', votesCount: 2850, website: 'https://arc.net', description: 'A reimagined web browser with Spaces, Boosts, and a built-in command bar for power users.', topics: ['productivity', 'browsers'], category: 'productivity' },
  { name: 'Cron', tagline: 'The next-generation calendar for professionals', url: 'https://www.producthunt.com/posts/cron', votesCount: 2600, website: 'https://cron.com', description: 'Fast, beautifully designed calendar app with keyboard shortcuts and multi-calendar overlay.', topics: ['productivity', 'calendar'], category: 'productivity' },
  { name: 'Craft', tagline: 'A fresh take on documents', url: 'https://www.producthunt.com/posts/craft-docs', votesCount: 2350, website: 'https://craft.do', description: 'Native document editor combining rich text, AI features, and beautiful sharing for Apple devices.', topics: ['productivity', 'note-taking'], category: 'productivity' },

  // === developer-tools (6) ===
  { name: 'GitHub Copilot', tagline: 'Your AI pair programmer', url: 'https://www.producthunt.com/posts/github-copilot', votesCount: 4100, website: 'https://github.com/features/copilot', description: 'AI-powered code completion and suggestion tool integrated directly into your IDE.', topics: ['developer-tools', 'artificial-intelligence'], category: 'developer-tools' },
  { name: 'Supabase', tagline: 'The open source Firebase alternative', url: 'https://www.producthunt.com/posts/supabase', votesCount: 3900, website: 'https://supabase.com', description: 'Open-source backend platform with Postgres database, authentication, edge functions, and realtime.', topics: ['developer-tools', 'saas'], category: 'developer-tools' },
  { name: 'Railway', tagline: 'Infrastructure, instantly', url: 'https://www.producthunt.com/posts/railway', votesCount: 3200, website: 'https://railway.app', description: 'Cloud platform for deploying and managing applications with instant provisioning and zero config.', topics: ['developer-tools', 'infrastructure'], category: 'developer-tools' },
  { name: 'Cursor', tagline: 'The AI-first code editor', url: 'https://www.producthunt.com/posts/cursor-ai', votesCount: 2980, website: 'https://cursor.sh', description: 'AI-native code editor built on VS Code with intelligent autocomplete and codebase understanding.', topics: ['developer-tools', 'artificial-intelligence'], category: 'developer-tools' },
  { name: 'Postman', tagline: 'The collaboration platform for API development', url: 'https://www.producthunt.com/posts/postman', votesCount: 2750, website: 'https://postman.com', description: 'API platform for building, testing, documenting, and monitoring APIs at enterprise scale.', topics: ['developer-tools', 'api'], category: 'developer-tools' },
  { name: 'Warp', tagline: 'The terminal for the 21st century', url: 'https://www.producthunt.com/posts/warp', votesCount: 2500, website: 'https://warp.dev', description: 'Modern terminal with AI command search, collaborative workflows, and intelligent autocomplete.', topics: ['developer-tools', 'productivity'], category: 'developer-tools' },
];

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

function getSupabase() {
  return createSupabaseServiceClient();
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Search Product Hunt for top products in a given category/topic.
 *
 * DUAL-MODE:
 *   - If PRODUCT_HUNT_TOKEN is set, makes real GraphQL API call
 *   - If no token, returns products from the built-in static dataset
 *
 * @param {string} category - Topic/category string (e.g., "artificial-intelligence", "fintech")
 * @param {number} [limit=10] - Max results to return
 * @returns {Promise<Array<{name: string, tagline: string, url: string, votesCount: number, website: string, description: string, topics: string[]}>>}
 */
export async function searchProductHuntByCategory(category, limit = 10) {
  if (!category) return [];

  const token = process.env.PRODUCT_HUNT_API_TOKEN;

  if (token) {
    return _fetchFromApi(category, limit, token);
  }

  return _getStaticProducts(category, limit);
}

/**
 * Check the Supabase product_hunt_cache table for existing cached data.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} category - Category to look up
 * @returns {Promise<Object|null>} Cached row or null if not found / expired
 */
export async function getProductHuntCache(ventureId, category) {
  if (!ventureId || !category) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('product_hunt_cache')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('category', category)
    .gt('expires_at', new Date().toISOString())
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[ProductHunt] Cache lookup error:', error.message);
    return null;
  }

  return data;
}

/**
 * Clear cached Product Hunt data for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<number>} Number of rows deleted
 */
export async function clearProductHuntCache(ventureId) {
  if (!ventureId) return 0;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('product_hunt_cache')
    .delete()
    .eq('venture_id', ventureId)
    .select('id');

  if (error) {
    console.warn('[ProductHunt] Cache clear error:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch products from the Product Hunt GraphQL API.
 * @private
 */
async function _fetchFromApi(category, limit, token) {
  try {
    const response = await fetch(PH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { topic: category, first: limit },
      }),
    });

    if (!response.ok) {
      console.warn(`[ProductHunt] API returned ${response.status} -- falling back to static data`);
      return _getStaticProducts(category, limit);
    }

    const json = await response.json();

    if (json.errors) {
      console.warn('[ProductHunt] GraphQL errors:', json.errors[0]?.message);
      return _getStaticProducts(category, limit);
    }

    const edges = json.data?.posts?.edges || [];
    return edges.map(({ node }) => ({
      name: node.name,
      tagline: node.tagline,
      url: node.url,
      votesCount: node.votesCount,
      website: node.website || '',
      description: node.description || '',
      topics: (node.topics?.edges || []).map((t) => t.node.name),
    }));
  } catch (err) {
    console.warn('[ProductHunt] API request failed:', err.message, '-- falling back to static data');
    return _getStaticProducts(category, limit);
  }
}

/**
 * Return products from the static dataset, filtered by category.
 * @private
 */
function _getStaticProducts(category, limit) {
  const normalized = category.toLowerCase();
  const matching = STATIC_PRODUCTS.filter(
    (p) => p.category === normalized || p.topics.includes(normalized),
  );
  const pool = matching.length > 0 ? matching : STATIC_PRODUCTS;
  return pool.slice(0, limit).map(({ category: _cat, ...rest }) => rest);
}

// Export constants and static data for testing
export { PH_API_URL, CACHE_TTL_MS, STATIC_PRODUCTS };
