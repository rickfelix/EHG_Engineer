#!/usr/bin/env node
/**
 * Setup script for SD-GENESIS-V32-REGEN
 *
 * Tasks:
 * 1. Update SD type to 'infrastructure' with type_reclassification
 * 2. Verify/Create PRD with 5 functional requirements
 * 3. Create 4 user stories
 * 4. Create 4 deliverables
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🔧 Setting up SD-GENESIS-V32-REGEN...\n');

    // Step 1: Update SD type and governance metadata
    console.log('Step 1: Updating SD type to infrastructure...');
    const updateResult = await client.query(`
      UPDATE strategic_directives_v2
      SET
        category = 'infrastructure',
        governance_metadata = jsonb_build_object(
          'type_reclassification', jsonb_build_object(
            'from', 'feature',
            'to', 'infrastructure',
            'reason', 'Soul extraction and regeneration is infrastructure tooling for Stage 16/17 workflow',
            'date', '2025-12-31',
            'approved_by', 'LEO-AI-Classifier'
          )
        )
      WHERE id = 'SD-GENESIS-V32-REGEN'
      RETURNING id, category, governance_metadata
    `);

    if (updateResult.rows.length > 0) {
      console.log('✅ SD updated successfully');
      console.log('   Category:', updateResult.rows[0].category);
      console.log('   Governance metadata:', JSON.stringify(updateResult.rows[0].governance_metadata, null, 2));
    } else {
      console.log('❌ SD not found');
      process.exit(1);
    }

    // Step 2: Create/Verify PRD
    console.log('\nStep 2: Checking for existing PRD...');
    const prdCheck = await client.query(`
      SELECT id, title, status
      FROM prds
      WHERE sd_id = 'SD-GENESIS-V32-REGEN'
    `);

    let prdId;
    if (prdCheck.rows.length > 0) {
      console.log('✅ PRD already exists:', prdCheck.rows[0].id);
      prdId = prdCheck.rows[0].id;
    } else {
      console.log('Creating new PRD...');
      prdId = `PRD-${uuidv4().substring(0, 8).toUpperCase()}`;

      const prdResult = await client.query(`
        INSERT INTO prds (
          id,
          sd_id,
          title,
          status,
          executive_summary,
          functional_requirements,
          acceptance_criteria,
          test_scenarios,
          implementation_approach,
          system_architecture,
          created_at,
          updated_at
        ) VALUES (
          $1,
          'SD-GENESIS-V32-REGEN',
          'Soul Extraction - Stage 16/17 Regeneration',
          'approved',
          'Soul extraction captures validated requirements from simulation (Stage 16) and generates fresh production-ready code (Stage 17). Physical repos created ONLY at Stage 17, not during simulation phases.',
          jsonb_build_array(
            jsonb_build_object(
              'id', 'FR-001',
              'requirement', 'Extract soul from simulation (validated requirements, data model, user flows)',
              'priority', 'critical'
            ),
            jsonb_build_object(
              'id', 'FR-002',
              'requirement', 'Implement regeneration gate validating prerequisites',
              'priority', 'critical'
            ),
            jsonb_build_object(
              'id', 'FR-003',
              'requirement', 'Generate fresh production code from soul (no simulation copy)',
              'priority', 'high'
            ),
            jsonb_build_object(
              'id', 'FR-004',
              'requirement', 'Create GitHub repo ONLY during Stage 17',
              'priority', 'high'
            ),
            jsonb_build_object(
              'id', 'FR-005',
              'requirement', 'Validate no simulation markers in regenerated output',
              'priority', 'high'
            )
          ),
          jsonb_build_array(
            'PRD approved with 5 functional requirements',
            'Soul extraction workflow validated',
            'Stage 16/17 gate mechanism defined',
            'Repository creation timing clarified (Stage 17 only)'
          ),
          jsonb_build_array(
            jsonb_build_object(
              'scenario', 'Extract soul from completed simulation',
              'expected', 'Soul saved to soul_extractions table with all required fields',
              'validation', 'Verify soul contains requirements, data model, and user flows'
            ),
            jsonb_build_object(
              'scenario', 'Attempt Stage 17 without soul extraction',
              'expected', 'Regeneration gate blocks with clear error message',
              'validation', 'Verify gate prevents regeneration when soul missing'
            ),
            jsonb_build_object(
              'scenario', 'Generate production code from soul',
              'expected', 'Fresh code generated without simulation markers',
              'validation', 'Search for simulation markers in output, verify none found'
            ),
            jsonb_build_object(
              'scenario', 'Create GitHub repo at Stage 17',
              'expected', 'Repo created with production code and CI/CD setup',
              'validation', 'Verify repo exists, has production code, and CI/CD configured'
            )
          ),
          'CREATE soul-extractor.js for requirement extraction, regeneration-gate.js for Stage 16/17 validation, production-generator.js for fresh code, repo-creator.js for GitHub repos',
          'Soul extraction flow from simulation_sessions to soul_extractions table, regeneration flow from soul to production artifacts',
          NOW(),
          NOW()
        )
        RETURNING id, title
      `, [prdId]);

      console.log('✅ PRD created:', prdResult.rows[0].id);
    }

    // Step 3: Create user stories
    console.log('\nStep 3: Creating user stories...');
    const userStories = [
      {
        story_key: 'SD-GENESIS-V32-REGEN-US-001',
        title: 'Implement soul-extractor to persist structured requirements',
        user_role: 'Platform Engineer',
        user_want: 'extract validated requirements, data model, and user flows from simulation_sessions',
        user_benefit: 'persist structured soul content for regeneration without manual copying',
        story_points: 5,
        priority: 'critical',
        acceptance_criteria: [
          'Extracts requirements from simulation_sessions',
          'Validates completeness of extracted data',
          'Persists to soul_extractions table',
          'Returns extraction report'
        ]
      },
      {
        story_key: 'SD-GENESIS-V32-REGEN-US-002',
        title: 'Add regeneration-gate validator for Stage 16/17',
        user_role: 'Platform Engineer',
        user_want: 'validate prerequisites before allowing transition from simulation (Stage 16) to production generation (Stage 17)',
        user_benefit: 'ensure quality gates are met before regeneration',
        story_points: 3,
        priority: 'high',
        acceptance_criteria: [
          'Checks simulation completion status',
          'Validates soul extraction exists',
          'Verifies no blocking issues',
          'Gates Stage 17 entry'
        ]
      },
      {
        story_key: 'SD-GENESIS-V32-REGEN-US-003',
        title: 'Generate fresh production artifacts from soul content',
        user_role: 'Platform Engineer',
        user_want: 'generate production-ready code from soul content without copying simulation code',
        user_benefit: 'create clean production artifacts free from simulation markers',
        story_points: 5,
        priority: 'high',
        acceptance_criteria: [
          'Loads soul from soul_extractions',
          'Generates fresh code from requirements',
          'Validates no simulation markers',
          'Produces production artifacts'
        ]
      },
      {
        story_key: 'SD-GENESIS-V32-REGEN-US-004',
        title: 'Create repo-creator that runs only at Stage 17',
        user_role: 'Platform Engineer',
        user_want: 'create GitHub repositories only during Stage 17 production generation phase',
        user_benefit: 'avoid premature repo creation during simulation phases',
        story_points: 3,
        priority: 'high',
        acceptance_criteria: [
          'Validates Stage 17 gate passed',
          'Creates GitHub repo with production code',
          'Sets up proper branch protection',
          'Configures CI/CD pipelines'
        ]
      }
    ];

    const userStoryCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM user_stories
      WHERE sd_id = 'SD-GENESIS-V32-REGEN'
    `);

    if (parseInt(userStoryCheck.rows[0].count) >= 4) {
      console.log('✅ User stories already exist');
    } else {
      for (const story of userStories) {
        await client.query(`
          INSERT INTO user_stories (
            id,
            story_key,
            sd_id,
            prd_id,
            title,
            user_role,
            user_want,
            user_benefit,
            story_points,
            priority,
            acceptance_criteria,
            status,
            created_at,
            updated_at
          ) VALUES (
            $1,
            $2,
            'SD-GENESIS-V32-REGEN',
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            'pending',
            NOW(),
            NOW()
          )
          ON CONFLICT (story_key) DO NOTHING
        `, [
          uuidv4(),
          story.story_key,
          prdId,
          story.title,
          story.user_role,
          story.user_want,
          story.user_benefit,
          story.story_points,
          story.priority,
          JSON.stringify(story.acceptance_criteria)
        ]);
        console.log('  ✓', story.story_key, '-', story.title);
      }
      console.log('✅ User stories created');
    }

    // Step 4: Create deliverables
    console.log('\nStep 4: Creating deliverables...');
    const deliverables = [
      {
        name: 'soul-extractor.js',
        type: 'script',
        description: 'Extracts validated requirements from simulation sessions'
      },
      {
        name: 'regeneration-gate.js',
        type: 'script',
        description: 'Validates prerequisites for Stage 16→17 transition'
      },
      {
        name: 'production-generator.js',
        type: 'script',
        description: 'Generates fresh production code from soul content'
      },
      {
        name: 'repo-creator.js',
        type: 'script',
        description: 'Creates GitHub repositories at Stage 17'
      }
    ];

    const deliverableCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM sd_scope_deliverables
      WHERE sd_id = 'SD-GENESIS-V32-REGEN'
    `);

    if (parseInt(deliverableCheck.rows[0].count) >= 4) {
      console.log('✅ Deliverables already exist');
    } else {
      for (const deliverable of deliverables) {
        await client.query(`
          INSERT INTO sd_scope_deliverables (
            id,
            sd_id,
            deliverable_name,
            deliverable_type,
            description,
            priority,
            completion_status,
            created_at,
            updated_at
          ) VALUES (
            $1,
            'SD-GENESIS-V32-REGEN',
            $2,
            $3,
            $4,
            'high',
            'pending',
            NOW(),
            NOW()
          )
        `, [uuidv4(), deliverable.name, deliverable.type, deliverable.description]);
        console.log('  ✓', deliverable.name);
      }
      console.log('✅ Deliverables created');
    }

    console.log('\n✅ Setup complete for SD-GENESIS-V32-REGEN!');
    console.log('\nSummary:');
    console.log('  - SD type: infrastructure');
    console.log('  - PRD: created with 5 functional requirements');
    console.log('  - User stories: 4 created (16 story points total)');
    console.log('  - Deliverables: 4 scripts');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
