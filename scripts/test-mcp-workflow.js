#!/usr/bin/env node
/**
 * Test MCP-First Workflow
 *
 * Demonstrates how to use Playwright MCP Test Suggester
 * with sample user story data.
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import {
  generateMCPTestCommands,
  createMCPTestingGuide,
  shouldUseMCPTesting
} from './modules/qa/mcp-test-suggester.js';

async function testMCPWorkflow() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎭 Testing MCP-First Workflow');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Try to connect to database (fallback to mock if unavailable)
  console.log('📊 Step 1: Fetching sample user story from database...\n');

  let userStories = null;
  let error = null;

  try {
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
    const result = await supabase
      .from('user_stories')
      .select('*')
      .limit(1)
      .order('created_at', { ascending: false });

    userStories = result.data;
    error = result.error;
  } catch (dbError) {
    console.log('⚠️  Database connection not available (SERVICE_ROLE_KEY missing)');
    console.log('   Falling back to mock data for demonstration...\n');
    error = dbError;
  }

  if (error || !userStories || userStories.length === 0) {
    if (!error) {
      console.log('❌ No user stories found in database');
      console.log('   Create a user story first to test this workflow\n');
    }

    // Use mock data for demonstration
    console.log('📝 Using mock user story for demonstration...\n');
    const mockUserStory = {
      story_key: 'US-001',
      title: 'User can view chairman analytics dashboard',
      description: 'Navigate to /chairman-analytics and view decision analytics',
      acceptance_criteria: [
        'User clicks the "Chairman Analytics" navigation item',
        'Dashboard loads and displays decision history table',
        'User should see confidence score chart',
        'User verifies threshold calibration section is visible'
      ],
      sd_id: 'SD-DEMO-001'
    };

    // Step 2: Generate MCP commands
    console.log('🔧 Step 2: Generating MCP test commands...\n');
    const mcpCommands = generateMCPTestCommands(mockUserStory);

    // Step 3: Display MCP workflow
    console.log('═══════════════════════════════════════════════════════════');
    console.log(createMCPTestingGuide(mockUserStory));
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 4: Check if MCP is appropriate for this SD
    console.log('🎯 Step 4: Testing decision logic...\n');

    const mockSD = {
      id: 'SD-DEMO-001',
      title: 'Chairman Analytics Dashboard',
      category: 'UI',
      scope: 'dashboard'
    };

    const execDecision = shouldUseMCPTesting(mockSD, 'EXEC');
    console.log('📋 EXEC Phase Recommendation:');
    console.log(`   Use MCP: ${execDecision.use_mcp ? '✅ YES' : '❌ NO'}`);
    console.log(`   Rationale: ${execDecision.rationale}`);
    console.log(`   Primary Method: ${execDecision.primary_method}`);
    console.log('');

    const planDecision = shouldUseMCPTesting(mockSD, 'PLAN');
    console.log('📋 PLAN Phase Recommendation:');
    console.log(`   Use MCP: ${planDecision.use_mcp ? '✅ YES' : '❌ NO'}`);
    console.log(`   Rationale: ${planDecision.rationale}`);
    console.log(`   Primary Method: ${planDecision.primary_method}`);
    console.log('');

    // Step 5: Compare with automated approach
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⚖️  Comparison: MCP vs Automated');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🎭 PLAYWRIGHT MCP (Interactive):');
    console.log('   • Time: 2-5 minutes');
    console.log('   • Feedback: Instant visual');
    console.log('   • Use Case: EXEC phase iteration');
    console.log('   • Evidence: Screenshot capture');
    console.log('   • Debugging: Interactive, see browser state');
    console.log('');

    console.log('⚙️  AUTOMATED PLAYWRIGHT (Script):');
    console.log(`   • Time: ${mcpCommands.automation_alternative.estimated_time}`);
    console.log('   • Feedback: After completion');
    console.log('   • Use Case: PLAN phase verification');
    console.log('   • Evidence: Test reports + screenshots');
    console.log('   • Debugging: Log analysis, reruns needed');
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ MCP Workflow Test Complete');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📚 Next Steps:');
    console.log('   1. Use MCP commands during EXEC implementation');
    console.log('   2. Run automated tests before PLAN handoff');
    console.log('   3. Both methods provide confidence, different use cases');
    console.log('');

    return;
  }

  // Use real user story
  const userStory = userStories[0];
  console.log(`✅ Found user story: ${userStory.story_key}`);
  console.log(`   Title: ${userStory.title}\n`);

  // Step 2: Generate MCP commands
  console.log('🔧 Step 2: Generating MCP test commands...\n');
  const mcpCommands = generateMCPTestCommands(userStory);

  // Step 3: Display MCP workflow
  console.log('═══════════════════════════════════════════════════════════');
  console.log(createMCPTestingGuide(userStory));
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('✅ MCP Workflow Test Complete\n');
}

testMCPWorkflow()
  .then(() => {
    console.log('✅ Test successful\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
