#!/usr/bin/env node

/**
 * Create SD-047B: Venture Documents Tab
 * LEAD-approved strategic directive for document management
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const newSD = {
  id: randomUUID(),
  sd_key: 'SD-047B',
  category: 'Document Management',
  title: 'Venture Documents Tab: File Management & Collaboration',
  description: `Add comprehensive document management to ventures, enabling teams to upload, organize, version, and collaborate on venture-related files (pitch decks, financial models, contracts, etc.).

**Current State**: No document storage for ventures. Teams use external file sharing tools, leading to fragmented information and version control issues.

**Business Need**: Centralize all venture-related documents in one place. Enable version tracking, access control, and collaboration without switching to external tools. Reduce document retrieval time by 70%.`,

  scope: `**Must-Haves**:
- File upload interface (drag-drop, multi-file, progress indicators)
- Document list with categorization (pitch decks, financials, legal, other)
- Version control (track all document versions, compare, restore)
- Access control (portfolio-level permissions via existing auth)
- File preview for common formats (PDF, images, basic office docs)
- Search and filtering (by name, category, date, uploader)
- Download single files or bulk download
- Documents tab as 5th tab alongside Grid/Kanban/Table/Timeline

**Nice-to-Haves**:
- Comments and annotations on documents
- Auto-categorization using AI/file name patterns
- Document expiration alerts (e.g., contracts expiring soon)
- Integration with external storage (Google Drive, Dropbox)

**Out of Scope**:
- Real-time collaborative editing (future enhancement)
- Timeline visualization (separate SD-047A)
- Advanced OCR/document parsing`,

  strategic_intent: `Eliminate document fragmentation across external tools. Provide single source of truth for venture documentation. Enable teams to find critical documents in seconds vs. minutes. Improve compliance through centralized access control and audit trails.`,

  rationale: `**Leverages Existing Infrastructure**:
- Supabase Storage available for file hosting with CDN
- Existing auth system provides user context for access control
- Portfolio-level permissions already implemented
- React hook patterns established for data fetching

**Why Separate from Timeline**: Documents is file CRUD (create/read/update/delete), Timeline is time-series visualization. Combining would mix concerns and create complex implementation. Better to have two focused, well-executed features.`,

  strategic_objectives: JSON.stringify([
    'Centralize venture documents in single interface',
    'Implement version control for all uploaded files',
    'Enable portfolio-level access control using existing auth',
    'Reduce document retrieval time by 70%',
    'Provide audit trail for document uploads/changes'
  ]),

  success_criteria: JSON.stringify([
    'Documents tab accessible from ventures page',
    'Drag-drop upload works with progress indicators',
    'Multiple file formats supported (PDF, images, Office docs)',
    'Version history shows all previous versions with restore capability',
    'Search returns results in <500ms',
    'File preview works for PDF and images',
    'Access control prevents unauthorized downloads',
    'Bulk download creates zip file correctly',
    'Upload/download works for files up to 50MB',
    'User testing shows 70% reduction in document retrieval time'
  ]),

  status: 'draft',
  priority: 'high',

  metadata: {
    estimated_hours: 32,
    related_sds: ['SD-2025-09-11-ventures-list-consolidated (cancelled)', 'SD-047A (Timeline Tab)'],
    technical_foundation: {
      storage: 'Supabase Storage',
      auth_pattern: 'Existing portfolio permissions',
      database_needs: 'venture_documents, document_versions tables'
    },
    database_migrations_required: true,
    design_subagent_required: true,
    requires_user_research: false,
    storage_bucket_creation: 'venture-files (Supabase Storage)',
    security_considerations: [
      'File size limits (50MB per file)',
      'File type validation (prevent malware)',
      'Access control via RLS policies',
      'Virus scanning for uploads (future)'
    ]
  }
};

async function createSD() {
  console.log('📋 Creating SD-047B: Venture Documents Tab\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(newSD)
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-047B created successfully\n');
  console.log('📊 Details:');
  console.log('   Title:', data[0].title);
  console.log('   Status:', data[0].status);
  console.log('   Priority:', data[0].priority);
  console.log('   Estimated Hours:', 32);
  console.log('   Strategic Objectives:', 5);
  console.log('   Success Criteria:', 10);
  console.log('\n✅ Ready for LEAD review and approval\n');
}

createSD();
