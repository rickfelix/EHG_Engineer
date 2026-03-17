require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const stories = [
    {
      story_key: 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005:US-001',
      sd_id: null,
      prd_id: 'e0c9b47d-d5e9-4f6a-984f-969352ff362f',
      title: 'Enhanced Handoff Validation Error Messages with Field Paths',
      user_role: 'Claude AI agent debugging handoff validation failures',
      user_want: 'validation error messages to include precise field paths and expected formats',
      user_benefit: 'I can quickly identify and fix the exact issue without trial-and-error, reducing debugging time from 10-15 minutes to 2-3 minutes per handoff validation failure',
      given_when_then: [
        {
          id: 'AC-001-1',
          scenario: 'Happy path - Missing field error with full path',
          given: 'PLAN-TO-EXEC handoff validation runs AND exec_summary.7_element_handoff.context field is missing',
          when: 'Validation detects missing required field',
          then: 'Error message shows: "Missing field: exec_summary.7_element_handoff.context (expected: string)" AND error includes parent object path AND error includes expected type',
          test_data: {
            handoff_type: 'PLAN-TO-EXEC',
            missing_field: 'exec_summary.7_element_handoff.context',
            expected_type: 'string'
          }
        },
        {
          id: 'AC-001-2',
          scenario: 'Error path - Type mismatch with actual value type',
          given: 'Handoff validation runs AND field has wrong type (e.g., number instead of string)',
          when: 'Validation detects type mismatch',
          then: 'Error message shows: "Type mismatch: field_path (expected: string, got: number)" AND error does NOT expose sensitive field value AND error shows expected vs actual types',
          expected_error: 'Type mismatch: exec_summary.key_decisions[0].rationale (expected: string, got: number)'
        },
        {
          id: 'AC-001-3',
          scenario: 'Edge case - Nested array field missing',
          given: 'Handoff validation runs AND nested array element field is missing',
          when: 'Validation checks nested array structure',
          then: 'Error message shows full array path: "Missing field: risks[2].mitigation (expected: string)" AND error identifies specific array index',
          test_data: {
            array_path: 'risks',
            array_index: 2,
            missing_field: 'mitigation'
          }
        },
        {
          id: 'AC-001-4',
          scenario: 'Error path - Multiple validation errors',
          given: 'Handoff validation runs AND multiple fields are invalid',
          when: 'Validation detects multiple errors',
          then: 'All error messages include field paths AND errors are grouped by section AND errors show count summary',
          expected_output: 'Validation failed with 3 errors: exec_summary (2 errors), risks (1 error)'
        }
      ],
      story_points: 5,
      priority: 'high',
      implementation_context: {
        description: 'Update handoff validation error formatting to include field path context using dot notation and array indices',
        key_files: [
          'scripts/modules/handoff/validation/*-validator.js',
          'scripts/modules/handoff/validation/error-formatter.js'
        ],
        approach: 'Add field path tracking to validation traversal, sanitize sensitive values in error messages'
      },
      architecture_references: {
        similar_components: [
          'scripts/modules/handoff/validation/lead-to-plan-validator.js',
          'scripts/modules/handoff/validation/plan-to-exec-validator.js',
          'scripts/modules/handoff/validation/exec-to-plan-validator.js'
        ],
        patterns_to_follow: [
          'Error formatter pattern - centralized error message generation',
          'Field path builder pattern - track path during object traversal',
          'Validation context pattern - pass parent path through recursive validators'
        ],
        integration_points: [
          'scripts/modules/handoff/unified-handoff-system.js - Handoff orchestrator',
          'scripts/modules/handoff/validation/error-formatter.js - Centralized error formatting'
        ]
      },
      example_code_patterns: {
        field_path_builder: `function buildFieldPath(parentPath, fieldName, arrayIndex = null) {
  let path = parentPath ? parentPath + '.' + fieldName : fieldName;
  if (arrayIndex !== null) path += '[' + arrayIndex + ']';
  return path;
}`,
        error_formatter: `function formatValidationError(fieldPath, expectedType, actualType = null, message = null) {
  let error = 'Missing field: ' + fieldPath + ' (expected: ' + expectedType + ')';
  if (actualType) error = 'Type mismatch: ' + fieldPath + ' (expected: ' + expectedType + ', got: ' + actualType + ')';
  if (message) error += ' - ' + message;
  return error;
}`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Missing field error', priority: 'P0' },
          { id: 'TC-002', scenario: 'Type mismatch error', priority: 'P0' },
          { id: 'TC-003', scenario: 'Nested array field error', priority: 'P1' },
          { id: 'TC-004', scenario: 'Multiple errors grouped', priority: 'P1' }
        ]
      },
      technical_notes: ['Deeply nested objects (5+ levels)', 'Array of arrays', 'Null vs undefined vs empty string', 'Sensitive field values must be sanitized', 'Very long field paths (truncation strategy)'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005:US-002',
      sd_id: null,
      prd_id: 'e0c9b47d-d5e9-4f6a-984f-969352ff362f',
      title: 'Documentation Standards Validation for PLAN-TO-EXEC Handoff',
      user_role: 'Claude AI agent working on documentation SDs',
      user_want: 'PLAN-TO-EXEC handoff to validate that documentation standards are addressed in the PRD',
      user_benefit: 'documentation work follows project conventions from the start, preventing rework and ensuring consistency',
      given_when_then: [
        {
          id: 'AC-002-1',
          scenario: 'Happy path - Documentation SD with standards checklist passes',
          given: 'SD has type=documentation AND PLAN-TO-EXEC handoff is initiated AND PRD includes documentation standards compliance checklist',
          when: 'Handoff validation runs',
          then: 'Validation checks SD type AND validation checks PRD for standards checklist AND validation passes AND handoff proceeds to EXEC phase',
          test_data: {
            sd_type: 'documentation',
            prd_has_standards_checklist: true
          }
        },
        {
          id: 'AC-002-2',
          scenario: 'Error path - Documentation SD missing standards checklist',
          given: 'SD has type=documentation AND PLAN-TO-EXEC handoff is initiated AND PRD does NOT include documentation standards compliance checklist',
          when: 'Handoff validation runs',
          then: 'Validation fails with error: "Documentation SD requires standards compliance checklist in PRD" AND handoff is rejected AND error suggests adding standards section to PRD',
          expected_error: 'PLAN-TO-EXEC handoff failed: Documentation SD requires documentation standards compliance checklist in PRD. Add section covering: formatting, structure, examples, cross-references.'
        },
        {
          id: 'AC-002-3',
          scenario: 'Edge case - Non-documentation SD skips standards validation',
          given: 'SD has type=infrastructure (not documentation) AND PLAN-TO-EXEC handoff is initiated',
          when: 'Handoff validation runs',
          then: 'Standards checklist validation is skipped AND handoff proceeds with other standard validations',
          test_data: {
            sd_type: 'infrastructure'
          }
        },
        {
          id: 'AC-002-4',
          scenario: 'Integration - Validation rule stored in database',
          given: 'Documentation standards validation rule is created',
          when: 'Query handoff_validation_rules table',
          then: 'Rule exists with: phase=PLAN, target_phase=EXEC, rule_type=DOCUMENTATION_STANDARDS, is_active=true AND rule includes validation function reference',
          expected_query: "SELECT * FROM handoff_validation_rules WHERE rule_type='DOCUMENTATION_STANDARDS' AND phase='PLAN'"
        }
      ],
      story_points: 5,
      priority: 'medium',
      implementation_context: {
        description: 'Add documentation standards validation rule to PLAN-TO-EXEC handoff validator that checks PRD for standards checklist when SD type is documentation',
        key_files: [
          'scripts/modules/handoff/validation/plan-to-exec-validator.js',
          'database/seed/handoff_validation_rules.sql'
        ],
        approach: 'Extend PLAN-TO-EXEC validator with SD type check, add PRD content search for standards keywords, insert validation rule to database'
      },
      architecture_references: {
        similar_components: [
          'scripts/modules/handoff/validation/plan-to-exec-validator.js - Existing PLAN-TO-EXEC validation',
          'scripts/modules/handoff/validation/rule-engine.js - Dynamic rule loading'
        ],
        patterns_to_follow: [
          'Conditional validation pattern - only apply rule when SD type matches',
          'Database-driven rules - store validation rules in handoff_validation_rules table',
          'Content search pattern - search PRD for keywords like "documentation standards", "formatting", "structure"'
        ],
        integration_points: [
          'scripts/modules/handoff/unified-handoff-system.js - Handoff orchestrator',
          'handoff_validation_rules table - Dynamic rule storage'
        ]
      },
      example_code_patterns: {
        sd_type_check: `async function validateDocumentationStandards(handoffData) {
  const sd = await getSD(handoffData.sd_id);
  if (sd.sd_type !== 'documentation') return { valid: true };

  const prd = await getPRD(handoffData.prd_id);
  const hasStandards = checkForStandardsKeywords(prd.content);

  if (!hasStandards) {
    return {
      valid: false,
      error: 'Documentation SD requires standards compliance checklist in PRD'
    };
  }
  return { valid: true };
}`,
        database_rule_insert: `INSERT INTO handoff_validation_rules (phase, target_phase, rule_type, rule_name, validation_function, is_active, priority, error_message) VALUES ('PLAN', 'EXEC', 'DOCUMENTATION_STANDARDS', 'Documentation Standards Validation', 'validateDocumentationStandards', true, 50, 'Documentation SD requires documentation standards compliance checklist in PRD')`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Documentation SD with standards passes', priority: 'P0' },
          { id: 'TC-002', scenario: 'Documentation SD without standards fails', priority: 'P0' },
          { id: 'TC-003', scenario: 'Non-documentation SD skips validation', priority: 'P1' },
          { id: 'TC-004', scenario: 'Rule exists in database', priority: 'P0' }
        ]
      },
      technical_notes: ['PRD has partial standards section (how much is enough?)', 'Standards mentioned but not as checklist', 'Multiple SD types (e.g., documentation + infrastructure)', 'SD type changes after PLAN phase starts'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005:US-003',
      sd_id: null,
      prd_id: 'e0c9b47d-d5e9-4f6a-984f-969352ff362f',
      title: 'Protocol Documentation: Anti-Patterns and Gate Bypass Governance',
      user_role: 'Claude AI agent following LEO Protocol',
      user_want: 'protocol documentation that explicitly calls out anti-patterns and gate bypass requirements',
      user_benefit: 'I can avoid common failure patterns and maintain proper governance audit trails',
      given_when_then: [
        {
          id: 'AC-003-1',
          scenario: 'Happy path - Anti-pattern section exists in protocol',
          given: 'CLAUDE_CORE.md protocol file is generated from database',
          when: 'Grep CLAUDE_CORE.md for anti-pattern content',
          then: 'File contains section titled "Common Anti-Patterns" or "Anti-Patterns" AND section documents "Implementation before Documentation" pattern AND section explains why skipping LEAD/PLAN leads to gate failures AND section provides correct workflow: LEAD → PLAN → EXEC',
          test_data: {
            search_pattern: 'Implementation before Documentation',
            expected_file: 'CLAUDE_CORE.md'
          }
        },
        {
          id: 'AC-003-2',
          scenario: 'Happy path - Gate bypass protocol section exists',
          given: 'CLAUDE_EXEC.md protocol file is generated from database',
          when: 'Grep CLAUDE_EXEC.md for gate bypass content',
          then: 'File contains section titled "Gate Bypass Protocol" AND section requires justification comment for --skip-gates or --force flags AND section documents valid bypass reasons: HOTFIX, ROLLBACK, INFRASTRUCTURE_EMERGENCY, PROTOCOL_UPDATE AND section references gate_validations.bypass_reason column',
          test_data: {
            search_pattern: 'Gate Bypass Protocol',
            expected_file: 'CLAUDE_EXEC.md'
          }
        },
        {
          id: 'AC-003-3',
          scenario: 'Integration - Protocol sections stored in database',
          given: 'Protocol documentation sections are created',
          when: 'Query leo_protocol_sections table',
          then: 'Section exists with section_key=ANTI_PATTERNS AND section exists with section_key=GATE_BYPASS_PROTOCOL AND both sections have is_active=true',
          expected_query: "SELECT * FROM leo_protocol_sections WHERE section_key IN ('ANTI_PATTERNS', 'GATE_BYPASS_PROTOCOL')"
        },
        {
          id: 'AC-003-4',
          scenario: 'Edge case - Protocol regeneration includes new sections',
          given: 'New protocol sections exist in database AND leo_protocol_sections records are active',
          when: 'Run scripts/generate-claude-md-from-db.js',
          then: 'Generated CLAUDE_CORE.md includes anti-patterns section AND generated CLAUDE_EXEC.md includes gate bypass section AND no manual file edits are lost',
          test_data: {
            script_path: 'scripts/generate-claude-md-from-db.js'
          }
        }
      ],
      story_points: 3,
      priority: 'medium',
      implementation_context: {
        description: 'Add two protocol documentation sections: anti-patterns to CLAUDE_CORE.md and gate bypass protocol to CLAUDE_EXEC.md, stored in leo_protocol_sections table',
        key_files: [
          'database/seed/leo_protocol_sections.sql',
          'scripts/generate-claude-md-from-db.js',
          'CLAUDE_CORE.md (generated)',
          'CLAUDE_EXEC.md (generated)'
        ],
        approach: 'Insert new records to leo_protocol_sections table, regenerate protocol files, verify content appears in correct locations'
      },
      architecture_references: {
        similar_components: [
          'database/seed/leo_protocol_sections.sql - Existing protocol sections',
          'scripts/generate-claude-md-from-db.js - Protocol file generator'
        ],
        patterns_to_follow: [
          'Database-first protocol pattern - store sections in leo_protocol_sections, generate files',
          'Section placement pattern - use target_file and sort_order to control output',
          'Active flag pattern - use is_active to enable/disable sections'
        ],
        integration_points: [
          'leo_protocol_sections table - Protocol content storage',
          'scripts/generate-claude-md-from-db.js - Protocol file generator'
        ]
      },
      example_code_patterns: {
        section_insert_anti_patterns: `INSERT INTO leo_protocol_sections (section_key, section_title, section_content, target_file, sort_order, is_active, category, version) VALUES ('ANTI_PATTERNS', 'Common Anti-Patterns', '## Implementation Before Documentation\\n\\nSkipping LEAD/PLAN phases and jumping directly to implementation leads to...', 'CLAUDE_CORE.md', 150, true, 'guidance', '4.3.3')`,
        section_insert_gate_bypass: `INSERT INTO leo_protocol_sections (section_key, section_title, section_content, target_file, sort_order, is_active, category, version) VALUES ('GATE_BYPASS_PROTOCOL', 'Gate Bypass Protocol', '## Gate Bypass Requirements\\n\\nWhen using --skip-gates or --force flags...', 'CLAUDE_EXEC.md', 200, true, 'governance', '4.3.3')`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Anti-patterns section in CLAUDE_CORE.md', priority: 'P0' },
          { id: 'TC-002', scenario: 'Gate bypass section in CLAUDE_EXEC.md', priority: 'P0' },
          { id: 'TC-003', scenario: 'Sections stored in database', priority: 'P0' },
          { id: 'TC-004', scenario: 'Protocol regeneration includes sections', priority: 'P1' }
        ]
      },
      technical_notes: ['Multiple protocol versions active (which version gets the section?)', 'Target file does not exist (should generator create it?)', 'Section content with special markdown characters', 'Sort order conflicts with existing sections'],
      depends_on: [],
      blocks: []
    },
    {
      story_key: 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005:US-004',
      sd_id: null,
      prd_id: 'e0c9b47d-d5e9-4f6a-984f-969352ff362f',
      title: 'Verify GATE_SD_START_PROTOCOL Enforces Protocol File Read',
      user_role: 'Claude AI agent verifying protocol compliance',
      user_want: 'to confirm that GATE_SD_START_PROTOCOL enforces protocol file read before SD start',
      user_benefit: 'I can document this as the existing solution to FR-002, confirming the gate prevents protocol-unaware SD work without additional implementation',
      given_when_then: [
        {
          id: 'AC-004-1',
          scenario: 'Happy path - GATE_SD_START_PROTOCOL exists and is active',
          given: 'LEO Protocol database contains gates table',
          when: 'Query gates table for gate_key=GATE_SD_START_PROTOCOL',
          then: 'Gate record exists AND gate status=active AND gate includes protocol file read requirement in validation rules',
          test_data: {
            gate_key: 'GATE_SD_START_PROTOCOL',
            expected_status: 'active'
          }
        },
        {
          id: 'AC-004-2',
          scenario: 'Happy path - Gate checks claude_protocol_reads table',
          given: 'GATE_SD_START_PROTOCOL validation logic exists',
          when: 'Review gate validation function',
          then: 'Validation checks claude_protocol_reads table for current session AND validation requires protocol file read evidence AND validation blocks SD start if no read evidence found',
          expected_behavior: 'Gate validator queries claude_protocol_reads WHERE session_id = current AND file_path LIKE "%CLAUDE%"'
        },
        {
          id: 'AC-004-3',
          scenario: 'Edge case - New session without protocol read',
          given: 'New Claude session starts AND no protocol files read yet',
          when: 'Attempt to start SD work',
          then: 'GATE_SD_START_PROTOCOL blocks SD start AND gate provides clear error message: "Protocol files must be read before starting SD work" AND gate suggests running /leo init or reading CLAUDE_CORE.md',
          expected_error: 'GATE_SD_START_PROTOCOL failed: No protocol file reads detected in this session'
        },
        {
          id: 'AC-004-4',
          scenario: 'Documentation - FR-002 marked as resolved',
          given: 'GATE_SD_START_PROTOCOL verification is complete',
          when: 'Review PRD functional requirements',
          then: 'FR-002 is marked with resolved=true AND FR-002 rationale references GATE_SD_START_PROTOCOL as existing solution AND completion handoff documents verification evidence',
          test_data: {
            fr_id: 'FR-002',
            resolved_by: 'GATE_SD_START_PROTOCOL'
          }
        }
      ],
      story_points: 2,
      priority: 'high',
      implementation_context: {
        description: 'Verification-only story: confirm GATE_SD_START_PROTOCOL exists, review validation logic, document as resolution to FR-002. No new code required.',
        key_files: [
          'database/seed/gates.sql',
          'scripts/modules/gates/gate-validators.js',
          'database/schema/gate_validations table definition'
        ],
        approach: 'Query database, review code, update PRD to mark FR-002 as resolved'
      },
      architecture_references: {
        similar_components: [
          'scripts/modules/gates/gate-validators.js - Gate validation logic',
          'database/seed/gates.sql - Gate definitions',
          'claude_protocol_reads table - Protocol read tracking'
        ],
        patterns_to_follow: [
          'Gate validation pattern - gates table drives validation logic',
          'Session tracking pattern - claude_protocol_reads table tracks file reads per session',
          'Verification story pattern - confirm existing functionality without changes'
        ],
        integration_points: [
          'gates table - Gate definitions',
          'claude_protocol_reads table - Protocol read evidence',
          'scripts/modules/gates/gate-validators.js - Gate validation functions'
        ]
      },
      example_code_patterns: {
        gate_query: `SELECT * FROM gates WHERE gate_key = 'GATE_SD_START_PROTOCOL' AND status = 'active'`,
        protocol_read_check: `SELECT COUNT(*) FROM claude_protocol_reads WHERE session_id = $1 AND file_path LIKE '%CLAUDE%' AND read_at > NOW() - INTERVAL '1 hour'`
      },
      testing_scenarios: {
        test_cases: [
          { id: 'TC-001', scenario: 'Gate exists in database', priority: 'P0' },
          { id: 'TC-002', scenario: 'Gate validation checks protocol reads', priority: 'P0' },
          { id: 'TC-003', scenario: 'Gate blocks SD start without protocol read', priority: 'P1' },
          { id: 'TC-004', scenario: 'FR-002 documented as resolved', priority: 'P0' }
        ]
      },
      technical_notes: ['Protocol files read in previous session (stale reads)', 'Multiple sessions reading protocol files concurrently', 'Protocol file renamed or moved', 'Session ends before SD work starts (orphaned read records)'],
      depends_on: [],
      blocks: []
    }
  ];

  console.log('Creating 4 user stories for SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-005...\n');

  for (const story of stories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert({
        story_key: story.story_key,
        sd_id: story.sd_id,
        prd_id: story.prd_id,
        title: story.title,
        user_role: story.user_role,
        user_want: story.user_want,
        user_benefit: story.user_benefit,
        given_when_then: story.given_when_then,
        story_points: story.story_points,
        priority: story.priority,
        status: 'draft',
        implementation_context: story.implementation_context,
        architecture_references: story.architecture_references,
        example_code_patterns: story.example_code_patterns,
        testing_scenarios: story.testing_scenarios,
        technical_notes: story.technical_notes,
        depends_on: story.depends_on,
        blocks: story.blocks,
        validation_status: 'pending',
        e2e_test_status: 'not_created',
        created_by: 'STORIES-AGENT-v2.0.0'
      })
      .select();

    if (error) {
      console.error(`Error inserting story ${story.story_key}:`, error);
      continue;
    }

    console.log(`✓ Created: ${story.story_key} - ${story.title}`);
  }

  console.log('\n✓ All user stories created successfully');
  console.log('\nSummary:');
  console.log('- US-LEARN-005-001: Enhanced handoff validation error messages (5 points, Priority: high)');
  console.log('- US-LEARN-005-002: Documentation standards validation (5 points, Priority: medium)');
  console.log('- US-LEARN-005-003: Protocol anti-patterns and gate bypass documentation (3 points, Priority: medium)');
  console.log('- US-LEARN-005-004: Verify GATE_SD_START_PROTOCOL (2 points, Priority: high)');
  console.log('\nTotal story points: 15');
})();
