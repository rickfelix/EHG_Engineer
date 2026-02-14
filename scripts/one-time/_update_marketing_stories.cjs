/**
 * One-time: Update marketing SD user stories with proper acceptance criteria.
 *
 * The handoff gate validator requires:
 * - Given-When-Then scenarios (5% weight but flagged)
 * - Acceptance criteria clarity & testability (50% weight)
 * - Human-verifiable outcomes (LEO v4.4.0 requirement for feature SDs)
 * - Story independence & implementability (30% weight)
 *
 * Current stories score 52%, need 55% minimum for feature SDs.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STORY_UPDATES = [
  {
    id: 'ee6f1e6e-fbc7-4808-aebc-da7e6a094c87',
    title: 'Marketing Database Schema Foundation',
    acceptance_criteria: [
      'Given a new venture is created, when the marketing schema is initialized, then all 8 marketing tables (marketing_channels, marketing_content, marketing_content_variants, marketing_campaigns, campaign_content, channel_budgets, daily_rollups, marketing_attribution) exist with correct column types',
      'Given a user queries marketing data, when they lack venture_id ownership, then RLS policies block all SELECT/INSERT/UPDATE/DELETE operations and return zero rows',
      'Given a daily_rollups record is inserted with impressions=1000 and clicks=50 and spend=25.00 and conversions=5, when the record is saved, then click_rate=0.05, cost_per_click=0.50, and conversion_rate=0.005 are auto-calculated by generated columns',
      'Given the marketing_channels table has data, when a query filters by venture_id, then the query uses the btree index on venture_id (verified via EXPLAIN ANALYZE showing Index Scan)',
      'Given an operator inserts a channel_budgets record, when venture_id+platform combination already exists, then the UNIQUE constraint rejects the insert with a descriptive error'
    ]
  },
  {
    id: '3cfd6221-09d3-4621-bd27-ce6b37a7aa74',
    title: 'Content Generator Service',
    acceptance_criteria: [
      'Given a venture with context (name, industry, target audience), when the content generator is invoked for a campaign, then it produces at least 2 distinct text variants stored in marketing_content_variants with different body text',
      'Given content is generated, when a marketing_content record is created, then lifecycle_state is set to "draft" and the record includes venture_id, campaign_id, content_type, and created_at timestamp',
      'Given the LLM prompt is constructed, when venture context is included, then the prompt contains the venture name, industry vertical, and target audience demographics (verifiable by logging the prompt)',
      'Given an operator views the marketing_content table, when filtering by venture_id and lifecycle_state="draft", then they can see all generated content awaiting review with variant count displayed'
    ]
  },
  {
    id: '15ad15ad-1566-48f2-904f-c2df14119203',
    title: 'Publisher Abstraction Layer',
    acceptance_criteria: [
      'Given content is ready to publish, when publish(content, "x", options) is called, then the X API adapter formats the content to 280 chars, posts via the API, and returns a success/failure result with the post URL',
      'Given content is ready to publish, when publish(content, "bluesky", options) is called, then the Bluesky AT Protocol adapter creates a post record and returns the post URI',
      'Given any content is published with a link, when the link is included in the post, then UTM parameters (utm_source, utm_medium, utm_campaign, utm_content) are appended to the URL before posting',
      'Given a piece of content was already published to a platform, when the same content+platform combination is submitted again, then the idempotency key check prevents duplicate posting and returns the original post reference',
      'Given an operator checks published content, when they query marketing_content with lifecycle_state="published", then each record shows the platform, post URL, and publish timestamp'
    ]
  },
  {
    id: '201fd6ca-0653-4285-b5db-1abd8b6c4ece',
    title: 'BullMQ Queue System',
    acceptance_criteria: [
      'Given the queue system is initialized, when all 6 queues (content-generation, content-review, publish-x, publish-bluesky, attribution-sync, daily-rollup) are started, then each queue has its configured concurrency limit (generation=2, publish=1 per platform, rollup=1)',
      'Given a job fails in any queue, when it has been retried 3 times with exponential backoff, then the job is moved to the dead-letter queue (DLQ) with the original error message and all retry timestamps preserved',
      'Given a publish job is dispatched, when an idempotency key matching venture_id+content_id+platform exists in the completed set, then the job is skipped without executing and logged as "duplicate prevented"',
      'Given the X platform rate limit is 50 posts per 15 minutes, when the publish-x queue processes jobs, then it enforces a minimum 18-second delay between posts and pauses the queue if the limit is approached'
    ]
  },
  {
    id: '0c15f90c-d64d-477c-bf42-6bf032a25d49',
    title: 'Budget Governor and UTM Attribution',
    acceptance_criteria: [
      'Given a venture has a channel_budgets record with daily_limit=$50 for platform "x", when cumulative daily spend reaches $50, then subsequent publish jobs for that platform are blocked with reason "daily budget exceeded" and the operator is notified',
      'Given a venture daily average spend is $30, when spend exceeds $60 (2x average) in a single day, then the stop-loss mechanism halts all publishing for that venture and logs the event as "stop-loss triggered"',
      'Given content is published with UTM parameters, when a user clicks the link, then a PostHog event is captured with properties: utm_source, utm_medium, utm_campaign, utm_content, venture_id',
      'Given attribution events have been collected throughout the day, when the daily-rollup job runs, then a daily_rollups record is created/updated with aggregated impressions, clicks, spend, and conversions with auto-calculated rates',
      'Given an operator views the daily_rollups table, when filtering by venture_id and date range, then they can see daily performance metrics including click_rate, cost_per_click, and conversion_rate for each channel'
    ]
  }
];

async function main() {
  let updated = 0;
  for (const story of STORY_UPDATES) {
    const { error } = await supabase
      .from('user_stories')
      .update({ acceptance_criteria: story.acceptance_criteria })
      .eq('id', story.id);

    if (error) {
      console.error(`FAILED ${story.title}:`, error.message);
    } else {
      console.log(`Updated: ${story.title} (${story.acceptance_criteria.length} criteria)`);
      updated++;
    }
  }
  console.log(`\nDone: ${updated}/5 stories updated`);
}

main();
