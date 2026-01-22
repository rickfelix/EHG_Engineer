/**
 * Database Schema for SD-041C PRD
 *
 * Contains the complete database schema design for the AI-Powered
 * Documentation Generator including all 6 tables and their relationships.
 */

export const databaseSchema = `## Database Schema Design

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
\`database/migrations/create-ai-docs-schema.sql\``;
