#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-041C: AI-Powered Documentation Generator\n');

  const prdData = {
    sd_id: 'SD-041C',
    prd_id: 'PRD-041C-001',
    title: 'AI-Powered Documentation Generator - Product Requirements',
    version: '1.0.0',
    status: 'active',

    overview: `## Product Overview

**Problem Statement**:
Manual documentation quickly becomes outdated as developers implement new features and changes. Documentation debt accumulates, leading to confused users, increased support burden, and poor onboarding experiences.

**Solution**:
AI-powered documentation generator that monitors code changes via GitHub webhooks, analyzes new features using AI (OpenAI/Anthropic), and automatically generates user-friendly documentation and FAQs.

**Value Proposition**:
- Zero-effort documentation maintenance
- Documentation lag reduced from weeks to minutes
- Consistent documentation quality and style
- Automatic FAQ generation from feature changes
- Version-aware documentation (show docs for user's version)

**Target Users**:
- Primary: End users of EHG application (documentation consumers)
- Secondary: EHG administrators (doc reviewers/editors)
- Tertiary: Developers (indirect benefit from reduced doc burden)

**Success Metrics**:
- Documentation lag: <5 minutes from code merge to doc generation
- Documentation coverage: >90% of features have generated docs
- Admin review time: <10 minutes per doc review
- User satisfaction: +20% improvement in onboarding NPS`,

    functional_requirements: `## Functional Requirements

### FR-001: GitHub Webhook Integration
**Priority**: Must-Have
**Description**: Real-time code change detection via GitHub webhook events

**Requirements**:
- Accept POST requests from GitHub webhook at /api/webhooks/github
- Parse webhook payload for push events (commits, merges, tags)
- Extract changed files (added, modified, deleted)
- Filter relevant files (ignore config, build artifacts, tests)
- Store webhook event in database for audit trail
- Return 200 OK within 3 seconds to prevent GitHub retries

**Security Requirements**:
- Validate HMAC signature using webhook secret (X-Hub-Signature-256 header)
- Verify payload source IP matches GitHub's IP ranges
- Rate limit per repository (max 100 events/hour)
- Reject payloads larger than 5MB
- Log all webhook events (timestamp, repo, event type, result)

**Data Model**:
\`\`\`sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

**Acceptance Criteria**:
- AC-001-1: Webhook endpoint accepts valid GitHub push events with 200 OK
- AC-001-2: Invalid HMAC signature returns 401 Unauthorized
- AC-001-3: Payload parsing extracts file changes (path, status, diff)
- AC-001-4: Events stored in database with full payload + metadata
- AC-001-5: Response time <3 seconds for 95th percentile

---

### FR-002: AI Agent Code Analysis
**Priority**: Must-Have
**Description**: AI analyzes code changes and generates documentation content

**Requirements**:
- Connect to AI provider API (OpenAI GPT-4 Turbo OR Anthropic Claude 3.5 Sonnet)
- Construct analysis prompt with context:
  - File diffs (added/modified lines)
  - File type (component, service, API, model)
  - Existing documentation (if any)
  - Project context (framework, conventions)
- Request AI to generate:
  - Feature description (what was added/changed)
  - User-facing impact (what users can now do)
  - How-to instructions (step-by-step usage)
  - Common pitfalls (edge cases, gotchas)
- Parse AI response and extract structured content
- Handle AI errors gracefully (timeouts, rate limits, invalid JSON)

**AI Provider Decision**:
**Recommended: Anthropic Claude 3.5 Sonnet**
- Better at code analysis vs GPT-4 (understands context + dependencies)
- Lower cost ($3/MTok input vs $10/MTok for GPT-4)
- Faster response time (average 2-3 seconds)
- Cleaner JSON output (fewer parsing errors)

**Prompt Template**:
\`\`\`
You are a technical documentation generator. Analyze the following code changes and generate user-facing documentation.

CODE CHANGES:
{file_diffs}

CONTEXT:
- File type: {file_type}
- Project: EHG Enterprise Platform
- Framework: React + TypeScript + Supabase
- Existing docs: {existing_docs}

GENERATE:
1. Feature Title (concise, user-friendly)
2. Description (what changed, why it matters)
3. How to Use (step-by-step instructions)
4. FAQs (3-5 common questions)
5. Related Features (links to other docs)

OUTPUT FORMAT: JSON
{
  "title": "...",
  "description": "...",
  "howToUse": ["Step 1", "Step 2", ...],
  "faqs": [{"question": "...", "answer": "..."}],
  "relatedFeatures": ["feature-1", "feature-2"]
}
\`\`\`

**Data Model**:
\`\`\`sql
CREATE TABLE ai_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id UUID REFERENCES webhook_events(id),
  provider TEXT NOT NULL, -- 'openai' or 'anthropic'
  model TEXT NOT NULL, -- 'gpt-4-turbo' or 'claude-3-5-sonnet'
  prompt TEXT NOT NULL,
  response JSONB,
  tokens_used INTEGER,
  cost_usd NUMERIC(10,4),
  latency_ms INTEGER,
  status TEXT NOT NULL, -- 'pending', 'success', 'error'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
\`\`\`

**Acceptance Criteria**:
- AC-002-1: AI analysis job created for each webhook event
- AC-002-2: AI response parsed into structured JSON
- AC-002-3: Generated content includes title, description, how-to, FAQs
- AC-002-4: Errors logged with retry mechanism (max 3 retries)
- AC-002-5: Average latency <5 seconds for analysis

---

### FR-003: Documentation Template Engine
**Priority**: Must-Have
**Description**: Markdown template engine for rendering generated docs

**Requirements**:
- Use Handlebars template syntax for variable substitution
- Support markdown formatting (headings, lists, code blocks, links)
- Template structure:
  - Header (title, version, last updated)
  - Feature description
  - How-to section (step-by-step)
  - FAQs (accordion-style)
  - Related features (links)
  - Footer (feedback link, changelog link)
- Render template with AI-generated content
- Validate output (check for broken links, invalid markdown)
- Store rendered markdown in database

**Template Example**:
\`\`\`markdown
# {{title}}

**Version**: {{version}}
**Last Updated**: {{lastUpdated}}

## Overview
{{description}}

## How to Use
{{#each howToUse}}
{{@index}}. {{this}}
{{/each}}

## Frequently Asked Questions
{{#each faqs}}
### {{question}}
{{answer}}

{{/each}}

## Related Features
{{#each relatedFeatures}}
- [{{this.title}}]({{this.url}})
{{/each}}

---
*Have feedback? [Let us know](#)*
\`\`\`

**Data Model**:
\`\`\`sql
CREATE TABLE generated_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_analysis_id UUID REFERENCES ai_analysis_jobs(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content_markdown TEXT NOT NULL,
  content_html TEXT, -- Optional: pre-rendered HTML
  version TEXT NOT NULL, -- Git tag or commit SHA
  git_commit_sha TEXT NOT NULL,
  status TEXT NOT NULL, -- 'draft', 'pending_review', 'published', 'archived'
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
\`\`\`

**Acceptance Criteria**:
- AC-003-1: Template rendered with AI-generated content
- AC-003-2: Output is valid markdown (no syntax errors)
- AC-003-3: Generated doc stored in database with draft status
- AC-003-4: Slug generated from title (lowercase, hyphenated)
- AC-003-5: Version linked to git commit SHA

---

### FR-004: FAQ Auto-Generation
**Priority**: Must-Have
**Description**: Extract common questions from feature changes and generate FAQs

**Requirements**:
- Parse AI analysis response for FAQs section
- Extract questions and answers from code comments, feature descriptions
- Deduplicate similar questions (fuzzy matching)
- Link FAQs to related documentation
- Store FAQs separately for easy filtering/search
- Update existing FAQs when features change (versioning)

**FAQ Structure**:
\`\`\`json
{
  "question": "How do I enable the new feature?",
  "answer": "Navigate to Settings > Features and toggle the switch.",
  "category": "Configuration",
  "feature_reference": "feature-settings-toggle",
  "version_added": "1.5.0",
  "version_deprecated": null
}
\`\`\`

**Data Model**:
\`\`\`sql
CREATE TABLE faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_doc_id UUID REFERENCES generated_docs(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  feature_reference TEXT,
  version_added TEXT NOT NULL,
  version_deprecated TEXT,
  search_vector tsvector, -- Full-text search
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX idx_faq_search ON faq_entries USING GIN(search_vector);
\`\`\`

**Acceptance Criteria**:
- AC-004-1: FAQs extracted from AI analysis response
- AC-004-2: Duplicate questions merged (>80% similarity threshold)
- AC-004-3: FAQs stored with version references
- AC-004-4: Full-text search enabled on questions + answers
- AC-004-5: FAQs linked to parent documentation

---

### FR-005: Admin Dashboard (Review & Edit)
**Priority**: Must-Have
**Description**: Web UI for reviewing, editing, and publishing AI-generated docs

**Requirements**:
- Documentation list view:
  - Filter by status (draft, pending_review, published)
  - Search by title, content, version
  - Sort by created_at, updated_at, status
  - Pagination (25 items per page)
  - Bulk actions (approve, reject, archive)

- Documentation detail view:
  - Side-by-side: Generated markdown (left) + Preview (right)
  - Edit mode: Rich markdown editor with live preview
  - Metadata panel: Title, version, git SHA, status, timestamps
  - FAQ section: Review/edit generated FAQs
  - Approval workflow: Approve → Published | Reject → Draft | Request Changes
  - Comment/feedback field for rejected docs

- Publishing controls:
  - Publish button (draft → published)
  - Unpublish button (published → archived)
  - Schedule publish (future date/time)
  - Version selector (publish for specific version range)

**UI Framework**: Shadcn UI + React + TailwindCSS (existing EHG stack)

**Acceptance Criteria**:
- AC-005-1: Admin dashboard accessible at /admin/documentation
- AC-005-2: List view displays all generated docs with filters
- AC-005-3: Detail view shows markdown editor with live preview
- AC-005-4: Approve action changes status to published
- AC-005-5: Published docs visible in public docs site

---

### FR-006: Version Control & History
**Priority**: Must-Have
**Description**: Track documentation versions across git releases

**Requirements**:
- Link each generated doc to git commit SHA
- Support version tags (v1.0.0, v1.5.0, etc.)
- Show "as of version X" in documentation
- Allow users to view docs for their version
- Maintain audit trail (who published, when, why)
- Rollback capability (revert to previous version)

**Data Model**:
\`\`\`sql
CREATE TABLE doc_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_doc_id UUID REFERENCES generated_docs(id),
  version_number INTEGER NOT NULL, -- 1, 2, 3...
  content_markdown TEXT NOT NULL,
  git_commit_sha TEXT NOT NULL,
  git_tag TEXT, -- v1.0.0, v1.5.0
  published_by UUID, -- User ID
  published_at TIMESTAMP WITH TIME ZONE,
  changelog TEXT, -- What changed in this version
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(generated_doc_id, version_number)
);
\`\`\`

**Acceptance Criteria**:
- AC-006-1: Each doc publish creates new version record
- AC-006-2: Docs display "Updated in version X.Y.Z"
- AC-006-3: Users can view docs for specific version
- AC-006-4: Audit trail shows who published each version
- AC-006-5: Rollback restores previous version`,

    acceptance_criteria: `## Acceptance Criteria Summary

### AC-001: GitHub Webhook Integration (FR-001)
- AC-001-1: Webhook endpoint accepts valid GitHub push events → 200 OK ✅
- AC-001-2: Invalid HMAC signature → 401 Unauthorized ✅
- AC-001-3: Payload parsing extracts file changes (path, status, diff) ✅
- AC-001-4: Events stored in database with full payload + metadata ✅
- AC-001-5: Response time <3 seconds for 95th percentile ✅

### AC-002: AI Agent Code Analysis (FR-002)
- AC-002-1: AI analysis job created for each webhook event ✅
- AC-002-2: AI response parsed into structured JSON ✅
- AC-002-3: Generated content includes title, description, how-to, FAQs ✅
- AC-002-4: Errors logged with retry mechanism (max 3 retries) ✅
- AC-002-5: Average latency <5 seconds for analysis ✅

### AC-003: Documentation Template Engine (FR-003)
- AC-003-1: Template rendered with AI-generated content ✅
- AC-003-2: Output is valid markdown (no syntax errors) ✅
- AC-003-3: Generated doc stored in database with draft status ✅
- AC-003-4: Slug generated from title (lowercase, hyphenated) ✅
- AC-003-5: Version linked to git commit SHA ✅

### AC-004: FAQ Auto-Generation (FR-004)
- AC-004-1: FAQs extracted from AI analysis response ✅
- AC-004-2: Duplicate questions merged (>80% similarity threshold) ✅
- AC-004-3: FAQs stored with version references ✅
- AC-004-4: Full-text search enabled on questions + answers ✅
- AC-004-5: FAQs linked to parent documentation ✅

### AC-005: Admin Dashboard (FR-005)
- AC-005-1: Admin dashboard accessible at /admin/documentation ✅
- AC-005-2: List view displays all generated docs with filters ✅
- AC-005-3: Detail view shows markdown editor with live preview ✅
- AC-005-4: Approve action changes status to published ✅
- AC-005-5: Published docs visible in public docs site ✅

### AC-006: Version Control & History (FR-006)
- AC-006-1: Each doc publish creates new version record ✅
- AC-006-2: Docs display "Updated in version X.Y.Z" ✅
- AC-006-3: Users can view docs for specific version ✅
- AC-006-4: Audit trail shows who published each version ✅
- AC-006-5: Rollback restores previous version ✅

**Total Acceptance Criteria**: 30 criteria (6 features × 5 criteria each)
**Pass Threshold**: 27/30 (90% pass rate for approval)`,

    test_scenarios: `## Test Scenarios

### Unit Tests

**UT-001: GitHub Webhook Signature Validation**
\`\`\`javascript
describe('GitHub Webhook Security', () => {
  it('should accept valid HMAC signature', () => {
    const payload = { ... };
    const signature = generateHMAC(payload, WEBHOOK_SECRET);
    const result = validateWebhookSignature(payload, signature);
    expect(result).toBe(true);
  });

  it('should reject invalid HMAC signature', () => {
    const payload = { ... };
    const invalidSignature = 'sha256=invalid';
    const result = validateWebhookSignature(payload, invalidSignature);
    expect(result).toBe(false);
  });

  it('should reject missing signature header', () => {
    const payload = { ... };
    const result = validateWebhookSignature(payload, null);
    expect(result).toBe(false);
  });
});
\`\`\`

**UT-002: AI Response Parsing**
\`\`\`javascript
describe('AI Response Parser', () => {
  it('should parse valid JSON response', () => {
    const aiResponse = {
      title: 'New Feature',
      description: '...',
      howToUse: ['Step 1', 'Step 2'],
      faqs: [{ question: '...', answer: '...' }]
    };
    const result = parseAIResponse(aiResponse);
    expect(result.title).toBe('New Feature');
    expect(result.faqs).toHaveLength(1);
  });

  it('should handle malformed JSON gracefully', () => {
    const invalidJSON = '{ title: "Missing quotes }';
    expect(() => parseAIResponse(invalidJSON)).toThrow('Invalid JSON');
  });

  it('should validate required fields', () => {
    const incomplete = { title: 'Only Title' };
    expect(() => parseAIResponse(incomplete)).toThrow('Missing required field: description');
  });
});
\`\`\`

**UT-003: Template Rendering**
\`\`\`javascript
describe('Markdown Template Engine', () => {
  it('should render template with data', () => {
    const template = '# {{title}}\\n{{description}}';
    const data = { title: 'Test', description: 'Testing' };
    const result = renderTemplate(template, data);
    expect(result).toBe('# Test\\nTesting');
  });

  it('should handle missing variables with defaults', () => {
    const template = '# {{title}}\\n{{description}}';
    const data = { title: 'Test' };
    const result = renderTemplate(template, data);
    expect(result).toContain('# Test');
    expect(result).toContain('(No description provided)');
  });
});
\`\`\`

---

### Integration Tests

**IT-001: Webhook to AI Analysis Flow**
\`\`\`javascript
describe('Webhook → AI Analysis Integration', () => {
  it('should trigger AI analysis on valid webhook', async () => {
    // 1. Send webhook event
    const webhookPayload = {
      repository: { full_name: 'rickfelix/ehg' },
      commits: [{ modified: ['src/components/NewFeature.tsx'] }]
    };
    const response = await POST('/api/webhooks/github', webhookPayload);
    expect(response.status).toBe(200);

    // 2. Verify webhook stored
    const event = await db.webhook_events.findOne({ repository: 'rickfelix/ehg' });
    expect(event).toBeDefined();

    // 3. Wait for AI analysis job
    await waitForCondition(() =>
      db.ai_analysis_jobs.findOne({ webhook_event_id: event.id })
    );

    // 4. Verify AI response
    const job = await db.ai_analysis_jobs.findOne({ webhook_event_id: event.id });
    expect(job.status).toBe('success');
    expect(job.response.title).toBeDefined();
  });
});
\`\`\`

**IT-002: AI Analysis to Doc Generation Flow**
\`\`\`javascript
describe('AI Analysis → Doc Generation Integration', () => {
  it('should generate doc from AI response', async () => {
    // 1. Create mock AI analysis result
    const aiJob = await db.ai_analysis_jobs.create({
      response: {
        title: 'New Dashboard Widget',
        description: 'A new widget for displaying metrics',
        howToUse: ['Step 1', 'Step 2'],
        faqs: [{ question: 'How?', answer: 'Like this' }]
      }
    });

    // 2. Trigger doc generation
    await generateDocFromAI(aiJob.id);

    // 3. Verify doc created
    const doc = await db.generated_docs.findOne({ ai_analysis_id: aiJob.id });
    expect(doc).toBeDefined();
    expect(doc.status).toBe('draft');
    expect(doc.content_markdown).toContain('# New Dashboard Widget');
  });
});
\`\`\`

---

### End-to-End Tests (E2E)

**E2E-001: Full Pipeline (Webhook → AI → Doc → Publish)**
\`\`\`javascript
describe('Complete Documentation Generation Pipeline', () => {
  it('should generate and publish doc from code push', async () => {
    // 1. Simulate GitHub webhook (code push)
    const webhookPayload = createGitHubPushEvent({
      repository: 'rickfelix/ehg',
      commits: [{
        message: 'feat: Add export button to reports',
        modified: ['src/components/Reports/ExportButton.tsx']
      }]
    });

    await POST('/api/webhooks/github', webhookPayload, {
      headers: { 'X-Hub-Signature-256': generateHMAC(webhookPayload) }
    });

    // 2. Wait for AI analysis (max 10 seconds)
    await waitForCondition(() =>
      db.ai_analysis_jobs.findOne({ status: 'success' }),
      { timeout: 10000 }
    );

    // 3. Wait for doc generation
    const doc = await waitForCondition(() =>
      db.generated_docs.findOne({ status: 'draft' })
    );

    expect(doc.title).toContain('Export');

    // 4. Admin reviews and approves
    await loginAsAdmin();
    await page.goto('/admin/documentation');
    await page.click(\`[data-doc-id="\${doc.id}"]\`);
    await page.click('button:has-text("Approve & Publish")');

    // 5. Verify doc is published
    const publishedDoc = await db.generated_docs.findById(doc.id);
    expect(publishedDoc.status).toBe('published');
    expect(publishedDoc.published_at).toBeDefined();

    // 6. Verify visible on public docs site
    await page.goto(\`/docs/\${doc.slug}\`);
    await expect(page.locator('h1')).toContainText(doc.title);
  });
});
\`\`\`

---

### Performance Tests

**PERF-001: Webhook Response Time**
\`\`\`javascript
describe('Performance: Webhook Endpoint', () => {
  it('should respond within 3 seconds (95th percentile)', async () => {
    const latencies = [];

    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await POST('/api/webhooks/github', validPayload);
      const latency = Date.now() - start;
      latencies.push(latency);
    }

    const p95 = percentile(latencies, 95);
    expect(p95).toBeLessThan(3000);
  });
});
\`\`\`

**PERF-002: AI Analysis Latency**
\`\`\`javascript
describe('Performance: AI Analysis', () => {
  it('should complete analysis within 5 seconds average', async () => {
    const latencies = [];

    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await analyzeCodeWithAI(sampleDiff);
      const latency = Date.now() - start;
      latencies.push(latency);
    }

    const average = latencies.reduce((a, b) => a + b) / latencies.length;
    expect(average).toBeLessThan(5000);
  });
});
\`\`\`

---

### Security Tests

**SEC-001: HMAC Signature Validation**
\`\`\`javascript
describe('Security: Webhook HMAC', () => {
  it('should reject tampered payloads', async () => {
    const payload = createValidPayload();
    const validSignature = generateHMAC(payload);

    // Tamper with payload after signature generation
    payload.repository.name = 'malicious-repo';

    const response = await POST('/api/webhooks/github', payload, {
      headers: { 'X-Hub-Signature-256': validSignature }
    });

    expect(response.status).toBe(401);
  });
});
\`\`\`

**Total Test Scenarios**: 14 scenarios
- Unit Tests: 3
- Integration Tests: 2
- E2E Tests: 1
- Performance Tests: 2
- Security Tests: 1`,

    database_schema: `## Database Schema Design

### Tables Overview

1. **webhook_events** - GitHub webhook audit trail
2. **ai_analysis_jobs** - AI processing jobs and results
3. **generated_docs** - Main documentation content
4. **doc_versions** - Version history tracking
5. **faq_entries** - Searchable FAQ database
6. **doc_reviews** - Admin review audit trail

---

### Complete SQL Schema

\`\`\`sql
-- Table 1: Webhook Events
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Indexes
  CONSTRAINT webhook_events_event_type_check
    CHECK (event_type IN ('push', 'pull_request', 'release'))
);

CREATE INDEX idx_webhook_events_repository ON webhook_events(repository);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed) WHERE NOT processed;

---

-- Table 2: AI Analysis Jobs
CREATE TABLE ai_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id UUID REFERENCES webhook_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response JSONB,
  tokens_used INTEGER,
  cost_usd NUMERIC(10,4),
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT ai_analysis_jobs_provider_check
    CHECK (provider IN ('openai', 'anthropic')),
  CONSTRAINT ai_analysis_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'success', 'error')),
  CONSTRAINT ai_analysis_jobs_retry_check
    CHECK (retry_count <= 3)
);

CREATE INDEX idx_ai_jobs_webhook_id ON ai_analysis_jobs(webhook_event_id);
CREATE INDEX idx_ai_jobs_status ON ai_analysis_jobs(status) WHERE status = 'pending';
CREATE INDEX idx_ai_jobs_created_at ON ai_analysis_jobs(created_at DESC);

---

-- Table 3: Generated Docs
CREATE TABLE generated_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_analysis_id UUID REFERENCES ai_analysis_jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content_markdown TEXT NOT NULL,
  content_html TEXT,
  version TEXT NOT NULL,
  git_commit_sha TEXT NOT NULL,
  git_tag TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  published_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT generated_docs_status_check
    CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  CONSTRAINT generated_docs_slug_format_check
    CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_generated_docs_status ON generated_docs(status);
CREATE INDEX idx_generated_docs_slug ON generated_docs(slug);
CREATE INDEX idx_generated_docs_version ON generated_docs(version);
CREATE INDEX idx_generated_docs_published_at ON generated_docs(published_at DESC);

-- Full-text search on title + content
CREATE INDEX idx_generated_docs_search ON generated_docs
  USING GIN(to_tsvector('english', title || ' ' || content_markdown));

---

-- Table 4: Doc Versions
CREATE TABLE doc_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_doc_id UUID REFERENCES generated_docs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_markdown TEXT NOT NULL,
  git_commit_sha TEXT NOT NULL,
  git_tag TEXT,
  published_by UUID,
  published_at TIMESTAMP WITH TIME ZONE,
  changelog TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(generated_doc_id, version_number),
  CONSTRAINT doc_versions_version_number_check
    CHECK (version_number > 0)
);

CREATE INDEX idx_doc_versions_doc_id ON doc_versions(generated_doc_id);
CREATE INDEX idx_doc_versions_git_tag ON doc_versions(git_tag);

---

-- Table 5: FAQ Entries
CREATE TABLE faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_doc_id UUID REFERENCES generated_docs(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  feature_reference TEXT,
  version_added TEXT NOT NULL,
  version_deprecated TEXT,
  search_vector tsvector,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX idx_faq_search ON faq_entries USING GIN(search_vector);

-- Auto-update search_vector on insert/update
CREATE TRIGGER faq_search_vector_update
BEFORE INSERT OR UPDATE ON faq_entries
FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', question, answer);

CREATE INDEX idx_faq_category ON faq_entries(category);
CREATE INDEX idx_faq_version_added ON faq_entries(version_added);

---

-- Table 6: Doc Reviews (Audit Trail)
CREATE TABLE doc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_doc_id UUID REFERENCES generated_docs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  action TEXT NOT NULL,
  comments TEXT,
  previous_status TEXT,
  new_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT doc_reviews_action_check
    CHECK (action IN ('approved', 'rejected', 'requested_changes', 'published', 'archived'))
);

CREATE INDEX idx_doc_reviews_doc_id ON doc_reviews(generated_doc_id);
CREATE INDEX idx_doc_reviews_reviewer_id ON doc_reviews(reviewer_id);
CREATE INDEX idx_doc_reviews_created_at ON doc_reviews(created_at DESC);
\`\`\`

### Migration Script Path
\`database/migrations/create-ai-docs-schema.sql\``,

    technical_design: `## Technical Architecture

### System Components

1. **GitHub Webhook Receiver** (/api/webhooks/github)
   - Express.js endpoint
   - HMAC signature validation middleware
   - Rate limiting (express-rate-limit)
   - Payload parsing and filtering

2. **AI Analysis Service** (lib/services/aiAnalysisService.ts)
   - Anthropic Claude 3.5 Sonnet integration
   - Prompt template engine
   - Response parser and validator
   - Retry logic with exponential backoff

3. **Documentation Generator** (lib/services/docGeneratorService.ts)
   - Handlebars template engine
   - Markdown validator
   - Slug generator
   - Version tracking

4. **Admin Dashboard** (src/client/src/pages/AdminDocumentation.tsx)
   - Shadcn UI components (Table, Card, Dialog, Form)
   - React Query for data fetching
   - Monaco Editor for markdown editing
   - Real-time preview with react-markdown

5. **Background Job Processor** (lib/workers/docWorker.ts)
   - Bull queue for async job processing
   - Webhook event processing
   - AI analysis jobs
   - Doc generation jobs

### Data Flow

\`\`\`
GitHub Push Event
  → Webhook Receiver (validate HMAC)
  → Store webhook_events
  → Enqueue AI Analysis Job
  → AI Service (Anthropic Claude)
  → Parse AI Response
  → Generate Doc (Handlebars)
  → Store generated_docs (draft)
  → Notify Admin (email/Slack)
  → Admin Reviews via Dashboard
  → Approve → Publish
  → Public Docs Site
\`\`\`

### AI Provider: Anthropic Claude 3.5 Sonnet

**Rationale**:
- Superior code comprehension vs GPT-4
- Cleaner JSON output (fewer parsing errors)
- Lower cost ($3/MTok input vs $10/MTok GPT-4)
- Faster response time (2-3s vs 5-7s)
- Better at following system prompts

**API Integration**:
\`\`\`typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function analyzeCode(fileDiff: string, context: string) {
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: \`You are a technical documentation generator...\n\n\${prompt}\`
    }]
  });

  return JSON.parse(response.content[0].text);
}
\`\`\`

### Dependencies
- @anthropic-ai/sdk: ^0.27.0
- express-rate-limit: ^7.0.0
- handlebars: ^4.7.8
- bull: ^4.12.0
- react-markdown: ^9.0.0
- monaco-editor: ^0.45.0`,

    metadata: {
      prd_version: '1.0.0',
      created_by: 'PLAN Agent',
      created_at: new Date().toISOString(),
      total_functional_requirements: 6,
      total_acceptance_criteria: 30,
      total_test_scenarios: 14,
      database_tables: 6,
      estimated_implementation_hours: 10,
      ai_provider_recommendation: 'Anthropic Claude 3.5 Sonnet',
      requires_design_review: true,
      design_keywords_detected: ['dashboard', 'admin', 'interface', 'UI', 'documentation']
    }
  };

  const { data, error } = await supabase
    .from('product_requirements')
    .insert([prdData])
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);

    // Fallback to SD metadata
    console.log('ℹ️  Storing PRD in SD metadata...');
    const { error: metaError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: {
          prd: prdData
        }
      })
      .eq('sd_key', 'SD-041C');

    if (metaError) {
      console.error('❌ Metadata fallback failed:', metaError.message);
      process.exit(1);
    }
    console.log('✅ PRD stored in SD metadata');
  } else {
    console.log('✅ PRD created successfully!');
    console.log('   PRD ID:', data[0].prd_id);
  }

  console.log('\n📊 PRD Summary:');
  console.log('   SD: SD-041C');
  console.log('   Title: AI-Powered Documentation Generator');
  console.log('   Version: 1.0.0');
  console.log('   Functional Requirements: 6');
  console.log('   Acceptance Criteria: 30');
  console.log('   Test Scenarios: 14');
  console.log('   Database Tables: 6');
  console.log('   AI Provider: Anthropic Claude 3.5 Sonnet');
  console.log('   Estimated Hours: 10');
  console.log('\n🎯 Next: Trigger Design sub-agent for UI/UX review');
}

createPRD().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
