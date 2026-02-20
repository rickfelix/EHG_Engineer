const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const prdId = crypto.randomUUID();
  const sdUuid = '54bca6cc-33a4-4805-822d-35207aac51a8';

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: prdId,
      sd_id: sdUuid,
      title: 'Constitution CLI Access - PRD',
      status: 'approved',
      version: '1.0',
      executive_summary: 'Add constitution-command.mjs to the EVA CLI suite, providing CLI access to the protocol_constitution table (11 CONST rules). Follows established EVA CLI patterns (vision-command, mission-command). Subcommands: view (list all rules), rule (show single rule detail), amend (propose draft amendment), history (show amendment log). No AEGIS constitution management in v1.',
      functional_requirements: [
        'view subcommand: List all 11 protocol constitution rules with rule_code, category, and truncated rule_text',
        'rule <code> subcommand: Show full detail for a single CONST rule including rationale',
        'amend subcommand: Create draft amendment record with --code, --text, --rationale flags',
        'history subcommand: Show amendment history from constitutional_amendments table',
        'Follow parseArgs + subcommand dispatch pattern from mission-command.mjs',
        'Support --venture flag for future multi-venture filtering'
      ],
      system_architecture: {
        components: [
          'scripts/eva/constitution-command.mjs - CLI entry point',
          'Supabase: protocol_constitution table (existing, read)',
          'Supabase: constitutional_amendments table (existing or new, write for amend)'
        ],
        patterns: ['EVA CLI parseArgs pattern', 'Supabase service role client', 'Formatted console output'],
        dependencies: ['@supabase/supabase-js', 'dotenv']
      },
      acceptance_criteria: [
        'constitution-command.mjs view lists all 11 CONST rules',
        'constitution-command.mjs rule CONST-001 shows full rule detail',
        'constitution-command.mjs amend --code CONST-001 --text "..." --rationale "..." creates draft amendment',
        'constitution-command.mjs history shows amendment records',
        'No args shows help text with usage examples',
        'Follows exact same CLI patterns as mission-command.mjs'
      ],
      test_scenarios: [
        { scenario: 'View all rules', expected: 'Lists 11 CONST rules with codes and categories' },
        { scenario: 'View single rule', expected: 'Shows full rule_text and rationale for specified code' },
        { scenario: 'Propose amendment', expected: 'Creates draft amendment record in DB' },
        { scenario: 'View history', expected: 'Lists amendment records with timestamps' },
        { scenario: 'Invalid rule code', expected: 'Graceful error message' }
      ],
      implementation_approach: 'Single file CLI command following established EVA pattern. Read from protocol_constitution table for view/rule subcommands. Write to constitutional_amendments table for amend subcommand. Formatted console output matching mission-command.mjs style.',
      risks: [
        { risk: 'constitutional_amendments table may not exist', mitigation: 'Check schema, create via database-agent if needed', severity: 'low' },
        { risk: 'Amendment workflow not defined', mitigation: 'Keep simple: draft status only, chairman activates manually', severity: 'low' }
      ],
      integration_operationalization: {
        consumers: ['Chairman via CLI', 'EVA governance workflows'],
        dependencies: ['protocol_constitution table (existing)', 'constitutional_amendments table'],
        data_contracts: { input: 'CLI args (--code, --text, --rationale)', output: 'Formatted console output' },
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
