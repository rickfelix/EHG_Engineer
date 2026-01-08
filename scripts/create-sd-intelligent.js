#!/usr/bin/env node

/**
 * Intelligent Strategic Directive Creation
 *
 * Analyzes input (description, conversation context, or file) and:
 * 1. Auto-generates all SD fields
 * 2. Determines parent/child/grandchild architecture
 * 3. Creates the SD(s) in the database
 *
 * Usage:
 *   node scripts/create-sd-intelligent.js --description "Build a portfolio dashboard"
 *   node scripts/create-sd-intelligent.js --file brainstorm/my-idea.md
 *   echo "Build X feature" | node scripts/create-sd-intelligent.js --stdin
 *
 * LEO Protocol v4.3.3
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import dotenv from 'dotenv';
import { generateDocumentationDeliverables } from './modules/sd-type-documentation-templates.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// DECOMPOSITION CRITERIA (from CLAUDE_LEAD.md)
// ============================================================

const DECOMPOSITION_CRITERIA = {
  userStoryThreshold: 8,      // ≥8 stories → consider decomposition
  phaseThreshold: 3,          // 3+ distinct phases → consider decomposition
  durationWeeksThreshold: 2,  // >2 weeks → consider decomposition
  complexityKeywords: [
    'multiple systems', 'cross-cutting', 'full stack', 'end-to-end',
    'migration', 'refactor entire', 'platform', 'framework',
    'authentication', 'authorization', 'multi-tenant', 'scalability'
  ]
};

// ============================================================
// LLM PROMPT FOR SD ANALYSIS
// ============================================================

const SD_ANALYSIS_PROMPT = `You are an expert Strategic Directive analyst for the LEO Protocol.

Analyze the following input and generate a complete Strategic Directive specification.

## REFERENCE: TEST MANAGEMENT SYSTEM

All SDs must comply with the LEO Protocol v4.4.2 Testing Governance:

**Test Management Components** (docs/test-management/README.md):
- test-scanner.js - Discover and register tests
- test-selection.js - Smart test selection by risk
- test-automation.js - Watch mode and parallel execution
- test-llm-core.js - AI-powered test analysis
- test-result-capture.js - CI/CD integration

**Testing Governance Gates** (LEO v4.4.2):
- MANDATORY_TESTING_VALIDATION: Blocks handoff without fresh test evidence (<24h)
- TEST_EVIDENCE_AUTO_CAPTURE: Auto-ingests test reports
- Story-to-test linkage required for code-producing SDs

**Database Tables for Testing**:
- uat_test_suites, uat_test_cases, test_runs, test_failures, uat_coverage_metrics
- story_test_mappings (links tests to user stories)

## SD TYPES AND VALIDATION REQUIREMENTS

Each SD type has specific testing and documentation requirements:

### CODE-PRODUCING TYPES (require full testing)
| Type | Testing | Documentation |
|------|---------|---------------|
| **feature** | E2E + Unit + UAT required, LLM UX validation | User guide, API docs |
| **enhancement** | E2E + Unit (UAT optional) | Feature update docs |
| **bugfix** | E2E + Unit + UAT required | Bug fix notes |
| **refactor** | Unit tests, regression tests | Technical docs |
| **performance** | Performance tests, benchmarks | Perf optimization docs |
| **security** | Security tests, auth tests | Security docs |

### NON-CODE TYPES (skip E2E, lighter validation)
| Type | Testing | Documentation |
|------|---------|---------------|
| **infrastructure** | CLI verification only | Setup/ops guide |
| **documentation** | None required | The docs themselves |
| **orchestrator** | Via children completion | Architecture overview |
| **database** | Migration tests only | Schema docs |

## DOCUMENTATION REQUIREMENTS BY SD TYPE (from sd-type-documentation-templates.js)

Each SD type has specific documentation deliverables:

### feature
- **Required Sections**: PRD, User Stories, Test Plan, Architecture, Release Notes
- **PRD Emphasis**: Full PRD with functional requirements, acceptance criteria, and test scenarios
- **Checklist**: PRD approved, User stories with acceptance criteria, E2E coverage, Architecture decisions, Release notes
- **Min PRD Requirements**: 5 functional requirements, 5 acceptance criteria, 5 test scenarios
- **Requires Architecture**: Yes
- **Requires Risks**: Yes

### infrastructure
- **Required Sections**: Configuration Spec, Implementation Notes, Validation Checklist
- **PRD Emphasis**: Configuration specification with infrastructure requirements
- **Checklist**: Infrastructure requirements documented, Configuration changes listed, Validation checklist complete
- **Min PRD Requirements**: 2 functional requirements, 2 acceptance criteria, 0 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: No

### database
- **Required Sections**: Migration Script, Schema Changes, Rollback Plan, RLS Policies
- **PRD Emphasis**: Schema design, migration plan, and data impact analysis
- **Checklist**: Migration script tested, Schema changes documented, Rollback plan verified, RLS policies reviewed
- **Min PRD Requirements**: 3 functional requirements, 3 acceptance criteria, 2 test scenarios
- **Requires Architecture**: Yes
- **Requires Risks**: Yes

### security
- **Required Sections**: Threat Model, Security Controls, Audit Trail, Compliance Check
- **PRD Emphasis**: Security requirements with threat analysis and control measures
- **Checklist**: Threat model documented, Security controls implemented, Audit trail enabled, Compliance requirements met
- **Min PRD Requirements**: 5 functional requirements, 5 acceptance criteria, 5 test scenarios
- **Requires Architecture**: Yes
- **Requires Risks**: Yes

### bugfix
- **Required Sections**: Root Cause Analysis, Fix Implementation, Regression Tests
- **PRD Emphasis**: Root cause identification and targeted fix approach
- **Checklist**: Root cause documented, Fix implementation verified, Regression tests added
- **Min PRD Requirements**: 2 functional requirements, 3 acceptance criteria, 2 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: No

### refactor
- **Required Sections**: Refactoring Scope, Before/After Analysis, Test Coverage
- **PRD Emphasis**: Code improvement goals with backward compatibility notes
- **Checklist**: Refactoring scope defined, Backward compatibility verified, Test coverage maintained
- **Min PRD Requirements**: 2 functional requirements, 3 acceptance criteria, 3 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: Yes

### performance
- **Required Sections**: Baseline Metrics, Optimization Targets, Benchmark Results
- **PRD Emphasis**: Performance baseline and optimization targets with measurement approach
- **Checklist**: Baseline metrics captured, Optimization targets set, Benchmark results documented
- **Min PRD Requirements**: 3 functional requirements, 4 acceptance criteria, 3 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: Yes

### documentation (sd_type)
- **Required Sections**: Content Outline, Target Audience, Review Checklist
- **PRD Emphasis**: Documentation scope with target audience and format requirements
- **Checklist**: Content outline complete, Target audience defined, Format consistency verified
- **Min PRD Requirements**: 2 functional requirements, 2 acceptance criteria, 0 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: No

### orchestrator
- **Required Sections**: Child SD Summary, Completion Criteria, Coordination Notes
- **PRD Emphasis**: High-level overview with child SD coordination requirements
- **Checklist**: Child SDs defined, Completion criteria clear, Dependencies documented
- **Min PRD Requirements**: 1 functional requirement, 2 acceptance criteria, 0 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: No

### enhancement
- **Required Sections**: Enhancement Spec, User Impact, Test Updates
- **PRD Emphasis**: Enhancement scope with impact on existing features
- **Checklist**: Enhancement scope defined, Backward compatibility verified, Existing tests updated
- **Min PRD Requirements**: 3 functional requirements, 3 acceptance criteria, 3 test scenarios
- **Requires Architecture**: No
- **Requires Risks**: No

## DECOMPOSITION RULES

Determine the appropriate SD architecture:

**STANDALONE SD** (default):
- < 8 user stories
- Single phase of work
- 1-2 weeks duration
- Focused scope

**PARENT + CHILDREN SDs**:
- ≥ 8 user stories
- 3+ distinct phases
- > 2 weeks duration
- Multiple components/subsystems
- Parent type should be "orchestrator"

**PARENT + CHILDREN + GRANDCHILDREN SDs**:
- Very large scope (> 20 user stories)
- Children themselves need decomposition
- Multi-month project
- Parent and intermediate nodes are "orchestrator" type

## OUTPUT FORMAT

Return a JSON object with this structure:

{
  "analysis": {
    "estimated_user_stories": <number>,
    "estimated_phases": <number>,
    "estimated_duration_weeks": <number>,
    "complexity_factors": [<list of complexity factors>],
    "architecture_recommendation": "standalone" | "parent_children" | "parent_children_grandchildren",
    "architecture_rationale": "<why this architecture>"
  },
  "sds": [
    {
      "id": "SD-XXX-001",
      "sd_key": "XXX-001",
      "title": "<title>",
      "category": "feature" | "infrastructure" | "database" | "security" | "documentation" | "refactor",
      "priority": "critical" | "high" | "medium" | "low",
      "sd_type": "feature" | "infrastructure" | "database" | "security" | "documentation" | "refactor",
      "description": "<detailed description>",
      "strategic_intent": "<why this matters strategically>",
      "rationale": "<business justification>",
      "scope": "<what's included, with TESTING and DOCUMENTATION components>",
      "strategic_objectives": ["<objective 1>", "<objective 2>", "TESTING: <test objective>", "DOCUMENTATION: <doc objective>"],
      "success_criteria": ["<criterion 1>", "<criterion 2>", "TESTING: <test criterion>", "DOCUMENTATION: <doc criterion>"],
      "key_changes": ["<change 1>", "<change 2>"],
      "key_principles": ["<principle 1>", "<principle 2>"],
      "relationship_type": "standalone" | "parent" | "child_phase" | "grandchild",
      "parent_sd_id": null | "<parent SD id>",
      "metadata": {
        "estimated_effort_hours": <number>,
        "track": "A" | "B" | "C",
        "risks": [{"type": "<type>", "description": "<desc>", "probability": "low|medium|high", "impact": "low|medium|high", "mitigation": "<mitigation>"}],
        "testing_requirements": {
          "skip_code_validation": <boolean based on sd_type>,
          "requires_e2e": <boolean>,
          "requires_unit_tests": <boolean>,
          "requires_uat": <boolean>,
          "requires_regression": <boolean>,
          "test_types": ["<list based on sd_type>"],
          "coverage_percent": <number>
        },
        "documentation_requirements": {
          "required_sections": ["<based on sd_type - see DOCUMENTATION REQUIREMENTS section>"],
          "prd_emphasis": "<what PRD should focus on based on sd_type>",
          "documentation_checklist": ["<checklist items based on sd_type>"],
          "min_functional_requirements": <number based on sd_type>,
          "min_acceptance_criteria": <number based on sd_type>,
          "min_test_scenarios": <number based on sd_type>,
          "requires_architecture": <boolean based on sd_type>,
          "requires_risks": <boolean based on sd_type>
        }
      }
    }
  ]
}

## TYPE-SPECIFIC TESTING RULES (CRITICAL)

When determining testing_requirements, use these rules:

For **feature** type:
- skip_code_validation: false
- requires_e2e: true
- requires_unit_tests: true
- requires_uat: true
- test_types: ["e2e", "unit", "integration", "uat"]
- coverage_percent: 80

For **enhancement** type:
- skip_code_validation: false
- requires_e2e: true
- requires_unit_tests: true
- requires_uat: false
- test_types: ["e2e", "unit", "integration"]
- coverage_percent: 70

For **bugfix** type:
- skip_code_validation: false
- requires_e2e: true
- requires_unit_tests: true
- requires_uat: true
- test_types: ["e2e", "unit", "regression"]
- coverage_percent: 80

For **infrastructure** type:
- skip_code_validation: true
- requires_e2e: false
- requires_unit_tests: false
- requires_uat: false
- test_types: ["cli_verification"]
- coverage_percent: 0

For **documentation** type:
- skip_code_validation: true
- requires_e2e: false
- requires_unit_tests: false
- requires_uat: false
- test_types: []
- coverage_percent: 0

For **database** type:
- skip_code_validation: true
- requires_e2e: false
- requires_unit_tests: false
- requires_uat: false
- test_types: ["migration_test"]
- coverage_percent: 0

For **orchestrator** (parent) type:
- skip_code_validation: true
- requires_e2e: false
- requires_unit_tests: false
- requires_uat: false
- test_types: []
- coverage_percent: 0
- Note: Children handle actual testing

## TYPE-SPECIFIC DOCUMENTATION RULES (CRITICAL)

When determining documentation_requirements, use these rules:

For **feature** type:
- required_sections: ["PRD", "User Stories", "Test Plan", "Architecture", "Release Notes"]
- prd_emphasis: "Full PRD with functional requirements, acceptance criteria, and test scenarios"
- min_functional_requirements: 5
- min_acceptance_criteria: 5
- min_test_scenarios: 5
- requires_architecture: true
- requires_risks: true

For **enhancement** type:
- required_sections: ["Enhancement Spec", "User Impact", "Test Updates"]
- prd_emphasis: "Enhancement scope with impact on existing features"
- min_functional_requirements: 3
- min_acceptance_criteria: 3
- min_test_scenarios: 3
- requires_architecture: false
- requires_risks: false

For **bugfix** type:
- required_sections: ["Root Cause Analysis", "Fix Implementation", "Regression Tests"]
- prd_emphasis: "Root cause identification and targeted fix approach"
- min_functional_requirements: 2
- min_acceptance_criteria: 3
- min_test_scenarios: 2
- requires_architecture: false
- requires_risks: false

For **infrastructure** type:
- required_sections: ["Configuration Spec", "Implementation Notes", "Validation Checklist"]
- prd_emphasis: "Configuration specification with infrastructure requirements"
- min_functional_requirements: 2
- min_acceptance_criteria: 2
- min_test_scenarios: 0
- requires_architecture: false
- requires_risks: false

For **documentation** type:
- required_sections: ["Content Outline", "Target Audience", "Review Checklist"]
- prd_emphasis: "Documentation scope with target audience and format requirements"
- min_functional_requirements: 2
- min_acceptance_criteria: 2
- min_test_scenarios: 0
- requires_architecture: false
- requires_risks: false

For **database** type:
- required_sections: ["Migration Script", "Schema Changes", "Rollback Plan", "RLS Policies"]
- prd_emphasis: "Schema design, migration plan, and data impact analysis"
- min_functional_requirements: 3
- min_acceptance_criteria: 3
- min_test_scenarios: 2
- requires_architecture: true
- requires_risks: true

For **security** type:
- required_sections: ["Threat Model", "Security Controls", "Audit Trail", "Compliance Check"]
- prd_emphasis: "Security requirements with threat analysis and control measures"
- min_functional_requirements: 5
- min_acceptance_criteria: 5
- min_test_scenarios: 5
- requires_architecture: true
- requires_risks: true

For **refactor** type:
- required_sections: ["Refactoring Scope", "Before/After Analysis", "Test Coverage"]
- prd_emphasis: "Code improvement goals with backward compatibility notes"
- min_functional_requirements: 2
- min_acceptance_criteria: 3
- min_test_scenarios: 3
- requires_architecture: false
- requires_risks: true

For **performance** type:
- required_sections: ["Baseline Metrics", "Optimization Targets", "Benchmark Results"]
- prd_emphasis: "Performance baseline and optimization targets with measurement approach"
- min_functional_requirements: 3
- min_acceptance_criteria: 4
- min_test_scenarios: 3
- requires_architecture: false
- requires_risks: true

For **orchestrator** (parent) type:
- required_sections: ["Child SD Summary", "Completion Criteria", "Coordination Notes"]
- prd_emphasis: "High-level overview with child SD coordination requirements"
- min_functional_requirements: 1
- min_acceptance_criteria: 2
- min_test_scenarios: 0
- requires_architecture: false
- requires_risks: false
- Note: Documentation responsibilities delegated to children

## FINAL DOCUMENTATION DELIVERABLES BY SD TYPE (post-EXEC completion)

These are the documentation deliverables required AFTER testing is complete, before SD can be marked done:

For **feature** type:
- REQUIRED: user_guide (End-user docs), release_notes, technical_doc (architecture/implementation)
- OPTIONAL: api_reference, faq
- auto_generate: true, requires_review: true

For **enhancement** type:
- REQUIRED: feature_update (updated docs), changelog_entry
- OPTIONAL: migration_notes
- auto_generate: true, requires_review: false

For **bugfix** type:
- REQUIRED: root_cause_analysis, fix_verification
- OPTIONAL: prevention_guide
- auto_generate: true, requires_review: false

For **infrastructure** type:
- REQUIRED: ops_guide (operations/setup), configuration_reference
- OPTIONAL: runbook, troubleshooting
- auto_generate: true, requires_review: false

For **database** type:
- REQUIRED: schema_reference, migration_log
- OPTIONAL: data_dictionary, query_examples
- auto_generate: true, requires_review: true

For **security** type:
- REQUIRED: security_assessment, auth_flow_doc, compliance_report
- OPTIONAL: penetration_test_results, security_runbook
- auto_generate: false, requires_review: true

For **refactor** type:
- REQUIRED: refactor_summary, regression_verification
- OPTIONAL: architecture_update, code_patterns
- auto_generate: true, requires_review: false

For **performance** type:
- REQUIRED: benchmark_report, optimization_summary
- OPTIONAL: performance_guide, monitoring_setup
- auto_generate: true, requires_review: true

For **documentation** type:
- REQUIRED: documentation_itself (the SD output IS the documentation)
- OPTIONAL: style_guide_updates
- auto_generate: false, requires_review: true

For **orchestrator** type:
- REQUIRED: completion_summary (aggregates child completions)
- OPTIONAL: architecture_overview, lessons_learned
- auto_generate: true, requires_review: false

## CATEGORY DETECTION RULES

- "feature": User-facing functionality, UI, workflows
- "infrastructure": CI/CD, tooling, protocols, internal systems
- "database": Schema changes, migrations, queries
- "security": Auth, permissions, RLS, encryption
- "documentation": Docs only, no code changes
- "refactor": Code restructuring, no behavior change

## PRIORITY DETECTION RULES

- "critical": Blocking issues, security vulnerabilities, production down
- "high": Important for current milestone, user-requested
- "medium": Should do soon, improves quality
- "low": Nice to have, future enhancement

## TRACK ASSIGNMENT

- Track A: Infrastructure, safety, core systems
- Track B: Features, stages, user-facing
- Track C: Quality, testing, verification

## IMPORTANT

1. ALWAYS include TESTING and DOCUMENTATION in scope, objectives, and success_criteria
2. Generate realistic effort estimates
3. Identify specific risks with mitigations
4. If decomposing, create ALL child SDs in the output
`;

// ============================================================
// MAIN FUNCTION
// ============================================================

async function createIntelligentSD(input, options = {}) {
  console.log('🧠 Intelligent SD Creation');
  console.log('═'.repeat(60));

  // Get OpenAI client
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  console.log('📝 Analyzing input...\n');
  console.log('Input:', input.substring(0, 200) + (input.length > 200 ? '...' : ''));
  console.log();

  try {
    // Call LLM to analyze and generate SD spec
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: SD_ANALYSIS_PROMPT },
        { role: 'user', content: `Analyze this and generate Strategic Directive(s):\n\n${input}` }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Display analysis
    console.log('📊 ANALYSIS');
    console.log('─'.repeat(60));
    console.log(`Estimated User Stories: ${result.analysis.estimated_user_stories}`);
    console.log(`Estimated Phases: ${result.analysis.estimated_phases}`);
    console.log(`Estimated Duration: ${result.analysis.estimated_duration_weeks} weeks`);
    console.log(`Complexity Factors: ${result.analysis.complexity_factors.join(', ')}`);
    console.log(`\n🏗️  Architecture: ${result.analysis.architecture_recommendation.toUpperCase()}`);
    console.log(`Rationale: ${result.analysis.architecture_rationale}`);
    console.log();

    // Display proposed SDs
    console.log('📋 PROPOSED STRATEGIC DIRECTIVES');
    console.log('─'.repeat(60));

    for (const sd of result.sds) {
      const indent = sd.relationship_type === 'child_phase' ? '  └─ ' :
                     sd.relationship_type === 'grandchild' ? '      └─ ' : '';
      console.log(`${indent}${sd.id}: ${sd.title}`);
      console.log(`${indent}   Category: ${sd.category} | Priority: ${sd.priority} | Type: ${sd.sd_type}`);
      console.log(`${indent}   Effort: ${sd.metadata.estimated_effort_hours}h | Track: ${sd.metadata.track}`);
      if (sd.parent_sd_id) {
        console.log(`${indent}   Parent: ${sd.parent_sd_id}`);
      }
      console.log();
    }

    // If dry run, stop here
    if (options.dryRun) {
      console.log('─'.repeat(60));
      console.log('🔍 DRY RUN - No changes made');
      console.log('Run without --dry-run to create these SDs');
      return result;
    }

    // Confirm creation
    if (!options.yes) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => {
        rl.question('\nCreate these SDs? [Y/n]: ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() === 'n') {
        console.log('Cancelled.');
        return null;
      }
    }

    // Create SDs in database
    console.log('\n📥 Creating SDs in database...');

    for (const sd of result.sds) {
      const sdRecord = {
        id: sd.id,
        sd_key: sd.sd_key,
        title: sd.title,
        version: '1.0',
        status: 'draft',
        category: sd.category,
        priority: sd.priority,
        sd_type: sd.sd_type,
        current_phase: 'LEAD',
        target_application: sd.category === 'feature' ? 'EHG' : 'EHG_Engineer',
        description: sd.description,
        strategic_intent: sd.strategic_intent,
        rationale: sd.rationale,
        scope: sd.scope,
        strategic_objectives: sd.strategic_objectives,
        success_criteria: sd.success_criteria,
        key_changes: sd.key_changes,
        key_principles: sd.key_principles,
        relationship_type: sd.relationship_type,
        parent_sd_id: sd.parent_sd_id,
        metadata: {
          ...sd.metadata,
          source: 'Intelligent SD Creation',
          created_via: 'create-sd-intelligent.js',
          analysis: result.analysis
        },
        created_by: 'LEAD-Intelligent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert(sdRecord, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating ${sd.id}:`, error.message);
      } else {
        console.log(`✅ Created: ${sd.id}`);

        // Auto-create documentation deliverables based on SD type
        const docDeliverables = generateDocumentationDeliverables(sd.id, sd.sd_type);
        if (docDeliverables.length > 0) {
          const { error: deliverableError } = await supabase
            .from('sd_scope_deliverables')
            .insert(docDeliverables);

          if (deliverableError) {
            console.error(`   ⚠️  Warning: Could not create doc deliverables: ${deliverableError.message}`);
          } else {
            console.log(`   📄 Created ${docDeliverables.length} documentation deliverables`);
          }
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 SD creation complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Run: npm run sd:next to see the queue');
    console.log('2. Review and approve each SD');
    console.log('3. Run: node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>');

    return result;

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// ============================================================
// CLI HANDLING
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  let input = '';
  const options = {
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes') || args.includes('-y')
  };

  // Get input from various sources
  const descIdx = args.indexOf('--description');
  const fileIdx = args.indexOf('--file');
  const stdinFlag = args.includes('--stdin');

  if (descIdx !== -1 && args[descIdx + 1]) {
    input = args[descIdx + 1];
  } else if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = args[fileIdx + 1];
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    input = fs.readFileSync(filePath, 'utf8');
  } else if (stdinFlag || !process.stdin.isTTY) {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks).toString('utf8');
  } else {
    console.log('Usage:');
    console.log('  node scripts/create-sd-intelligent.js --description "Build a portfolio dashboard"');
    console.log('  node scripts/create-sd-intelligent.js --file brainstorm/my-idea.md');
    console.log('  echo "Build X feature" | node scripts/create-sd-intelligent.js --stdin');
    console.log('\nOptions:');
    console.log('  --dry-run    Analyze only, do not create SDs');
    console.log('  --yes, -y    Skip confirmation prompt');
    process.exit(0);
  }

  if (!input.trim()) {
    console.error('❌ No input provided');
    process.exit(1);
  }

  await createIntelligentSD(input, options);
}

main().catch(console.error);

export { createIntelligentSD };
