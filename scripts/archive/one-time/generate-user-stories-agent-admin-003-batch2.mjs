#!/usr/bin/env node

/**
 * Generate User Stories: SD-AGENT-ADMIN-003 (Batch 2)
 * Remaining 27 stories (US-031 to US-057)
 *
 * Subsystems:
 * - Agent Settings Integration (7 stories)
 * - Search Preferences (10 stories)
 * - Performance Dashboard (10 stories)
 */

import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';

console.log('📝 Generating User Stories: SD-AGENT-ADMIN-003 (Batch 2)');
console.log('='.repeat(70));
console.log('Coverage: Remaining 27 of 57 user stories\n');

const userStories = [
  // ========================================================================
  // SUBSYSTEM 3: Agent Settings Integration (7 stories, 15 story points)
  // ========================================================================
  {
    story_key: 'SD-AGENT-ADMIN-003:US-031',
    title: 'Integrate Prompt Library with Agent Settings',
    user_role: 'agent administrator',
    user_want: 'to select prompts from the library directly in Agent Settings',
    user_benefit: 'I don\'t need to switch tabs to find and apply prompts',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'System Prompt field has "Browse Library" button',
      'Button opens mini prompt picker modal',
      'Modal shows recent prompts + search',
      'Clicking prompt inserts content into field',
      'Modal closes after selection',
      'Integration takes <2 seconds'
    ],
    technical_notes: 'Query prompt_templates in modal, insert content on select',
    test_scenarios: [
      { given: 'User clicks Browse Library', when: 'Prompt selected', then: 'Content populates System Prompt field' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-032',
    title: 'Save agent settings as preset from Settings tab',
    user_role: 'agent administrator',
    user_want: 'to save current settings as preset without leaving Settings tab',
    user_benefit: 'Workflow is faster and more intuitive',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Save as Preset button in AgentSettingsTab',
      'Button opens Create Preset modal',
      'Current settings pre-filled in form',
      'Save creates preset and updates AgentPresetsTab',
      'Confirmation notification shown'
    ],
    technical_notes: 'Trigger same create flow as AgentPresetsTab, shared Zustand state',
    test_scenarios: [
      { given: 'User in Settings tab', when: 'Save as Preset clicked', then: 'Preset created, visible in Presets tab' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-033',
    title: 'Show active preset indicator in Settings',
    user_role: 'agent administrator',
    user_want: 'to see which preset (if any) is currently active',
    user_benefit: 'I know the origin of my current settings',
    story_points: 1,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Badge displays: "Active Preset: [name]" if loaded from preset',
      'Badge shows "Custom Settings" if manually configured',
      '"Modified" indicator if preset loaded but changed',
      'Badge updates real-time when preset applied'
    ],
    technical_notes: 'Zustand store tracks active_preset_id, compare with current state',
    test_scenarios: [
      { given: 'Preset applied', when: 'Settings tab viewed', then: 'Badge shows "Active Preset: [name]"' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-034',
    title: 'Link A/B test results to agent configuration',
    user_role: 'agent administrator',
    user_want: 'to apply winning A/B test variant to agent settings',
    user_benefit: 'Best-performing prompts automatically improve agent quality',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Deploy to Agent button on A/B test results',
      'Button opens agent selector (which agent to update)',
      'Confirmation dialog: "Apply [prompt] to [agent]?"',
      'Winning prompt populates System Prompt field',
      'Agent settings page updates if currently open'
    ],
    technical_notes: 'UPDATE agent settings, trigger Zustand state update',
    test_scenarios: [
      { given: 'A/B test winner declared', when: 'Deploy to Agent clicked', then: 'Agent settings updated with winning prompt' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-035',
    title: 'Validate settings before saving',
    user_role: 'agent administrator',
    user_want: 'to be prevented from saving invalid agent configurations',
    user_benefit: 'I avoid runtime errors from malformed settings',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Validation checks: model exists, temperature 0-2, max_tokens > 0, prompts non-empty',
      'Real-time validation as user types (debounced 500ms)',
      'Error messages inline next to invalid fields',
      'Save button disabled if any validation fails',
      'Success only if all validations pass'
    ],
    technical_notes: 'Zod schema validation, display errors in FormField',
    test_scenarios: [
      { given: 'User sets temperature = 3', when: 'Field blurs', then: 'Error: "Temperature must be between 0 and 2"' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-036',
    title: 'Export agent configuration as JSON',
    user_role: 'agent administrator',
    user_want: 'to download complete agent configuration',
    user_benefit: 'I can back up configs and share with team',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Export Config button in Settings tab',
      'Filename: [agent-name]-config-[date].json',
      'JSON includes: all settings, active preset, metadata',
      'File downloads without errors',
      'Format compatible with import (if future feature)'
    ],
    technical_notes: 'JSON.stringify(agentSettings), download via File API',
    test_scenarios: [
      { given: 'User clicks Export Config', when: 'Download triggered', then: 'JSON file downloads with complete settings' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-037',
    title: 'Reset settings to default values',
    user_role: 'agent administrator',
    user_want: 'to quickly revert to default agent configuration',
    user_benefit: 'I can recover from bad configurations without manual reset',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Reset to Defaults button',
      'Confirmation dialog: "Reset all settings to defaults?"',
      'Reset loads predefined default config',
      'Active preset indicator clears',
      'All fields update immediately',
      'Undo option available (30s timeout)'
    ],
    technical_notes: 'Store previous state for undo, load hardcoded defaults object',
    test_scenarios: [
      { given: 'User clicks Reset', when: 'Confirmed', then: 'All settings revert to defaults, undo button shows 30s' }
    ]
  },

  // ========================================================================
  // SUBSYSTEM 4: Search Preferences (10 stories, 20 story points)
  // ========================================================================
  {
    story_key: 'SD-AGENT-ADMIN-003:US-038',
    title: 'Configure default search provider',
    user_role: 'agent administrator',
    user_want: 'to set default search provider (Google/Bing/DuckDuckGo/Custom)',
    user_benefit: 'Agent uses my preferred search engine',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Search Preferences section in Settings',
      'Provider dropdown: Google, Bing, DuckDuckGo, Custom',
      'Custom provider requires API endpoint URL',
      'Selection saves to search_preferences table',
      'Provider used for all agent search queries'
    ],
    technical_notes: 'INSERT/UPDATE search_preferences, link to agent via agent_id',
    test_scenarios: [
      { given: 'User selects DuckDuckGo', when: 'Saved', then: 'search_preferences.provider = "duckduckgo"' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-039',
    title: 'Set search result count preference',
    user_role: 'agent administrator',
    user_want: 'to configure how many search results agent retrieves (1-20)',
    user_benefit: 'I balance quality (more results) vs speed (fewer results)',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Result Count slider: 1-20 results',
      'Current value displays next to slider',
      'Default: 10 results',
      'Saves to search_preferences.result_count',
      'Applied to all search queries'
    ],
    technical_notes: 'Number input with slider, UPDATE search_preferences',
    test_scenarios: [
      { given: 'User sets result_count = 15', when: 'Saved', then: 'Agent searches return 15 results' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-040',
    title: 'Configure search filters (date, region, language)',
    user_role: 'agent administrator',
    user_want: 'to set default search filters for date range, region, language',
    user_benefit: 'Search results are more relevant to my use case',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Date filter: Any time, Past 24h, Past week, Past month, Past year',
      'Region filter: Any, specific country code (US, GB, etc.)',
      'Language filter: Any, specific language (en, es, fr, etc.)',
      'All filters optional (null = no filter)',
      'Saves to search_preferences JSONB column'
    ],
    technical_notes: 'JSONB filters column: { date, region, language }',
    test_scenarios: [
      { given: 'User sets filters: Past month, US, English', when: 'Saved', then: 'Filters stored in JSONB, applied to searches' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-041',
    title: 'Safe search filtering preference',
    user_role: 'agent administrator',
    user_want: 'to enable/disable safe search filtering',
    user_benefit: 'I can control content appropriateness for my use case',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Safe Search toggle: Off, Moderate, Strict',
      'Default: Moderate',
      'Saves to search_preferences.safe_search',
      'Applied to all search queries',
      'Setting respected by search provider'
    ],
    technical_notes: 'Enum safe_search: off/moderate/strict, UPDATE search_preferences',
    test_scenarios: [
      { given: 'User sets Safe Search = Strict', when: 'Saved', then: 'Agent search queries include safe_search=strict parameter' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-042',
    title: 'Search API rate limit configuration',
    user_role: 'agent administrator',
    user_want: 'to set max searches per minute to avoid rate limiting',
    user_benefit: 'Agent doesn\'t hit API limits and get blocked',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Rate limit input: 1-60 searches/minute',
      'Default: 30/minute',
      'Warning if set too high (>provider limit)',
      'Saves to search_preferences.rate_limit',
      'Enforced via throttling mechanism'
    ],
    technical_notes: 'Rate limiting with token bucket algorithm, store in search_preferences',
    test_scenarios: [
      { given: 'User sets rate_limit = 20', when: 'Agent makes 21st search in 1 min', then: 'Search queued until next minute' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-043',
    title: 'Custom search API key management',
    user_role: 'agent administrator',
    user_want: 'to configure API keys for custom search providers',
    user_benefit: 'I can use my own search API accounts',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'API Key input (password type, masked)',
      'Save encrypts key before storing',
      'Key validation on save (test API call)',
      'Invalid key shows error',
      'Saves to search_preferences.api_key_encrypted'
    ],
    technical_notes: 'Encrypt with AES-256, store encrypted value, decrypt for API calls',
    test_scenarios: [
      { given: 'User enters valid API key', when: 'Saved', then: 'Key encrypted, validation passes, searches work' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-044',
    title: 'Search result caching preference',
    user_role: 'agent administrator',
    user_want: 'to enable caching of search results for N hours',
    user_benefit: 'I save API costs and improve response time for repeated queries',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Cache toggle: On/Off',
      'Cache duration: 1-72 hours (if enabled)',
      'Default: On, 24 hours',
      'Saves to search_preferences.cache_enabled and cache_duration_hours',
      'Cached results served if query identical and within TTL'
    ],
    technical_notes: 'Store results in Redis or database cache table with TTL',
    test_scenarios: [
      { given: 'Cache enabled, 24h TTL', when: 'Same query repeated', then: 'Cached results returned (no API call)' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-045',
    title: 'Domain blocking for search results',
    user_role: 'agent administrator',
    user_want: 'to block specific domains from search results',
    user_benefit: 'I can filter out low-quality or irrelevant sources',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Blocked Domains input (comma-separated list)',
      'Example: spam.com, clickbait.net',
      'Saves to search_preferences.blocked_domains (TEXT[])',
      'Results filtered post-fetch (domain not in blocked list)',
      'Editable after save'
    ],
    technical_notes: 'TEXT[] column, filter results with WHERE NOT (domain = ANY(blocked_domains))',
    test_scenarios: [
      { given: 'User blocks "spam.com"', when: 'Search executed', then: 'Results from spam.com excluded' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-046',
    title: 'Domain prioritization for search results',
    user_role: 'agent administrator',
    user_want: 'to prioritize results from trusted domains',
    user_benefit: 'High-quality sources appear first',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Prioritized Domains input (comma-separated list)',
      'Example: wikipedia.org, .edu domains',
      'Saves to search_preferences.prioritized_domains (TEXT[])',
      'Results sorted: prioritized domains first, then others',
      'Editable after save'
    ],
    technical_notes: 'TEXT[] column, custom sort: prioritized_domains first, then by relevance',
    test_scenarios: [
      { given: 'User prioritizes "wikipedia.org"', when: 'Search executed', then: 'Wikipedia results appear first' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-047',
    title: 'Search preferences inheritance from presets',
    user_role: 'agent administrator',
    user_want: 'search preferences to be included in presets',
    user_benefit: 'I can save and reuse complete agent configurations',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Creating preset includes search_preferences',
      'Applying preset loads search preferences',
      'Search prefs stored in preset config_json',
      'Preview shows search prefs diff',
      'Export includes search prefs'
    ],
    technical_notes: 'Include search_preferences in preset JSONB, apply on load',
    test_scenarios: [
      { given: 'Preset has search_preferences', when: 'Preset applied', then: 'Search settings update to preset values' }
    ]
  },

  // ========================================================================
  // SUBSYSTEM 5: Performance Dashboard (10 stories, 20 story points)
  // ========================================================================
  {
    story_key: 'SD-AGENT-ADMIN-003:US-048',
    title: 'View agent execution metrics dashboard',
    user_role: 'agent administrator',
    user_want: 'to see real-time performance metrics for all agents',
    user_benefit: 'I can identify performance issues proactively',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Performance Dashboard tab',
      'Metrics grid: Total executions, Avg latency, Token usage, Error rate',
      'Time range selector: 7d, 30d, 90d',
      'Agent filter dropdown (all agents or specific)',
      'Metrics update every 30 seconds (Supabase Realtime)',
      'Dashboard loads in <2 seconds'
    ],
    technical_notes: 'Query agent_executions table, aggregate by time range, Recharts for viz',
    test_scenarios: [
      { given: 'User selects 7d range', when: 'Dashboard loads', then: 'Metrics show last 7 days, charts render' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-049',
    title: 'Execution latency trend chart',
    user_role: 'agent administrator',
    user_want: 'to see latency trends over time',
    user_benefit: 'I can detect performance degradation early',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Line chart: Latency (ms) vs Time',
      'X-axis: Time buckets (hourly for 7d, daily for 30d/90d)',
      'Y-axis: Avg latency in ms',
      'Tooltip shows: timestamp, avg latency, execution count',
      'Warning threshold line at 2000ms (configurable)',
      'Chart responsive, loads in <2 seconds'
    ],
    technical_notes: 'Recharts LineChart, aggregate agent_executions by time bucket',
    test_scenarios: [
      { given: 'User views latency chart', when: 'Chart loads', then: 'Trend line shows avg latency per time bucket' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-050',
    title: 'Token usage breakdown chart',
    user_role: 'agent administrator',
    user_want: 'to see token usage distribution across agents',
    user_benefit: 'I can optimize costs by identifying high-usage agents',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Bar chart: Agent vs Total Tokens',
      'X-axis: Agent names',
      'Y-axis: Token count',
      'Tooltip shows: agent, total tokens, avg tokens/execution',
      'Sorted by usage (highest first)',
      'Chart responsive, loads in <2 seconds'
    ],
    technical_notes: 'Recharts BarChart, SUM(token_count) GROUP BY agent_id',
    test_scenarios: [
      { given: 'User views token usage', when: 'Chart loads', then: 'Bar chart shows token usage per agent, sorted desc' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-051',
    title: 'Error rate monitoring chart',
    user_role: 'agent administrator',
    user_want: 'to track error rates over time',
    user_benefit: 'I can identify and fix reliability issues',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Line chart: Error Rate (%) vs Time',
      'Error rate = (failed executions / total executions) * 100',
      'Warning threshold at 5% (configurable)',
      'Tooltip shows: timestamp, error rate, failed/total',
      'Red line when >5% error rate',
      'Chart responsive, loads in <2 seconds'
    ],
    technical_notes: 'Calculate error rate from agent_executions WHERE outcome = "error"',
    test_scenarios: [
      { given: 'User views error rate', when: 'Chart loads', then: 'Line shows error % over time, red if >5%' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-052',
    title: 'Performance alerts configuration',
    user_role: 'agent administrator',
    user_want: 'to configure thresholds for performance alerts',
    user_benefit: 'I get notified automatically when performance degrades',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Alert Settings section',
      'Thresholds: Latency (ms), Error rate (%), Token usage spike (%)',
      'Defaults: Latency >2000ms, Error rate >5%, Token spike >50%',
      'Notification method: Email, In-app, Webhook',
      'Saves to performance_alerts table',
      'Alerts triggered when thresholds exceeded'
    ],
    technical_notes: 'Background job checks metrics vs thresholds, INSERT alerts if exceeded',
    test_scenarios: [
      { given: 'Latency threshold = 2000ms', when: 'Avg latency >2000ms', then: 'Alert created, notification sent' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-053',
    title: 'View active performance alerts',
    user_role: 'agent administrator',
    user_want: 'to see all active performance alerts',
    user_benefit: 'I can quickly identify and resolve issues',
    story_points: 1,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Active Alerts panel',
      'List shows: Alert type, severity, timestamp, details',
      'Severity badges: Critical (red), Warning (yellow), Info (blue)',
      'Click alert to view details and recommended actions',
      'Acknowledge button marks alert as seen',
      'Real-time updates via Supabase Realtime'
    ],
    technical_notes: 'Query performance_alerts WHERE status = "active" ORDER BY created_at DESC',
    test_scenarios: [
      { given: 'Active alert exists', when: 'Dashboard loads', then: 'Alert displayed in panel with severity badge' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-054',
    title: 'Historical alert log',
    user_role: 'agent administrator',
    user_want: 'to view past alerts and resolution history',
    user_benefit: 'I can track patterns and verify fixes',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Alert History tab',
      'List shows: Alert type, severity, created_at, resolved_at, duration',
      'Filter by: severity, date range, alert type',
      'Sort by: created_at, duration, severity',
      'Pagination: 25/50/100 rows per page',
      'Export to CSV option'
    ],
    technical_notes: 'Query performance_alerts WHERE status = "resolved" ORDER BY created_at DESC',
    test_scenarios: [
      { given: 'User views history', when: 'Tab loads', then: 'Resolved alerts listed with resolution times' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-055',
    title: 'Execution trace viewer',
    user_role: 'agent administrator',
    user_want: 'to drill down into individual agent executions',
    user_benefit: 'I can debug specific failures or slow executions',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Click chart data point to view executions',
      'Execution list: timestamp, outcome, latency, tokens, error (if any)',
      'Click execution to view full trace',
      'Trace shows: input, output, steps, timings, token breakdown',
      'Copy trace as JSON option',
      'Trace viewer modal loads in <2 seconds'
    ],
    technical_notes: 'Query agent_executions by id, display JSONB trace_data',
    test_scenarios: [
      { given: 'User clicks failed execution', when: 'Trace loads', then: 'Full execution details shown with error highlighted' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-056',
    title: 'Export performance metrics',
    user_role: 'agent administrator',
    user_want: 'to export metrics as CSV for external analysis',
    user_benefit: 'I can use BI tools or create custom reports',
    story_points: 1,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Export button on dashboard',
      'Format options: CSV, JSON',
      'Exports current view (filtered data + time range)',
      'Filename: performance-metrics-[time range]-[date].csv',
      'CSV columns: timestamp, agent, latency, tokens, outcome, error_details',
      'File downloads without errors'
    ],
    technical_notes: 'Generate CSV from current query results, download via File API',
    test_scenarios: [
      { given: 'User clicks Export CSV (7d range)', when: 'Download triggered', then: 'CSV contains 7 days of metrics' }
    ]
  },
  {
    story_key: 'SD-AGENT-ADMIN-003:US-057',
    title: 'Performance comparison between presets',
    user_role: 'agent administrator',
    user_want: 'to compare performance metrics between different presets',
    user_benefit: 'I can objectively determine which preset performs best',
    story_points: 2,
    priority: 'low',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'Compare Presets button',
      'Multi-select: choose 2-4 presets to compare',
      'Comparison table: Preset, Avg latency, Avg tokens, Error rate, Executions',
      'Winner badge for best performer (lowest latency + error rate)',
      'Visual comparison (Recharts BarChart)',
      'Results load in <3 seconds'
    ],
    technical_notes: 'Query agent_executions WHERE preset_id IN (...), aggregate and compare',
    test_scenarios: [
      { given: 'User compares 3 presets', when: 'Results load', then: 'Table + chart show metrics, winner highlighted' }
    ]
  }
];

let client;

try {
  client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  console.log('');
  console.log(`📊 Generating ${userStories.length} user stories...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const story of userStories) {
    const insertSQL = `
      INSERT INTO user_stories (
        story_key, prd_id, sd_id, title, user_role, user_want, user_benefit,
        story_points, priority, status, sprint, acceptance_criteria,
        definition_of_done, technical_notes,
        test_scenarios, e2e_test_status, validation_status, created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
        $13::jsonb, $14, $15::jsonb, $16, $17, $18, $19
      )
      ON CONFLICT (story_key) DO NOTHING
      RETURNING id;
    `;

    try {
      const result = await client.query(insertSQL, [
        story.story_key,
        'PRD-AGENT-ADMIN-003',
        'SD-AGENT-ADMIN-003',
        story.title,
        story.user_role,
        story.user_want,
        story.user_benefit,
        story.story_points,
        story.priority,
        story.status,
        story.sprint,
        JSON.stringify(story.acceptance_criteria),
        JSON.stringify([]),  // definition_of_done
        story.technical_notes,
        JSON.stringify(story.test_scenarios),
        'not_created',  // e2e_test_status
        'pending',  // validation_status
        'PLAN Agent (Product Requirements Expert)',
        new Date().toISOString()
      ]);

      if (result.rows.length > 0) {
        inserted++;
        console.log(`✅ ${story.story_key}: ${story.title}`);
      } else {
        skipped++;
        console.log(`⚠️  ${story.story_key}: Already exists (skipped)`);
      }
    } catch (error) {
      console.error(`❌ Failed to insert ${story.story_key}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ User Stories Generated: ${inserted} created, ${skipped} already existed`);
  console.log(`\n📊 Final Coverage Summary (All Batches):`);
  console.log(`   Preset Management: 12 stories (US-001 to US-012) - ✅ BATCH 1`);
  console.log(`   Prompt Library + A/B Testing: 18 stories (US-013 to US-030) - ✅ BATCH 1`);
  console.log(`   Agent Settings Integration: 7 stories (US-031 to US-037) - ✅ BATCH 2`);
  console.log(`   Search Preferences: 10 stories (US-038 to US-047) - ✅ BATCH 2`);
  console.log(`   Performance Dashboard: 10 stories (US-048 to US-057) - ✅ BATCH 2`);
  console.log(`\n   Total: 57/57 stories (100% coverage) ✅`);
  console.log(`\n📝 Next Steps:`);
  console.log(`   1. Create database migration files for EHG app (6 new tables)`);
  console.log(`   2. Create seed data validation script (28 records)`);
  console.log(`   3. Update RLS policies for anon access (3 tables)`);
  console.log(`   4. Create PLAN→EXEC handoff`);

} catch (error) {
  console.error('\n❌ User Story Generation Failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
} finally {
  if (client) {
    await client.end();
    console.log('\n📡 Database connection closed');
  }
}
