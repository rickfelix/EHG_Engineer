#!/usr/bin/env node
/**
 * Complete SD-DOCS-ARCH-001 PRD with full content
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

async function completePRD() {
  const prdId = 'PRD-SD-DOCS-ARCH-001';

  const updates = {
    system_architecture: `
## Architecture Overview
Documentation is organized in a hierarchical folder structure:
- docs/: Root documentation folder
- docs/reference/: API and protocol reference docs
- docs/guides/: Step-by-step tutorials and how-to guides
- docs/api/: API endpoint documentation

## Data Flow
1. Documentation authored in database (leo_protocol_sections)
2. generate-claude-md-from-db.js aggregates content
3. Static files generated for IDE consumption

## Integration Points
- Supabase: leo_protocol_sections table
- Scripts: generate-claude-md-from-db.js
- CLAUDE.md: Main context router
    `.trim(),

    implementation_approach: `
## Phase 1: Folder Structure Definition
- Define root folders: docs/, reference/, guides/, api/
- Create README.md in each folder explaining purpose
- Document folder depth limits (max 3 levels)

## Phase 2: Naming Convention Rules
- Define kebab-case for file names
- Define prefixes: api-, guide-, ref-
- Create naming convention document with examples

## Phase 3: Cross-Reference System
- Define markdown link format for cross-references
- Create "Related Docs" section template
- Build index file with topic map
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'leo_protocol_sections',
          columns: ['id', 'section_key', 'content', 'category'],
          relationships: ['FK to leo_protocol_versions']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'generate-claude-md-from-db.js',
        method: 'SCRIPT',
        description: 'Generates static CLAUDE.md from database'
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A - Documentation Only',
        description: 'No UI components - this is a documentation architecture SD'
      }
    ],

    // Update plan checklist to show real progress
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Folder hierarchy specification defined', checked: false },
      { text: 'Naming conventions documented', checked: false },
      { text: 'Cross-reference system designed', checked: false },
      { text: 'Migration guide drafted', checked: false },
      { text: 'User stories generated', checked: true }
    ],

    exec_checklist: [
      { text: 'Create docs/README.md with folder purpose', checked: false },
      { text: 'Create reference/README.md', checked: false },
      { text: 'Create guides/README.md', checked: false },
      { text: 'Create api/README.md', checked: false },
      { text: 'Document naming conventions', checked: false },
      { text: 'Create cross-reference template', checked: false },
      { text: 'Write migration guide', checked: false }
    ],

    risks: [
      {
        category: 'Adoption',
        risk: 'Existing documentation may not follow new conventions',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Some docs may need renaming',
        mitigation: 'Migration guide provides clear path'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must be compatible with CLAUDE.md generation',
        impact: 'Folder structure maps to database categories'
      }
    ],

    assumptions: [
      {
        assumption: 'leo_protocol_sections table exists',
        validation_method: 'Query database to verify'
      }
    ]
  };

  const { error } = await supabase
    .from('product_requirements_v2')
    .update(updates)
    .eq('id', prdId);

  if (error) {
    console.error('Failed to update PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ Updated PRD with complete content (no boilerplate)');
  console.log('📝 Now re-run: node scripts/handoff.js execute PLAN-TO-EXEC SD-DOCS-ARCH-001');
}

completePRD().catch(console.error);
