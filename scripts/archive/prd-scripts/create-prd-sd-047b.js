#!/usr/bin/env node

/**
 * Create PRD for SD-047B: Venture Documents (Pragmatic Scope)
 * PLAN phase - Comprehensive Product Requirements Document
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-047B: Venture Documents\n');

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdData = {
    id: randomUUID(),
    ...await createPRDLink('SD-047B'),
    title: 'PRD: Venture Documents - Pragmatic File Management',
    status: 'active',

    target_url: 'http://localhost:5173/ventures',
    component_name: 'DocumentsSection',
    app_path: '../ehg',
    port: 5173,

    content: `# Product Requirements Document: Venture Documents

## Overview
Add pragmatic document management to ventures and portfolios, enabling teams to upload, organize, and access venture-related files without external tools. Focused v1 with essential features, deferring complexity to v1.1.

**Target Users**: Venture managers, portfolio managers, executive teams
**Primary Use Case**: Upload and access venture documents (pitch decks, financials, contracts)
**Success Metric**: 70% reduction in document retrieval time, 60% adoption within 2 weeks

## Scope Refinement (LEAD Approval)

**Original Scope**: Full-featured document management tab (32 hours)
- Version control, file preview, advanced search, bulk operations

**Revised Scope**: Pragmatic file management in detail sections (18 hours, 44% savings)
- Essential upload/download/delete, simple search, multi-level support
- **User Feedback Integrated**: "Maybe not as a tab" → collapsible section in detail views
- **User Insight**: "Documents for ventures, portfolios, companies" → multi-level architecture from v1

**Deferred to v1.1**: Version control, file preview, advanced search, bulk download, comments

## Functional Requirements

### FR-001: Multi-File Upload Interface
**Priority**: MUST_HAVE
**Description**: Drag-drop upload component supporting multiple files with progress indicators

**Acceptance Criteria**:
- Users can drag files into upload zone
- Users can click to select files via file browser
- Multi-file selection supported (upload 5 files at once)
- Progress bar shows upload percentage per file
- File type validation: PDF, images (PNG/JPG), Office docs (DOCX/XLSX/PPTX)
- Max file size: 50MB per file
- Error message if invalid file type or too large
- Success toast on complete upload

### FR-002: Category Selection
**Priority**: MUST_HAVE
**Description**: Assign category to uploaded documents for organization

**Acceptance Criteria**:
- Dropdown with 5 categories: Pitch Deck, Financial, Legal, Operational, Other
- Default category: "Other"
- Category displayed in document list
- Filter by category works correctly

### FR-003: Document List View
**Priority**: MUST_HAVE
**Description**: Table showing all documents with metadata and actions

**Acceptance Criteria**:
- Columns: File Name, Category, Size, Uploaded By, Uploaded Date, Actions
- Sort by: Date (default newest first), Name (A-Z), Category
- Each row shows: download button, delete button (trash icon)
- Empty state when no documents: "No documents yet. Upload your first file"
- Loading skeleton while fetching
- Responsive: collapses to cards on mobile (<768px)

### FR-004: Secure File Download
**Priority**: MUST_HAVE
**Description**: Download files with RLS-enforced access control

**Acceptance Criteria**:
- Download button generates signed URL (1-hour expiration)
- Click downloads file with original filename
- 403 error if user lacks permissions
- Download works for files up to 50MB
- Success toast: "Downloaded [filename]"

### FR-005: File Deletion
**Priority**: MUST_HAVE
**Description**: Delete uploaded files with confirmation dialog

**Acceptance Criteria**:
- Delete button (trash icon) on each row
- Confirmation modal: "Delete [filename]? This cannot be undone."
- Only file uploader or admins can delete
- Soft delete from database, hard delete from storage
- Success toast: "Deleted [filename]"
- Document list refreshes after deletion

### FR-006: Access Control (RLS)
**Priority**: MUST_HAVE
**Description**: Portfolio-level permissions enforce who can access documents

**Acceptance Criteria**:
- RLS policies: users can only access documents for ventures/portfolios they manage
- Upload requires authentication (401 if not logged in)
- Download checks RLS via signed URL (403 if unauthorized)
- Delete requires ownership (uploaded_by = current user OR admin role)
- Database queries filtered by RLS automatically

### FR-007: Simple Search
**Priority**: MUST_HAVE
**Description**: Search documents by filename with fast results

**Acceptance Criteria**:
- Search input above document list
- Searches file_name column (case-insensitive)
- Results appear <500ms after typing stops (debounced)
- Clear search button (X icon)
- Empty state if no results: "No documents match '[query]'"

### FR-008: Collapsible Documents Section
**Priority**: MUST_HAVE
**Description**: Documents integrated as collapsible section in venture/portfolio detail views

**Acceptance Criteria**:
- Section appears in venture detail page (below basic info)
- Collapsible Card component with header: "Documents (5)" (count badge)
- Expand/collapse icon (chevron down/up)
- Default state: collapsed
- Click header to expand and show document list
- Upload button within expanded section

### FR-009: Multi-Level Support
**Priority**: MUST_HAVE
**Description**: Same component works for ventures, portfolios, and future entities

**Acceptance Criteria**:
- \`DocumentsSection\` component accepts props: entityType, entityId
- entityType: 'venture' | 'portfolio' | 'company' (future)
- \`useDocuments(entityType, entityId)\` hook fetches correct documents
- venture_documents table for ventures
- portfolio_documents table for portfolios
- Same UI/UX for both entity types

### FR-010: File Size Validation UI
**Priority**: SHOULD_HAVE
**Description**: Clear feedback when file exceeds size limit

**Acceptance Criteria**:
- Error toast if file >50MB: "File too large. Max 50MB."
- File excluded from upload queue
- Other files in multi-upload proceed normally
- File size shown in human-readable format (e.g., "12.3 MB")

### FR-011: Filter by Category
**Priority**: SHOULD_HAVE
**Description**: Filter document list by category dropdown

**Acceptance Criteria**:
- Filter dropdown: All Categories, Pitch Deck, Financial, Legal, Operational, Other
- Default: "All Categories"
- Filters list to only selected category
- Works with search (both filters apply)
- "All Categories" shows all documents

### FR-012: Loading States
**Priority**: NICE_TO_HAVE
**Description**: Show loading indicators during async operations

**Acceptance Criteria**:
- Upload: progress bar per file
- Document list fetch: skeleton loaders (3 rows)
- Delete: button shows spinner, disabled during operation
- Download: button shows spinner briefly

### FR-013: Success/Error Toasts
**Priority**: NICE_TO_HAVE
**Description**: User feedback for all actions via toast notifications

**Acceptance Criteria**:
- Upload success: "Uploaded [filename]"
- Upload error: "Failed to upload [filename]: [error]"
- Delete success: "Deleted [filename]"
- Download success: "Downloaded [filename]"
- Error states show specific error messages (not generic "Error occurred")

## Non-Functional Requirements

### NFR-001: Performance - Upload Speed
**Description**: Files upload in reasonable time

**Acceptance Criteria**:
- 10MB file uploads in <5 seconds (on avg internet)
- 50MB file uploads in <30 seconds
- Progress indicator updates at least every 10%
- No browser freeze during upload

### NFR-002: Performance - Search Speed
**Description**: Search returns results quickly

**Acceptance Criteria**:
- Search results <500ms after typing stops
- Debounce delay: 300ms
- Uses database index on file_name column
- No full table scans

### NFR-003: Security - File Validation
**Description**: Prevent malicious file uploads

**Acceptance Criteria**:
- MIME type validation (not just extension)
- Allowed types: application/pdf, image/png, image/jpeg, application/vnd.openxmlformats-officedocument.*
- Reject executable files (.exe, .sh, .bat)
- File size limit enforced server-side (not just client)

### NFR-004: Security - Access Control
**Description**: RLS policies enforce permissions strictly

**Acceptance Criteria**:
- Supabase RLS enabled on both tables
- Policies: SELECT, INSERT, UPDATE, DELETE defined
- Test with multiple user roles (admin, manager, viewer)
- No data leaks via direct table queries

### NFR-005: Storage - Supabase Storage Setup
**Description**: Files stored securely in Supabase Storage

**Acceptance Criteria**:
- Bucket name: \`venture-files\`
- Bucket is private (not public)
- File path: \`{entity_type}/{entity_id}/{file_id}-{filename}\`
- RLS policies apply to storage bucket
- CDN enabled for fast downloads

## Database Schema

### venture_documents Table
\`\`\`sql
CREATE TABLE venture_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Supabase Storage path
  file_size INTEGER NOT NULL, -- bytes
  file_type TEXT NOT NULL, -- MIME type
  category TEXT CHECK (category IN ('pitch_deck', 'financial', 'legal', 'operational', 'other')),
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ, -- soft delete
  UNIQUE(venture_id, file_path)
);

CREATE INDEX idx_venture_documents_venture_id ON venture_documents(venture_id);
CREATE INDEX idx_venture_documents_category ON venture_documents(category);
CREATE INDEX idx_venture_documents_file_name ON venture_documents(file_name);
CREATE INDEX idx_venture_documents_uploaded_at ON venture_documents(uploaded_at DESC);
\`\`\`

### portfolio_documents Table
\`\`\`sql
CREATE TABLE portfolio_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  category TEXT CHECK (category IN ('pitch_deck', 'financial', 'legal', 'operational', 'other')),
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  UNIQUE(portfolio_id, file_path)
);

CREATE INDEX idx_portfolio_documents_portfolio_id ON portfolio_documents(portfolio_id);
CREATE INDEX idx_portfolio_documents_category ON portfolio_documents(category);
CREATE INDEX idx_portfolio_documents_file_name ON portfolio_documents(file_name);
CREATE INDEX idx_portfolio_documents_uploaded_at ON portfolio_documents(uploaded_at DESC);
\`\`\`

### RLS Policies
\`\`\`sql
-- venture_documents RLS
ALTER TABLE venture_documents ENABLE ROW LEVEL SECURITY;

-- Users can view documents for ventures in their portfolios
CREATE POLICY "Users can view venture documents"
  ON venture_documents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload"
  ON venture_documents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND uploaded_by = auth.uid());

-- Users can delete their own uploads
CREATE POLICY "Users can delete own documents"
  ON venture_documents FOR DELETE
  USING (uploaded_by = auth.uid());

-- Similar policies for portfolio_documents
\`\`\`

## Acceptance Criteria Summary

### P0 (Critical) - 8 criteria
1. **AC-001**: Multi-file drag-drop upload works
2. **AC-002**: Upload progress shows percentage
3. **AC-003**: Document list shows metadata (name, category, size, date, uploader)
4. **AC-004**: Download button downloads file with signed URL
5. **AC-005**: Delete button removes file (with confirmation)
6. **AC-006**: RLS prevents unauthorized access (403 error)
7. **AC-007**: Search by filename <500ms
8. **AC-008**: Documents section in venture detail view (collapsible)

### P1 (Important) - 3 criteria
9. **AC-009**: Filter by category dropdown
10. **AC-010**: File size validation (50MB limit with error message)
11. **AC-011**: Portfolio documents work with same UI

### P2 (Nice to Have) - 2 criteria
12. **AC-012**: Loading skeletons during fetch
13. **AC-013**: Success/error toast notifications

## User Stories

### US-001: Upload Pitch Deck
**As a** Venture Manager
**I want** to upload our pitch deck to the venture
**So that** investors can access it without emailing files
**Story Points**: 3

### US-002: Find Financial Model
**As an** Executive
**I want** to search for "financial model" across all documents
**So that** I can find the file in seconds instead of minutes
**Story Points**: 2

### US-003: Delete Outdated Contract
**As a** Portfolio Manager
**I want** to delete an expired contract
**So that** teams don't reference outdated terms
**Story Points**: 1

### US-004: View All Legal Documents
**As a** Compliance Officer
**I want** to filter documents by "Legal" category
**So that** I can review all contracts and agreements
**Story Points**: 2

### US-005: Download Quarterly Reports
**As an** Investor
**I want** to download financial reports for ventures in my portfolio
**So that** I can perform due diligence
**Story Points**: 2

## Technical Specifications

### Component Architecture
- **DocumentsSection.tsx**: Main container component
  - Props: entityType, entityId
  - Renders: upload zone, document list, search/filter
- **DocumentUpload.tsx**: Drag-drop upload component
  - Uses: react-dropzone
  - Handles: file validation, progress, upload to Supabase Storage
- **DocumentList.tsx**: Table of documents
  - Uses: Shadcn Table component
  - Handles: sort, filter, download, delete actions
- **useDocuments.ts**: React Query hook
  - Fetches documents by entityType + entityId
  - Caching: 5min stale time
  - Mutations: upload, delete

### Libraries
- **react-dropzone**: Drag-drop file upload (already common, lightweight)
- **@supabase/storage-js**: File storage (included in supabase-js)
- **React Query**: State management (already used in SD-047A)
- **Shadcn UI**: Card, Button, Table, Toast (already in project)

### File Structure
\`\`\`
../ehg/
├── database/migrations/
│   └── create-venture-documents-tables.sql
├── src/
│   ├── components/documents/
│   │   ├── DocumentsSection.tsx
│   │   ├── DocumentUpload.tsx
│   │   └── DocumentList.tsx
│   ├── hooks/
│   │   └── useDocuments.ts
│   ├── types/
│   │   └── document.ts
│   └── pages/
│       └── VentureDetailPage.tsx (integrate DocumentsSection)
\`\`\`

## Design Specifications

### Upload Zone (Drag-Drop)
- Dashed border, gray background
- Icon: upload cloud
- Text: "Drag files here or click to browse"
- Subtext: "PDF, images, Office docs up to 50MB"
- On drag-over: blue border, highlighted background

### Document List (Table)
- Columns: Name (bold), Category (badge), Size, Uploader, Date, Actions
- Action buttons: Download (download icon), Delete (trash icon)
- Hover: row highlights light gray
- Empty state: centered icon + text

### Collapsible Section
- Header: "Documents (5)" with chevron icon
- Collapsed: single line, click to expand
- Expanded: upload zone + document list

## Testing Strategy

### Unit Tests
- File validation logic (MIME types, size limits)
- Search/filter logic
- File path generation

### Integration Tests
- Upload → storage → database write
- Download → signed URL generation
- Delete → database + storage removal
- RLS policy enforcement

### E2E Tests
- Complete upload workflow
- Search and download file
- Delete with confirmation
- Filter by category

## Success Metrics

- **Adoption Rate**: 60% of ventures have ≥1 document within 2 weeks
- **Retrieval Time**: 70% reduction (from avg 3min to <1min)
- **Upload Success Rate**: >95% successful uploads
- **Search Performance**: <500ms for all queries
- **Storage Growth**: Monitor for cost projections

## Risks and Mitigations

### Risk 1: Storage Costs
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**: Set 10GB alert, implement retention policy in v1.1

### Risk 2: Large Files Timeout
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**: 50MB limit enforced, chunked upload in v1.1 if needed

### Risk 3: RLS Bypass
- **Probability**: Low
- **Impact**: High
- **Mitigation**: Thorough testing with multiple roles, security review

## Implementation Plan

### Phase 1: Database & Storage (3h)
- Create database migration
- Setup Supabase Storage bucket
- Write RLS policies
- Test policies with SQL

### Phase 2: Upload Component (5h)
- DocumentUpload component with react-dropzone
- File validation (type, size)
- Progress indicators
- Upload to Supabase Storage
- Database insert

### Phase 3: Document List (4h)
- DocumentList table component
- Sort/filter logic
- Download with signed URLs
- Delete with confirmation
- Empty/loading states

### Phase 4: Integration (3h)
- DocumentsSection wrapper
- useDocuments hook
- Integrate into VentureDetailPage
- Integrate into PortfolioDetailPage

### Phase 5: Search & Polish (3h)
- Search functionality
- Toast notifications
- Error handling
- Mobile responsive CSS

**Total: 18 hours**`,

    metadata: {
      sd_key: 'SD-047B',
      functional_requirements_count: 13,
      acceptance_criteria_count: 13,
      user_stories_count: 5,
      estimated_hours: 18,
      design_subagent_required: true,
      database_migration_required: true,
      implementation_phases: 5,
      deferred_features: [
        'Version control',
        'File preview',
        'Advanced search',
        'Bulk download',
        'Comments/annotations',
        'Document expiration alerts'
      ]
    }
  };

  // Insert PRD
  const { data: _data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD Created Successfully\n');
  console.log('📊 PRD Summary:');
  console.log('   Functional Requirements: 13');
  console.log('   Non-Functional Requirements: 5');
  console.log('   Acceptance Criteria: 13 (P0: 8, P1: 3, P2: 2)');
  console.log('   User Stories: 5 (Total Story Points: 10)');
  console.log('   Database Migration: Required (2 tables + RLS)');
  console.log('   Supabase Storage: venture-files bucket');
  console.log('   Design Sub-Agent: Required');
  console.log('   Target URL: http://localhost:5173/ventures');
  console.log('   Component: DocumentsSection');
  console.log('\n✅ Ready for database migration phase\n');
}

createPRD();
