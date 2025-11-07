import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('📝 Updating User Stories for Client-Side Architecture\n');

// Updated implementation context for affected stories
const updates = [
  {
    story_key: 'SD-RECURSION-AI-001:US-001',
    title: 'Service Methods for Recursion Validation',
    user_want: 'validate recursion scenarios via TypeScript service methods',
    user_benefit: 'I can programmatically trigger recursion workflows from React components',
    acceptance_criteria: [
      'RecursionAPIService.validateRecursion() method responds <10ms (cached)',
      'Methods: validateRecursion(), batchValidate(), getHistory()',
      'Supabase client handles all database operations',
      'React Query caches results for performance',
      'Error handling returns structured error objects'
    ],
    implementation_context: 'Phase 1. Build RecursionAPIService (400 LOC). TypeScript service class pattern (like recursionEngine.ts). Use Supabase client for database. React Query for caching (<10ms cached target). Reference existing recursionEngine.ts (450 LOC) for business logic.'
  },
  {
    story_key: 'SD-RECURSION-AI-001:US-002',
    acceptance_criteria: [
      'RecursionAPIService.batchValidate() accepts array of scenarios',
      'Processes 100 scenarios in <50ms (with caching)',
      'Returns aggregated results with pass/fail counts',
      'Handles partial failures gracefully',
      'Parallel processing using Promise.all()'
    ],
    implementation_context: 'Phase 1. Build BatchValidationService (300 LOC). Use Promise.all() for parallel evaluation. Handle errors individually (partial success). Return summary: { results: [], summary: { passed: N, failed: M } }. Integrate with React Query for caching.'
  },
  {
    story_key: 'SD-RECURSION-AI-001:US-008',
    acceptance_criteria: [
      'ThresholdManager.configure() method for updating thresholds',
      'Industry-specific thresholds stored (FinTech 18%, Hardware 12%)',
      'Threshold changes require Chairman approval (UI confirmation)',
      'Historical overrides inform threshold recommendations',
      'Thresholds applied correctly in recursion validation'
    ],
    implementation_context: 'Phase 1. Build AdaptiveThresholdManager (200 LOC). Store industry-specific configs in localStorage + database. Expose configure() method (Chairman only). Default thresholds: FinTech 18%, Hardware 12%, Software 15%. Use Supabase RLS for security.'
  }
];

console.log('Updating 3 user stories...\n');

for (const update of updates) {
  const { error } = await supabase
    .from('user_stories')
    .update(update)
    .eq('story_key', update.story_key);

  if (error) {
    console.error('❌ Error updating ' + update.story_key + ':', error.message);
  } else {
    console.log('✅ ' + update.story_key + ': ' + (update.title || 'Updated'));
  }
}

console.log('\n✅ User stories updated to reflect service layer architecture');
console.log('📋 Changes: REST/GraphQL → TypeScript service methods');
