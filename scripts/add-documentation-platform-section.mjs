import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📝 Adding Documentation Platform section to LEO Protocol database');
console.log('='.repeat(50));

const content = `## 📚 Documentation Platform Integration (SD-DOCUMENTATION-001)

### Overview

The AI Documentation Generation System (SD-041C) is integrated into LEO Protocol to ensure all Strategic Directives are automatically documented.

**System Components**:
- **Service**: \`src/services/doc-generator.ts\` (351 lines) - Generates markdown/HTML from AI analysis
- **Admin UI**: \`/ai-docs-admin\` - Review and publish generated documentation
- **Database**: \`generated_docs\` table - Stores all documentation
- **Automation**: \`scripts/generate-workflow-docs.js\` (1,398 lines)

### When Documentation is Generated

**Automatic Triggers**:
- SD completion (status: completed)
- EXEC→PLAN handoff (implementation complete)
- Retrospective creation

**Manual Triggers**:
- DOCMON sub-agent engagement
- Dashboard: AI Docs Admin page

### EXEC Agent Documentation Requirement

**MANDATORY Step (Before EXEC→PLAN Handoff)**:

After implementation complete, EXEC agent MUST:

\`\`\`bash
# Generate documentation for the SD
node scripts/generate-workflow-docs.js --sd-id <SD-ID>

# Verify documentation created
SELECT id, title, status, document_type 
FROM generated_docs 
WHERE sd_id = '<SD-ID>';
\`\`\`

**Validation**: EXEC→PLAN handoff will check \`generated_docs\` table. If no documentation exists, handoff is BLOCKED.

### Documentation Types

| Type | Description | Auto-Generated |
|------|-------------|----------------|
| **SD Summary** | Strategic directive overview | ✅ Yes |
| **PRD** | Product requirements document | ✅ Yes |
| **Implementation Guide** | Technical implementation steps | ✅ Yes |
| **Retrospective** | Post-completion learnings | ✅ Yes |
| **API Documentation** | If API changes made | ⚠️ Manual |

### Using the AI Docs Admin Dashboard

1. Navigate to \`/ai-docs-admin\` in the dashboard
2. Review generated documentation
3. Edit if needed (markdown editor)
4. Click "Publish" to make available
5. Documentation appears in appropriate locations

### Documentation Quality Standards

**Required Elements**:
- Clear title and summary
- Technical details (if applicable)
- User stories covered
- Test evidence links
- Known issues documented

**Length Guidelines**:
- SD Summary: 200-500 words
- PRD: 500-1500 words
- Implementation Guide: 300-800 words
- Retrospective: 400-1000 words

### DOCMON Sub-Agent Integration

The **Information Architecture Lead** (DOCMON) sub-agent:
- **Priority**: 95 (CRITICAL)
- **Triggers**: Automatic on EXEC completion, manual for reviews
- **Purpose**: Validate documentation completeness and quality
- **Actions**: 
  - Check \`generated_docs\` table
  - Validate required elements present
  - Flag missing documentation as BLOCKER

### Troubleshooting

**Issue**: Documentation not generated
- **Check**: \`ai_analysis_jobs\` table for errors
- **Fix**: Re-run \`generate-workflow-docs.js\` with \`--force\` flag

**Issue**: Documentation incomplete
- **Check**: PRD has all required sections
- **Fix**: Update PRD, regenerate docs

**Issue**: EXEC→PLAN handoff blocked
- **Check**: Query \`generated_docs\` for SD-ID
- **Fix**: Generate missing documentation before retrying handoff

### Benefits

- **100% SD coverage**: No SD completes without documentation
- **Automatic generation**: Reduces manual documentation burden
- **Quality consistency**: AI ensures standard format
- **Search & Discovery**: All docs in central \`generated_docs\` table
- **Onboarding**: New team members find comprehensive docs

### Related Scripts

- \`scripts/generate-workflow-docs.js\` - Generate documentation
- \`scripts/doc-generator.ts\` - Core generation service
- \`scripts/ai-docs-analyzer.ts\` - AI analysis engine

### Related Database Tables

- \`generated_docs\` - All documentation storage
- \`ai_analysis_jobs\` - Background job tracking
- \`strategic_directives_v2\` - SD metadata (linked)
- \`product_requirements_v2\` - PRD content (source)
`;

const newSection = {
  protocol_id: 'leo-v4-2-0-story-gates',
  section_type: 'documentation_platform',
  title: '📚 Documentation Platform Integration',
  order_index: 165,
  content: content,
  metadata: {
    added_by: 'SD-DOCUMENTATION-001',
    added_date: new Date().toISOString(),
    purpose: 'Integrate AI Documentation Generation System into LEO Protocol'
  }
};

const { data, error} = await supabase
  .from('leo_protocol_sections')
  .insert(newSection)
  .select();

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log('✅ Documentation Platform section added');
console.log('ID:', data[0].id);
console.log('Order Index:', data[0].order_index);
console.log('Title:', data[0].title);
console.log('Content length:', data[0].content.length, 'characters');
console.log('');
console.log('✅ Next: Regenerate CLAUDE.md with:');
console.log('  node scripts/generate-claude-md-from-db.js');
