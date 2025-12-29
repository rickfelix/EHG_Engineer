#!/usr/bin/env node

/**
 * LEAD→PLAN Handoff for SD-047B
 * Venture Documents: Pragmatic File Management (Combined B+C Scope)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID as _randomUUID } from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createHandoff() {
  console.log('📋 Creating LEAD→PLAN Handoff for SD-047B\n');

  // Get SD
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-047B')
    .single();

  if (sdError || !sdData) {
    console.error('❌ SD-047B not found:', sdError?.message);
    process.exit(1);
  }

  console.log('✅ SD-047B Retrieved\n');
  console.log('📊 Original Scope:');
  console.log('   Estimated: 32 hours');
  console.log('   Approach: Full-featured document management tab\n');

  console.log('🎯 Refined Scope (Combined Option B+C):');
  console.log('   Estimated: 18 hours (44% reduction)');
  console.log('   Approach: Pragmatic file management in detail sections\n');

  // Update SD with refined scope
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      metadata: {
        ...sdData.metadata,
        original_estimate_hours: 32,
        revised_estimate_hours: 18,
        efficiency_gain_percent: 44,
        scope_refinement: 'Combined Option B (basic upload) + Option C (essential features)',
        deferred_to_v1_1: [
          'Version control and history',
          'In-app file preview',
          'Advanced search',
          'Bulk download (zip)',
          'Comments/annotations',
          'Document expiration alerts'
        ],
        user_feedback_integrated: 'Section in detail view (not separate tab), multi-level support (ventures + portfolios)',
        lead_approval: {
          approved_at: new Date().toISOString(),
          approved_by: 'LEAD',
          simplicity_check: 'PASSED - Deferred complexity to v1.1',
          user_context: 'Maybe not as a tab, documents for ventures/portfolios/companies'
        }
      }
    })
    .eq('id', sdData.id);

  if (updateError) {
    console.error('❌ Failed to update SD:', updateError.message);
    process.exit(1);
  }

  console.log('✅ SD-047B Updated: draft → active\n');

  // Create handoff summary
  const handoffSummary = `# LEAD→PLAN Handoff: SD-047B Document Management

## Executive Summary

**Scope Refinement**: Combined Option B (basic self-contained upload) + Option C (essential features) based on user feedback suggesting simpler approach than full-featured tab.

**Key User Feedback**:
- "Maybe this exists not as a tab, but some other format" → Use collapsible sections in detail views
- "Companies might also require documents, portfolios too" → Multi-level support from v1

**Budget**: 18 hours (44% reduction from original 32h estimate)

## Strategic Decisions

### 1. Section vs Tab
**Decision**: Collapsible document section within venture/portfolio detail views
**Rationale**: User questioned tab approach, sections provide better context

### 2. Multi-Level Architecture
**Decision**: Support ventures, portfolios, and companies (future) from v1
**Rationale**: User explicitly mentioned all three levels
**Implementation**: Shared \`useDocuments(entityType, entityId)\` hook

### 3. Deferred Complexity
**Decision**: No version control, no preview, no advanced search in v1
**Rationale**: 44% time savings, can iterate in v1.1 based on actual usage
**Tradeoff**: Less features initially, but faster shipping

### 4. Self-Contained Storage
**Decision**: Supabase Storage (not external links)
**Rationale**: Better access control, audit trails, self-hosted

## v1 Scope (18 hours)

### Database Schema (2h)
- \`venture_documents\` table (id, venture_id, file_name, file_path, file_size, file_type, category, uploaded_by, uploaded_at)
- \`portfolio_documents\` table (same structure, portfolio_id)
- Categories: pitch_deck, financial, legal, operational, other
- RLS policies for portfolio-level access
- Supabase Storage bucket: \`venture-files\`

### File Upload (4h)
- Drag-drop component (react-dropzone)
- Multi-file selection
- Progress indicators
- File type validation (PDF, images, Office docs)
- Max 50MB per file
- Category selection

### Document List (3h)
- Table with: name, category, size, uploader, date
- Sort by date/name/category
- Filter by category
- Download button (signed URLs)
- Delete button (with confirmation)
- Empty state

### Integration (2h)
- Collapsible "Documents" card in venture detail
- Same component for portfolio detail
- Document count badge
- Upload button within card

### Access Control (2h)
- RLS: only portfolio members can access
- Signed URLs for secure downloads
- Auth-gated uploads
- Delete requires ownership

### Search (2h)
- Simple text search on file_name
- Results in <500ms
- Clear search button

### Multi-Level Support (2h)
- \`DocumentsSection\` component
- Props: entityType ('venture'|'portfolio'), entityId
- \`useDocuments(entityType, entityId)\` hook
- Shared upload/list logic

### Testing (1h)
- Error handling
- Loading states
- Success/error toasts
- File size validation UI

## Deferred to v1.1

- **Version Control**: Track versions, compare, restore
- **File Preview**: PDF/image/Office preview
- **Advanced Search**: Full-text, metadata filters
- **Bulk Operations**: Download multiple as zip
- **Collaboration**: Comments, annotations
- **Automation**: Expiration alerts, auto-categorization

## Acceptance Criteria (13 total)

### P0 (Critical) - 8 criteria
1. Upload files via drag-drop or click (multi-file)
2. Progress shows percentage
3. Document list shows metadata
4. Download works for authorized users
5. Delete works with confirmation
6. RLS prevents unauthorized access (403)
7. Search returns results <500ms
8. Documents section in venture detail view

### P1 (Important) - 3 criteria
9. Filter by category
10. File size validation (50MB limit)
11. Portfolio documents work

### P2 (Nice to Have) - 2 criteria
12. Empty state with prompt
13. Toast notifications

## Action Items for PLAN

1. **Create Comprehensive PRD**
   - Expand 13 acceptance criteria
   - Define database schema in detail
   - Specify Supabase Storage bucket config
   - Document RLS policy rules

2. **Trigger Design Sub-Agent**
   - Upload component wireframe
   - Document list layout
   - Collapsible section integration
   - Empty state design
   - Loading/error states

3. **Create Database Migration**
   - venture_documents table
   - portfolio_documents table
   - RLS policies
   - Indexes for performance
   - Supabase Storage bucket setup

4. **Create PLAN→EXEC Handoff**
   - Technical specifications
   - Component architecture
   - File paths for all deliverables
   - Testing strategy

## Success Metrics

- **Time Efficiency**: 18h actual vs 32h original (target 44% savings)
- **User Adoption**: 60% of ventures have ≥1 document within 2 weeks
- **Retrieval Time**: 70% reduction (target per original SD)
- **Access Control**: 0 unauthorized access incidents
- **Upload Success Rate**: >95% successful uploads

## Risk Mitigation

**Risk 1: File Size Limits**
- Mitigation: 50MB limit clearly communicated in UI
- Future: Chunked uploads for larger files

**Risk 2: Storage Costs**
- Mitigation: Monitor usage, set alerts at 10GB
- Future: Implement retention policies

**Risk 3: RLS Complexity**
- Mitigation: Reuse existing portfolio permission patterns
- Testing: Verify with multiple user roles

## Technical Foundation

**Existing Patterns to Leverage**:
- Supabase auth (from ventures)
- React Query hooks (from timeline)
- Shadcn components (Card, Button, Table)
- RLS policies (from ventures)

**New Dependencies**:
- react-dropzone (drag-drop upload)
- @supabase/storage-js (already in supabase-js)

**No New Infrastructure**: Supabase Storage already available
`;

  console.log('📝 Handoff Summary Created\n');
  console.log('═══════════════════════════════════════════════');
  console.log('✅ LEAD→PLAN Handoff Complete');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('🎯 Key Points:');
  console.log('   • Refined scope: 18h vs 32h (44% savings)');
  console.log('   • Section-based (not tab) per user feedback');
  console.log('   • Multi-level: ventures + portfolios from v1');
  console.log('   • Self-contained with Supabase Storage');
  console.log('   • Deferred complexity to v1.1');
  console.log('');
  console.log('📋 Next: PLAN creates PRD and triggers Design Sub-Agent');
  console.log('═══════════════════════════════════════════════\n');

  // Save handoff summary to metadata
  await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        ...sdData.metadata,
        lead_plan_handoff: handoffSummary,
        handoff_created_at: new Date().toISOString()
      }
    })
    .eq('id', sdData.id);

  console.log('✅ Handoff saved to SD metadata\n');
}

createHandoff();
