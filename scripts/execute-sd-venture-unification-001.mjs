#!/usr/bin/env node

/**
 * Execute SD-VENTURE-UNIFICATION-001 creation SQL
 * Per LEO Protocol v4.2.0 - Database-first approach
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function executeSDCreation() {
  console.log('📋 Creating Strategic Directive SD-VENTURE-UNIFICATION-001...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // Use service role key to bypass RLS for administrative operations
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    console.log('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Create SD entry in database
    // Using actual strategic_directives_v2 schema
    const { data, error} = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: 'SD-VENTURE-UNIFICATION-001',
        title: 'Unified Venture Creation System with Intelligent Dependency-Driven Recursion',
        status: 'draft',
        category: 'strategic',
        priority: 'critical',
        description: `Unify two parallel venture creation systems into a single seamless system where ALL ventures complete ALL 40 stages with intelligent dependency-driven recursion.

VISION: Smart recursion engine that automatically detects when downstream stages invalidate upstream decisions and routes back to fix root causes.

KEY FEATURES:
• Wizard → 40-Stage Auto-Launch (seamless transition)
• Dependency-Driven Recursion (FIN-001, TECH-001, MKT-001/002, RISK-001)
• Threshold-Based Automation (CRITICAL auto-recurse, HIGH needs approval)
• Database Consolidation (ventures table only, deprecate ideas)
• Loop Prevention (max 3 recursions/stage, Chairman escalation)

OUTCOMES:
• 100% ventures complete all 40 stages (no tier limits)
• 20-30% fewer post-launch pivots via early quality gates
• 40% reduction in Chairman manual oversight
• 8-12 hours to complete all 40 stages

ACCEPTANCE CRITERIA (12 items):
AC-001: Auto-redirect wizard → Stage 4 workflow
AC-002: All 40 stages accessible (no tier limits)
AC-003: ROI <15% triggers auto-recursion to Stage 3
AC-004: Blocking tech issues trigger recursion to Stage 8
AC-005: 3x recursion same stage escalates to Chairman
AC-006: Zero data loss in ideas → ventures migration
AC-007: Existing ventures grandfathered (backward compat)
AC-008: Recursion detection <100ms
AC-009: 20-25 scenarios documented
AC-010: E2E tests for all CRITICAL paths
AC-011: Recursion history visible in UI
AC-012: Chairman can override HIGH thresholds

TIMELINE: 8 weeks, 144 hours (5 phases)
EFFORT: Phase 1 (1wk) DB+bridge, Phase 2 (2wk) recursion engine, Phase 3-4 (4wk) stage integration, Phase 5 (1wk) testing`,
        rationale: `CURRENT STATE PROBLEMS:
1. Two parallel systems (wizard vs 40-stage workflow) with ZERO integration
2. 40-stage workflow has NO ROUTE - users can't access it
3. NO smart recursion - bad assumptions cascade through all stages
4. Financial forecasts can reveal flawed business models but system doesn't backtrack
5. Technical complexity discoveries don't trigger re-planning
6. Users repeat work instead of intelligent revision

WHY THIS MATTERS:
• Prevents cascading failures (catch bad assumptions early)
• Ensures solid plans for EVERY venture (no shortcuts)
• Reduces Chairman manual oversight via automated quality gates
• Data-driven improvement (track common failure patterns)
• Faster time to quality (smart backtracking vs starting over)

BUSINESS IMPACT:
• Baseline: 55% venture success rate at 12 months
• Target: 70%+ success rate via better upfront planning
• 20-30% reduction in post-launch pivots
• $500K+ development investment already in 40-stage system (preserve value)`,
        scope: `IN SCOPE:
• VentureCreationPage.tsx (3-step wizard) auto-launch integration
• CompleteWorkflowOrchestrator.tsx (40-stage workflow) route registration
• All 40 stage components (recursion validation logic)
• Database consolidation (ventures table schema updates)
• ideas table migration to ventures.metadata
• recursionEngine.ts service (new)
• recursion_events table (new)
• 20-25 recursion scenarios (FIN, TECH, MKT, RISK categories)
• Loop prevention (max 3/stage, escalation)
• Chairman approval workflow (HIGH thresholds)
• E2E tests for CRITICAL recursion paths
• Recursion history UI

OUT OF SCOPE (Future Iterations):
• Tier-based AI research depth
• Tier-based stage complexity
• Recursion analytics dashboard
• Voice capture migration
• Multi-venture dependency tracking`,
        created_by: 'Chairman',
        sequence_rank: 1,
        version: '1.0'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }

    console.log('✅ Strategic Directive SD-VENTURE-UNIFICATION-001 created successfully!\n');
    console.log('Database record:');
    console.log('  Key:', data.key);
    console.log('  Title:', data.title);
    console.log('  Priority:', data.priority);
    console.log('  Status:', data.status);
    console.log('  Owner:', data.owner);
    console.log('  Target Release:', data.target_release);
    console.log('  Created:', data.created_at);

    console.log('\n📝 Next Steps (LEO Protocol):');
    console.log('1. Review Strategic Directive in database');
    console.log('2. Create Epic Execution Sequences (EES) for 5 implementation phases');
    console.log('3. Generate PRDs for each epic');
    console.log('4. Create user stories from acceptance criteria');
    console.log('5. Update status to "Active" when ready to begin:');
    console.log('   UPDATE strategic_directives_v2 SET status = \'Active\' WHERE key = \'SD-VENTURE-UNIFICATION-001\';');

  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    process.exit(1);
  }
}

executeSDCreation();
