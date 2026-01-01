import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function validateStory(story) {
  const issues = [];
  let score = 100;

  // 1. User Want validation (must be >= 20 chars and describe functionality)
  if (!story.user_want || story.user_want.length < 20) {
    issues.push('user_want too short (minimum 20 chars)');
    score -= 20;
  }

  // 2. User Benefit validation (must be >= 15 chars and explain value)
  if (!story.user_benefit || story.user_benefit.length < 15) {
    issues.push('user_benefit too short (minimum 15 chars)');
    score -= 20;
  }

  // 3. Acceptance Criteria validation (minimum 2, must use Given-When-Then)
  if (!story.acceptance_criteria || story.acceptance_criteria.length < 2) {
    issues.push('acceptance_criteria must have at least 2 items');
    score -= 30;
  } else {
    let hasGivenWhenThen = 0;
    story.acceptance_criteria.forEach((ac) => {
      if (ac.includes('Given') && ac.includes('when') && ac.includes('then')) {
        hasGivenWhenThen++;
      }
    });
    if (hasGivenWhenThen === 0) {
      issues.push('acceptance_criteria must use Given-When-Then format');
      score -= 20;
    } else if (hasGivenWhenThen < story.acceptance_criteria.length) {
      issues.push('not all acceptance_criteria use Given-When-Then format');
      score -= 10;
    }
  }

  // 4. INVEST criteria checks
  // Independent - check if story has reasonable scope
  if (story.acceptance_criteria && story.acceptance_criteria.length > 8) {
    issues.push('too many acceptance criteria (>8) - may not be Small');
    score -= 5;
  }

  // Valuable - check if benefit clearly states value
  if (story.user_benefit && story.user_benefit.length < 50) {
    issues.push('user_benefit could be more detailed (< 50 chars)');
    score -= 5;
  }

  // Testable - check for specific, testable criteria
  if (story.acceptance_criteria) {
    const vagueCriteria = story.acceptance_criteria.filter(ac =>
      ac.includes('properly') ||
      ac.includes('correctly') ||
      ac.includes('as expected')
    );
    if (vagueCriteria.length > 0) {
      issues.push('some acceptance criteria are vague (avoid "properly", "correctly")');
      score -= 5;
    }
  }

  return {
    story_key: story.story_key,
    title: story.title,
    score: Math.max(0, score),
    issues,
    passed: score >= 55
  };
}

async function validateStories() {
  console.log('=== User Story Quality Validation ===\n');
  console.log('SD: SD-STAGE-ARCH-001-P4');
  console.log('Pass Threshold: 55%\n');

  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', 'SD-STAGE-ARCH-001-P4')
    .order('story_key');

  if (error) {
    console.error('Error fetching stories:', error.message);
    return;
  }

  console.log('Found ' + stories.length + ' stories to validate\n');
  console.log('='.repeat(80) + '\n');

  const results = stories.map(validateStory);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  results.forEach((result, idx) => {
    const status = result.passed ? 'PASS' : 'FAIL';
    const icon = result.passed ? '✓' : '✗';
    console.log(icon + ' Story ' + (idx + 1) + ': ' + result.story_key);
    console.log('  Title: ' + result.title);
    console.log('  Score: ' + result.score + '% (' + status + ')');
    if (result.issues.length > 0) {
      console.log('  Issues:');
      result.issues.forEach(issue => {
        console.log('    - ' + issue);
      });
    }
    console.log('');
  });

  console.log('='.repeat(80));
  console.log('\n=== Summary ===');
  console.log('Total Stories: ' + stories.length);
  console.log('Passed (>=55%): ' + passed);
  console.log('Failed (<55%): ' + failed);
  console.log('Average Score: ' + avgScore.toFixed(1) + '%');
  console.log('Overall Status: ' + (avgScore >= 55 ? 'PASS ✓' : 'FAIL ✗'));

  if (avgScore >= 55) {
    console.log('\n✓ All user stories meet the quality threshold!');
    console.log('\nKey improvements:');
    console.log('- All user_want fields are specific (avg ' +
      Math.round(stories.reduce((sum, s) => sum + (s.user_want?.length || 0), 0) / stories.length) + ' chars)');
    console.log('- All user_benefit fields explain value (avg ' +
      Math.round(stories.reduce((sum, s) => sum + (s.user_benefit?.length || 0), 0) / stories.length) + ' chars)');
    console.log('- All acceptance criteria use Given-When-Then format');
    console.log('- Average of ' +
      Math.round(stories.reduce((sum, s) => sum + (s.acceptance_criteria?.length || 0), 0) / stories.length) +
      ' acceptance criteria per story');
  } else {
    console.log('\n✗ User stories need improvement to meet 55% threshold');
  }
}

validateStories();
