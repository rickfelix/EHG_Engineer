require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = 'f586fb6f-9b64-4e34-805e-26533f6c9d25';

async function createPRD() {
  // Fetch SD data first
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError) {
    console.error('Error fetching SD:', sdError.message);
    process.exit(1);
  }

  console.log('SD found:', sd.title);

  // Create PRD with correct schema
  const prdData = {
    id: `PRD-${sd.sd_key}`,
    directive_id: sd.sd_key,
    sd_id: sdId,
    title: sd.title,
    status: 'draft',
    priority: sd.priority,
    category: sd.category,
    version: '1.0',
    executive_summary: `This PRD addresses the problem of LLM-generated PRDs drifting from original SD intent by adding grounding validation to the PRD generation pipeline.

**Problem Statement:**
When LLMs generate PRDs, they hallucinate requirements that drift from original SD intent. This was discovered when SD-LEO-ENH-AUTO-PROCEED-001-13 (CLI status line integration) had its PRD generated with web UI requirements (500ms render SLA, WCAG contrast ratios, theme support) instead of CLI status line requirements.

**Solution:**
Add implementation context to SD schema and create a grounding validation step that cross-checks generated PRD against SD description, discovery documents, and implementation context.`,

    business_context: sd.rationale || 'LLM scope drift causes wasted implementation on wrong requirements, failed validation gates, and PRD rework.',

    technical_context: `The PRD generation pipeline uses LLM (OpenAI) to generate PRD content based on SD data. The current implementation lacks:
1. Implementation context awareness (CLI vs web vs API vs database)
2. Grounding validation against source documents
3. Confidence scoring for generated requirements`,

    functional_requirements: [
      {
        id: 'FR-001',
        title: 'Add implementation_context field to SD schema',
        description: 'Add a new text field to strategic_directives_v2 table that specifies the implementation context. Valid values: cli, web, api, database.',
        priority: 'high',
        status: 'pending'
      },
      {
        id: 'FR-002',
        title: 'Include implementation context in PRD generation prompts',
        description: 'Modify the LLM PRD generator (scripts/prd/llm-generator.js) to include implementation_context in the context provided to the LLM.',
        priority: 'high',
        status: 'pending'
      },
      {
        id: 'FR-003',
        title: 'Add grounding validation step after PRD generation',
        description: 'Create a validation step (lib/prd-grounding-validator.js) that checks generated PRD requirements against source SD description and discovery documents.',
        priority: 'high',
        status: 'pending'
      },
      {
        id: 'FR-004',
        title: 'Flag ungrounded requirements with confidence score',
        description: 'Requirements that cannot be traced back to source documents should be flagged with a confidence score indicating likelihood of being hallucinated.',
        priority: 'medium',
        status: 'pending'
      },
      {
        id: 'FR-005',
        title: 'Cross-check PRD against discovery documents',
        description: 'When discovery documents exist (exploration_summary), validate that PRD requirements are grounded in those documents.',
        priority: 'medium',
        status: 'pending'
      }
    ],

    non_functional_requirements: [
      {
        id: 'NFR-001',
        title: 'Grounding validation should complete within 30 seconds',
        description: 'The validation step should not significantly increase PRD generation time',
        priority: 'medium'
      },
      {
        id: 'NFR-002',
        title: 'Validation results must be human-readable',
        description: 'Flagged requirements should include clear explanations of why they were flagged',
        priority: 'high'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-001',
        title: 'Database Migration',
        description: 'Add implementation_context column to strategic_directives_v2 table',
        type: 'database'
      },
      {
        id: 'TR-002',
        title: 'PRD Generator Enhancement',
        description: 'Modify buildPRDGenerationContext() to include implementation context',
        type: 'code'
      },
      {
        id: 'TR-003',
        title: 'Grounding Validator Module',
        description: 'Create new lib/prd-grounding-validator.js module',
        type: 'code'
      }
    ],

    acceptance_criteria: [
      'AC-001: PRD generator receives implementation_context from SD and includes it in LLM prompt',
      'AC-002: Grounding validator produces confidence score (0-1) for each PRD requirement',
      'AC-003: Requirements with confidence < 0.7 are flagged as potentially ungrounded',
      'AC-004: Validation results are stored in PRD metadata.grounding_validation',
      'AC-005: Ungrounded requirements are flagged but do not block PRD creation',
      'AC-006: 80% of truly hallucinated requirements are detected (measured by manual review)'
    ],

    risks: [
      {
        id: 'R-001',
        title: 'False positives in grounding validation',
        description: 'Validator may flag legitimate requirements that are implied but not explicit in source documents',
        severity: 'medium',
        mitigation: 'Use confidence scores rather than hard blocks; allow human override'
      },
      {
        id: 'R-002',
        title: 'Increased PRD generation time',
        description: 'Adding validation step increases total PRD generation time',
        severity: 'low',
        mitigation: 'Set timeout limits; run validation asynchronously if needed'
      }
    ],

    implementation_approach: `1. **Phase 1: Schema Update**
   - Add implementation_context column to strategic_directives_v2
   - Update SD creation scripts to include implementation_context

2. **Phase 2: PRD Generator Enhancement**
   - Modify buildPRDGenerationContext() in scripts/prd/llm-generator.js
   - Include implementation context in system prompt

3. **Phase 3: Grounding Validator**
   - Create lib/prd-grounding-validator.js
   - Implement text similarity and keyword extraction
   - Generate confidence scores

4. **Phase 4: Integration**
   - Call validator after LLM PRD generation
   - Store results in PRD metadata
   - Display warnings in handoff output`,

    test_scenarios: [
      {
        id: 'TS-001',
        title: 'CLI SD generates CLI-appropriate requirements',
        description: 'When an SD has implementation_context=cli, generated PRD should not include web UI requirements',
        expected: 'No WCAG, no render SLA, no theme support requirements'
      },
      {
        id: 'TS-002',
        title: 'Ungrounded requirement detection',
        description: 'When PRD includes requirement not in SD scope, validator flags it',
        expected: 'Requirement has confidence < 0.7'
      },
      {
        id: 'TS-003',
        title: 'Grounded requirement passes',
        description: 'When PRD requirement directly traces to SD scope, validator accepts it',
        expected: 'Requirement has confidence >= 0.7'
      }
    ],

    dependencies: sd.dependencies || [],

    metadata: {
      created_via: 'manual-script',
      sd_type: sd.sd_type,
      created_at: new Date().toISOString(),
      grounding_validation: null
    },

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Check if PRD already exists
  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sdId)
    .single();

  if (existing) {
    console.log('PRD already exists, updating...');
    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(prdData)
      .eq('sd_id', sdId);

    if (updateError) {
      console.error('Error updating PRD:', updateError.message);
      process.exit(1);
    }
    console.log('PRD updated successfully!');
  } else {
    const { data: insertData, error: insertError } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select();

    if (insertError) {
      console.error('Error inserting PRD:', insertError.message);
      process.exit(1);
    }
    console.log('PRD created successfully!');
    console.log('PRD ID:', insertData[0].id);
  }

  console.log('\nSD ID:', sdId);
  console.log('Directive ID:', sd.sd_key);
}

createPRD();
