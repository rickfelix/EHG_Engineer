/**
 * AI-POWERED RUSSIAN JUDGE QUALITY RUBRICS TEST SCRIPT
 *
 * Tests all 4 rubrics with real database records:
 * 1. SD Quality Rubric
 * 2. PRD Quality Rubric (with SD context)
 * 3. User Story Quality Rubric (with PRD context)
 * 4. Retrospective Quality Rubric (with SD context)
 *
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { SDQualityRubric } from './modules/rubrics/sd-quality-rubric.js';
import { PRDQualityRubric } from './modules/rubrics/prd-quality-rubric.js';
import { UserStoryQualityRubric } from './modules/rubrics/user-story-quality-rubric.js';
import { RetrospectiveQualityRubric } from './modules/rubrics/retrospective-quality-rubric.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// TEST EXECUTION
// ============================================

async function testSDQualityRubric() {
  console.log('\n🔍 TEST 1: SD Quality Rubric');
  console.log('═'.repeat(70));

  try {
    // Fetch a real SD from database
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .not('description', 'is', null)
      .not('strategic_objectives', 'is', null)
      .limit(1)
      .single();

    if (error || !sd) {
      console.log('❌ No SD found in database');
      return { passed: false, error: 'No SD found' };
    }

    console.log(`📄 Testing SD: ${sd.sd_id || sd.id}`);
    console.log(`   Title: ${sd.title || 'No title'}`);
    console.log(`   Description Length: ${sd.description?.length || 0} chars`);

    const rubric = new SDQualityRubric();
    const result = await rubric.validateSDQuality(sd);

    console.log(`\n✅ Score: ${result.score}% (threshold: 70%)`);
    console.log(`   Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log('   Model: gpt-5-mini');
    console.log(`   Cost: $${result.details.cost_usd?.toFixed(4) || '0.0000'}`);
    console.log(`   Duration: ${result.details.duration_ms}ms`);

    if (result.issues.length > 0) {
      console.log(`\n⚠️  Issues (${result.issues.length}):`);
      result.issues.forEach(issue => console.log(`   - ${issue}`));
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚡ Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    console.log('\n📊 Criterion Scores:');
    Object.entries(result.details.criterion_scores || {}).forEach(([name, data]) => {
      console.log(`   ${name}: ${data.score}/10`);
    });

    return { passed: true, result };
  } catch (_error) {
    console.log(`❌ SD Rubric Test Failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testPRDQualityRubric() {
  console.log('\n🔍 TEST 2: PRD Quality Rubric (with SD context)');
  console.log('═'.repeat(70));

  try {
    // Fetch a real PRD from database
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .not('functional_requirements', 'is', null)
      .limit(1)
      .single();

    if (error || !prd) {
      console.log('❌ No PRD found in database');
      return { passed: false, error: 'No PRD found' };
    }

    console.log(`📄 Testing PRD: ${prd.id}`);
    console.log(`   SD UUID: ${prd.sd_uuid || 'Not linked'}`);
    console.log(`   Functional Requirements: ${prd.functional_requirements?.length || 0}`);

    const rubric = new PRDQualityRubric();
    const result = await rubric.validatePRDQuality(prd);

    console.log(`\n✅ Score: ${result.score}% (threshold: 70%)`);
    console.log(`   Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log('   Model: gpt-5-mini');
    console.log(`   SD Context Included: ${result.details.sd_context_included ? 'YES' : 'NO'}`);
    console.log(`   Cost: $${result.details.cost_usd?.toFixed(4) || '0.0000'}`);
    console.log(`   Duration: ${result.details.duration_ms}ms`);

    if (result.issues.length > 0) {
      console.log(`\n⚠️  Issues (${result.issues.length}):`);
      result.issues.forEach(issue => console.log(`   - ${issue}`));
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚡ Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    console.log('\n📊 Criterion Scores:');
    Object.entries(result.details.criterion_scores || {}).forEach(([name, data]) => {
      console.log(`   ${name}: ${data.score}/10`);
    });

    return { passed: true, result };
  } catch (_error) {
    console.log(`❌ PRD Rubric Test Failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testUserStoryQualityRubric() {
  console.log('\n🔍 TEST 3: User Story Quality Rubric (with PRD context)');
  console.log('═'.repeat(70));

  try {
    // Fetch a real User Story from database
    const { data: story, error } = await supabase
      .from('user_stories')
      .select('*')
      .not('acceptance_criteria', 'is', null)
      .limit(1)
      .single();

    if (error || !story) {
      console.log('❌ No User Story found in database');
      return { passed: false, error: 'No User Story found' };
    }

    console.log(`📄 Testing User Story: ${story.story_key || story.id}`);
    console.log(`   Title: ${story.title || 'No title'}`);
    console.log(`   Acceptance Criteria: ${story.acceptance_criteria?.length || 0}`);

    const rubric = new UserStoryQualityRubric();
    const result = await rubric.validateUserStoryQuality(story);

    console.log(`\n✅ Score: ${result.score}% (threshold: 70%)`);
    console.log(`   Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log('   Model: gpt-5-mini');
    console.log(`   Cost: $${result.details.cost_usd?.toFixed(4) || '0.0000'}`);
    console.log(`   Duration: ${result.details.duration_ms}ms`);

    if (result.issues.length > 0) {
      console.log(`\n⚠️  Issues (${result.issues.length}):`);
      result.issues.forEach(issue => console.log(`   - ${issue}`));
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚡ Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    console.log('\n📊 Criterion Scores:');
    Object.entries(result.details.criterion_scores || {}).forEach(([name, data]) => {
      console.log(`   ${name}: ${data.score}/10`);
    });

    return { passed: true, result };
  } catch (_error) {
    console.log(`❌ User Story Rubric Test Failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function testRetrospectiveQualityRubric() {
  console.log('\n🔍 TEST 4: Retrospective Quality Rubric (with SD context)');
  console.log('═'.repeat(70));

  try {
    // Fetch a real Retrospective from database
    const { data: retro, error } = await supabase
      .from('retrospectives')
      .select('*')
      .not('key_learnings', 'is', null)
      .limit(1)
      .single();

    if (error || !retro) {
      console.log('❌ No Retrospective found in database');
      return { passed: false, error: 'No Retrospective found' };
    }

    console.log(`📄 Testing Retrospective: ${retro.id}`);
    console.log(`   SD ID: ${retro.sd_id || 'Not linked'}`);
    console.log(`   Key Learnings: ${retro.key_learnings?.length || 0}`);

    const rubric = new RetrospectiveQualityRubric();
    const result = await rubric.validateRetrospectiveQuality(retro);

    console.log(`\n✅ Score: ${result.score}% (threshold: 70%)`);
    console.log(`   Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log('   Model: gpt-5-mini');
    console.log(`   SD Context Included: ${result.details.sd_context_included ? 'YES' : 'NO'}`);
    console.log(`   Cost: $${result.details.cost_usd?.toFixed(4) || '0.0000'}`);
    console.log(`   Duration: ${result.details.duration_ms}ms`);

    if (result.issues.length > 0) {
      console.log(`\n⚠️  Issues (${result.issues.length}):`);
      result.issues.forEach(issue => console.log(`   - ${issue}`));
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚡ Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    console.log('\n📊 Criterion Scores:');
    Object.entries(result.details.criterion_scores || {}).forEach(([name, data]) => {
      console.log(`   ${name}: ${data.score}/10`);
    });

    return { passed: true, result };
  } catch (_error) {
    console.log(`❌ Retrospective Rubric Test Failed: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n🎯 AI-POWERED RUSSIAN JUDGE QUALITY RUBRICS TEST SUITE');
  console.log('═'.repeat(70));
  console.log('Testing all 4 rubrics with real database records...\n');

  const results = {
    sd: null,
    prd: null,
    userStory: null,
    retrospective: null
  };

  // Test 1: SD Quality
  results.sd = await testSDQualityRubric();

  // Test 2: PRD Quality
  results.prd = await testPRDQualityRubric();

  // Test 3: User Story Quality
  results.userStory = await testUserStoryQualityRubric();

  // Test 4: Retrospective Quality
  results.retrospective = await testRetrospectiveQualityRubric();

  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('═'.repeat(70));

  const allPassed = Object.values(results).every(r => r.passed);
  const totalCost = Object.values(results)
    .filter(r => r.result?.details?.cost_usd)
    .reduce((sum, r) => sum + r.result.details.cost_usd, 0);

  console.log(`SD Quality Rubric:          ${results.sd.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`PRD Quality Rubric:         ${results.prd.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`User Story Quality Rubric:  ${results.userStory.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Retrospective Quality:      ${results.retrospective.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`\n💰 Total Test Cost: $${totalCost.toFixed(4)}`);
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
