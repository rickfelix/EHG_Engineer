#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addMissingFields() {
  console.log('🔧 Adding missing required fields to PRD-KNOWLEDGE-001\n');

  const updates = {
    system_architecture: `3-tier architecture:
1. Orchestrator Layer (automated-knowledge-retrieval.js)
   - Coordinates local + external research
   - Enforces token budgets (5k/query, 15k/PRD)
   - Implements caching with 24h TTL

2. Circuit Breaker Layer (context7-circuit-breaker.js)
   - State machine (closed/open/half-open)
   - 3-failure threshold
   - 1-hour recovery window
   - Graceful degradation to local-only mode

3. Data Layer
   - retrospectives table (existing, semantic search)
   - tech_stack_references (new, cache)
   - prd_research_audit_log (new, telemetry)
   - system_health (new, circuit state)
   - user_stories (enhanced with implementation_context)`,

    implementation_approach: `Phase 1: Database Setup (15 min)
- Run migration to create 3 tables + 2 column additions
- Validate schema with smoke tests
- Initialize circuit breaker state (closed)

Phase 2: Core Scripts (90 min)
- Implement automated-knowledge-retrieval.js (main orchestrator)
- Build context7-circuit-breaker.js (resilience layer)
- Create enrich-prd-with-research.js (enrichment pipeline)

Phase 3: Integration (45 min)  
- Hook into unified-handoff-system.js at LEAD→PLAN transition
- Add feature flags for gradual rollout control
- Configure 24h TTL cache with package.json versioning

Phase 4: Testing (60 min)
- Unit tests (20 test cases, 100% coverage)
- E2E tests (9 scenarios per test plan)
- Performance validation (<2s local, <10s Context7, <30s total)

Phase 5: Deployment (30 min)
- Feature flag: KNOWLEDGE_RETRIEVAL_ENABLED=true
- Monitor circuit breaker state
- Validate audit logging working
- Measure PRD completeness improvement`
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update(updates)
    .eq('id', 'PRD-KNOWLEDGE-001')
    .select('id');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ Required fields added successfully');
  console.log('   - system_architecture ✓');
  console.log('   - implementation_approach ✓');
  console.log('\n🎯 Ready to retry PLAN→EXEC handoff');
}

addMissingFields();
