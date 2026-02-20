const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const prdId = crypto.randomUUID();
  const sdUuid = '1566a2ed-ef0f-43eb-9c9c-7d9d873ececf';

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: prdId,
      sd_id: sdUuid,
      title: 'Strategy Layer - Annual Themes and Vision Derivation PRD',
      status: 'approved',
      version: '1.0',
      executive_summary: 'Create strategic_themes table for annual strategic themes that can be auto-derived from vision documents. Add strategy-command.mjs to the EVA CLI suite, providing CLI access to view, create, and derive strategic themes. Follows established EVA CLI patterns (vision-command, mission-command, constitution-command). Subcommands: view (list themes), derive (auto-extract from vision), create (manual theme entry), detail (show single theme). Architecture supports future annual strategic planning sessions with Eva.',
      functional_requirements: [
        'view subcommand: List all strategic themes with year, title, status, and source',
        'derive subcommand: Extract strategic themes from active vision documents (eva_vision_documents.extracted_dimensions)',
        'create subcommand: Manually create a strategic theme with --title, --year, --description, --vision-key flags',
        'detail subcommand: Show full detail for a single theme by ID or title match',
        'Follow parseArgs + subcommand dispatch pattern from constitution-command.mjs',
        'Strategic themes reference source vision document via vision_key FK'
      ],
      system_architecture: {
        components: [
          'scripts/eva/strategy-command.mjs - CLI entry point',
          'Supabase: strategic_themes table (new, CRUD)',
          'Supabase: eva_vision_documents table (existing, read for derivation)'
        ],
        patterns: ['EVA CLI parseArgs pattern', 'Supabase service role client', 'Formatted console output'],
        dependencies: ['@supabase/supabase-js', 'dotenv']
      },
      acceptance_criteria: [
        'strategy-command.mjs view lists all strategic themes',
        'strategy-command.mjs derive extracts themes from active vision documents',
        'strategy-command.mjs create --title "..." --year 2026 --description "..." creates manual theme',
        'strategy-command.mjs detail <id> shows full theme detail',
        'No args shows help text with usage examples',
        'Follows exact same CLI patterns as constitution-command.mjs'
      ],
      test_scenarios: [
        { scenario: 'View all themes', expected: 'Lists themes with year, title, status' },
        { scenario: 'Derive from vision', expected: 'Extracts dimensions from active vision documents into strategic themes' },
        { scenario: 'Create manual theme', expected: 'Inserts theme with all required fields' },
        { scenario: 'View single theme detail', expected: 'Shows full description and source info' },
        { scenario: 'Invalid subcommand', expected: 'Shows help text' }
      ],
      implementation_approach: 'Single file CLI command following established EVA pattern. Create strategic_themes table via database-agent. Read from eva_vision_documents for derive subcommand. Formatted console output matching constitution-command.mjs style.',
      risks: [
        { risk: 'strategic_themes table does not exist', mitigation: 'Create via database-agent with proper constraints', severity: 'low' },
        { risk: 'Vision document dimensions format varies', mitigation: 'Handle JSONB extracted_dimensions gracefully with fallbacks', severity: 'low' }
      ],
      integration_operationalization: {
        consumers: ['Chairman via CLI', 'EVA governance workflows', 'Future annual planning sessions'],
        dependencies: ['eva_vision_documents table (existing)', 'strategic_themes table (new)'],
        data_contracts: { input: 'CLI args (--title, --year, --description, --vision-key)', output: 'Formatted console output' },
        runtime_config: { env_vars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
        observability_rollout: { logging: 'Console output', monitoring: 'N/A for CLI tool' }
      }
    })
    .select('id, status');

  if (error) {
    console.error('PRD error:', error.message);
    process.exit(1);
  }
  console.log('PRD created:', JSON.stringify(data, null, 2));
  console.log('PRD ID:', prdId);
}

main().catch(e => { console.error(e); process.exit(1); });
