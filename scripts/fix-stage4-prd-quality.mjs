#!/usr/bin/env node

/**
 * Fix PRD Quality Issues for Stage 4 Child SDs
 * Adds missing required fields: system_architecture, implementation_approach, risks
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const childSDs = [
  'SD-STAGE4-UI-RESTRUCTURE-001',
  'SD-STAGE4-AGENT-PROGRESS-001',
  'SD-STAGE4-RESULTS-DISPLAY-001',
  'SD-STAGE4-ERROR-HANDLING-001'
];

// Define missing fields for each SD
const prdUpdates = {
  'SD-STAGE4-UI-RESTRUCTURE-001': {
    system_architecture: {
      frontend: {
        components: ['CompetitiveIntelligenceView.tsx', 'ManualCompetitorEntry.tsx', 'AIProgressCard.tsx'],
        state_management: 'React hooks (useState, useEffect) for local state, Context API for shared state',
        routing: 'React Router v6 for navigation management'
      },
      backend: {
        api_endpoints: ['/api/competitors/manual', '/api/competitors/ai-start'],
        websocket_channels: ['execution-status', 'progress-updates'],
        database_tables: ['competitors', 'agent_execution_logs']
      },
      integration_points: {
        supabase_realtime: 'WebSocket subscriptions for real-time progress',
        authentication: 'Supabase auth for user session management',
        error_tracking: 'Sentry integration for error monitoring'
      }
    },
    implementation_approach: {
      phase1: 'Move manual entry to accordion (US-001)',
      phase2: 'Create progress tracking component (US-002)',
      phase3: 'Add navigation blocking (US-003)',
      phase4: 'Integrate real-time updates (US-004)',
      testing_strategy: 'Unit tests for components, E2E tests for user flows',
      deployment_strategy: 'Feature flags for gradual rollout'
    },
    risks: [
      {
        risk: 'WebSocket connection instability',
        impact: 'high',
        mitigation: 'Implement reconnection logic with exponential backoff'
      },
      {
        risk: 'Browser compatibility issues with accordion',
        impact: 'medium',
        mitigation: 'Test across major browsers, provide fallback UI'
      },
      {
        risk: 'State synchronization during navigation',
        impact: 'medium',
        mitigation: 'Use sessionStorage for state persistence'
      }
    ]
  },
  'SD-STAGE4-AGENT-PROGRESS-001': {
    system_architecture: {
      backend: {
        services: ['AgentExecutionService', 'ProgressTracker', 'StatusBroadcaster'],
        message_queue: 'PostgreSQL LISTEN/NOTIFY for real-time updates',
        database_tables: ['agent_executions', 'agent_execution_logs', 'execution_metrics']
      },
      frontend: {
        hooks: ['useAgentExecutionStatus', 'useProgressTracking', 'useWebSocketConnection'],
        components: ['ExecutionProgress', 'StageIndicator', 'ErrorDisplay'],
        state_management: 'Zustand for global execution state'
      },
      monitoring: {
        metrics: ['execution_duration', 'stage_completion_rate', 'error_frequency'],
        logging: 'Structured JSON logging with correlation IDs',
        alerting: 'Threshold-based alerts for failed executions'
      }
    },
    implementation_approach: {
      phase1: 'Set up database schema and triggers',
      phase2: 'Implement backend progress tracking service',
      phase3: 'Create WebSocket event broadcasting',
      phase4: 'Build frontend progress visualization',
      testing_strategy: 'Integration tests for real-time updates, load testing for concurrent executions',
      deployment_strategy: 'Blue-green deployment with health checks'
    },
    risks: [
      {
        risk: 'Database performance with high-frequency updates',
        impact: 'high',
        mitigation: 'Batch updates, optimize indexes, implement caching layer'
      },
      {
        risk: 'Message ordering in distributed system',
        impact: 'medium',
        mitigation: 'Use timestamps and sequence numbers for ordering'
      },
      {
        risk: 'Memory leaks in long-running WebSocket connections',
        impact: 'medium',
        mitigation: 'Implement connection pooling and automatic cleanup'
      }
    ]
  },
  'SD-STAGE4-RESULTS-DISPLAY-001': {
    system_architecture: {
      frontend: {
        components: ['ResultsDisplay', 'CompetitorCard', 'MarketAnalysisChart', 'FeatureMatrix'],
        visualization_library: 'Recharts for data visualization',
        state_management: 'React Query for server state caching'
      },
      backend: {
        api_endpoints: ['/api/results/venture/:id', '/api/results/stage/:stageNumber'],
        data_processing: 'Result aggregation and transformation service',
        caching: 'Redis for frequently accessed results'
      },
      storage: {
        database_tables: ['ai_stage_results', 'competitors', 'market_analysis'],
        file_storage: 'Supabase Storage for generated reports',
        indexing: 'Full-text search on result summaries'
      }
    },
    implementation_approach: {
      phase1: 'Design result display components and layouts',
      phase2: 'Implement data fetching and caching logic',
      phase3: 'Add interactive visualizations and charts',
      phase4: 'Create export and sharing functionality',
      testing_strategy: 'Visual regression testing, performance testing for large datasets',
      deployment_strategy: 'Canary deployment with A/B testing'
    },
    risks: [
      {
        risk: 'Large result sets causing performance issues',
        impact: 'high',
        mitigation: 'Implement pagination and virtual scrolling'
      },
      {
        risk: 'Inconsistent data formats from different AI models',
        impact: 'medium',
        mitigation: 'Create data normalization layer with schema validation'
      },
      {
        risk: 'Browser memory constraints with complex visualizations',
        impact: 'medium',
        mitigation: 'Lazy load charts, implement data sampling for large datasets'
      }
    ]
  },
  'SD-STAGE4-ERROR-HANDLING-001': {
    system_architecture: {
      error_tracking: {
        services: ['ErrorCapture', 'ErrorClassifier', 'RecoveryOrchestrator'],
        integration: 'Sentry for centralized error tracking',
        database_tables: ['ai_error_logs', 'error_recovery_attempts', 'error_patterns']
      },
      recovery_mechanisms: {
        retry_logic: 'Exponential backoff with jitter',
        circuit_breaker: 'Hystrix pattern for failing services',
        fallback_strategies: 'Cached results, manual override options'
      },
      monitoring: {
        dashboards: 'Grafana for error rate visualization',
        alerting: 'PagerDuty integration for critical errors',
        reporting: 'Weekly error analysis reports'
      }
    },
    implementation_approach: {
      phase1: 'Implement error capture and logging infrastructure',
      phase2: 'Create error classification and pattern detection',
      phase3: 'Build automatic recovery mechanisms',
      phase4: 'Add user-facing error UI and feedback loops',
      testing_strategy: 'Chaos engineering, fault injection testing',
      deployment_strategy: 'Gradual rollout with monitoring thresholds'
    },
    risks: [
      {
        risk: 'Recursive error loops in recovery attempts',
        impact: 'high',
        mitigation: 'Implement retry limits and circuit breakers'
      },
      {
        risk: 'Error log volume overwhelming storage',
        impact: 'medium',
        mitigation: 'Log rotation, aggregation, and archival policies'
      },
      {
        risk: 'False positive error detection',
        impact: 'low',
        mitigation: 'Machine learning for error pattern recognition'
      }
    ]
  }
};

async function updatePRDQuality() {
  let client;

  try {
    console.log('🔧 Fixing PRD quality issues for Stage 4 child SDs...\n');

    // Connect to database
    client = await createDatabaseClient('engineer', { verify: false });

    for (const sdId of childSDs) {
      console.log(`\n📝 Updating PRD for ${sdId}...`);

      const updates = prdUpdates[sdId];

      // Update PRD with missing fields
      const updateQuery = `
        UPDATE product_requirements_v2
        SET
          system_architecture = $1,
          implementation_approach = $2,
          risks = $3,
          updated_at = NOW()
        WHERE directive_id = $4
        RETURNING id, title, directive_id
      `;

      const result = await client.query(updateQuery, [
        JSON.stringify(updates.system_architecture),
        JSON.stringify(updates.implementation_approach),
        JSON.stringify(updates.risks),
        sdId
      ]);

      if (result.rows.length > 0) {
        console.log(`   ✅ Updated PRD: ${result.rows[0].title}`);
        console.log(`   - Added system_architecture`);
        console.log(`   - Added implementation_approach`);
        console.log(`   - Added ${updates.risks.length} risk items`);
      } else {
        console.log(`   ⚠️  No PRD found for ${sdId}`);
      }
    }

    // Verify all PRDs now have required fields
    console.log('\n\n📊 Verifying PRD quality scores...');

    const verifyQuery = `
      SELECT
        pr.directive_id as sd_id,
        pr.title,
        CASE
          WHEN pr.system_architecture IS NOT NULL
            AND pr.implementation_approach IS NOT NULL
            AND pr.risks IS NOT NULL
            AND jsonb_array_length(pr.risks) > 0
          THEN '100%'
          ELSE 'INCOMPLETE'
        END as quality_score
      FROM product_requirements_v2 pr
      WHERE pr.directive_id = ANY($1)
      ORDER BY pr.directive_id
    `;

    const verifyResult = await client.query(verifyQuery, [childSDs]);

    console.log('\nPRD Quality Status:');
    console.log('==================');
    verifyResult.rows.forEach((row, idx) => {
      const icon = row.quality_score === '100%' ? '✅' : '❌';
      console.log(`${idx + 1}. ${row.sd_id}: ${icon} ${row.quality_score}`);
    });

    const allComplete = verifyResult.rows.every(r => r.quality_score === '100%');

    if (allComplete) {
      console.log('\n✨ All PRDs now have 100% quality score!');
      console.log('Ready to execute DESIGN sub-agent and create PLAN→EXEC handoffs.');
    } else {
      console.log('\n⚠️  Some PRDs still need attention');
    }

    return allComplete;

  } catch (error) {
    console.error('❌ Error updating PRDs:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run the update
updatePRDQuality()
  .then(success => {
    if (success) {
      console.log('\n📋 Next Steps:');
      console.log('1. Execute DESIGN sub-agent for all child SDs');
      console.log('2. Create PLAN→EXEC handoffs');
      console.log('3. Begin parallel implementation in EXEC phase');
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(console.error);