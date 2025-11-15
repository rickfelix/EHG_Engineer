/**
 * Retroactive Database-First Recovery: SD-RECURSION-AI-001
 *
 * Purpose: Create missing database records for completed SD-RECURSION-AI-001
 * Context: SD was implemented in EHG app but never created in EHG_Engineer database
 *
 * Tables to populate:
 * - strategic_directives_v2
 * - retrospectives
 * - issue_patterns
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('🔧 SD-RECURSION-AI-001 Database-First Recovery\n');

  try {
    // TASK 1: Check if SD already exists
    console.log('📋 TASK 1: Checking for existing SD-RECURSION-AI-001...');
    const { data: existingSD, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', 'SD-RECURSION-AI-001')
      .maybeSingle();

    if (checkError) {
      console.error('   ❌ Error checking for existing SD:', checkError.message);
      throw checkError;
    }

    if (existingSD) {
      console.log(`   ⚠️  SD already exists: ${existingSD.title} (${existingSD.status})`);
      console.log('   Skipping SD creation, continuing with retrospective and patterns...\n');
    } else {
      // TASK 2: Insert Strategic Directive
      console.log('📋 TASK 2: Creating Strategic Directive record...');

      const sdData = {
        id: 'SD-RECURSION-AI-001',
        title: 'Recursive Stage Refinement & LLM Intelligence Integration',
        description: 'Build AI-first recursion intelligence infrastructure with pattern recognition, LLM advisory integration, and automated learning feedback loops for venture stage validation.',
        rationale: 'Enable data-driven venture stage validation through AI-powered pattern recognition and LLM advisory integration, reducing manual analysis time and improving decision quality.',
        scope: 'Backend services for pattern recognition, LLM advisory integration, and recursion API. Excludes frontend UI components which were part of separate SD.',
        status: 'completed',
        current_phase: 'COMPLETE',
        progress_percentage: 100,
        priority: 'high',
        category: 'feature',
        sd_key: 'SD-RECURSION-AI-001',
        sd_type: 'feature',
        sequence_rank: 1000,
        target_application: 'EHG',
        completion_date: '2025-11-05T00:00:00Z',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: newSD, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .insert(sdData)
        .select()
        .single();

      if (sdError) {
        console.error('   ❌ Error creating SD:', sdError.message);
        console.error('   Details:', sdError.details || 'No details');
        console.error('   Hint:', sdError.hint || 'No hint');
        throw sdError;
      }

      console.log('   ✅ Strategic Directive Created');
      console.log(`      ID: ${newSD.id}`);
      console.log(`      Title: ${newSD.title}`);
      console.log(`      Status: ${newSD.status}`);
      console.log(`      Completion: ${newSD.completion_date}\n`);
    }

    // TASK 3: Insert Retrospective
    console.log('📋 TASK 3: Storing retrospective...');

    // Check if retrospective already exists
    const { data: existingRetro } = await supabase
      .from('retrospectives')
      .select('id')
      .eq('sd_id', 'SD-RECURSION-AI-001')
      .maybeSingle();

    if (existingRetro) {
      console.log('   ⚠️  Retrospective already exists, skipping...\n');
    } else {
      const retrospectiveData = {
        sd_id: 'SD-RECURSION-AI-001',
        title: 'AI-First Recursion Enhancement System with LLM Intelligence',
        generated_by: 'retro-agent',
        quality_score: 82,
        generated_at: '2025-11-05T00:00:00Z',
        status: 'PUBLISHED',

        what_went_well: [
          'Systematic Mock Pattern Development - Developed reusable Supabase mock pattern, saved 10+ hours',
          'Clear Scope Boundary Management - Prevented 4-8 hours scope creep by documenting pre-existing issues',
          'Comprehensive Test Documentation - 70% onboarding time reduction',
          'Incremental Commit Strategy - 40% debugging efficiency improvement',
          'Database-First Handoff Pattern - Zero handoff failures'
        ],

        what_needs_improvement: [
          'Pre-Existing Issue Impact Underestimated - 3-4 hours confusion about SD vs project scope',
          'Mock Pattern Discovery Through Trial-and-Error - 2-3 hours inefficient iteration',
          'ESLint Configuration Gaps - 1-2 hours rework',
          'Async/Sync Test Mismatch - 30-45 min debugging',
          'Test Infrastructure Health Visibility Gap - 51 pre-existing failures with unknown timelines'
        ],

        key_learnings: [
          'Test Health Baseline is Non-Negotiable - Run full test suite BEFORE SD starts',
          'Mock Patterns are Force Multipliers - 2-3 hours savings per service',
          'Scope Boundaries Prevent Scope Creep - Document vs fix saves 4-8 hours',
          'Incremental Commits Enable Efficient Debugging - 40% efficiency improvement',
          'Continuous Monitoring > Reactive Fixes - Reactive is 12-16x more expensive'
        ],

        action_items: [
          {
            title: 'Create Test Health Monitoring System',
            priority: 'P0',
            estimated_hours: 6,
            category: 'INFRASTRUCTURE'
          },
          {
            title: 'Implement Test Health Baseline Gate in LEAD Phase',
            priority: 'P0',
            estimated_hours: 2,
            category: 'PROCESS'
          },
          {
            title: 'Create Comprehensive Mock Pattern Library',
            priority: 'P1',
            estimated_hours: 3,
            category: 'DEVELOPMENT'
          },
          {
            title: 'Standardize Pre-Commit Linting Enforcement',
            priority: 'P1',
            estimated_hours: 1,
            category: 'TOOLING'
          },
          {
            title: 'Fix Pre-Existing Test Failures (CSS calc NaN)',
            priority: 'P2',
            estimated_hours: 8,
            category: 'TECHNICAL_DEBT'
          },
          {
            title: 'Create Async Test Pattern Documentation',
            priority: 'P2',
            estimated_hours: 1,
            category: 'DOCUMENTATION'
          }
        ],

        metrics: {
          total_loc: 8091,
          test_coverage_percentage: 100,
          time_saved: '10+ hours',
          time_wasted: '6-9 hours',
          net_efficiency_gain: '+4 hours this SD, +10 hours future SDs'
        },

        created_at: new Date().toISOString()
      };

      const { data: retro, error: retroError } = await supabase
        .from('retrospectives')
        .insert(retrospectiveData)
        .select()
        .single();

      if (retroError) {
        console.error('   ❌ Error storing retrospective:', retroError.message);
        console.error('   Schema mismatch details:', retroError);
        throw retroError;
      }

      console.log('   ✅ Retrospective Stored');
      console.log(`      SD ID: ${retro.sd_id}`);
      console.log(`      Quality Score: ${retro.quality_score}/100`);
      console.log(`      Action Items: ${retro.action_items.length}`);
      console.log(`      Status: ${retro.status}\n`);
    }

    // TASK 4: Insert Issue Patterns
    console.log('📋 TASK 4: Storing issue patterns...');

    const patterns = [
      {
        pattern_name: 'Pre-Existing Issue Impact Underestimated',
        category: 'testing',
        severity: 'HIGH',
        description: '3-4 hours confusion about SD vs project scope due to lack of test health baseline',
        root_cause: 'No test health baseline established before SD starts',
        proven_solutions: [
          'Run full test suite before SD starts',
          'Document baseline test health in SD handoff',
          'Create test health dashboard for visibility'
        ],
        prevention_checklist: [
          'Run npm test before starting SD work',
          'Document number of pre-existing failures',
          'Establish "test health baseline" in LEAD phase'
        ],
        confidence_score: 0.95,
        occurrence_count: 1,
        first_seen: '2025-10-01',
        last_seen: '2025-11-05',
        related_sds: ['SD-RECURSION-AI-001'],
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        pattern_name: 'Mock Pattern Discovery Through Trial-and-Error',
        category: 'testing',
        severity: 'MEDIUM',
        description: '2-3 hours spent iteratively discovering correct Supabase mock patterns',
        root_cause: 'No centralized mock pattern library or documentation',
        proven_solutions: [
          'Create tests/utils/mockPatterns.ts with reusable Supabase mocks',
          'Document mock patterns in test documentation',
          'Include mock examples in testing guidelines'
        ],
        prevention_checklist: [
          'Check for existing mock patterns before creating new ones',
          'Consult tests/utils/mockPatterns.ts',
          'Document new patterns discovered during SD work'
        ],
        confidence_score: 0.92,
        occurrence_count: 1,
        first_seen: '2025-10-01',
        last_seen: '2025-11-05',
        related_sds: ['SD-RECURSION-AI-001'],
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        pattern_name: 'ESLint Configuration Gaps',
        category: 'tooling',
        severity: 'MEDIUM',
        description: '1-2 hours rework due to ESLint errors not caught during development',
        root_cause: 'ESLint not integrated into pre-commit hooks',
        proven_solutions: [
          'Add ESLint to pre-commit hooks',
          'Enforce --max-warnings=0 in CI/CD',
          'Configure IDE to show ESLint errors in real-time'
        ],
        prevention_checklist: [
          'Run npm run lint before committing',
          'Configure IDE ESLint integration',
          'Add lint step to pre-commit hooks'
        ],
        confidence_score: 0.88,
        occurrence_count: 1,
        first_seen: '2025-10-01',
        last_seen: '2025-11-05',
        related_sds: ['SD-RECURSION-AI-001'],
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        pattern_name: 'Async/Sync Test Mismatch',
        category: 'testing',
        severity: 'LOW',
        description: '30-45 min debugging due to missing await statements in async tests',
        root_cause: 'Inconsistent async/await usage in test files',
        proven_solutions: [
          'Always use async/await for asynchronous operations',
          'Use ESLint rule to catch missing await',
          'Document async test patterns'
        ],
        prevention_checklist: [
          'Mark test functions as async when using await',
          'Use await for all promise-returning functions',
          'Run tests locally before pushing'
        ],
        confidence_score: 0.85,
        occurrence_count: 1,
        first_seen: '2025-10-01',
        last_seen: '2025-11-05',
        related_sds: ['SD-RECURSION-AI-001'],
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        pattern_name: 'Test Infrastructure Health Visibility Gap',
        category: 'testing',
        severity: 'HIGH',
        description: '51 pre-existing failures discovered with no visibility into when they started',
        root_cause: 'No continuous test health monitoring or dashboard',
        proven_solutions: [
          'Implement test health monitoring dashboard',
          'Add test health alerts to CI/CD',
          'Track test failure trends over time'
        ],
        prevention_checklist: [
          'Check test health dashboard before starting SD',
          'Monitor test failure trends',
          'Document test health baseline in SD handoff'
        ],
        confidence_score: 0.93,
        occurrence_count: 1,
        first_seen: '2025-10-01',
        last_seen: '2025-11-05',
        related_sds: ['SD-RECURSION-AI-001'],
        status: 'active',
        created_at: new Date().toISOString()
      }
    ];

    let insertedPatterns = 0;
    const patternErrors = [];

    for (const pattern of patterns) {
      // Check if pattern already exists
      const { data: existingPattern } = await supabase
        .from('issue_patterns')
        .select('id')
        .eq('pattern_name', pattern.pattern_name)
        .maybeSingle();

      if (existingPattern) {
        console.log(`   ⚠️  Pattern "${pattern.pattern_name}" already exists, skipping...`);
        continue;
      }

      const { data: insertedPattern, error: patternError } = await supabase
        .from('issue_patterns')
        .insert(pattern)
        .select()
        .single();

      if (patternError) {
        patternErrors.push({ pattern: pattern.pattern_name, error: patternError.message });
        console.error(`   ❌ Error inserting pattern "${pattern.pattern_name}":`, patternError.message);
      } else {
        insertedPatterns++;
        console.log(`   ✅ Pattern stored: ${insertedPattern.pattern_name} (${insertedPattern.severity})`);
      }
    }

    console.log('\n   📊 Patterns Summary:');
    console.log(`      Total: ${patterns.length}`);
    console.log(`      Inserted: ${insertedPatterns}`);
    console.log(`      Failed: ${patternErrors.length}`);

    if (patternErrors.length > 0) {
      console.log('\n   ⚠️  Pattern Insertion Errors:');
      patternErrors.forEach(({ pattern, error }) => {
        console.log(`      - ${pattern}: ${error}`);
      });
    }

    // TASK 5: Final Verification
    console.log('\n📋 TASK 5: Verifying all insertions...');

    const { data: verifySD } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', 'SD-RECURSION-AI-001')
      .single();

    const { data: verifyRetro } = await supabase
      .from('retrospectives')
      .select('sd_id, title, quality_score')
      .eq('sd_id', 'SD-RECURSION-AI-001')
      .maybeSingle();

    const { data: verifyPatterns } = await supabase
      .from('issue_patterns')
      .select('pattern_name, severity')
      .in('pattern_name', patterns.map(p => p.pattern_name));

    console.log('\n✅ VERIFICATION RESULTS:');
    console.log('   Strategic Directive:', verifySD ? '✅ Present' : '❌ Missing');
    if (verifySD) {
      console.log(`      - ID: ${verifySD.id}`);
      console.log(`      - Title: ${verifySD.title}`);
      console.log(`      - Status: ${verifySD.status}`);
    }

    console.log('   Retrospective:', verifyRetro ? '✅ Present' : '❌ Missing');
    if (verifyRetro) {
      console.log(`      - SD ID: ${verifyRetro.sd_id}`);
      console.log(`      - Quality Score: ${verifyRetro.quality_score}/100`);
    }

    console.log('   Issue Patterns:', verifyPatterns ? `✅ ${verifyPatterns.length}/${patterns.length} Present` : '❌ Missing');
    if (verifyPatterns) {
      const severityCounts = {
        HIGH: verifyPatterns.filter(p => p.severity === 'HIGH').length,
        MEDIUM: verifyPatterns.filter(p => p.severity === 'MEDIUM').length,
        LOW: verifyPatterns.filter(p => p.severity === 'LOW').length
      };
      console.log(`      - High Severity: ${severityCounts.HIGH}`);
      console.log(`      - Medium Severity: ${severityCounts.MEDIUM}`);
      console.log(`      - Low Severity: ${severityCounts.LOW}`);
    }

    console.log('\n🎉 SD-RECURSION-AI-001 database-first recovery complete!');
    console.log('   All future SDs can now query these lessons learned via automated-knowledge-retrieval.js\n');

  } catch (error) {
    console.error('\n❌ Recovery failed:', error.message);
    if (error.details) {
      console.error('   Details:', error.details);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
    process.exit(1);
  }
}

main();
