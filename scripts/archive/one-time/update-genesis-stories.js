import { createDatabaseClient } from './lib/supabase-connection.js';

async function updateGenesisStories() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Story 1: Simulation Pattern Selection
    const story1 = {
      id: 'dd4c2b82-e65d-4bc3-8b0a-1fff72f2740b',
      title: 'Simulation Pattern Selection',
      user_role: 'venture creator',
      user_want: 'to select a simulation pattern',
      user_benefit: 'I can start the Genesis process',
      status: 'ready',  // Changed from 'approved' to 'ready'
      acceptance_criteria: [
        'Pattern selection UI displays available patterns',
        'Selected pattern is stored in session',
        'User can proceed to next step after selection',
        'Invalid selections show error message'
      ],
      implementation_context: JSON.stringify({
        components: ['PatternSelector', 'SimulationWizard'],
        hooks: ['useSimulation', 'usePattern'],
        reviewed: true
      })
    };

    const result1 = await client.query(
      `UPDATE user_stories
      SET title = $1, user_role = $2, user_want = $3, user_benefit = $4,
          status = $5, acceptance_criteria = $6, implementation_context = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, story_key, title, status`,
      [
        story1.title, story1.user_role, story1.user_want, story1.user_benefit,
        story1.status, JSON.stringify(story1.acceptance_criteria),
        story1.implementation_context, story1.id
      ]
    );
    console.log('✅ Updated Story 1:', result1.rows[0]);

    // Story 2: Simulation Configuration Wizard
    const story2 = {
      id: '094d7e6b-93c5-4f23-8d02-31a6ab1efdf3',
      title: 'Simulation Configuration Wizard',
      user_role: 'venture creator',
      user_want: 'to configure my simulation parameters',
      user_benefit: 'Genesis can run with my preferences',
      status: 'ready',  // Changed from 'approved' to 'ready'
      acceptance_criteria: [
        'Wizard displays all required configuration fields',
        'Form validation prevents invalid inputs',
        'Configuration is saved to database on submit',
        'Cancel button returns to previous state'
      ],
      implementation_context: JSON.stringify({
        components: ['ConfigWizard', 'ParameterForm'],
        hooks: ['useConfig', 'useValidation'],
        reviewed: true
      })
    };

    const result2 = await client.query(
      `UPDATE user_stories
      SET title = $1, user_role = $2, user_want = $3, user_benefit = $4,
          status = $5, acceptance_criteria = $6, implementation_context = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, story_key, title, status`,
      [
        story2.title, story2.user_role, story2.user_want, story2.user_benefit,
        story2.status, JSON.stringify(story2.acceptance_criteria),
        story2.implementation_context, story2.id
      ]
    );
    console.log('✅ Updated Story 2:', result2.rows[0]);

    // Verify final state
    const verification = await client.query(
      `SELECT story_key, title, status,
              jsonb_array_length(acceptance_criteria) as criteria_count,
              length(implementation_context) as context_length
       FROM user_stories
       WHERE sd_id = 'SD-GENESIS-UI-001'
       ORDER BY story_key`
    );

    console.log('\n📊 Final Verification:');
    verification.rows.forEach(row => {
      console.log(`  ${row.story_key}: ${row.title}`);
      console.log(`    Status: ${row.status}`);
      console.log(`    Acceptance Criteria: ${row.criteria_count} items`);
      console.log(`    Implementation Context: ${row.context_length} chars`);
    });

    console.log('\n✅ All user stories for SD-GENESIS-UI-001 updated successfully');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateGenesisStories();
