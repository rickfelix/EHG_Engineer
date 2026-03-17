/**
 * Complete PRD for SD-LEO-SELF-IMPROVE-FOUND-001 (Phase 0: Foundation)
 *
 * This script populates the PRD with all implementation details from the
 * triangulated plan document, following LEO protocol for quality completion.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function completePRD() {
  const sdId = 'SD-LEO-SELF-IMPROVE-FOUND-001';

  console.log('📋 Completing PRD for', sdId);

  const prdUpdate = {
    // Executive Summary
    executive_summary: `Phase 0 establishes the database infrastructure for the LEO Self-Improvement Loop. This foundation phase creates new tables and columns required for the AI-assisted protocol improvement system, including risk tier classification, quality assessment storage, pattern resolution tracking, and the immutable constitution table.

This is a database-only phase with zero application code changes. The infrastructure created here will be consumed by subsequent phases (AI Quality Judge, Risk Classification, etc.). The key deliverable is a working database schema that allows improvements to be classified by risk tier (IMMUTABLE/GOVERNED/AUTO), scored by AI judges, and tracked for effectiveness.

Critical safety measure: The protocol_constitution table is protected by RLS policies that prevent any DELETE or UPDATE operations, making the 9 constitution rules truly immutable once seeded.`,

    // Business Context
    business_context: `The LEO Protocol currently lacks a self-improvement mechanism. Retrospectives generate insights and pattern detection identifies recurring issues, but there is no systematic way to translate these into protocol improvements.

This foundation phase enables:
- Risk-tiered governance of protocol changes
- AI-assisted quality scoring for proposed improvements
- Evidence-based tracking of improvement effectiveness
- Immutable constitution rules that cannot be modified by the system`,

    // Technical Context
    technical_context: `Existing Infrastructure:
- protocol_improvement_queue table (stores proposed improvements)
- leo_protocol_sections table (stores protocol content)
- retrospective system (generates insights)

New Infrastructure (this phase):
- protocol_constitution table (9 immutable rules)
- improvement_quality_assessments table (AI scoring)
- pattern_resolution_signals table (evidence tracking)
- risk_tier column on protocol_improvement_queue
- priority column on leo_protocol_sections
- effectiveness tracking columns on protocol_improvement_queue

All changes are additive - no existing columns or tables are modified in ways that would break current functionality.`,

    // Functional Requirements
    functional_requirements: [
      {
        id: "FR-1",
        priority: "CRITICAL",
        requirement: "Create protocol_constitution table for immutable rules",
        description: "A new table to store constitution rules that cannot be modified by the self-improvement system. Rules like 'human approval required' and 'no self-approval' must be permanently protected.",
        acceptance_criteria: [
          "Table protocol_constitution exists with columns: id (UUID), rule_code (VARCHAR(50) UNIQUE), rule_text (TEXT NOT NULL), category (VARCHAR(50)), rationale (TEXT), created_at (TIMESTAMPTZ)",
          "RLS policy prevents all DELETE operations on the table",
          "RLS policy prevents all UPDATE operations on the table",
          "INSERT operations are allowed (for initial seeding only)"
        ]
      },
      {
        id: "FR-2",
        priority: "CRITICAL",
        requirement: "Add risk_tier classification to improvement queue",
        description: "Enable classification of proposed improvements into IMMUTABLE, GOVERNED, or AUTO tiers for appropriate governance routing.",
        acceptance_criteria: [
          "Column risk_tier added to protocol_improvement_queue with CHECK constraint",
          "Valid values: 'IMMUTABLE', 'GOVERNED', 'AUTO'",
          "Default value: 'GOVERNED'",
          "Existing rows migrated to 'GOVERNED' tier"
        ]
      },
      {
        id: "FR-3",
        priority: "HIGH",
        requirement: "Create improvement_quality_assessments table",
        description: "Store AI quality judge evaluations for proposed improvements, including scores, criteria breakdowns, and recommendations.",
        acceptance_criteria: [
          "Table exists with required columns: id, improvement_id (FK), evaluator_model, score (0-100), criteria_scores (JSONB), recommendation, reasoning, evaluated_at",
          "Foreign key constraint to protocol_improvement_queue(id)",
          "Score column has CHECK constraint BETWEEN 0 AND 100"
        ]
      },
      {
        id: "FR-4",
        priority: "HIGH",
        requirement: "Add priority hierarchy to protocol sections",
        description: "Enable classification of protocol sections as CORE (constitution-level), STANDARD (normal rules), or SITUATIONAL (context-dependent).",
        acceptance_criteria: [
          "Column priority added to leo_protocol_sections",
          "Valid values: 'CORE', 'STANDARD', 'SITUATIONAL'",
          "Default value: 'STANDARD'"
        ]
      },
      {
        id: "FR-5",
        priority: "HIGH",
        requirement: "Create pattern_resolution_signals table",
        description: "Track signals that indicate when patterns (recurring issues) have been resolved, enabling evidence-based improvement tracking.",
        acceptance_criteria: [
          "Table exists with columns: id, pattern_id, signal_type, signal_source, confidence, detected_at",
          "Confidence column is DECIMAL(3,2) for 0.00-1.00 range"
        ]
      },
      {
        id: "FR-6",
        priority: "MEDIUM",
        requirement: "Add effectiveness tracking columns",
        description: "Enable tracking of improvement effectiveness by storing baseline metrics, post-change metrics, and rollback reasons.",
        acceptance_criteria: [
          "Columns added to protocol_improvement_queue: effectiveness_measured_at (TIMESTAMPTZ), baseline_metric (JSONB), post_metric (JSONB), rollback_reason (TEXT)",
          "Existing rows have NULL values for new columns (acceptable)"
        ]
      },
      {
        id: "FR-7",
        priority: "CRITICAL",
        requirement: "Seed 9 constitution rules",
        description: "Insert the 9 immutable constitution rules that govern the self-improvement system.",
        acceptance_criteria: [
          "CONST-001 through CONST-009 inserted into leo_protocol_sections with section_type='constitution'",
          "All rules have priority='CORE'",
          "SELECT COUNT(*) WHERE section_type='constitution' = 9"
        ]
      }
    ],

    // Technical Requirements
    technical_requirements: [
      {
        id: "TR-1",
        requirement: "Single migration file for all Phase 0 changes",
        description: "All database changes must be in a single, atomic migration file",
        dependencies: ["Supabase PostgreSQL", "Existing protocol_improvement_queue table", "Existing leo_protocol_sections table"]
      },
      {
        id: "TR-2",
        requirement: "RLS policies for constitution protection",
        description: "Row Level Security policies must prevent DELETE and UPDATE on protocol_constitution",
        dependencies: ["Supabase RLS"]
      },
      {
        id: "TR-3",
        requirement: "Backward compatibility with existing pipeline",
        description: "Existing scripts (protocol-improvements.js list, etc.) must continue to work",
        dependencies: ["scripts/modules/protocol-improvements/*.js"]
      }
    ],

    // Data Model
    data_model: {
      tables: [
        {
          name: "protocol_constitution",
          description: "Stores immutable constitution rules for self-improvement governance",
          columns: [
            "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
            "rule_code VARCHAR(50) UNIQUE NOT NULL",
            "rule_text TEXT NOT NULL",
            "category VARCHAR(50)",
            "rationale TEXT",
            "created_at TIMESTAMPTZ DEFAULT NOW()"
          ],
          relationships: [],
          rls_policies: ["no_delete_constitution: FOR DELETE USING (false)", "no_update_constitution: FOR UPDATE USING (false)"]
        },
        {
          name: "improvement_quality_assessments",
          description: "Stores AI quality judge evaluations for proposed improvements",
          columns: [
            "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
            "improvement_id UUID REFERENCES protocol_improvement_queue(id)",
            "evaluator_model VARCHAR(50)",
            "score INTEGER CHECK (score BETWEEN 0 AND 100)",
            "criteria_scores JSONB",
            "recommendation VARCHAR(20)",
            "reasoning TEXT",
            "evaluated_at TIMESTAMPTZ DEFAULT NOW()"
          ],
          relationships: ["FK to protocol_improvement_queue(id)"]
        },
        {
          name: "pattern_resolution_signals",
          description: "Tracks signals indicating when patterns have been resolved",
          columns: [
            "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
            "pattern_id VARCHAR(50)",
            "signal_type VARCHAR(50)",
            "signal_source TEXT",
            "confidence DECIMAL(3,2)",
            "detected_at TIMESTAMPTZ DEFAULT NOW()"
          ],
          relationships: []
        }
      ],
      alterations: [
        {
          table: "protocol_improvement_queue",
          changes: [
            "ADD COLUMN risk_tier VARCHAR(20) DEFAULT 'GOVERNED' CHECK (risk_tier IN ('IMMUTABLE', 'GOVERNED', 'AUTO'))",
            "ADD COLUMN effectiveness_measured_at TIMESTAMPTZ",
            "ADD COLUMN baseline_metric JSONB",
            "ADD COLUMN post_metric JSONB",
            "ADD COLUMN rollback_reason TEXT"
          ]
        },
        {
          table: "leo_protocol_sections",
          changes: [
            "ADD COLUMN priority VARCHAR(20) DEFAULT 'STANDARD' CHECK (priority IN ('CORE', 'STANDARD', 'SITUATIONAL'))"
          ]
        }
      ]
    },

    // Acceptance Criteria
    acceptance_criteria: [
      "All database objects created successfully (migration completes without error)",
      "RLS policies prevent DELETE on protocol_constitution (test returns error)",
      "RLS policies prevent UPDATE on protocol_constitution (test returns error)",
      "9 constitution rules seeded (SELECT COUNT(*) = 9)",
      "Existing protocol-improvements.js list command still works",
      "No breaking changes to existing pipeline functionality",
      "All CHECK constraints validated (invalid values rejected)"
    ],

    // Test Scenarios
    test_scenarios: [
      {
        id: "TS-1",
        name: "Constitution Immutability - DELETE Prevention",
        steps: ["Attempt DELETE FROM protocol_constitution WHERE rule_code = 'CONST-001'"],
        expected_result: "Error: RLS policy violation - DELETE not allowed"
      },
      {
        id: "TS-2",
        name: "Constitution Immutability - UPDATE Prevention",
        steps: ["Attempt UPDATE protocol_constitution SET rule_text = 'modified' WHERE rule_code = 'CONST-001'"],
        expected_result: "Error: RLS policy violation - UPDATE not allowed"
      },
      {
        id: "TS-3",
        name: "Risk Tier Constraint Validation",
        steps: ["Attempt INSERT into protocol_improvement_queue with risk_tier = 'INVALID'"],
        expected_result: "Error: CHECK constraint violation"
      },
      {
        id: "TS-4",
        name: "Backward Compatibility",
        steps: ["Run: node scripts/protocol-improvements.js list"],
        expected_result: "Command executes successfully, lists existing improvements"
      },
      {
        id: "TS-5",
        name: "Constitution Seed Verification",
        steps: ["Run: SELECT COUNT(*) FROM leo_protocol_sections WHERE section_type = 'constitution'"],
        expected_result: "Count = 9"
      }
    ],

    // Implementation Approach
    implementation_approach: `1. Create migration file: database/migrations/20260122_self_improvement_foundation.sql

2. Migration structure:
   a. CREATE TABLE protocol_constitution (with no updated_at - truly immutable)
   b. ALTER TABLE protocol_improvement_queue ADD risk_tier column
   c. CREATE TABLE improvement_quality_assessments
   d. ALTER TABLE leo_protocol_sections ADD priority column
   e. CREATE TABLE pattern_resolution_signals
   f. ALTER TABLE protocol_improvement_queue ADD effectiveness tracking columns
   g. CREATE RLS policies for constitution immutability
   h. INSERT 9 constitution rules as seed data

3. Verification:
   - Run migration against Supabase
   - Execute test scenarios to verify constraints and policies
   - Verify backward compatibility with existing scripts`,

    // Constraints
    constraints: [
      {
        type: "technical",
        description: "Must use Supabase PostgreSQL syntax",
        impact: "Migration file format must be compatible"
      },
      {
        type: "governance",
        description: "Constitution table must be immutable once created",
        impact: "RLS policies required before any seed data"
      },
      {
        type: "backward_compatibility",
        description: "Existing scripts must continue to work",
        impact: "Only additive changes, no column removals or renames"
      }
    ],

    // Risks
    risks: [
      {
        risk: "RLS policy misconfiguration allows modification",
        severity: "high",
        mitigation: "Test DELETE/UPDATE operations immediately after migration"
      },
      {
        risk: "Missing foreign key constraint causes orphan records",
        severity: "medium",
        mitigation: "Verify FK constraint on improvement_quality_assessments"
      },
      {
        risk: "Existing scripts break due to schema changes",
        severity: "medium",
        mitigation: "Run protocol-improvements.js list as smoke test"
      }
    ],

    // Status update
    status: 'approved',
    phase: 'PLAN_VERIFY',
    approved_by: 'LEAD (auto-approved following LEO protocol)',
    approval_date: new Date().toISOString()
  };

  // Update the PRD
  const { error } = await supabase
    .from('product_requirements_v2')
    .update(prdUpdate)
    .eq('sd_id', sdId);

  if (error) {
    console.error('❌ Failed to update PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD completed successfully');
  console.log('   Status: approved');
  console.log('   Phase: PLAN_VERIFY');
  console.log('   7 Functional Requirements defined');
  console.log('   3 Technical Requirements defined');
  console.log('   5 Test Scenarios defined');
  console.log('   Data model with 3 new tables + 2 alterations');
}

completePRD().catch(console.error);
