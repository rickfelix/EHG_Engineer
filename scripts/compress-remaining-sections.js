#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findAndCompress() {
  const { data: sections } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, section_type')
    .eq('protocol_id', 'leo-v4-2-0-story-gates');

  const compressionMap = [
    {
      type: 'lead_operations',
      compressed: `**LEAD Agent Operations**: Strategic planning, business objectives, final approval.

**Finding Active SDs**: \`node scripts/query-active-sds.js\` or query \`strategic_directives_v2\` table directly

**Decision Matrix**:
- Draft → Review & approve
- Pending Approval → Final review  
- Active → Create LEAD→PLAN handoff
- In Progress → Monitor execution

**Key Responsibilities**: Strategic direction, priority setting (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49), handoff creation, progress monitoring

**Complete Guide**: See \`docs/reference/lead-operations.md\``
    },
    {
      type: 'directive_submission_review',
      compressed: `**Directive Submission Review**: Review submissions before creating SDs.

**Quick Review**:
\`\`\`bash
node scripts/lead-review-submissions.js
\`\`\`

**Review Checklist**:
- Chairman input (original intent)
- Intent clarity & strategic alignment
- Priority assessment & scope validation
- Duplicate check & gate progression

**Decision Matrix**:
- Completed + No SD → Create SD
- Completed + SD exists → Verify & handoff
- Pending → Monitor
- Failed → Archive/remediate

**Complete Process**: See \`docs/reference/directive-submission-review.md\``
    },
    {
      type: 'database_first_enforcement_expanded',
      compressed: `**Database-First Enforcement (MANDATORY)**:

**❌ NEVER create**: Strategic Directive files, PRD files, Retrospective files, Handoff documents, Verification reports

**✅ REQUIRED**: All data in database tables only
- SDs → \`strategic_directives_v2\`
- PRDs → \`product_requirements_v2\`
- Retrospectives → \`retrospectives\`
- Handoffs → \`sd_phase_handoffs\`

**Why**: Single source of truth, real-time updates, automated tracking, no file sync issues

**Verification**: \`find . -name "SD-*.md" -o -name "PRD-*.md"\` should return ONLY legacy files`
    }
  ];

  let totalSaved = 0;

  for (const item of compressionMap) {
    const section = sections.find(s => s.section_type === item.type);
    if (!section) {
      console.log('Not found: ' + item.type);
      continue;
    }

    const { data: current } = await supabase
      .from('leo_protocol_sections')
      .select('content')
      .eq('id', section.id)
      .single();

    const oldChars = current.content ? current.content.length : 0;
    
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content: item.compressed })
      .eq('id', section.id);

    if (error) {
      console.error('Error:', error);
      continue;
    }

    const newChars = item.compressed.length;
    const saved = oldChars - newChars;
    totalSaved += saved;
    
    console.log(section.title.substring(0, 45) + ': ' + oldChars + ' → ' + newChars + ' (saved ' + saved + ')');
  }

  console.log('\nTotal saved: ' + totalSaved + ' chars');
}

findAndCompress().catch(console.error);
