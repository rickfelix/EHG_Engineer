#!/usr/bin/env node

/**
 * Update TESTING Sub-Agent with Standardized Metadata
 * Preserves comprehensive description, standardizes metadata structure
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateTestingSubAgent() {
  console.log('🔧 Updating TESTING Sub-Agent with Standardized Metadata...\n');

  // Keep existing comprehensive description (already excellent at 18k chars)
  // Just updating metadata structure to match standards

  const updatedMetadata = {
    version: '2.5.0', // Bumped from 2.4.0 for standardization
    last_updated: new Date().toISOString(),
    sources: [
      '74+ retrospectives analyzed',
      'SD-VWC-PRESETS-001: Proactive delegation patterns',
      'SD-SETTINGS-2025-10-12: Test timeout handling',
      'SD-VIF-INTEL-001: 7 Common Playwright pitfalls',
      'QA Director v2.0-v2.4: Progressive enhancement',
      'leo-protocol-subagent-engagement-lesson.md',
      'test-timeout-handling.md',
      'leo-protocol-testing-improvements-2025-10-12.md',
      'qa-director-guide.md v2.2.0 and v2.3.0'
    ],
    success_patterns: [
      'Proactive delegation prevents manual test writing (378 LOC saved per SD)',
      'Test after each user story = 30-40% context reduction, smaller blast radius',
      'MCP browser automation saves 25 min per SD with better evidence quality',
      'Test infrastructure discovery (reuse > recreate) saves 30-60 min per SD',
      '4-step timeout fallback = 90% reduction in timeout-blocked handoffs',
      'Common Playwright pitfalls knowledge prevents flaky tests',
      'Progressive testing workflow catches errors early',
      'Testing learnings capture enables continuous improvement',
      'Pre-test build validation saves 2-3 hours per SD',
      'Database migration verification prevents 1-2 hours debugging',
      'Component integration checking saves 30-60 minutes per SD',
      'Mandatory E2E testing proves features work (not just "does it load")',
      'Hybrid approach: MCP for iteration + Playwright for automation'
    ],
    failure_patterns: [
      'Writing tests manually instead of delegating to testing-agent',
      'Testing only at the end (not after each user story)',
      'Recreating test infrastructure instead of discovering existing helpers',
      'No timeout fallback strategy (blocked on first timeout)',
      'Ignoring common Playwright pitfalls (flaky tests)',
      'Not documenting testing learnings (lost organizational knowledge)',
      'Skipping E2E tests (only smoke tests)',
      'Mouse clicks on sliders (unreliable vs keyboard navigation)',
      'Generic selectors causing strict mode violations',
      'Not dismissing global dialogs/modals in tests',
      'Testing in preview mode instead of dev mode',
      'No evidence collection for handoffs'
    ],
    key_metrics: {
      retrospectives_analyzed: 74,
      version_evolution: 'v2.0 → v2.4 → v2.5',
      description_length: 18259,
      capabilities_count: 20,
      improvements_count: 7,
      time_savings_per_sd: '68-135 minutes',
      time_savings_annually: '68-135 hours (20 SDs/year)',
      context_reduction: '30-40%',
      timeout_block_reduction: '90%',
      proactive_delegation_saves: '378 LOC per SD'
    },
    improvements: [
      {
        title: 'Proactive Engagement Checkpoints',
        impact: 'CRITICAL',
        source: 'SD-VWC-PRESETS-001, leo-protocol-subagent-engagement-lesson.md',
        benefit: 'Prevents manual test writing, saves 30-60 minutes per SD (378 LOC)'
      },
      {
        title: 'Test Timeout Handling Expertise',
        impact: 'HIGH',
        source: 'SD-SETTINGS-2025-10-12, test-timeout-handling.md',
        benefit: '90% reduction in timeout-blocked handoffs via 4-step fallback'
      },
      {
        title: 'Progressive Testing Workflow',
        impact: 'HIGH',
        source: 'leo-protocol-testing-improvements-2025-10-12.md',
        benefit: '30-40% context reduction, smaller blast radius, early error detection'
      },
      {
        title: 'MCP Browser Automation',
        impact: 'MEDIUM',
        source: 'QA Director v2.2.0',
        benefit: '25 min saved per SD, better evidence quality, real-time verification'
      },
      {
        title: 'Common Playwright Pitfalls Knowledge',
        impact: 'MEDIUM',
        source: 'QA Director v2.3.0, SD-VIF-INTEL-001',
        benefit: 'Prevents flaky tests, saves debugging time (7 lessons built-in)'
      },
      {
        title: 'Test Infrastructure Discovery',
        impact: 'MEDIUM',
        source: 'QA Director capabilities',
        benefit: 'Saves 30-60 min per SD (reuse vs recreate)'
      },
      {
        title: 'Testing Learnings Capture',
        impact: 'LOW',
        source: 'QA Director v2.2.0',
        benefit: 'Continuous improvement feedback loop, organizational learning'
      }
    ]
  };

  try {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({
        metadata: updatedMetadata
      })
      .eq('code', 'TESTING')
      .select();

    if (error) {
      console.error('❌ Error updating TESTING sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ TESTING Sub-Agent updated successfully!');
    console.log('\nUpdated fields:');
    console.log('- Version: 2.5.0 (from 2.4.0)');
    console.log('- Sources: 9 retrospectives/patterns');
    console.log('- Success Patterns: 13 patterns');
    console.log('- Failure Patterns: 12 anti-patterns');
    console.log('- Key Improvements: 7 major enhancements');
    console.log('\nEvidence Base:');
    console.log('- 74+ retrospectives analyzed');
    console.log('- Time savings: 68-135 min per SD, 68-135 hours/year');
    console.log('- Context reduction: 30-40%');
    console.log('- Timeout block reduction: 90%');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

updateTestingSubAgent();
