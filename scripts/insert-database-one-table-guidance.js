import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function insertDatabaseGuidance() {
  const content = `### REQUIRED: Database Operations Only

**⚠️ CRITICAL: One Table at a Time**
- When manipulating Supabase tables, **ALWAYS operate on ONE table at a time**
- Batch operations across multiple tables often fail or cause inconsistencies
- Complete each table operation fully before moving to the next table
- Verify success after each table operation before proceeding

**Strategic Directives**:
- ✅ Create in \`strategic_directives_v2\` table
- ✅ Use \`scripts/create-strategic-directive.js\` or dashboard
- ✅ ALL SD data must be in database, not files
- ✅ **One SD insertion at a time** - verify before next

**PRDs (Product Requirements)**:
- ✅ Create in \`product_requirements_v2\` table
- ✅ Use \`scripts/add-prd-to-database.js\`
- ✅ Link to SD via \`strategic_directive_id\` foreign key
- ✅ **One PRD insertion at a time** - verify before next

**Retrospectives**:
- ✅ Create in \`retrospectives\` table
- ✅ Use \`scripts/generate-comprehensive-retrospective.js\`
- ✅ Trigger: Continuous Improvement Coach sub-agent
- ✅ Link to SD via \`sd_id\` foreign key
- ✅ **One retrospective at a time** - verify before next

**Handoffs**:
- ✅ Store in handoff tracking tables
- ✅ 7-element structure required
- ✅ Link to SD and phase
- ✅ **One handoff at a time** - verify before next

**Progress & Verification**:
- ✅ Update database fields directly
- ✅ Store verification results in database
- ✅ Track in real-time via dashboard
- ✅ **One record update at a time** - verify before next`;

  // Insert new section
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .insert({
      protocol_id: 'leo-v4-2-0-story-gates',
      section_type: 'database',
      title: 'Database Operations - One Table at a Time',
      content: content,
      order_index: 26,
      metadata: {
        category: 'database_operations',
        importance: 'critical',
        added_date: new Date().toISOString()
      }
    })
    .select();

  if (error) {
    console.error('❌ Error inserting:', error);
  } else {
    console.log('✅ Inserted database operations guidance');
    console.log('Section ID:', data[0].id);
    console.log('Protocol ID:', data[0].protocol_id);
  }
}

insertDatabaseGuidance();
