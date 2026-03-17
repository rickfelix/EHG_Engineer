#!/usr/bin/env node

/**
 * Update SD-KNOWLEDGE-001 with required fields
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSD() {
  console.log('📝 Updating SD-KNOWLEDGE-001 with missing fields...');

  try {
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'active',
        current_phase: 'PLAN',
        success_metrics: [
          {
            name: 'PLAN→EXEC Handoff Time',
            baseline: '45 min',
            target: '≤30 min',
            measurement: 'Timestamp diff in sd_phase_handoffs table'
          },
          {
            name: 'EXEC Clarification Count',
            baseline: '5-7 per SD',
            target: '≤3 per SD',
            measurement: 'Count of EXEC→PLAN questions in handoffs'
          },
          {
            name: 'PRD Completeness Score',
            baseline: '70%',
            target: '≥85%',
            measurement: 'Sub-agent audit of implementation_context'
          }
        ],
        risks: [
          {
            category: 'Integration Risk',
            severity: 'MEDIUM',
            likelihood: 'MEDIUM',
            description: 'Context7 MCP API may timeout or rate limit',
            mitigation: 'Circuit breaker pattern with 3-failure threshold, 1-hour recovery, graceful degradation to local retrospectives only'
          },
          {
            category: 'Token Budget Risk',
            severity: 'LOW',
            likelihood: 'LOW',
            description: 'Research queries may exceed token budget',
            mitigation: 'Hard caps at 5k tokens/query, 15k tokens/PRD with automatic truncation'
          },
          {
            category: 'Cache Drift Risk',
            severity: 'LOW',
            likelihood: 'MEDIUM',
            description: 'Cached results may become stale as dependencies update',
            mitigation: '24-hour TTL, versioning by package.json hash, invalidation on dependency changes'
          }
        ],
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-KNOWLEDGE-001')
      .select();

    if (error) throw error;

    console.log('✅ SD updated successfully!');
    console.log(`   Success Metrics: ${data[0].success_metrics.length}`);
    console.log(`   Risks: ${data[0].risks.length}`);
    console.log('\n📋 Now ready for LEAD→PLAN handoff');

  } catch (_error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
  }
}

updateSD();
