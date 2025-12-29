import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function splitSD041() {
  console.log('🔀 Splitting SD-041 into focused Strategic Directives...\n');

  // Step 1: Supersede SD-041
  console.log('📝 Step 1: Superseding SD-041...');
  const { data: originalSD, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-041')
    .single();

  if (fetchError) {
    console.error('❌ Error fetching SD-041:', fetchError);
    return;
  }

  console.log(`Original SD-041: "${originalSD.title}", progress: ${originalSD.progress}%`);

  const { error: supersedeError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'cancelled',
      metadata: {
        ...originalSD.metadata,
        cancelled_date: new Date().toISOString(),
        cancelled_reason: 'split',
        split_into: ['SD-041A', 'SD-041B', 'SD-041C'],
        split_rationale: 'Split into 3 focused SDs due to scope mismatch between backlog items and existing infrastructure. SD-041A integrates existing KB code, SD-041B adds competitive intelligence, SD-041C adds AI doc generation.',
        original_scope: originalSD.scope,
        original_backlog_items: [
          { id: '62', title: 'Define a Cloning Process for Venture Ideation', mapped_to: 'SD-041B' },
          { id: '290', title: 'AI-Powered Knowledge Base & Help Docs', mapped_to: 'SD-041C' }
        ]
      }
    })
    .eq('id', 'SD-041');

  if (supersedeError) {
    console.error('❌ Error superseding SD-041:', supersedeError);
    return;
  }

  console.log('✅ SD-041 superseded successfully\n');

  // Step 2: Create SD-041A (Knowledge Base Service Integration)
  console.log('📝 Step 2: Creating SD-041A (KB Service Integration)...');

  const sd041A = {
    id: 'SD-041A',
    title: 'Knowledge Base - Service Integration',
    rationale: 'Unlock existing $150K infrastructure investment by integrating 698-line service with 1,300-line UI. Enables pattern recognition, insights, and knowledge capture for venture management.',
    description: `Connect existing Knowledge Base UI components to knowledgeManagementService backend.

**Context**: SD-041 discovered extensive existing infrastructure (698-line service + 1,300 lines UI) that uses mock data. This SD focuses solely on integrating that infrastructure.

**Existing Assets**:
- Service: /mnt/c/_EHG/EHG/src/lib/services/knowledgeManagementService.ts (698 lines)
- UI: /mnt/c/_EHG/EHG/src/components/data/KnowledgeBaseSystem.tsx (644 lines)
- UI: /mnt/c/_EHG/EHG/src/components/eva/KnowledgeBase.tsx (656 lines)
- Route: /knowledge-base (configured in App.tsx)

**Gap**: UI components use hardcoded mock data, NOT connected to service layer.

**Scope**: Integration work only - NO new features.`,
    status: 'active',
    priority: 'high',
    category: 'Other',
    progress: 30, // Inherit from SD-041
    current_phase: 'PLAN_DESIGN',
    target_application: 'EHG',
    scope: `**Must-Haves** (Integration Only):
1. Create database migrations for 5 knowledge tables (knowledge_patterns, knowledge_insights, pattern_recognition_events, knowledge_discovery_sessions, knowledge_base_articles)
2. Replace mock data in KnowledgeBaseSystem.tsx with service calls
3. Implement error handling and loading states
4. Test CRUD operations via UI
5. Verify /knowledge-base route with real data

**Deferred** (Out of Scope):
- Competitive intelligence features (see SD-041B)
- AI documentation generation (see SD-041C)
- Advanced analytics or AI-powered insights
- Multi-venture knowledge sharing`,
    must_have_count: 5,
    must_have_pct: 100,
    h_count: 5,
    m_count: 0,
    l_count: 0,
    metadata: {
      split_from: 'SD-041',
      split_date: new Date().toISOString(),
      split_rationale: 'Focus on integrating existing infrastructure (90% effort reduction)',
      estimated_effort: '8-12 hours',
      original_estimate: '50 hours',
      effort_reduction: '76-84%',
      inherited_progress: 30,
      existing_infrastructure: {
        service: 'knowledgeManagementService.ts (698 lines)',
        ui_components: '2 files, 1,300 lines total',
        route: '/knowledge-base',
        database_tables: ['knowledge_patterns', 'knowledge_insights', 'pattern_recognition_events', 'knowledge_discovery_sessions', 'knowledge_base_articles']
      },
      backlog_items_excluded: [
        { id: '62', reason: 'Competitive intelligence - different feature, see SD-041B' },
        { id: '290', reason: 'AI doc generation - different feature, see SD-041C' }
      ]
    }
  };

  const { data: _sd041AData, error: sd041AError } = await supabase
    .from('strategic_directives_v2')
    .insert(sd041A)
    .select()
    .single();

  if (sd041AError) {
    console.error('❌ Error creating SD-041A:', sd041AError);
    return;
  }

  console.log('✅ SD-041A created: "Knowledge Base - Service Integration"');
  console.log(`   Status: ${sd041A.status}, Priority: ${sd041A.priority}, Progress: ${sd041A.progress}%\n`);

  // Step 3: Create SD-041B (Competitive Intelligence)
  console.log('📝 Step 3: Creating SD-041B (Competitive Intelligence)...');

  const sd041B = {
    id: 'SD-041B',
    title: 'Competitive Intelligence - Cloning Process',
    rationale: 'Systematic opportunity discovery through competitive analysis and customer feedback. Reduces time to identify viable venture concepts, enables data-driven ideation with 10x signal sensitivity.',
    description: `Establish systematic venture ideation process via market scanning and customer feedback analysis.

**Origin**: Backlog item #62 from SD-041 - "Define a Cloning Process for Venture Ideation"

**Problem**: No structured process for identifying venture opportunities through competitive analysis and customer feedback.

**Approach**:
1. Scan and analyze all current offerings in a specific market segment
2. Compare features and positioning across competitors
3. Identify customer base for each product
4. Gather customer feedback from reviews, forums, social media
5. Create ideation blueprint based on gaps and customer pain points
6. Develop "listening radar" to increase sensitivity to customer signals by 10x

**Business Value**: Systematic opportunity discovery, faster time to viable venture concepts, data-driven ideation.`,
    status: 'draft',
    priority: 'low', // Per backlog item priority
    category: 'Go-to-Market (GTM) & Brand Strategy',
    progress: 0,
    current_phase: 'LEAD_APPROVAL',
    target_application: 'EHG',
    scope: `**Must-Haves** (from Backlog #62):
1. Market segment scanning tool
2. Competitor feature comparison dashboard
3. Customer base identification system
4. Customer feedback aggregator (reviews, forums, social media)
5. Ideation blueprint generator
6. Customer signal sensitivity metrics (10x improvement target)

**Nice-to-Haves**:
- Automated competitive monitoring
- AI-powered trend detection
- Slack/email alerts for new opportunities
- Integration with venture creation workflow`,
    must_have_count: 6,
    must_have_pct: 100,
    h_count: 6,
    m_count: 0,
    l_count: 4,
    metadata: {
      split_from: 'SD-041',
      split_date: new Date().toISOString(),
      split_rationale: 'Competitive intelligence is distinct capability from knowledge base integration',
      estimated_effort: '25-30 hours',
      backlog_item: {
        id: '62',
        title: 'Define a Cloning Process for Venture Ideation',
        priority: 'Low',
        description_raw: 'Must Have',
        stage: 'Competitive Intelligence',
        phase: 'Discovery',
        category: 'Go-to-Market (GTM) & Brand Strategy'
      },
      requires_new_implementation: true,
      no_existing_infrastructure: true
    }
  };

  const { data: _sd041BData, error: sd041BError } = await supabase
    .from('strategic_directives_v2')
    .insert(sd041B)
    .select()
    .single();

  if (sd041BError) {
    console.error('❌ Error creating SD-041B:', sd041BError);
    return;
  }

  console.log('✅ SD-041B created: "Competitive Intelligence - Cloning Process"');
  console.log(`   Status: ${sd041B.status}, Priority: ${sd041B.priority}, Progress: ${sd041B.progress}%\n`);

  // Step 4: Create SD-041C (AI Documentation Generator)
  console.log('📝 Step 4: Creating SD-041C (AI Documentation Generator)...');

  const sd041C = {
    id: 'SD-041C',
    title: 'AI-Powered Documentation Generator',
    rationale: 'Eliminate manual documentation lag. AI agent auto-generates user-friendly docs and FAQs from code changes, ensuring documentation is always current. Reduces support burden, improves user onboarding.',
    description: `Create knowledge base that is dynamically updated by an AI agent that "reads" new features and generates user-friendly docs and FAQs.

**Origin**: Backlog item #290 from SD-041 - "AI-Powered Knowledge Base & Help Docs"

**Problem**: Manual documentation quickly becomes outdated. Developers forget to update docs when features change.

**Approach**:
1. Monitor code changes via GitHub webhooks
2. AI agent analyzes new features, changes, and APIs
3. Generate user-friendly documentation automatically
4. Create/update FAQs based on feature changes
5. Maintain version history of generated docs

**Value**: Ensures documentation is always current without manual effort. Reduces support burden, improves user onboarding.`,
    status: 'draft',
    priority: 'high', // Per backlog item priority
    category: 'Data & Analytics',
    progress: 0,
    current_phase: 'LEAD_APPROVAL',
    target_application: 'EHG',
    scope: `**Must-Haves** (from Backlog #290):
1. GitHub webhook integration for code change detection
2. AI agent (OpenAI/Anthropic) that reads code and generates docs
3. Documentation template engine
4. FAQ auto-generation from feature changes
5. Version control for generated documentation
6. Admin dashboard to review/approve AI-generated content

**Nice-to-Haves**:
- Multi-language documentation support
- Integration with existing /knowledge-base route
- Screenshot auto-generation for UI features
- Automatic linking between related docs
- Usage analytics for documentation`,
    must_have_count: 6,
    must_have_pct: 100,
    h_count: 6,
    m_count: 0,
    l_count: 5,
    metadata: {
      split_from: 'SD-041',
      split_date: new Date().toISOString(),
      split_rationale: 'AI documentation generation is distinct capability from knowledge base integration',
      estimated_effort: '20-25 hours',
      backlog_item: {
        id: '290',
        title: 'AI-Powered Knowledge Base & Help Docs',
        priority: 'High',
        description_raw: 'Nice to Have',
        stage: 'Data Management & Knowledge Base',
        phase: 'Planning',
        category: 'Data & Analytics'
      },
      requires_new_implementation: true,
      ai_integration_required: true,
      potential_integration_with: 'SD-041A (could store AI docs in knowledge_base_articles table)'
    }
  };

  const { data: _sd041CData, error: sd041CError } = await supabase
    .from('strategic_directives_v2')
    .insert(sd041C)
    .select()
    .single();

  if (sd041CError) {
    console.error('❌ Error creating SD-041C:', sd041CError);
    return;
  }

  console.log('✅ SD-041C created: "AI-Powered Documentation Generator"');
  console.log(`   Status: ${sd041C.status}, Priority: ${sd041C.priority}, Progress: ${sd041C.progress}%\n`);

  // Step 5: Update backlog mappings
  console.log('📝 Step 5: Updating backlog mappings...');

  // Update backlog item #62 to point to SD-041B
  const { error: backlog62Error } = await supabase
    .from('sd_backlog_map')
    .update({
      sd_id: 'SD-041B',
      utilized_from_sd: 'SD-041',
      completion_notes: 'Migrated from SD-041 during split. Now tracked under SD-041B (Competitive Intelligence).'
    })
    .eq('backlog_id', '62');

  if (backlog62Error) {
    console.error('⚠️ Warning: Could not update backlog #62:', backlog62Error);
  } else {
    console.log('✅ Backlog #62 remapped to SD-041B');
  }

  // Update backlog item #290 to point to SD-041C
  const { error: backlog290Error } = await supabase
    .from('sd_backlog_map')
    .update({
      sd_id: 'SD-041C',
      utilized_from_sd: 'SD-041',
      completion_notes: 'Migrated from SD-041 during split. Now tracked under SD-041C (AI Documentation Generator).'
    })
    .eq('backlog_id', '290');

  if (backlog290Error) {
    console.error('⚠️ Warning: Could not update backlog #290:', backlog290Error);
  } else {
    console.log('✅ Backlog #290 remapped to SD-041C');
  }

  console.log('\n🎯 Split Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SD-041: SUPERSEDED');
  console.log('   Rationale: Scope mismatch between backlog and existing code\n');

  console.log('✅ SD-041A: Knowledge Base - Service Integration');
  console.log('   Status: active (ready for PLAN phase)');
  console.log('   Priority: high');
  console.log('   Effort: 8-12 hours (76-84% reduction)');
  console.log('   Scope: Integrate existing 698-line service + 1,300-line UI');
  console.log('   Backlog: None (uses existing infrastructure)\n');

  console.log('✅ SD-041B: Competitive Intelligence - Cloning Process');
  console.log('   Status: draft (requires LEAD approval)');
  console.log('   Priority: low');
  console.log('   Effort: 25-30 hours');
  console.log('   Scope: Market scanning, competitor analysis, customer feedback');
  console.log('   Backlog: Item #62 (Must Have, Low priority)\n');

  console.log('✅ SD-041C: AI-Powered Documentation Generator');
  console.log('   Status: draft (requires LEAD approval)');
  console.log('   Priority: high');
  console.log('   Effort: 20-25 hours');
  console.log('   Scope: AI agent auto-generates docs from code changes');
  console.log('   Backlog: Item #290 (Nice to Have, High priority)\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📊 Business Impact:');
  console.log('- Immediate ROI: SD-041A unlocks $150K KB infrastructure investment');
  console.log('- Clarity: Each SD has single, focused purpose');
  console.log('- Flexibility: SD-041B & SD-041C can be deprioritized/deferred');
  console.log('- Velocity: SD-041A completes quickly, demonstrates progress');
  console.log('\n📝 Next Steps:');
  console.log('1. LEAD approves SD-041A to proceed to PLAN phase');
  console.log('2. PLAN creates PRD for SD-041A (integration-focused)');
  console.log('3. EXEC implements SD-041A (8-12h)');
  console.log('4. Defer SD-041B & SD-041C for future prioritization');
  console.log('\n✅ Split completed successfully!');
}

splitSD041().catch(console.error);
