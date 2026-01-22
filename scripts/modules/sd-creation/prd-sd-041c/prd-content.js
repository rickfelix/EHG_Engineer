/**
 * PRD Content for SD-041C: AI-Powered Documentation Generator
 *
 * Contains all the PRD sections as separate exports for maintainability.
 * This is a large PRD with detailed requirements, test scenarios, and schema.
 */

export const overview = `## Product Overview

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
- User satisfaction: +20% improvement in onboarding NPS`;

export const functionalRequirements = `## Functional Requirements

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
  - Approval workflow: Approve -> Published | Reject -> Draft | Request Changes
  - Comment/feedback field for rejected docs

- Publishing controls:
  - Publish button (draft -> published)
  - Unpublish button (published -> archived)
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
- AC-006-5: Rollback restores previous version`;

export const acceptanceCriteria = `## Acceptance Criteria Summary

### AC-001: GitHub Webhook Integration (FR-001)
- AC-001-1: Webhook endpoint accepts valid GitHub push events -> 200 OK
- AC-001-2: Invalid HMAC signature -> 401 Unauthorized
- AC-001-3: Payload parsing extracts file changes (path, status, diff)
- AC-001-4: Events stored in database with full payload + metadata
- AC-001-5: Response time <3 seconds for 95th percentile

### AC-002: AI Agent Code Analysis (FR-002)
- AC-002-1: AI analysis job created for each webhook event
- AC-002-2: AI response parsed into structured JSON
- AC-002-3: Generated content includes title, description, how-to, FAQs
- AC-002-4: Errors logged with retry mechanism (max 3 retries)
- AC-002-5: Average latency <5 seconds for analysis

### AC-003: Documentation Template Engine (FR-003)
- AC-003-1: Template rendered with AI-generated content
- AC-003-2: Output is valid markdown (no syntax errors)
- AC-003-3: Generated doc stored in database with draft status
- AC-003-4: Slug generated from title (lowercase, hyphenated)
- AC-003-5: Version linked to git commit SHA

### AC-004: FAQ Auto-Generation (FR-004)
- AC-004-1: FAQs extracted from AI analysis response
- AC-004-2: Duplicate questions merged (>80% similarity threshold)
- AC-004-3: FAQs stored with version references
- AC-004-4: Full-text search enabled on questions + answers
- AC-004-5: FAQs linked to parent documentation

### AC-005: Admin Dashboard (FR-005)
- AC-005-1: Admin dashboard accessible at /admin/documentation
- AC-005-2: List view displays all generated docs with filters
- AC-005-3: Detail view shows markdown editor with live preview
- AC-005-4: Approve action changes status to published
- AC-005-5: Published docs visible in public docs site

### AC-006: Version Control & History (FR-006)
- AC-006-1: Each doc publish creates new version record
- AC-006-2: Docs display "Updated in version X.Y.Z"
- AC-006-3: Users can view docs for specific version
- AC-006-4: Audit trail shows who published each version
- AC-006-5: Rollback restores previous version

**Total Acceptance Criteria**: 30 criteria (6 features x 5 criteria each)
**Pass Threshold**: 27/30 (90% pass rate for approval)`;
