#!/usr/bin/env node

/**
 * Create SD-RD-DEPT-001: R&D Department Hierarchical Research Agent System
 * LEO Protocol v4.2.0
 *
 * Creates Strategic Directive for building a realistic R&D Department
 * with VP → Manager → Analyst hierarchy for specialized research.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createRDDepartmentSD() {
  console.log('📋 LEAD: Creating SD-RD-DEPT-001 - R&D Department System\n');

  const sd = {
    id: 'SD-RD-DEPT-001',
    sd_key: 'SD-RD-DEPT-001', // Required field
    title: 'R&D Department: Hierarchical Research Agent System',
    version: '1.0',
    status: 'draft', // LEAD will review and approve
    category: 'platform',
    priority: 'high',

    description: `Build a realistic R&D Department with hierarchical agent structure (VP → Manager → Analysts) to perform specialized research operations. The department will support multiple use cases including competitive intelligence, viral content research, market trends analysis, and customer insights.

First use case: Deep research for viral video creation workflow (Sora integration).

Target Application: EHG (../ehg)`,

    strategic_intent: `Transform research operations from manual, siloed, inconsistent processes into an automated, high-quality, reusable research infrastructure that supports data-driven decision making across all departments.`,

    rationale: `**Business Need:**
Current state: Manual research is time-consuming, inconsistent quality, not reusable.
Desired state: Automated, high-quality, reusable research infrastructure.

**Strategic Value:**
1. **Efficiency**: Research delivered in hours vs days
2. **Quality**: Multi-layer review (Manager + VP approval gates)
3. **Reusability**: Research library reduces redundant work
4. **Scalability**: Add analysts for new research domains
5. **Cost Tracking**: Measure ROI per research request
6. **Multi-Department**: Supports Creative Media, Competitive Intel, GTM, Financial Planning

**Alignment with Business Objectives:**
- Supports viral video creation (immediate value)
- Enables data-driven decision making
- Builds reusable knowledge base
- Reduces dependency on expensive external research firms`,

    scope: `**In Scope:**
1. **Database Schema** (5 tables)
   - rd_department_agents (VP, Manager, 5 Analysts)
   - rd_research_requests (intake system)
   - rd_research_plans (Manager planning)
   - rd_research_findings (Analyst outputs)
   - rd_research_reports (Final deliverables)

2. **Agent Hierarchy**
   - VP of Research (Strategic oversight, final approval)
   - Research Manager (Planning, coordination, quality review)
   - 5 Specialized Analysts:
     * Competitive Intelligence Analyst
     * Viral Content Analyst
     * Market Trends Analyst
     * Customer Insights Analyst
     * Financial Research Analyst

3. **Workflow Engine**
   - Request intake and triage
   - Plan creation and approval
   - Task assignment to analysts
   - Finding review and compilation
   - Report approval and delivery

4. **UI Components**
   - R&D Department dashboard (/rd-department)
   - Research request form
   - Active research tracking
   - Team status indicators
   - Research library (searchable)

5. **Integration Points**
   - Creative Media (viral video research)
   - LLM Manager (configurable providers)
   - Existing competitive intelligence service

**Out of Scope (Future Phases):**
- External API integrations (Crunchbase, PitchBook, etc.)
- Real-time market data feeds
- Machine learning models for trend prediction
- Multi-language research support
- Custom research agent training`,

    strategic_objectives: [
      'Automate research operations with 80%+ efficiency gain',
      'Establish quality gates with Manager + VP approval',
      'Build reusable research library with 40%+ reuse rate',
      'Support 3+ departments within 90 days',
      'Track ROI and cost per research request'
    ],

    success_criteria: [
      'Research delivered in 1-2 hours (vs 2-3 days manual)',
      '85%+ confidence scores on research findings',
      '3+ departments actively using within 90 days',
      '40%+ research reuse rate',
      '80% cost reduction vs manual research',
      'VP approval rating >90%'
    ],

    key_principles: [
      'Hierarchical delegation (VP → Manager → Analysts)',
      'Multi-layer quality review',
      'Specialization by analyst type',
      'LLM Manager integration for flexibility',
      'Research library for knowledge sharing'
    ],

    implementation_guidelines: [
      'Database-first: Create all 5 tables with RLS policies',
      'Agent pattern: VP, Manager, 5 specialized Analysts',
      'Workflow engine: State machine for request lifecycle',
      'UI dashboard: Real-time status and library search',
      'Integration: Creative Media as first use case'
    ],

    dependencies: [
      {name: 'LLM Manager', type: 'existing', status: 'available'},
      {name: 'Supabase database', type: 'existing', status: 'available'},
      {name: 'Creative Media page', type: 'existing', status: 'available'}
    ],

    risks: [
      {
        risk: 'LLM costs for research requests',
        impact: 'medium',
        mitigation: 'Cost tracking per request, caching similar queries'
      },
      {
        risk: 'Research quality inconsistency',
        impact: 'high',
        mitigation: 'Manager review gate, VP approval, confidence scoring'
      },
      {
        risk: 'Adoption resistance from teams',
        impact: 'medium',
        mitigation: 'Start with Creative Media use case, demonstrate value'
      }
    ],

    success_metrics: [
      'Research delivery time: <2 hours',
      'Confidence scores: >85%',
      'Department adoption: 3+ within 90 days',
      'Reuse rate: >40%',
      'Cost reduction: >80%'
    ],

    stakeholders: [
      'Creative Media team',
      'Competitive Intelligence team',
      'GTM Strategy team',
      'Financial Planning team',
      'Executive team'
    ],

    created_by: 'LEAD',

    metadata: {
      estimated_hours: 90,
      estimated_weeks: 4,
      complexity: 'high',
      risk_level: 'medium',
      first_use_case: 'Viral video research for Sora workflow',
      related_sds: ['SD-CREATIVE-001', 'SD-LLM-CENTRAL-001'],
      target_application: 'EHG',
      implementation_path: '../ehg',
      agent_count: 7,
      table_count: 5,
      component_count: 6
    }
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sd)
    .select();

  if (error) {
    console.error('❌ Error creating SD:', error);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
    return;
  }

  console.log('✅ SD-RD-DEPT-001 Created Successfully\n');
  console.log('Title:', data[0].title);
  console.log('Priority:', data[0].priority);
  console.log('Status:', data[0].status);
  console.log('Category:', data[0].category);
  console.log('Target App:', data[0].target_application);

  console.log('\n📊 SD Summary:');
  console.log('  Scope: R&D Department with VP → Manager → 5 Analysts');
  console.log('  Estimated Effort: 90 hours (4 weeks)');
  console.log('  First Use Case: Viral video research');
  console.log('  Database Tables: 5 new tables');
  console.log('  Agent Classes: 7 hierarchical agents');
  console.log('  UI Components: 6 components + dashboard');

  console.log('\n🎯 Next Steps (LEO Protocol):');
  console.log('  1. LEAD reviews and approves SD');
  console.log('  2. Update priority if needed (currently: high)');
  console.log('  3. Create LEAD→PLAN handoff:');
  console.log('     node scripts/unified-handoff-system.js execute LEAD-to-PLAN SD-RD-DEPT-001');
  console.log('  4. PLAN creates PRD with technical specifications');
  console.log('  5. Begin EXEC phase implementation in ../ehg');

  return data[0];
}

createRDDepartmentSD();
