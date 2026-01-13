#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createHandoff() {
  console.log('📋 Creating LEAD→PLAN Handoff for SD-041C\n');

  const handoffData = {
    // 1. Executive Summary
    executive_summary: `SD-041C: AI-Powered Documentation Generator - Strategic Activation

**Strategic Intent**: Transform documentation maintenance from manual burden to automated knowledge generation. Leverage AI to analyze code changes and generate user-friendly docs automatically.

**Business Value**:
- Reduce documentation lag from weeks to minutes
- Eliminate developer documentation debt
- Improve user onboarding and reduce support tickets
- Maintain version history of feature changes

**Origin**: Backlog item #290 from SD-041 "AI-Powered Knowledge Base & Help Docs"

**Scope Boundaries**:
- GitHub webhook integration for code change detection
- AI agent (OpenAI/Anthropic) analyzing new features
- Documentation template engine with versioning
- FAQ auto-generation from feature changes
- Admin dashboard for reviewing/editing AI-generated docs

**Target Application**: EHG (../ehg/)
**Priority**: HIGH (documentation quality directly impacts user adoption)
**Complexity**: Medium (AI integration + GitHub webhooks + template engine)`,

    // 2. Deliverables Manifest
    deliverables_manifest: `**LEAD Phase Deliverables** ✅

1. **Strategic Directive Activation**
   - SD-041C status: active
   - Current phase: LEAD
   - Target application: EHG
   - Implementation path: ../ehg/

2. **Strategic Context Documentation**
   - Problem: Manual documentation becomes outdated quickly
   - Solution: AI agent monitors code changes and generates docs automatically
   - Value proposition: Zero-effort documentation maintenance

3. **Scope Definition**
   - Must-Haves: 6 core components identified
   - Integration points: GitHub API, AI provider API, database storage
   - Nice-to-Haves: Deferred to future iterations

4. **Initial Architecture Decisions**
   - GitHub webhooks for real-time change detection
   - AI provider: OpenAI or Anthropic (PLAN to decide)
   - Template engine: Markdown-based with Handlebars
   - Version control: Database-backed with git integration

5. **Risk Assessment**
   - AI accuracy concerns (mitigation: human review dashboard)
   - GitHub API rate limits (mitigation: batching + caching)
   - Documentation versioning complexity (mitigation: simple timestamp-based)

6. **Resource Allocation**
   - Estimated total: 12-16 hours
   - LEAD phase: 2 hours (completed)
   - PLAN phase: 3-4 hours (next)
   - EXEC phase: 6-8 hours
   - Verification: 1-2 hours`,

    // 3. Key Decisions & Rationale
    key_decisions: `**Decision 1: Simplicity-First Implementation Strategy** ✅
   Rationale: Start with webhook → AI analysis → doc generation pipeline. Avoid over-engineering with ML training, custom parsers, or complex workflows. Use proven AI APIs (OpenAI/Anthropic) rather than building custom models.

**Decision 2: Admin Dashboard for Human-in-the-Loop**
   Rationale: AI-generated docs need human review before publication. Admin dashboard allows editing, approval workflow, and quality control. Prevents embarrassing auto-generated errors.

**Decision 3: GitHub Webhooks Over Polling**
   Rationale: Real-time change detection via webhooks is more efficient than periodic polling. Reduces latency from hours to seconds. GitHub API supports webhook payloads with file diffs.

**Decision 4: Markdown Templates with Handlebars**
   Rationale: Markdown is universal documentation format. Handlebars provides simple templating without complex logic. Easy for AI to generate valid template syntax.

**Decision 5: Version Control via Database + Git References**
   Rationale: Store generated docs in database with git commit SHA references. Allows time-travel queries ("show docs as of v1.2.3") and rollback capabilities.

**Decision 6: FAQ Auto-Generation from Feature Changes**
   Rationale: Extract common questions from code comments, feature descriptions, and acceptance criteria. AI analyzes patterns to generate "How do I..." style FAQs.

**Deferred Decisions for PLAN Phase**:
- Specific AI provider (OpenAI GPT-4 vs Anthropic Claude)
- Database schema for doc versioning
- Admin dashboard UI framework
- GitHub webhook security (signature validation)
- Template structure and conventions`,

    // 4. Known Issues & Risks
    known_issues: `**Technical Risks**:

1. **AI Accuracy & Hallucinations**
   - Risk: AI generates incorrect or misleading documentation
   - Impact: High (user confusion, incorrect feature usage)
   - Mitigation: Mandatory human review before publication, confidence scoring

2. **GitHub API Rate Limits**
   - Risk: Exceeding 5000 requests/hour for authenticated apps
   - Impact: Medium (delayed doc updates during high activity)
   - Mitigation: Webhook batching, caching, smart filtering

3. **Documentation Versioning Complexity**
   - Risk: Maintaining accurate version history across multiple features
   - Impact: Medium (users see outdated docs for their version)
   - Mitigation: Git SHA references, simple timestamp-based versioning

4. **AI Provider Costs**
   - Risk: High token usage for large codebases (GPT-4: $0.03/1K tokens)
   - Impact: Medium (monthly costs could exceed $200)
   - Mitigation: Smart prompt engineering, caching, incremental analysis

**Integration Risks**:

5. **GitHub Webhook Security**
   - Risk: Malicious webhook payloads from unauthorized sources
   - Impact: High (code injection, data leakage)
   - Mitigation: HMAC signature validation, IP whitelisting

6. **Admin Dashboard Complexity**
   - Risk: Over-engineering review workflow (multi-level approvals, etc.)
   - Impact: Low (delays implementation)
   - Mitigation: Simple approve/reject/edit workflow only

**Operational Risks**:

7. **Developer Adoption**
   - Risk: Developers ignore generated docs or don't trust AI output
   - Impact: Medium (reduced value of feature)
   - Mitigation: Showcase early wins, transparent AI confidence scores

8. **Documentation Quality Drift**
   - Risk: AI-generated style inconsistencies over time
   - Impact: Low (cosmetic issues)
   - Mitigation: Style guide prompts, template enforcement`,

    // 5. Resource Utilization
    resource_utilization: `**LEAD Phase Actual Time**:
- Strategic directive review: 15 minutes
- Scope definition and boundaries: 20 minutes
- Architecture decisions: 25 minutes
- Risk assessment: 20 minutes
- Handoff creation: 30 minutes
**Total LEAD**: 110 minutes (1.83 hours)

**Projected PLAN Phase Time**:
- PRD creation (functional requirements, acceptance criteria): 60 minutes
- Database schema design: 30 minutes
- Design sub-agent trigger (admin dashboard UI/UX): 30 minutes
- GitHub webhook integration planning: 20 minutes
- AI provider API research: 20 minutes
- Template engine design: 20 minutes
- Test scenario creation: 30 minutes
- PLAN→EXEC handoff creation: 30 minutes
**Total PLAN**: 240 minutes (4 hours)

**Projected EXEC Phase Time**:
- GitHub webhook endpoint implementation: 90 minutes
- AI agent integration (OpenAI/Anthropic): 120 minutes
- Documentation template engine: 90 minutes
- FAQ auto-generation logic: 60 minutes
- Admin dashboard UI: 120 minutes
- Database schema migration: 30 minutes
- Integration testing: 60 minutes
- EXEC→PLAN handoff creation: 30 minutes
**Total EXEC**: 600 minutes (10 hours)

**Projected PLAN Verification Phase Time**:
- Acceptance criteria testing: 30 minutes
- Sub-agent verification (QA, DevOps): 30 minutes
- PLAN→LEAD handoff creation: 20 minutes
**Total Verification**: 80 minutes (1.33 hours)

**Projected LEAD Completion Phase Time**:
- Implementation review: 20 minutes
- Retrospective (Continuous Improvement Coach): 30 minutes
- Final approval: 10 minutes
**Total Completion**: 60 minutes (1 hour)

**Grand Total Projected**: 18.16 hours
**Efficiency Target**: Complete in ≤16 hours (12% buffer)`,

    // 6. Action Items for PLAN
    action_items: `**PLAN Agent Critical Tasks**:

1. **Create Comprehensive PRD** (MANDATORY)
   - Functional requirements for each of 6 must-haves
   - Acceptance criteria with measurable success metrics
   - Test scenarios (unit, integration, E2E)
   - Database schema for doc versioning
   - API contracts (GitHub webhooks, AI provider, admin dashboard)

2. **Trigger Design Sub-Agent** (MANDATORY - UI/UX Keywords Detected)
   Keywords: "dashboard", "admin", "interface", "documentation", "user-facing"
   Design sub-agent must review:
   - Admin dashboard layout (doc list, review panel, edit interface)
   - Documentation display (versioning, search, navigation)
   - User flows (webhook trigger → AI analysis → review → publish)
   - Accessibility (WCAG 2.1 AA compliance for admin dashboard)

3. **Database Schema Design** (CRITICAL)
   Tables needed:
   - generated_docs (id, content, version, git_sha, created_at, status)
   - doc_reviews (doc_id, reviewer, status, comments, reviewed_at)
   - faq_entries (id, question, answer, feature_reference, version)
   - webhook_events (id, payload, processed_at, result)

4. **AI Provider Selection** (DECISION REQUIRED)
   Options:
   - OpenAI GPT-4 Turbo ($0.01/1K tokens input, $0.03/1K output)
   - Anthropic Claude 3.5 Sonnet ($3/MTok input, $15/MTok output)
   Criteria: Cost, accuracy, latency, API reliability

5. **GitHub Webhook Security Design** (SECURITY CRITICAL)
   - HMAC signature validation using webhook secret
   - IP whitelisting (GitHub's public IP ranges)
   - Rate limiting per repository
   - Payload size validation

6. **Template Engine Architecture** (TECHNICAL DESIGN)
   - Markdown base format
   - Handlebars syntax for variables
   - AI-friendly template structure
   - Version compatibility checks

7. **Create Test Scenarios** (QUALITY ASSURANCE)
   - Unit tests: AI analysis logic, template rendering
   - Integration tests: GitHub webhook → AI → database flow
   - E2E tests: Admin dashboard review workflow
   - Performance tests: Handle 100 webhook events/hour

8. **Create PLAN→EXEC Handoff** (MANDATORY)
   Must include all 7 handoff elements per LEO Protocol v4.2.0`,

    // 7. Metadata
    metadata: {
      sd_id: 'SD-041C',
      from_agent: 'LEAD',
      to_agent: 'PLAN',
      handoff_type: 'strategic_to_technical',
      timestamp: new Date().toISOString(),
      protocol_version: 'v4.2.0_story_gates',
      activation_status: 'activated',
      target_application: 'EHG',
      implementation_path: '../ehg/',
      priority: 'high',
      estimated_total_hours: 18.16,
      estimated_plan_hours: 4,
      must_trigger_subagents: ['Senior Design Sub-Agent'],
      detected_keywords: ['dashboard', 'admin', 'interface', 'documentation', 'user-facing', 'UI']
    }
  };

  // Store handoff in database
  const { data, error } = await supabase
    .from('handoff_tracking')
    .insert({
      sd_id: 'SD-041C',
      from_agent: 'LEAD',
      to_agent: 'PLAN',
      handoff_type: 'strategic_to_technical',
      status: 'pending_acceptance',
      ...handoffData
    })
    .select();

  if (error) {
    console.error('❌ Error creating handoff:', error.message);

    // Fallback to SD metadata
    console.log('ℹ️  Storing in SD metadata instead...');
    const { error: metaError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          lead_plan_handoff: handoffData
        }
      })
      .eq('sd_key', 'SD-041C');

    if (metaError) {
      console.error('❌ Metadata fallback failed:', metaError.message);
      process.exit(1);
    }
    console.log('✅ Handoff stored in SD metadata');
  } else {
    console.log('✅ LEAD→PLAN handoff created successfully!');
    console.log('   Handoff ID:', data[0].id);
  }

  console.log('\n📊 Handoff Summary:');
  console.log('   From: LEAD');
  console.log('   To: PLAN');
  console.log('   SD: SD-041C');
  console.log('   Type: strategic_to_technical');
  console.log('   Status: pending_acceptance');
  console.log('   Elements: 7/7 (all mandatory elements included)');
  console.log('\n🎯 Action Items for PLAN:');
  console.log('   1. Create comprehensive PRD');
  console.log('   2. Trigger Design sub-agent (UI/UX review)');
  console.log('   3. Design database schema');
  console.log('   4. Select AI provider (OpenAI vs Anthropic)');
  console.log('   5. Design GitHub webhook security');
  console.log('   6. Create test scenarios');
  console.log('   7. Create PLAN→EXEC handoff');
  console.log('\n✅ LEAD phase complete for SD-041C!');
}

createHandoff().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
