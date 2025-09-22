#!/usr/bin/env node
// PRD Generation from Strategic Directives (Non-lossy)
// Preserves all backlog item nuance in Evidence Appendix

import { createClient } from '@supabase/supabase-js';
import { program } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

program
  .option('--sd-id <id>', 'SD ID to generate PRD for')
  .option('--all', 'Generate PRDs for all SDs')
  .option('--output <dir>', 'Output directory for markdown files', './prds')
  .parse();

const options = program.opts();

function generatePRDMarkdown(payload) {
  const sd = payload;
  const items = sd.items || [];
  
  // Build scope list
  const scopeItems = items.map(item => 
    `- [${item.backlog_id}] ${item.backlog_title}`
  ).join('\n');
  
  
  const markdown = `# PRD – ${sd.sd_id}: ${sd.sd_title}

**Page:** ${sd.page_category || 'N/A'} / ${sd.page_title || 'N/A'}  
**Sequence Rank:** ${sd.sequence_rank}  
**Rolled Triage:** ${sd.rolled_triage}  
**Counts:** H=${sd.h_count}, M=${sd.m_count}, L=${sd.l_count}, F=${sd.future_count}  
**Must-have:** ${sd.must_have_count} / ${sd.total_items} (${sd.must_have_pct}%)

## 1. Problem & Context

This strategic directive addresses the need for ${sd.sd_title}. With ${sd.total_items} backlog items identified, ${sd.must_have_count} are marked as must-have requirements (${sd.must_have_pct}% of total scope).

${sd.sd_extras && sd.sd_extras.context ? sd.sd_extras.context : 'The initiative focuses on delivering key capabilities as outlined in the backlog items below.'}

## 2. Objectives & KPIs

### Primary Objectives:
- Deliver all ${sd.must_have_count} must-have requirements
- Complete implementation within the ${sd.rolled_triage} priority timeline
- Ensure all ${sd.h_count} high-priority items are addressed first

### Key Performance Indicators:
- Completion rate of must-have items: Target 100%
- User adoption rate: Measure within 30 days of launch
- Performance metrics: Meet or exceed baseline requirements
${sd.readiness ? `- Readiness score: Current ${sd.readiness}` : ''}

## 3. Scope (backlog-driven)

### In-scope items (${items.length} total):
${scopeItems}

### Priority Distribution:
- High Priority: ${sd.h_count} items
- Medium Priority: ${sd.m_count} items
- Low Priority: ${sd.l_count} items
- Future Consideration: ${sd.future_count} items

${sd.new_module_pct ? `### New Module Requirements:
${sd.new_module_pct}% of items require new module development` : ''}

## 4. User Experience & EVA Hooks

### Key User Flows:
Based on the backlog analysis, the primary user interactions will involve:
${items.filter(i => i.new_module).length > 0 ? `
- ${items.filter(i => i.new_module).length} new module integrations
` : ''}
- Progressive enhancement of existing features
- Seamless integration with current workflows

### EVA Integration Points:
- Activation triggers based on user context
- Natural language processing for intent recognition
- Contextual assistance throughout the workflow

## 5. Technical Notes

### Implementation Considerations:
- Total implementation items: ${sd.total_items}
- New module requirements: ${items.filter(i => i.new_module).length} items
${sd.must_have_density ? `- Must-have density: ${sd.must_have_density}` : ''}
${sd.readiness ? `- Current readiness: ${sd.readiness}` : ''}

### Dependencies:
Items are distributed across ${new Set(items.map(i => i.phase)).size} phases with dependencies managed through stage sequencing.

## 6. Traceability

- **Strategic Directive:** ${sd.sd_id}
- **Backlog Items:** ${items.map(i => i.backlog_id).join(', ')}
- **Import Run:** ${sd.import_run_id || 'N/A'}
- **Generated:** ${new Date().toISOString()}

---

## Appendix A — Backlog Evidence

*See evidence_appendix field for full backlog item details*

---

*This PRD was generated from the EHG Backlog import, preserving all original item details and metadata.*`;

  return markdown;
}

async function generatePRD(sdId) {
  console.log(`\n📋 Generating PRD for ${sdId}...`);
  
  // Fetch SD with items from view
  const { data: payload, error } = await supabase
    .from('v_prd_sd_payload')
    .select('*')
    .eq('sd_id', sdId)
    .single();
  
  if (error) {
    console.error(`❌ Error fetching SD ${sdId}:`, error.message);
    return null;
  }
  
  if (!payload) {
    console.error(`❌ SD ${sdId} not found`);
    return null;
  }
  
  // Generate content
  const items = payload.items || [];
  const contentMd = generatePRDMarkdown(payload);
  const contentJson = {
    sd_id: payload.sd_id,
    sd_title: payload.sd_title,
    metadata: {
      sequence_rank: payload.sequence_rank,
      page_category: payload.page_category,
      page_title: payload.page_title,
      rolled_triage: payload.rolled_triage,
      counts: {
        h: payload.h_count,
        m: payload.m_count,
        l: payload.l_count,
        f: payload.future_count,
        total: payload.total_items
      },
      must_have: {
        count: payload.must_have_count,
        percentage: payload.must_have_pct
      }
    },
    items: payload.items || []
  };
  
  // Build the Evidence Appendix from items
  const evidenceItems = items.map(item => {
    const extras = item.extras && Object.keys(item.extras).length > 0 
      ? JSON.stringify(item.extras, null, 2) 
      : 'None';
    
    return `### [${item.backlog_id}] ${item.backlog_title}
- **My Comments:** ${item.my_comments || 'N/A'}
- **Priority/Stage/Phase:** ${item.priority || 'N/A'} / ${item.stage_number || 'N/A'} / ${item.phase || 'N/A'}
- **New Module:** ${item.new_module ? 'Yes' : 'No'}
- **Item Description (user-facing):**  
${item.item_description || 'N/A'}

- **Raw Description (tag source):**  
${item.description_raw || 'N/A'}

- **Extras:**  
\`\`\`json
${extras}
\`\`\`
`;
  }).join('\n\n');
  
  const evidenceAppendix = `## Appendix A — Backlog Evidence (full text)\n\n${evidenceItems}`;
  
  // Store in database (v2 with new fields)
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-${sdId}`,  // v2 uses 'id' not 'sd_id'
      directive_id: sdId,  // Link to SD
      title: payload.sd_title,
      version: '1.0',
      status: 'draft',
      category: 'technical',
      priority: payload.rolled_triage?.toLowerCase() || 'medium',
      executive_summary: `Product requirements for ${payload.sd_title} with ${payload.total_items} backlog items`,
      content: contentMd,  // v2 uses 'content' not 'content_md'
      evidence_appendix: evidenceAppendix,  // New field
      backlog_items: payload.items || [],  // New field
      created_by: 'PLAN',
      phase: 'planning'
    })
    .select()
    .single();
  
  if (prdError && prdError.code === '23505') {
    // Duplicate - update existing
    console.log(`⚠️  PRD-${sdId} already exists, updating...`);
    
    const { data: updatedPrd, error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({
        title: payload.sd_title,
        priority: payload.rolled_triage?.toLowerCase() || 'medium',
        executive_summary: `Product requirements for ${payload.sd_title} with ${payload.total_items} backlog items`,
        content: contentMd,
        evidence_appendix: evidenceAppendix,
        backlog_items: payload.items || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', `PRD-${sdId}`)
      .select()
      .single();
    
    if (updateError) {
      console.error(`❌ Error updating PRD:`, updateError.message);
      return null;
    }
    
    console.log(`✅ Updated PRD-${sdId}`);
    return updatedPrd;
  } else if (prdError) {
    console.error(`❌ Error creating PRD:`, prdError.message);
    return null;
  }
  
  console.log(`✅ Generated PRD-${sdId}`);
  
  // Optionally save to file
  if (options.output) {
    const outputDir = options.output;
    await fs.mkdir(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `PRD-${sdId}.md`);
    await fs.writeFile(filePath, contentMd);
    console.log(`   📄 Saved to ${filePath}`);
  }
  
  return prd;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 PRD GENERATION TOOL');
  console.log('='.repeat(60));
  
  if (options.all) {
    // Generate for all SDs (from v2 table)
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('present_in_latest_import', true)
      .order('sequence_rank');
    
    if (sds) {
      console.log(`\nGenerating PRDs for ${sds.length} SDs...`);
      for (const sd of sds) {
        await generatePRD(sd.id);
      }
    }
  } else if (options.sdId) {
    // Generate for specific SD
    const prd = await generatePRD(options.sdId);
    
    if (prd) {
      console.log('\n📊 PRD Summary:');
      console.log(`   id: ${prd.id}`);
      console.log(`   directive_id: ${prd.directive_id}`);
      console.log(`   status: ${prd.status}`);
      console.log(`   backlog_items: ${prd.backlog_items?.length || 0} items`);
      
      // Show first 40 lines of markdown
      const lines = prd.content.split('\n');
      console.log('\n📄 First 40 lines of Markdown:');
      console.log('-'.repeat(60));
      console.log(lines.slice(0, 40).join('\n'));
      console.log('-'.repeat(60));
      
      // Show first 2 items from backlog_items
      if (prd.backlog_items && prd.backlog_items.length > 0) {
        console.log('\n📦 First 2 backlog items:');
        console.log(JSON.stringify(prd.backlog_items.slice(0, 2), null, 2));
      }
    }
  } else {
    console.log('Please specify --sd-id <id> or --all');
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ PRD generation complete');
  console.log('='.repeat(60));
}

main().catch(console.error);