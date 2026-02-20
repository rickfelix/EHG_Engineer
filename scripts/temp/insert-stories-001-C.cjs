const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const prdId = '2e291c7a-b7c1-4a99-882c-ee1543fcb128';
  const sdUuid = '1566a2ed-ef0f-43eb-9c9c-7d9d873ececf';

  const stories = [
    {
      id: crypto.randomUUID(),
      prd_id: prdId,
      sd_id: sdUuid,
      story_key: 'GOV-C:US-001',
      title: 'View Strategic Themes via CLI',
      user_role: 'Chairman/Operator',
      user_want: 'view all strategic themes from the CLI',
      user_benefit: 'I can review annual strategic direction without querying the database directly',
      acceptance_criteria: [
        'Running view subcommand lists all strategic themes',
        'Each theme shows year, title, status, and source vision key',
        'Running detail <id> shows full detail including description'
      ],
      priority: 'critical',
      status: 'draft',
      implementation_context: 'Read from strategic_themes table. Format output matching constitution-command.mjs style with box drawing characters.'
    },
    {
      id: crypto.randomUUID(),
      prd_id: prdId,
      sd_id: sdUuid,
      story_key: 'GOV-C:US-002',
      title: 'Derive Strategic Themes from Vision Documents',
      user_role: 'Chairman/Operator',
      user_want: 'auto-derive strategic themes from vision documents',
      user_benefit: 'I can automatically generate strategic themes from existing vision dimensions without manual entry',
      acceptance_criteria: [
        'Running derive subcommand reads active vision documents',
        'Extracted dimensions are converted into strategic theme entries',
        'Derived themes reference the source vision document via vision_key'
      ],
      priority: 'critical',
      status: 'draft',
      implementation_context: 'Read from eva_vision_documents where status=active. Parse extracted_dimensions JSONB. Insert into strategic_themes with derived_from_vision=true.'
    },
    {
      id: crypto.randomUUID(),
      prd_id: prdId,
      sd_id: sdUuid,
      story_key: 'GOV-C:US-003',
      title: 'Create Manual Strategic Themes via CLI',
      user_role: 'Chairman/Operator',
      user_want: 'manually create strategic themes via CLI',
      user_benefit: 'I can add strategic themes that are not derived from vision documents for ad-hoc planning',
      acceptance_criteria: [
        'Running create --title "..." --year 2026 --description "..." creates a theme',
        'Theme is stored in strategic_themes table with status=draft',
        'Supports optional --vision-key to link to a vision document'
      ],
      priority: 'critical',
      status: 'draft',
      implementation_context: 'Insert into strategic_themes with manual flag. Support --vision-key optional FK to eva_vision_documents.'
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
