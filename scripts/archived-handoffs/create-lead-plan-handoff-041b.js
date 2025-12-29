#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createHandoff() {
  console.log('📋 Creating LEAD→PLAN Handoff for SD-041B\n');

  // Check for handoff_tracking table first
  const { data: _checkTable, error: tableError } = await supabase
    .from('handoff_tracking')
    .select('id')
    .limit(1);

  const useHandoffTracking = !tableError;

  const handoffData = {
    // 1. Executive Summary
    executive_summary: `SD-041B: Competitive Intelligence - Cloning Process

**Strategic Intent**: Systematize venture ideation through market scanning and customer feedback analysis, integrated into existing Stage 4 workflow.

**Simplicity Approach**: Reuse Stage 4 Competitive Intelligence infrastructure and SD-041A Knowledge Base for AI agent coordination. No new workflow stages required.

**Business Value**:
- Faster time to viable venture concepts (data-driven ideation)
- 10x increase in customer signal sensitivity via "listening radar"
- Systematic opportunity discovery replacing ad-hoc ideation
- AI Research Agent team can leverage same infrastructure`,

    // 2. Completeness Report (removed from this handoff as LEAD hasn't completed work yet - this is strategic handoff)
    deliverables_manifest: `Strategic Directive Approved:
✅ SD-041B activated (status: active, priority: high)
✅ SD Key assigned: SD-041B
✅ Integration strategy defined (3 touchpoints)
✅ Simplicity-first approach confirmed
✅ Metadata stored in database

Key Decisions Documented:
- Reuse Stage 4 (no new stage creation)
- Leverage SD-041A knowledge base infrastructure
- Configuration-driven approach (no complex ML initially)
- Chairman oversight for venture ideation output`,

    // 3. Key Decisions & Rationale
    key_decisions: `**1. Integration Strategy - Stage 4 Enhancement (Not New Stage)**
   Rationale: Venture cloning is fundamentally competitive intelligence work. Creating a new stage would violate simplicity principle.

**2. Reuse SD-041A Knowledge Base Infrastructure**
   Rationale: AI agents already have knowledge management system. Sharing infrastructure reduces complexity and enables Research AI Agent team usage.

**3. Configuration-Driven "Listening Radar" (No ML Initially)**
   Rationale: 10x sensitivity can be achieved through systematic monitoring rules and aggregation, not requiring complex ML models upfront. Simplicity-first.

**4. Chairman Approval for Venture Ideation**
   Rationale: Opportunity blueprints should require Chairman review before becoming formal ventures, maintaining strategic oversight.

**5. Three Integration Touchpoints**
   - Stage 4: Primary home for cloning workflow
   - Stage 16 AI CEO Agent: Decision support access
   - Knowledge Base: Shared data with AI Research Agents`,

    // 4. Known Issues & Risks
    known_issues: `**Technical Risks**:
- Integration with existing Stage 4 UI requires careful UX design (→ trigger Design sub-agent)
- Customer feedback aggregation from external sources (reviews, forums) may need API rate limiting
- AI agent coordination layer adds dependency on SD-041A infrastructure

**Business Risks**:
- Venture ideation quality depends on market scanning comprehensiveness
- "10x listening radar" is aspirational - requires measurement baseline
- Customer feedback sources (Reddit, forums) have variable signal quality

**Mitigation Strategies**:
- Start with manual market scanning, automate incrementally
- Use Chairman review as quality gate
- Design sub-agent review for UX complexity`,

    // 5. Resource Utilization
    resource_utilization: `**LEAD Phase Resources**:
- Strategic review: 30 minutes
- SD activation: 10 minutes
- Handoff creation: 20 minutes
Total: 1 hour

**Projected PLAN Phase Resources**:
- PRD creation: 2 hours (integration complexity)
- Database schema design: 1 hour
- Service layer architecture: 1 hour
Total: 4 hours

**Projected EXEC Phase Resources**:
- Database migration: 1 hour
- Service layer implementation: 3 hours
- UI enhancement (Stage 4): 4 hours
- AI agent integration: 2 hours
- Testing: 2 hours
Total: 12 hours

**Grand Total Estimate**: 17 hours`,

    // 6. Action Items for PLAN
    action_items: `**PLAN Agent Tasks**:

1. **PRD Creation** - Define comprehensive requirements including:
   - Database schema (5 tables: market_segments, competitor_tracking, customer_feedback_sources, opportunity_blueprints, listening_radar_config)
   - Service layer APIs (ventureIdeationService.ts)
   - UI enhancements (Stage 4 new tab)
   - AI agent integration hooks
   - Chairman approval workflow
   - Acceptance criteria with test scenarios

2. **Design Sub-Agent Trigger** - Request UX review for:
   - Stage 4 tab navigation (adding "Venture Cloning" workflow)
   - Market scanning dashboard layout
   - Customer feedback aggregator UI
   - Opportunity blueprint generator
   - Chairman review interface

3. **Integration Mapping** - Document touchpoints:
   - Stage 4 ↔ Knowledge Base (AI agent data sharing)
   - Stage 16 AI CEO ↔ Venture Ideation (decision support)
   - Research AI Agents ↔ Competitive Intelligence (shared queries)

4. **Test Planning** - Define test scenarios:
   - Market scanning workflow
   - Customer feedback aggregation
   - Opportunity blueprint generation
   - AI agent data access
   - Chairman approval process

5. **Create PLAN→EXEC Handoff** - Include all PRD artifacts and design review results`,

    // 7. Metadata
    metadata: {
      sd_id: 'SD-041B',
      from_agent: 'LEAD',
      to_agent: 'PLAN',
      handoff_type: 'strategic_to_technical',
      timestamp: new Date().toISOString(),
      protocol_version: 'v4.2.0_story_gates',
      integration_touchpoints: 3,
      estimated_complexity: 'medium',
      design_review_required: true
    }
  };

  if (useHandoffTracking) {
    console.log('Using handoff_tracking table...');

    const { data, error } = await supabase
      .from('handoff_tracking')
      .insert({
        sd_id: 'SD-041B',
        from_agent: 'LEAD',
        to_agent: 'PLAN',
        handoff_type: 'strategic_to_technical',
        status: 'completed',
        ...handoffData
      })
      .select();

    if (error) {
      console.error('❌ Error:', error.message);
      console.log('\nℹ️  Falling back to git commit handoff...');
      console.log('\nHandoff content stored in metadata field of SD-041B');

      // Store in SD metadata as fallback
      const { error: metaError } = await supabase
        .from('strategic_directives_v2')
        .update({
          metadata: {
            ...handoffData.metadata,
            lead_plan_handoff: handoffData
          }
        })
        .eq('sd_key', 'SD-041B');

      if (metaError) {
        console.error('❌ Metadata fallback also failed:', metaError.message);
        process.exit(1);
      }
      console.log('✅ Handoff stored in SD metadata');
    } else {
      console.log('✅ LEAD→PLAN handoff created successfully!');
      console.log('   Handoff ID:', data[0].id);
    }
  } else {
    console.log('ℹ️  handoff_tracking table not available, using SD metadata...');

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          ...handoffData.metadata,
          lead_plan_handoff: handoffData
        }
      })
      .eq('sd_key', 'SD-041B');

    if (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
    console.log('✅ Handoff stored in SD metadata');
  }

  console.log('\n📊 Handoff Summary:');
  console.log('   From: LEAD');
  console.log('   To: PLAN');
  console.log('   SD: SD-041B');
  console.log('   Type: strategic_to_technical');
  console.log('   Elements: 7/7 ✅');
  console.log('\n🎯 Next: PLAN agent to create comprehensive PRD');
}

createHandoff().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
