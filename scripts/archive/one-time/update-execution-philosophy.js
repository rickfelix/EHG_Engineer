#!/usr/bin/env node

/**
 * Update LEO Protocol Execution Philosophy to emphasize quality over speed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const ENHANCED_PHILOSOPHY = `## 🧠 EXECUTION PHILOSOPHY (Read First!)

These principles override default behavior and must be internalized before starting work:

### Quality-First (PARAMOUNT)
**Get it right, not fast.** Correctness and completeness are MORE IMPORTANT than speed.
- Take the time needed to understand requirements fully
- Verify BEFORE implementing, test BEFORE claiming completion
- 2-4 hours of careful implementation beats 6-12 hours of rework
- If rushing leads to mistakes, you haven't saved time - you've wasted it
- "Done right" > "Done fast" - ALWAYS

### Testing-First (MANDATORY)
**Build confidence through comprehensive testing.**
- E2E testing is MANDATORY, not optional
- 30-60 minute investment saves 4-6 hours of rework
- 100% user story coverage required
- Both unit tests AND E2E tests must pass
- Tests are not overhead - they ARE the work

### Database-First (REQUIRED)
**Zero markdown files.** Database tables are single source of truth.
- SDs → \`strategic_directives_v2\`
- PRDs → \`product_requirements_v2\`
- Handoffs → \`sd_phase_handoffs\`
- Retrospectives → \`retrospectives\`
- Sub-agent results → \`sub_agent_execution_results\`

### Simplicity-First (GATEKEEPING)
**Challenge complexity BEFORE approval, commit to full scope AFTER.**
- LEAD questions: Can we document instead? Solving real or imagined problems?
- After LEAD approval: SCOPE LOCK - no unilateral deferrals
- Exception: Critical blocker + human approval + new SD for deferred work

### Context-Aware (PROACTIVE)
**Monitor token usage proactively throughout execution.**
- Report context health in EVERY handoff
- HEALTHY (<70%), WARNING (70-90%), CRITICAL (90-95%), EMERGENCY (>95%)
- Use \`/context-compact\` when approaching WARNING threshold

### Application-Aware (VERIFICATION)
**Verify directory BEFORE writing ANY code.**
- \`cd ../ehg && pwd\` for customer features
- \`git remote -v\` to confirm correct repository
- Wrong directory = STOP immediately

### Evidence-Based (PROOF REQUIRED)
**Screenshot, test, verify. Claims without evidence are rejected.**
- Screenshot BEFORE and AFTER changes
- Test results with pass/fail counts
- CI/CD pipeline status (green checks required)
- Sub-agent verification results in database

**REMEMBER**: The goal is NOT to complete SDs quickly. The goal is to complete SDs CORRECTLY. A properly implemented SD that takes 8 hours is infinitely better than a rushed implementation that takes 4 hours but requires 6 hours of fixes.`;

async function updateExecutionPhilosophy() {
  console.log('🔄 Updating Execution Philosophy section...\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // Check if section exists
    const { data: existingSection, error: checkError } = await supabase
      .from('leo_protocol_sections')
      .select('id, section_type, title')
      .eq('section_type', 'execution_philosophy')
      .single();

    if (checkError || !existingSection) {
      console.error('❌ execution_philosophy section not found in database');
      console.error('Error:', checkError);
      process.exit(1);
    }

    console.log(`✅ Found section ID: ${existingSection.id}\n`);

    // Update the content
    const { data: updatedSection, error: updateError } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: ENHANCED_PHILOSOPHY
      })
      .eq('section_type', 'execution_philosophy')
      .select('id, section_type, title')
      .single();

    if (updateError) {
      console.error('❌ Error updating section:', updateError);
      process.exit(1);
    }

    console.log('✅ Updated execution_philosophy section\n');
    console.log('📋 Section details:');
    console.log(JSON.stringify(updatedSection, null, 2));

    console.log('\n✅ SUCCESS: Execution Philosophy updated in database');
    console.log('\n📝 Next Steps:');
    console.log('   1. Regenerate CLAUDE.md: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Review changes in CLAUDE.md');
    console.log('   3. Commit to git if satisfied');

  } catch (_error) {
    console.error('❌ Error updating execution philosophy:', error);
    process.exit(1);
  }
}

updateExecutionPhilosophy();
