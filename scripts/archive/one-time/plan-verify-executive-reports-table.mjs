import { createSupabaseClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

console.log('=== PLAN: Verifying executive_reports Table ===\n');

// Check EHG database (where implementation happens)
const ehgSupabase = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.EHG_SUPABASE_ANON_KEY
);

console.log('Database:', process.env.EHG_SUPABASE_URL);
console.log('');

// Try to query the table
const { data, error } = await ehgSupabase
  .from('executive_reports')
  .select('*')
  .limit(1);

if (error) {
  if (error.code === 'PGRST204' || error.message.includes('not found')) {
    console.log('❌ Table does NOT exist in EHG database\n');
    console.log('Creating migration SQL...\n');

    const migrationSQL = `-- Migration: Create executive_reports table
-- SD-RECONNECT-004 REQ-002: Executive Reporting System
-- Date: 2025-10-02

CREATE TABLE IF NOT EXISTS executive_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Report Metadata
  title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('board_update', 'financial_summary', 'portfolio_review', 'custom')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Report Content
  sections JSONB NOT NULL DEFAULT '[]',
  -- sections structure: [{ title, type, content, metrics, charts }]

  -- PDF Generation
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'archived')),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_executive_reports_user ON executive_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_executive_reports_type ON executive_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_executive_reports_created ON executive_reports(created_at DESC);

-- RLS Policies
ALTER TABLE executive_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON executive_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reports"
  ON executive_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON executive_reports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON executive_reports FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_executive_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER executive_reports_updated_at
  BEFORE UPDATE ON executive_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_executive_reports_updated_at();

COMMENT ON TABLE executive_reports IS 'Stores executive reports with templates and sections';
COMMENT ON COLUMN executive_reports.sections IS 'Array of report sections with content, metrics, and charts';
COMMENT ON COLUMN executive_reports.report_type IS 'Template type: board_update, financial_summary, portfolio_review, or custom';
`;

    console.log('✅ Migration SQL created');
    console.log('');
    console.log('📊 Table Schema:');
    console.log('  Columns:');
    console.log('    - id (UUID, PK)');
    console.log('    - user_id (UUID, FK to auth.users)');
    console.log('    - title (TEXT)');
    console.log('    - report_type (board_update | financial_summary | portfolio_review | custom)');
    console.log('    - sections (JSONB array)');
    console.log('    - pdf_url (TEXT)');
    console.log('    - status (draft | final | archived)');
    console.log('    - created_at, updated_at');
    console.log('');
    console.log('  RLS Policies: ✅ All CRUD operations protected');
    console.log('  Indexes: ✅ user_id, report_type, created_at');
    console.log('');
    console.log('✅ Schema design complete');
    console.log('');
    console.log('📝 Next: Migration needs to be applied to EHG database');
    console.log('   File location: ../ehg/database/migrations/create-executive-reports.sql');

    // Write migration to file
    const fs = await import('fs/promises');
    await fs.writeFile(
      '../ehg/database/migrations/create-executive-reports.sql',
      migrationSQL
    );

    console.log('');
    console.log('✅ Migration file created');

  } else {
    console.log('❌ Error querying table:', error.message);
  }
} else {
  console.log('✅ Table EXISTS in EHG database!\n');

  if (data && data[0]) {
    console.log('Columns:', Object.keys(data[0]).join(', '));
  } else {
    console.log('Table exists but is empty');
  }

  console.log('');
  console.log('✅ Ready for implementation - no migration needed');
}

console.log('');
console.log('═══════════════════════════════════════════');
console.log('PLAN Decision: Schema validation complete');
console.log('═══════════════════════════════════════════');
