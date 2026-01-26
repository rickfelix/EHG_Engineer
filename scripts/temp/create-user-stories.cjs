require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = 'f586fb6f-9b64-4e34-805e-26533f6c9d25';
const sdKey = 'SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001';
const prdId = 'PRD-SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001';

async function createUserStories() {
  const stories = [
    {
      story_key: `${sdKey}:US-001`,
      prd_id: prdId,
      sd_id: sdId,
      title: 'SD Creator specifies implementation context',
      user_role: 'Developer creating an SD',
      user_want: 'to specify the implementation context (cli/web/api/database)',
      user_benefit: 'the PRD generator understands the target platform',
      acceptance_criteria: [
        'implementation_context field exists in strategic_directives_v2 table',
        'Field accepts values: cli, web, api, database',
        'SD creation scripts include implementation_context parameter',
        'Default value is "web" for backward compatibility'
      ],
      priority: 'high',
      status: 'draft',
      story_points: 2,
      implementation_context: 'Database migration: Add implementation_context column (TEXT, DEFAULT web) to strategic_directives_v2 table. Update SD creation scripts in scripts/sd/ to accept and validate implementation_context parameter.'
    },
    {
      story_key: `${sdKey}:US-002`,
      prd_id: prdId,
      sd_id: sdId,
      title: 'PRD generator uses implementation context',
      user_role: 'PRD Generator (System)',
      user_want: 'to include implementation context in the LLM prompt',
      user_benefit: 'generated requirements match the target platform',
      acceptance_criteria: [
        'buildPRDGenerationContext() includes implementation_context',
        'System prompt mentions target platform explicitly',
        'Web SDs include UI-specific requirements',
        'CLI SDs exclude UI-specific requirements (WCAG, render SLA, etc.)'
      ],
      priority: 'high',
      status: 'draft',
      story_points: 3,
      implementation_context: 'CLI/LLM Integration: Modify scripts/prd/llm-generator.js buildPRDGenerationContext() to include implementation_context in system prompt. Add conditional logic to exclude UI requirements for non-web contexts.'
    },
    {
      story_key: `${sdKey}:US-003`,
      prd_id: prdId,
      sd_id: sdId,
      title: 'Grounding validator flags ungrounded requirements',
      user_role: 'PLAN agent reviewing a PRD',
      user_want: 'to see which requirements are potentially hallucinated',
      user_benefit: 'I can review them before approving',
      acceptance_criteria: [
        'Grounding validator runs after PRD generation',
        'Each requirement gets a confidence score (0-1)',
        'Requirements with score < 0.7 are flagged',
        'Flagged requirements include explanation of why they were flagged',
        'Results stored in PRD metadata.grounding_validation'
      ],
      priority: 'high',
      status: 'draft',
      story_points: 5,
      implementation_context: 'CLI Validator Module: Create lib/prd-grounding-validator.js with confidence scoring algorithm. Integrate with PRD generation pipeline in scripts/prd/index.js. Store validation results in PRD metadata.grounding_validation field.'
    },
    {
      story_key: `${sdKey}:US-004`,
      prd_id: prdId,
      sd_id: sdId,
      title: 'Discovery documents inform grounding validation',
      user_role: 'Grounding Validator (System)',
      user_want: 'to check requirements against discovery documents (exploration_summary)',
      user_benefit: 'I can better assess grounding',
      acceptance_criteria: [
        'Validator loads exploration_summary from SD if present',
        'Requirements matching exploration_summary get higher confidence',
        'Requirements not in exploration_summary or SD scope get lower confidence'
      ],
      priority: 'medium',
      status: 'draft',
      story_points: 3,
      implementation_context: 'CLI Discovery Integration: Extend grounding validator to load exploration_summary from SD metadata. Compare PRD requirements against discovery findings for improved confidence scoring.'
    }
  ];

  for (const story of stories) {
    const { error } = await supabase
      .from('user_stories')
      .upsert(story, { onConflict: 'story_key' });

    if (error) {
      console.error('Error creating story', story.story_key, ':', error.message);
    } else {
      console.log('Created story:', story.story_key, '-', story.title);
    }
  }

  console.log('\nDone. Created', stories.length, 'user stories.');
}

createUserStories();
