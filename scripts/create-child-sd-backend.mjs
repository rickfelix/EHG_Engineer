#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📝 Creating child SD for backend work...\n');

// Create child SD for backend work (FR-4 + quality_metadata)
const sdData = {
  id: 'SD-STAGE4-UX-EDGE-CASES-BACKEND-001',
  title: 'Stage 4 UX Edge Cases: Backend Enhancements',
  description: `Backend implementation deferred from SD-STAGE4-UX-EDGE-CASES-001.

**Scope:**
1. LLM extraction fallback (FR-4) - 6 hours Python
2. quality_metadata API v2 field population - 3 hours Python

**Total Effort:** 9 hours Python (backend team)

**Dependencies:** Frontend implementation complete (P0+P1+P2 merged)

**Value:** Improves AI extraction success rate from ~40% to ≥70%, adds quality transparency to UI`,

  status: 'approved', // Already approved via parent SD
  priority: 'high',
  category: 'backend',

  parent_directive_id: null, // Will link to parent SD UUID after lookup
  relationship_type: 'deferred_scope',

  business_value: `**Problem:** AI competitor extraction fails ~60% of time with regex-only approach. When extraction fails, users have no quality visibility.

**Solution:**
1. LLM extraction fallback when regex returns 0 competitors but has raw_analysis
2. Backend populates quality_metadata (confidence_score, quality_issues, extraction_method)

**Impact:**
- Reduces extraction failure rate from 60% to ≤30% (target per PRD)
- Provides quality transparency to users (confidence scores, issues)
- Enables data-driven improvements (track extraction_method distribution)`,

  success_criteria: [
    'LLM extraction fallback reduces failure rate to ≤30%',
    'quality_metadata populated in all agent_executions responses',
    'Backend metrics track extraction_method distribution',
    'Unit tests cover LLM extraction logic',
    'API documentation updated with quality_metadata schema'
  ],

  metadata: {
    deferred_from: 'SD-STAGE4-UX-EDGE-CASES-001',
    deferred_at: new Date().toISOString(),
    deferred_reason: 'Backend work requires separate Python team. Frontend ready (P0+P1+P2 merged).',
    functional_requirements: ['FR-4: LLM extraction fallback', 'FR-3: quality_metadata population'],
    estimated_hours: 9,
    tech_stack: ['Python', 'FastAPI', 'OpenAI API', 'Supabase']
  },

  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Get parent SD UUID
const { data: parentSD, error: parentError } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id')
  .eq('id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .single();

if (parentError) {
  console.error('❌ Error finding parent SD:', parentError.message);
  console.log('⚠️  Proceeding without parent link...');
} else {
  sdData.parent_directive_id = parentSD.uuid_id;
}

// Insert child SD
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert(sdData)
  .select();

if (error) {
  console.error('❌ Error creating child SD:', error.message);
  process.exit(1);
}

console.log('✅ Child SD created successfully!');
console.log(`   ID: ${data[0].id}`);
console.log(`   Title: ${data[0].title}`);
console.log(`   Status: ${data[0].status}`);
console.log(`   Priority: ${data[0].priority}`);
console.log(`   Parent: SD-STAGE4-UX-EDGE-CASES-001`);
console.log(`   Relationship: ${data[0].relationship_type}`);
console.log('\n📊 Scope:');
console.log('   - LLM extraction fallback (FR-4): 6 hours');
console.log('   - quality_metadata population: 3 hours');
console.log('   - Total: 9 hours Python');
console.log('');

// Transfer user stories to child SD
console.log('📝 Transferring user stories...');

const { data: updatedStories, error: storyError } = await supabase
  .from('user_stories')
  .update({ sd_id: data[0].id })
  .eq('prd_id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .in('id', ['bb088ac3-6a1d-4a5b-a4d9-f0a6f1af807b']) // Story 4: LLM fallback
  .select();

if (storyError) {
  console.error('❌ Error transferring stories:', storyError.message);
} else {
  console.log(`✅ Transferred ${updatedStories.length} user story to child SD`);
}

console.log('\n🎯 Next Steps:');
console.log('   1. Create PRD-SD-STAGE4-UX-EDGE-CASES-BACKEND-001');
console.log('   2. Assign to backend team');
console.log('   3. Schedule for next Python sprint');
console.log('');
