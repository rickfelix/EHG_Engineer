import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function applyMigration() {
  console.log('=== Applying Capability Lifecycle Migration (Direct) ===\n');

  // Step 1: Add columns to strategic_directives_v2 using Supabase Dashboard SQL API
  // Note: This uses the postgres endpoint directly

  // First, let's check if the columns already exist by trying to query them
  const { data: existingColumns, error: colCheckError } = await supabase
    .from('strategic_directives_v2')
    .select('id, delivers_capabilities')
    .limit(1);

  if (!colCheckError) {
    console.log('delivers_capabilities column already exists!');
  } else if (colCheckError.message.includes('column "delivers_capabilities" does not exist')) {
    console.log('Need to add capability columns via Supabase Dashboard SQL Editor');
    console.log('\nPlease run this SQL in the Supabase Dashboard SQL Editor:\n');
    console.log('--------------------------------------------------------------');
    console.log(`
-- Add capability declaration columns
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS delivers_capabilities JSONB DEFAULT '[]'::jsonb;

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS modifies_capabilities JSONB DEFAULT '[]'::jsonb;

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS deprecates_capabilities JSONB DEFAULT '[]'::jsonb;

-- Create sd_capabilities junction table
CREATE TABLE IF NOT EXISTS sd_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_uuid UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id) ON DELETE CASCADE,
    sd_id VARCHAR(100) NOT NULL,
    capability_type VARCHAR(50) NOT NULL CHECK (capability_type IN ('agent', 'tool', 'crew', 'skill')),
    capability_key VARCHAR(200) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('registered', 'updated', 'deprecated')),
    action_details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sd_uuid, capability_key, action)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_sd_uuid ON sd_capabilities(sd_uuid);
CREATE INDEX IF NOT EXISTS idx_sd_capabilities_capability_key ON sd_capabilities(capability_key);

-- Enable RLS
ALTER TABLE sd_capabilities ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service role full access on sd_capabilities"
ON sd_capabilities FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read sd_capabilities"
ON sd_capabilities FOR SELECT TO authenticated
USING (true);
`);
    console.log('--------------------------------------------------------------');
  } else {
    console.log('Column check error:', colCheckError.message);
  }

  // Step 2: We can test by adding the columns via update operations
  console.log('\nAlternatively, testing if columns can be added via update...\n');

  // Get a test SD
  const { data: testSD, error: testError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, status')
    .eq('id', 'SD-CAPABILITY-LIFECYCLE-001')
    .single();

  if (testSD) {
    console.log('Found test SD:', testSD.id);
    console.log('Status:', testSD.status);

    // Try to update with the new columns
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        delivers_capabilities: [
          {
            capability_type: 'agent',
            capability_key: 'capability-lifecycle-agent',
            name: 'Capability Lifecycle Agent',
            description: 'Test agent from capability lifecycle automation'
          }
        ]
      })
      .eq('id', 'SD-CAPABILITY-LIFECYCLE-001');

    if (updateError) {
      console.log('Update failed (columns may not exist):', updateError.message);
      console.log('\nThe migration SQL needs to be run via Supabase Dashboard.');
    } else {
      console.log('Update succeeded! Columns exist.');
    }
  } else {
    console.log('Test SD not found:', testError?.message);
  }
}

applyMigration().catch(console.error);
