const crypto = require('crypto');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prdId = crypto.randomUUID();
const sdUuid = '6410100b-31e1-4490-b95d-8a199a1ecafb';
const sdKey = 'SD-LEO-FIX-REPLACE-MODEL-SELECTION-001';

const prd = {
  id: prdId,
  sd_id: sdUuid,
  directive_id: sdKey,
  title: 'Replace Model Selection with Thinking Effort Routing',
  version: '1.0',
  status: 'draft',
  category: 'infrastructure',
  priority: 'medium',
  executive_summary: 'Replace the current model selection routing (haiku/sonnet/opus) in the LLM Client Factory and agent configuration with thinking effort routing (low/medium/high). Instead of routing sub-agents to different models based on task complexity, all agents will use Opus with configurable thinking budget tokens. This simplifies the routing architecture from "which model?" to "how hard should this think?"',
  business_context: {
    problem: 'Current model routing selects between haiku/sonnet/opus models per sub-agent, adding complexity. With Opus as the standard model, routing should shift to controlling thinking effort levels instead.',
    impact: 'Simplifies LLM routing architecture, reduces configuration surface area, and enables fine-grained control over reasoning depth per agent.',
    stakeholders: ['Engineering team', 'System operators']
  },
  technical_context: {
    current_state: 'LLM Client Factory routes requests to haiku/sonnet/opus based on phase-model-routing.json config. Each agent has a model tier assignment.',
    target_state: 'All agents use Opus with thinking effort levels (low/medium/high) controlling budget_tokens. Local Ollama path remains for haiku-tier classification.',
    affected_systems: ['AnthropicAdapter', 'client-factory.js', 'phase-model-routing.json', 'phase-model-config.js', 'model-routing.js', 'agent compiler', 'leo_sub_agents table']
  },
  functional_requirements: [
    { id: 'FR-001', description: 'Add thinking support to AnthropicAdapter (budget_tokens parameter, strip temperature when thinking enabled, extract thinking content blocks)' },
    { id: 'FR-002', description: 'Replace tier values with effort levels in config/phase-model-routing.json (sonnet->low/medium, opus->medium/high)' },
    { id: 'FR-003', description: 'Replace model-based routing in client-factory.js with effort-based routing (EFFORT_CONFIG with budgetTokens per level)' },
    { id: 'FR-004', description: 'Update phase-model-config.js to read .effort field instead of .model' },
    { id: 'FR-005', description: 'Update model-routing.js to return effort level string' },
    { id: 'FR-006', description: 'Add thinking_effort column to leo_sub_agents table' },
    { id: 'FR-007', description: 'Update agent compiler to set all agents to model: opus' },
    { id: 'FR-008', description: 'Recompile all 17 agents' }
  ],
  test_scenarios: [
    { id: 'TS-001', scenario: 'AnthropicAdapter sends budget_tokens when thinking effort is set', expected: 'API call includes thinking parameter with correct budget_tokens value' },
    { id: 'TS-002', scenario: 'Temperature is stripped when thinking is enabled', expected: 'API call does not include temperature parameter when thinking budget is set' },
    { id: 'TS-003', scenario: 'Client factory routes low effort to 1024 budget_tokens', expected: 'EFFORT_CONFIG maps low to budgetTokens: 1024' },
    { id: 'TS-004', scenario: 'Client factory routes medium effort to 4096 budget_tokens', expected: 'EFFORT_CONFIG maps medium to budgetTokens: 4096' },
    { id: 'TS-005', scenario: 'Client factory routes high effort to 16384 budget_tokens', expected: 'EFFORT_CONFIG maps high to budgetTokens: 16384' },
    { id: 'TS-006', scenario: 'Local Ollama path remains unchanged for haiku-tier', expected: 'USE_LOCAL_LLM=true still routes classification to Ollama' },
    { id: 'TS-007', scenario: 'All 17 agents compile successfully with model: opus', expected: 'npm run agents:compile completes without errors' },
    { id: 'TS-008', scenario: 'Existing tests pass without regressions', expected: 'Full test suite passes' }
  ],
  acceptance_criteria: [
    'All 17 agents compile with model: opus',
    'AnthropicAdapter passes thinkingBudget to API when set',
    'Phase-model configs use low/medium/high instead of haiku/sonnet/opus',
    'Client factory routes effort level to thinking config',
    'Local Ollama path unchanged (haiku classification still local)',
    'Existing tests pass without regressions'
  ],
  implementation_approach: {
    strategy: '8 files modified across config, lib, and scripts. Database migration adds thinking_effort column. Backward compatibility maintained via function aliases. Budget tokens: low=1024, medium=4096, high=16384.',
    files_affected: [
      'lib/sub-agents/vetting/provider-adapters.js',
      'config/phase-model-routing.json',
      'lib/llm/client-factory.js',
      'lib/llm/phase-model-config.js',
      'lib/llm/model-routing.js',
      'database/migrations/YYYYMMDD_add_thinking_effort.sql',
      'scripts/compile-agent-md.js',
      'All 17 agent .md files'
    ],
    phases: [
      'Phase 1: AnthropicAdapter thinking support',
      'Phase 2: Config and routing changes',
      'Phase 3: Database migration and agent recompile'
    ]
  },
  risks: [
    { risk: 'API parameter format changes', likelihood: 'low', impact: 'medium', mitigation: 'Follow Anthropic API docs for thinking parameter' },
    { risk: 'Temperature conflict with thinking', likelihood: 'medium', impact: 'low', mitigation: 'Auto-strip temperature when thinking enabled' }
  ],
  dependencies: {
    upstream: ['Anthropic API thinking/budget_tokens support'],
    downstream: ['All sub-agent invocations']
  },
  constraints: [
    'Local Ollama path must remain unchanged',
    'Backward compatibility for existing function signatures',
    'No changes to OpenAI/Google adapters'
  ],
  assumptions: [
    'Anthropic API supports budget_tokens parameter for thinking',
    'Opus model is available for all agent invocations',
    'Budget token values (1024/4096/16384) provide appropriate reasoning depth'
  ],
  content: {
    user_stories: [
      { id: 'US-001', story: 'As a system operator, I want all sub-agents to use Opus with configurable thinking effort levels, so that routing is simplified from model selection to effort tuning' },
      { id: 'US-002', story: 'As a developer, I want the AnthropicAdapter to support thinking budget_tokens, so that API calls can control reasoning depth' },
      { id: 'US-003', story: 'As a system operator, I want the local Ollama path to remain unchanged, so that haiku-tier classification still routes to local LLM' }
    ],
    scope: {
      in_scope: ['AnthropicAdapter thinking support', 'Config files', 'Client factory', 'Model routing', 'Agent compiler', 'Database migration'],
      out_of_scope: ['OpenAI/Google adapters', 'Canary router', 'Local Ollama path', 'Cost baselining']
    }
  },
  document_type: 'prd',
  created_by: 'database-agent'
};

(async () => {
  const { data, error } = await sb.from('product_requirements_v2').insert(prd).select('id, sd_id, directive_id, title, status, created_at');
  if (error) {
    console.log('INSERT ERROR:', error.message);
    console.log('Details:', JSON.stringify(error));
    process.exit(1);
  } else {
    console.log('SUCCESS: PRD inserted');
    console.log(JSON.stringify(data, null, 2));
  }
})();
