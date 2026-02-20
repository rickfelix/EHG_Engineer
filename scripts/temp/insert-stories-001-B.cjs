const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const prdId = 'd6a39b23-8aa6-401a-9841-7c333c21a02d';

  const stories = [
    {
      id: crypto.randomUUID(),
      prd_id: prdId,
      story_key: 'GOV-B:US-001',
      title: 'View Constitution Rules via CLI',
      user_role: 'Chairman/Operator',
      user_want: 'view all protocol constitution rules from the CLI',
      user_benefit: 'I can audit governance rules without querying the database directly',
      acceptance_criteria: [
        'Running view subcommand lists all 11 CONST rules',
        'Each rule shows rule_code, category, and truncated rule_text',
        'Running rule <code> shows full detail including rationale'
      ],
      priority: 'critical',
      status: 'draft',
      implementation_context: 'Read from protocol_constitution table. Format output matching mission-command.mjs style with box drawing characters.'
    },
    {
      id: crypto.randomUUID(),
      prd_id: prdId,
      story_key: 'GOV-B:US-002',
      title: 'Propose Constitution Amendments via CLI',
      user_role: 'Chairman/Operator',
      user_want: 'propose amendments to constitution rules via CLI',
      user_benefit: 'I can initiate rule changes through the standard governance workflow without DB access',
      acceptance_criteria: [
        'Running amend --code CONST-XXX --text "..." --rationale "..." creates a draft amendment',
        'Amendment is stored in constitutional_amendments table',
        'Draft amendments require explicit activation (not auto-applied)'
      ],
      priority: 'critical',
      status: 'draft',
      implementation_context: 'Check if constitutional_amendments table exists; create via database-agent if not. Insert with status=draft, proposed_by=chairman.'
    },
    {
      id: crypto.randomUUID(),
      prd_id: prdId,
      story_key: 'GOV-B:US-003',
      title: 'View Amendment History via CLI',
      user_role: 'Chairman/Operator',
      user_want: 'view the history of constitution amendments',
      user_benefit: 'I can track how governance rules have evolved over time for audit purposes',
      acceptance_criteria: [
        'Running history subcommand lists all amendments',
        'Each entry shows rule_code, old/new text, status, and timestamp',
        'Supports --code flag to filter by specific rule'
      ],
      priority: 'critical',
      status: 'draft',
      implementation_context: 'Query constitutional_amendments table ordered by created_at DESC. Format with status icons matching mission-command.mjs history pattern.'
    }
  ];

  const { data, error } = await supabase
    .from('user_stories')
    .insert(stories)
    .select('id, story_key, status');

  if (error) {
    console.error('Stories error:', error.message);
    process.exit(1);
  }
  console.log('Stories created:', JSON.stringify(data, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
