require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = [
  {
    key: 'SD-EVA-FEAT-MARKETING-AI-001:US-001',
    data: {
      user_role: 'EHG Marketing Operations Lead',
      user_want: 'the marketing engine to automatically select the highest-converting content variants using Thompson Sampling multi-armed bandit optimization so I do not need to manually configure A/B tests',
      user_benefit: 'marketing budget is automatically allocated to the highest-performing content variants, increasing conversion rates without manual test management overhead',
      acceptance_criteria: [
        'GIVEN a campaign with 3+ variants each having 100+ impressions WHEN Thompson Sampling runs THEN the variant with highest Beta posterior mean is selected with probability proportional to its posterior',
        'GIVEN a new variant with fewer than 100 impressions WHEN optimizer evaluates it THEN the variant receives at least 20% of traffic for exploration until threshold met',
        'GIVEN variant performance data WHEN the system calculates Beta distributions THEN alpha equals successes plus 1 and beta equals failures plus 1 per standard conjugate prior',
        'GIVEN the optimizer selects a variant WHEN selection is logged THEN the log includes variant_id, posterior_mean, posterior_variance, sample_value, and selection_reason'
      ],
      definition_of_done: ['Unit tests pass with >80% coverage', 'Integration test with mocked campaign data', 'Thompson Sampling convergence verified with synthetic data', 'Performance: variant selection completes in <50ms for 100 variants'],
      testing_scenarios: [
        { scenario: 'Convergence test', description: 'Run 10000 iterations with known payoff rates, verify optimizer converges to best variant within 500 iterations' },
        { scenario: 'Cold start', description: 'Verify new variants get exploration traffic until minimum impressions reached' },
        { scenario: 'Equal variants', description: 'When all variants perform equally, verify roughly equal traffic distribution' }
      ],
      architecture_references: ['lib/marketing/content-generator.js', 'lib/marketing/budget-governor.js']
    }
  },
  {
    key: 'SD-EVA-FEAT-MARKETING-AI-001:US-002',
    data: {
      user_role: 'EHG Marketing Operations Lead',
      user_want: 'the marketing optimization to run at three distinct cadences: hourly for channel budget reallocation, daily for champion-challenger content rotation, and weekly for cross-venture intelligence sharing',
      user_benefit: 'each type of marketing decision is optimized at the appropriate frequency, preventing over-reaction to noise while still capturing real performance shifts',
      acceptance_criteria: [
        'GIVEN the hourly loop triggers WHEN channel ROI differs by more than 15% between channels THEN budget allocation shifts by at least 10% toward the higher-ROI channel',
        'GIVEN a daily Champion-Challenger test completes WHEN the challenger outperforms champion by >5% conversion rate with >95% statistical confidence THEN the challenger is promoted to champion',
        'GIVEN the weekly loop aggregates cross-venture data WHEN a content pattern succeeds in venture A but is unused in venture B THEN it is flagged as a cross-pollination recommendation',
        'GIVEN any cadence loop executes WHEN it completes THEN an optimization_run record is created with cadence_type, decisions_made, metrics_used, and execution_duration_ms'
      ],
      definition_of_done: ['Each cadence loop has independent scheduler', 'Optimization decisions logged to optimization_runs table', 'Cross-venture intelligence generates actionable recommendations', 'Unit tests cover all three cadences independently'],
      testing_scenarios: [
        { scenario: 'Hourly reallocation', description: 'Simulate channels with 2x ROI difference, verify budget shift' },
        { scenario: 'Champion promotion', description: 'Simulate challenger beating champion, verify promotion logic' },
        { scenario: 'Weekly cross-pollination', description: 'Simulate multi-venture data, verify pattern detection' }
      ],
      architecture_references: ['lib/marketing/ai/thompson-sampler.js', 'lib/marketing/queues/']
    }
  },
  {
    key: 'SD-EVA-FEAT-MARKETING-AI-001:US-003',
    data: {
      user_role: 'EHG Content Operations Specialist',
      user_want: 'the system to generate marketing images using Google Gemini Imagen API and automatically apply brand-consistent overlays including logos, color schemes, and taglines using Sharp.js image processing',
      user_benefit: 'professional branded marketing images are produced at scale in under 30 seconds each without requiring a graphic designer',
      acceptance_criteria: [
        'GIVEN a campaign needs a hero image WHEN the generation pipeline is invoked with a text prompt and brand config THEN a 1200x628 image is generated via Gemini API within 30 seconds',
        'GIVEN a generated base image WHEN Sharp.js applies brand overlays THEN the output includes the venture logo positioned per brand guidelines, brand colors in the border/accent, and optional tagline text',
        'GIVEN the Gemini API returns an error or times out after 30 seconds WHEN the pipeline catches the error THEN a branded placeholder image using the venture color scheme is returned and the failure is logged with provider, error code, and prompt used',
        'GIVEN a successfully generated image WHEN stored in the asset registry THEN metadata includes generation_prompt, dimensions_px, file_size_bytes, provider_name, generation_time_ms, and created_at timestamp'
      ],
      definition_of_done: ['Image generation produces valid PNG/JPEG output', 'Brand overlay compositing tested with sample logos', 'Fallback placeholder generation works without API', 'Asset registry stores all required metadata fields'],
      testing_scenarios: [
        { scenario: 'Happy path generation', description: 'Generate image with valid prompt, verify output dimensions and format' },
        { scenario: 'API failure fallback', description: 'Mock Gemini API failure, verify placeholder returned' },
        { scenario: 'Brand overlay accuracy', description: 'Verify logo placement and color application match brand config' }
      ],
      architecture_references: ['lib/marketing/content-generator.js']
    }
  },
  {
    key: 'SD-EVA-FEAT-MARKETING-AI-001:US-004',
    data: {
      user_role: 'EHG Content Operations Specialist',
      user_want: 'the system to convert marketing images into 5-15 second video clips using an I2V provider chain with automatic fallback from Kling to Veo to Runway when a provider is unavailable or errors',
      user_benefit: 'engaging video content for social media and ads is produced from existing images without video production resources, with high availability through provider redundancy',
      acceptance_criteria: [
        'GIVEN a marketing image in the asset registry WHEN I2V pipeline is invoked THEN Kling API is attempted first, producing a 5-15 second MP4 video clip',
        'GIVEN Kling returns an error or timeout WHEN the pipeline processes the fallback THEN Veo is attempted next, and if Veo also fails then Runway is attempted as the final fallback',
        'GIVEN all three I2V providers fail WHEN the pipeline exhausts the chain THEN the request status is set to failed with an array of per-provider error details and no partial output is persisted',
        'GIVEN a provider returns a video successfully WHEN cost tracking runs THEN the provider name, credit/token usage, generation_time_ms, and estimated_cost_usd are recorded in the asset metadata'
      ],
      definition_of_done: ['Provider chain fallback works with mocked APIs', 'Cost tracking records usage per provider', 'Failed requests have complete error chain logged', 'Video output validated for duration and format'],
      testing_scenarios: [
        { scenario: 'Primary provider success', description: 'Mock Kling success, verify video returned without fallback' },
        { scenario: 'Cascading failure', description: 'Mock Kling+Veo failure, verify Runway attempted' },
        { scenario: 'Total failure', description: 'Mock all providers failing, verify error array returned' }
      ],
      architecture_references: ['lib/marketing/ai/image-generator.js']
    }
  },
  {
    key: 'SD-EVA-FEAT-MARKETING-AI-001:US-005',
    data: {
      user_role: 'EHG Marketing Operations Lead',
      user_want: 'the system to send marketing and transactional emails through Resend API with support for automated multi-step drip campaign sequences that nurture leads over configurable time intervals',
      user_benefit: 'leads are automatically nurtured through personalized email sequences that adapt to engagement signals, converting more prospects without manual follow-up effort',
      acceptance_criteria: [
        'GIVEN a lead is enrolled in a 3-step drip campaign WHEN the campaign engine processes step 1 THEN an email is sent via Resend API and step 2 is scheduled with the configured delay (default 48 hours)',
        'GIVEN a recipient clicks the unsubscribe link WHEN the unsubscribe webhook is received from Resend THEN the recipient is removed from all active campaigns within 5 seconds and no further emails are queued',
        'GIVEN the Resend API returns HTTP 429 rate limit WHEN the email sender retries THEN exponential backoff is applied with delays of 1s, 4s, 16s and the attempt count is capped at 3',
        'GIVEN a drip campaign step is triggered WHEN the system checks engagement THEN recipients who opened the previous email get variant A and non-openers get variant B of the next step'
      ],
      definition_of_done: ['Email sending works with mocked Resend SDK', 'Drip campaign state machine handles multi-step sequences', 'Unsubscribe removes from all campaigns', 'Rate limit retry with backoff tested'],
      testing_scenarios: [
        { scenario: 'Drip sequence progression', description: 'Enroll lead, verify 3 emails sent at correct intervals' },
        { scenario: 'Unsubscribe handling', description: 'Trigger unsubscribe, verify campaign removal' },
        { scenario: 'Rate limit retry', description: 'Mock 429 response, verify backoff and retry' }
      ],
      architecture_references: ['lib/marketing/queues/', 'lib/marketing/publisher/']
    }
  },
  {
    key: 'SD-EVA-FEAT-MARKETING-AI-001:US-006',
    data: {
      user_role: 'EHG Marketing Operations Lead',
      user_want: 'the system to ingest performance metrics from marketing platforms through both scheduled API polling and real-time webhook callbacks, normalizing all data to a common schema for the optimization loop',
      user_benefit: 'all marketing performance data from every channel is available in a unified format for the AI optimization engine to make data-driven budget and content decisions',
      acceptance_criteria: [
        'GIVEN the hourly polling interval triggers WHEN the ingestor fetches data from a configured platform API THEN new metrics since last_poll_at are retrieved, normalized to the common schema (channel, metric_type, value, timestamp), and stored',
        'GIVEN a webhook callback arrives from a marketing platform WHEN the receiver processes the payload THEN the event is validated against expected schema, normalized, and stored within 500ms of receipt',
        'GIVEN an API polling request fails with a network error WHEN the ingestor handles the failure THEN the error is logged with platform_name, error_code, attempt_number, and a retry is scheduled 30 seconds later',
        'GIVEN the retry also fails WHEN max retries (2) are exhausted THEN an alert is raised via the notification system and the next scheduled poll proceeds normally'
      ],
      definition_of_done: ['API polling works with mocked platform responses', 'Webhook receiver validates and normalizes payloads', 'Failure retry mechanism tested with mocked errors', 'Common schema normalization covers all supported platforms'],
      testing_scenarios: [
        { scenario: 'Happy path polling', description: 'Mock platform API, verify metrics normalized and stored' },
        { scenario: 'Webhook processing', description: 'Send mock webhook, verify sub-500ms processing' },
        { scenario: 'Retry exhaustion', description: 'Mock persistent failure, verify alert raised after max retries' }
      ],
      architecture_references: ['lib/marketing/ai/optimization-loop.js', 'lib/marketing/index.js']
    }
  }
];

async function run() {
  for (const u of updates) {
    const { error } = await s.from('user_stories').update(u.data).eq('story_key', u.key);
    if (error) console.log('ERROR', u.key, error.message);
    else console.log('Updated', u.key);
  }
}
run();
