import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  console.error('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('SUPABASE_ANON_KEY:', supabaseKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

  // First check if section already exists
  const { data: existing, error: fetchError } = await supabase
    .from('leo_protocol_sections')
    .select('*')
    .eq('section_key', 'database_operations_one_table')
    .maybeSingle();

  if (fetchError) {
    console.error('❌ Error checking existing:', fetchError);
    return;
  }

  if (existing) {
    console.log('📝 Section already exists, updating...');
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .update({
        content: content,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select();

    if (error) {
      console.error('❌ Error updating:', error);
    } else {
      console.log('✅ Updated database_operations_one_table section');
      console.log('Section ID:', data[0].id);
    }
  } else {
    console.log('📝 Inserting new section...');
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .insert({
        section_key: 'database_operations_one_table',
        section_title: 'Database Operations - One Table at a Time',
        content: content,
        protocol_id: 'leo-v4-2-0-story-gates',
        display_order: 26,
        category: 'database',
        is_active: true
      })
      .select();

    if (error) {
      console.error('❌ Error inserting:', error);
      console.error('Details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Inserted new database_operations_one_table section');
      console.log('Section ID:', data[0].id);
    }
  }
}

insertDatabaseGuidance().catch(console.error);
