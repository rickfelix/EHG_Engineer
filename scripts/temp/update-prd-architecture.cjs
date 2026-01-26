require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = 'f586fb6f-9b64-4e34-805e-26533f6c9d25';

async function updatePRD() {
  const systemArchitecture = {
    overview: 'Grounding validation layer integrated into the PRD generation pipeline to detect and flag hallucinated requirements.',
    components: [
      {
        name: 'Implementation Context Schema',
        type: 'database',
        location: 'strategic_directives_v2.implementation_context',
        description: 'TEXT column storing the target platform context (cli/web/api/database). Informs LLM prompt to generate platform-appropriate requirements.'
      },
      {
        name: 'PRD Generator Context Builder',
        type: 'module',
        location: 'scripts/prd/llm-generator.js',
        description: 'buildPRDGenerationContext() function enhanced to include implementation_context in the LLM system prompt. Adds conditional exclusions for non-applicable requirement types.'
      },
      {
        name: 'Grounding Validator',
        type: 'module',
        location: 'lib/prd-grounding-validator.js',
        description: 'Post-generation validation module that cross-checks PRD requirements against source SD description, scope, and discovery documents. Produces confidence scores (0-1) for each requirement.'
      },
      {
        name: 'PRD Metadata Storage',
        type: 'database',
        location: 'product_requirements_v2.metadata.grounding_validation',
        description: 'JSONB field storing validation results including confidence scores, flagged requirements, and explanations.'
      }
    ],
    dataFlow: [
      {
        step: 1,
        description: 'SD creation specifies implementation_context (cli/web/api/database)',
        source: 'User/Script',
        destination: 'strategic_directives_v2'
      },
      {
        step: 2,
        description: 'PRD generator loads SD with implementation_context',
        source: 'strategic_directives_v2',
        destination: 'buildPRDGenerationContext()'
      },
      {
        step: 3,
        description: 'Context builder includes implementation_context in LLM prompt',
        source: 'buildPRDGenerationContext()',
        destination: 'OpenAI API'
      },
      {
        step: 4,
        description: 'LLM generates requirements aware of target platform',
        source: 'OpenAI API',
        destination: 'Raw PRD content'
      },
      {
        step: 5,
        description: 'Grounding validator checks each requirement against source SD',
        source: 'Raw PRD content + SD',
        destination: 'Validation results'
      },
      {
        step: 6,
        description: 'Results stored in PRD metadata, warnings displayed',
        source: 'Validation results',
        destination: 'product_requirements_v2.metadata'
      }
    ],
    integrationPoints: [
      {
        name: 'SD Creation Scripts',
        impact: 'Must accept and validate implementation_context parameter',
        files: ['scripts/sd/create-sd.js', 'scripts/leo-create-sd.js']
      },
      {
        name: 'PRD Generation Pipeline',
        impact: 'Add grounding validation step after LLM response',
        files: ['scripts/prd/index.js', 'scripts/prd/llm-generator.js']
      },
      {
        name: 'Handoff System',
        impact: 'Display grounding validation warnings in PLAN-TO-EXEC output',
        files: ['scripts/handoff.js', 'scripts/modules/handoff/executors/PlanToExecExecutor.js']
      }
    ],
    failureModes: [
      {
        mode: 'Implementation context not set',
        detection: 'Validator checks for null/empty implementation_context',
        recovery: 'Default to "web" for backward compatibility, log warning',
        impact: 'low',
        dataIntegrity: 'No data loss, PRD generation proceeds with default context'
      },
      {
        mode: 'Grounding validator timeout',
        detection: 'Validator enforces 30-second timeout',
        recovery: 'Log timeout warning, proceed without validation results',
        impact: 'medium',
        dataIntegrity: 'PRD created without grounding scores, manual review required'
      },
      {
        mode: 'LLM API failure during validation',
        detection: 'Try/catch around LLM calls with retry logic',
        recovery: 'Retry up to 3 times with exponential backoff, then skip validation',
        impact: 'medium',
        dataIntegrity: 'No data corruption, validation skipped gracefully'
      },
      {
        mode: 'False positive flagging',
        detection: 'Human review of flagged requirements',
        recovery: 'Human can override via PRD metadata.human_overrides',
        impact: 'low',
        dataIntegrity: 'Original requirements preserved, override stored separately'
      },
      {
        mode: 'Schema migration failure',
        detection: 'Migration script checks for column existence',
        recovery: 'Idempotent migration with IF NOT EXISTS clause',
        impact: 'high',
        dataIntegrity: 'Rollback to previous schema state if migration fails',
        rollback: 'ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS implementation_context'
      }
    ]
  };

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({
      system_architecture: systemArchitecture,
      updated_at: new Date().toISOString()
    })
    .eq('sd_id', sdId);

  if (error) {
    console.error('Error updating PRD:', error.message);
    process.exit(1);
  }

  console.log('PRD system_architecture updated successfully!');
  console.log('Components defined:', systemArchitecture.components.length);
  console.log('Data flow steps:', systemArchitecture.dataFlow.length);
  console.log('Integration points:', systemArchitecture.integrationPoints.length);
  console.log('Failure modes:', systemArchitecture.failureModes.length);
}

updatePRD();
