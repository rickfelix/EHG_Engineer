#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('\n📝 Creating child SD for backend work...\n');

// Get parent SD UUID
const { data: parentSD, error: parentError } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id, id')
  .eq('id', 'SD-STAGE4-UX-EDGE-CASES-001')
  .single();

if (parentError) {
  console.error('❌ Error finding parent SD:', parentError.message);
  process.exit(1);
}

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

  status: 'active', // Active (deferred from parent SD)
  priority: 'high',
  category: 'Backend',

  parent_sd_id: parentSD.id,

  rationale: `**Deferred from parent SD:** SD-STAGE4-UX-EDGE-CASES-001

**Reason for deferral:** Backend work requires separate Python team. Frontend ready (P0+P1+P2 merged).

**Problem:** AI competitor extraction fails ~60% of time with regex-only approach. When extraction fails, users have no quality visibility.

**Solution:**
1. LLM extraction fallback when regex returns 0 competitors but has raw_analysis
2. Backend populates quality_metadata (confidence_score, quality_issues, extraction_method)

**Impact:**
- Reduces extraction failure rate from 60% to ≤30% (target per PRD)
- Provides quality transparency to users (confidence scores, issues)
- Enables data-driven improvements (track extraction_method distribution)`,

  success_criteria: [
    { criterion: 'LLM extraction fallback reduces failure rate to ≤30%', priority: 'P0' },
    { criterion: 'quality_metadata populated in all agent_executions responses', priority: 'P0' },
    { criterion: 'Backend metrics track extraction_method distribution', priority: 'P1' },
    { criterion: 'Unit tests cover LLM extraction logic', priority: 'P0' },
    { criterion: 'API documentation updated with quality_metadata schema', priority: 'P1' }
  ],

  metadata: {
    deferred_from: 'SD-STAGE4-UX-EDGE-CASES-001',
    deferred_at: new Date().toISOString(),
    deferred_reason: 'Backend work requires separate Python team. Frontend ready (P0+P1+P2 merged).',
    functional_requirements: ['FR-4: LLM extraction fallback', 'FR-3: quality_metadata population'],
    estimated_hours: 9,
    tech_stack: ['Python', 'FastAPI', 'OpenAI API', 'Supabase'],
    relationship_type: 'deferred_scope'
  },

  scope: `Backend enhancements for Stage 4 Competitive Intelligence UX:

**P0: LLM Extraction Fallback (6 hours)**
- Implement _llm_extract_competitors() method in CompetitiveMapperAgent
- Fallback logic: If regex extraction returns 0 competitors but has raw_analysis, retry with LLM
- Use GPT-4 or Claude for structured extraction
- Populate quality_metadata.extraction_method = 'llm'

**P1: Quality Metadata Population (3 hours)**
- Add quality_metadata to agent_executions API responses
- Calculate confidence_score based on extraction success
- Track quality_issues (missing fields, low confidence, etc.)
- Document extraction_method (regex, llm, manual)

**Success Metrics:**
- Extraction failure rate reduced from ~60% to ≤30%
- quality_metadata present in 100% of API responses
- Backend metrics dashboards show extraction_method distribution`,

  sd_key: 'SD-STAGE4-UX-EDGE-CASES-BACKEND-001',
  sd_type: 'feature',
  target_application: 'EHG',
  current_phase: 'planning',
  progress: 0,

  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

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
console.log('\n📊 Scope:');
console.log('   - LLM extraction fallback (FR-4): 6 hours');
console.log('   - quality_metadata population: 3 hours');
console.log('   - Total: 9 hours Python');
console.log('');

// Transfer user story to child SD
console.log('📝 Transferring user story...');

const { data: updatedStories, error: storyError } = await supabase
  .from('user_stories')
  .update({ sd_id: data[0].id })
  .eq('prd_id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .eq('id', 'bb088ac3-6a1d-4a5b-a4d9-f0a6f1af807b') // Story 4: LLM fallback
  .select();

if (storyError) {
  console.error('❌ Error transferring story:', storyError.message);
} else {
  console.log(`✅ Transferred ${updatedStories.length} user story to child SD`);
}

console.log('\n🎯 Next Steps:');
console.log('   1. Create PRD-SD-STAGE4-UX-EDGE-CASES-BACKEND-001');
console.log('   2. Assign to backend team');
console.log('   3. Schedule for next Python sprint');
console.log('');
