#!/usr/bin/env node
/**
 * Add Research Lookup Section to LEO Protocol
 *
 * Adds mandatory research lookup step to PLAN phase PRD creation workflow.
 * Research outputs are stored in docs/research/outputs/{SD-ID}/ with index.json files.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const RESEARCH_LOOKUP_SECTION = {
  protocol_id: 'leo-v4-3-3-ui-parity',
  section_type: 'prd_research_lookup',
  title: 'Research Lookup Before PRD Creation',
  content: `## Research Lookup Before PRD Creation (MANDATORY)

**CRITICAL**: Before creating any PRD, check if research has been completed for the SD.

### Research Directory Structure

\`\`\`
docs/research/outputs/
├── index.json                    # Master index of all research
├── SD-RESEARCH-106/
│   ├── index.json                # SD-specific index with prd_generation_notes
│   ├── leo-protocol-v5x-summary.md
│   └── ...
├── SD-RESEARCH-107/
│   └── ...
└── SD-RESEARCH-108/
    └── ...
\`\`\`

### Lookup Process (Step 0 of PRD Creation)

1. **Check master index**:
   \`\`\`bash
   cat docs/research/outputs/index.json | jq '.strategic_directives[] | select(.sd_id == "SD-YOUR-ID")'
   \`\`\`

2. **If research exists**, read SD-specific index:
   \`\`\`bash
   cat docs/research/outputs/{SD-ID}/index.json
   \`\`\`

3. **Extract prd_generation_notes** (MUST be incorporated into PRD):
   \`\`\`bash
   cat docs/research/outputs/{SD-ID}/index.json | jq '.prd_generation_notes'
   \`\`\`

4. **Read summary files** for detailed findings:
   \`\`\`bash
   cat docs/research/outputs/{SD-ID}/*.md
   \`\`\`

### index.json Structure

\`\`\`json
{
  "sd_id": "SD-RESEARCH-106",
  "sd_title": "LEO Protocol Evolution to v5.x",
  "research_status": "complete",
  "documents": [
    {
      "title": "Document Title",
      "filename": "Original.pdf",
      "pages": 18,
      "relevance": "primary|supporting|reference",
      "summary_file": "summary-file.md",
      "key_sections": ["Section 1", "Section 2"],
      "key_decisions": ["Decision 1", "Decision 2"]
    }
  ],
  "prd_generation_notes": [
    "Note 1 - MUST be in PRD",
    "Note 2 - MUST be in PRD"
  ],
  "cross_references": {
    "SD-OTHER-001": "How this SD relates"
  }
}
\`\`\`

### Integration with PRD Creation

> **WARNING**: If research exists but is not referenced in PRD, the PRD is incomplete.

When research is found:
1. Add \`prd_generation_notes\` to PRD's \`technical_approach\` field
2. Reference key decisions in \`implementation_plan\`
3. Include cross_references in \`dependencies\` field
4. Link to summary files in PRD metadata

### Example PRD Creation Flow

\`\`\`bash
# Step 0: Research lookup
cat docs/research/outputs/index.json | jq '.strategic_directives[] | select(.sd_id == "SD-RESEARCH-106")'
# → research_status: "complete"

cat docs/research/outputs/SD-RESEARCH-106/index.json | jq '.prd_generation_notes'
# → ["Reference Temporal.io TypeScript SDK documentation", ...]

# Step 1: Schema review (existing process)
# Step 2: PRD creation with research incorporated
node scripts/add-prd-to-database.js SD-RESEARCH-106
# → PRD includes research findings in technical_approach
\`\`\`
`,
  order_index: 150, // Before other PRD creation steps
  metadata: {
    added_by: 'add-research-lookup-to-protocol.js',
    added_at: new Date().toISOString(),
    purpose: 'Ensure research outputs are incorporated into PRD creation',
    related_sds: ['SD-RESEARCH-106', 'SD-RESEARCH-107', 'SD-RESEARCH-108']
  },
  context_tier: 'PHASE_PLAN',
  target_file: 'CLAUDE_PLAN.md'
};

async function addResearchLookupSection() {
  console.log('🔄 Adding research lookup section to LEO Protocol...\n');

  try {
    // Check if section already exists
    const { data: existing, error: checkError } = await supabase
      .from('leo_protocol_sections')
      .select('id, title')
      .eq('protocol_id', RESEARCH_LOOKUP_SECTION.protocol_id)
      .eq('section_type', RESEARCH_LOOKUP_SECTION.section_type)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existing) {
      console.log(`⚠️ Section already exists (id: ${existing.id}): ${existing.title}`);
      console.log('Updating existing section...');

      const { error: updateError } = await supabase
        .from('leo_protocol_sections')
        .update({
          title: RESEARCH_LOOKUP_SECTION.title,
          content: RESEARCH_LOOKUP_SECTION.content,
          metadata: RESEARCH_LOOKUP_SECTION.metadata,
          order_index: RESEARCH_LOOKUP_SECTION.order_index
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
      console.log('✅ Section updated successfully');
    } else {
      // Insert new section
      const { data, error: insertError } = await supabase
        .from('leo_protocol_sections')
        .insert(RESEARCH_LOOKUP_SECTION)
        .select()
        .single();

      if (insertError) throw insertError;
      console.log(`✅ Section inserted successfully (id: ${data.id})`);
    }

    console.log('\n📋 Section Details:');
    console.log(`   Protocol: ${RESEARCH_LOOKUP_SECTION.protocol_id}`);
    console.log(`   Type: ${RESEARCH_LOOKUP_SECTION.section_type}`);
    console.log(`   Title: ${RESEARCH_LOOKUP_SECTION.title}`);
    console.log(`   Target: ${RESEARCH_LOOKUP_SECTION.target_file}`);
    console.log(`   Tier: ${RESEARCH_LOOKUP_SECTION.context_tier}`);

    console.log('\n🎯 Next Steps:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify CLAUDE_PLAN.md includes research lookup section');
    console.log('   3. Test with: cat docs/research/outputs/index.json');

  } catch (error) {
    console.error('❌ Failed to add section:', error);
    process.exit(1);
  }
}

addResearchLookupSection();
