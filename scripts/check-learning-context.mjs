import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧠 Learning Context Review: SD-RECURSION-AI-001\n');

// 1. Check retrospectives for API/infrastructure patterns
console.log('📚 Retrospectives - Infrastructure & API patterns:');
const { data: retros } = await supabase
  .from('retrospectives')
  .select('sd_id, what_went_well, what_went_wrong, lessons_learned, quality_score')
  .or('category.eq.infrastructure,category.eq.api')
  .order('quality_score', { ascending: false })
  .limit(3);

if (retros && retros.length > 0) {
  retros.forEach((r, i) => {
    console.log('\n' + (i + 1) + '. ' + r.sd_id + ' (Quality: ' + r.quality_score + ')');
    console.log('   Lessons:', r.lessons_learned?.slice(0, 2));
  });
} else {
  console.log('   No infrastructure retrospectives found');
}

// 2. Check issue patterns for database and API issues
console.log('\n\n⚠️  Issue Patterns - Database & API:');
const { data: patterns } = await supabase
  .from('issue_patterns')
  .select('issue_summary, solution, prevention_checklist, success_rate, occurrence_count')
  .or('category.eq.database,category.eq.api')
  .order('occurrence_count', { ascending: false })
  .limit(5);

if (patterns && patterns.length > 0) {
  patterns.forEach((p, i) => {
    console.log('\n' + (i + 1) + '. ' + p.issue_summary + ' (' + p.occurrence_count + ' occurrences)');
    console.log('   Success rate: ' + p.success_rate + '%');
    console.log('   Solution: ' + p.solution?.substring(0, 100) + '...');
  });
} else {
  console.log('   No database/API patterns found');
}

// 3. Check user story implementation context
console.log('\n\n💡 User Story Implementation Context:');
const { data: stories } = await supabase
  .from('user_stories')
  .select('story_key, title, implementation_context')
  .eq('sd_id', 'SD-RECURSION-AI-001')
  .order('story_key')
  .limit(3);

if (stories && stories.length > 0) {
  stories.forEach((s, i) => {
    console.log('\n' + (i + 1) + '. ' + s.story_key + ': ' + s.title);
    console.log('   Context: ' + s.implementation_context?.substring(0, 150) + '...');
  });
} else {
  console.log('   Implementation context available in user stories');
}

console.log('\n\n✅ Learning context review complete');
