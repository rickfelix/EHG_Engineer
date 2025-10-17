require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSD() {
  console.log('📝 Updating SD-VIDEO-VARIANT-001 with Sora 2 API Smoke Test...\n');

  // Fetch current SD data
  const { data: currentSD, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (fetchError) {
    console.error('❌ Error fetching SD:', fetchError.message);
    process.exit(1);
  }

  console.log('Current SD:', currentSD.title);
  console.log('Status:', currentSD.status);
  console.log('Priority:', currentSD.priority);
  console.log('');

  // Parse current scope
  const currentScope = typeof currentSD.scope === 'string'
    ? JSON.parse(currentSD.scope)
    : currentSD.scope;

  // Updated description with Phase 0
  const updatedDescription = `## Executive Summary

Transform EHG's existing VideoPromptStudio into an intelligent creative testing platform that generates, tests, and optimizes AI video variants at scale.

## Business Value
- 90% Cost Reduction: 50 video variants for $200 vs $15,000 agency
- 10x Faster Testing: A/B test 20 variants in 1 week vs 6 months traditional
- 300% Launch Success Rate: Data-driven creative optimization
- 60X ROI: $660K+ annualized value vs $127K cost

## Problem Statement
Current VideoPromptStudio generates single prompts manually. Portfolio companies need:
1. Multiple video variants for A/B testing
2. Data-driven winner identification
3. Automated iterative optimization
4. Integration with GTM timing intelligence

## Proposed Solution
Six-phase implementation (including Phase 0 API validation):
1. **Phase 0: Sora 2 API Smoke Test** (1-2 hours, blocking gate)
2. **Use Case Wizard**: 21 predefined templates (Founder Story, Product Reveal, etc.)
3. **Variant System**: 5-20 variants per test with intelligent test matrices
4. **Performance Tracking**: Comprehensive analytics dashboard
5. **Winner Identification**: Multi-objective optimization algorithms
6. **Automated Iteration**: Round 2 variants based on winners

## Phase 0: Sora 2 API Smoke Test (BLOCKING GATE)

**Objective**: Validate API connectivity with minimal test before committing to full architecture

**Test Process**:
1. Authenticate with Sora 2 API (Azure or OpenAI endpoint)
2. Submit 1 video generation job (15s test: "A serene sunset over mountains")
3. Poll job status until completion
4. Download generated video

**Decision Gate**:
- ✅ **If test PASSES**: Add API integration to Phase 2-4 scope, budget $120 per test campaign
- ❌ **If test FAILS**: Defer API integration, proceed with manual workflow, budget $1,004 per test

**Smoke Test Script**: \`scripts/test-sora-api-connection.js\`

**Time Investment**: 1-2 hours + $10-15 for test video

## Research Prompts Embedded

### Prompt 1: Use Case Library (21 templates)
Research optimal prompt structures for each video type, workflow integration points, industry benchmarks.

### Prompt 2: Variant Generation Algorithms
Design test matrix optimization, statistical power analysis, multi-armed bandit algorithms.

### Prompt 3: Performance Tracking Infrastructure
Build 3 new database tables, API integrations, real-time dashboards, cost tracking.

### Prompt 4: Winner Identification & Iteration
Multi-objective optimization, statistical significance testing, mutation strategies, Chairman approval.

### Prompt 5: Codebase Integration Strategy
Analyze existing VideoPromptStudio.tsx, video_prompts table, Edge Functions, Chairman feedback system.

### Prompt 6: Sora 2 API Integration Architecture (Conditional)

**Objective**: Design async video generation pipeline using Sora 2 API

**Phase 0 - Smoke Test** (1-2 hours):
1. Obtain API credentials (Azure OpenAI preview OR OpenAI developer program)
2. Run test script: authenticate → generate 1 video → download
3. Document result: ✅ PASS or ❌ FAIL

**If Smoke Test Passes → Phase 2-4 Design**:

1. **API Integration Architecture**
   - Endpoints: POST /video/generations, GET /jobs/{id}, GET /content/video
   - Authentication: API key with auto-refresh
   - Rate limiting: Queue management for 10 videos/hour constraint

2. **Async Job Queue**
   - New table: video_generation_jobs (job_id, status, prompt, video_url)
   - States: pending → submitted → processing → completed/failed
   - Polling: 10-second intervals OR webhook notifications

3. **Cost Tracking**
   - Per-second billing: $0.10-$0.50/sec
   - 20-second video @ $0.30/sec = $6/video
   - Dashboard: Track API spend per variant, per campaign

4. **Error Handling**
   - Retry logic: Exponential backoff for transient failures
   - Fallback: If API fails → manual prompt generation workflow
   - Logging: Store API errors for debugging

**If Smoke Test Fails**:
- Defer API integration to future phase
- Proceed with manual workflow (generate prompts → user copies to Sora web)
- Revisit API in 6 months when public API available

**Deliverables**:
- scripts/test-sora-api-connection.js (smoke test - CREATED ✅)
- Decision document: PASS/FAIL result
- If PASS: API integration architecture diagram
- If FAIL: Manual workflow documentation

## Implementation Phases

### Phase 0: Sora 2 API Smoke Test (1-2 hours, BLOCKING GATE)
**Goal**: Validate API connectivity before architectural commitment

**Tasks**:
1. Obtain API credentials (Azure OpenAI preview OR OpenAI developer program)
2. Run smoke test script: \`node scripts/test-sora-api-connection.js\`
3. Document result (PASS/FAIL)
4. Update SD scope based on result

**Decision Gate**:
- If PASS → Add API integration to Phase 2-4, budget $120/test
- If FAIL → Manual workflow, budget $1,004/test, defer API 6 months

### Phase 1: Database Foundation (Week 1-2)
**Goals**: Create database infrastructure for variant testing

**Tasks**:
1. Write SQL migration script for 3 new tables
2. Add variant_group_id column to video_prompts
3. Create database indexes for performance
4. Set up RLS policies for security
5. Test migrations on staging database

### Phase 2: Variant Generation (Week 3-4)
**Goals**: Build core variant generation logic

**Tasks**:
1. Create VariantGenerationEngine.ts service
2. Implement test matrix generation algorithms
3. Extend Edge Function with batch processing endpoint
4. Build UseCaseSelectionWizard.tsx component
5. Add 21 use case templates to database
6. **(If Phase 0 passed)** Implement Sora 2 API integration

### Phase 3: Performance Tracking (Week 5-6)
**Goals**: Enable performance metric tracking and visualization

**Tasks**:
1. Create PerformanceTrackingDashboard.tsx component
2. Build variant comparison table UI
3. Add manual metric entry forms
4. Implement cost tracking logic
5. **(If Phase 0 passed)** Add API cost tracking to dashboard

### Phase 4: Winner Identification (Week 7-8)
**Goals**: Automate winner selection and iteration

**Tasks**:
1. Build WinnerIdentificationPanel.tsx component
2. Implement multi-objective scoring algorithm
3. Add statistical significance testing
4. Create mutation strategies (hill climbing, genetic algorithms)
5. Add "Generate Round 2" automation
6. **(If Phase 0 passed)** Implement webhook handlers for job completion

### Phase 5: Integration & Testing (Week 9-10)
**Goals**: Connect all systems and validate end-to-end

**Tasks**:
1. Add workflow automation triggers (Stage 34/35)
2. Connect Chairman Console for oversight
3. Write comprehensive test suite (unit, integration, E2E)
4. Performance testing and optimization
5. User acceptance testing with portfolio ventures
6. **(If Phase 0 passed)** Test full API-automated workflow

## Codebase Integration Summary

### ✅ LEVERAGE EXISTING (Extend, Don't Replace)
1. VideoPromptStudio.tsx (add tabs, preserve single-prompt mode)
2. video_prompts table (add columns, maintain backward compatibility)
3. generate-video-prompts Edge Function (add batch mode, keep single-prompt endpoint)
4. Chairman feedback system (integrate approval workflows, reuse components)
5. Stage 34/35 automation (add video triggers, leverage workflow engine)

### ❌ BUILD NEW (Additive Components)
1. UseCaseSelectionWizard.tsx (multi-step wizard)
2. VariantGenerationEngine.ts (test matrix generation)
3. PerformanceTrackingDashboard.tsx (metrics visualization)
4. WinnerIdentificationPanel.tsx (statistical analysis)
5. 3 new database tables (variant_groups, video_variants, variant_performance)
6. **(Conditional)** video_generation_jobs table (if Phase 0 passes)

### 🔄 INTEGRATION POINTS (Touchpoints)
1. **Phase 0 Decision Gate**: Run smoke test before Phase 1 begins
2. **Workflow Automation**: Stage 3, 17, 31, 35 triggers
3. **Chairman Approval**: High-stakes content approval workflows
4. **Edge Function**: Batch processing with queue management
5. **(Conditional)** Sora 2 API: Async job queue + webhook handlers

## Success Criteria

### Functional Requirements
- ✅ Phase 0 smoke test executed and documented
- ✅ Generate 5-20 variants per use case in <5 minutes
- ✅ Track performance across 5 platforms (Instagram, TikTok, LinkedIn, YouTube, Facebook)
- ✅ Identify winner with 95% statistical confidence
- ✅ Auto-generate Round 2 variants based on winner (mutation strategies)
- ✅ Chairman approval workflow for investor-facing content
- ✅ **(Conditional)** Automated video generation via Sora 2 API with <10 min completion time

### Performance Requirements
- ✅ Dashboard loads in <3 seconds (all metrics displayed)
- ✅ Variant generation completes in <5 minutes (20 variants)
- ✅ Real-time metrics update every 5 minutes (polling interval)
- ✅ Handle 100 concurrent test campaigns without degradation

### Quality Requirements
- ✅ 80%+ test coverage (unit + integration tests)
- ✅ TypeScript strict mode enabled (no any types)
- ✅ Accessibility (WCAG 2.1 AA compliant)
- ✅ Mobile responsive (works on tablet/phone)

### Business Metrics
- ✅ Cost reduction: $120 (API) or $1,004 (manual) vs $15,000 (agency)
- ✅ 10x faster testing cycles (1 week vs 6 months)
- ✅ 60X ROI in first year ($660K value vs $127K cost)
- ✅ 300% improvement in launch success rates (data-driven optimization)

Total Effort: 10 weeks + Phase 0 (2 hours) | Total Cost: $95K | Expected ROI: 7X first year`;

  // Updated scope
  const updatedScope = {
    in_scope: [
      "Phase 0: Sora 2 API smoke test (authenticate + generate 1 test video)",
      ...currentScope.in_scope,
      "API integration architecture (conditional - if Phase 0 passes)",
      "Async job queue management (conditional - if Phase 0 passes)",
      "Webhook handler for job completion (conditional - if Phase 0 passes)",
      "API cost tracking system (conditional - if Phase 0 passes)"
    ],
    out_of_scope: [
      "Automatic video generation (conditional - deferred if Phase 0 smoke test fails)",
      "Real-time API integrations with ad platforms (Phase 1 - manual entry)",
      "Video editing/post-processing",
      "Automated A/B test deployment",
      "Video hosting/CDN management"
    ],
    future_enhancements: [
      "Full Sora 2 API automation (when publicly available)",
      "Real-time video generation pipeline",
      "Fallback to Runway/Kling APIs for redundancy",
      "API integrations (Facebook Ads, Google Analytics, LinkedIn)",
      "Real-time optimization (adjust ad spend mid-campaign)",
      "Cross-venture learning (what works for similar ventures)",
      "White-label Story Engine product for external clients"
    ]
  };

  // Updated implementation guidelines
  const updatedGuidelines = `**Phase 0 Decision Gate**: Before beginning Phase 1 database work, run Sora 2 API smoke test using scripts/test-sora-api-connection.js.

**If smoke test PASSES (exit code 0)**:
- Add API integration to Phase 2-4 scope
- Implement async job queue, webhook handlers
- Budget $120 per 20-variant test campaign
- Expected cost: $6-10 per video via API

**If smoke test FAILS (exit code 1)**:
- Proceed with manual workflow (prompt generation only)
- User copies prompts to Sora 2 web interface manually
- Budget $1,004 per test (manual labor + Sora credits)
- Revisit API integration in 6 months (Q2 2026)

**Core Implementation**: Extend existing VideoPromptStudio with wizard UI, variant generation algorithms, performance tracking infrastructure, and automated winner identification. Integrate with Stage 34/35 workflows.`;

  // Updated dependencies
  const updatedDependencies = [
    ...currentSD.dependencies,
    "Sora 2 API access (Azure OpenAI preview OR OpenAI developer program) - conditional on Phase 0 result"
  ];

  // Updated metadata
  const updatedMetadata = {
    ...currentSD.metadata,
    research_prompts_embedded: 6, // was 5
    phase_0_smoke_test: "Required before Phase 1 (scripts/test-sora-api-connection.js)",
    api_access_status: "TBD (pending Phase 0 smoke test)",
    api_cost_per_video_estimated: "$6-10 (20s @ $0.30-0.50/sec)",
    manual_workflow_cost_per_test: "$1,004",
    api_workflow_cost_per_test: "$120",
    cost_savings_if_api_works: "$884 per test campaign"
  };

  // Execute update
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: updatedDescription,
      scope: updatedScope,
      implementation_guidelines: updatedGuidelines,
      dependencies: updatedDependencies,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-VIDEO-VARIANT-001 updated successfully!\n');
  console.log('Changes Applied:');
  console.log('  ✅ Added Phase 0: Sora 2 API Smoke Test (blocking gate)');
  console.log('  ✅ Updated description with Phase 0 section');
  console.log('  ✅ Added Research Prompt 6: API Integration Architecture');
  console.log('  ✅ Updated scope with conditional API items');
  console.log('  ✅ Added implementation guidelines with decision gate logic');
  console.log('  ✅ Added Sora 2 API access to dependencies');
  console.log('  ✅ Updated metadata with smoke test tracking fields');
  console.log('');
  console.log('Smoke Test Script Created:');
  console.log('  📄 scripts/test-sora-api-connection.js');
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Obtain Sora 2 API credentials (Azure or OpenAI)');
  console.log('  2. Run: node scripts/test-sora-api-connection.js');
  console.log('  3. Based on result (PASS/FAIL), update scope accordingly');
  console.log('  4. Begin Phase 1 implementation');
  console.log('');

  process.exit(0);
}

updateSD().catch((error) => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});
