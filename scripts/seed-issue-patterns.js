#!/usr/bin/env node
/**
 * Seed initial issue patterns from documented issues in CLAUDE.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const initialPatterns = [
  {
    pattern_id: 'PAT-001',
    category: 'database',
    severity: 'medium',
    issue_summary: 'Database schema mismatch between TypeScript interfaces and Supabase tables',
    occurrence_count: 5,
    proven_solutions: [{
      solution: "Run schema verification before TypeScript interface updates",
      times_applied: 5,
      times_successful: 5,
      success_rate: 100,
      avg_resolution_time_minutes: 15
    }],
    prevention_checklist: [
      "Verify database schema before updating TypeScript types",
      "Run migration before code changes",
      "Check Supabase dashboard for table structure"
    ],
    success_rate: 100,
    average_resolution_time: '15 minutes',
    status: 'active',
    trend: 'decreasing'
  },
  {
    pattern_id: 'PAT-002',
    category: 'testing',
    severity: 'medium',
    issue_summary: 'Test path errors after component rename or refactoring',
    occurrence_count: 3,
    proven_solutions: [{
      solution: "Update import paths in test files to match new component location",
      times_applied: 3,
      times_successful: 3,
      success_rate: 100,
      avg_resolution_time_minutes: 10
    }],
    prevention_checklist: [
      "Update test imports when renaming components",
      "Use IDE refactoring tools",
      "Run tests after any file moves"
    ],
    success_rate: 100,
    average_resolution_time: '10 minutes',
    status: 'active',
    trend: 'stable'
  },
  {
    pattern_id: 'PAT-003',
    category: 'security',
    severity: 'high',
    issue_summary: 'RLS policy preventing data access even for authenticated users',
    occurrence_count: 3,
    proven_solutions: [{
      solution: "Add auth.uid() check to RLS policy USING clause",
      times_applied: 3,
      times_successful: 3,
      success_rate: 100,
      avg_resolution_time_minutes: 20
    }],
    prevention_checklist: [
      "Verify RLS policies include auth.uid() checks",
      "Test with authenticated user context",
      "Check policy applies to correct operations"
    ],
    success_rate: 100,
    average_resolution_time: '20 minutes',
    status: 'active',
    trend: 'decreasing'
  },
  {
    pattern_id: 'PAT-004',
    category: 'build',
    severity: 'low',
    issue_summary: 'Changes not reflecting after code update - server restart required',
    occurrence_count: 4,
    proven_solutions: [{
      solution: "Kill dev server, rebuild client, restart server",
      times_applied: 4,
      times_successful: 4,
      success_rate: 100,
      avg_resolution_time_minutes: 5
    }],
    prevention_checklist: [
      "Always restart dev server after code changes",
      "Run npm run build:client for UI changes",
      "Hard refresh browser (Ctrl+Shift+R)"
    ],
    success_rate: 100,
    average_resolution_time: '5 minutes',
    status: 'active',
    trend: 'stable'
  },
  {
    pattern_id: 'PAT-005',
    category: 'code_structure',
    severity: 'medium',
    issue_summary: 'Component import errors due to build output path mismatch',
    occurrence_count: 4,
    proven_solutions: [{
      solution: "Verify build output paths match test expectations in vite.config.js",
      times_applied: 4,
      times_successful: 4,
      success_rate: 100,
      avg_resolution_time_minutes: 12
    }],
    prevention_checklist: [
      "Check vite.config.js build output configuration",
      "Verify dist/ paths are correct",
      "Rebuild before testing"
    ],
    success_rate: 100,
    average_resolution_time: '12 minutes',
    status: 'active',
    trend: 'stable'
  },
  {
    pattern_id: 'PAT-006',
    category: 'build',
    severity: 'medium',
    issue_summary: 'Build output directory changed or missing after configuration updates',
    occurrence_count: 2,
    proven_solutions: [{
      solution: "Verify dist/ path matches server static file configuration",
      times_applied: 2,
      times_successful: 2,
      success_rate: 100,
      avg_resolution_time_minutes: 15
    }],
    prevention_checklist: [
      "Document build paths in README",
      "Keep vite.config.js and server.js paths in sync"
    ],
    success_rate: 100,
    average_resolution_time: '15 minutes',
    status: 'active',
    trend: 'stable'
  },
  {
    pattern_id: 'PAT-007',
    category: 'protocol',
    severity: 'medium',
    issue_summary: 'Sub-agent not triggering despite matching keyword in context',
    occurrence_count: 3,
    proven_solutions: [{
      solution: "Verify trigger keyword in leo_sub_agent_triggers table and check activation_type",
      times_applied: 3,
      times_successful: 3,
      success_rate: 100,
      avg_resolution_time_minutes: 25
    }],
    prevention_checklist: [
      "Check trigger keywords in database",
      "Verify sub-agent is active",
      "Review activation context requirements"
    ],
    success_rate: 100,
    average_resolution_time: '25 minutes',
    status: 'active',
    trend: 'stable'
  },
  {
    pattern_id: 'PAT-008',
    category: 'deployment',
    severity: 'high',
    issue_summary: 'CI/CD pipeline failures due to environment variable or dependency issues',
    occurrence_count: 2,
    proven_solutions: [{
      solution: "Check GitHub Actions secrets and package.json dependencies",
      times_applied: 2,
      times_successful: 2,
      success_rate: 100,
      avg_resolution_time_minutes: 30
    }],
    prevention_checklist: [
      "Verify all required secrets are set in GitHub",
      "Test locally with same Node version as CI",
      "Check package-lock.json is committed"
    ],
    success_rate: 100,
    average_resolution_time: '30 minutes',
    status: 'active',
    trend: 'stable'
  }
];

async function seedPatterns() {
  console.log('\n🌱 Seeding initial issue patterns...\n');

  try {
    // Check existing patterns
    const { data: existing } = await supabase
      .from('issue_patterns')
      .select('pattern_id');

    const existingIds = new Set(existing?.map(p => p.pattern_id) || []);

    // Insert patterns that don't exist
    let inserted = 0;
    let skipped = 0;

    for (const pattern of initialPatterns) {
      if (existingIds.has(pattern.pattern_id)) {
        console.log(`  ⏭️  ${pattern.pattern_id} already exists (skipped)`);
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from('issue_patterns')
        .insert([pattern]);

      if (error) {
        console.error(`  ❌ Failed to insert ${pattern.pattern_id}:`, error.message);
      } else {
        console.log(`  ✅ Inserted ${pattern.pattern_id}: ${pattern.category}`);
        inserted++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Total: ${initialPatterns.length}`);

    // Show final stats
    const { count } = await supabase
      .from('issue_patterns')
      .select('*', { count: 'exact', head: true });

    console.log(`\n✨ Database now has ${count} pattern(s)\n`);

    console.log('Next steps:');
    console.log('  1. Test search: node scripts/search-prior-issues.js "database schema"');
    console.log('  2. View all: node scripts/search-prior-issues.js --list');
    console.log('  3. Show stats: node scripts/search-prior-issues.js --stats\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedPatterns();
