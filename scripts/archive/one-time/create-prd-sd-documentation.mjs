import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Creating PRD for SD-DOCUMENTATION-001');
console.log('='.repeat(50));

// Get SD details
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-DOCUMENTATION-001')
  .single();

if (!sd) {
  console.error('❌ SD-DOCUMENTATION-001 not found');
  process.exit(1);
}

console.log(`✅ SD found: ${sd.title}`);
console.log(`   Phase: ${sd.current_phase}, Progress: ${sd.progress}%`);
console.log('');

const prd = {
  id: 'PRD-DOCUMENTATION-001',  // Added ID field
  directive_id: 'SD-DOCUMENTATION-001',
  sd_uuid: sd.uuid_id,
  title: 'LEO Protocol Documentation Platform Integration',
  version: '1.0.0',
  status: 'draft',
  category: 'Protocol Enhancement',
  priority: 'high',

  executive_summary: 'Integrate the existing AI Documentation Generation System (SD-041C, 2,500 LOC) into LEO Protocol workflow to ensure 100% of future Strategic Directives are automatically documented. This is NOT a new implementation - it\'s a protocol integration that adds automated documentation requirements at key workflow gates.',

  business_context: '**Problem Statement**: Currently, documentation generation exists but is not enforced by LEO Protocol. This results in inconsistent documentation coverage.\n\n**Business Value**:\n- 100% SD documentation coverage (currently inconsistent)\n- Zero additional manual documentation burden\n- Onboarding efficiency for new team members\n- Knowledge retention across SD lifecycle\n- Searchable documentation repository\n\n**Existing Infrastructure**:\n- Service: src/services/doc-generator.ts (351 LOC)\n- Admin UI: /ai-docs-admin dashboard\n- Database: generated_docs table\n- Automation: scripts/generate-workflow-docs.js (1,398 LOC)\n\n**Scope**: Protocol integration ONLY - no new documentation features',

  technical_context: '**Existing System Architecture**:\n1. AI Analysis Engine: Claude API integration for content generation\n2. Documentation Service: TypeScript service layer (doc-generator.ts)\n3. Storage Layer: generated_docs table in Supabase\n4. Admin Interface: React dashboard for review/publish\n5. Automation: Node.js scripts for batch generation\n\n**Integration Points**:\n- EXEC→PLAN handoff validation\n- unified-handoff-system.js enforcement\n- CLAUDE.md documentation section\n- Dashboard visibility\n\n**Technical Constraints**:\n- Must NOT break existing handoff system\n- Must work with current RLS policies\n- Should leverage existing infrastructure\n- Zero new dependencies',

  functional_requirements: {
    FR1: {
      id: 'FR1',
      title: 'EXEC→PLAN Handoff Validation',
      description: 'Before EXEC agent can create handoff to PLAN, system must verify documentation exists in generated_docs table',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Query generated_docs table for sd_id',
        'Block handoff if 0 rows returned',
        'Allow handoff if ≥1 documentation record exists',
        'Provide clear error message if blocked'
      ]
    },
    FR2: {
      id: 'FR2',
      title: 'CLAUDE.md Documentation Section',
      description: 'Add comprehensive documentation platform guide to CLAUDE.md via database',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Section added to leo_protocol_sections table',
        'CLAUDE.md regenerated with new section',
        'Section includes EXEC requirements',
        'Section includes troubleshooting guide'
      ]
    },
    FR3: {
      id: 'FR3',
      title: 'DOCMON Sub-Agent Integration',
      description: 'Information Architecture Lead sub-agent validates documentation completeness',
      priority: 'SHOULD_HAVE',
      acceptance_criteria: [
        'DOCMON triggers on EXEC completion',
        'Validates generated_docs table',
        'Flags missing documentation as BLOCKER',
        'Provides remediation steps'
      ]
    },
    FR4: {
      id: 'FR4',
      title: 'Dashboard Visibility',
      description: 'SD dashboard shows documentation status',
      priority: 'NICE_TO_HAVE',
      acceptance_criteria: [
        'Documentation count visible in SD row',
        'Link to generated docs from SD details',
        'Status indicator (documented/not documented)'
      ]
    }
  },

  non_functional_requirements: {
    NFR1: {
      id: 'NFR1',
      title: 'Backward Compatibility',
      description: 'Must not break existing SDs or handoffs',
      requirement: 'Zero breaking changes to unified-handoff-system.js core logic',
      target: '100% existing tests pass'
    },
    NFR2: {
      id: 'NFR2',
      title: 'Performance',
      description: 'Documentation validation should not slow handoff creation',
      requirement: 'Single database query, <100ms overhead',
      target: 'Handoff creation time increase <5%'
    },
    NFR3: {
      id: 'NFR3',
      title: 'Reliability',
      description: 'Documentation check should never fail due to infrastructure',
      requirement: 'Graceful degradation if generated_docs table unavailable',
      target: '99.9% uptime for validation checks'
    }
  },

  technical_requirements: {
    TR1: {
      id: 'TR1',
      title: 'Database Query Pattern',
      description: 'Use Supabase client with RLS-aware query',
      implementation: 'const { data } = await supabase.from("generated_docs").select("id").eq("sd_id", sdId).limit(1)'
    },
    TR2: {
      id: 'TR2',
      title: 'Error Handling',
      description: 'Handle missing table, RLS errors, network failures',
      implementation: 'Try-catch with fallback to warning (not blocking) if infrastructure unavailable'
    },
    TR3: {
      id: 'TR3',
      title: 'Logging',
      description: 'Console output for debugging documentation validation',
      implementation: 'console.log with ✅/❌ indicators, clear remediation steps'
    }
  },

  implementation_approach: '**Phase 1: Protocol Integration (EXEC)**\n1. Update unified-handoff-system.js executeExecToPlan() function\n   - Add documentation validation check\n   - Query generated_docs table for sd_id\n   - Block if no documentation found\n   - Provide remediation command\n\n2. Test with SD-DOCUMENTATION-001 (self-validating)\n   - Generate documentation: node scripts/generate-workflow-docs.js --sd-id SD-DOCUMENTATION-001\n   - Verify handoff creation succeeds\n   - Test error case (no documentation)\n\n3. Git commit with conventional commit format\n   - Type: feat\n   - Scope: SD-DOCUMENTATION-001\n   - Subject: "Add documentation validation to EXEC→PLAN handoff"\n\n**Phase 2: PLAN Verification**\n1. QA Engineering Director v2.0 validation\n   - Manual review (documentation-only changes)\n   - Verify zero breaking changes to existing handoffs\n   - Confirm error messages are clear\n\n2. Create PLAN→LEAD handoff\n   - Document implementation complete\n   - Evidence: Git commit, test results\n\n**Phase 3: LEAD Approval & Retrospective**\n1. Execute lead-subagent-validation.js\n2. Generate retrospective (MANDATORY)\n3. Mark SD complete: node scripts/mark-sd-done-done.js SD-DOCUMENTATION-001\n\n**Simplicity-First Validation**: This SD passed LEAD pre-approval simplicity gate:\n- Reuses 2,500 LOC existing infrastructure ✅\n- No new dependencies ✅\n- Protocol integration only (not new features) ✅\n- 80/20 rule: 100% value with <5% new code ✅',

  acceptance_criteria: {
    AC1: {
      id: 'AC1',
      title: 'EXEC→PLAN Handoff Blocks Without Documentation',
      given: 'SD has no generated_docs records',
      when: 'EXEC agent attempts to create EXEC→PLAN handoff',
      then: 'Handoff creation fails with clear error message and remediation command'
    },
    AC2: {
      id: 'AC2',
      title: 'EXEC→PLAN Handoff Succeeds With Documentation',
      given: 'SD has ≥1 generated_docs record',
      when: 'EXEC agent attempts to create EXEC→PLAN handoff',
      then: 'Handoff creation succeeds without additional prompts'
    },
    AC3: {
      id: 'AC3',
      title: 'CLAUDE.md Updated',
      given: 'Documentation Platform section added to leo_protocol_sections',
      when: 'scripts/generate-claude-md-from-db.js is run',
      then: 'CLAUDE.md includes new section at order_index 165'
    },
    AC4: {
      id: 'AC4',
      title: 'Zero Breaking Changes',
      given: 'Existing SDs with no documentation',
      when: 'They attempt EXEC→PLAN handoff',
      then: 'They receive clear guidance but are not retroactively blocked (grace period)'
    }
  },

  test_scenarios: {
    TS1: {
      id: 'TS1',
      title: 'Self-Validation Test',
      description: 'SD-DOCUMENTATION-001 validates itself',
      steps: [
        'Generate documentation: node scripts/generate-workflow-docs.js --sd-id SD-DOCUMENTATION-001',
        'Verify generated_docs table has record',
        'Attempt EXEC→PLAN handoff',
        'Verify handoff succeeds'
      ],
      expected_result: 'Handoff creation succeeds with documentation validation passing'
    },
    TS2: {
      id: 'TS2',
      title: 'Missing Documentation Error Case',
      description: 'Test error handling when documentation missing',
      steps: [
        'Create test SD without documentation',
        'Attempt EXEC→PLAN handoff',
        'Verify clear error message',
        'Verify remediation command provided'
      ],
      expected_result: 'Handoff blocked, error message shows: "node scripts/generate-workflow-docs.js --sd-id <SD-ID>"'
    },
    TS3: {
      id: 'TS3',
      title: 'Backward Compatibility Test',
      description: 'Existing SDs not retroactively broken',
      steps: [
        'Query strategic_directives_v2 for SDs in EXEC phase',
        'Verify handoff system still functional',
        'Confirm warning message, not blocking error'
      ],
      expected_result: 'Existing SDs receive warning but can proceed (grace period)'
    }
  },

  risks: {
    R1: {
      id: 'R1',
      title: 'Breaking Existing Handoffs',
      likelihood: 'LOW',
      impact: 'HIGH',
      mitigation: 'Implement as warning first, blocking enforcement after grace period'
    },
    R2: {
      id: 'R2',
      title: 'RLS Policy Conflicts',
      likelihood: 'MEDIUM',
      impact: 'MEDIUM',
      mitigation: 'Use database sub-agent pattern, test with direct PostgreSQL connection'
    },
    R3: {
      id: 'R3',
      title: 'Documentation Generation Failures',
      likelihood: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'Graceful error handling, provide manual documentation option'
    }
  },

  constraints: {
    C1: 'Must complete within single LEO Protocol iteration (1-2 days)',
    C2: 'Cannot modify existing generated_docs table schema',
    C3: 'Must work with current Supabase RLS policies',
    C4: 'Zero budget for new infrastructure'
  },

  assumptions: {
    A1: 'Existing documentation generation system (SD-041C) is stable',
    A2: 'generated_docs table is accessible via Supabase client',
    A3: 'EXEC agents understand how to run generate-workflow-docs.js',
    A4: 'Dashboard updates will happen in separate SD (not blocking)'
  },

  phase: 'PLAN',
  progress: 0,
  created_by: 'PLAN',
  metadata: {
    sd_id: 'SD-DOCUMENTATION-001',
    protocol_version: 'v4.2.0',
    simplicity_first_validated: true,
    existing_infrastructure_loc: 2500,
    new_code_estimate_loc: 50
  }
};

console.log('Inserting PRD into database...');
const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prd)
  .select();

if (error) {
  console.error('❌ PRD creation failed:', error);
  process.exit(1);
}

console.log('✅ PRD created successfully');
console.log('   ID:', data[0].id);
console.log('   Title:', data[0].title);
console.log('   Version:', data[0].version);
console.log('   Status:', data[0].status);
console.log('   Phase:', data[0].phase);
console.log('');
console.log('✅ PLAN Phase Progress: PRD created');
console.log('   Next: Update SD progress to 30% (PRD complete)');
