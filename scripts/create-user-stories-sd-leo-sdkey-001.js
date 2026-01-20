#!/usr/bin/env node

/**
 * Create User Stories for SD-LEO-SDKEY-001
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createUserStories() {
  console.log('Creating user stories for SD-LEO-SDKEY-001...');

  const { data: prd } = await supabase
    .from('prds')
    .select('id, sd_id')
    .eq('id', 'PRD-SD-LEO-SDKEY-001')
    .single();

  if (!prd) {
    console.log('PRD not found');
    return;
  }

  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('id', prd.sd_id)
    .single();

  const sdKey = sd?.sd_key || 'SD-LEO-SDKEY-001';

  const stories = [
    {
      id: randomUUID(),
      story_key: `${sdKey}:US-001`,
      prd_id: prd.id,
      sd_id: prd.sd_id,
      title: 'Create SDKeyGenerator Module',
      user_role: 'developer',
      user_want: 'a centralized SDKeyGenerator module',
      user_benefit: 'all SD creation paths use consistent naming',
      acceptance_criteria: [
        'Module exports generateSDKey() function',
        'Accepts source, type, title, parentKey, hierarchyDepth parameters',
        'Produces format SD-{SOURCE}-{TYPE}-{SEMANTIC}-### for root SDs',
        'Handles hierarchy suffixes for children and grandchildren',
        'Checks both sd_key and id columns for collisions'
      ],
      priority: 'critical',
      status: 'ready',
      implementation_context: {
        key_files: ['scripts/modules/sd-key-generator.js'],
        approach: 'Create new module with generateSDKey() as primary export',
        constraints: ['Must be ESM compatible', 'Must check collisions']
      }
    },
    {
      id: randomUUID(),
      story_key: `${sdKey}:US-002`,
      prd_id: prd.id,
      sd_id: prd.sd_id,
      title: 'Implement /leo create Command',
      user_role: 'developer',
      user_want: 'a /leo create command',
      user_benefit: 'I can create SDs through a single entry point',
      acceptance_criteria: [
        '/leo create launches interactive wizard',
        'Supports --from-uat flag',
        'Supports --from-learn flag',
        'Supports --from-feedback flag',
        'Supports --child flag'
      ],
      priority: 'critical',
      status: 'ready',
      implementation_context: {
        key_files: ['.claude/skills/leo.md', '.claude/commands/leo.md'],
        approach: 'Enhance existing /leo skill with create subcommand',
        constraints: ['Must integrate with SDKeyGenerator']
      }
    },
    {
      id: randomUUID(),
      story_key: `${sdKey}:US-003`,
      prd_id: prd.id,
      sd_id: prd.sd_id,
      title: 'Refactor Upstream SD Creation Scripts',
      user_role: 'maintainer',
      user_want: 'all SD creation scripts to use SDKeyGenerator',
      user_benefit: 'naming is consistent across all sources',
      acceptance_criteria: [
        'uat-to-strategic-directive-ai.js uses SDKeyGenerator',
        'modules/learning/executor.js uses SDKeyGenerator',
        'sd-from-feedback.js uses SDKeyGenerator',
        'pattern-alert-sd-creator.js uses SDKeyGenerator',
        'create-sd.js uses SDKeyGenerator',
        'child-sd-template.js integrates'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: {
        key_files: [
          'scripts/uat-to-strategic-directive-ai.js',
          'scripts/modules/learning/executor.js',
          'scripts/sd-from-feedback.js'
        ],
        approach: 'Replace local key generation with SDKeyGenerator import',
        constraints: ['Backward compatibility required']
      }
    }
  ];

  const { error } = await supabase.from('user_stories').insert(stories);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Created', stories.length, 'user stories:');
  stories.forEach(s => console.log(' -', s.story_key, ':', s.title));
}

createUserStories().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
