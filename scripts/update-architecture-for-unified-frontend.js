#!/usr/bin/env node
/**
 * Update CLAUDE.md Architecture Sections for Unified Frontend
 *
 * Updates database sections to reflect:
 * - EHG is now the unified frontend (user + admin via /admin routes)
 * - EHG_Engineer is primarily the backend API server
 * - Admin components migrated from EHG_Engineer to EHG
 *
 * Run: node scripts/update-architecture-for-unified-frontend.js
 * Then: node scripts/generate-claude-md-from-db.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Updated Application Architecture content
const UPDATED_APPLICATION_ARCHITECTURE = `### Unified Application Architecture (CONSOLIDATED)

#### System Overview
The EHG ecosystem consists of two primary components sharing a consolidated database:

1. **EHG** (Unified Frontend) - PORT 8080
   - **Path**: \`../ehg/\`
   - **Purpose**: Complete application frontend (user features + admin dashboard)
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED
   - **GitHub**: https://github.com/rickfelix/ehg.git
   - **Built with**: Vite + React + Shadcn + TypeScript
   - **Routes**:
     - \`/\` - User-facing venture creation and management
     - \`/admin\` - Admin dashboard (LEO Protocol management)
     - \`/admin/directives\` - Strategic Directives (SDManager)
     - \`/admin/prds\` - PRD Management
     - \`/admin/ventures\` - Ventures Admin View
   - **Role**: ALL UI FEATURES - both user and admin

2. **EHG_Engineer** (Backend API) - PORT 3000
   - **Path**: \`./\`
   - **Purpose**: Backend API server + LEO Protocol scripts
   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase) - CONSOLIDATED
   - **GitHub**: https://github.com/rickfelix/EHG_Engineer.git
   - **Provides**:
     - REST API endpoints (\`/api/sd\`, \`/api/prd\`, etc.)
     - LEO Protocol scripts (\`handoff.js\`, \`add-prd-to-database.js\`)
     - WebSocket connections for real-time updates
   - **Role**: BACKEND SERVICES ONLY - no standalone frontend

3. **Agent Platform** (AI Backend) - PORT 8000
   - **Path**: \`../ehg/agent-platform/\`
   - **Purpose**: AI research backend for venture creation
   - **Built with**: FastAPI + Python

> **NOTE (SD-ARCH-EHG-007)**: Admin components (SDManager, PRDManager, VenturesManager, Stage Components) have been migrated from EHG_Engineer to EHG as part of the unified frontend initiative.

### ⚠️ CRITICAL: During EXEC Phase Implementation
1. **Read PRD** from EHG_Engineer database (or via API)
2. **Navigate** to \`../ehg/\` for ALL frontend work
3. **For admin features**: Implement in \`/src/components/admin/\` or \`/src/pages/admin/\`
4. **For user features**: Implement in \`/src/components/\` or \`/src/pages/\`
5. **Push changes** to EHG's GitHub repo: \`rickfelix/ehg.git\`
6. **For backend API changes**: Navigate to \`./\`

### 🔄 Workflow Relationship
\`\`\`
EHG_Engineer (Backend)              EHG (Unified Frontend)
├── REST API /api/*          →     Consumed by both user & admin UI
├── LEO Protocol Scripts     →     Manage SDs, PRDs, handoffs
├── WebSocket Server         →     Real-time updates to UI
└── No UI (API only)               ALL UI here (user + /admin routes)
\`\`\`

### Stack Startup
\`\`\`bash
bash scripts/leo-stack.sh restart   # Starts all 3 servers
# Port 3000: EHG_Engineer backend API
# Port 8080: EHG unified frontend
# Port 8000: Agent Platform AI backend
\`\`\``;

// Updated Strategic Directive Execution Protocol content
const UPDATED_SD_EXECUTION_PROTOCOL = `### Application Context for Implementation

**Target Applications** (by feature type):
- **User Features** → \`../ehg/src/\` (user-facing components)
- **Admin Features** → \`../ehg/src/components/admin/\` or \`/src/pages/admin/\`
- **Backend API** → \`./\` (routes, server logic)
- **Stage Components** → \`../ehg/src/components/stages/admin/\` (19 stage components)

**Git Repositories**:
- EHG (Frontend): \`rickfelix/ehg.git\`
- EHG_Engineer (Backend): \`rickfelix/EHG_Engineer.git\`

**Key Rule**: Both user AND admin UI changes go to EHG. Only backend API changes go to EHG_Engineer.`;

// Updated EXEC Implementation Requirements - just the app check portion
const _UPDATED_EXEC_APP_CHECK = `1. **APPLICATION CHECK** ⚠️ CRITICAL
   - For **user features**: \`../ehg/\`
   - For **admin features**: \`../ehg/src/components/admin/\` or \`/src/pages/admin/\`
   - For **backend API changes**: \`./\`
   - Verify: \`cd ../ehg && pwd\` for frontend work
   - Check GitHub: \`git remote -v\` should show \`rickfelix/ehg.git\` for frontend
   - ⚠️ EHG_Engineer is now BACKEND ONLY - no frontend code there!`;

async function main() {
  console.log('🔄 Updating CLAUDE.md sections for unified frontend architecture...\n');

  try {
    // Update Application Architecture (ID: 245)
    console.log('📝 Updating Application Architecture section (ID: 245)...');
    const { error: error1 } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: UPDATED_APPLICATION_ARCHITECTURE,
        title: '🏗️ Application Architecture - UNIFIED FRONTEND'
      })
      .eq('id', 245);

    if (error1) {
      console.error('❌ Failed to update section 245:', error1);
    } else {
      console.log('✅ Updated Application Architecture section');
    }

    // Update Strategic Directive Execution Protocol (ID: 246)
    console.log('📝 Updating SD Execution Protocol section (ID: 246)...');

    // First, get the current content
    const { data: section246 } = await supabase
      .from('leo_protocol_sections')
      .select('content')
      .eq('id', 246)
      .single();

    if (section246) {
      // Replace the application context portion
      let updatedContent = section246.content;

      // Look for the application context section and replace it
      const appContextPattern = /### Application Context.*?(?=###|$)/s;
      if (appContextPattern.test(updatedContent)) {
        updatedContent = updatedContent.replace(appContextPattern, UPDATED_SD_EXECUTION_PROTOCOL + '\n\n');
      } else {
        // Add it at the end if not found
        updatedContent += '\n\n' + UPDATED_SD_EXECUTION_PROTOCOL;
      }

      const { error: error2 } = await supabase
        .from('leo_protocol_sections')
        .update({ content: updatedContent })
        .eq('id', 246);

      if (error2) {
        console.error('❌ Failed to update section 246:', error2);
      } else {
        console.log('✅ Updated SD Execution Protocol section');
      }
    }

    // Note about EXEC Implementation Requirements (ID: 210)
    console.log('\n⚠️  Section 210 (EXEC Implementation Requirements) may need manual review');
    console.log('   The APPLICATION CHECK instructions reference ../ehg/');
    console.log('   This is now correct (case-insensitive), but could be updated for clarity.\n');

    console.log('✅ Database updates complete!\n');
    console.log('📋 Next steps:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Review generated CLAUDE_CORE.md for changes');
    console.log('   3. Commit the updated CLAUDE*.md files\n');

  } catch (_error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  }
}

main();
