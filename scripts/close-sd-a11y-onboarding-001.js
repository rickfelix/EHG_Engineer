#!/usr/bin/env node

/**
 * Close SD-A11Y-ONBOARDING-001 - All scope delivered
 *
 * Scope Completion:
 * - ✅ Fixed aria-pressed on radio role (Line 286)
 * - ✅ Added aria-checked to radio role (Line 287)
 * - ✅ ESLint passes for onboarding getting-started page
 * - ✅ Commit 2960524 pushed successfully
 *
 * Notes:
 * - CI still red due to OUT-OF-SCOPE errors in other files
 * - These require separate SDs (BoardReporting, ExportConfigurationForm, AnalyticsDashboard)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function closeSD() {
  console.log('\n📋 Closing SD-A11Y-ONBOARDING-001');
  console.log('='.repeat(60));

  const completionNotes = `## SD-A11Y-ONBOARDING-001: COMPLETED ✅

**Scope Delivered**:
- ✅ Removed aria-pressed from radio role (Line 286)
- ✅ Added aria-checked to radio role (Line 287)
- ✅ ESLint passes with 0 errors for onboarding getting-started page
- ✅ Changes committed (2960524) and pushed to GitHub

**Implementation**:
- File: app/(onboarding)/getting-started/page.tsx
- Lines changed: 2 (minimal surgical fix as planned)
- Commit: 2960524
- Branch: feat/SD-VWC-INTUITIVE-FLOW-001-venture-wizard-user-experience-completio

**Verification**:
\`\`\`bash
# Local verification
npm run lint # ✅ 0 accessibility errors in onboarding/getting-started/page.tsx

# Changes made
git diff 7c600d7..2960524
# -                aria-pressed={selectedPath === pathId}
#                  role="radio"
# +                aria-checked={selectedPath === pathId}
\`\`\`

**CI Status Note**:
CI pipeline remains red, but due to **OUT-OF-SCOPE** pre-existing errors in different files:
1. src/components/ai-ceo/BoardReporting.tsx:193 - Label not associated with control
2. src/components/analytics/ExportConfigurationForm.tsx:282 - Click handlers missing keyboard listeners
3. src/components/analytics/AnalyticsDashboard.tsx:264 - Parsing error

These errors were NOT part of SD-A11Y-ONBOARDING-001 scope (onboarding page only).

**Recommendation**:
Create separate SD(s) for remaining accessibility errors if they need to be addressed.`;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      current_phase: 'DONE',
      progress_percentage: 100,
      metadata: {
        completion_date: new Date().toISOString(),
        completion_notes: completionNotes,
        commit_hash: '2960524',
        files_modified: ['app/(onboarding)/getting-started/page.tsx'],
        lines_changed: 2,
        scope_fully_delivered: true,
        out_of_scope_errors_found: true,
        out_of_scope_files: [
          'src/components/ai-ceo/BoardReporting.tsx',
          'src/components/analytics/ExportConfigurationForm.tsx',
          'src/components/analytics/AnalyticsDashboard.tsx'
        ]
      }
    })
    .eq('id', 'SD-A11Y-ONBOARDING-001')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }

  console.log('✅ SD closed successfully!');
  console.log('   ID:', data[0].id);
  console.log('   Status:', data[0].status);
  console.log('   Phase:', data[0].current_phase);
  console.log('   Progress:', data[0].progress_percentage + '%');
  console.log('\n📋 Summary:');
  console.log('   - Scope: 100% delivered ✅');
  console.log('   - File: app/(onboarding)/getting-started/page.tsx');
  console.log('   - Lines: 2 changed (286-287)');
  console.log('   - Commit: 2960524');
  console.log('   - ESLint: 0 errors for onboarding page ✅');
  console.log('\n⚠️  Note: CI still red due to out-of-scope errors in other files');
  console.log('   (Requires separate SD if remediation needed)\n');
}

closeSD().catch(console.error);
