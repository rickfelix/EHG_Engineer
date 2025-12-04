import { createDatabaseClient } from '../lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Query strategic_directives_v2 table - using only existing columns
    const sdResult = await client.query(`
      SELECT
        id, title, description, status, priority,
        current_phase, progress_percentage, phase_progress,
        strategic_objectives, dependencies, risks,
        created_at, updated_at, completion_date, effective_date,
        category, is_working_on,
        rationale, scope, success_criteria, success_metrics,
        key_changes, key_principles, implementation_guidelines,
        stakeholders, approved_by, approval_date,
        confidence_score, checkpoint_plan,
        sd_type, target_application, sequence_rank,
        is_active, archived_at, strategic_intent,
        relationship_type, scope_reduction_percentage,
        delivers_capabilities, modifies_capabilities, deprecates_capabilities,
        active_session_id
      FROM strategic_directives_v2
      WHERE id = 'SD-EVA-CIRCUIT-001' OR title ILIKE '%circuit breaker%'
      ORDER BY created_at DESC
    `);

    console.log('=== STRATEGIC DIRECTIVE DETAILS ===\n');

    if (sdResult.rows.length === 0) {
      console.log('No SD found matching SD-EVA-CIRCUIT-001 or "circuit breaker"');
    } else {
      sdResult.rows.forEach((sd, idx) => {
        console.log(`\n--- SD ${idx + 1} ---`);
        console.log(`ID: ${sd.id}`);
        console.log(`Title: ${sd.title}`);
        console.log(`Status: ${sd.status}`);
        console.log(`Priority: ${sd.priority}`);
        console.log(`Current Phase: ${sd.current_phase}`);
        console.log(`Progress: ${sd.progress_percentage}% (Phase: ${sd.phase_progress}%)`);
        console.log(`Category: ${sd.category}`);
        console.log(`SD Type: ${sd.sd_type}`);
        console.log(`Target Application: ${sd.target_application}`);
        console.log(`Confidence Score: ${sd.confidence_score}`);
        console.log(`Sequence Rank: ${sd.sequence_rank}`);
        console.log(`Working On: ${sd.is_working_on}`);
        console.log(`Is Active: ${sd.is_active}`);
        console.log(`Active Session ID: ${sd.active_session_id}`);
        console.log(`\nRelationship Type: ${sd.relationship_type}`);
        console.log(`Scope Reduction: ${sd.scope_reduction_percentage}%`);
        console.log(`Delivers Capabilities: ${JSON.stringify(sd.delivers_capabilities, null, 2)}`);
        console.log(`Modifies Capabilities: ${JSON.stringify(sd.modifies_capabilities, null, 2)}`);
        console.log(`Deprecates Capabilities: ${JSON.stringify(sd.deprecates_capabilities, null, 2)}`);
        console.log(`\nDescription:\n${sd.description}`);
        console.log(`\nStrategic Intent:\n${sd.strategic_intent}`);
        console.log(`\nRationale:\n${sd.rationale}`);
        console.log(`\nScope:\n${sd.scope}`);
        console.log(`\nSuccess Criteria:\n${JSON.stringify(sd.success_criteria, null, 2)}`);
        console.log(`\nSuccess Metrics:\n${JSON.stringify(sd.success_metrics, null, 2)}`);
        console.log(`\nStrategic Objectives:\n${JSON.stringify(sd.strategic_objectives, null, 2)}`);
        console.log(`\nKey Changes:\n${JSON.stringify(sd.key_changes, null, 2)}`);
        console.log(`\nKey Principles:\n${JSON.stringify(sd.key_principles, null, 2)}`);
        console.log(`\nImplementation Guidelines:\n${JSON.stringify(sd.implementation_guidelines, null, 2)}`);
        console.log(`\nDependencies:\n${JSON.stringify(sd.dependencies, null, 2)}`);
        console.log(`\nRisks:\n${JSON.stringify(sd.risks, null, 2)}`);
        console.log(`\nStakeholders:\n${JSON.stringify(sd.stakeholders, null, 2)}`);
        console.log(`\nCheckpoint Plan:\n${JSON.stringify(sd.checkpoint_plan, null, 2)}`);
        console.log(`\nCreated: ${sd.created_at}`);
        console.log(`Updated: ${sd.updated_at}`);
        console.log(`Approved By: ${sd.approved_by}`);
        console.log(`Approval Date: ${sd.approval_date}`);
        console.log(`Effective Date: ${sd.effective_date}`);
        console.log(`Completion Date: ${sd.completion_date}`);
        console.log(`Archived At: ${sd.archived_at}`);
      });
    }

    // Query related PRDs (product_requirements_v2)
    console.log('\n\n=== RELATED PRDs ===\n');
    const prdResult = await client.query(`
      SELECT id, title, description, status, priority, sd_id, created_at
      FROM product_requirements_v2
      WHERE sd_id = 'SD-EVA-CIRCUIT-001'
      ORDER BY created_at DESC
    `);

    if (prdResult.rows.length === 0) {
      console.log('No PRDs found for SD-EVA-CIRCUIT-001');
    } else {
      prdResult.rows.forEach((prd, idx) => {
        console.log(`\n--- PRD ${idx + 1} ---`);
        console.log(`ID: ${prd.id}`);
        console.log(`Title: ${prd.title}`);
        console.log(`Status: ${prd.status}`);
        console.log(`Priority: ${prd.priority}`);
        console.log(`SD ID: ${prd.sd_id}`);
        console.log(`Created: ${prd.created_at}`);
        console.log(`Description: ${prd.description?.substring(0, 200)}...`);
      });
    }

    // Query user stories
    console.log('\n\n=== RELATED USER STORIES ===\n');
    const storyResult = await client.query(`
      SELECT us.id, us.title, us.description, us.status, us.priority, us.story_points, us.created_at
      FROM user_stories us
      INNER JOIN product_requirements_v2 p ON us.prd_id = p.id
      WHERE p.sd_id = 'SD-EVA-CIRCUIT-001'
      ORDER BY us.created_at DESC
    `);

    if (storyResult.rows.length === 0) {
      console.log('No user stories found for SD-EVA-CIRCUIT-001');
    } else {
      storyResult.rows.forEach((story, idx) => {
        console.log(`\n--- Story ${idx + 1} ---`);
        console.log(`ID: ${story.id}`);
        console.log(`Title: ${story.title}`);
        console.log(`Status: ${story.status}`);
        console.log(`Priority: ${story.priority}`);
        console.log(`Story Points: ${story.story_points}`);
        console.log(`Created: ${story.created_at}`);
        console.log(`Description: ${story.description?.substring(0, 200)}...`);
      });
    }

    // Query handoff executions
    console.log('\n\n=== HANDOFF HISTORY ===\n');
    const handoffResult = await client.query(`
      SELECT id, from_phase, to_phase, status, created_at, completed_at,
             verification_status, rejection_reason
      FROM leo_handoff_executions
      WHERE sd_id = 'SD-EVA-CIRCUIT-001'
      ORDER BY created_at DESC
    `);

    if (handoffResult.rows.length === 0) {
      console.log('No handoff executions found for SD-EVA-CIRCUIT-001');
    } else {
      handoffResult.rows.forEach((handoff, idx) => {
        console.log(`\n--- Handoff ${idx + 1} ---`);
        console.log(`ID: ${handoff.id}`);
        console.log(`Transition: ${handoff.from_phase} → ${handoff.to_phase}`);
        console.log(`Status: ${handoff.status}`);
        console.log(`Verification: ${handoff.verification_status}`);
        if (handoff.rejection_reason) {
          console.log(`Rejection Reason: ${handoff.rejection_reason}`);
        }
        console.log(`Created: ${handoff.created_at}`);
        console.log(`Completed: ${handoff.completed_at || 'Not completed'}`);
      });
    }

  } catch (error) {
    console.error('Error querying database:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
  }
})();
