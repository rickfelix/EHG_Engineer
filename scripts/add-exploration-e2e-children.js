#!/usr/bin/env node
/**
 * Add exploration_summary to E2E Test Orchestrator child PRDs
 * Required for PLAN-TO-EXEC handoff GATE_EXPLORATION_AUDIT
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Define exploration summaries for each child SD
const explorationData = {
  'SD-E2E-FOUNDATION-001-R2': {
    files: [
      { file: 'tests/e2e/setup/', purpose: 'E2E test setup and global configuration', findings: 'Contains global-teardown.js, auth fixtures, and evidence pack generation' },
      { file: 'playwright.config.js', purpose: 'Playwright configuration', findings: 'Base URL http://localhost:8080, custom LEO reporter, trace collection enabled' },
      { file: 'tests/e2e/', purpose: 'E2E test directory structure', findings: 'Contains agent, brand-variants, knowledge, and other test categories' },
      { file: '.env', purpose: 'Environment variables', findings: 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required for tests' },
      { file: 'scripts/leo-stack.sh', purpose: 'Server management script', findings: 'Starts Engineer (3000), App (8080), Agent Platform (8000)' }
    ]
  },
  'SD-E2E-VENTURE-CREATION-002-R2': {
    files: [
      { file: 'tests/e2e/venture-creation/', purpose: 'Venture creation test files', findings: 'Tests for all 3 entry paths (manual, AI-assisted, import)' },
      { file: 'EHG/src/pages/ventures/', purpose: 'Venture pages in frontend', findings: 'Contains create.tsx and venture management pages' },
      { file: 'EHG/src/components/ventures/', purpose: 'Venture UI components', findings: 'Contains VentureWizard, EntryPathSelector components' },
      { file: 'database/schema/', purpose: 'Venture database schema', findings: 'ventures table, venture_stages, and related schemas' }
    ]
  },
  'SD-E2E-VENTURE-LIFECYCLE-003-R2': {
    files: [
      { file: 'tests/e2e/venture-lifecycle/', purpose: 'Lifecycle progression tests', findings: 'Tests for 25-stage progression through venture lifecycle' },
      { file: 'EHG/src/components/stages/', purpose: 'Stage components', findings: 'Contains stage-specific UI components for all 25 stages' },
      { file: 'database/schema/', purpose: 'Stage progression schema', findings: 'venture_stages, stage_transitions, progress tracking tables' },
      { file: 'scripts/lib/', purpose: 'Stage transition utilities', findings: 'Functions for stage advancement and validation' }
    ]
  },
  'SD-E2E-BRAND-VARIANTS-004-R2': {
    files: [
      { file: 'tests/e2e/brand-variants/', purpose: 'Brand variant test suite', findings: '10 test files covering manual entry, domain validation, approvals' },
      { file: 'database/migrations/20251205_brand_variants_security_schema.sql', purpose: 'Brand variants schema', findings: 'Defines brand_variants table and RLS policies' },
      { file: 'EHG/src/components/brand/', purpose: 'Brand UI components', findings: 'BrandVariantManager, NameGenerator components' },
      { file: 'tests/e2e/brand-variants/default-brand.spec.ts', purpose: 'Default brand test', findings: 'Tests organization-level brand inheritance' }
    ]
  },
  'SD-E2E-AGENT-RUNTIME-005-R2': {
    files: [
      { file: 'tests/e2e/agents/', purpose: 'Agent runtime test suite', findings: '5 test files: venture-ceo, crewai-flow, budget-kill-switch, sub-agent, memory-isolation' },
      { file: 'tests/e2e/agents/venture-ceo-runtime.spec.ts', purpose: 'CEO agent tests', findings: '481 lines, tests message processing, budget enforcement, capability validation' },
      { file: 'tests/e2e/agents/crewai-flow-execution.spec.ts', purpose: 'CrewAI flow tests', findings: '678 lines, 24 test cases for flow orchestration' },
      { file: 'tests/e2e/agents/budget-kill-switch.spec.ts', purpose: 'Budget enforcement tests', findings: 'Industrial Hardening v3.0 kill switch validation' },
      { file: '.env', purpose: 'Environment configuration', findings: 'Tests require SUPABASE_URL set (not localhost fallback)' }
    ]
  },
  'SD-E2E-WEBSOCKET-AUTH-006-R2': {
    files: [
      { file: 'tests/e2e/websocket/', purpose: 'WebSocket test suite', findings: 'Tests for WebSocket authentication and security' },
      { file: 'EHG_Engineer/routes/', purpose: 'WebSocket route handlers', findings: 'WebSocket connection handling and token validation' },
      { file: 'EHG/src/lib/websocket/', purpose: 'Client WebSocket utilities', findings: 'Client-side WebSocket connection management' },
      { file: 'database/schema/', purpose: 'Auth-related schemas', findings: 'User authentication and session management tables' }
    ]
  },
  'SD-E2E-KNOWLEDGE-INTEGRATION-007-R2': {
    files: [
      { file: 'tests/e2e/knowledge-retrieval-flow.spec.ts', purpose: 'Knowledge retrieval tests', findings: '212 lines, tests retrospective search, Context7 fallback, PRD enrichment' },
      { file: 'scripts/automated-knowledge-retrieval.js', purpose: 'Knowledge retrieval script', findings: 'Retrieves patterns from retrospectives for SD context' },
      { file: 'database/schema/', purpose: 'Knowledge storage schema', findings: 'retrospectives, patterns, knowledge base tables' },
      { file: '.env', purpose: 'Environment variables', findings: 'Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' }
    ]
  },
  'SD-E2E-LEGACY-CLEANUP-008-R2': {
    files: [
      { file: 'tests/e2e/', purpose: 'E2E test directory', findings: 'Contains various test categories for migration assessment' },
      { file: 'tests/', purpose: 'Test root directory', findings: 'Unit tests, E2E tests, UAT tests structure' },
      { file: 'playwright.config.js', purpose: 'Test configuration', findings: 'Exclusion patterns for legacy tests' },
      { file: 'package.json', purpose: 'Test scripts', findings: 'npm run test:e2e, test:unit configurations' }
    ]
  }
};

async function updateAllPRDs() {
  console.log('=== Adding exploration_summary to E2E Child PRDs ===\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [sdId, data] of Object.entries(explorationData)) {
    const _prdId = `PRD-${sdId}`;

    const { data: result, error } = await supabase
      .from('product_requirements_v2')
      .update({ exploration_summary: data.files })
      .eq('sd_id', sdId)
      .select('id, title');

    if (error) {
      console.error(`❌ ${sdId}: ${error.message}`);
      errorCount++;
      continue;
    }

    if (!result || result.length === 0) {
      console.error(`❌ ${sdId}: PRD not found for this SD`);
      errorCount++;
      continue;
    }

    console.log(`✅ ${sdId}: Added ${data.files.length} files to exploration_summary`);
    successCount++;
  }

  console.log('\n=== Summary ===');
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

updateAllPRDs().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
